#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Waiting for a busy library (CLEAN-07, Sentry PYTHON-1N).

What is worth a test, and why:

- **Only "busy" is tried again**, and anything else is raised at once: a real
  failure that was retried for thirty seconds would hide behind a spinner.
- **The patience is kept**, and the last busy answer is what is raised.
- **``retry_while_busy`` opens no transaction**, so it can wrap work that opens
  one of its own that does not join; ``write_waiting`` opens one, as it did.
"""

from __future__ import annotations

import sqlite3
import threading
from typing import List

import pytest

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services import busy_wait
from cuepoint.services.busy_wait import database_busy, retry_while_busy, write_waiting
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit


def locked() -> sqlite3.OperationalError:
    return sqlite3.OperationalError("database is locked")


class Flaky:
    """Work that is busy ``times`` times, then answers."""

    def __init__(self, times: int, error: BaseException | None = None) -> None:
        self.left = times
        self.calls = 0
        self.error = error or locked()

    def __call__(self) -> str:
        self.calls += 1
        if self.left > 0:
            self.left -= 1
            raise self.error
        return "done"


class TestRetryWhileBusy:
    def test_busy_work_is_tried_again_until_it_answers(self):
        work = Flaky(3)
        waited: List[bool] = []

        answer = retry_while_busy(
            work,
            patience_seconds=5.0,
            interval_seconds=0.0,
            on_wait=lambda: waited.append(True),
        )

        assert answer == "done"
        assert work.calls == 4
        assert waited == [True]  # once, the first time it was busy

    def test_work_that_is_not_busy_runs_once(self):
        work = Flaky(0)
        assert retry_while_busy(work, patience_seconds=5, interval_seconds=0) == "done"
        assert work.calls == 1

    @pytest.mark.parametrize(
        "error",
        [
            ValueError("refused"),
            sqlite3.OperationalError("no such table: tracks"),
            sqlite3.IntegrityError("UNIQUE constraint failed"),
        ],
        ids=["value", "no-such-table", "integrity"],
    )
    def test_any_other_failure_is_raised_at_once(self, error):
        work = Flaky(5, error)
        with pytest.raises(type(error)):
            retry_while_busy(work, patience_seconds=5, interval_seconds=0)
        assert work.calls == 1

    def test_busy_is_raised_once_the_patience_runs_out(self):
        work = Flaky(10_000)
        with pytest.raises(sqlite3.OperationalError, match="locked"):
            retry_while_busy(work, patience_seconds=0.05, interval_seconds=0.01)
        assert 2 <= work.calls < 10_000

    def test_no_patience_tries_once(self):
        work = Flaky(1)
        with pytest.raises(sqlite3.OperationalError):
            retry_while_busy(work, patience_seconds=0, interval_seconds=0)
        assert work.calls == 1

    def test_a_busy_commit_wrapped_by_the_database_service_is_busy(self):
        wrapped = DatabaseError("commit failed", error_code="DB_COMMIT_FAILED")
        wrapped.__cause__ = locked()
        assert database_busy(wrapped)
        assert (
            retry_while_busy(Flaky(1, wrapped), patience_seconds=5, interval_seconds=0)
            == "done"
        )

    def test_the_request_patience_is_about_thirty_seconds(self):
        # Long enough for a background job's commits, short of any client timeout.
        assert busy_wait.REQUEST_PATIENCE_SECONDS == 30.0
        assert 0 < busy_wait.REQUEST_INTERVAL_SECONDS < 1


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(
        db_path=tmp_path / "cuepoint.db", busy_timeout_seconds=0.1
    )
    MigrationRunner(service).migrate()
    service.connect().execute("CREATE TABLE IF NOT EXISTS scratch (x INTEGER)")
    yield service
    service.close_all()


@pytest.fixture
def writer(db):
    """Another connection holding the write lock until released."""
    connection = sqlite3.connect(
        db.db_path, isolation_level=None, check_same_thread=False
    )
    connection.execute("BEGIN IMMEDIATE")
    released = threading.Event()

    def release() -> None:
        if not released.is_set():
            released.set()
            connection.execute("ROLLBACK")

    yield release
    release()
    connection.close()


def scratch(db) -> List[int]:
    return [row[0] for row in db.connect().execute("SELECT x FROM scratch")]


class TestAgainstARealLock:
    def test_a_transaction_of_its_own_waits_for_the_writer(self, db, writer):
        def work() -> int:
            # Not joining: write_waiting could not wrap this.
            with db.transaction() as conn:
                conn.execute("INSERT INTO scratch (x) VALUES (7)")
            return 7

        timer = threading.Timer(0.4, writer)
        timer.start()
        try:
            assert (
                retry_while_busy(work, patience_seconds=10, interval_seconds=0.05) == 7
            )
        finally:
            timer.join()
        assert scratch(db) == [7]

    def test_write_waiting_still_runs_its_work_in_one_transaction(self, db, writer):
        def work() -> int:
            conn = db.connect()
            conn.execute("INSERT INTO scratch (x) VALUES (8)")
            assert conn.in_transaction
            return 8

        timer = threading.Timer(0.4, writer)
        timer.start()
        try:
            assert (
                write_waiting(db, work, patience_seconds=10, interval_seconds=0.05) == 8
            )
        finally:
            timer.join()
        assert scratch(db) == [8]

    def test_a_writer_that_never_lets_go_leaves_nothing_written(self, db, writer):
        def work() -> None:
            with db.transaction() as conn:
                conn.execute("INSERT INTO scratch (x) VALUES (9)")

        with pytest.raises(Exception) as raised:
            retry_while_busy(work, patience_seconds=0.3, interval_seconds=0.05)
        assert database_busy(raised.value)
        writer()
        assert scratch(db) == []
