#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for file checks: which paths to check, and what was found (CLEAN-07).

A check writes one row per track into ``track_files``, replacing the one before
it. The table answers "what was there when CuePoint last looked", and an older
look kept beside a newer one would be a second answer to that question.

A track deleted while its file was being checked is skipped, not raised. A
refresh may apply while a check runs (DEC-073 makes the check wait for a
refresh, not the other way round), and inserting a row for a track that is gone
would fail on its foreign key and take the rest of the chunk with it. So the
insert names the track in its own ``WHERE EXISTS``, and :meth:`record` says which
tracks it wrote so the caller can count the rest.

Transactions join a caller's, as everywhere here: a check commits a chunk of
rows at a time.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from cuepoint.models.file_status import (
    FILE_MISSING,
    REASON_ROOT_UNAVAILABLE,
    TrackFileStatus,
)
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.services.interfaces import IDatabaseService, IFileStatusRepository

_COLUMNS = ("track_id", "status", "checked_path", "size_bytes", "checked_at", "reason")

# `INSERT … SELECT … WHERE` rather than `VALUES`, so the row can name the track
# it belongs to. The WHERE is also what SQLite needs to tell this upsert's
# ON CONFLICT apart from a join's ON.
_RECORD = (
    f"INSERT INTO track_files ({', '.join(_COLUMNS)})"
    f" SELECT {', '.join('?' for _ in _COLUMNS)}"
    " WHERE EXISTS (SELECT 1 FROM tracks WHERE tracks.id = ?)"
    " ON CONFLICT (track_id) DO UPDATE SET "
    + ", ".join(f"{column} = excluded.{column}" for column in _COLUMNS[1:])
)


class FileStatusRepository(IFileStatusRepository):
    """Persistence for file checks."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    def existing(self, track_ids: Iterable[int]) -> List[int]:
        """Return the ids that are library tracks, once each, in the order given."""
        wanted = unique_ids(track_ids)
        found: Set[int] = set()
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            found.update(
                int(row["id"])
                for row in connection.execute(
                    f"SELECT id FROM tracks WHERE id IN ({placeholders})", chunk
                )
            )
        return [track_id for track_id in wanted if track_id in found]

    def library_ids(self) -> List[int]:
        """Return every library track's id, in id order."""
        return [
            int(row["id"])
            for row in self._db.connect().execute("SELECT id FROM tracks ORDER BY id")
        ]

    def paths(self, track_ids: Iterable[int]) -> List[Tuple[int, str]]:
        """Return ``(track id, file path)`` for the ids that are tracks.

        In the order given, once each. A track Rekordbox gave no location has
        an empty path, which is returned as it is: whether that can be checked
        is the service's question.
        """
        wanted = unique_ids(track_ids)
        found: Dict[int, str] = {}
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            for row in connection.execute(
                f"SELECT id, file_path FROM tracks WHERE id IN ({placeholders})", chunk
            ):
                found[int(row["id"])] = str(row["file_path"] or "")
        return [(track_id, found[track_id]) for track_id in wanted if track_id in found]

    def record(self, checks: Sequence[TrackFileStatus]) -> Set[int]:
        """Store each check, replacing the track's last one.

        Returns:
            The tracks written. A check for a track that is no longer in the
            library writes nothing and is not in the set.
        """
        written: Set[int] = set()
        if not checks:
            return written
        with self._db.transaction(join_existing=True) as conn:
            for check in checks:
                values = check.to_dict()
                cursor = conn.execute(
                    _RECORD,
                    (*(values[column] for column in _COLUMNS), check.track_id),
                )
                if cursor.rowcount == 1:
                    written.add(check.track_id)
        return written

    def refresh_size(
        self, track_id: int, checked_path: str, size_bytes: int, checked_at: str
    ) -> bool:
        """Record a present file's new size after CuePoint wrote to it (CLEAN-10).

        Only a row that found the file present at this same path is touched: a
        write does not make a missing file present, and a row for another path
        answers for another file.

        Returns:
            True when the row was updated.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE track_files SET size_bytes = ?, checked_at = ?"
                " WHERE track_id = ? AND checked_path = ? AND status = 'present'",
                (int(size_bytes), checked_at, int(track_id), checked_path),
            )
            return cursor.rowcount == 1

    def unavailable_paths(self) -> List[str]:
        """Return the paths the last check found on a root that was not there.

        Only a check of the path each track has now: a refresh that moved a
        track off a disconnected drive has answered for it, and its old finding
        is not a finding about the library any more (CLEAN-07's staleness rule).
        """
        return [
            str(row["checked_path"])
            for row in self._db.connect().execute(
                "SELECT f.checked_path FROM track_files AS f"
                " JOIN tracks AS t ON t.id = f.track_id"
                " AND f.checked_path = t.file_path"
                " WHERE f.status = ? AND f.reason = ?",
                (FILE_MISSING, REASON_ROOT_UNAVAILABLE),
            )
        ]

    def get(self, track_id: int) -> Optional[TrackFileStatus]:
        """Return a track's stored check, or ``None``."""
        row = (
            self._db.connect()
            .execute(
                f"SELECT {', '.join(_COLUMNS)} FROM track_files WHERE track_id = ?",
                (int(track_id),),
            )
            .fetchone()
        )
        return None if row is None else TrackFileStatus.from_row(row)


__all__: Sequence[str] = ("FileStatusRepository",)
