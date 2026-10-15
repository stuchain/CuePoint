#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where a dig's tracks came from, as groups (Discover results as rows of cards).

A dig's results used to be one list. They are now shown grouped by where they
came from: the charts the chosen artists made (or, with no artists chosen, the
genre charts), one card per chosen artist, one per chosen label. This migration
stores what that needs, and keeps every run already stored readable.

``discovery_run_groups``
------------------------
One row per card a run can show: a **chart** (``key`` is its Beatport id), an
**artist** or a **label** (``key`` is DISCOVER-03's ``name_key``). A card is
stored even when it found nothing — a chosen artist with no new release is a
fact the run should say — so it is written when the entity is resolved, not
when a track is found. ``owner_key`` is, for a chart, the chosen artist it
counts for; ``NULL`` marks a general genre chart that belongs to no artist.
``art_url`` is the image Beatport named for the card; it never leaves the
engine (the renderer only ever receives a guarded thumbnail, DEC-076).
``position`` is the card's place in the order it was found.

``discovery_run_sources`` is rebuilt
------------------------------------
SQLite cannot widen a ``CHECK``, and a new reason exists — an artist's new
release (``artist_release``) — so the table is rebuilt with the wider check. It
also gains ``group_key``, the card a reason belongs to, and its primary key
gains it too: a track both of whose artists were chosen is found twice by one
release, once for each artist's card. A reason stored before this migration has
``group_key = ''`` and belongs to no card, which is exactly what makes an old
run read as "Everything" only: no groups, the same flat list.
"""

from __future__ import annotations

VERSION = 30

DESCRIPTION = "Discover: the groups (charts, artists, labels) a dig's tracks came from"

SQL = """
CREATE TABLE discovery_run_groups (
    run_id      INTEGER NOT NULL
                REFERENCES discovery_runs(id) ON DELETE CASCADE,
    kind        TEXT    NOT NULL CHECK (kind IN ('chart', 'artist', 'label')),
    key         TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    beatport_id INTEGER,
    owner_key   TEXT,
    curator     TEXT,
    art_url     TEXT,
    position    INTEGER NOT NULL,
    PRIMARY KEY (run_id, kind, key)
);

CREATE TABLE discovery_run_sources_v2 (
    run_id            INTEGER NOT NULL,
    beatport_track_id INTEGER NOT NULL,
    source_type       TEXT    NOT NULL
                      CHECK (source_type IN
                             ('chart', 'label_release', 'artist_release')),
    source_id         INTEGER NOT NULL,
    group_key         TEXT    NOT NULL DEFAULT '',
    source_name       TEXT,
    source_url        TEXT,
    matched_on        TEXT    NOT NULL,
    PRIMARY KEY (run_id, beatport_track_id, source_type, source_id, group_key),
    FOREIGN KEY (run_id, beatport_track_id)
        REFERENCES discovery_run_tracks(run_id, beatport_track_id)
        ON DELETE CASCADE
);

INSERT INTO discovery_run_sources_v2
    (run_id, beatport_track_id, source_type, source_id, group_key,
     source_name, source_url, matched_on)
SELECT run_id, beatport_track_id, source_type, source_id, '',
       source_name, source_url, matched_on
FROM discovery_run_sources;

DROP TABLE discovery_run_sources;

ALTER TABLE discovery_run_sources_v2 RENAME TO discovery_run_sources;

CREATE INDEX idx_discovery_run_sources_group
    ON discovery_run_sources (run_id, source_type, group_key);
"""
