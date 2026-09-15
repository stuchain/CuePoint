#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""SQL construction for the library browse query (LIBUI-01, DEC-040).

DEC-040 resolves scope, order and paging in SQLite rather than in the renderer,
because 50,000 rows are not sorted in JavaScript. This module builds those
statements; :class:`~cuepoint.persistence.track_repository.TrackRepository`
executes them.

It is separate from the repository for two reasons. The statement building is
the part with rules in it — a whitelist, a tiebreak, a null policy — and rules
deserve their own tests. And LIBUI-02 adds filter-rule compilation (DEC-043) to
exactly this predicate, for both the row query and the count; a second place to
add it is a second place for them to disagree.

Three properties are load-bearing:

**Nothing the caller types reaches the SQL text.** Sort names and directions are
looked up in a whitelist and rejected if absent; every value is a bound
parameter. A sort column is an identifier, and identifiers cannot be
parameterized, which is exactly why the whitelist exists rather than a check
that the string "looks safe".

**Every ordering ends with the row id.** Thousands of tracks share an artist and
half a library can share a null BPM. Without a unique final term, SQLite is free
to return tied rows in a different order for each page, so paging can show one
row twice and never show another — a bug that looks like data loss and is
actually a missing tiebreak.

**Nulls sort last in both directions.** A library where a third of the BPMs are
missing must not open on a screen of blanks. SQLite orders nulls first for ASC
by default, so ascending orderings say so explicitly; descending already puts
them last.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, replace
from typing import Dict, Iterable, List, Optional, Tuple

from cuepoint.models.filter_rule import (
    ARTWORK_ALIAS,
    FILES_ALIAS,
    MATCH_ALIAS,
    MATCH_CANDIDATE_ALIAS,
    METADATA_ALIAS,
    TYPE_BOOL,
    TYPE_NUMBER,
    FieldSpec,
    RuleSet,
    field_spec,
)
from cuepoint.models.track_metadata import OVERRIDE_FIELDS
from cuepoint.persistence.filter_sql import (
    LIKE_ESCAPE,
    compile_rule_set,
    escape_like,
    required_joins,
)

#: Rows per window. A table shows tens of rows; a window covers the viewport
#: plus the margin LIBUI-05 scrolls into.
BROWSE_LIMIT_DEFAULT = 100

#: The most rows one request can ask for. Clamped rather than trusted: this is
#: reached from an HTTP handler, and "the caller validated it" is not something
#: a data layer should assume.
BROWSE_LIMIT_MAX = 500

#: Ids per request when only ids are wanted. Higher than the row limit because
#: an id is eight bytes rather than a track: a shift-click that selects forty
#: thousand rows (DEC-045) is one request, not four hundred.
BROWSE_IDS_LIMIT_DEFAULT = 1000

#: The most ids one request can ask for — the whole library, and no more.
BROWSE_IDS_LIMIT_MAX = 50_000

#: The order the Library page opens on, and the one the composite index serves.
DEFAULT_SORT = "artist"

DIRECTIONS = ("asc", "desc")

#: Rekordbox's own order inside a playlist. Only meaningful within a scope —
#: "as arranged in Rekordbox" is not a property a track has library-wide.
PLAYLIST_POSITION = "playlist_position"

#: The order a user arranged a Collection in (ORG-04, DEC-058). The same kind
#: of thing as :data:`PLAYLIST_POSITION` and meaningful in the same way: only
#: inside the scope that gives it a meaning.
COLLECTION_POSITION = "collection_position"

# SQLite grew NULLS FIRST/LAST in 3.30 (2019). Every supported interpreter
# ships something far newer, but the fallback is three lines and the
# alternative is an ordering that silently changes on an old system SQLite —
# which is the kind of difference nobody notices until a user's library opens
# on a screen of blank rows. `test_track_browse.py` drives both paths.
_SUPPORTS_NULLS_LAST = sqlite3.sqlite_version_info >= (3, 30, 0)


class BrowseQueryError(ValueError):
    """A browse request that cannot be honoured as asked.

    Raised for an unknown sort column, an unknown direction, or an ordering
    that needs a scope it was not given. It is a rejection with a message, not
    a silent fallback to some other order: a table that quietly sorts by
    something else than it was asked to is worse than one that says it cannot.
    """


@dataclass(frozen=True)
class SortTerm:
    """One term of an ORDER BY clause.

    Attributes:
        sql: The expression, already qualified with its table.
        text: Whether it needs ``COLLATE NOCASE``. Case-sensitive ordering puts
            ``deadmau5`` after ``Zomby``, which reads as a broken sort.
        nullable: Whether the column can be null, and therefore needs the
            explicit nulls-last treatment when ascending.
        joins: The joined tables the expression reads, by alias, as a filter
            field names them. Sorting by an effective value (DEC-068) reads
            CuePoint's layer, so the join is there even when no rule is.
    """

    sql: str
    text: bool = False
    nullable: bool = False
    joins: Tuple[str, ...] = ()


# The scope is a recursive walk rather than a single id: selecting a folder
# means selecting everything under it, at any depth. UNION (not UNION ALL) so a
# malformed tree cannot loop forever — import builds a real tree, but a
# recursive query that can hang is not worth the microsecond.
_PLAYLIST_CTE = (
    "browse_scope(id) AS ("
    "SELECT id FROM rekordbox_playlists WHERE id = ? "
    "UNION "
    "SELECT p.id FROM rekordbox_playlists p "
    "JOIN browse_scope s ON p.parent_id = s.id"
    ") "
)

# `IN (SELECT …)` rather than a join, deliberately. A track can appear twice in
# one playlist (19 playlists in a real 3,880-track export do) and in several
# playlists under one folder; a join would return it once per membership row,
# so the table would show duplicates and the count would disagree with the
# rows. Membership is a question about a track, not a row to multiply by.
_SCOPE_PREDICATE = (
    "tracks.id IN ("
    "SELECT track_id FROM rekordbox_playlist_tracks "
    "WHERE playlist_id IN (SELECT id FROM browse_scope)"
    ")"
)

# CuePoint's own scope (ORG-08). Not recursive: a Collection holds tracks and
# never nodes, so there is no tree to walk — selecting a *folder* is not a
# scope, it is a question ORG-09 answers by selecting one of its children.
#
# A CTE rather than a subquery in two places, for the reason the playlist one
# is: the ordering below has to reach the same rows, and an expression in
# ORDER BY cannot carry its own bound parameter without changing where every
# other parameter falls.
# **The GROUP BY is load-bearing, not tidiness** (ORG-13). Written without it,
# the ordering below has to say ``MIN(position)`` itself, and SQLite answers
# that by flattening the CTE back into ``collection_tracks`` and seeking it by
# ``collection_id`` — which re-reads every entry in the Collection once per
# candidate row. Measured on a 1,980-entry Collection that is 183 ms for the
# first page, against 3 ms with the aggregate here; it is quadratic, so a
# 5,000-entry Collection is worse again. Grouping once makes the CTE a
# materialized one-row-per-track table that the correlated lookup can index by
# ``track_id``, and clicking a Collection in the pane is the most ordinary
# gesture in the phase.
#
# DEC-058 lets a track be in a Collection twice; it appears once, at the
# earliest position it holds — the rule the playlist expression follows, for
# the same reason, and now stated once here rather than in the ORDER BY.
_COLLECTION_CTE = (
    "collection_scope(track_id, position) AS ("
    "SELECT track_id, MIN(position) FROM collection_tracks "
    "WHERE collection_id = ? GROUP BY track_id"
    ") "
)

_COLLECTION_PREDICATE = "tracks.id IN (SELECT track_id FROM collection_scope)"

#: The track's place in the Collection, already reduced to one row per track.
_COLLECTION_POSITION_EXPR = (
    "(SELECT cs.position FROM collection_scope cs WHERE cs.track_id = tracks.id)"
)

# The earliest position the track holds anywhere in the scope. A track listed
# twice in a playlist appears once, where it first appears; across a folder the
# earliest position in any of its playlists wins. Both are deterministic, which
# is what an ordering has to be.
_POSITION_EXPR = (
    "(SELECT MIN(pt.position) FROM rekordbox_playlist_tracks pt "
    "WHERE pt.track_id = tracks.id "
    "AND pt.playlist_id IN (SELECT id FROM browse_scope))"
)

# CuePoint's own layer, joined only when something asks for it (ORG-05). A
# LEFT JOIN because most tracks have no metadata row at all: a track nobody has
# rated, favorited or annotated is not a track that should disappear from the
# library when a filter mentions rating. `track_metadata.track_id` is that
# table's primary key, so the join can never multiply a row — `SELECT tracks.*`
# and `count(*)` mean exactly what they meant before it.
#
# Written only when a rule or a facet reads it, because "cheap per row" is
# still fifty thousand index probes over a real library, and every browse the
# Library page has run since Phase 4 would have started paying them for
# nothing. A filter bar with no CuePoint clause produces the SQL it always did.
_METADATA_JOIN = (
    f" LEFT JOIN track_metadata AS {METADATA_ALIAS}"
    f" ON {METADATA_ALIAS}.track_id = tracks.id"
)

# A track's match state (CLEAN-04), joined the same way and for the same
# reasons: a LEFT JOIN, because "not matched" is a track with no row and must
# not disappear from a view that mentions matching; and a primary key on the far
# side, so no row is ever multiplied. The candidate a state points at is reached
# through the state, by the candidate's primary key, which is why a field
# reading the candidate names both joins.
_MATCH_JOIN = (
    f" LEFT JOIN track_match AS {MATCH_ALIAS} ON {MATCH_ALIAS}.track_id = tracks.id"
)
_MATCH_CANDIDATE_JOIN = (
    f" LEFT JOIN match_candidates AS {MATCH_CANDIDATE_ALIAS}"
    f" ON {MATCH_CANDIDATE_ALIAS}.id = {MATCH_ALIAS}.candidate_id"
)

# A track's last file check (CLEAN-07), joined the same way again: a LEFT JOIN,
# because a track never checked is exactly the track a view about files must
# not lose, and the far side's primary key, so no row is multiplied.
_FILES_JOIN = (
    f" LEFT JOIN track_files AS {FILES_ALIAS} ON {FILES_ALIAS}.track_id = tracks.id"
)

# A track's artwork record (CLEAN-09): a LEFT JOIN on its primary key again, so
# a track nothing is known about is still a row, and none is multiplied.
_ARTWORK_JOIN = (
    f" LEFT JOIN track_artwork AS {ARTWORK_ALIAS}"
    f" ON {ARTWORK_ALIAS}.track_id = tracks.id"
)

#: Every join a field may name, keyed by the alias it establishes, in the order
#: they are written: a join that reads another's alias comes after it.
JOINS: Dict[str, str] = {
    METADATA_ALIAS: _METADATA_JOIN,
    MATCH_ALIAS: _MATCH_JOIN,
    MATCH_CANDIDATE_ALIAS: _MATCH_CANDIDATE_JOIN,
    FILES_ALIAS: _FILES_JOIN,
    ARTWORK_ALIAS: _ARTWORK_JOIN,
}


def _joins(names: Iterable[str]) -> str:
    """The FROM-clause joins for a set of aliases, each once, in dependency order.

    Raises:
        BrowseQueryError: If an alias names no join. That is a registry written
            wrong rather than a request, and it is refused here rather than
            turned into SQL that names a table nobody joined.
    """
    wanted = set(names)
    unknown = wanted - set(JOINS)
    if unknown:
        raise BrowseQueryError(f"No join is registered for {sorted(unknown)}")
    return "".join(sql for alias, sql in JOINS.items() if alias in wanted)


# The tag facet counts assignments and only then looks up names — the same
# group-then-join ORG-03 measured for the tag list, and the same reason. Joining
# `tags` first makes the grouping walk 200,000 rows through a table it does not
# need until the end; grouping first walks one index and joins twenty rows.
# Measured over 50,000 tracks and 200,000 assignments: 96.1 ms joined first,
# **14.3 ms** grouped first. With a filter narrowing it, 17.9 ms against 15.3 ms
# — so the shape that wins by seven times in the common case never loses.
_TAG_COUNTS = "SELECT track_tags.tag_id AS tag_id, count(*) AS n FROM track_tags"

# The same reach, kept outer, so untagged tracks survive to be counted as the
# "no tag" bucket instead of being dropped by the join.
_TAG_OUTER_JOIN = " LEFT JOIN track_tags ON track_tags.track_id = tracks.id"

# Columns a text query looks in. Deliberately not file_path: a substring of a
# directory name would match every track under it, which reads as a broken
# search rather than a useful one.
_SEARCH_COLUMNS = ("title", "artist", "album", "label")

#: The joins a text search reads: the columns above, as their filter fields
#: read them. Only ``label`` is overridable today.
SEARCH_JOINS: Tuple[str, ...] = tuple(
    sorted({alias for column in _SEARCH_COLUMNS for alias in field_spec(column).joins})
)


def search_clause(query: str) -> Tuple[Optional[str], str, Tuple[str, ...]]:
    """Build the WHERE fragment and parameters for a text query.

    Returns ``(None, "", ())`` for a blank query. What that means differs by
    caller and is their decision, not this function's: a blank *search* returns
    nothing (an empty search box is not a request to read the whole library),
    while a blank *browse* returns everything in scope, which is what a table
    with no search term is supposed to show.

    Columns are table-qualified so the fragment is safe to drop into a query
    that has more than one table in scope, as a scoped browse does.

    Each column is read as its filter field reads it, so the label searched is
    the effective one (DEC-068): a label a user typed is found by typing it.
    The fragment therefore needs the metadata join, which
    :data:`SEARCH_JOINS` names for every statement that uses it.
    """
    text = (query or "").strip()
    if not text:
        return None, "", ()
    pattern = f"%{escape_like(text)}%"
    sql = " OR ".join(
        f"{field_spec(column).expression} LIKE ? ESCAPE '{LIKE_ESCAPE}'"
        for column in _SEARCH_COLUMNS
    )
    return pattern, f"({sql})", tuple(pattern for _ in _SEARCH_COLUMNS)


def _field_term(name: str, text: bool = False) -> SortTerm:
    """A nullable sort term reading what the filter field ``name`` reads."""
    spec = field_spec(name)
    return SortTerm(spec.expression, text=text, nullable=True, joins=spec.joins)


_ARTIST = SortTerm("tracks.artist", text=True)
_TITLE = SortTerm("tracks.title", text=True)

# What each sort orders by first. `artist` and `title` are NOT NULL with a ''
# default (migration 0002), so neither needs nulls-last; everything added by
# migration 0005 is nullable on purpose (DEC-034: unrated and rated-zero are
# different answers), and says so here.
_PRIMARY: Dict[str, Tuple[SortTerm, ...]] = {
    "artist": (_ARTIST, _TITLE),
    "title": (_TITLE, _ARTIST),
    "album": (SortTerm("tracks.album", text=True, nullable=True),),
    # The five fields CuePoint can override sort by the value a user sees
    # (DEC-068): the expression the filter field of the same name compiles
    # to, read from the registry rather than written a second time.
    "label": (_field_term("label", text=True),),
    "genre": (_field_term("genre", text=True),),
    "key": (_field_term("key", text=True),),
    "bpm": (_field_term("bpm"),),
    "year": (_field_term("year"),),
    "duration_seconds": (SortTerm("tracks.duration_seconds", nullable=True),),
    "rating": (SortTerm("tracks.rating", nullable=True),),
    "play_count": (SortTerm("tracks.play_count", nullable=True),),
    "bitrate": (SortTerm("tracks.bitrate", nullable=True),),
    # Rekordbox writes an ISO-ish date, which sorts correctly as text. No
    # COLLATE NOCASE: there are no letters in it, and the collation would only
    # make the term harder to serve from an index.
    "date_added": (SortTerm("tracks.date_added", nullable=True),),
    PLAYLIST_POSITION: (SortTerm(_POSITION_EXPR),),
    COLLECTION_POSITION: (SortTerm(_COLLECTION_POSITION_EXPR),),
}

# Sorting by genre with only the row id to break ties scatters the tracks of a
# genre at random, which is not what anyone means by "sort by genre". Every
# sort that is not already alphabetical falls back to artist then title, so a
# group of equal values reads like the library does.
_SECONDARY: Tuple[SortTerm, ...] = (_ARTIST, _TITLE)

#: The only orderings that exist. Anything else is a rejected request.
SORTABLE_COLUMNS: Tuple[str, ...] = tuple(_PRIMARY)

#: What each position sort needs to mean anything: the scope that defines it.
#: Asking for one without the other is a request that cannot be honoured, not a
#: request to fall back to some other order — a table that quietly sorts by
#: something else than it was asked to is worse than one that says it cannot.
_SCOPE_FOR_SORT: Dict[str, str] = {
    PLAYLIST_POSITION: "playlist",
    COLLECTION_POSITION: "collection",
}

#: Sorts that are only meaningful inside a scope.
SCOPED_SORTS: Tuple[str, ...] = tuple(_SCOPE_FOR_SORT)


def sort_terms(sort: str) -> Tuple[SortTerm, ...]:
    """Return the ORDER BY terms for a sort name, tiebreak excluded."""
    primary = _PRIMARY[sort]
    if sort in ("artist", "title"):
        return primary
    return primary + _SECONDARY


def sort_joins(sort: str) -> Tuple[str, ...]:
    """The joins an ordering reads. A count needs none: it does not sort."""
    return tuple(alias for term in sort_terms(sort) for alias in term.joins)


def clamp_limit(limit: Optional[int]) -> int:
    """Return a page size inside the supported bounds."""
    if limit is None:
        return BROWSE_LIMIT_DEFAULT
    return max(1, min(int(limit), BROWSE_LIMIT_MAX))


def clamp_ids_limit(limit: Optional[int]) -> int:
    """Return an id-page size inside the supported bounds."""
    if limit is None:
        return BROWSE_IDS_LIMIT_DEFAULT
    return max(1, min(int(limit), BROWSE_IDS_LIMIT_MAX))


def clamp_offset(offset: Optional[int]) -> int:
    """Return a non-negative offset."""
    if offset is None:
        return 0
    return max(0, int(offset))


@dataclass(frozen=True)
class BrowseQuery:
    """What to show: a scope, a text query, and an order.

    Deliberately not a page: the same query describes the rows and the count,
    and LIBUI-05 pages through it. Paging is an argument to
    :func:`build_select`, so a count can never be taken of a different
    predicate than the rows it counts.

    ``rules`` is DEC-043's rule set — the same structure Phase 6 saves as a
    Smart Collection, held here in view state. It defaults to an empty set, so
    every caller written before filters existed still reads correctly.

    ``collection_id`` is CuePoint's own scope (ORG-08), beside Rekordbox's
    rather than instead of it: both may be set, and they narrow together. It is
    a field rather than a rule because the *order* a Collection opens in is its
    own (ORG-09), and an ordering needs to know which Collection it is ordering
    within — which a rule about membership does not say.
    """

    query: str = ""
    playlist_id: Optional[int] = None
    sort: str = DEFAULT_SORT
    direction: str = "asc"
    rules: RuleSet = RuleSet()
    collection_id: Optional[int] = None

    def validated(self) -> "BrowseQuery":
        """Return a normalized copy, or raise.

        Normalization is part of validation, not a separate courtesy: a caller
        that sends ``"DESC"`` means descending, and a repository that compares
        against ``"desc"`` elsewhere would silently sort ascending instead.

        Raises:
            BrowseQueryError: If the sort or direction is not one this module
                can build, or if the sort needs a scope it was not given.
        """
        sort = (self.sort or DEFAULT_SORT).strip()
        if sort not in _PRIMARY:
            valid = ", ".join(SORTABLE_COLUMNS)
            raise BrowseQueryError(
                f"Cannot sort by {sort!r}. Sortable columns: {valid}"
            )

        direction = (self.direction or "asc").strip().lower()
        if direction not in DIRECTIONS:
            raise BrowseQueryError(
                f"Sort direction must be 'asc' or 'desc', not {self.direction!r}"
            )

        try:
            playlist_id = None if self.playlist_id is None else int(self.playlist_id)
        except (TypeError, ValueError):
            # Reached from an HTTP handler, where a scope arrives as text. The
            # message has to say what was wrong with it, not what Python
            # thought of it.
            raise BrowseQueryError(
                f"Playlist must be identified by a number, not {self.playlist_id!r}"
            ) from None

        try:
            collection_id = (
                None if self.collection_id is None else int(self.collection_id)
            )
        except (TypeError, ValueError):
            raise BrowseQueryError(
                f"Collection must be identified by a number, not {self.collection_id!r}"
            ) from None

        needed = _SCOPE_FOR_SORT.get(sort)
        if needed == "playlist" and playlist_id is None:
            raise BrowseQueryError(
                f"Sorting by {sort!r} needs a playlist; a track has no position "
                "in a library, only in a playlist"
            )
        if needed == "collection" and collection_id is None:
            raise BrowseQueryError(
                f"Sorting by {sort!r} needs a collection; a track has no position "
                "in a library, only in a collection"
            )

        # FilterRuleError, not BrowseQueryError: it names the clause that was
        # refused, which is the message a user needs, and both are ValueErrors
        # so one handler maps them to one kind of response.
        rules = (self.rules or RuleSet()).validated()

        return replace(
            self,
            query=(self.query or "").strip(),
            playlist_id=playlist_id,
            sort=sort,
            direction=direction,
            rules=rules,
            collection_id=collection_id,
        )


def _order_by(query: BrowseQuery) -> str:
    """Build the ORDER BY clause, including the tiebreak.

    Ascending nullable terms carry the nulls-last policy; descending ones do
    not need it, because that is already SQLite's descending default.
    """
    ascending = query.direction == "asc"
    keyword = "ASC" if ascending else "DESC"
    parts: List[str] = []
    for term in sort_terms(query.sort):
        expression = f"{term.sql} COLLATE NOCASE" if term.text else term.sql
        if term.nullable and ascending:
            if _SUPPORTS_NULLS_LAST:
                parts.append(f"{expression} ASC NULLS LAST")
            else:
                # The portable spelling: sort the "is it null" flag first, so
                # nulls land at the end whatever the direction of the value.
                parts.append(f"({expression}) IS NULL ASC")
                parts.append(f"{expression} ASC")
        else:
            parts.append(f"{expression} {keyword}")
    # The tiebreak. Never omit it — see this module's docstring.
    parts.append(f"tracks.id {keyword}")
    return "ORDER BY " + ", ".join(parts)


@dataclass(frozen=True)
class Predicate:
    """The parts of a statement that describe *which* tracks, not which columns.

    Four pieces rather than a string, because they go in three different places
    in the SQL and the projections that use them differ only in what they read.

    Attributes:
        cte: The scope CTE, or empty.
        join: The tables the predicate needs reached, or empty.
        where: The WHERE clause, leading space included, or empty.
        params: Every bound value, in the order the pieces above use them.
    """

    cte: str = ""
    join: str = ""
    where: str = ""
    params: Tuple[object, ...] = ()


def _predicate(query: BrowseQuery, *, joins: Iterable[str] = ()) -> Predicate:
    """Build the predicate shared by the rows and the count.

    One function so a count can never be taken of a different set of rows than
    the query returns — the failure that makes a table say "showing 100 of 340"
    over 200 rows.

    ``joins`` adds joins for a caller that reads a joined table in its
    projection rather than in its rules: a facet on ``favorite`` or
    ``match_state`` groups by a column no rule mentioned.
    """
    clauses: List[str] = []
    params: List[object] = []

    # Both scopes are CTEs, and both bind before anything else does: a WITH
    # clause is read first, so its parameters have to come first in the tuple.
    ctes: List[str] = []
    if query.playlist_id is not None:
        ctes.append(_PLAYLIST_CTE)
        params.append(query.playlist_id)
        clauses.append(_SCOPE_PREDICATE)
    if query.collection_id is not None:
        ctes.append(_COLLECTION_CTE)
        params.append(query.collection_id)
        clauses.append(_COLLECTION_PREDICATE)
    # RECURSIVE covers the whole clause and is harmless for one that is not,
    # which is what lets the two be written independently and combined here.
    cte = f"WITH RECURSIVE {', '.join(ctes)}" if ctes else ""

    pattern, sql, search_params = search_clause(query.query)
    searched: Tuple[str, ...] = ()
    if pattern is not None:
        clauses.append(sql)
        params.extend(search_params)
        searched = SEARCH_JOINS

    filter_sql, filter_params = compile_rule_set(query.rules)
    if filter_sql:
        clauses.append(filter_sql)
        params.extend(filter_params)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    join = _joins(set(joins) | set(searched) | required_joins(query.rules))
    return Predicate(cte=cte, join=join, where=where, params=tuple(params))


def build_select(
    query: BrowseQuery, limit: Optional[int] = None, offset: Optional[int] = None
) -> Tuple[str, Tuple[object, ...]]:
    """Build the paged row query.

    Returns:
        ``(sql, params)`` ready for ``connection.execute``.

    Raises:
        BrowseQueryError: Via :meth:`BrowseQuery.validated`.
    """
    valid = query.validated()
    parts = _predicate(valid, joins=sort_joins(valid.sort))
    sql = (
        f"{parts.cte}SELECT tracks.* FROM tracks{parts.join}{parts.where} "
        f"{_order_by(valid)} LIMIT ? OFFSET ?"
    )
    return sql, (*parts.params, clamp_limit(limit), clamp_offset(offset))


def build_select_ids(
    query: BrowseQuery, limit: Optional[int] = None, offset: Optional[int] = None
) -> Tuple[str, Tuple[object, ...]]:
    """Build the same query with a narrower projection: ids only.

    Not a second query path — the same predicate and the same ordering, reading
    one column instead of twenty. It is what lets a shift-click select a range
    that crosses rows the table has never loaded (DEC-045), without pretending
    a row index means anything when the window moves.
    """
    valid = query.validated()
    parts = _predicate(valid, joins=sort_joins(valid.sort))
    sql = (
        f"{parts.cte}SELECT tracks.id FROM tracks{parts.join}{parts.where} "
        f"{_order_by(valid)} LIMIT ? OFFSET ?"
    )
    return sql, (*parts.params, clamp_ids_limit(limit), clamp_offset(offset))


def build_select_queue(
    query: BrowseQuery, limit: Optional[int] = None, offset: Optional[int] = None
) -> Tuple[str, Tuple[object, ...]]:
    """Build the same query projected to what a playback queue needs (PLAYER-05).

    A third projection of one query, not a third query path: the same predicate
    and the same ordering as :func:`build_select`, reading the five columns a
    queue entry is made of. DEC-012 says double-clicking loads *the current
    view* as the queue, and with DEC-040's windowed table that view is a query
    rather than an array — so the queue is resolved by re-running the query the
    user is looking at, in the order they are looking at it.

    Seven columns rather than twenty because a queue can be tens of thousands of
    rows: the rest of a track's fields are the Inspector's business, and sending
    them would multiply the payload for nothing. Key and BPM are here because
    they are what a DJ reads off a player — PLAYER-06's bar shows them for the
    playing track and PLAYER-08's panel for the ones coming — and fetching them
    per track change would flash empty at every transition.

    Ordering ends with the row id, exactly as the other projections do, so
    paging a long queue cannot repeat or skip a track where sort values tie.
    """
    valid = query.validated()
    # Key and BPM as a DJ sees them (DEC-068): a player bar showing the key
    # Rekordbox guessed beside the one the user corrected shows the wrong one.
    parts = _predicate(valid, joins=(METADATA_ALIAS, *sort_joins(valid.sort)))
    key = field_spec("key").expression
    bpm = field_spec("bpm").expression
    sql = (
        f"{parts.cte}SELECT tracks.id, tracks.title, tracks.artist, {key} AS key, "
        f"{bpm} AS bpm, tracks.duration_seconds, tracks.file_path "
        f"FROM tracks{parts.join}{parts.where} "
        f"{_order_by(valid)} LIMIT ? OFFSET ?"
    )
    return sql, (*parts.params, clamp_ids_limit(limit), clamp_offset(offset))


def build_count(query: BrowseQuery) -> Tuple[str, Tuple[object, ...]]:
    """Build the unpaged count for the same predicate as :func:`build_select`.

    Ordering is deliberately absent: it cannot change a count, and asking
    SQLite to sort rows nobody will read is the difference between an instant
    "of 47,913" and a slow one.
    """
    valid = query.validated()
    parts = _predicate(valid)
    return (
        f"{parts.cte}SELECT count(*) AS n FROM tracks{parts.join}{parts.where}",
        parts.params,
    )


# ---------------------------------------------------------------------------
# Facets (LIBUI-02)
# ---------------------------------------------------------------------------

#: Values one facet returns before it says "and more". A library can hold
#: thousands of distinct labels, and a filter list has to stay a list; the
#: renderer shows the common ones and a search box for the rest.
FACET_LIMIT_DEFAULT = 100

#: The most a caller can ask for.
FACET_LIMIT_MAX = 1000


def clamp_facet_limit(limit: Optional[int]) -> int:
    """Return a facet page size inside the supported bounds."""
    if limit is None:
        return FACET_LIMIT_DEFAULT
    return max(1, min(int(limit), FACET_LIMIT_MAX))


def facet_query(query: BrowseQuery, field: str) -> BrowseQuery:
    """The query a facet for ``field`` is computed against.

    Every part of the current view except this field's own rules: the playlist
    scope, the text query, and every *other* filter. Honouring the field's own
    rules would report the one genre already chosen and a count, leaving the
    list a user needs in order to choose a second one empty.
    """
    spec = field_spec(field)
    valid = query.validated()
    return replace(valid, rules=valid.rules.without_field(spec.name))


def _facet_column(spec: FieldSpec) -> str:
    """The expression a facet groups by.

    The same one the rules compile against, so a facet's count and the count of
    applying that value as a rule are the same number. Once ``rating`` means
    the value a user sees rather than the imported column (DEC-057), a facet
    that still grouped the imported column would offer "5 stars (312)" and then
    show a different set of tracks.
    """
    return spec.expression


def _group_by(spec: FieldSpec) -> str:
    """The grouping expression for a facet.

    ``COLLATE NOCASE`` on the column itself rather than ``lower(column)``,
    because the two group identically and only one of them can be served by an
    index. Measured at 50,000 tracks: grouping by the expression costs 37 ms
    and cannot use an index at all; grouping by the collated column costs 7 ms
    against the index migration 0008 creates for exactly this. Numbers have no
    case, so they group as themselves.
    """
    return _grouping(_facet_column(spec), spec.type)


def _grouping(column: str, type_: str) -> str:
    """Group ``column`` as a field of ``type_`` groups: text without case."""
    if type_ in (TYPE_NUMBER, TYPE_BOOL):
        return column
    return f"{column} COLLATE NOCASE"


def _facet_table(where: str) -> str:
    """How a facet should read ``tracks``: through the index, or straight.

    A facet groups the library by one column, and migration 0008 indexes the
    columns it groups by — so with nothing else to filter on, SQLite walks that
    index as a covering scan and never touches the table. That is the fast
    case, and it is six times faster than sorting the library.

    Add any other condition and the same plan becomes the slow one: every index
    entry now needs its row fetched to test the condition, which is fifty
    thousand random reads where a table scan would be one sequential pass.
    Measured at 50,000 tracks, on the real schema:

    ==========================  ============  ==========
    facet on ``genre``          via the index   scanning
    ==========================  ============  ==========
    nothing else to filter by       7.3 ms      43.6 ms
    with two filter rules          83.4 ms      17.1 ms
    ==========================  ============  ==========

    ``ANALYZE`` does not change the choice — it was measured, and SQLite still
    prefers the index — so the choice is made here, where the reason can be
    written down. A playlist scope is indifferent (0.5 ms either way for a
    playlist, 50 ms either way for a folder): it drives from the membership
    table and reaches ``tracks`` by row id, which ``NOT INDEXED`` does not
    affect. So "any condition at all" is the rule, and it costs nothing in the
    one case where it makes no difference.
    """
    return "tracks NOT INDEXED" if where else "tracks"


def _has_value(spec: FieldSpec) -> str:
    """ "This track has a value for this field", as SQL.

    Text is missing when it is null *or* blank — Rekordbox writes both for the
    same thing. A number is missing only when it is null, because zero plays is
    an answer and a zero rating is a rating (DEC-034).
    """
    return _value_present(_facet_column(spec), spec.type)


def _value_present(column: str, type_: str) -> str:
    """ "``column`` holds a value", for a field of ``type_``."""
    if type_ in (TYPE_NUMBER, TYPE_BOOL):
        # A yes/no is never missing — a track with no CuePoint row is simply
        # not favorited — so this is always true for it, and the "no value"
        # bucket a text field needs is correctly empty.
        return f"{column} IS NOT NULL"
    return f"({column} IS NOT NULL AND {column} <> '')"


def _layers(spec: FieldSpec) -> Optional[Tuple[str, str]]:
    """``(imported column, override column)`` for an effective field, else None.

    The five fields CuePoint can override (DEC-068). Their expression is
    ``COALESCE(override, imported)``, which is what makes a split grouping of
    them exact — a test holds the registry to that shape.
    """
    if spec.name not in OVERRIDE_FIELDS:
        return None
    return f"tracks.{spec.name}", f"{METADATA_ALIAS}.{spec.name}"


def _layered_facet_rows(spec: FieldSpec, *, present_only: bool) -> Optional[str]:
    """An unfiltered effective facet's groups, counted one layer at a time.

    Grouping ``COALESCE(meta.x, tracks.x)`` over the library joins every track
    and sorts the result, because no index spans two tables. But the effective
    value partitions the library exactly: a track whose override is null shows
    its imported value, and every other track shows its override. So the
    imported half groups ``tracks.x`` through migration 0008's facet index, the
    override half groups the far smaller ``track_metadata``, and the caller
    merges the two by the same collation. Measured at 50,000 tracks with 10,000
    overrides, the genre list's two queries fall from 62 ms to 36 ms, and their
    answers are identical — which a test asserts against the joined shape.

    Only for a facet with nothing else narrowing it: any rule, search or scope
    needs the join for its own sake, and there the joined scan is what ran
    before CLEAN-05 too.

    Each row is ``(raw_value, has_value, n)``; ``present_only`` drops the
    groups with no value, as the value list does.
    """
    layers = _layers(spec)
    if layers is None:
        return None
    imported, override = layers

    def half(column: str, source: str, condition: str) -> str:
        present = _value_present(column, spec.type)
        where = f"{condition} AND {present}" if present_only else condition
        return (
            f"SELECT min({column}) AS raw_value, {present} AS has_value, "
            f"count(*) AS n FROM {source} WHERE {where} "
            f"GROUP BY {_grouping(column, spec.type)}"
        )

    return (
        half(imported, f"tracks{JOINS[METADATA_ALIAS]}", f"{override} IS NULL")
        + " UNION ALL "
        + half(
            override, f"track_metadata AS {METADATA_ALIAS}", f"{override} IS NOT NULL"
        )
    )


def _column_facet_spec(field: str) -> FieldSpec:
    """The spec for a field a column facet can be built from.

    Raises:
        BrowseQueryError: If the field is a membership field. A tag is not a
            column on a track, and grouping ``tracks.tag`` would be a query
            SQLite refuses at a point far from the mistake. Tags have their own
            pair of builders below.
    """
    spec = field_spec(field)
    if spec.is_membership:
        raise BrowseQueryError(
            f"{spec.label} is not a column; its facet is built by "
            "build_tag_facet_values"
        )
    return spec


def build_tag_facet_values(
    query: BrowseQuery, limit: Optional[int] = None
) -> Tuple[str, Tuple[object, ...]]:
    """Build "which tags are in this view, and how many tracks each" (ORG-05).

    The tag list a filter bar offers, counted over the same rows the table is
    showing and over every filter *except* the tag rules themselves — so
    choosing one tag leaves the others choosable, exactly as a genre facet
    does.

    ``raw_value`` is the tag's **id**, because that is what a rule carries; the
    name comes back beside it as ``label``. A chip built from this facet
    therefore matches precisely the tracks the facet counted, and it goes on
    matching them after the tag is renamed.

    One row more than the limit is asked for, so the caller can tell whether
    there are more without a second query.
    """
    scoped = facet_query(query, "tag")
    parts = _predicate(scoped)
    # Unscoped and unfiltered, the counts are the whole link table and no part
    # of `tracks` is read at all. With anything narrowing the view, the same
    # grouping runs over the ids that view holds.
    narrowed = (
        f" WHERE track_tags.track_id IN (SELECT tracks.id FROM tracks"
        f"{parts.join}{parts.where})"
        if parts.where
        else ""
    )
    return (
        f"{parts.cte}SELECT tags.id AS raw_value, tags.name AS label, "
        f"counts.n AS n FROM ({_TAG_COUNTS}{narrowed} GROUP BY track_tags.tag_id) "
        "AS counts JOIN tags ON tags.id = counts.tag_id "
        "ORDER BY n DESC, tags.name COLLATE NOCASE ASC "
        "LIMIT ?",
        (*parts.params, clamp_facet_limit(limit) + 1),
    )


def build_tag_facet_totals(query: BrowseQuery) -> Tuple[str, Tuple[object, ...]]:
    """Build "how many distinct tags, and how many tracks have none" (ORG-05).

    The counterpart to :func:`build_facet_value_count`, and the same two
    numbers: how many choices exist so a truncated list can say "showing 100 of
    240", and how big the untagged bucket is so it is always offered.

    A LEFT JOIN rather than the inner one the value query uses, and that is the
    whole trick: an untagged track survives it as a single row with a null tag,
    which ``count(DISTINCT …)`` ignores and the CASE counts. One pass answers
    both.
    """
    scoped = facet_query(query, "tag")
    parts = _predicate(scoped)
    return (
        f"{parts.cte}SELECT count(DISTINCT track_tags.tag_id) AS values_count, "
        "sum(CASE WHEN track_tags.tag_id IS NULL THEN 1 ELSE 0 END) AS missing "
        f"FROM tracks{parts.join}{_TAG_OUTER_JOIN}{parts.where}",
        parts.params,
    )


def _values_scope(
    query: BrowseQuery, spec: FieldSpec
) -> Tuple[str, Tuple[object, ...]]:
    """A ``WITH`` clause naming the view's tracks ``facet_scope`` (CLEAN-08).

    The browse query's own scope CTEs come first, because their parameters are
    bound first; the facet's scope is appended to the same clause, so every
    parameter appears exactly once however often the scope is read.
    """
    parts = _predicate(facet_query(query, spec.name))
    scope = (
        f"facet_scope AS (SELECT tracks.id AS id FROM tracks{parts.join}{parts.where})"
    )
    if parts.cte:
        return f"{parts.cte.rstrip()}, {scope} ", parts.params
    return f"WITH {scope} ", parts.params


def _values_facet_values(
    query: BrowseQuery, spec: FieldSpec, limit: Optional[int]
) -> Tuple[str, Tuple[object, ...]]:
    """Which words a multi-valued field takes in the view, and how many tracks each.

    A track with two values counts once under each, as a tag facet counts a
    track under each of its tags. The counts can therefore add up to more than
    the view, and each one is exactly the count of its own rule.
    """
    table = spec.values
    assert table is not None
    with_clause, params = _values_scope(query, spec)
    return (
        f"{with_clause}SELECT min(v.{table.value_column}) AS raw_value, "
        f"count(DISTINCT v.{table.track_column}) AS n "
        f"FROM {table.table} AS v "
        f"WHERE v.{table.track_column} IN (SELECT id FROM facet_scope) "
        f"GROUP BY v.{table.value_column} COLLATE NOCASE "
        "ORDER BY n DESC, raw_value COLLATE NOCASE ASC "
        "LIMIT ?",
        (*params, clamp_facet_limit(limit) + 1),
    )


def _values_facet_count(
    query: BrowseQuery, spec: FieldSpec
) -> Tuple[str, Tuple[object, ...]]:
    """How many words, and how many tracks in the view have none (CLEAN-08)."""
    table = spec.values
    assert table is not None
    with_clause, params = _values_scope(query, spec)
    return (
        f"{with_clause}SELECT "
        f"(SELECT count(DISTINCT lower(v.{table.value_column})) "
        f"FROM {table.table} AS v "
        f"WHERE v.{table.track_column} IN (SELECT id FROM facet_scope)) AS values_count, "
        f"(SELECT count(*) FROM facet_scope WHERE id NOT IN "
        f"(SELECT {table.track_column} FROM {table.table})) AS missing",
        params,
    )


def build_facet_values(
    query: BrowseQuery, field: str, limit: Optional[int] = None
) -> Tuple[str, Tuple[object, ...]]:
    """Build the "which values exist, and how many tracks each" query.

    Grouped case-insensitively, because ``House`` and ``house`` are one genre
    to everyone except a byte comparison, and a facet that lists both offers a
    choice that is not real. When a value is spelled several ways, the one
    shown is the first alphabetically — ``min()`` rather than whichever row
    SQLite happened to read last, so the same library always produces the same
    list.

    Tracks with no value are excluded here and counted by
    :func:`build_facet_value_count` instead. Leaving them in would put the "no
    value" bucket somewhere in the count ordering, where a limit could cut it
    off — so a library where a hundred labels are more common than the missing
    ones would stop offering "no label" at all.

    Ordering is by count descending then by value, so the list opens on what
    the library is mostly made of. One row more than the limit is asked for, so
    the caller can tell whether there are more without a second query.
    """
    if field_spec(field).is_multivalued:
        return _values_facet_values(query, field_spec(field), limit)
    spec = _column_facet_spec(field)
    scoped = facet_query(query, spec.name)
    parts = _predicate(scoped, joins=spec.joins)
    layered = (
        None
        if parts.where or parts.cte
        else _layered_facet_rows(spec, present_only=True)
    )
    if layered is not None:
        return (
            f"SELECT min(raw_value) AS raw_value, sum(n) AS n FROM ({layered}) "
            f"GROUP BY {_grouping('raw_value', spec.type)} "
            "ORDER BY n DESC, raw_value COLLATE NOCASE ASC "
            "LIMIT ?",
            (clamp_facet_limit(limit) + 1,),
        )
    present = _has_value(spec)
    filtered = f"{parts.where} AND {present}" if parts.where else f" WHERE {present}"
    return (
        f"{parts.cte}SELECT min({_facet_column(spec)}) AS raw_value, "
        f"count(*) AS n FROM {_facet_table(parts.where)}{parts.join}{filtered} "
        f"GROUP BY {_group_by(spec)} "
        "ORDER BY n DESC, raw_value COLLATE NOCASE ASC "
        "LIMIT ?",
        (*parts.params, clamp_facet_limit(limit) + 1),
    )


def build_facet_value_count(
    query: BrowseQuery, field: str
) -> Tuple[str, Tuple[object, ...]]:
    """Build "how many distinct values, and how many tracks have none".

    Asked so the renderer can say "showing 100 of 2,384 labels" rather than
    discovering there are more only when it hits the limit, and so the "no
    value" bucket is always known even when the value list is truncated.

    One grouped scan answers both: the subquery groups the same way the value
    query does, and the two sums split it into values and the gap.
    """
    if field_spec(field).is_multivalued:
        return _values_facet_count(query, field_spec(field))
    spec = _column_facet_spec(field)
    scoped = facet_query(query, spec.name)
    parts = _predicate(scoped, joins=spec.joins)
    layered = (
        None
        if parts.where or parts.cte
        else _layered_facet_rows(spec, present_only=False)
    )
    if layered is not None:
        # The same two sums over the merged groups. A merged group has a value
        # when either half's does; both halves agree, since they group alike.
        return (
            "SELECT "
            "sum(CASE WHEN has_value THEN 1 ELSE 0 END) AS values_count, "
            "sum(CASE WHEN has_value THEN 0 ELSE n END) AS missing FROM "
            f"(SELECT max(has_value) AS has_value, sum(n) AS n FROM ({layered}) "
            f"GROUP BY {_grouping('raw_value', spec.type)})",
            (),
        )
    present = _has_value(spec)
    return (
        f"{parts.cte}SELECT "
        f"sum(CASE WHEN has_value THEN 1 ELSE 0 END) AS values_count, "
        f"sum(CASE WHEN has_value THEN 0 ELSE n END) AS missing FROM "
        f"(SELECT {present} AS has_value, count(*) AS n "
        f"FROM {_facet_table(parts.where)}{parts.join}{parts.where} "
        f"GROUP BY {_group_by(spec)})",
        parts.params,
    )


def build_facet_range(query: BrowseQuery, field: str) -> Tuple[str, Tuple[object, ...]]:
    """Build the "how low and how high does this field go" query.

    What a range control needs to draw itself, plus how many tracks have no
    value at all so it can offer that as a separate choice rather than
    pretending a missing BPM is zero.

    Raises:
        BrowseQueryError: If the field is not numeric. A range over a genre is
            not a question, and answering it with something else would be worse
            than refusing.
    """
    spec = field_spec(field)
    if spec.type != TYPE_NUMBER:
        raise BrowseQueryError(
            f"{spec.label} is a {spec.type} field; a range needs a number field"
        )
    scoped = facet_query(query, spec.name)
    parts = _predicate(scoped, joins=spec.joins)
    column = _facet_column(spec)
    return (
        f"{parts.cte}SELECT min({column}) AS low, max({column}) AS high, "
        f"sum(CASE WHEN {column} IS NULL THEN 1 ELSE 0 END) AS missing "
        f"FROM {_facet_table(parts.where)}{parts.join}{parts.where}",
        parts.params,
    )
