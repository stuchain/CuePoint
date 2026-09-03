#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Add the DEC-034 track fields and the DEC-035 library source record.

Two unrelated-looking changes in one migration because they arrive together:
both are what a Phase 3 import needs to write, and both are additive.

DEC-034 — every useful Rekordbox field, now
-------------------------------------------
Rating, play count, colour, date added, comment and bitrate. Adding a column
later is cheap; *backfilling* one is not, because the only source for these
values is the user's Rekordbox export — every user would have to re-import their
whole collection to fill in a column added in a later release. These are the
fields Phase 4 sorts and filters by and Phase 6 organizes with, so they are
captured on the first import rather than the second.

DEC-034's seventh field, **total time, is deliberately not here**. ``tracks``
has held ``duration_seconds`` since migration 0002 and it is the same quantity,
so ``TotalTime`` is imported into that column instead (DEC-038). DEC-034 was
written without noticing the existing column; adding a second one would have
left the engine API exposing the empty one, and every phase after this one
choosing between two names for a track's length.

Every one is nullable, and none has a default. Rekordbox omits these attributes
freely, and the distinction matters: a track with no ``Rating`` attribute is
unrated, which is not the same thing as rated zero stars, and a missing
``PlayCount`` is unknown, not never-played. A ``DEFAULT 0`` here would
manufacture data the export never contained.

``rating`` holds the **star count**, 0-5. Rekordbox writes 0/51/102/153/204/255
in the XML; converting at the parser boundary (LIBRARY-02) means nothing
downstream has to know that encoding. ``date_added`` stays TEXT because that is
what Rekordbox writes (``YYYY-MM-DD``) and reformatting it would lose whatever
the export actually said.

DEC-035 — the library remembers where it came from
--------------------------------------------------
``library_source`` records the XML an import read: its path, its modified time
and size, when it was imported and what the import produced. A refresh re-reads
that file without asking, and the modified time and size are what let it say
"unchanged since the last import" or "that file has moved" instead of silently
re-importing something else.

Logically there is one row — the library is singular. It is a table rather than
a settings key so that a later release can keep a short import history without a
migration that moves data out of a config blob, which is also why this schema
does not pin the row with ``CHECK (id = 1)``: SQLite cannot drop a CHECK
constraint without rebuilding the table, so the constraint would cost exactly
the migration it was meant to avoid. Singularity is a property of the write
path, which replaces the record on each import; readers take the most recent
row.

``xml_modified_at`` and ``xml_size_bytes`` are nullable even though an import
knows both: a ``stat`` that fails on an unusual filesystem should cost the
refresh its "unchanged?" shortcut, not cost the user their import.
"""

from __future__ import annotations

VERSION = 5

DESCRIPTION = "DEC-034 track fields and the DEC-035 library source record"

SQL = """
ALTER TABLE tracks ADD COLUMN rating     INTEGER;

ALTER TABLE tracks ADD COLUMN play_count INTEGER;

ALTER TABLE tracks ADD COLUMN colour     TEXT;

ALTER TABLE tracks ADD COLUMN date_added TEXT;

ALTER TABLE tracks ADD COLUMN comment    TEXT;

ALTER TABLE tracks ADD COLUMN bitrate    INTEGER;

CREATE TABLE library_source (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    xml_path        TEXT    NOT NULL,
    xml_modified_at TEXT,
    xml_size_bytes  INTEGER,
    imported_at     TEXT    NOT NULL,
    track_count     INTEGER NOT NULL DEFAULT 0,
    playlist_count  INTEGER NOT NULL DEFAULT 0
);
"""
