#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Stored path keys in one Unicode form (HARDEN-06).

``tracks.normalized_path`` is the comparable form of a path that the import's
fallback match, the duplicate finder and the export's source check look files
up by. Until now it was cased and slash-folded but not *composed*, so a name
written by a Mac file system ("Beyonce" and a combining acute, NFD) and the
same name as Rekordbox writes it on Windows (NFC) were two keys.
``normalize_path`` now composes first; this rewrites the keys already stored so
the library agrees with it.

What changes, and what never does
---------------------------------
Only ``tracks.normalized_path``. It carries no unique index (``m0002``), so two
rows that now share a key are not a conflict: the duplicate finder, which groups
by this column, will say so. ``file_path`` is never touched: it is what the
operating system and the waveform store (keyed by the exact path) know the file
by, and a name the disk does not hold would open nothing.

The key is rebuilt from ``file_path`` with the same function a refresh uses, so
a migrated row and a freshly imported one cannot differ. Rows are read and
written in id order, a few thousand at a time, and only a row whose key changes
is written, so a library that is already composed (most are) costs one read.
"""

from __future__ import annotations

import posixpath
import sqlite3
import unicodedata

VERSION = 32

DESCRIPTION = "path keys in NFC: normalized_path rewritten, file_path untouched"

# Nothing to run as SQL: the work is the upgrade hook below. The statement is a
# no-op that keeps the migration's SQL non-empty for tooling that reads it.
SQL = "SELECT 1;"

_BATCH = 5000


def _key_of(file_path: str, stored_key: str) -> str:
    """The key a refresh would store for this row now.

    Frozen into the migration rather than imported: a migration must keep
    meaning what it meant when it shipped, even if ``normalize_path`` changes.
    """
    if not file_path or not file_path.strip():
        return unicodedata.normalize("NFC", stored_key or "")
    candidate = unicodedata.normalize("NFC", file_path).strip()
    candidate = candidate.replace("\\", "/")
    candidate = posixpath.normpath(candidate)
    if len(candidate) > 1:
        candidate = candidate.rstrip("/")
    return unicodedata.normalize("NFC", candidate.casefold())


def upgrade(conn: sqlite3.Connection) -> None:
    """Rewrite every ``normalized_path`` that is not already in its NFC key."""
    last_id = 0
    while True:
        rows = conn.execute(
            "SELECT id, file_path, normalized_path FROM tracks"
            " WHERE id > ? ORDER BY id LIMIT ?",
            (last_id, _BATCH),
        ).fetchall()
        if not rows:
            return
        changed = []
        for row in rows:
            stored = row[2] or ""
            fresh = _key_of(row[1] or "", stored)
            if fresh != stored:
                changed.append((fresh, row[0]))
        if changed:
            conn.executemany(
                "UPDATE tracks SET normalized_path = ? WHERE id = ?", changed
            )
        last_id = rows[-1][0]
