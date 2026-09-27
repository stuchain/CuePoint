#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for the library's name index (DISCOVER-03, DEC-094, DEC-095).

Three things are derived from a track's own columns by
``core.entity_names``'s rule, and this module is where each is written:

- **``track_credits``** — ``tracks.artist`` and ``tracks.remixer`` split into
  one row per credited name, with its key (migration 0021).
- **``tracks.label_key``** and **``track_metadata.label_key``** — the key of each
  layer of a track's label (migration 0022).
- **``derived_indexes``** — which version of the rule built them.

Written where the tracks are written
------------------------------------
:func:`write_credits` and :func:`label_key_of` are called by
``TrackRepository`` and ``TrackMetadataRepository`` inside their own
transactions, on the connection they already hold, so a track and its credits
are committed together or not at all: an import, a refresh apply or a revert
that changes a credit leaves no moment in which a filter reads the old one.

Rebuilt, a chunk at a time
--------------------------
:meth:`TrackCreditRepository.rebuild_chunk` is the credit index job's unit of
work. It reads a run of tracks and writes their credits and keys **in one
``BEGIN IMMEDIATE`` transaction**, so it cannot interleave with an import:
either the import's transaction committed first, and the chunk reads its
values, or it commits after, and writes its own credits. A rebuild is therefore
safe beside any writer, and a cancelled one leaves every chunk it finished
correct. The versions are recorded only by :meth:`mark_built`, after the last
chunk, so an interrupted rebuild is simply run again at the next start.

Who a library track is by, when Beatport knows (DISCOVER-07)
------------------------------------------------------------
DEC-095 makes a Beatport id an artist's or label's identity once resolution
knows it, and shows a name group and the id it turned out to be as one page.
That page's library half is a rule, ``beatport_artist is <id>`` or
``beatport_label is <id>``, and :func:`identity_tracks_sql` is what it means:

- **every library track whose accepted Beatport track credits the id**
  (DISCOVER-04's ``library_beatport_credits``). Beatport's own credits are
  authoritative for a resolved track, so a track resolved to someone else of
  the same name is not on the page;
- **and every track not resolved yet whose name is linked to the id and to no
  other.** A library name is linked to an artist id when a resolved track
  credits that name and Beatport credits the id on it under the same key, the
  link DISCOVER-05's ``artist_ids_by_key`` reads. A library label is linked to
  the Beatport label most of its resolved tracks are on, ties to the lower id:
  ``label_ids_by_key``'s rule, by track rather than by spelling. So "Âme"
  tracks that were never matched stay on Âme's page once her id is known, and
  a name two Beatport artists share gives its unresolved tracks to neither:
  the name's own page lists both.

Without the second half, following a name to its id would drop every track
that is not matched on Beatport, which in most libraries is most of them.

The resolution reads (:meth:`TrackCreditRepository.artist_links`,
:meth:`~TrackCreditRepository.label_links` and
:meth:`~TrackCreditRepository.linked_names`) ask the same questions of the same
view, so a name redirects to an id exactly when that id's page takes the name's
tracks.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple, TypeVar

from cuepoint.core.entity_names import name_key, split_credit
from cuepoint.models.beatport_cache import ENTITY_ARTIST, ENTITY_LABEL
from cuepoint.models.track_credit import (
    NAME_INDEXES,
    ROLE_ARTIST,
    ROLE_REMIXER,
    DerivedIndex,
    TrackCredit,
)
from cuepoint.persistence.id_chunks import CHUNK_SIZE
from cuepoint.services.interfaces import IDatabaseService, ITrackCreditRepository

#: The column beside each layer of a label that holds its key (migration 0022).
#: Derived data: the repositories write it with the label, and no model carries
#: it, because nothing reads it back as part of a track or an override.
LABEL_KEY_COLUMN = "label_key"

#: One credit row, in ``track_credits``'s column order.
CreditRow = Tuple[int, str, int, str, str]

#: What a track's credits are made from: its id, artist and remixer.
CreditSource = Tuple[int, Optional[str], Optional[str]]

_INSERT_CREDIT = (
    "INSERT INTO track_credits (track_id, role, position, name, name_key)"
    " VALUES (?, ?, ?, ?, ?)"
)

_T = TypeVar("_T")
_K = TypeVar("_K", int, str)
_V = TypeVar("_V", int, str)

# The effective label (the override where there is one, DEC-068) by key, with
# the first spelling alphabetically, as the label_name facet shows it.
_EFFECTIVE_LABEL_KEY = f"COALESCE(m.{LABEL_KEY_COLUMN}, t.{LABEL_KEY_COLUMN})"
_EFFECTIVE_LABEL = (
    f"CASE WHEN m.{LABEL_KEY_COLUMN} IS NOT NULL THEN m.label ELSE t.label END"
)

_LIBRARY_LABELS = (
    f"SELECT {_EFFECTIVE_LABEL_KEY} AS name_key, min({_EFFECTIVE_LABEL}) AS name"
    " FROM tracks AS t LEFT JOIN track_metadata AS m ON m.track_id = t.id"
    f" WHERE {_EFFECTIVE_LABEL_KEY} IS NOT NULL"
    " GROUP BY 1 ORDER BY 1"
)

# DISCOVER-04's identity view, joined to the library's own names by track.
_ARTIST_LINKS = (
    "SELECT c.name_key AS name_key, b.beatport_id AS beatport_id,"
    " count(DISTINCT c.track_id) AS tracks"
    " FROM library_beatport_credits AS b"
    " JOIN track_credits AS c ON c.track_id = b.track_id AND c.name_key = b.name_key"
    " WHERE b.kind = 'artist' AND b.beatport_id IS NOT NULL"
    " GROUP BY c.name_key, b.beatport_id"
)

_LABEL_LINKS = (
    f"SELECT {_EFFECTIVE_LABEL_KEY} AS name_key, b.beatport_id AS beatport_id,"
    " count(*) AS tracks"
    " FROM library_beatport_credits AS b"
    " JOIN tracks AS t ON t.id = b.track_id"
    " LEFT JOIN track_metadata AS m ON m.track_id = t.id"
    " WHERE b.kind = 'label' AND b.beatport_id IS NOT NULL"
    f" AND {_EFFECTIVE_LABEL_KEY} IS NOT NULL"
    " GROUP BY 1, 2"
)


#: Who Beatport says each resolved library track is by, and on which label,
#: one view per kind (migration 0024), which SQLite reads one track at a time.
_ARTISTS_VIEW = "library_beatport_artists"
_LABELS_VIEW = "library_beatport_labels"

# A track's Beatport label id and name, looked up by the track.
_LABEL_ID_OF_TRACK = (
    f"(SELECT b.beatport_id FROM {_LABELS_VIEW} AS b WHERE b.track_id = t.id)"
)
_LABEL_NAME_OF_TRACK = (
    f"(SELECT b.name FROM {_LABELS_VIEW} AS b WHERE b.track_id = t.id)"
)


def _placeholders(count: int) -> str:
    return ", ".join("?" for _ in range(count))


def _labelled(keys: str) -> str:
    """The library tracks whose effective label key is one of ``keys``.

    Read through migration 0024's two indexes rather than by computing every
    track's effective key: tracks with no override label whose own key
    matches, and tracks whose override's key does. The effective key is the
    override's where there is one (DEC-068), so the two arms are exact and
    disjoint. ``keys`` is the inside of an ``IN``, and appears twice.
    """
    return (
        "SELECT t.id AS track_id FROM tracks AS t"
        " LEFT JOIN track_metadata AS m ON m.track_id = t.id"
        f" WHERE t.{LABEL_KEY_COLUMN} IN ({keys}) AND m.{LABEL_KEY_COLUMN} IS NULL"
        " UNION ALL SELECT track_id FROM track_metadata"
        f" WHERE {LABEL_KEY_COLUMN} IN ({keys})"
    )


def _labelled_tracks(keys: str) -> str:
    """``FROM`` the tracks :func:`_labelled` finds, as ``t`` and ``m``."""
    return (
        f" FROM ({_labelled(keys)}) AS x"
        " JOIN tracks AS t ON t.id = x.track_id"
        " LEFT JOIN track_metadata AS m ON m.track_id = t.id"
    )


def _found(view: str, kind: str, ids: str, columns: str) -> str:
    """The resolved library tracks Beatport credits one of the ids on.

    Driven from the id's own catalog tracks: their Beatport track ids, as a
    list, are looked up through migration 0024's index on the owned id, one
    probe each, where a filter on the view's ``beatport_id`` alone would read
    every accepted match. SQLite uses an index on an expression for a list of
    values and not for a join, hence the list. Binds the ids twice.
    """
    return (
        f"SELECT {columns} FROM {view}"
        f" WHERE beatport_id IN ({ids}) AND beatport_track_id IN ("
        "SELECT value FROM json_each((SELECT json_group_array(beatport_track_id)"
        f" FROM beatport_catalog_credits WHERE kind = '{kind}'"
        f" AND beatport_id IN ({ids}))))"
    )


def _artist_identity(count: int) -> str:
    """The CTEs of an artist id's library identity, for ``count`` ids.

    - ``bp_found``: resolved tracks Beatport credits one of the ids on.
    - ``bp_linked``: the library names those credits link, by key.
    - ``bp_named``: every library track crediting a linked name.
    - ``bp_shared``: the linked names a resolved track links to some other id.
    - ``bp_names``: the linked names that link no other id, whose unresolved
      tracks the ids take.

    Each is materialized, so each is computed once, and each reaches the views
    by key. Binds the ids three times.
    """
    ids = _placeholders(count)
    return (
        "WITH bp_found AS MATERIALIZED ("
        + _found(_ARTISTS_VIEW, ENTITY_ARTIST, ids, "track_id, name_key")
        + "), bp_linked AS MATERIALIZED ("
        "SELECT DISTINCT f.name_key AS name_key FROM bp_found AS f"
        " JOIN track_credits AS c"
        " ON c.track_id = f.track_id AND c.name_key = f.name_key),"
        " bp_named AS MATERIALIZED ("
        "SELECT DISTINCT c.track_id AS track_id, c.name_key AS name_key"
        " FROM bp_linked AS k CROSS JOIN track_credits AS c"
        " WHERE c.name_key = k.name_key),"
        " bp_shared AS MATERIALIZED ("
        "SELECT DISTINCT n.name_key AS name_key FROM bp_named AS n"
        f" WHERE EXISTS (SELECT 1 FROM {_ARTISTS_VIEW} AS o"
        " WHERE o.track_id = n.track_id AND o.name_key = n.name_key"
        f" AND o.beatport_id IS NOT NULL AND o.beatport_id NOT IN ({ids}))),"
        " bp_names AS MATERIALIZED ("
        "SELECT name_key FROM bp_linked"
        " WHERE name_key NOT IN (SELECT name_key FROM bp_shared))"
    )


def _label_identity(count: int) -> str:
    """The CTEs of a label id's library identity, for ``count`` ids.

    - ``bp_found``: resolved tracks on one of the ids.
    - ``bp_keys``: the effective library labels of those tracks.
    - ``bp_named``: every library track with one of those labels, and the
      Beatport label id resolution gave it, if any.
    - ``bp_votes``: for each of those labels, how many resolved tracks are on
      each Beatport label.
    - ``bp_names``: the library labels whose most-voted Beatport label, ties to
      the lower id, is one of the ids.

    Materialized, as :func:`_artist_identity`'s are. Binds the ids three times.
    """
    ids = _placeholders(count)
    return (
        "WITH bp_found AS MATERIALIZED ("
        + _found(_LABELS_VIEW, ENTITY_LABEL, ids, "track_id")
        + "), bp_keys AS MATERIALIZED ("
        f"SELECT DISTINCT {_EFFECTIVE_LABEL_KEY} AS name_key FROM bp_found AS f"
        " JOIN tracks AS t ON t.id = f.track_id"
        " LEFT JOIN track_metadata AS m ON m.track_id = t.id"
        f" WHERE {_EFFECTIVE_LABEL_KEY} IS NOT NULL),"
        " bp_named AS MATERIALIZED ("
        f"SELECT t.id AS track_id, {_EFFECTIVE_LABEL_KEY} AS name_key,"
        f" {_LABEL_ID_OF_TRACK} AS beatport_id"
        + _labelled_tracks("SELECT name_key FROM bp_keys")
        + "),"
        " bp_votes AS MATERIALIZED ("
        "SELECT name_key, beatport_id, count(*) AS tracks FROM bp_named"
        " WHERE beatport_id IS NOT NULL GROUP BY name_key, beatport_id),"
        " bp_names AS MATERIALIZED ("
        "SELECT v.name_key AS name_key FROM bp_votes AS v"
        f" WHERE v.beatport_id IN ({ids})"
        " AND NOT EXISTS (SELECT 1 FROM bp_votes AS w"
        " WHERE w.name_key = v.name_key AND (w.tracks > v.tracks"
        " OR (w.tracks = v.tracks AND w.beatport_id < v.beatport_id))))"
    )


def identity_tracks_sql(kind: str, ids: Sequence[int]) -> Tuple[str, Tuple[int, ...]]:
    """A ``SELECT`` of the library tracks by any of these Beatport ids.

    One column, ``track_id``, never null, for a rule's ``IN`` or ``NOT IN``
    (DISCOVER-07). ``kind`` is ``"artist"`` or ``"label"``. What it selects is
    described at the top of this module.

    Raises:
        ValueError: If ``kind`` is neither, or there are no ids.
    """
    wanted = tuple(int(i) for i in ids)
    if not wanted:
        raise ValueError("An identity names at least one Beatport id")
    if kind == ENTITY_ARTIST:
        sql = (
            _artist_identity(len(wanted)) + " SELECT track_id FROM bp_found"
            " UNION SELECT n.track_id FROM bp_named AS n"
            " WHERE n.name_key IN (SELECT name_key FROM bp_names)"
            f" AND NOT EXISTS (SELECT 1 FROM {_ARTISTS_VIEW} AS r"
            " WHERE r.track_id = n.track_id)"
        )
    elif kind == ENTITY_LABEL:
        sql = (
            _label_identity(len(wanted)) + " SELECT track_id FROM bp_found"
            " UNION SELECT track_id FROM bp_named"
            " WHERE beatport_id IS NULL"
            " AND name_key IN (SELECT name_key FROM bp_names)"
        )
    else:
        raise ValueError(f"No identity of kind {kind!r}")
    return sql, wanted * 3


def _majority(rows: Iterable[Tuple[_K, _V, int]]) -> Dict[_K, _V]:
    """For each key, the value on the most tracks, ties to the lowest value."""
    best: Dict[_K, Tuple[int, _V]] = {}
    for key, value, tracks in rows:
        held = best.get(key)
        if held is None or (-tracks, value) < (-held[0], held[1]):
            best[key] = (tracks, value)
    return {key: best[key][1] for key in sorted(best)}


def _chunks(values: Sequence[_T], size: int = CHUNK_SIZE) -> Iterable[Sequence[_T]]:
    """``values`` in runs of at most ``size``, for SQLite's parameter limit."""
    for start in range(0, len(values), size):
        yield values[start : start + size]


def label_key_of(label: Optional[str]) -> Optional[str]:
    """The key a label is stored beside, or ``None`` when it has none.

    Null for no label *and* for a blank one: Rekordbox writes both for "no
    label", and a key of ``""`` would make every unlabelled track one label.
    """
    if label is None:
        return None
    return name_key(label) or None


def credit_rows(
    track_id: int, artist: Optional[str], remixer: Optional[str]
) -> List[CreditRow]:
    """Every credit row one track's artist and remixer make."""
    rows: List[CreditRow] = []
    for role, credit in ((ROLE_ARTIST, artist), (ROLE_REMIXER, remixer)):
        for position, name in enumerate(split_credit(credit or "")):
            rows.append((int(track_id), role, position, name, name_key(name)))
    return rows


def write_credits(conn: sqlite3.Connection, sources: Iterable[CreditSource]) -> int:
    """Replace the credits of each track in ``sources``, on the caller's connection.

    Deletes a track's rows before writing its new ones, so a credit that lost a
    name loses its row. Runs inside whatever transaction the caller holds and
    opens none of its own.

    Returns:
        How many credit rows were written.
    """
    wanted = list(sources)
    if not wanted:
        return 0
    ids = sorted({int(track_id) for track_id, _, _ in wanted})
    for chunk in _chunks(ids):
        placeholders = ", ".join("?" for _ in chunk)
        conn.execute(
            f"DELETE FROM track_credits WHERE track_id IN ({placeholders})",
            tuple(chunk),
        )
    rows: List[CreditRow] = []
    for track_id, artist, remixer in wanted:
        rows.extend(credit_rows(track_id, artist, remixer))
    if rows:
        conn.executemany(_INSERT_CREDIT, rows)
    return len(rows)


# --- Credits as another module reads them (DISCOVER-08) -----------------------
#
# Similar Tracks reads credits beside other columns, so it cannot go through a
# repository method. It takes its SQL from here instead, as DISCOVER-07's page
# takes ``identity_tracks_sql``, so this module stays the one that knows the
# table.

#: What joins a track's name keys in :func:`credit_keys_sql`'s one column. The
#: unit separator, which no name key holds: a key keeps printable characters
#: and folds whitespace to spaces.
CREDIT_KEY_SEPARATOR = "\x1f"


def credit_keys_sql(track_id: str) -> str:
    """A scalar subquery: every name key the track ``track_id`` credits.

    ``track_id`` is a column expression, such as ``tracks.id``. The keys are
    joined by :data:`CREDIT_KEY_SEPARATOR`, or the answer is ``NULL`` for a
    track with no credits. Answered by the primary key, which leads with the
    track: meant for a few rows, not for a scan.
    """
    return (
        "(SELECT group_concat(c.name_key, char(31)) FROM track_credits AS c"
        f" WHERE c.track_id = {track_id})"
    )


def crediting_any_sql() -> str:
    """A ``SELECT`` of the tracks crediting any key in one JSON-array parameter.

    For ``tracks.id IN (…)``. Answered by ``idx_track_credits_name``.
    """
    return (
        "SELECT track_id FROM track_credits"
        " WHERE name_key IN (SELECT value FROM json_each(?))"
    )


def credited_among(
    conn: sqlite3.Connection, keys: Iterable[str]
) -> Dict[int, Tuple[str, ...]]:
    """Which tracks credit any of ``keys``, and which of those keys, sorted.

    One read through the name index, for a caller that would otherwise ask per
    track: Similar Tracks reads a candidate's artists only for what they share
    with the seed.
    """
    wanted = sorted({key for key in keys if key})
    if not wanted:
        return {}
    found: Dict[int, List[str]] = {}
    for track_id, key in conn.execute(
        "SELECT DISTINCT track_id, name_key FROM track_credits"
        " WHERE name_key IN (SELECT value FROM json_each(?))"
        " ORDER BY track_id, name_key",
        (json.dumps(wanted),),
    ):
        found.setdefault(int(track_id), []).append(key)
    return {track_id: tuple(names) for track_id, names in found.items()}


class TrackCreditRepository(ITrackCreditRepository):
    """Reads the name index, and rebuilds it a chunk at a time."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ------------------------------------------------------------------ read

    def credits(self, track_id: int) -> List[TrackCredit]:
        """One track's credits, artists first, each role in credit order."""
        rows = (
            self._db.connect()
            .execute(
                "SELECT track_id, role, position, name, name_key FROM track_credits"
                " WHERE track_id = ?"
                " ORDER BY CASE role WHEN 'artist' THEN 0 ELSE 1 END, position",
                (int(track_id),),
            )
            .fetchall()
        )
        return [TrackCredit.from_row(row) for row in rows]

    def built(self) -> List[DerivedIndex]:
        """The name indexes that have been built, and by which version."""
        placeholders = ", ".join("?" for _ in NAME_INDEXES)
        rows = (
            self._db.connect()
            .execute(
                "SELECT name, version, built_at FROM derived_indexes"
                f" WHERE name IN ({placeholders}) ORDER BY name",
                NAME_INDEXES,
            )
            .fetchall()
        )
        return [DerivedIndex.from_row(row) for row in rows]

    def is_current(self, version: int) -> bool:
        """True when every name index was built by exactly this rule version."""
        built = {index.name: index for index in self.built()}
        return all(
            name in built and built[name].is_current(version) for name in NAME_INDEXES
        )

    def library_artists(self) -> List[Tuple[str, str]]:
        """Every credited name in the library as ``(key, name)``, by key.

        Every key, not a facet's first thousand (DISCOVER-03's first binding
        note). ``name`` is the first spelling alphabetically, the rule the
        credited-artist facet shows.
        """
        rows = self._db.connect().execute(
            "SELECT name_key, min(name) AS name FROM track_credits"
            " GROUP BY name_key ORDER BY name_key"
        )
        return [(str(r["name_key"]), str(r["name"]).strip()) for r in rows]

    def library_labels(self) -> List[Tuple[str, str]]:
        """Every effective label in the library as ``(key, name)``, by key.

        The effective label is the override where there is one (DEC-068),
        compared by key as the ``label_name`` rule compares it.
        """
        rows = self._db.connect().execute(_LIBRARY_LABELS)
        return [(str(r["name_key"]), str(r["name"]).strip()) for r in rows]

    def artist_ids_by_key(self) -> Dict[int, str]:
        """Each Beatport artist id resolution has linked to a library artist.

        An id is linked to a credited name when a library track credits that
        name and its accepted Beatport track credits an artist with that id
        under the same key (``library_beatport_credits``, DISCOVER-04). Both
        sides must name the artist: a track by "A, B" resolved to A and B links
        A's id to "A" alone. An id two library names share goes to the one on
        more tracks, and then to the lower key.
        """
        rows = self._db.connect().execute(_ARTIST_LINKS)
        return _majority(
            (int(r["beatport_id"]), str(r["name_key"]), int(r["tracks"])) for r in rows
        )

    def label_ids_by_key(self) -> Dict[str, int]:
        """The Beatport label id resolution has linked to each library label.

        A library label is linked to the Beatport label its resolved tracks are
        on — by track, not by spelling, so "Nightfall" in the library links to
        Beatport's "Nightfall Audio". Where its tracks disagree, the label most
        of them are on wins, and then the lower id.
        """
        rows = self._db.connect().execute(_LABEL_LINKS)
        return _majority(
            (str(r["name_key"]), int(r["beatport_id"]), int(r["tracks"])) for r in rows
        )

    # ------------------------------------------------- identity (DISCOVER-07)

    def artist_links(self, key: str) -> List[Tuple[int, str, int]]:
        """The Beatport artist ids a library name is linked to.

        As ``(beatport_id, beatport_name, tracks)``, the id on most of the
        name's resolved tracks first, then by id. One id is the name's identity
        (DEC-095); several are artists who share it; none is a name resolution
        has not linked yet.
        """
        rows = self._db.connect().execute(
            "SELECT b.beatport_id AS beatport_id, min(b.name) AS name,"
            " count(DISTINCT c.track_id) AS tracks"
            f" FROM track_credits AS c CROSS JOIN {_ARTISTS_VIEW} AS b"
            " WHERE c.name_key = ? AND b.track_id = c.track_id"
            " AND b.name_key = c.name_key AND b.beatport_id IS NOT NULL"
            " GROUP BY b.beatport_id ORDER BY tracks DESC, b.beatport_id",
            (str(key),),
        )
        return [(int(r["beatport_id"]), str(r["name"]), int(r["tracks"])) for r in rows]

    def label_links(self, key: str) -> List[Tuple[int, Optional[str], int]]:
        """The Beatport labels a library label's resolved tracks are on.

        As ``(beatport_id, beatport_name, tracks)``, most tracks first and then
        the lower id, so the first is the one the label is linked to: the rule
        :meth:`label_ids_by_key` applies to the whole library.
        """
        rows = self._db.connect().execute(
            f"WITH named AS MATERIALIZED (SELECT {_LABEL_ID_OF_TRACK} AS beatport_id,"
            f" {_LABEL_NAME_OF_TRACK} AS name"
            + _labelled_tracks("?")
            + ") SELECT beatport_id, min(name) AS name, count(*) AS tracks"
            " FROM named WHERE beatport_id IS NOT NULL"
            " GROUP BY beatport_id ORDER BY tracks DESC, beatport_id",
            (str(key), str(key)),
        )
        return [
            (
                int(r["beatport_id"]),
                None if r["name"] is None else str(r["name"]),
                int(r["tracks"]),
            )
            for r in rows
        ]

    def linked_names(self, kind: str, beatport_id: int) -> List[Tuple[str, str, int]]:
        """The library names whose unresolved tracks a Beatport id takes.

        As ``(key, name, tracks)`` by key, ``tracks`` counting every library
        track with that name: exactly the names :func:`identity_tracks_sql`
        reads, so a page can say which spellings it gathered.
        """
        if kind == ENTITY_ARTIST:
            sql = (
                _artist_identity(1)
                + " SELECT n.name_key AS name_key, min(c.name) AS name,"
                " count(DISTINCT c.track_id) AS tracks"
                " FROM bp_names AS n JOIN track_credits AS c"
                " ON c.name_key = n.name_key"
                " GROUP BY n.name_key ORDER BY n.name_key"
            )
        elif kind == ENTITY_LABEL:
            sql = (
                _label_identity(1) + f" SELECT {_EFFECTIVE_LABEL_KEY} AS name_key,"
                f" min({_EFFECTIVE_LABEL}) AS name, count(*) AS tracks"
                + _labelled_tracks("SELECT name_key FROM bp_names")
                + " GROUP BY 1 ORDER BY 1"
            )
        else:
            raise ValueError(f"No identity of kind {kind!r}")
        rows = self._db.connect().execute(sql, (int(beatport_id),) * 3)
        return [
            (str(r["name_key"]), str(r["name"]).strip(), int(r["tracks"])) for r in rows
        ]

    def track_identity(self, track_id: int) -> Tuple[Dict[str, int], Optional[int]]:
        """Who Beatport says one resolved library track is by, and its label.

        As ``(artists, label)``: each name key Beatport credits on the track's
        accepted Beatport track, artist or remixer, with the id it credits
        under that key, and the id of the Beatport label the track is on. A key
        Beatport credits two ids under on the one track names neither, since
        the key cannot say which. A track not resolved answers ``({}, None)``.

        Read through the per-kind views, which SQLite reads one track at a
        time (DISCOVER-07's fifth binding note).
        """
        conn = self._db.connect()
        found: Dict[str, Set[int]] = {}
        for row in conn.execute(
            f"SELECT name_key, beatport_id FROM {_ARTISTS_VIEW}"
            " WHERE track_id = ? AND beatport_id IS NOT NULL",
            (int(track_id),),
        ):
            if row["name_key"]:
                found.setdefault(str(row["name_key"]), set()).add(
                    int(row["beatport_id"])
                )
        artists = {key: min(ids) for key, ids in found.items() if len(ids) == 1}
        labels = {
            int(row["beatport_id"])
            for row in conn.execute(
                f"SELECT beatport_id FROM {_LABELS_VIEW}"
                " WHERE track_id = ? AND beatport_id IS NOT NULL",
                (int(track_id),),
            )
        }
        return artists, (min(labels) if len(labels) == 1 else None)

    def library_name(self, kind: str, key: str) -> Optional[str]:
        """How the library spells a name, or None when no track carries it.

        The first spelling alphabetically, the rule the name facets show.
        """
        params: Tuple[str, ...]
        if kind == ENTITY_ARTIST:
            sql = "SELECT min(name) AS name FROM track_credits WHERE name_key = ?"
            params = (str(key),)
        elif kind == ENTITY_LABEL:
            sql = f"SELECT min({_EFFECTIVE_LABEL}) AS name" + _labelled_tracks("?")
            params = (str(key), str(key))
        else:
            raise ValueError(f"No name of kind {kind!r}")
        row = self._db.connect().execute(sql, params).fetchone()
        if row is None or row["name"] is None:
            return None
        return str(row["name"]).strip() or None

    def unresolved_owned(self, kind: str, key: str) -> int:
        """How many of a name's tracks resolution could still identify.

        Tracks with that name whose match is accepted but whose Beatport
        credits are not in the catalog cache yet: what a resolve job
        (DISCOVER-04) would read. Zero means resolving cannot help, because
        none of the name's tracks is matched to Beatport.
        """
        if kind not in (ENTITY_ARTIST, ENTITY_LABEL):
            raise ValueError(f"No name of kind {kind!r}")
        view = _ARTISTS_VIEW if kind == ENTITY_ARTIST else _LABELS_VIEW
        owned = (
            "EXISTS (SELECT 1 FROM library_beatport_tracks AS l"
            " WHERE l.track_id = {track})"
            f" AND NOT EXISTS (SELECT 1 FROM {view} AS r"
            " WHERE r.track_id = {track})"
        )
        if kind == ENTITY_ARTIST:
            sql = (
                "SELECT count(DISTINCT c.track_id) AS n FROM track_credits AS c"
                " WHERE c.name_key = ? AND " + owned.format(track="c.track_id")
            )
            params: Tuple[str, ...] = (str(key),)
        else:
            sql = (
                "SELECT count(*) AS n"
                + _labelled_tracks("?")
                + " WHERE "
                + owned.format(track="t.id")
            )
            params = (str(key), str(key))
        row = self._db.connect().execute(sql, params).fetchone()
        return int(row["n"]) if row is not None else 0

    def track_count(self) -> int:
        """How many tracks a rebuild will read."""
        row = self._db.connect().execute("SELECT count(*) AS n FROM tracks").fetchone()
        return int(row["n"]) if row is not None else 0

    # ----------------------------------------------------------------- write

    def rebuild_chunk(self, after_id: int, limit: int) -> Tuple[int, int]:
        """Rebuild the credits and label keys of the next ``limit`` tracks.

        Reads the tracks with an id above ``after_id`` in id order, and writes
        their credits, their ``label_key`` and their overrides' ``label_key``,
        all in one transaction.

        Returns:
            ``(last_id, tracks)``: the highest id read, to pass back as
            ``after_id``, and how many tracks were read. ``tracks`` is 0 once
            there are none left.
        """
        with self._db.transaction() as conn:
            rows = conn.execute(
                "SELECT id, artist, remixer, label FROM tracks"
                " WHERE id > ? ORDER BY id LIMIT ?",
                (int(after_id), int(limit)),
            ).fetchall()
            if not rows:
                return int(after_id), 0
            write_credits(
                conn, ((int(r["id"]), r["artist"], r["remixer"]) for r in rows)
            )
            conn.executemany(
                f"UPDATE tracks SET {LABEL_KEY_COLUMN} = ? WHERE id = ?",
                [(label_key_of(r["label"]), int(r["id"])) for r in rows],
            )
            ids = [int(r["id"]) for r in rows]
            for chunk in _chunks(ids):
                placeholders = ", ".join("?" for _ in chunk)
                overrides = conn.execute(
                    "SELECT track_id, label FROM track_metadata"
                    f" WHERE track_id IN ({placeholders})",
                    tuple(chunk),
                ).fetchall()
                conn.executemany(
                    f"UPDATE track_metadata SET {LABEL_KEY_COLUMN} = ? WHERE track_id = ?",
                    [(label_key_of(o["label"]), int(o["track_id"])) for o in overrides],
                )
            return ids[-1], len(ids)

    def mark_built(self, version: int, built_at: str) -> None:
        """Record that every name index is now built by rule ``version``."""
        records = [
            DerivedIndex(name=name, version=version, built_at=built_at)
            for name in NAME_INDEXES
        ]
        with self._db.transaction() as conn:
            conn.executemany(
                "INSERT INTO derived_indexes (name, version, built_at)"
                " VALUES (?, ?, ?)"
                " ON CONFLICT (name) DO UPDATE SET"
                " version = excluded.version, built_at = excluded.built_at",
                [(r.name, r.version, r.built_at) for r in records],
            )
