#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where a playlist stands with matching and saving (G4 2.1, 2.2).

The types behind the Clean page's playlist list and the Save bar: counts of what
a person can do next, per playlist and for the whole library. They carry
numbers only; the SQL that finds them is ``persistence/match_status_repository``
and the rule for each is stated there.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass(frozen=True)
class StatusCounts:
    """What a set of tracks needs, as the Clean page counts it.

    Attributes:
        track_count: Distinct tracks in the set.
        not_matched: Tracks never matched.
        waiting: Waiting for the person: needs review, plus changed since they
            decided (the Match tab's own number).
        accepted: Tracks whose match is accepted.
        rejected: Tracks whose match the person rejected.
        no_match: Tracks Beatport had nothing for.
        unsaved: Tracks with new values not in the files yet.
    """

    track_count: int = 0
    not_matched: int = 0
    waiting: int = 0
    accepted: int = 0
    rejected: int = 0
    no_match: int = 0
    unsaved: int = 0


@dataclass(frozen=True)
class RunningMatch:
    """A match job's progress over a set of tracks.

    Attributes:
        job_id: The active match job.
        done: Planned tracks of the set already searched.
        total: Planned tracks of the set.
    """

    job_id: str
    done: int
    total: int


@dataclass(frozen=True)
class PlaylistNode:
    """One row of the Rekordbox tree, for naming the folders above a playlist."""

    id: int
    parent_id: Optional[int]
    name: str
    kind: str
    position: int


@dataclass(frozen=True)
class PlaylistStatus:
    """One playlist's name, place and counts.

    ``last_written_at`` is when a sync last put a value into one of its tracks'
    files (ISO text), if one still stands: a write that was undone does not count.
    """

    id: int
    name: str
    path: str
    counts: StatusCounts
    running: Optional[RunningMatch] = None
    last_written_at: Optional[str] = None


@dataclass(frozen=True)
class PlaylistStatuses:
    """Every playlist's status, and the whole library's."""

    playlists: Tuple[PlaylistStatus, ...]
    whole_library: StatusCounts
    whole_library_running: Optional[RunningMatch] = None
