#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Job repository: all SQL for the background ``jobs`` table.

Stores the durable record of a job — what kind it was, how it ended, when — so
job history survives an engine restart (DEC-007). In-flight state stays in
memory; this is a record, not a resumption point.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from cuepoint.services.interfaces import IDatabaseService, IJobRepository

# A job still marked running when the process starts again cannot be running:
# nothing survives the process that owned it.
INTERRUPTED_ERROR = {
    "code": "JOB_INTERRUPTED",
    "message": "Interrupted when CuePoint stopped",
}


@dataclass(frozen=True)
class JobRecord:
    """A persisted job record.

    Attributes:
        id: Job id (matches the in-memory job).
        type: Job kind, e.g. ``"match"``. A discriminator so future job kinds
            share this table.
        state: Job state value, e.g. ``"succeeded"``.
        demo: True for synthetic jobs used by Electron dev and tests.
        progress: Last recorded progress, if any.
        error: Error payload for a failed or interrupted job, if any.
        created_at: ISO-8601 UTC.
        updated_at: ISO-8601 UTC.
    """

    id: str
    type: str
    state: str
    demo: bool
    progress: Optional[Dict[str, Any]]
    error: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: Any) -> "JobRecord":
        data = dict(row)
        return cls(
            id=data["id"],
            type=data["type"],
            state=data["state"],
            demo=bool(data["demo"]),
            progress=_loads(data.get("progress_json")),
            error=_loads(data.get("error_json")),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )


def _loads(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _dumps(value: Optional[Dict[str, Any]]) -> Optional[str]:
    if value is None:
        return None
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        # A job record must never be the reason a run fails.
        return None


_UPSERT_SQL = """
INSERT INTO jobs (id, type, state, demo, progress_json, error_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    state         = excluded.state,
    progress_json = excluded.progress_json,
    error_json    = excluded.error_json,
    updated_at    = excluded.updated_at
"""


class JobRepository(IJobRepository):
    """Reads and writes durable job records."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    def save(self, record: JobRecord) -> None:
        """Insert or update a job record."""
        with self._db.transaction() as conn:
            conn.execute(
                _UPSERT_SQL,
                (
                    record.id,
                    record.type,
                    record.state,
                    1 if record.demo else 0,
                    _dumps(record.progress),
                    _dumps(record.error),
                    record.created_at,
                    record.updated_at,
                ),
            )

    def get(self, job_id: str) -> Optional[JobRecord]:
        """Return a job record by id, or None."""
        row = (
            self._db.connect()
            .execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
            .fetchone()
        )
        return JobRecord.from_row(row) if row is not None else None

    def list_recent(self, limit: int = 50) -> List[JobRecord]:
        """Return the most recent job records, newest first."""
        rows = (
            self._db.connect()
            .execute(
                "SELECT * FROM jobs ORDER BY created_at DESC, id DESC LIMIT ?",
                (int(limit),),
            )
            .fetchall()
        )
        return [JobRecord.from_row(row) for row in rows]

    def count(self) -> int:
        """Return the number of stored job records."""
        row = self._db.connect().execute("SELECT count(*) AS n FROM jobs").fetchone()
        return int(row["n"]) if row is not None else 0

    def mark_interrupted(self, updated_at: str) -> int:
        """Close out jobs left running by a previous process.

        A job recorded as queued or running when the engine starts cannot still
        be running — the process that owned it is gone. Left alone, those rows
        would misreport forever as in-flight.

        Returns:
            Number of records closed out.
        """
        with self._db.transaction() as conn:
            cursor = conn.execute(
                "UPDATE jobs SET state = ?, error_json = ?, updated_at = ? "
                "WHERE state IN ('queued', 'running')",
                ("failed", _dumps(INTERRUPTED_ERROR), updated_at),
            )
            return int(cursor.rowcount)
