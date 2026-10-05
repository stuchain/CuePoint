#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Each track's cue points and beat grid, read from Rekordbox (WAVE-04, DEC-118).

Two tables beside ``tracks``, written by the import and the refresh from the
``POSITION_MARK`` and ``TEMPO`` children of each ``COLLECTION/TRACK``, and by a
one-time backfill for a library imported before them. Nothing in CuePoint edits
a row here, and the export never reads them: it patches the source XML, which
already holds every mark (DEC-077).

``track_cues``
--------------
One row per ``POSITION_MARK`` CuePoint could read, in document order:

- ``position``: its place among the track's kept marks, from zero;
- ``kind``: Rekordbox's ``Type`` 0–4 as ``cue``, ``fade_in``, ``fade_out``,
  ``load`` or ``loop``;
- ``hot_cue``: ``Num`` 0–7 for hot cues A–H, NULL for a memory cue;
- ``start_ms`` and ``end_ms``: ``Start`` and ``End`` in whole milliseconds;
  ``end_ms`` only where Rekordbox gave one, and always after ``start_ms``;
- ``name``: as Rekordbox wrote it, NULL for none;
- ``color``: ``#rrggbb`` from ``Red``, ``Green`` and ``Blue``, NULL for none.

``track_beat_grid``
-------------------
One row per ``TEMPO``, in document order: several are a variable grid.
``start_ms`` is ``Inizio``, ``bpm`` is ``Bpm``, ``meter`` is ``Metro`` and
``beat`` is ``Battito``, the beat of the bar the marker falls on.

Why ``kind`` is checked here
----------------------------
PREP-01 left a Set's ``warning`` unchecked, because that vocabulary is
CuePoint's own and grows with it. This one is Rekordbox's. A mark type CuePoint
does not know is skipped and counted by the reader, never stored under a
guess, and the ``CHECK`` is the backstop for that rule.

Keyed by track and position, as the grid is
-------------------------------------------
The specification gave ``track_cues`` an ``AUTOINCREMENT`` id beside a unique
``(track_id, position)``. Nothing references a cue by id, and a refresh
replaces a track's marks whole, so such an id would change every time and
could never be a key anything kept. Without it the table is one B-tree keyed
the way it is read: measured at 350,000 cues, writing them takes 15% less time
and the table a third less space, in the file every launch backup copies.

Nothing is rebuilt
------------------
Two tables are added and no existing table is touched. Both cascade with their
track, so a refresh that removes a track removes its marks, and a launch backup
holds them like every other row. Whether a library's marks have been read at
all is a ``derived_indexes`` row, ``track_marks``, written in the same
transaction as the marks; this migration writes none, so a library upgraded
from version 25 has its marks read from its source by the backfill.
"""

from __future__ import annotations

VERSION = 26

DESCRIPTION = "track marks: cue points and beat grids read from Rekordbox"

SQL = """
CREATE TABLE track_cues (
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind     TEXT    NOT NULL CHECK (kind IN ('cue', 'fade_in', 'fade_out', 'load', 'loop')),
    hot_cue  INTEGER CHECK (hot_cue IS NULL OR hot_cue BETWEEN 0 AND 7),
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms   INTEGER CHECK (end_ms IS NULL OR end_ms > start_ms),
    name     TEXT,
    color    TEXT CHECK (color IS NULL OR length(color) = 7),
    PRIMARY KEY (track_id, position)
) WITHOUT ROWID;

CREATE TABLE track_beat_grid (
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    bpm      REAL    NOT NULL CHECK (bpm > 0),
    meter    TEXT,
    beat     INTEGER CHECK (beat IS NULL OR beat BETWEEN 1 AND 4),
    PRIMARY KEY (track_id, position)
) WITHOUT ROWID;
"""
