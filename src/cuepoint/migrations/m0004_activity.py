#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Create the activity feed and per-track field history tables.

Two related but distinct records:

- ``activity_events`` is the user-readable feed: "Rekordbox refresh — 42 added".
  It is not the debug log, which stays in files.
- ``track_history`` is the per-field audit behind DEC-008: every metadata change
  with its old and new value, so a user can see what CuePoint did to a track and
  put a single field back.

Both are **append-only**. A revert writes a new row restoring the previous
value; it never edits or deletes the row it came from. History that can be
rewritten cannot be trusted, and explaining what happened is the point.

``track_history`` cascades on track delete: DEC-003 removes a track outright
when it leaves Rekordbox, and history for a track that no longer exists would
be unreachable rows. This is the first schema to rely on foreign keys, which
``DatabaseService`` enables per connection.

Values are stored as JSON so a reverted field comes back with its original type
rather than as a string that has to be guessed back into a float.
"""

from __future__ import annotations

VERSION = 4

DESCRIPTION = "activity feed and track field history"

SQL = """
CREATE TABLE activity_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL,
    summary     TEXT    NOT NULL,
    detail_json TEXT,
    created_at  TEXT    NOT NULL
);

CREATE INDEX idx_activity_events_created_at ON activity_events (created_at DESC);

CREATE INDEX idx_activity_events_type ON activity_events (type);

CREATE TABLE track_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id       INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    field          TEXT    NOT NULL,
    old_value_json TEXT,
    new_value_json TEXT,
    source         TEXT    NOT NULL,
    changed_at     TEXT    NOT NULL
);

CREATE INDEX idx_track_history_track_id ON track_history (track_id, changed_at DESC);
"""
