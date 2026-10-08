#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Play history: the play counts each import and refresh read (STATS-01, DEC-137).

Rekordbox's ``PlayCount`` is the only thing CuePoint knows about what a DJ has
been playing, and ``tracks.play_count`` holds only the latest value: a refresh
overwrites it, so "what did I play since June" has no answer once the file has
been read again. Two tables beside ``tracks`` keep the answer from the next
refresh on. Nothing is read from Rekordbox's own database and nothing in
CuePoint edits a row here.

``library_reads``
-----------------
One row per import or refresh, **whether or not anything changed**, so the page
knows when history starts and when the counts were last read:

- ``read_at``: the UTC time CuePoint read the file. The XML carries no export
  date, so this is the only honest one;
- ``kind``: ``import``, ``refresh``, or ``seed`` for the one row this migration
  writes;
- ``tracks``: the tracks in the library after the read;
- ``changed``: the ``play_counts`` rows that read stored.

``play_counts``
---------------
One row per track whose count moved at a read, keyed by ``(track_id, read_id)``.
Only known counts are stored: a count that becomes unknown stores nothing, and
one that becomes known again stores its value. It cascades with its track, so a
refresh that removes a track removes its history quietly (DEC-137), and it is
not a DEC-011 reference. An index on ``read_id`` answers "what did this read
store" without scanning every track's history.

The baseline is seeded (DEC-168)
--------------------------------
A library imported before this migration has counts but no history. When a
``library_source`` row exists, this migration inserts one ``seed`` read dated by
the most recent import and copies every known ``tracks.play_count`` into it, so
the plays between that import and the first refresh are kept. A library that
was never imported gets no seed: its first import stores every known count
itself, found as "no ``library_reads`` row yet". The baseline is the only read
that stores unchanged counts.

Nothing is rebuilt
------------------
Two tables are added and no existing table is touched. Both are in the file a
launch backup copies, so a restore brings the history back with everything else.

``play_counts`` cascades from ``tracks``, so any future migration that rebuilds
``tracks`` must preserve play history: ``DROP TABLE`` performs an implicit
``DELETE`` and the cascade empties ``play_counts`` (see the note in m0025).
"""

from __future__ import annotations

VERSION = 27

DESCRIPTION = "play history: the play counts each import and refresh read"

SQL = """
CREATE TABLE library_reads (
    id      INTEGER PRIMARY KEY,
    read_at TEXT    NOT NULL,
    kind    TEXT    NOT NULL CHECK (kind IN ('import', 'refresh', 'seed')),
    tracks  INTEGER NOT NULL DEFAULT 0,
    changed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE play_counts (
    track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    read_id    INTEGER NOT NULL REFERENCES library_reads(id),
    play_count INTEGER NOT NULL,
    PRIMARY KEY (track_id, read_id)
) WITHOUT ROWID;

CREATE INDEX idx_play_counts_read ON play_counts(read_id);

INSERT INTO library_reads (read_at, kind, tracks, changed)
SELECT
    (SELECT imported_at FROM library_source ORDER BY id DESC LIMIT 1),
    'seed',
    (SELECT COUNT(*) FROM tracks),
    (SELECT COUNT(*) FROM tracks WHERE play_count IS NOT NULL)
WHERE EXISTS (SELECT 1 FROM library_source);

INSERT INTO play_counts (track_id, read_id, play_count)
SELECT t.id, r.id, t.play_count
FROM tracks t, library_reads r
WHERE r.kind = 'seed' AND t.play_count IS NOT NULL;
"""
