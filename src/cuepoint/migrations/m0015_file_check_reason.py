#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Why a file was found missing without being looked at (CLEAN-07, DEC-073).

Migration 0011 gave ``track_files`` a status and nothing to explain it, because
every status then meant the same thing: the path was checked and this is what
was there. CLEAN-07's check has one answer that is not that. When a drive is
unplugged, every track on it is missing, and the check says so from the drive
without touching 4,812 paths to find out one at a time. Those rows are missing
because their *root* is, and the Missing files view has to be able to say "the
drive is not connected" rather than list 4,812 files that look deleted.

One nullable column, with the vocabulary as a CHECK for m0006's reason: a small
discriminator where a typo would otherwise sit silently. That a reason belongs
only to a missing file is a rule between columns, so it lives in the model, as
m0011's other such rules do. ``track_files`` holds findings a rescan recomputes,
not anything a user authored, so widening the vocabulary later by rebuilding the
table costs a scan, not data.
"""

from __future__ import annotations

VERSION = 15

DESCRIPTION = "a reason for a file found missing from its drive"

SQL = """
ALTER TABLE track_files ADD COLUMN reason TEXT
    CHECK (reason IN ('root_unavailable'));
"""
