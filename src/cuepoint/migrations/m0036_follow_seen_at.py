#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""When a follow's new tracks were last looked at (Discover's Following tab).

One nullable column on ``follows``: ``seen_at``, the ISO-8601 UTC moment the
user last marked the follow seen. ``seen_through`` is a day, so on its own it
cannot tell a track Beatport listed this morning (looked at) from one it listed
this afternoon (not yet looked at); ``seen_at`` is what lets a track released
on ``seen_through`` itself count as new only when it was read after the look.

Nothing is backfilled: a follow marked seen before this migration has no
``seen_at`` and keeps the old meaning, that releases after ``seen_through`` are
new and nothing on the day itself is.
"""

from __future__ import annotations

VERSION = 36

DESCRIPTION = "follows: when the follow's new tracks were last marked seen"

SQL = """
ALTER TABLE follows ADD COLUMN seen_at TEXT;
"""
