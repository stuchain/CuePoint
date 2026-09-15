#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for writing tags to files: what to write, and the record of it (CLEAN-10).

Two halves.

**What a write reads.** :meth:`FileWriteRepository.targets` answers, per track,
the values a write would put into its file and whether the file was found there:
the effective key, BPM, genre, label and year — ``COALESCE`` of CuePoint's
override over Rekordbox's column, exactly as the rule vocabulary reads them
(``models/filter_rule.py``, DEC-068) — and the file check for the track's path.
An accepted but unapplied match is not an override, so it changes nothing here
(DEC-070).

**The record.** ``file_writes`` is append-only in what it claims: a row is
inserted before the file is touched, and afterwards only its ``pending`` flag,
the value read back, and a failure are set on it. Nothing deletes one. A row
names its track while the track exists; one inserted for a track a refresh has
just removed is kept with a null track, as ``ON DELETE SET NULL`` would have
left it, because the file was still written.

Transactions join a caller's, as everywhere here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from cuepoint.models.file_status import FILE_NOT_CHECKED
from cuepoint.models.file_write import WRITE_FAILED, WRITE_WRITTEN, FileWrite
from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.services.interfaces import IDatabaseService, IFileWriteRepository

_COLUMNS = (
    "id",
    "job_id",
    "track_id",
    "file_path",
    "field",
    "old_value_json",
    "new_value_json",
    "outcome",
    "reason",
    "written_at",
    "pending",
    "restore_of",
)

_SELECT = f"SELECT {', '.join(_COLUMNS)} FROM file_writes"

# The track id is looked up rather than bound, so a row for a track that has
# just left the library is stored against no track instead of failing its
# foreign key and taking the record of a real write with it.
_INSERT = (
    "INSERT INTO file_writes (job_id, track_id, file_path, field, old_value_json,"
    " new_value_json, outcome, reason, written_at, pending, restore_of)"
    " VALUES (?, (SELECT id FROM tracks WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

# A write is restorable until a restore of it is confirmed. A pending restore
# may not have happened, and a skipped or failed one did not.
_RESTORABLE = (
    f"{_SELECT} AS w WHERE w.outcome = 'written' AND {{scope}}"
    " AND NOT EXISTS (SELECT 1 FROM file_writes AS r WHERE r.restore_of = w.id"
    " AND r.outcome = 'restored' AND r.pending = 0)"
    " ORDER BY w.id DESC"
)

_TARGETS = (
    "SELECT tracks.id AS track_id, tracks.file_path AS file_path,"
    " COALESCE(meta.key, tracks.key) AS key,"
    " COALESCE(meta.bpm, tracks.bpm) AS bpm,"
    " COALESCE(meta.genre, tracks.genre) AS genre,"
    " COALESCE(meta.label, tracks.label) AS label,"
    " COALESCE(meta.year, tracks.year) AS year,"
    " files.status AS file_status, files.checked_path AS checked_path"
    " FROM tracks"
    " LEFT JOIN track_metadata AS meta ON meta.track_id = tracks.id"
    " LEFT JOIN track_files AS files ON files.track_id = tracks.id"
    " WHERE tracks.id IN ({placeholders})"
)


def _scope(
    job_id: Optional[str], track_id: Optional[int], alias: str = "file_writes"
) -> Tuple[str, object]:
    """The WHERE clause naming a job's or a track's rows, and its one parameter.

    Raises:
        ValueError: Unless exactly one of the two is given.
    """
    if (job_id is None) == (track_id is None):
        raise ValueError("Name a job or a track, not both or neither")
    if job_id is not None:
        return f"{alias}.job_id = ?", str(job_id)
    return f"{alias}.track_id = ?", int(track_id)  # type: ignore[arg-type]


@dataclass(frozen=True)
class TagTarget:
    """A track as a tag write sees it: its file and its effective values.

    Attributes:
        track_id: The library track.
        file_path: Its path as the library holds it now.
        key, bpm, genre, label, year: Effective values; None when neither
            layer has one.
        file_status: What the last file check found, or None if never checked.
        checked_path: The path that check looked at.
    """

    track_id: int
    file_path: str
    key: Optional[str] = None
    bpm: Optional[float] = None
    genre: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None
    file_status: Optional[str] = None
    checked_path: Optional[str] = None

    @property
    def current_file_status(self) -> str:
        """The check's answer for the path the track has now (CLEAN-07's rule).

        ``not_checked`` when the file was never checked, or was checked at a
        path a refresh has since changed.
        """
        if (
            self.file_status is None
            or not self.file_path
            or self.checked_path != self.file_path
        ):
            return FILE_NOT_CHECKED
        return self.file_status


class FileWriteRepository(IFileWriteRepository):
    """Persistence for tag writes to files."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # ------------------------------------------------------------------ read

    def targets(self, track_ids: Iterable[int]) -> List[TagTarget]:
        """Return the tracks that exist, once each, in the order given."""
        wanted = unique_ids(track_ids)
        found: Dict[int, TagTarget] = {}
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            for row in connection.execute(
                _TARGETS.format(placeholders=placeholders), chunk
            ):
                target = TagTarget(
                    track_id=int(row["track_id"]),
                    file_path=str(row["file_path"] or ""),
                    key=row["key"],
                    bpm=None if row["bpm"] is None else float(row["bpm"]),
                    genre=row["genre"],
                    label=row["label"],
                    year=None if row["year"] is None else int(row["year"]),
                    file_status=row["file_status"],
                    checked_path=row["checked_path"],
                )
                found[target.track_id] = target
        return [found[track_id] for track_id in wanted if track_id in found]

    def get(self, write_id: int) -> Optional[FileWrite]:
        """Return one row, or None."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT} WHERE id = ?", (int(write_id),))
            .fetchone()
        )
        return None if row is None else FileWrite.from_row(row)

    def for_job(self, job_id: str) -> List[FileWrite]:
        """Every row a job recorded, in the order it recorded them."""
        return [
            FileWrite.from_row(row)
            for row in self._db.connect().execute(
                f"{_SELECT} WHERE job_id = ? ORDER BY id", (str(job_id),)
            )
        ]

    def for_track(self, track_id: int) -> List[FileWrite]:
        """Every row recorded for a track, in the order recorded."""
        return [
            FileWrite.from_row(row)
            for row in self._db.connect().execute(
                f"{_SELECT} WHERE track_id = ? ORDER BY id", (int(track_id),)
            )
        ]

    def restorable(
        self, *, job_id: Optional[str] = None, track_id: Optional[int] = None
    ) -> List[FileWrite]:
        """The writes of a job, or of a track, not yet restored — newest first.

        Raises:
            ValueError: Unless exactly one of ``job_id`` and ``track_id`` is given.
        """
        if (job_id is None) == (track_id is None):
            raise ValueError("Name a job or a track to restore, not both or neither")
        if job_id is not None:
            sql, value = _RESTORABLE.format(scope="w.job_id = ?"), str(job_id)
            parameters: Sequence[object] = (value,)
        else:
            sql = _RESTORABLE.format(scope="w.track_id = ?")
            parameters = (int(track_id),)  # type: ignore[arg-type]
        return [
            FileWrite.from_row(row)
            for row in self._db.connect().execute(sql, tuple(parameters))
        ]

    def page(
        self,
        *,
        job_id: Optional[str] = None,
        track_id: Optional[int] = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> List[FileWrite]:
        """One page of a job's or a track's rows, in the order recorded (CLEAN-11).

        A write over a whole library records a row per field per file, so the
        record is read a page at a time rather than whole.

        Raises:
            ValueError: Unless exactly one of ``job_id`` and ``track_id`` is given.
        """
        scope, parameter = _scope(job_id, track_id)
        return [
            FileWrite.from_row(row)
            for row in self._db.connect().execute(
                f"{_SELECT} WHERE {scope} ORDER BY id LIMIT ? OFFSET ?",
                (parameter, max(1, int(limit)), max(0, int(offset))),
            )
        ]

    def counts(
        self, *, job_id: Optional[str] = None, track_id: Optional[int] = None
    ) -> Tuple[int, int]:
        """``(rows, unconfirmed rows)`` a job or a track recorded (CLEAN-11).

        Raises:
            ValueError: Unless exactly one of ``job_id`` and ``track_id`` is given.
        """
        scope, parameter = _scope(job_id, track_id)
        row = (
            self._db.connect()
            .execute(
                "SELECT count(*) AS n, COALESCE(SUM(pending), 0) AS pending"
                f" FROM file_writes WHERE {scope}",
                (parameter,),
            )
            .fetchone()
        )
        return int(row["n"]), int(row["pending"])

    def restorable_counts(
        self, *, job_id: Optional[str] = None, track_id: Optional[int] = None
    ) -> Tuple[int, int]:
        """``(writes a restore would undo, of those unconfirmed)``, counted in SQL.

        The same rows as :meth:`restorable`, without reading them.

        Raises:
            ValueError: Unless exactly one of ``job_id`` and ``track_id`` is given.
        """
        scope, parameter = _scope(job_id, track_id, alias="w")
        row = (
            self._db.connect()
            .execute(
                "SELECT count(*) AS n, COALESCE(SUM(w.pending), 0) AS pending"
                f" FROM file_writes AS w WHERE w.outcome = 'written' AND {scope}"
                " AND NOT EXISTS (SELECT 1 FROM file_writes AS r"
                " WHERE r.restore_of = w.id AND r.outcome = 'restored'"
                " AND r.pending = 0)",
                (parameter,),
            )
            .fetchone()
        )
        return int(row["n"]), int(row["pending"])

    # ----------------------------------------------------------------- write

    def record(self, rows: Sequence[FileWrite]) -> List[int]:
        """Insert rows, and return their ids in the order given.

        Raises:
            ValueError: If a row already has an id.
        """
        ids: List[int] = []
        if not rows:
            return ids
        with self._db.transaction(join_existing=True) as conn:
            for row in rows:
                if row.id is not None:
                    raise ValueError("A recorded row is never recorded again")
                cursor = conn.execute(
                    _INSERT,
                    (
                        row.job_id,
                        row.track_id,
                        row.file_path,
                        row.field,
                        row.old_value_json,
                        row.new_value_json,
                        row.outcome,
                        row.reason,
                        row.written_at,
                        1 if row.pending else 0,
                        row.restore_of,
                    ),
                )
                ids.append(int(cursor.lastrowid or 0))
        return ids

    def confirm(self, write_id: int, new_value_json: Optional[str]) -> bool:
        """Mark a pending row done, with the value the file was read back holding.

        Returns:
            True when a pending row was updated.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE file_writes SET pending = 0, new_value_json = ?"
                " WHERE id = ? AND pending = 1",
                (new_value_json, int(write_id)),
            )
            return cursor.rowcount == 1

    def fail(self, write_id: int, reason: str) -> bool:
        """Mark a pending row as a write or restore that did not happen.

        Returns:
            True when a pending row was updated.

        Raises:
            ValueError: If the reason is blank.
        """
        if not reason or not reason.strip():
            raise ValueError("A failed write must say why")
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "UPDATE file_writes SET pending = 0, outcome = ?, reason = ?"
                " WHERE id = ? AND pending = 1",
                (WRITE_FAILED, reason, int(write_id)),
            )
            return cursor.rowcount == 1

    def pending_count(self) -> int:
        """How many rows record a write or restore that may not have happened."""
        row = (
            self._db.connect()
            .execute("SELECT count(*) AS n FROM file_writes WHERE pending = 1")
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0


__all__: Sequence[str] = ("FileWriteRepository", "TagTarget", "WRITE_WRITTEN")
