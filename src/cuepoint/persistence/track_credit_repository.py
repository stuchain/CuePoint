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
"""

from __future__ import annotations

import sqlite3
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, TypeVar

from cuepoint.core.entity_names import name_key, split_credit
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
