#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Statistics repository: all SQL for the plays the Statistics page answers (STATS-02).

Each method is one statement, or two where a display name needs its own scan: a
grouped read of the tracks in a scope, never a count per bucket, so the page costs
the same at 50,000 tracks whatever it is asked (Phase 15, fact 11).

The scope
---------
Every query takes a scope as a rule set and reads only the tracks it matches. It is
compiled by :func:`~cuepoint.persistence.track_query.build_select_scoped`, the
projection the Library's own browse and count are built from, so a Smart
Collection, a Collection or a playlist narrows these numbers exactly as it narrows
the table they open. An empty rule set is the whole library and adds no condition.

Where the plays come from
-------------------------
- **All time** is ``tracks.play_count``: Rekordbox's lifetime total. A missing
  count is unknown and never played is ``0`` (DEC-164).
- **Since a read** is the sum of every rise in a track's stored counts at that read
  and after it, each compared with the stored row before it (``play_counts`` only
  holds the rows where a count moved). The first row a
  track ever has is its baseline and rises from nothing, and a fall adds nothing,
  so "since" never goes below zero (DEC-137).

The spreads and health (STATS-03)
---------------------------------
A spread is one grouped scan: the scope's tracks projected through
:func:`~cuepoint.persistence.track_query.build_select_scoped` with the filter
vocabulary's own expression for the field (``field_spec(name).expression``), so
the value grouped is the value the Library's rule compares. The bucket a track
falls in is decided in the SQL, and a track that falls in none is the ``NULL``
group, which the caller names. Each method returns every group of a field, in a
fixed order, and the service cuts and labels them.

Artists and labels
------------------
An artist is a ``track_credits.name_key``, over artist and remixer credits, counted
once per ``(track, name_key)``: a track crediting B as artist and as remixer has two
credit rows for one name. Its name is the first spelling alphabetically across the
whole library, as ``library_artists`` shows it. A label is the effective
``label_key``, the override where there is one (DEC-068), named the way the
``label_name`` facet names it. Ties between artists or labels sort by key, which is
their name folded to one case, so the order is stable and reads alphabetically.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Dict, Iterator, List, Optional, Tuple

from cuepoint.models.file_status import FILE_PRESENT
from cuepoint.models.filter_rule import FILES_ALIAS, RuleSet, field_spec
from cuepoint.persistence.track_query import BrowseQuery, build_select_scoped
from cuepoint.services.interfaces import IDatabaseService, IStatisticsRepository


@dataclass(frozen=True)
class PlayedTrack:
    """One track and the plays counted for it."""

    id: int
    title: str
    artist: str
    plays: int


@dataclass(frozen=True)
class PlayedName:
    """One artist or label and the plays counted for it.

    Attributes:
        key: The identity plays were grouped by (a ``name_key`` or ``label_key``).
        name: The first spelling of it alphabetically.
        plays: The plays of its tracks.
        tracks: How many of its tracks had at least one play.
    """

    key: str
    name: str
    plays: int
    tracks: int


#: Plays of the scope's tracks, all time: the library's own count.
_ALL_TIME = (
    "plays AS (SELECT tracks.id AS track_id, tracks.play_count AS plays FROM tracks"
    " WHERE tracks.play_count > 0{scoped})"
)

#: Plays of the scope's tracks since a read: the rises at it and after it. Each row
#: in the window is compared with the track's row before it by its primary key, so
#: the cost follows the window and not the history behind it. The first row a track
#: ever has compares with nothing and adds nothing.
_SINCE = (
    "rises AS (SELECT p.track_id AS track_id, p.play_count -"
    " (SELECT q.play_count FROM play_counts q WHERE q.track_id = p.track_id"
    " AND q.read_id < p.read_id ORDER BY q.read_id DESC LIMIT 1) AS rise"
    " FROM play_counts p WHERE p.read_id >= ?{scoped}),"
    " plays AS (SELECT track_id, SUM(rise) AS plays FROM rises"
    " WHERE rise > 0 GROUP BY track_id)"
)

#: The fields the spreads group, through the expression the filter compares.
_GENRE = field_spec("genre").expression
_BPM = field_spec("bpm").expression
_YEAR = field_spec("year").expression
_RATING = field_spec("rating").expression
_DATE_ADDED = field_spec("date_added").expression
_FILE_STATUS = field_spec("file_status")
_MATCH_STATE = field_spec("match_state")

#: A BPM's tempo bucket, ``floor(bpm + 0.5)``, without the addition: ``bpm + 0.5``
#: can round up to the next whole number in floating point while the rule
#: ``bpm < n + 0.5`` still says no, so the bucket is decided by the comparison the
#: rule makes. ``CAST`` truncates, which is the floor of a positive number.
_TEMPO = (
    f"CASE WHEN {_BPM} IS NULL OR {_BPM} < 0.5 THEN NULL"
    f" WHEN {_BPM} >= CAST({_BPM} AS INTEGER) + 0.5 THEN CAST({_BPM} AS INTEGER) + 1"
    f" ELSE CAST({_BPM} AS INTEGER) END"
)

#: A date's month, when the text lies in that month's range ``YYYY-MM-01`` to
#: ``YYYY-MM-31``, compared as text exactly as ``between`` compares it (fact 7).
#: The range's two ends share an eight-character prefix, so a value in it begins
#: with its month and the month can be read from the value. A month is 01 to 12;
#: anything else is no month and so is unknown.
_MONTH = (
    f"CASE WHEN {_DATE_ADDED} GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-*'"
    f" AND substr({_DATE_ADDED}, 6, 2) BETWEEN '01' AND '12'"
    f" AND {_DATE_ADDED} >= substr({_DATE_ADDED}, 1, 7) || '-01'"
    f" AND {_DATE_ADDED} <= substr({_DATE_ADDED}, 1, 7) || '-31'"
    f" THEN substr({_DATE_ADDED}, 1, 7) END"
)

_SCOPED = " AND tracks.id IN (SELECT id FROM scoped)"
_SCOPED_HISTORY = " AND p.track_id IN (SELECT id FROM scoped)"


class StatisticsRepository(IStatisticsRepository):
    """Reads the library's plays, grouped."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    def reads(self) -> List[Tuple[int, str]]:
        """Every read as ``(id, read_at)``, oldest first."""
        rows = self._db.connect().execute(
            "SELECT id, read_at FROM library_reads ORDER BY id"
        )
        return [(int(row[0]), str(row[1])) for row in rows]

    def top_tracks(
        self, scope: RuleSet, limit: int, from_read: Optional[int]
    ) -> List[PlayedTrack]:
        """The ``limit`` most played tracks, ties by title and then id."""
        sql, params = self._statement(
            scope,
            from_read,
            "SELECT t.id, COALESCE(t.title, ''), COALESCE(t.artist, ''), p.plays"
            " FROM plays p JOIN tracks t ON t.id = p.track_id"
            " ORDER BY p.plays DESC, COALESCE(t.title, '') COLLATE NOCASE ASC,"
            " t.id ASC LIMIT ?",
            limit,
        )
        rows = self._db.connect().execute(sql, params)
        return [PlayedTrack(int(r[0]), str(r[1]), str(r[2]), int(r[3])) for r in rows]

    def top_artists(
        self, scope: RuleSet, limit: int, from_read: Optional[int]
    ) -> List[PlayedName]:
        """The ``limit`` artists with the most plays, over artist and remixer credits."""
        # `track_credits.role` is `artist` or `remixer`, so every credit counts;
        # DISTINCT is what makes a track credited twice to one name count once.
        sql, params = self._statement(
            scope,
            from_read,
            "credited AS (SELECT DISTINCT c.track_id, c.name_key FROM track_credits c"
            " WHERE c.track_id IN (SELECT track_id FROM plays)),"
            " ranked AS (SELECT cr.name_key AS name_key, SUM(p.plays) AS plays,"
            " COUNT(*) AS tracks FROM credited cr"
            " JOIN plays p ON p.track_id = cr.track_id"
            " GROUP BY cr.name_key ORDER BY plays DESC, cr.name_key ASC LIMIT ?)"
            " SELECT r.name_key,"
            " (SELECT min(name) FROM track_credits WHERE name_key = r.name_key),"
            " r.plays, r.tracks FROM ranked r"
            " ORDER BY r.plays DESC, r.name_key ASC",
            limit,
            tail_ctes=True,
        )
        return self._names(sql, params)

    def top_labels(
        self, scope: RuleSet, limit: int, from_read: Optional[int]
    ) -> List[PlayedName]:
        """The ``limit`` labels with the most plays, by effective label key."""
        effective_key = "COALESCE(m.label_key, t.label_key)"
        sql, params = self._statement(
            scope,
            from_read,
            "ranked AS (SELECT lk.label_key AS label_key, SUM(lk.plays) AS plays,"
            " COUNT(*) AS tracks FROM ("
            f"SELECT {effective_key} AS label_key, p.plays AS plays FROM plays p"
            " JOIN tracks t ON t.id = p.track_id"
            " LEFT JOIN track_metadata m ON m.track_id = t.id) lk"
            " WHERE lk.label_key IS NOT NULL"
            " GROUP BY lk.label_key ORDER BY plays DESC, lk.label_key ASC LIMIT ?),"
            f" named AS (SELECT {effective_key} AS label_key,"
            " min(CASE WHEN m.label_key IS NOT NULL THEN m.label ELSE t.label END)"
            " AS name FROM tracks t LEFT JOIN track_metadata m ON m.track_id = t.id"
            f" WHERE {effective_key} IN (SELECT label_key FROM ranked) GROUP BY 1)"
            " SELECT r.label_key, n.name, r.plays, r.tracks FROM ranked r"
            " JOIN named n ON n.label_key = r.label_key"
            " ORDER BY r.plays DESC, r.label_key ASC",
            limit,
            tail_ctes=True,
        )
        return self._names(sql, params)

    def unplayed(self, scope: RuleSet) -> Tuple[int, int]:
        """``(never played, unknown)`` among the scope's tracks."""
        sql, params = self._scope(scope)
        prefix = f"WITH scoped AS ({sql}) " if sql else ""
        where = " WHERE tracks.id IN (SELECT id FROM scoped)" if sql else ""
        row = (
            self._db.connect()
            .execute(
                f"{prefix}SELECT COALESCE(SUM(play_count = 0), 0),"
                f" COALESCE(SUM(play_count IS NULL), 0) FROM tracks{where}",
                params,
            )
            .fetchone()
        )
        return int(row[0]), int(row[1])

    # ---------------------------------------------------------- spreads

    def total(self, scope: RuleSet) -> int:
        """How many tracks the scope holds."""
        sql, params = build_select_scoped(BrowseQuery(rules=scope), "1")
        row = (
            self._db.connect()
            .execute(f"SELECT COUNT(*) FROM ({sql})", params)
            .fetchone()
        )
        return int(row[0])

    def genre_spread(self, scope: RuleSet) -> Tuple[List[Tuple[str, int]], int]:
        """``(genres, none)``: each effective genre and its tracks, and the tracks with none.

        Genres are grouped without case, the way the filter's ``is`` matches
        them, and named by their smallest spelling. Commonest first, ties by name.
        """
        rows = self._grouped(
            scope,
            f"CASE WHEN {_GENRE} IS NULL OR {_GENRE} = '' THEN NULL"
            f" ELSE {_GENRE} END AS bucket",
            ("meta",),
            "MIN(bucket), COUNT(*)",
            "bucket COLLATE NOCASE",
            "COUNT(*) DESC, bucket COLLATE NOCASE ASC",
        )
        return (
            [(str(r[0]), int(r[1])) for r in rows if r[0] is not None],
            sum(int(r[1]) for r in rows if r[0] is None),
        )

    def tempo_spread(self, scope: RuleSet) -> Tuple[List[Tuple[int, int]], int, int]:
        """``(buckets, none, not_positive)``: each tempo ``n`` and its tracks.

        ``none`` is the tracks with no BPM, the ones ``bpm`` *is empty* finds;
        ``not_positive`` those with a BPM under 0.5 (zero or less, or too small to
        round to a tempo): the bucket ``0`` would open ``bpm < 0.5``, which also
        finds a BPM of zero or less, so they are counted apart. Ascending.
        """
        return self._numbers(scope, _TEMPO, _BPM)

    def year_spread(self, scope: RuleSet) -> Tuple[List[Tuple[int, int]], int, int]:
        """``(buckets, none, not_positive)``: each effective year and its tracks.

        As :meth:`tempo_spread`: ``none`` has no year, ``not_positive`` a year of
        zero or less. Ascending.
        """
        return self._numbers(
            scope,
            f"CASE WHEN {_YEAR} IS NULL OR {_YEAR} <= 0 THEN NULL"
            f" ELSE CAST({_YEAR} AS INTEGER) END",
            _YEAR,
        )

    def rating_spread(self, scope: RuleSet) -> Tuple[List[Tuple[int, int]], int]:
        """``(stars, unrated)``: each effective rating present and its tracks."""
        rows = self._grouped(
            scope,
            f"CAST({_RATING} AS INTEGER) AS bucket",
            ("meta",),
            "bucket, COUNT(*)",
            "bucket",
            "bucket ASC",
        )
        return (
            [(int(r[0]), int(r[1])) for r in rows if r[0] is not None],
            sum(int(r[1]) for r in rows if r[0] is None),
        )

    def month_spread(self, scope: RuleSet) -> Tuple[List[Tuple[str, int]], int]:
        """``(months, unknown)``: each ``YYYY-MM`` and the tracks in its text range."""
        rows = self._grouped(
            scope,
            f"{_MONTH} AS bucket",
            (),
            "bucket, COUNT(*)",
            "bucket",
            "bucket ASC",
        )
        return (
            [(str(r[0]), int(r[1])) for r in rows if r[0] is not None],
            sum(int(r[1]) for r in rows if r[0] is None),
        )

    # ------------------------------------------------------------ health

    @contextmanager
    def snapshot(self) -> Iterator[None]:
        """Run the reads inside it against one snapshot of the library.

        One read transaction (a WAL snapshot), so the totals of a route's several
        statements agree whatever a refresh commits meanwhile. Joins a transaction
        already open on the connection, which then owns the boundary.
        """
        connection = self._db.connect()
        if connection.in_transaction:
            yield
            return
        connection.execute("BEGIN")
        try:
            yield
        finally:
            connection.execute("ROLLBACK")

    def present_files(self, scope: RuleSet) -> List[Tuple[int, str, Optional[int]]]:
        """``(track id, path, size)`` of each scope track the last check found present.

        One row per track, so tracks that share a path are counted each. The size
        is the one that check recorded, or ``None``. A check of another path than
        the track's present one is no check of it (CLEAN-07).
        """
        sql, params = build_select_scoped(
            BrowseQuery(rules=scope),
            f"tracks.id AS id, tracks.file_path AS path,"
            f" {FILES_ALIAS}.size_bytes AS size",
            condition=(
                f"{FILES_ALIAS}.status = ? AND {FILES_ALIAS}.checked_path ="
                " tracks.file_path AND tracks.file_path IS NOT NULL"
                " AND tracks.file_path <> ''"
            ),
            params=(FILE_PRESENT,),
            joins=(FILES_ALIAS,),
        )
        rows = self._db.connect().execute(sql, params)
        return [
            (int(r[0]), str(r[1]), None if r[2] is None else int(r[2])) for r in rows
        ]

    def file_states(self, scope: RuleSet) -> Dict[str, int]:
        """Each file state the scope's tracks are in and how many, as the filter reads it."""
        return self._counts(scope, _FILE_STATUS.expression, _FILE_STATUS.joins)

    def match_states(self, scope: RuleSet) -> Dict[str, int]:
        """Each Beatport match state the scope's tracks are in and how many."""
        return self._counts(scope, _MATCH_STATE.expression, _MATCH_STATE.joins)

    def last_checked(self, scope: RuleSet) -> Optional[str]:
        """When the most recent file check of a scope track's present path was made."""
        sql, params = build_select_scoped(
            BrowseQuery(rules=scope),
            f"{FILES_ALIAS}.checked_at AS at",
            condition=f"{FILES_ALIAS}.checked_path = tracks.file_path",
            joins=(FILES_ALIAS,),
        )
        row = (
            self._db.connect()
            .execute(f"SELECT MAX(at) FROM ({sql})", params)
            .fetchone()
        )
        return None if row is None or row[0] is None else str(row[0])

    # --------------------------------------------------------------- helpers

    def _grouped(
        self,
        scope: RuleSet,
        columns: str,
        joins: Tuple[str, ...],
        select: str,
        group: str,
        order: str,
    ) -> List[Tuple[Any, ...]]:
        """One grouped scan of the scope's tracks: ``columns`` projected, then grouped."""
        sql, params = build_select_scoped(
            BrowseQuery(rules=scope), columns, joins=joins
        )
        rows = self._db.connect().execute(
            f"SELECT {select} FROM ({sql}) GROUP BY {group} ORDER BY {order}", params
        )
        return [tuple(row) for row in rows]

    def _numbers(
        self, scope: RuleSet, bucket: str, value: str
    ) -> Tuple[List[Tuple[int, int]], int, int]:
        """A whole-number spread: buckets ascending, then no value, then not positive."""
        rows = self._grouped(
            scope,
            f"{bucket} AS bucket, ({value} IS NULL) AS none",
            ("meta",),
            "bucket, none, COUNT(*)",
            "bucket, none",
            "bucket ASC",
        )
        return (
            [(int(r[0]), int(r[2])) for r in rows if r[0] is not None],
            sum(int(r[2]) for r in rows if r[0] is None and r[1]),
            sum(int(r[2]) for r in rows if r[0] is None and not r[1]),
        )

    def _counts(
        self, scope: RuleSet, expression: str, joins: Tuple[str, ...]
    ) -> Dict[str, int]:
        sql, params = build_select_scoped(
            BrowseQuery(rules=scope), f"{expression} AS state", joins=joins
        )
        rows = self._db.connect().execute(
            f"SELECT state, COUNT(*) FROM ({sql}) GROUP BY state", params
        )
        return {str(row[0]): int(row[1]) for row in rows}

    @staticmethod
    def _scope(scope: RuleSet) -> Tuple[str, Tuple[object, ...]]:
        """The scope's track ids as a statement, or nothing for the whole library."""
        if not scope:
            return "", ()
        return build_select_scoped(BrowseQuery(rules=scope), "tracks.id")

    def _statement(
        self,
        scope: RuleSet,
        from_read: Optional[int],
        select: str,
        limit: int,
        *,
        tail_ctes: bool = False,
    ) -> Tuple[str, Tuple[object, ...]]:
        """Assemble ``WITH scoped, plays <select>`` and its parameters in order.

        ``select`` is either a final ``SELECT`` over ``plays`` or, with
        ``tail_ctes``, further CTEs ending in one. Parameters bind in the order
        they appear: the scope's, then the window's read, then the limit.
        """
        scope_sql, params = self._scope(scope)
        ctes = []
        if scope_sql:
            ctes.append(f"scoped AS ({scope_sql})")
        if from_read is None:
            ctes.append(_ALL_TIME.format(scoped=_SCOPED if scope_sql else ""))
        else:
            ctes.append(_SINCE.format(scoped=_SCOPED_HISTORY if scope_sql else ""))
            params = (*params, int(from_read))
        joiner = ", " if tail_ctes else " "
        return f"WITH {', '.join(ctes)}{joiner}{select}", (*params, int(limit))

    def _names(self, sql: str, params: Tuple[object, ...]) -> List[PlayedName]:
        rows = self._db.connect().execute(sql, params)
        return [
            PlayedName(str(r[0]), str(r[1]).strip(), int(r[2]), int(r[3])) for r in rows
        ]
