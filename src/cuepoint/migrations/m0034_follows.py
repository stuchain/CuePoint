#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Followed Beatport artists and labels (Discover's Following tab).

``follows(kind, beatport_id, name, followed_at, seen_through)``
---------------------------------------------------------------
One row per followed Beatport artist or label, keyed by the Beatport id (a name
is never a key: only a name already linked to exactly one id can be followed).
``seen_through`` is an ISO date: releases after it are "new". A follow starts it
30 days back so a first look is not empty, and "mark seen" moves it to the day
one day before it was marked (m0036 adds the track ids that mark saw).

Nothing is backfilled and nothing references the table. The rows are the
user's own data, so the table is ``WITHOUT ROWID`` with a composite key and no
generated ids.
"""

from __future__ import annotations

VERSION = 34

DESCRIPTION = "follows: Beatport artists and labels followed in Discover"

SQL = """
CREATE TABLE follows (
    kind         TEXT    NOT NULL CHECK (kind IN ('artist', 'label')),
    beatport_id  INTEGER NOT NULL,
    name         TEXT    NOT NULL,
    followed_at  TEXT    NOT NULL,
    seen_through TEXT    NOT NULL,
    PRIMARY KEY (kind, beatport_id)
) WITHOUT ROWID;
"""
