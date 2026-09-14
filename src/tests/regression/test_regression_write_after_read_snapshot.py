#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: a unit of work that read before it wrote failed beside another writer.

What broke
----------
An import failed with ``database is locked`` while a file check ran beside it
(found while building CLEAN-07). Nothing was holding a lock for long, and the
busy timeout was five seconds; the import failed in a millisecond.

Why
---
``DatabaseService.transaction()`` began with a plain ``BEGIN``, which is
deferred: it takes no lock until the first write. In WAL mode a deferred
transaction that has *read* holds a snapshot, and when another connection
commits before its first write, SQLite cannot upgrade it to a writer and fails
it at once (``SQLITE_BUSY_SNAPSHOT``). The busy handler is never consulted,
because waiting cannot make an old snapshot current.

Nearly every unit of work reads first — an import resolves identities, an edit
reads the value it replaces, a tag merge reads both tags' tracks — so any of
them could fail this way whenever something else committed in the gap. That was
rare while one thing wrote at a time. CLEAN-03's match job and CLEAN-07's file
check commit in the background for minutes, which made it routine.

What makes it easy to reintroduce
---------------------------------
Everything works with one writer, and every single-threaded test passes with a
deferred ``BEGIN``. The fix is one word, ``IMMEDIATE``, and nothing but a second
thread committing inside the gap shows that it matters. That is what this test
does.
"""

from __future__ import annotations

import sqlite3
import threading
import time
from typing import List

import pytest

from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db", busy_timeout_seconds=5)
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def _add_event(conn: sqlite3.Connection, summary: str) -> None:
    conn.execute(
        "INSERT INTO activity_events (type, summary, detail_json, created_at)"
        " VALUES ('regression', ?, '{}', '2026-09-14T12:00:00+00:00')",
        (summary,),
    )


def test_a_read_then_write_unit_of_work_survives_another_writers_commit(db):
    other_is_writing = threading.Event()
    failures: List[BaseException] = []

    def other_writer() -> None:
        other_is_writing.set()
        try:
            with db.transaction() as conn:
                _add_event(conn, "the other writer")
        except BaseException as exc:  # noqa: BLE001 — reported by the test
            failures.append(exc)

    with db.transaction() as conn:
        # Read first, as an import or an edit does.
        before = conn.execute("SELECT count(*) FROM activity_events").fetchone()[0]
        thread = threading.Thread(target=other_writer)
        thread.start()
        assert other_is_writing.wait(5)
        # Long enough for the other writer to commit, if it is allowed to.
        time.sleep(0.3)
        _add_event(conn, "the unit of work that read first")

    thread.join(10)
    assert failures == []
    summaries = [
        row[0]
        for row in db.connect().execute(
            "SELECT summary FROM activity_events ORDER BY id"
        )
    ]
    assert before == 0
    assert summaries == ["the unit of work that read first", "the other writer"]
