#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What the library itself remembers about how it was last used (HARDEN-01).

``library_meta(key, value)``
----------------------------
A small key/value table. The first key is ``last_opened_by``: the version of
CuePoint that last started on this library, written at every start. It lets a
backup, the copy taken before an upgrade and a later "this library is from a
newer CuePoint" screen name app versions rather than schema numbers.

Nothing else changes: one new table that nothing references, no backfill (a
library from before this migration has simply never been opened by a version
that wrote the key).
"""

from __future__ import annotations

VERSION = 31

DESCRIPTION = "library_meta: the app version that last opened the library"

SQL = """
CREATE TABLE library_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""
