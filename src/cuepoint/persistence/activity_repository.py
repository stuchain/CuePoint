#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Activity repository: SQL for the activity feed and per-track field history.

Both tables are append-only. This repository exposes no update or delete for
either — the absence is the enforcement, and
``tests/unit/persistence/test_activity_append_only.py`` fails if one appears.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.services.interfaces import IActivityRepository, IDatabaseService

# Where a change came from. Kept as plain strings rather than an enum so a new
# source (an import adapter, an analysis pass) does not need a migration.
SOURCE_REKORDBOX = "rekordbox"
SOURCE_BEATPORT = "beatport"
SOURCE_CUEPOINT = "cuepoint"


def _dumps(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        # Fall back to a readable form rather than losing the entry entirely.
        return json.dumps(str(value))


def _loads(raw: Optional[str]) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return raw


@dataclass(frozen=True)
class ActivityEvent:
    """One entry in the user-readable activity feed."""

    type: str
    summary: str
    detail: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    id: Optional[int] = None

    @classmethod
    def from_row(cls, row: Any) -> "ActivityEvent":
        data = dict(row)
        detail = _loads(data.get("detail_json"))
        return cls(
            id=data["id"],
            type=data["type"],
            summary=data["summary"],
            detail=detail if isinstance(detail, dict) else {},
            created_at=data["created_at"],
        )


@dataclass(frozen=True)
class TrackFieldChange:
    """One recorded change to a single track field.

    ``old_value``/``new_value`` come back with the type they were stored with,
    so reverting a numeric field restores a number rather than a string.
    """

    track_id: int
    field_name: str
    old_value: Any
    new_value: Any
    source: str
    changed_at: str = ""
    id: Optional[int] = None

    @classmethod
    def from_row(cls, row: Any) -> "TrackFieldChange":
        data = dict(row)
        return cls(
            id=data["id"],
            track_id=data["track_id"],
            field_name=data["field"],
            old_value=_loads(data.get("old_value_json")),
            new_value=_loads(data.get("new_value_json")),
            source=data["source"],
            changed_at=data["changed_at"],
        )


class ActivityRepository(IActivityRepository):
    """Appends and reads activity events and track field history."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    # --------------------------------------------------------------- activity

    def add_event(self, event: ActivityEvent) -> ActivityEvent:
        """Append an activity event."""
        with self._db.transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO activity_events (type, summary, detail_json, created_at)"
                " VALUES (?, ?, ?, ?)",
                (
                    event.type,
                    event.summary,
                    _dumps(event.detail) if event.detail else None,
                    event.created_at,
                ),
            )
            new_id = int(cursor.lastrowid or 0)
        return ActivityEvent(
            id=new_id,
            type=event.type,
            summary=event.summary,
            detail=event.detail,
            created_at=event.created_at,
        )

    def recent_events(
        self, limit: int = 50, event_type: Optional[str] = None
    ) -> List[ActivityEvent]:
        """Return recent activity, newest first, optionally filtered by type."""
        sql = "SELECT * FROM activity_events"
        params: tuple = ()
        if event_type:
            sql += " WHERE type = ?"
            params = (event_type,)
        sql += " ORDER BY created_at DESC, id DESC LIMIT ?"
        params = (*params, int(limit))

        rows = self._db.connect().execute(sql, params).fetchall()
        return [ActivityEvent.from_row(row) for row in rows]

    def event_count(self) -> int:
        """Return the number of recorded activity events."""
        row = (
            self._db.connect()
            .execute("SELECT count(*) AS n FROM activity_events")
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    # ---------------------------------------------------------------- history

    def add_field_change(self, change: TrackFieldChange) -> TrackFieldChange:
        """Append a field change to a track's history."""
        with self._db.transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO track_history"
                " (track_id, field, old_value_json, new_value_json, source, changed_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (
                    change.track_id,
                    change.field_name,
                    _dumps(change.old_value),
                    _dumps(change.new_value),
                    change.source,
                    change.changed_at,
                ),
            )
            new_id = int(cursor.lastrowid or 0)
        return TrackFieldChange(
            id=new_id,
            track_id=change.track_id,
            field_name=change.field_name,
            old_value=change.old_value,
            new_value=change.new_value,
            source=change.source,
            changed_at=change.changed_at,
        )

    def history_for_track(
        self, track_id: int, limit: Optional[int] = None
    ) -> List[TrackFieldChange]:
        """Return a track's field history, newest first."""
        sql = (
            "SELECT * FROM track_history WHERE track_id = ?"
            " ORDER BY changed_at DESC, id DESC"
        )
        params: tuple = (track_id,)
        if limit is not None:
            sql += " LIMIT ?"
            params = (*params, int(limit))

        rows = self._db.connect().execute(sql, params).fetchall()
        return [TrackFieldChange.from_row(row) for row in rows]

    def get_field_change(self, change_id: int) -> Optional[TrackFieldChange]:
        """Return one recorded field change, or None."""
        row = (
            self._db.connect()
            .execute("SELECT * FROM track_history WHERE id = ?", (change_id,))
            .fetchone()
        )
        return TrackFieldChange.from_row(row) if row is not None else None

    def history_count(self, track_id: Optional[int] = None) -> int:
        """Return the number of recorded field changes."""
        sql = "SELECT count(*) AS n FROM track_history"
        params: Tuple[Any, ...] = ()
        if track_id is not None:
            sql += " WHERE track_id = ?"
            params = (track_id,)

        row = self._db.connect().execute(sql, params).fetchone()
        return int(row["n"]) if row is not None else 0
