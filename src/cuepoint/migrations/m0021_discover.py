#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Discover schema (DISCOVER-02, Phase 9).

Everything Phase 9 stores, in one migration, for the reason ``m0011_clean``
gives: these tables reference each other, the runner is forward-only, and a
schema landed in pieces is one whose early pieces were designed without the
later ones in view. Nothing reads or writes any of it in this step.

Seven tables hold what CuePoint has read from Beatport and what it did with it:

- **``beatport_tracks``** and **``beatport_track_artists``** — a cache of
  catalog tracks, with their credits by Beatport id (DISCOVER-01's
  ``CatalogTrack``, column for field).
- **``beatport_name_lookups``** — DEC-091's cache of name searches, so a second
  discovery run spends no request on a label the first one resolved.
- **``discovery_runs``**, **``discovery_run_tracks``** and
  **``discovery_run_sources``** — each run with its parameters, outcome, the
  tracks it found in first-seen order, and every reason it found each one
  (DEC-091).
- **``wantlist``** — DEC-093's list of Beatport tracks a user does not have yet.

Two hold the library side, which DISCOVER-03 maintains:

- **``track_credits``** — ``tracks.artist`` and ``tracks.remixer`` split into
  one row per credited name, so "tracks by B" is a lookup rather than a
  substring (DEC-094).
- **``derived_indexes``** — which version of a derived index was built, so a
  change to the normalization rule is a version bump that rebuilds the index
  rather than a migration.

Nothing stores ownership (DEC-092) or a page (DEC-094). Both are computed when
read, which is why no column here says "owned".

The catalog columns follow what DISCOVER-01 found
-------------------------------------------------
A Beatport id is an ``INTEGER``: the v4 API answers numbers, and DISCOVER-01's
parsers refuse anything that is not a positive integer. ``match_candidates``
stores its id as ``TEXT`` (m0012, parsed from a page); SQLite applies numeric
affinity when an ``INTEGER`` column is compared with a ``TEXT`` one, so
DISCOVER-04's ownership join works across the two without a cast, and
``test_discover_schema`` holds that true.

``key`` is classic notation, converted by DISCOVER-01's parser, because every
other key in CuePoint is classic or Camelot and nothing reads Beatport's
spelling. ``release_date`` is an ISO date. ``label_key`` and each credit's
``name_key`` are DISCOVER-03's normalized name, stored beside the name so that a
label or artist is found by index rather than by a function per row.

A Beatport id is never invented
-------------------------------
``beatport_tracks`` and ``wantlist`` are keyed by a Beatport track id, and both
are ``WITHOUT ROWID``. In an ordinary table an ``INTEGER PRIMARY KEY`` is the
rowid, and SQLite answers a ``NULL`` there — even with ``NOT NULL`` declared —
by assigning the next free number: a writer that lost a track's id would store
the track under an id Beatport never gave it, and ownership would then compare
against a fiction. Without a rowid the key is only the key, and a ``NULL`` is
refused. Integer affinity still applies, so ``'19000001'`` is stored as the
number. Every other key here is either a real rowid (``discovery_runs.id``,
assigned on purpose) or composite and ``NOT NULL`` column by column;
``derived_indexes.name`` is declared ``NOT NULL`` because a text primary key
otherwise accepts any number of ``NULL`` rows.

A re-read is an upsert, never ``INSERT OR REPLACE``
---------------------------------------------------
"A re-read replaces the row" means its values, not the row. ``INSERT OR
REPLACE`` deletes the old row and inserts a new one, and SQLite runs a delete's
foreign-key actions when it does: the track's credits would cascade away, and a
writer that did not rewrite them in the same transaction would leave a track
with no artists. ``INSERT … ON CONFLICT (beatport_track_id) DO UPDATE`` changes
the values in place and touches nothing that references them.
``test_discover_schema`` shows both behaviours, so the reason is not only
written down.

Why a run's sources reference the run's track, not the run
----------------------------------------------------------
Every source row is a reason a run found a track, so it must name a track that
run found. The composite reference ``(run_id, beatport_track_id)`` into
``discovery_run_tracks`` says exactly that, which two separate references — to
the run and to the catalog — could not: they would accept a reason for a track
the run never listed. Deleting a run cascades to its tracks and from them to
their sources. ``discovery_run_tracks``'s primary key leads with the same two
columns, so the cascade needs no extra index.

inCrate kept a track's first source only. A track found in three charts is
found for three reasons here, and the list says so. ``matched_on`` is ``NOT
NULL``: it is the library artist or label that put the source in scope, the
writer always knows it, and a reason that cannot say what in the library it
came from is DEC-074's unnamed signal.

What a delete may and may not take
----------------------------------
- A catalog track's credits go with it (cascade). Nothing else does: a catalog
  row a run or the wantlist references cannot be deleted at all (no action), so
  a cache prune can never empty a stored run or a user's list.
- A run's tracks and sources go with it. A wantlist entry added from that run
  stays, and forgets which run it came from (``ON DELETE SET NULL``): the entry
  is the user's, the run was only where they saw the track.
- A library track's credits go with it (cascade); they are derived from its
  own columns and mean nothing without it.

``discovery_runs.id`` is ``AUTOINCREMENT`` because runs are deleted: an id in
an activity event or an open page must not come to name a later run.

The vocabularies
----------------
Every closed vocabulary is a ``CHECK``: a credit's ``role`` (``artist``,
``remixer``), a lookup's ``kind`` (``artist``, ``label``), a run's ``outcome``
(null while it runs, then ``succeeded``, ``cancelled`` or ``failed``) and a
source's ``source_type`` (``chart``, ``label_release``).

``error_class`` is **not** checked. It is DISCOVER-01's classification of a
Beatport failure (``no_token``, ``rejected``, ``forbidden``, ``rate_limited``,
``unavailable``), which lives in ``services/beatport_api_client.py`` as
``BEATPORT_ERROR_CLASSES``; a ``CHECK`` here would restate it in the one place a
forward-only schema can never revise, which is ``m0020``'s reason for leaving
``key_format`` unchecked. It is stored beside ``error`` because DISCOVER-05
fails a run "with that class" and a reopened run is drawn from it: "your token
was rejected" points to Settings, and a sentence parsed back out of ``error``
cannot be relied on to.

Every count on a run is ``NOT NULL DEFAULT 0``. A run is written when it starts,
so each count begins at a true zero and only grows; none is ever unknown.

Which indexes, and which deliberately not
-----------------------------------------
m0009's rule, applied again: every column that references another table leads
an index, because SQLite scans the whole child table on a parent delete
unless it does.

- ``beatport_track_artists`` and ``track_credits`` — their primary keys lead
  with the referencing column.
- ``discovery_run_tracks.beatport_track_id`` — checked on every catalog delete.
- ``discovery_run_sources`` — its primary key leads with its reference.
- ``wantlist.beatport_track_id`` is its primary key; ``added_from_run_id`` has
  its own index, for the ``SET NULL``.

Then the lookups the specification names, each written so the index answers
the query on its own:

- ``beatport_tracks (label_id)`` and ``(label_key)`` — a label's cached tracks.
- ``beatport_track_artists (artist_id, beatport_track_id)`` and
  ``(name_key, beatport_track_id)``, and ``track_credits (name_key,
  track_id)``. The specification asks for an index on ``artist_id`` and on
  ``name_key``; each leads with it, and carrying the track id as well makes the
  index covering. That matters most for the rule DISCOVER-03 adds,
  ``EXISTS (… WHERE track_id = tracks.id AND name_key = ?)``, which is then one
  seek per library track with no table read. A plain single-column index on a
  table with a rowid carries the rowid, not the primary key, so it could not do
  that.
- ``discovery_run_tracks (run_id, position)``, **unique** — a run's tracks in
  first-seen order, windowed, which is how a run is read; and the rule that a
  run gives each place in its order to one track.

``discovery_runs`` has no index: runs are listed newest first, which is
``ORDER BY id DESC`` over the rowid. ``beatport_name_lookups`` is read by its
primary key. The wantlist's ``bought_at`` filter and a run's sort by release
date or artist are queries DISCOVER-05 and DISCOVER-06 write and measure.

Timestamps are ISO-8601 UTC text, as in every table before these.
"""

from __future__ import annotations

VERSION = 21

DESCRIPTION = (
    "Discover: the Beatport catalog cache, discovery runs, the wantlist and the"
    " library's credit index"
)

SQL = """
CREATE TABLE beatport_tracks (
    beatport_track_id INTEGER PRIMARY KEY,
    title             TEXT    NOT NULL,
    mix_name          TEXT,
    url               TEXT    NOT NULL,
    label_id          INTEGER,
    label_name        TEXT,
    label_key         TEXT,
    release_id        INTEGER,
    release_name      TEXT,
    release_date      TEXT,
    bpm               REAL,
    key               TEXT,
    genre_id          INTEGER,
    genre_name        TEXT,
    fetched_at        TEXT    NOT NULL
) WITHOUT ROWID;

CREATE INDEX idx_beatport_tracks_label ON beatport_tracks (label_id);

CREATE INDEX idx_beatport_tracks_label_key ON beatport_tracks (label_key);

CREATE TABLE beatport_track_artists (
    beatport_track_id INTEGER NOT NULL
                      REFERENCES beatport_tracks(beatport_track_id)
                      ON DELETE CASCADE,
    role              TEXT    NOT NULL CHECK (role IN ('artist', 'remixer')),
    position          INTEGER NOT NULL,
    artist_id         INTEGER,
    name              TEXT    NOT NULL,
    name_key          TEXT    NOT NULL,
    PRIMARY KEY (beatport_track_id, role, position)
);

CREATE INDEX idx_beatport_track_artists_artist
    ON beatport_track_artists (artist_id, beatport_track_id);

CREATE INDEX idx_beatport_track_artists_name
    ON beatport_track_artists (name_key, beatport_track_id);

CREATE TABLE beatport_name_lookups (
    kind          TEXT NOT NULL CHECK (kind IN ('artist', 'label')),
    name_key      TEXT NOT NULL,
    beatport_id   INTEGER,
    beatport_name TEXT,
    looked_up_at  TEXT NOT NULL,
    PRIMARY KEY (kind, name_key)
);

CREATE TABLE discovery_runs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id            TEXT,
    started_at        TEXT    NOT NULL,
    finished_at       TEXT,
    outcome           TEXT
                      CHECK (outcome IN ('succeeded', 'cancelled', 'failed')),
    params_json       TEXT    NOT NULL,
    labels_in_scope   INTEGER NOT NULL DEFAULT 0,
    labels_resolved   INTEGER NOT NULL DEFAULT 0,
    artists_in_scope  INTEGER NOT NULL DEFAULT 0,
    charts_read       INTEGER NOT NULL DEFAULT 0,
    releases_read     INTEGER NOT NULL DEFAULT 0,
    tracks_found      INTEGER NOT NULL DEFAULT 0,
    error             TEXT,
    error_class       TEXT
);

CREATE TABLE discovery_run_tracks (
    run_id            INTEGER NOT NULL
                      REFERENCES discovery_runs(id) ON DELETE CASCADE,
    beatport_track_id INTEGER NOT NULL
                      REFERENCES beatport_tracks(beatport_track_id),
    position          INTEGER NOT NULL,
    PRIMARY KEY (run_id, beatport_track_id)
);

CREATE INDEX idx_discovery_run_tracks_track
    ON discovery_run_tracks (beatport_track_id);

CREATE UNIQUE INDEX idx_discovery_run_tracks_position
    ON discovery_run_tracks (run_id, position);

CREATE TABLE discovery_run_sources (
    run_id            INTEGER NOT NULL,
    beatport_track_id INTEGER NOT NULL,
    source_type       TEXT    NOT NULL
                      CHECK (source_type IN ('chart', 'label_release')),
    source_id         INTEGER NOT NULL,
    source_name       TEXT,
    source_url        TEXT,
    matched_on        TEXT    NOT NULL,
    PRIMARY KEY (run_id, beatport_track_id, source_type, source_id),
    FOREIGN KEY (run_id, beatport_track_id)
        REFERENCES discovery_run_tracks(run_id, beatport_track_id)
        ON DELETE CASCADE
);

CREATE TABLE wantlist (
    beatport_track_id INTEGER PRIMARY KEY
                      REFERENCES beatport_tracks(beatport_track_id),
    added_at          TEXT    NOT NULL,
    note              TEXT,
    bought_at         TEXT,
    added_from_run_id INTEGER
                      REFERENCES discovery_runs(id) ON DELETE SET NULL
) WITHOUT ROWID;

CREATE INDEX idx_wantlist_run ON wantlist (added_from_run_id);

CREATE TABLE track_credits (
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    role     TEXT    NOT NULL CHECK (role IN ('artist', 'remixer')),
    position INTEGER NOT NULL,
    name     TEXT    NOT NULL,
    name_key TEXT    NOT NULL,
    PRIMARY KEY (track_id, role, position)
);

CREATE INDEX idx_track_credits_name ON track_credits (name_key, track_id);

CREATE TABLE derived_indexes (
    name     TEXT    NOT NULL PRIMARY KEY,
    version  INTEGER NOT NULL,
    built_at TEXT    NOT NULL
);
"""
