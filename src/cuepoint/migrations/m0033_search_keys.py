#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Search and sort keys that fold accents and case (HARDEN-06, DEC-185).

SQLite's ``LIKE`` and ``COLLATE NOCASE`` fold ASCII only. "ÂME" did not find
"Âme", and "Âme" sorted after "Zedd". A key per text field, folded in Python
and compared in SQL, fixes both without a custom collation (which a plain
``sqlite3`` build cannot load) and without a full-text table.

What is added
-------------
``tracks.title_search_key``, ``artist_search_key``, ``album_search_key`` and
``label_search_key``, and ``track_metadata.label_search_key``. A key is the
field's text through ``casefold`` and then NFKD with the combining marks
removed ("Beyoncé" is "beyonce", "straße" is "strasse", "Σίσυφος" is
"σισυφοσ"); a field that is NULL has a NULL key. The label a person sees is
the override when there is one (DEC-068), so its key is read the same way the
label is: ``COALESCE(track_metadata.label_search_key, tracks.label_search_key)``.
Search compares those with ``LIKE``; sort orders by them with the original text
as the tie-break. Scripts without case or marks (CJK) fold to themselves and
order by code point, after the Latin letters.

The browse index
----------------
``idx_tracks_artist_title`` served the default order on ``NOCASE`` columns. The
default order is now on the keys, so the index is dropped and rebuilt, under
the same name, on ``(artist_search_key, artist, title_search_key, title, id)``.
It is built after the keys are filled, once, rather than maintained row by row
through the fill.

The fill
--------
Rows are read and written in id order, five thousand at a time, inside the
migration's transaction. The fold is written out here rather than imported, so
a migration keeps meaning what it meant when it shipped. Timed at 50,000 rows
by ``scripts/bench_search_keys.py``.
"""

from __future__ import annotations

import sqlite3
import unicodedata
from typing import Optional

VERSION = 33

DESCRIPTION = "search and sort keys: folded title, artist, album and label"

SQL = """
ALTER TABLE tracks ADD COLUMN title_search_key TEXT;
ALTER TABLE tracks ADD COLUMN artist_search_key TEXT;
ALTER TABLE tracks ADD COLUMN album_search_key TEXT;
ALTER TABLE tracks ADD COLUMN label_search_key TEXT;
ALTER TABLE track_metadata ADD COLUMN label_search_key TEXT;
"""

_BATCH = 5000

# Letters NFKD does not take apart. A frozen copy of
# ``core.text_processing.SEARCH_FOLD_TABLE``; a test keeps the two identical.
FOLD_TABLE = {
    ord("ø"): "o",
    ord("ł"): "l",
    ord("đ"): "d",
    ord("ð"): "d",
    ord("æ"): "ae",
    ord("œ"): "oe",
    ord("þ"): "th",
}


def _fold(text: Optional[str]) -> Optional[str]:
    """The key of a field: casefold, NFKD, marks removed; NULL stays NULL."""
    if text is None:
        return None
    return "".join(
        ch
        for ch in unicodedata.normalize(
            "NFKD", str(text).casefold().translate(FOLD_TABLE)
        )
        if not unicodedata.combining(ch)
    )


def _fill_tracks(conn: sqlite3.Connection) -> None:
    last_id = 0
    while True:
        rows = conn.execute(
            "SELECT id, title, artist, album, label FROM tracks"
            " WHERE id > ? ORDER BY id LIMIT ?",
            (last_id, _BATCH),
        ).fetchall()
        if not rows:
            return
        conn.executemany(
            "UPDATE tracks SET title_search_key = ?, artist_search_key = ?,"
            " album_search_key = ?, label_search_key = ? WHERE id = ?",
            [(_fold(r[1]), _fold(r[2]), _fold(r[3]), _fold(r[4]), r[0]) for r in rows],
        )
        last_id = rows[-1][0]


def _fill_overrides(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT track_id, label FROM track_metadata WHERE label IS NOT NULL"
    ).fetchall()
    conn.executemany(
        "UPDATE track_metadata SET label_search_key = ? WHERE track_id = ?",
        [(_fold(r[1]), r[0]) for r in rows],
    )


def upgrade(conn: sqlite3.Connection) -> None:
    """Fill the keys, then rebuild the browse index on them."""
    _fill_tracks(conn)
    _fill_overrides(conn)
    conn.execute("DROP INDEX IF EXISTS idx_tracks_artist_title")
    conn.execute(
        "CREATE INDEX idx_tracks_artist_title ON tracks"
        " (artist_search_key, artist, title_search_key, title, id)"
    )
