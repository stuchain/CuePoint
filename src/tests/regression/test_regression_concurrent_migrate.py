#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: two threads migrating one fresh database, and the second failing.

What broke
----------
While building CLEAN-08, a background job logged "Migration 0005 ... failed
and was rolled back: duplicate column name: rating". Nothing was wrong with
migration 0005. Two threads had migrated the same database at once.

Why
---
The engine migrates lazily, on the first repository a request resolves, and a
first launch sends several requests together. ``MigrationRunner.migrate()`` read
the pending list, then applied it. Two runners could both read "everything is
pending"; ``BEGIN IMMEDIATE`` made the second wait for the first, and once the
first had committed, the second ran the same DDL again and failed.

The fix: each migration's transaction asks, once it holds the lock, whether its
version is already recorded, and skips it if so.

What makes it easy to reintroduce
---------------------------------
It needs two callers racing on a database nobody has opened yet, which no
single-threaded test and no developer's already-migrated database ever shows.
The first test makes the race deterministic by giving a runner the answer it
would have read before the other one migrated; the second races real threads.
"""

from __future__ import annotations

import threading
from typing import List

from cuepoint.migrations import discover_migrations
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


def test_a_runner_holding_a_stale_pending_list_applies_nothing_and_fails_nothing(
    tmp_path, monkeypatch
):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    try:
        late = MigrationRunner(service)
        stale = late.pending_migrations()
        assert stale, "a fresh database has migrations pending"

        MigrationRunner(service).migrate()  # the other request got there first

        monkeypatch.setattr(late, "pending_migrations", lambda: stale)
        monkeypatch.setattr(late, "current_version", lambda: 0)
        assert late.migrate() == []

        versions = [
            int(row[0])
            for row in service.connect().execute(
                "SELECT version FROM schema_version ORDER BY version"
            )
        ]
        assert versions == sorted({m.version for m in stale})
    finally:
        service.close_all()


def test_several_threads_migrating_a_fresh_database_all_succeed(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    try:
        start = threading.Barrier(4)
        failures: List[BaseException] = []
        applied: List[int] = []
        lock = threading.Lock()

        def migrate() -> None:
            runner = MigrationRunner(service)
            start.wait()
            try:
                done = runner.migrate()
            except BaseException as exc:  # noqa: BLE001 — reported below
                failures.append(exc)
                return
            with lock:
                applied.extend(m.version for m in done)

        threads = [threading.Thread(target=migrate) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(60)

        assert failures == []
        expected = sorted(m.version for m in discover_migrations())
        assert sorted(applied) == expected  # each applied exactly once
        assert MigrationRunner(service).pending_migrations() == []
    finally:
        service.close_all()
