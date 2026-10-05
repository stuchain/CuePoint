#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for ``derived_indexes``: which version built each derived thing.

``m0021_discover`` created the table for the name index (DISCOVER-03), whose
rows say which version of the name rule built the credits and label keys.
WAVE-04 records there too that the library's cue points and beat grids have
been read, and by which version of the reader. Two owners of one table's SQL
would be two copies of what a record means, so both go through these two
functions, on the connection their caller already holds: a record is written
in the transaction that writes what it describes.
"""

from __future__ import annotations

from typing import Any, Iterable, List, Sequence

from cuepoint.models.track_credit import DerivedIndex


def read_derived_indexes(conn: Any, names: Sequence[str]) -> List[DerivedIndex]:
    """The records for these names that exist, ordered by name."""
    if not names:
        return []
    placeholders = ", ".join("?" for _ in names)
    rows = conn.execute(
        "SELECT name, version, built_at FROM derived_indexes"
        f" WHERE name IN ({placeholders}) ORDER BY name",
        tuple(names),
    ).fetchall()
    return [DerivedIndex.from_row(row) for row in rows]


def record_derived_indexes(conn: Any, records: Iterable[DerivedIndex]) -> None:
    """Write each record, replacing the one of the same name."""
    conn.executemany(
        "INSERT INTO derived_indexes (name, version, built_at)"
        " VALUES (?, ?, ?)"
        " ON CONFLICT (name) DO UPDATE SET"
        " version = excluded.version, built_at = excluded.built_at",
        [(record.name, record.version, record.built_at) for record in records],
    )


__all__ = ["read_derived_indexes", "record_derived_indexes"]
