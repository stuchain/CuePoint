#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What each export wrote, and which playlists went into it (EXPORT-03, DEC-086).

Two tables, landed together for the reason ``m0011_clean`` gives: a phase's
schema arrives in one migration so the DDL is right rather than adjustable.
Nothing reads or writes either of them in this step.

- **``rekordbox_exports``** — one row per export: when it ran, where it wrote,
  which file it patched and whether that file had moved on, how many tracks
  were in scope and how many it actually changed, which fields and which key
  notation, and how it ended.
- **``rekordbox_export_playlists``** — one row per playlist that export wrote,
  with its kind, the path it was written to, its entry count, and the rule set
  a Smart Collection had at the time.

Why there is no per-track table
-------------------------------
DEC-086 is explicit, and the reason is worth keeping next to the DDL so that
nobody adds one later thinking it was an oversight. A per-track export stamp is
the staleness bug DEC-061 refused for Smart Collections, reintroduced somewhere
harder to see: every edit, apply, revert, refresh, import and batch would have
to know it had just falsified a stamp, and the symptom of missing one is an
export that silently omits a track the user changed. Counts answer the question
people actually ask — where did my last export go, and what was in it — and
they invalidate nothing.

For the same reason there is no "export only what changed since last time".
``changed_track_count`` is a record of what one run did, not an input to the
next one.

Why the playlist rows point at nothing
--------------------------------------
``collection_id`` is deliberately **not** a foreign key, and ``name``, ``path``
and ``rules_json`` are stored as text beside it. A Collection deleted next month
must not erase the record of an export that contained it, and DEC-086 is explicit
that the row records what CuePoint wrote rather than what still exists. The
Smart Collection's rule set is kept for the same reason (DEC-081): its membership
was never stored, so the rules as they were are the only thing that can explain a
past export's count.

``export_id`` *is* a foreign key, and cascades: a playlist row describes one
export and means nothing without it.

Why ``missing_file_count`` may be null
--------------------------------------
DEC-088 exports a track whose audio file is missing and counts it, and says in
as many words that a library which has never been file-checked "reports that it
has not been checked rather than reporting zero". A ``NOT NULL DEFAULT 0``
column cannot say that — it can only make the claim DEC-088 refuses. So the
column is nullable and carries no default: null is "never checked", and a number
is a number that was counted. ``track_files`` (m0011) is where that check's
results live, and a library with no row for a track has not had it checked.

Every other count here is always known by the writer, so each of those is
``NOT NULL``.

Why the two vocabularies are closed and the third is not
--------------------------------------------------------
``outcome`` and ``kind`` are ``CHECK`` constraints because both are small, fixed
and owned here: an export ends as ``written``, ``cancelled`` or ``failed``, and
a playlist row came from a Collection or a Smart Collection — a folder is tree
structure in the written file, not a playlist, so it is not one of these.

``key_format`` is **not** checked. DEC-089 puts that vocabulary in
``services/tag_write_options.py::KEY_FORMATS`` and says the export validates
against it rather than restating it; a ``CHECK`` here would be a restatement in
the one place a forward-only schema could never revise. The value is refused
where it is chosen, before any export runs.

Which indexes, and which deliberately not
-----------------------------------------
``m0009``'s rule, applied again: every column that references another table is
indexed, because SQLite scans the whole child table on a parent delete unless it
is. That is ``rekordbox_export_playlists.export_id``, which is also how every
reader of a record asks for its playlists.

Nothing else is indexed. "The most recent export", which DEC-083 pre-fills the
next destination from, is ``ORDER BY id DESC LIMIT 1`` over the rowid alias, and
that is already the fastest read this table has.

Timestamps are ISO-8601 UTC text, as in every table before these.
"""

from __future__ import annotations

VERSION = 20

DESCRIPTION = "the record of each Rekordbox export and the playlists it wrote"

SQL = """
CREATE TABLE rekordbox_exports (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                  TEXT,
    started_at              TEXT    NOT NULL,
    finished_at             TEXT,
    outcome                 TEXT    NOT NULL
                            CHECK (outcome IN ('written', 'cancelled', 'failed')),
    destination_path        TEXT    NOT NULL,
    source_path             TEXT    NOT NULL,
    source_stale            INTEGER NOT NULL DEFAULT 0
                            CHECK (source_stale IN (0, 1)),
    track_count             INTEGER NOT NULL,
    changed_track_count     INTEGER NOT NULL,
    fields_json             TEXT    NOT NULL,
    key_format              TEXT    NOT NULL,
    missing_file_count      INTEGER,
    dropped_reference_count INTEGER NOT NULL DEFAULT 0,
    error                   TEXT
);

CREATE TABLE rekordbox_export_playlists (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    export_id     INTEGER NOT NULL
                  REFERENCES rekordbox_exports(id) ON DELETE CASCADE,
    collection_id INTEGER,
    kind          TEXT    NOT NULL CHECK (kind IN ('collection', 'smart')),
    name          TEXT    NOT NULL,
    path          TEXT    NOT NULL,
    entry_count   INTEGER NOT NULL,
    dropped_count INTEGER NOT NULL DEFAULT 0,
    rules_json    TEXT
);

CREATE INDEX idx_rekordbox_export_playlists_export
    ON rekordbox_export_playlists (export_id);
"""
