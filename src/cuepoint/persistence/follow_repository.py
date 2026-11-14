#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for followed artists and labels (migrations 0034 and 0036).

Every write runs in ``transaction(join_existing=True)``: on its own it commits,
and inside the follow service's transaction it joins it, so a change and the
activity event recording it succeed or fail together (DEC-008), as the
wantlist's do.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, timedelta
from typing import List, Optional

from cuepoint.models.follow import Follow
from cuepoint.persistence.beatport_catalog_repository import _ENTITY_TRACK_IDS
from cuepoint.services.interfaces import IDatabaseService, IFollowRepository

_COLUMNS = "kind, beatport_id, name, followed_at, seen_through"


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
                f"INSERT OR IGNORE INTO follows ({_COLUMNS}) VALUES (?, ?, ?, ?, ?)",
                (
                    follow.kind,
                    follow.beatport_id,
                    follow.name,
                    follow.followed_at,
                    follow.seen_through,
                ),
            )
            return cursor.rowcount > 0

    def remove(self, kind: str, beatport_id: int) -> bool:
        """Unfollow; True when it was followed."""
        with self._db.transaction(join_existing=True) as conn:
            conn.execute(
                "DELETE FROM follow_seen_tracks WHERE kind = ? AND beatport_id = ?",
                (str(kind), int(beatport_id)),
            )
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
        until: Optional[str] = None,
    ) -> List[Follow]:
        """Move ``seen_through`` to a date and record the tracks seen, for one follow or all.

        ``seen_through`` only ever moves forward: a date before the one stored
        changes nothing. For every follow whose date is not after
        ``seen_through``, moved or already there, the ids of its cached tracks
        dated after ``seen_through`` and up to ``until`` are recorded as seen
        (nothing is recorded without ``until``), and the ids dated on or
        before ``seen_through`` are dropped.

        Returns the follows it changed: ``seen_through`` moved, or the stored
        ids did.

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
        changed: List[Follow] = []
        with self._db.transaction(join_existing=True) as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS} FROM follows WHERE seen_through <= ?{which}"
                " ORDER BY kind, name COLLATE NOCASE, beatport_id",
                [str(seen_through), *values],
            ).fetchall()
            for row in rows:
                follow = Follow(**{c: row[c] for c in row.keys()})
                moved = follow.seen_through < seen_through
                pruned = conn.execute(
                    "DELETE FROM follow_seen_tracks WHERE kind = ? AND beatport_id = ?"
                    " AND track_id NOT IN (SELECT beatport_track_id"
                    " FROM beatport_tracks WHERE release_date > ?)",
                    (follow.kind, follow.beatport_id, str(seen_through)),
                ).rowcount
                added = 0
                if until is not None:
                    added = conn.execute(
                        "INSERT OR IGNORE INTO follow_seen_tracks"
                        " (kind, beatport_id, track_id)"
                        " SELECT :kind, :id, b.beatport_track_id"
                        " FROM beatport_tracks AS b WHERE b.beatport_track_id IN"
                        f" ({_ENTITY_TRACK_IDS[follow.kind]})",
                        {
                            "kind": follow.kind,
                            "id": follow.beatport_id,
                            # `>= since` in the shared query: the day after.
                            "since": _day_after(str(seen_through)),
                            "until": str(until),
                        },
                    ).rowcount
                if moved:
                    conn.execute(
                        "UPDATE follows SET seen_through = ?"
                        " WHERE kind = ? AND beatport_id = ?",
                        (str(seen_through), follow.kind, follow.beatport_id),
                    )
                if moved or pruned > 0 or added > 0:
                    changed.append(replace(follow, seen_through=str(seen_through)))
        return changed


def _day_after(day: str) -> str:
    return (date.fromisoformat(day) + timedelta(days=1)).isoformat()
