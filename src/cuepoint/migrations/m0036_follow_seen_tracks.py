#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Which new tracks of a follow the user has seen (Discover's Following tab).

``seen_through`` is a day, so on its own it cannot tell a track Beatport listed
this morning (looked at) from one it lists this afternoon (not yet looked at),
and moving it to today would hide a track dated today that is first read after
a late look. ``follow_seen_tracks`` holds the exact answer: the Beatport track
ids a follow's mark-seen saw, dated after ``seen_through``. A track is new when
it is dated after ``seen_through`` and its id is not here.

Rows are dropped when a later mark moves ``seen_through`` past their date, and
with the follow (``ON DELETE CASCADE``; the repository also deletes them
explicitly). Nothing is backfilled: a follow marked seen before this migration
has no ids and keeps the old meaning, that releases after ``seen_through`` are
new.
"""

from __future__ import annotations

VERSION = 36

DESCRIPTION = "follows: the track ids each follow's mark-seen saw"

SQL = """
CREATE TABLE follow_seen_tracks (
    kind        TEXT    NOT NULL,
    beatport_id INTEGER NOT NULL,
    track_id    INTEGER NOT NULL,
    PRIMARY KEY (kind, beatport_id, track_id),
    FOREIGN KEY (kind, beatport_id) REFERENCES follows (kind, beatport_id)
        ON DELETE CASCADE
) WITHOUT ROWID;
"""
