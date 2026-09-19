#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""``close_all`` and other threads' connections (found in CLEAN-14, twice).

**What broke first.** Restoring a backup failed on Windows with "the process
cannot access the file" for the database's ``-wal`` file whenever another
thread had used the database — an artwork scan's workers, an import, an HTTP
request — even after that thread had ended. The restore's safety copy was taken
and nothing was lost, but no restore could succeed.

**Why.** Connections are per thread and were opened with SQLite's
``check_same_thread`` on. Closing one from another thread raised
``ProgrammingError``, which ``close_all`` swallowed as an ordinary
``sqlite3.Error``: the connection stayed open, holding the file.

**What broke second.** The obvious fix — turn the check off and close every
connection — crashed the test process: closing a connection while its own
thread is running a statement is a native crash, not an exception. So
``close_all`` closes only what no thread can still be using — its caller's and
those of threads that have ended — and a live thread closes its own on its next
use.

**Why it is easy to bring back.** Nothing looks wrong either way round: on
Linux and macOS an open handle does not stop a file being replaced, and the
crash needs a live thread mid-statement at the moment of the close.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

import pytest

from cuepoint.services.database_service import DatabaseService


def on_a_thread(fn):
    """Run ``fn`` on a new thread to its end, returning what it returned or raised."""
    outcome = {}

    def run():
        try:
            outcome["value"] = fn()
        except BaseException as exc:  # noqa: BLE001 — handed back to the test
            outcome["error"] = exc

    thread = threading.Thread(target=run)
    thread.start()
    thread.join(timeout=10)
    if "error" in outcome:
        raise outcome["error"]
    return outcome.get("value")


class Worker:
    """A long-lived thread that runs what it is given, like a pool worker."""

    def __init__(self) -> None:
        self._jobs: list = []
        self._ready = threading.Condition()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while True:
            with self._ready:
                while not self._jobs:
                    self._ready.wait()
                fn, done, box = self._jobs.pop(0)
            if fn is None:
                done.set()
                return
            try:
                box["value"] = fn()
            except BaseException as exc:  # noqa: BLE001 — handed back
                box["error"] = exc
            done.set()

    def run(self, fn):
        done = threading.Event()
        box: dict = {}
        with self._ready:
            self._jobs.append((fn, done, box))
            self._ready.notify()
        assert done.wait(10)
        if "error" in box:
            raise box["error"]
        return box.get("value")

    def stop(self) -> None:
        done = threading.Event()
        with self._ready:
            self._jobs.append((None, done, {}))
            self._ready.notify()
        done.wait(10)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "library.db")
    with service.transaction():
        service.connect().execute("CREATE TABLE t (v INTEGER)")
    yield service
    service.close_all()


def test_a_thread_that_ended_leaves_nothing_open(db, tmp_path):
    on_a_thread(lambda: db.connect().execute("INSERT INTO t VALUES (2)"))
    db.close_all()

    # What a restore does on Windows: an open handle refuses this.
    for suffix in ("", "-wal", "-shm"):
        path = Path(str(db.db_path) + suffix)
        if path.exists():
            path.replace(tmp_path / f"moved{suffix or '.db'}")


def test_the_connections_of_many_ended_threads_are_all_closed(db, tmp_path):
    for n in range(8):
        on_a_thread(lambda n=n: db.connect().execute("INSERT INTO t VALUES (?)", (n,)))
    db.close_all()
    Path(str(db.db_path)).replace(tmp_path / "moved.db")


def test_a_live_threads_connection_is_left_to_it_and_reopened(db):
    worker = Worker()
    try:
        first = worker.run(db.connect)
        worker.run(lambda: first.execute("INSERT INTO t VALUES (1)"))

        db.close_all()

        # Not closed under the thread: it could have been mid-statement.
        assert worker.run(lambda: first.execute("SELECT 1").fetchone()[0]) == 1
        # On its next use it gets a fresh one, and its old one is closed.
        second = worker.run(db.connect)
        assert second is not first
        assert (
            worker.run(lambda: second.execute("SELECT COUNT(*) FROM t").fetchone()[0])
            == 1
        )
        with pytest.raises(sqlite3.ProgrammingError, match="closed"):
            worker.run(lambda: first.execute("SELECT 1"))
    finally:
        worker.stop()


def test_close_all_never_closes_a_connection_in_use(db):
    # The crash: a thread running statements while close_all runs beside it.
    stop = threading.Event()
    errors: list = []

    def busy():
        try:
            while not stop.is_set():
                connection = db.connect()
                connection.execute("SELECT COUNT(*) FROM t").fetchone()
        except BaseException as exc:  # noqa: BLE001 — reported below
            errors.append(exc)

    thread = threading.Thread(target=busy)
    thread.start()
    try:
        for _ in range(200):
            db.close_all()
    finally:
        stop.set()
        thread.join(timeout=10)
    assert errors == []


def test_the_calling_threads_own_connection_is_reopened_too(db):
    first = db.connect()
    db.close_all()
    second = db.connect()
    assert second is not first
    assert second.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 0
