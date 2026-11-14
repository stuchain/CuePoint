#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Whether Beatport has been asked for an artist's or a label's card picture.

One column on ``discovery_run_groups``: ``art_read``, 1 once an on-view lookup of
the card's own page answered, whether or not it named a picture. A card with no
picture that was asked about is not asked again after a restart, as a track's
release cover is not (``beatport_tracks.release_cover_read``); a lookup that
failed or was rate limited is not recorded, so it is asked again later.
"""

from __future__ import annotations

VERSION = 37

DESCRIPTION = "discovery_run_groups: whether the card's picture was asked for"

SQL = """
ALTER TABLE discovery_run_groups ADD COLUMN art_read INTEGER NOT NULL DEFAULT 0;
"""
