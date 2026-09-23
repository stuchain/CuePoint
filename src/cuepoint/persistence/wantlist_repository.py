#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for the wantlist (DISCOVER-06, DEC-093).

The one module that reads and writes ``wantlist`` (migration 0021). An entry
references a cached catalog track, so an add that brings a track CuePoint had
not read yet stores its catalog row first, in the same transaction, through
``beatport_catalog_repository.store_catalog_tracks``, which keeps that SQL.

Every write joins an open transaction
-------------------------------------
Each write runs in ``transaction(join_existing=True)``: on its own it commits,
and inside the wantlist service's transaction it joins it, so a change and the
activity event recording it succeed or fail together (DEC-008).

Reading the list
----------------
:meth:`WantlistRepository.page` reads a window with ownership computed then
(DEC-092), through DISCOVER-04's view, read once per window by
``beatport_catalog_repository.owned_among_json``, so an entry whose track is
matched later reads as owned without anything being written. Bought
and owned filter independently. A discovery run's window asks "on the
wantlist?" through :func:`listed_ids_sql`, so the SQL over this table stays
here.
"""

from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional, Sequence, Set, Tuple

from cuepoint.incrate.beatport_api_models import CatalogTrack
from cuepoint.models.beatport_cache import CachedBeatportTrack
from cuepoint.models.discovery_run import (
    OWNED_ALL,
    OWNED_FILTERS,
    OWNED_HIDE,
    OWNED_ONLY,
    SORT_ARTIST,
    SORT_RELEASE_DATE,
    SORT_TITLE,
)
from cuepoint.models.wantlist import (
    BOUGHT_ALL,
    BOUGHT_FILTERS,
    BOUGHT_HIDE,
    BOUGHT_ONLY,
    SORT_ADDED,
    WANTLIST_SORTS,
    WantlistEntry,
    WantlistPage,
    WantlistRow,
)
from cuepoint.persistence.beatport_catalog_repository import (
    CATALOG_TRACK_COLUMNS,
    credit_names,
    first_artist_key_sql,
    owned_among_json,
    owned_json_sql,
    store_catalog_tracks,
)
from cuepoint.persistence.id_chunks import chunked, unique_ids
from cuepoint.services.interfaces import IDatabaseService, IWantlistRepository

#: The largest window the list answers at once: a run's (DISCOVER-05).
MAX_WINDOW = 500

_ENTRY_COLUMNS: Tuple[str, ...] = (
    "beatport_track_id",
    "added_at",
    "note",
    "bought_at",
    "added_from_run_id",
)

_OWNED = owned_json_sql("w.beatport_track_id")

_BOUGHT = "w.bought_at IS NOT NULL"

_FIRST_ARTIST = first_artist_key_sql("w.beatport_track_id")

_SORT_KEYS = {
    SORT_RELEASE_DATE: "b.release_date",
    SORT_ARTIST: _FIRST_ARTIST,
    SORT_TITLE: "b.title COLLATE NOCASE",
}

_OWNED_WHERE = {
    OWNED_HIDE: f"NOT ({_OWNED})",
    OWNED_ONLY: _OWNED,
    OWNED_ALL: "",
}

_BOUGHT_WHERE = {
    BOUGHT_HIDE: f"NOT ({_BOUGHT})",
    BOUGHT_ONLY: _BOUGHT,
    BOUGHT_ALL: "",
}


def listed_ids_sql() -> str:
    """A ``SELECT`` of every Beatport track id on the wantlist, for ``IN (…)``.

    For a reader that shows "on the wantlist" beside rows of its own — a
    discovery run's window (DISCOVER-05) — so that no other module writes SQL
    against this table.
    """
    return "SELECT beatport_track_id FROM wantlist"


def _placeholders(values: Sequence[object]) -> str:
    return ", ".join("?" for _ in values)


def _order_by(sort: str, descending: bool) -> str:
    """The ORDER BY for a sort: missing values last, ties by track id."""
    direction = "DESC" if descending else "ASC"
    if sort == SORT_ADDED:
        return f" ORDER BY w.added_at {direction}, w.beatport_track_id ASC"
    key = _SORT_KEYS[sort]
    return f" ORDER BY ({key}) IS NULL, {key} {direction}, w.beatport_track_id ASC"


class WantlistRepository(IWantlistRepository):
    """The wantlist: Beatport tracks the user wants, with notes and bought marks."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ----------------------------------------------------------------- read

    def entries(self, ids: Sequence[int]) -> Dict[int, WantlistEntry]:
        """The entries among ``ids``, keyed by Beatport track id."""
        found: Dict[int, WantlistEntry] = {}
        conn = self._db.connect()
        for chunk in chunked(unique_ids(ids)):
            for row in conn.execute(
                f"SELECT {', '.join(_ENTRY_COLUMNS)} FROM wantlist"
                f" WHERE beatport_track_id IN ({_placeholders(chunk)})",
                chunk,
            ):
                entry = WantlistEntry.from_row(row)
                found[entry.beatport_track_id] = entry
        return found

    def get(self, beatport_track_id: int) -> Optional[WantlistEntry]:
        """One entry, or None."""
        return self.entries([int(beatport_track_id)]).get(int(beatport_track_id))

    def page(
        self,
        owned: str = OWNED_ALL,
        bought: str = BOUGHT_ALL,
        sort: str = SORT_ADDED,
        descending: bool = True,
        offset: int = 0,
        limit: int = 100,
    ) -> WantlistPage:
        """A window of the list, with ownership as it is now.

        Raises:
            ValueError: If a filter, the sort or the window is not one this
                answers.
        """
        if owned not in OWNED_FILTERS:
            raise ValueError(f"owned must be one of {OWNED_FILTERS}, got {owned!r}")
        if bought not in BOUGHT_FILTERS:
            raise ValueError(f"bought must be one of {BOUGHT_FILTERS}, got {bought!r}")
        if sort not in WANTLIST_SORTS:
            raise ValueError(f"sort must be one of {WANTLIST_SORTS}, got {sort!r}")
        if not 1 <= int(limit) <= MAX_WINDOW or int(offset) < 0:
            raise ValueError(
                f"A window is 1 to {MAX_WINDOW} entries from offset 0 or later"
            )
        conditions = [c for c in (_OWNED_WHERE[owned], _BOUGHT_WHERE[bought]) if c]
        where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        matches = " AND ".join(f"({c})" for c in conditions) or "1"
        conn = self._db.connect()
        values = {
            "owned": owned_among_json(conn, listed_ids_sql()),
            "limit": int(limit),
            "offset": int(offset),
        }
        counted = conn.execute(
            "SELECT count(*) AS entries,"
            f" coalesce(sum({_OWNED}), 0) AS owned,"
            f" coalesce(sum({_BOUGHT}), 0) AS bought,"
            f" coalesce(sum({matches}), 0) AS total"
            " FROM wantlist AS w",
            values,
        ).fetchone()
        rows = conn.execute(
            f"SELECT {_OWNED} AS owned,"
            f" {', '.join('w.' + c for c in _ENTRY_COLUMNS)},"
            f" {', '.join('b.' + c + ' AS b_' + c for c in CATALOG_TRACK_COLUMNS)}"
            " FROM wantlist AS w"
            " JOIN beatport_tracks AS b ON b.beatport_track_id = w.beatport_track_id"
            f"{where}{_order_by(sort, descending)} LIMIT :limit OFFSET :offset",
            values,
        ).fetchall()
        ids = [int(r["beatport_track_id"]) for r in rows]
        credits = credit_names(conn, ids)
        window = tuple(
            WantlistRow(
                entry=WantlistEntry.from_row({c: r[c] for c in _ENTRY_COLUMNS}),
                track=CachedBeatportTrack.from_row(
                    {c: r["b_" + c] for c in CATALOG_TRACK_COLUMNS}
                ),
                artists=credits.get(int(r["beatport_track_id"]), ((), ()))[0],
                remixers=credits.get(int(r["beatport_track_id"]), ((), ()))[1],
                owned=bool(r["owned"]),
            )
            for r in rows
        )
        return WantlistPage(
            rows=window,
            total=int(counted["total"]),
            entries=int(counted["entries"]),
            owned=int(counted["owned"]),
            bought=int(counted["bought"]),
        )

    # ---------------------------------------------------------------- write

    def add(
        self,
        entries: Sequence[WantlistEntry],
        tracks: Sequence[CatalogTrack] = (),
        fetched_at: Optional[str] = None,
    ) -> List[int]:
        """Add entries, storing ``tracks``' catalog rows first; the ids added.

        An entry already on the list is left exactly as it is — its note, its
        bought mark and when it was added — and is not in the answer. So is
        an entry whose track has no catalog row, even after ``tracks`` are
        stored: one the catalog's models refused is left out rather than
        failing the rest.

        Raises:
            ValueError: If ``tracks`` are given without ``fetched_at``.
            sqlite3.IntegrityError: If an entry names a run that does not
                exist. Nothing is written.
        """
        if tracks and fetched_at is None:
            raise ValueError("Catalog rows are stored with when they were read")
        with self._db.transaction(join_existing=True) as conn:
            if tracks:
                store_catalog_tracks(conn, tracks, str(fetched_at))
            ids = [e.beatport_track_id for e in entries]
            listed = _listed_on(conn, ids)
            cached = _cached_on(conn, ids)
            new: List[WantlistEntry] = []
            for entry in entries:
                tid = entry.beatport_track_id
                if tid in cached and tid not in listed:
                    listed.add(tid)
                    new.append(entry)
            conn.executemany(
                f"INSERT INTO wantlist ({', '.join(_ENTRY_COLUMNS)})"
                f" VALUES ({_placeholders(_ENTRY_COLUMNS)})",
                [tuple(e.to_dict()[c] for c in _ENTRY_COLUMNS) for e in new],
            )
        return [e.beatport_track_id for e in new]

    def remove(self, ids: Sequence[int]) -> List[int]:
        """Remove entries; the ids that were on the list, in the order given."""
        wanted = unique_ids(ids)
        with self._db.transaction(join_existing=True) as conn:
            listed = _listed_on(conn, wanted)
            for chunk in chunked([i for i in wanted if i in listed]):
                conn.execute(
                    "DELETE FROM wantlist"
                    f" WHERE beatport_track_id IN ({_placeholders(chunk)})",
                    chunk,
                )
        return [i for i in wanted if i in listed]

    def set_note(self, beatport_track_id: int, note: Optional[str]) -> bool:
        """Set or clear an entry's note; False when there is no such entry.

        Raises:
            ValueError: If the note is one the model refuses.
        """
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                f"SELECT {', '.join(_ENTRY_COLUMNS)} FROM wantlist"
                " WHERE beatport_track_id = ?",
                (int(beatport_track_id),),
            ).fetchone()
            if row is None:
                return False
            changed = WantlistEntry.from_row({**dict(row), "note": note})
            conn.execute(
                "UPDATE wantlist SET note = ? WHERE beatport_track_id = ?",
                (changed.note, changed.beatport_track_id),
            )
        return True

    def set_bought(self, ids: Sequence[int], bought_at: Optional[str]) -> List[int]:
        """Mark entries bought at ``bought_at``, or unmark them with None.

        Only entries whose mark changes are touched: an entry already bought
        keeps the moment it was first marked. Returns those ids, in the order
        given.
        """
        wanted = unique_ids(ids)
        marking = bought_at is not None
        state = "bought_at IS NULL" if marking else "bought_at IS NOT NULL"
        changed: Set[int] = set()
        with self._db.transaction(join_existing=True) as conn:
            for chunk in chunked(wanted):
                marks = f"beatport_track_id IN ({_placeholders(chunk)}) AND {state}"
                changed.update(
                    int(r[0])
                    for r in conn.execute(
                        f"SELECT beatport_track_id FROM wantlist WHERE {marks}", chunk
                    )
                )
                conn.execute(
                    f"UPDATE wantlist SET bought_at = ? WHERE {marks}",
                    (bought_at, *chunk),
                )
        return [i for i in wanted if i in changed]


def _listed_on(conn: sqlite3.Connection, ids: Sequence[int]) -> Set[int]:
    listed: Set[int] = set()
    for chunk in chunked(unique_ids(ids)):
        listed.update(
            int(r[0])
            for r in conn.execute(
                "SELECT beatport_track_id FROM wantlist"
                f" WHERE beatport_track_id IN ({_placeholders(chunk)})",
                chunk,
            )
        )
    return listed


def _cached_on(conn: sqlite3.Connection, ids: Sequence[int]) -> Set[int]:
    """Which of ``ids`` have a catalog row, which an entry references."""
    cached: Set[int] = set()
    for chunk in chunked(unique_ids(ids)):
        cached.update(
            int(r[0])
            for r in conn.execute(
                "SELECT beatport_track_id FROM beatport_tracks"
                f" WHERE beatport_track_id IN ({_placeholders(chunk)})",
                chunk,
            )
        )
    return cached
