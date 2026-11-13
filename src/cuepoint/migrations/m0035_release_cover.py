#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The release cover of a cached Beatport track (Discover's track tables).

One nullable column on the catalog cache: ``beatport_tracks.release_image_url``,
the picture Beatport names for the track's release (``release.image``). It is
read with the track, so a dig that finds a track keeps its cover with it; the
engine fetches, checks and re-encodes it (DEC-076), and the URL never reaches
the renderer.

``release_cover_read`` says whether Beatport has been asked for that cover: 1 on
every catalog upsert (the read either named a cover or did not) and on every
on-view lookup that answered, 0 for a track cached before this migration. A
track not read yet is asked for once, when somebody looks at it, so older digs
get their covers on view; the answer, a miss included, is kept here.
"""

from __future__ import annotations

VERSION = 35

DESCRIPTION = "beatport_tracks: the release cover's image URL and whether it was read"

SQL = """
ALTER TABLE beatport_tracks ADD COLUMN release_image_url TEXT;
ALTER TABLE beatport_tracks ADD COLUMN release_cover_read INTEGER NOT NULL DEFAULT 0;
"""
