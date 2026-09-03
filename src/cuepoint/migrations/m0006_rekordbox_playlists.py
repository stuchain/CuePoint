#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Mirror the Rekordbox playlist tree and its membership (DEC-031).

These two tables are **source data, not user data**. Import and refresh write
them; nothing else ever does. CuePoint's own Collections (Phase 6) are a
separate, editable concept in their own tables — a user editing a "playlist" in
CuePoint must never write here, because the next refresh would silently
overwrite it.

Structure is ``parent_id``, not the path
----------------------------------------
The step specification proposed keying nodes on a unique ``Folder/Sub/Playlist``
path. A real export rules that out: four playlists in one collection are named
``stoa w/ deer``, ``dybbuk 11.12.25 w/ u.nid (rezo)``, ``COZMO_11/02`` and
``COZMO_3/03``. A name may contain the separator, so a path string cannot be
split back into segments, and two different trees can produce the same path — a
folder ``A/B`` holding ``C``, and a folder ``A`` holding ``B/C``. A UNIQUE
constraint on the path would therefore reject a legal Rekordbox tree at import.

So ``parent_id`` is the structure: a real foreign key, self-referential,
cascading, and impossible to orphan. ``rekordbox_path`` is kept beside it as a
derived, **non-unique** convenience column — it is what the CLI's ``--playlist``
and the existing ``parse_playlist_tree()`` already speak, and Phase 4 wants it
for display and search — but nothing structural depends on it. ``depth`` is
stored for the same reason: it lets a tree be rendered, and a child's parent be
resolved during import, without parsing a path that may not be parseable.

Ordering is data
----------------
``position`` on both tables records document order, and a DJ's playlist order is
meaningful — it is a set list, not a rendering detail. Membership is keyed on
``(playlist_id, position)`` rather than carrying a surrogate id, which makes the
ordering an enforced property rather than a convention, and still allows the
same track to appear twice in one playlist (19 playlists in that same export
do).

Why a CHECK constraint here when migration 0005 refused one
-----------------------------------------------------------
0005 avoided ``CHECK`` because SQLite cannot drop one without rebuilding the
table, and that table holds the user's library. These two tables are a mirror:
every row is rebuilt from the XML on the next import, so a future rebuild
migration costs nothing but the DDL. The constraint is worth having — ``kind``
is a two-valued discriminator, and a typo would otherwise sit in the database
until something quietly failed to find a folder.

Both foreign keys cascade. A track deleted because it left Rekordbox (DEC-003)
takes its playlist membership with it; membership rows for a track that no
longer exists would be unreachable. This relies on ``PRAGMA foreign_keys``,
which ``DatabaseService`` enables per connection.
"""

from __future__ import annotations

VERSION = 6

DESCRIPTION = "Rekordbox playlist tree and membership"

SQL = """
CREATE TABLE rekordbox_playlists (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id      INTEGER REFERENCES rekordbox_playlists(id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    kind           TEXT    NOT NULL CHECK (kind IN ('folder', 'playlist')),
    depth          INTEGER NOT NULL,
    position       INTEGER NOT NULL,
    rekordbox_path TEXT    NOT NULL,
    parent_path    TEXT,
    track_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_rekordbox_playlists_parent
    ON rekordbox_playlists (parent_id, position);

CREATE INDEX idx_rekordbox_playlists_path
    ON rekordbox_playlists (rekordbox_path);

CREATE TABLE rekordbox_playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES rekordbox_playlists(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, position)
);

CREATE INDEX idx_rekordbox_playlist_tracks_track
    ON rekordbox_playlist_tracks (track_id);
"""
