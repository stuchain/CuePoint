#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The picture of a Beatport artist or label, kept once for every page that shows it (DEC-318).

Following's lists, the suggestions and the Artist and Label pages show a picture
where they had an empty shape. One table holds it so follows, suggestions, pages
and cards share a single answer: a column on ``follows`` would not cover a name
that is not followed.

``image_url`` is NULL when Beatport was asked and named none; no row means it
was not asked yet. A picture never expires; a NULL is asked again after 30 days.
The renderer is never sent the URL, only a thumbnail (DEC-076).

The backfill takes the pictures past digs already found for artist and label
cards (``discovery_run_groups.art_url``); the newest run's wins.
"""

from __future__ import annotations

VERSION = 38

DESCRIPTION = "beatport_entity_art: the picture of a Beatport artist or label"

SQL = """
CREATE TABLE beatport_entity_art (
    kind        TEXT    NOT NULL CHECK (kind IN ('artist', 'label')),
    beatport_id INTEGER NOT NULL,
    image_url   TEXT,
    read_at     TEXT    NOT NULL,
    PRIMARY KEY (kind, beatport_id)
) WITHOUT ROWID;

INSERT OR IGNORE INTO beatport_entity_art (kind, beatport_id, image_url, read_at)
SELECT g.kind, g.beatport_id, g.art_url, r.started_at
FROM discovery_run_groups g JOIN discovery_runs r ON r.id = g.run_id
WHERE g.kind IN ('artist', 'label')
  AND g.beatport_id IS NOT NULL
  AND g.art_url IS NOT NULL
ORDER BY r.started_at DESC, r.id DESC;
"""
