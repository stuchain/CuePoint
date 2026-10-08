#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Give a test's tracks Beatport's key (PAGES-15, DEC-201).

A track's key is its accepted match's Beatport key, so a test that wants a track
with a key has to give it a match. These write the rows the matcher would have:
an attempt, a candidate carrying the key, and an accepted state pointing at it.
"""

from __future__ import annotations

from typing import Any, Optional


def accept_with_key(
    database: Any, track_id: int, key: Optional[str], *, decided_by: str = "auto"
) -> int:
    """Accept a match for ``track_id`` whose Beatport track has ``key``.

    Args:
        database: A database service (``transaction()`` and ``connect()``).
        track_id: A library track.
        key: The candidate's key, as Beatport writes it ("A Minor", "8A").
        decided_by: ``auto`` or ``user``.

    Returns:
        The candidate's id.
    """
    with database.transaction(join_existing=True) as conn:
        attempt = conn.execute(
            "INSERT INTO match_attempts (track_id, started_at, finished_at,"
            " outcome, input_json) VALUES (?, 't', 't', 'matched', '{}')",
            (track_id,),
        ).lastrowid
        candidate = conn.execute(
            "INSERT INTO match_candidates (attempt_id, rank, beatport_track_id,"
            " url, key, score, guard_ok, is_winner)"
            " VALUES (?, 0, ?, ?, ?, 96, 1, 1)",
            (
                attempt,
                f"bp{track_id}",
                f"https://www.beatport.com/track/t/{track_id}",
                key,
            ),
        ).lastrowid
        conn.execute(
            "INSERT OR REPLACE INTO track_match (track_id, state, decided_by,"
            " attempt_id, candidate_id, decided_at)"
            " VALUES (?, 'accepted', ?, ?, ?, 't')",
            (track_id, decided_by, attempt, candidate),
        )
        return int(candidate or 0)
