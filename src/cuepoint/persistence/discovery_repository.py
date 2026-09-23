#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for discovery runs and the name-lookup cache (DISCOVER-05, DEC-091).

The one module that writes ``discovery_runs``, ``discovery_run_tracks``,
``discovery_run_sources`` and ``beatport_name_lookups`` (migration 0021).

A run is written as it goes
---------------------------
:meth:`DiscoveryRepository.start_run` stores the run before it asks Beatport
anything, with its scope in ``params_json``. What it finds is then committed
in :meth:`~DiscoveryRepository.record_found` transactions, each holding the
catalog
rows of the tracks found (through ``beatport_catalog_repository``, which owns
that SQL), the tracks the run had not found yet at the next positions, every
reason for each, and the run's counts. So a cancel, a failure or a crash keeps
exactly what the run had found, and a reader never sees a track without its
catalog row or a count ahead of its rows.

Reading a run
-------------
:meth:`~DiscoveryRepository.run_tracks` reads a window in one of four orders
with ownership computed then (DEC-092), through DISCOVER-04's view, read once
per window by ``beatport_catalog_repository.owned_among_json`` (DISCOVER-06): a
track matched after the run reads as owned when the run is reopened. Every page carries the counts the list needs to say "N
owned tracks hidden". It joins the catalog it shows, which
``beatport_catalog_repository`` alone writes, and says whether each track is on
the wantlist through ``wantlist_repository.listed_ids_sql`` (DISCOVER-06).
"""

from __future__ import annotations

import sqlite3
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

from cuepoint.incrate.beatport_api_models import CatalogTrack
from cuepoint.models.beatport_cache import BeatportNameLookup, CachedBeatportTrack
from cuepoint.models.discovery_run import (
    OWNED_ALL,
    OWNED_FILTERS,
    OWNED_HIDE,
    OWNED_ONLY,
    RUN_COUNTS,
    RUN_FAILED,
    RUN_TRACK_SORTS,
    SORT_ARTIST,
    SORT_FOUND,
    SORT_RELEASE_DATE,
    SORT_TITLE,
    DiscoveryRun,
    DiscoveryRunSource,
    RunTrackRow,
    RunTracksPage,
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
from cuepoint.persistence.wantlist_repository import listed_ids_sql
from cuepoint.services.interfaces import IDatabaseService, IDiscoveryRepository

#: The largest window a run's list answers at once.
MAX_WINDOW = 500

_RUN_COLUMNS: Tuple[str, ...] = (
    "id",
    "job_id",
    "started_at",
    "finished_at",
    "outcome",
    "params_json",
    *RUN_COUNTS,
    "error",
    "error_class",
)

_SOURCE_COLUMNS: Tuple[str, ...] = (
    "run_id",
    "beatport_track_id",
    "source_type",
    "source_id",
    "source_name",
    "source_url",
    "matched_on",
)

_SELECT_RUN = f"SELECT {', '.join(_RUN_COLUMNS)} FROM discovery_runs"

_OWNED = owned_json_sql("rt.beatport_track_id")

_RUN_TRACK_IDS = (
    "SELECT beatport_track_id FROM discovery_run_tracks WHERE run_id = :run"
)

_ON_WANTLIST = f"rt.beatport_track_id IN ({listed_ids_sql()})"

_FIRST_ARTIST = first_artist_key_sql("rt.beatport_track_id")

_SORT_KEYS = {
    SORT_RELEASE_DATE: "b.release_date",
    SORT_ARTIST: _FIRST_ARTIST,
    SORT_TITLE: "b.title COLLATE NOCASE",
}

_OWNED_WHERE = {
    OWNED_HIDE: f" AND NOT ({_OWNED})",
    OWNED_ONLY: f" AND {_OWNED}",
    OWNED_ALL: "",
}


def _placeholders(values: Sequence[object]) -> str:
    return ", ".join("?" for _ in values)


def _order_by(sort: str, descending: bool) -> str:
    """The ORDER BY for a sort: missing values last, ties in found order."""
    if sort == SORT_FOUND:
        return f" ORDER BY rt.position {'DESC' if descending else 'ASC'}"
    key = _SORT_KEYS[sort]
    direction = "DESC" if descending else "ASC"
    return f" ORDER BY ({key}) IS NULL, {key} {direction}, rt.position ASC"


class DiscoveryRepository(IDiscoveryRepository):
    """Discovery runs, what each found and why, and the name-lookup cache."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ------------------------------------------------------------------ runs

    def start_run(self, run: DiscoveryRun) -> DiscoveryRun:
        """Store a run as it starts, and return it with its id.

        Raises:
            ValueError: If the run already has an id or an outcome.
        """
        if run.id is not None or not run.is_running:
            raise ValueError("A run is stored once, when it starts")
        values = run.to_dict()
        columns = [c for c in _RUN_COLUMNS if c != "id"]
        with self._db.transaction() as conn:
            cursor = conn.execute(
                f"INSERT INTO discovery_runs ({', '.join(columns)})"
                f" VALUES ({_placeholders(columns)})",
                tuple(values[c] for c in columns),
            )
            run_id = int(cursor.lastrowid or 0)
        stored = self.get_run(run_id)
        assert stored is not None
        return stored

    def record_found(
        self,
        run_id: int,
        tracks: Sequence[CatalogTrack],
        sources: Sequence[DiscoveryRunSource],
        fetched_at: str,
        counts: Mapping[str, int],
    ) -> int:
        """Store what one chart or label gave a run, in one transaction.

        ``tracks`` in the order they were found: those the run already holds
        keep their place, and new ones take the next positions. A source for a
        track that could not be stored is left out with it, and a reason
        recorded before is not recorded twice. ``counts`` are the run's
        counts now (any of :data:`RUN_COUNTS` but ``tracks_found``, which is
        counted from the rows).

        Returns:
            How many tracks the run had not found before.
        """
        unknown = set(counts) - set(RUN_COUNTS) | ({"tracks_found"} & set(counts))
        if unknown:
            raise ValueError(f"Not a count a run records here: {sorted(unknown)}")
        with self._db.transaction() as conn:
            _require_running(conn, run_id)
            stored = set(store_catalog_tracks(conn, tracks, fetched_at))
            held = {
                int(row[0])
                for chunk in chunked(sorted(stored))
                for row in conn.execute(
                    "SELECT beatport_track_id FROM discovery_run_tracks"
                    f" WHERE run_id = ? AND beatport_track_id IN ({_placeholders(chunk)})",
                    (run_id, *chunk),
                )
            }
            row = conn.execute(
                "SELECT coalesce(max(position) + 1, 0) FROM discovery_run_tracks"
                " WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            position = int(row[0])
            new: List[Tuple[int, int, int]] = []
            for track_id in unique_ids(t.id for t in tracks):
                if track_id in stored and track_id not in held:
                    new.append((run_id, track_id, position))
                    position += 1
            conn.executemany(
                "INSERT INTO discovery_run_tracks (run_id, beatport_track_id, position)"
                " VALUES (?, ?, ?)",
                new,
            )
            conn.executemany(
                f"INSERT OR IGNORE INTO discovery_run_sources ({', '.join(_SOURCE_COLUMNS)})"
                f" VALUES ({_placeholders(_SOURCE_COLUMNS)})",
                [
                    tuple(source.to_dict()[c] for c in _SOURCE_COLUMNS)
                    for source in sources
                    if source.run_id == run_id and source.beatport_track_id in stored
                ],
            )
            _write_counts(conn, run_id, counts)
        return len(new)

    def update_counts(self, run_id: int, counts: Mapping[str, int]) -> None:
        """Set some of a running run's counts."""
        if "tracks_found" in counts or set(counts) - set(RUN_COUNTS):
            raise ValueError(f"Not a count a run records here: {sorted(counts)}")
        with self._db.transaction() as conn:
            _require_running(conn, run_id)
            _write_counts(conn, run_id, counts)

    def finish_run(
        self,
        run_id: int,
        outcome: str,
        finished_at: str,
        error: Optional[str] = None,
        error_class: Optional[str] = None,
    ) -> DiscoveryRun:
        """Record how a running run ended, and return it as it now reads.

        Raises:
            LookupError: If there is no such run.
            ValueError: If it has already ended, or the outcome and error do
                not go together (the model's rules).
        """
        with self._db.transaction() as conn:
            current = _run_on(conn, run_id)
            if current is None:
                raise LookupError(f"No discovery run {run_id}")
            if not current.is_running:
                raise ValueError(f"Discovery run {run_id} has already ended")
            ended = DiscoveryRun.from_row(
                {
                    **current.to_dict(),
                    "outcome": outcome,
                    "finished_at": finished_at,
                    "error": error,
                    "error_class": error_class,
                }
            )
            conn.execute(
                "UPDATE discovery_runs SET outcome = ?, finished_at = ?, error = ?,"
                " error_class = ? WHERE id = ?",
                (
                    ended.outcome,
                    ended.finished_at,
                    ended.error,
                    ended.error_class,
                    run_id,
                ),
            )
        return ended

    def close_interrupted(self, finished_at: str, error: str) -> List[int]:
        """Fail every run still marked running, as a crash leaves them.

        DISCOVER-02's fourth binding note: the schema cannot tell a live run
        from a dead one, so the engine closes them as it starts, keeping what
        each had committed.

        Returns:
            The ids closed, in id order.
        """
        with self._db.transaction() as conn:
            ids = [
                int(r[0])
                for r in conn.execute(
                    "SELECT id FROM discovery_runs WHERE outcome IS NULL ORDER BY id"
                )
            ]
            conn.execute(
                "UPDATE discovery_runs SET outcome = ?, finished_at = ?, error = ?,"
                " error_class = NULL WHERE outcome IS NULL",
                (RUN_FAILED, finished_at, error),
            )
        return ids

    def get_run(self, run_id: int) -> Optional[DiscoveryRun]:
        """One run, or None."""
        return _run_on(self._db.connect(), run_id)

    def list_runs(self, limit: int = 50, offset: int = 0) -> List[DiscoveryRun]:
        """Runs, newest first."""
        rows = self._db.connect().execute(
            f"{_SELECT_RUN} ORDER BY id DESC LIMIT ? OFFSET ?",
            (max(0, int(limit)), max(0, int(offset))),
        )
        return [DiscoveryRun.from_row(row) for row in rows]

    def delete_run(self, run_id: int) -> bool:
        """Delete a run with its tracks and sources; True when it existed.

        The catalog rows it found stay: the cache is shared, and a row a
        wantlist entry or another run holds cannot go anyway.

        Raises:
            ValueError: If the run is still running.
        """
        with self._db.transaction() as conn:
            current = _run_on(conn, run_id)
            if current is None:
                return False
            if current.is_running:
                raise ValueError(f"Discovery run {run_id} is still running")
            conn.execute("DELETE FROM discovery_runs WHERE id = ?", (run_id,))
        return True

    # ----------------------------------------------------------------- read

    def run_tracks(
        self,
        run_id: int,
        owned: str = OWNED_HIDE,
        sort: str = SORT_FOUND,
        descending: bool = False,
        offset: int = 0,
        limit: int = 100,
    ) -> RunTracksPage:
        """A window of a run's tracks, with ownership as it is now.

        Raises:
            ValueError: If the filter, sort or window is not one this answers.
        """
        if owned not in OWNED_FILTERS:
            raise ValueError(f"owned must be one of {OWNED_FILTERS}, got {owned!r}")
        if sort not in RUN_TRACK_SORTS:
            raise ValueError(f"sort must be one of {RUN_TRACK_SORTS}, got {sort!r}")
        if not 1 <= int(limit) <= MAX_WINDOW or int(offset) < 0:
            raise ValueError(
                f"A window is 1 to {MAX_WINDOW} tracks from offset 0 or later"
            )
        conn = self._db.connect()
        values = {
            "run": int(run_id),
            "owned": owned_among_json(conn, _RUN_TRACK_IDS, {"run": int(run_id)}),
            "limit": int(limit),
            "offset": int(offset),
        }
        counted = conn.execute(
            f"SELECT count(*) AS tracks, coalesce(sum({_OWNED}), 0) AS owned"
            " FROM discovery_run_tracks AS rt WHERE rt.run_id = :run",
            values,
        ).fetchone()
        tracks, owned_count = int(counted["tracks"]), int(counted["owned"])
        total = {
            OWNED_HIDE: tracks - owned_count,
            OWNED_ONLY: owned_count,
            OWNED_ALL: tracks,
        }[owned]
        rows = conn.execute(
            f"SELECT rt.position AS position, {_OWNED} AS owned,"
            f" {_ON_WANTLIST} AS on_wantlist,"
            f" {', '.join('b.' + c for c in CATALOG_TRACK_COLUMNS)}"
            " FROM discovery_run_tracks AS rt"
            " JOIN beatport_tracks AS b ON b.beatport_track_id = rt.beatport_track_id"
            f" WHERE rt.run_id = :run{_OWNED_WHERE[owned]}"
            f"{_order_by(sort, descending)} LIMIT :limit OFFSET :offset",
            values,
        ).fetchall()
        ids = [int(r["beatport_track_id"]) for r in rows]
        credits = credit_names(conn, ids)
        sources = _sources(conn, run_id, ids)
        window = tuple(
            RunTrackRow(
                position=int(r["position"]),
                track=CachedBeatportTrack.from_row(r),
                artists=credits.get(int(r["beatport_track_id"]), ((), ()))[0],
                remixers=credits.get(int(r["beatport_track_id"]), ((), ()))[1],
                owned=bool(r["owned"]),
                sources=tuple(sources.get(int(r["beatport_track_id"]), ())),
                on_wantlist=bool(r["on_wantlist"]),
            )
            for r in rows
        )
        return RunTracksPage(
            rows=window,
            total=total,
            tracks=tracks,
            owned=owned_count,
            hidden=owned_count if owned == OWNED_HIDE else 0,
        )

    def run_sources(self, run_id: int) -> List[DiscoveryRunSource]:
        """Every reason a run found each track, in the order it found them."""
        rows = self._db.connect().execute(
            f"SELECT {', '.join(_SOURCE_COLUMNS)} FROM discovery_run_sources"
            " WHERE run_id = ? ORDER BY rowid",
            (run_id,),
        )
        return [DiscoveryRunSource.from_row(row) for row in rows]

    def tracks_in_run(self, run_id: int, ids: Iterable[int]) -> Set[int]:
        """Which of ``ids`` a run found."""
        found: Set[int] = set()
        conn = self._db.connect()
        for chunk in chunked(unique_ids(ids)):
            found.update(
                int(row[0])
                for row in conn.execute(
                    "SELECT beatport_track_id FROM discovery_run_tracks"
                    f" WHERE run_id = ? AND beatport_track_id IN ({_placeholders(chunk)})",
                    (int(run_id), *chunk),
                )
            )
        return found

    # ---------------------------------------------------------- name lookups

    def lookups(self, kind: str, keys: Iterable[str]) -> Dict[str, BeatportNameLookup]:
        """The cached name searches among ``keys``, by key."""
        wanted = list(dict.fromkeys(keys))
        found: Dict[str, BeatportNameLookup] = {}
        conn = self._db.connect()
        for start in range(0, len(wanted), 500):
            chunk = wanted[start : start + 500]
            for row in conn.execute(
                "SELECT kind, name_key, beatport_id, beatport_name, looked_up_at"
                " FROM beatport_name_lookups"
                f" WHERE kind = ? AND name_key IN ({_placeholders(chunk)})",
                (kind, *chunk),
            ):
                lookup = BeatportNameLookup.from_row(row)
                found[lookup.name_key] = lookup
        return found

    def save_lookup(self, lookup: BeatportNameLookup) -> None:
        """Store what a name search answered, replacing an earlier answer."""
        with self._db.transaction() as conn:
            conn.execute(
                "INSERT INTO beatport_name_lookups"
                " (kind, name_key, beatport_id, beatport_name, looked_up_at)"
                " VALUES (?, ?, ?, ?, ?)"
                " ON CONFLICT (kind, name_key) DO UPDATE SET"
                " beatport_id = excluded.beatport_id,"
                " beatport_name = excluded.beatport_name,"
                " looked_up_at = excluded.looked_up_at",
                (
                    lookup.kind,
                    lookup.name_key,
                    lookup.beatport_id,
                    lookup.beatport_name,
                    lookup.looked_up_at,
                ),
            )


def _run_on(conn: sqlite3.Connection, run_id: int) -> Optional[DiscoveryRun]:
    row = conn.execute(f"{_SELECT_RUN} WHERE id = ?", (int(run_id),)).fetchone()
    return DiscoveryRun.from_row(row) if row is not None else None


def _require_running(conn: sqlite3.Connection, run_id: int) -> None:
    current = _run_on(conn, run_id)
    if current is None:
        raise LookupError(f"No discovery run {run_id}")
    if not current.is_running:
        raise ValueError(f"Discovery run {run_id} has already ended")


def _write_counts(
    conn: sqlite3.Connection, run_id: int, counts: Mapping[str, int]
) -> None:
    """Set the given counts, recount the tracks, and check the result."""
    names = [name for name in RUN_COUNTS if name in counts]
    assignments = [f"{name} = ?" for name in names]
    assignments.append(
        "tracks_found = (SELECT count(*) FROM discovery_run_tracks WHERE run_id = ?)"
    )
    conn.execute(
        f"UPDATE discovery_runs SET {', '.join(assignments)} WHERE id = ?",
        (*(int(counts[name]) for name in names), run_id, run_id),
    )
    # Read back through the model, inside the transaction: counts that break
    # its rules (more labels resolved than in scope) roll the whole write back.
    _run_on(conn, run_id)


def _sources(
    conn: sqlite3.Connection, run_id: int, ids: Sequence[int]
) -> Dict[int, List[DiscoveryRunSource]]:
    found: Dict[int, List[DiscoveryRunSource]] = {}
    for chunk in chunked(list(ids)):
        for row in conn.execute(
            f"SELECT {', '.join(_SOURCE_COLUMNS)} FROM discovery_run_sources"
            f" WHERE run_id = ? AND beatport_track_id IN ({_placeholders(chunk)})"
            " ORDER BY rowid",
            (run_id, *chunk),
        ):
            source = DiscoveryRunSource.from_row(row)
            found.setdefault(source.beatport_track_id, []).append(source)
    return found
