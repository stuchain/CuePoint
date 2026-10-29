#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reads and writes of ``library_meta``: what the library remembers about itself.

Today one key, ``last_opened_by``: the CuePoint version that last started on
this library (HARDEN-01).
"""

from __future__ import annotations

from typing import Optional

from cuepoint.services.interfaces import IDatabaseService

LAST_OPENED_BY = "last_opened_by"


def get_meta(database: IDatabaseService, key: str) -> Optional[str]:
    """Return the value stored under ``key``, or None when there is none."""
    row = (
        database.connect()
        .execute("SELECT value FROM library_meta WHERE key = ?", (key,))
        .fetchone()
    )
    return None if row is None or row[0] is None else str(row[0])


def set_meta(database: IDatabaseService, key: str, value: str) -> None:
    """Store ``value`` under ``key``, replacing any earlier value."""
    with database.transaction() as connection:
        connection.execute(
            "INSERT INTO library_meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def record_last_opened_by(version: str) -> bool:
    """Store ``version`` as the build that last opened the shared library.

    A library whose schema is ahead of this build belongs to a newer CuePoint;
    its record is kept, so a "this library is from a newer version" screen can
    name that version. Returns True when the value was written.
    """
    from cuepoint.services.migration_runner import schema_is_ahead
    from cuepoint.utils.di_container import get_container

    database = get_container().resolve(IDatabaseService)
    if schema_is_ahead(database.db_path):
        return False
    set_meta(database, LAST_OPENED_BY, version)
    return True
