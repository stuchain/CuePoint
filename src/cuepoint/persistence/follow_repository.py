#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for followed artists and labels (migrations 0034 and 0036).

Every write runs in ``transaction(join_existing=True)``: on its own it commits,
and inside the follow service's transaction it joins it, so a change and the
activity event recording it succeed or fail together (DEC-008), as the
wantlist's do.
"""

from __future__ import annotations

from typing import List, Optional

from cuepoint.models.follow import Follow
from cuepoint.services.interfaces import IDatabaseService, IFollowRepository

_COLUMNS = "kind, beatport_id, name, followed_at, seen_through, seen_at"


class FollowRepository(IFollowRepository):
    """The artists and labels the user follows."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    def list(self) -> List[Follow]:
        """Every follow: artists first, then labels, each by name."""
        rows = self._db.connect().execute(
            f"SELECT {_COLUMNS} FROM follows"
            " ORDER BY kind, name COLLATE NOCASE, beatport_id"
        )
        return [Follow(**{c: r[c] for c in r.keys()}) for r in rows]

    def get(self, kind: str, beatport_id: int) -> Optional[Follow]:
        """One follow, or None."""
        row = (
            self._db.connect()
            .execute(
                f"SELECT {_COLUMNS} FROM follows WHERE kind = ? AND beatport_id = ?",
                (str(kind), int(beatport_id)),
            )
            .fetchone()
        )
        return None if row is None else Follow(**{c: row[c] for c in row.keys()})

    def add(self, follow: Follow) -> bool:
        """Follow; True when new. Following again changes nothing."""
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                f"INSERT OR IGNORE INTO follows ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    follow.kind,
                    follow.beatport_id,
                    follow.name,
                    follow.followed_at,
                    follow.seen_through,
                    follow.seen_at,
                ),
            )
            return cursor.rowcount > 0

    def remove(self, kind: str, beatport_id: int) -> bool:
        """Unfollow; True when it was followed."""
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "DELETE FROM follows WHERE kind = ? AND beatport_id = ?",
                (str(kind), int(beatport_id)),
            )
            return cursor.rowcount > 0

    def mark_seen(
        self,
        seen_through: str,
        kind: Optional[str] = None,
        beatport_id: Optional[int] = None,
        *,
        seen_at: Optional[str] = None,
    ) -> List[Follow]:
        """Move ``seen_through`` to a date, for one follow or all.

        Returns the follows whose ``seen_through`` it moved. It only ever moves
        forward: a date before the one stored changes nothing. ``seen_at``, when
        given, is stored on every follow whose date is not after
        ``seen_through``, moved or already there, so looking again the same day
        moves the moment without moving the day.

        Raises:
            ValueError: If only one of ``kind`` and ``beatport_id`` is given.
        """
        if (kind is None) != (beatport_id is None):
            raise ValueError(
                "Name a follow by kind and beatport_id together, or neither"
            )
        which = ""
        values: List[object] = []
        if kind is not None and beatport_id is not None:
            which = " AND kind = ? AND beatport_id = ?"
            values = [str(kind), int(beatport_id)]
        with self._db.transaction(join_existing=True) as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS} FROM follows WHERE seen_through < ?{which}",
                [str(seen_through), *values],
            ).fetchall()
            conn.execute(
                "UPDATE follows SET seen_through = ?,"
                f" seen_at = coalesce(?, seen_at) WHERE seen_through <= ?{which}",
                [str(seen_through), seen_at, str(seen_through), *values],
            )
        return [
            Follow(
                **{
                    **{c: r[c] for c in r.keys()},
                    "seen_through": seen_through,
                    "seen_at": seen_at if seen_at is not None else r["seen_at"],
                }
            )
            for r in rows
        ]
