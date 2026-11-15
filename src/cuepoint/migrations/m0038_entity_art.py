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
cards (``discovery_run_groups.art_url``); the newest run's wins. A card's URL
was only checked to be HTTPS, so ``upgrade`` keeps just those on Beatport's own
artwork hosts, the check a picture row must pass to be read at all; the check is
written out here, as a migration keeps meaning what it meant when it shipped.
"""

from __future__ import annotations

import sqlite3
from urllib.parse import urlparse

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
  AND g.art_url LIKE 'https://%'
ORDER BY r.started_at DESC, r.id DESC;
"""


def _on_beatport_artwork_host(url: str) -> bool:
    """An unambiguous HTTPS URL on beatport.com or a subdomain of it."""
    if not url or any(
        char in "\\@" or char.isspace() or ord(char) < 0x20 or ord(char) == 0x7F
        for char in url
    ):
        return False
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.username is None
        and parsed.password is None
        and port in (None, 443)
        and (host == "beatport.com" or host.endswith(".beatport.com"))
    )


def upgrade(conn: sqlite3.Connection) -> None:
    """Drop the backfilled rows whose URL is not on Beatport's artwork hosts."""
    stale = [
        (row[0], row[1])
        for row in conn.execute(
            "SELECT kind, beatport_id, image_url FROM beatport_entity_art"
        )
        if not _on_beatport_artwork_host(row[2])
    ]
    conn.executemany(
        "DELETE FROM beatport_entity_art WHERE kind = ? AND beatport_id = ?", stale
    )
