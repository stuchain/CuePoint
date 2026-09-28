#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Set schema (PREP-01, Phase 10).

DEC-102 makes a Set a fourth kind of node in CuePoint's own tree, beside
``folder``, ``collection`` and ``smart``. Its entries are ``collection_tracks``
rows, ordered, and a track may repeat (DEC-017, DEC-058). What a Set has that a
Collection does not lives in four new tables: its notes, its chapters (DEC-103),
each entry's planned times, chapter and note (DEC-107), and the transition
warnings a user has acknowledged (DEC-106).

Why two tables are rebuilt
--------------------------
``collections.kind`` (m0009) and ``rekordbox_export_playlists.kind`` (m0020) are
closed vocabularies held by a ``CHECK``, and SQLite cannot change a ``CHECK`` in
place. Both tables are rebuilt with the vocabulary widened by ``'set'`` and
nothing else about their columns changed, so an exported Set is recorded as what
it was (DEC-086, DEC-109).

Why every row is set aside before anything is dropped
-----------------------------------------------------
The runner applies a migration inside one transaction, and ``PRAGMA
foreign_keys`` cannot be switched off inside a transaction. With it on,
``DROP TABLE`` first performs an implicit ``DELETE``, and deletes cascade:
dropping ``collections`` while ``collection_tracks`` still exists empties every
Collection a user has, and nothing could bring those entries back but a backup.
So all three tables are copied into plain tables first (not ``TEMP`` ones: every
statement stays in the one database the transaction covers), then dropped child
first (so dropping the nodes has no entries left to delete one by one), then
recreated and refilled with every id they had. ``sqlite_sequence`` is
restored for each, so an id handed out once is never handed out again, which is
the reason these tables are ``AUTOINCREMENT``. ``test_sets_schema`` shows the
cascade is real, and that this order is what stops it. The launch backup is taken
before any migration runs (FOUNDATION-11), so a copy of the database as it was
exists whatever happens here.

Each table is refilled by one ``INSERT … SELECT``, and SQLite checks an
immediate foreign key at the end of the statement, not after each row. That is
what lets a Collection moved into a folder created after it, which has a lower
id than its parent, be refilled in any order without deferring anything; the
upgrade test holds a library shaped like that.

The rebuilt tables' indexes are created after their rows are back, not before:
one sorted build is cheaper than keeping four indexes up to date one row at a
time. At 100,000 entries that took the refill of ``collection_tracks`` from about
one second to about two thirds of one. What is left is the foreign-key check on
every restored row, which the runner's transaction cannot switch off and which is
the point of keeping it on.

A Set's own data refers to a Set, and the database says so
----------------------------------------------------------
m0009's principle was that a schema holding data which exists nowhere else
should make mistakes impossible rather than merely unlikely. Three mistakes a
service could make here are therefore refused by the database, each through a
composite reference, as DISCOVER-02 refused a reason for a track its run never
found:

- **Plan data on a node that is not a Set.** ``set_details`` references
  ``collections(id, kind)`` with a ``kind`` that can only be ``'set'``. Chapters
  reference ``set_details``, so a chapter can only belong to a Set, and a Set
  holding chapters cannot be turned into another kind while it has them.
- **A chapter from another Set.** An entry's plan references its entry as
  ``collection_tracks(id, collection_id)`` and its chapter as
  ``set_chapters(id, collection_id)`` with the same ``collection_id``, so the
  entry and its chapter are in one Set.
- **An acknowledgement across two Sets.** Both ends reference
  ``set_entries(entry_id, collection_id)`` with one ``collection_id``.

The unique indexes these references need, on ``collections(id, kind)``,
``collection_tracks(id, collection_id)``, ``set_chapters(id, collection_id)`` and
``set_entries(entry_id, collection_id)``, are true of every row by construction,
since each leads with a primary key.

What the database does not hold, and why
----------------------------------------
- **That every entry of a Set has a plan row.** A reference cannot require a
  child to exist. PREP-02 writes the plan row in the repository, in the same
  transaction as the entry, and holds that with a test.
- **That a Set's chapters are contiguous in its order.** Positions are indexed
  and not unique, for m0009's reason: chapters are reordered, and SQLite has no
  deferred uniqueness, so a swap would violate a unique index halfway through.
  Contiguity is the service's, with a test after every mutation.
- **The warning vocabulary.** It is PREP-05's, in ``core/``. A ``CHECK`` would
  restate it in the one place a forward-only schema can never revise, for the
  reason DEC-086's precision gave for ``key_format``.

Two tables are ``WITHOUT ROWID``
--------------------------------
``set_details`` and ``set_entries`` are keyed by another table's id. In an
ordinary table an ``INTEGER PRIMARY KEY`` is the rowid, and an insert that omits
it is given the next free number rather than refused, which here could attach a
plan to some other Collection's entry. ``WITHOUT ROWID`` refuses a missing key, as
m0021 found for the tables keyed by a Beatport id.

Cascades
--------
- Deleting a Set, or the folder it is in, takes its details, chapters, entries,
  plans and acknowledgements, and no tracks.
- Deleting a track (DEC-003) takes its entries, and with them their plans and
  every acknowledgement either end of which was one of them.
- A plan's reference to its chapter does not cascade. Deleting a chapter that
  still holds entries is refused, because DEC-103 moves them first and a service
  that forgot would otherwise lose them. The reference is ``NO ACTION``, checked
  at the end of the statement, so deleting a whole Set, whose cascade removes its
  chapters and its plans together, is still allowed.

Every referencing column leads an index, m0009's rule, so each parent delete is a
seek rather than a scan of the child.
"""

from __future__ import annotations

VERSION = 25

DESCRIPTION = "sets: the set kind, chapters, planned times and acknowledgements"

SQL = """
CREATE TABLE m0025_collections AS SELECT * FROM collections;

CREATE TABLE m0025_collection_tracks AS SELECT * FROM collection_tracks;

CREATE TABLE m0025_export_playlists AS SELECT * FROM rekordbox_export_playlists;

CREATE TABLE m0025_sequence AS
    SELECT name, seq FROM sqlite_sequence
    WHERE name IN (
        'collections', 'collection_tracks', 'rekordbox_export_playlists'
    );

DROP TABLE collection_tracks;

DROP TABLE collections;

DROP TABLE rekordbox_export_playlists;

CREATE TABLE collections (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id      INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    kind           TEXT    NOT NULL CHECK (kind IN ('folder', 'collection', 'smart', 'set')),
    name           TEXT    NOT NULL,
    position       INTEGER NOT NULL,
    depth          INTEGER NOT NULL,
    rules_json     TEXT,
    sort_field     TEXT,
    sort_dir       TEXT,
    frozen_from_id INTEGER,
    frozen_at      TEXT,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
);

CREATE TABLE collection_tracks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    track_id      INTEGER NOT NULL REFERENCES tracks(id)      ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    added_at      TEXT    NOT NULL
);

CREATE TABLE rekordbox_export_playlists (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    export_id     INTEGER NOT NULL
                  REFERENCES rekordbox_exports(id) ON DELETE CASCADE,
    collection_id INTEGER,
    kind          TEXT    NOT NULL CHECK (kind IN ('collection', 'smart', 'set')),
    name          TEXT    NOT NULL,
    path          TEXT    NOT NULL,
    entry_count   INTEGER NOT NULL,
    dropped_count INTEGER NOT NULL DEFAULT 0,
    rules_json    TEXT
);

INSERT INTO collections (
    id, parent_id, kind, name, position, depth, rules_json, sort_field,
    sort_dir, frozen_from_id, frozen_at, created_at, updated_at
)
SELECT
    id, parent_id, kind, name, position, depth, rules_json, sort_field,
    sort_dir, frozen_from_id, frozen_at, created_at, updated_at
FROM m0025_collections;

INSERT INTO collection_tracks (id, collection_id, track_id, position, added_at)
SELECT id, collection_id, track_id, position, added_at
FROM m0025_collection_tracks;

INSERT INTO rekordbox_export_playlists (
    id, export_id, collection_id, kind, name, path, entry_count, dropped_count,
    rules_json
)
SELECT
    id, export_id, collection_id, kind, name, path, entry_count, dropped_count,
    rules_json
FROM m0025_export_playlists;

CREATE INDEX idx_collections_parent ON collections (parent_id, position);

CREATE UNIQUE INDEX idx_collections_kind ON collections (id, kind);

CREATE INDEX idx_collection_tracks_collection
    ON collection_tracks (collection_id, position);

CREATE INDEX idx_collection_tracks_track
    ON collection_tracks (track_id);

CREATE UNIQUE INDEX idx_collection_tracks_entry
    ON collection_tracks (id, collection_id);

CREATE INDEX idx_rekordbox_export_playlists_export
    ON rekordbox_export_playlists (export_id);

DELETE FROM sqlite_sequence
    WHERE name IN (
        'collections', 'collection_tracks', 'rekordbox_export_playlists'
    );

INSERT INTO sqlite_sequence (name, seq) SELECT name, seq FROM m0025_sequence;

DROP TABLE m0025_sequence;

DROP TABLE m0025_export_playlists;

DROP TABLE m0025_collection_tracks;

DROP TABLE m0025_collections;

CREATE TABLE set_details (
    collection_id INTEGER NOT NULL PRIMARY KEY,
    kind          TEXT    NOT NULL DEFAULT 'set' CHECK (kind = 'set'),
    notes         TEXT,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    FOREIGN KEY (collection_id, kind)
        REFERENCES collections(id, kind) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE set_chapters (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id  INTEGER NOT NULL
                   REFERENCES set_details(collection_id) ON DELETE CASCADE,
    position       INTEGER NOT NULL CHECK (position >= 0),
    name           TEXT    NOT NULL DEFAULT '',
    notes          TEXT,
    target_seconds INTEGER CHECK (target_seconds IS NULL OR target_seconds > 0),
    bpm_min        REAL    CHECK (bpm_min IS NULL OR bpm_min > 0),
    bpm_max        REAL    CHECK (bpm_max IS NULL OR bpm_max > 0),
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL,
    CHECK (bpm_min IS NULL OR bpm_max IS NULL OR bpm_min <= bpm_max)
);

CREATE INDEX idx_set_chapters_set ON set_chapters (collection_id, position);

CREATE UNIQUE INDEX idx_set_chapters_chapter ON set_chapters (id, collection_id);

CREATE TABLE set_entries (
    entry_id      INTEGER NOT NULL PRIMARY KEY,
    collection_id INTEGER NOT NULL,
    chapter_id    INTEGER NOT NULL,
    in_seconds    INTEGER CHECK (in_seconds IS NULL OR in_seconds >= 0),
    out_seconds   INTEGER CHECK (out_seconds IS NULL OR out_seconds > 0),
    note          TEXT,
    CHECK (in_seconds IS NULL OR out_seconds IS NULL OR in_seconds < out_seconds),
    UNIQUE (entry_id, collection_id),
    FOREIGN KEY (entry_id, collection_id)
        REFERENCES collection_tracks(id, collection_id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id, collection_id)
        REFERENCES set_chapters(id, collection_id)
) WITHOUT ROWID;

CREATE INDEX idx_set_entries_chapter ON set_entries (chapter_id, collection_id);

CREATE TABLE set_acknowledgements (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    from_entry_id INTEGER NOT NULL,
    to_entry_id   INTEGER NOT NULL,
    warning       TEXT    NOT NULL,
    compared_json TEXT    NOT NULL,
    created_at    TEXT    NOT NULL,
    CHECK (from_entry_id <> to_entry_id),
    UNIQUE (from_entry_id, to_entry_id, warning),
    FOREIGN KEY (from_entry_id, collection_id)
        REFERENCES set_entries(entry_id, collection_id) ON DELETE CASCADE,
    FOREIGN KEY (to_entry_id, collection_id)
        REFERENCES set_entries(entry_id, collection_id) ON DELETE CASCADE
);

CREATE INDEX idx_set_acknowledgements_to
    ON set_acknowledgements (to_entry_id, collection_id);
"""
