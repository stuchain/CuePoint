#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Create the library tracks table.

Columns mirror :class:`cuepoint.models.library_track.LibraryTrack`.

Indexes exist to serve the two identity lookups from DEC-002:

- ``rekordbox_track_id`` is UNIQUE — it is the primary identity, and two library
  rows claiming the same Rekordbox track would make a refresh ambiguous.
- ``normalized_path`` is indexed but **not** unique: the fallback lookup needs
  it to be fast, but a library legitimately can contain rows whose path is
  unknown (empty) or, after a file move, temporarily duplicated.
"""

from __future__ import annotations

VERSION = 2

DESCRIPTION = "library tracks table"

SQL = """
CREATE TABLE tracks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    rekordbox_track_id  TEXT    NOT NULL,
    file_path           TEXT    NOT NULL DEFAULT '',
    normalized_path     TEXT    NOT NULL DEFAULT '',
    title               TEXT    NOT NULL DEFAULT '',
    artist              TEXT    NOT NULL DEFAULT '',
    remixer             TEXT,
    album               TEXT,
    label               TEXT,
    genre               TEXT,
    key                 TEXT,
    bpm                 REAL,
    year                INTEGER,
    duration_seconds    INTEGER,
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL
);

CREATE UNIQUE INDEX idx_tracks_rekordbox_track_id
    ON tracks (rekordbox_track_id);

CREATE INDEX idx_tracks_normalized_path
    ON tracks (normalized_path);
"""
