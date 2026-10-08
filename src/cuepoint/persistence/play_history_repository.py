#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Play history repository: SQL for ``library_reads`` and ``play_counts`` (STATS-01).

Small on purpose. The ``play_counts`` rows are written by
:meth:`TrackRepository.upsert_many_from_rekordbox`, which is already holding the
old and the new count of every track; this repository owns the other half, the
``library_reads`` row each import and refresh leaves (DEC-137). Both methods
join the transaction the caller has open, so a read exists only when the write
it describes committed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from cuepoint.services.interfaces import IDatabaseService, IPlayHistoryRepository


@dataclass(frozen=True)
class LibraryRead:
    """One row of ``library_reads``.

    Attributes:
        id: The read's key, which ``play_counts`` rows point at.
        read_at: When CuePoint read the file, UTC ISO-8601.
        kind: ``import``, ``refresh`` or ``seed``.
        tracks: Tracks in the library after the read.
        changed: ``play_counts`` rows the read stored.
    """

    id: int
    read_at: str
    kind: str
    tracks: int
    changed: int


class PlayHistoryRepository(IPlayHistoryRepository):
    """Records that the library was read, and reads the record back."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    def has_reads(self) -> bool:
        """Whether any import, refresh or seed has been recorded.

        ``False`` is what makes the next read the baseline (DEC-168): the only
        one that stores counts that did not change.
        """
        row = self._db.connect().execute("SELECT 1 FROM library_reads LIMIT 1")
        return row.fetchone() is not None

    def start_read(self, kind: str, read_at: str) -> int:
        """Insert a read with nothing counted yet, and return its id.

        Inserted at the start of the write so the ``play_counts`` rows it stores
        have something to point at; :meth:`finish_read` fills in the totals.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "INSERT INTO library_reads (read_at, kind) VALUES (?, ?)",
                (read_at, kind),
            )
            return int(cursor.lastrowid or 0)

    def finish_read(self, read_id: int, *, tracks: int, changed: int) -> None:
        """Record how many tracks the library held after the read and how many
        counts it stored."""
        with self._db.transaction(join_existing=True) as conn:
            conn.execute(
                "UPDATE library_reads SET tracks = ?, changed = ? WHERE id = ?",
                (tracks, changed, read_id),
            )

    def reads(self) -> List[LibraryRead]:
        """Every read, oldest first."""
        rows = self._db.connect().execute(
            "SELECT id, read_at, kind, tracks, changed FROM library_reads ORDER BY id"
        )
        return [
            LibraryRead(
                id=int(r["id"]),
                read_at=str(r["read_at"]),
                kind=str(r["kind"]),
                tracks=int(r["tracks"]),
                changed=int(r["changed"]),
            )
            for r in rows
        ]

    def counts_for(self, track_id: int) -> List[Tuple[int, int]]:
        """``(read_id, play_count)`` for one track, oldest read first."""
        rows = self._db.connect().execute(
            "SELECT read_id, play_count FROM play_counts WHERE track_id = ?"
            " ORDER BY read_id",
            (track_id,),
        )
        return [(int(r["read_id"]), int(r["play_count"])) for r in rows]
