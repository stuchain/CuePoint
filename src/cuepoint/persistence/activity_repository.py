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
from typing import Any, Dict, List, Optional, Sequence, Tuple

from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
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

    ``batch_id`` is set when the change was one of many applied by a single
    action (DEC-063), and ``None`` when a user changed one field on one track.
    It is what lets a whole batch be looked at — and one day taken back — as the
    thing the user actually did, rather than as forty thousand unrelated edits
    that happen to share a timestamp.
    """

    track_id: int
    field_name: str
    old_value: Any
    new_value: Any
    source: str
    changed_at: str = ""
    id: Optional[int] = None
    batch_id: Optional[str] = None

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
            batch_id=data.get("batch_id"),
        )


class ActivityRepository(IActivityRepository):
    """Appends and reads activity events and track field history."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    # --------------------------------------------------------------- activity

    def add_event(self, event: ActivityEvent) -> ActivityEvent:
        """Append an activity event.

        Joins an open transaction rather than refusing one (see
        :meth:`add_field_change`), so an event describing work that is rolled
        back is rolled back with it.
        """
        with self._db.transaction(join_existing=True) as conn:
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
        """Append a field change to a track's history.

        **Joins an open transaction** (``join_existing=True``), which matters
        for two reasons that point the same way.

        A history entry belongs to the change it describes. Written in its own
        transaction, it commits even when the write it records is rolled back —
        leaving a log that claims something happened to a track that nothing
        happened to. Joining makes the record and the change succeed or fail as
        one thing.

        And it is the only way a bulk edit can be written at all. ORG-03 assigns
        a tag to twelve thousand tracks in one transaction and records each one;
        DEC-063's batches do the same at forty times that size. Before this,
        a history write inside an open transaction raised
        ``DB_NESTED_TRANSACTION`` — found by ORG-03, fixed here rather than
        worked around with a second connection.

        Where no transaction is open — every caller before Phase 6 — the
        behaviour is exactly as it was.
        """
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "INSERT INTO track_history"
                " (track_id, field, old_value_json, new_value_json, source,"
                "  changed_at, batch_id)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    change.track_id,
                    change.field_name,
                    _dumps(change.old_value),
                    _dumps(change.new_value),
                    change.source,
                    change.changed_at,
                    change.batch_id,
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
            batch_id=change.batch_id,
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

    # ---------------------------------------------------------------- batches

    def batch_change_ids(self, batch_id: str) -> List[int]:
        """Return the ids of every change in a batch, newest first (CLEAN-06).

        Ids rather than rows: a batch over a whole library applying five fields
        is a quarter of a million changes, and a revert reads them a chunk at a
        time. Ids only grow, so id order is the order they were written in, and
        ``idx_track_history_batch`` returns them in it.
        """
        rows = (
            self._db.connect()
            .execute(
                "SELECT id FROM track_history WHERE batch_id = ? ORDER BY id DESC",
                (str(batch_id),),
            )
            .fetchall()
        )
        return [int(row["id"]) for row in rows]

    def batch_field_counts(self, batch_id: str) -> Dict[str, int]:
        """Return how many changes a batch recorded per field.

        One question answers both things a revert checks before it starts:
        whether the batch recorded anything, and whether every field in it is
        one the revert can write.
        """
        rows = (
            self._db.connect()
            .execute(
                "SELECT field, count(*) AS n FROM track_history"
                " WHERE batch_id = ? GROUP BY field",
                (str(batch_id),),
            )
            .fetchall()
        )
        return {row["field"]: int(row["n"]) for row in rows}

    def get_field_changes(self, change_ids: Sequence[int]) -> List[TrackFieldChange]:
        """Return recorded changes in the order their ids were given.

        Ids that are not there are left out. Read in chunks, so a chunk-sized
        list never outgrows SQLite's parameter limit.
        """
        wanted = [int(change_id) for change_id in change_ids]
        found: Dict[int, TrackFieldChange] = {}
        connection = self._db.connect()
        for chunk in chunked(unique_ids(wanted), CHUNK_SIZE):
            placeholders = ", ".join("?" for _ in chunk)
            for row in connection.execute(
                f"SELECT * FROM track_history WHERE id IN ({placeholders})",
                tuple(chunk),
            ):
                change = TrackFieldChange.from_row(row)
                found[int(row["id"])] = change
        return [found[change_id] for change_id in wanted if change_id in found]

    def previous_change(
        self, track_id: int, field_name: str, before_change_id: int
    ) -> Optional[TrackFieldChange]:
        """Return the latest change to a track's field recorded before another.

        What a revert reads to learn where a value it is restoring came from:
        the change that set it, which says ``beatport`` or ``cuepoint``.
        """
        row = (
            self._db.connect()
            .execute(
                "SELECT * FROM track_history"
                " WHERE track_id = ? AND field = ? AND id < ?"
                " ORDER BY id DESC LIMIT 1",
                (int(track_id), str(field_name), int(before_change_id)),
            )
            .fetchone()
        )
        return TrackFieldChange.from_row(row) if row is not None else None

    def batch_events(self, batch_id: str) -> List[ActivityEvent]:
        """Return the activity events describing a batch, newest first.

        A batch's event carries its id in its detail (DEC-063). It is how a
        batch that recorded no history at all is still recognised: Collection
        membership writes none (ORG-04), so its event is the only trace of it.
        """
        rows = (
            self._db.connect()
            .execute(
                "SELECT * FROM activity_events"
                " WHERE json_extract(detail_json, '$.batch_id') = ?"
                " ORDER BY id DESC",
                (str(batch_id),),
            )
            .fetchall()
        )
        return [ActivityEvent.from_row(row) for row in rows]
