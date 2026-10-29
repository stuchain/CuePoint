"""``/health`` answers while the library is busy (HARDEN-05, fact 5).

The app's heartbeat asks ``/health`` every 15 s and counts three misses as a dead engine. An engine
that is merely busy (a job holding the library's write lock, others waiting for it) must never look
dead: ``/health`` is answered on the server's own thread and reads no data.
"""

from __future__ import annotations

import threading
import time
import urllib.request

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.services.database_service import DatabaseService
from tests.unit.engine.test_engine_library_browse import _free_port

pytestmark = pytest.mark.unit

#: What the heartbeat's budget is built on: far less than its 10 s timeout.
ANSWER_WITHIN_SECONDS = 1.0
HOLD_SECONDS = 2.5


def test_health_answers_within_a_second_while_a_job_holds_the_write_lock(tmp_path):
    database = DatabaseService(db_path=tmp_path / "busy.db")
    with database.transaction() as connection:
        connection.execute("CREATE TABLE busy (id INTEGER PRIMARY KEY)")

    holding = threading.Event()
    release = threading.Event()
    waiting_done = threading.Event()

    def job_holding_the_lock() -> None:
        with database.transaction() as connection:  # BEGIN IMMEDIATE: the write lock
            connection.execute("INSERT INTO busy DEFAULT VALUES")
            holding.set()
            release.wait(HOLD_SECONDS + 5)

    def job_waiting_for_it() -> None:
        try:
            with database.transaction() as connection:
                connection.execute("INSERT INTO busy DEFAULT VALUES")
        finally:
            waiting_done.set()

    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token="busy-token")
    )
    holder = threading.Thread(target=job_holding_the_lock, daemon=True)
    waiter = threading.Thread(target=job_waiting_for_it, daemon=True)
    try:
        holder.start()
        assert holding.wait(5), "the first job never took the write lock"
        waiter.start()
        time.sleep(0.2)
        assert not waiting_done.is_set(), "the second job should be waiting on the lock"

        slowest = 0.0
        for _ in range(5):
            began = time.monotonic()
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/health", timeout=ANSWER_WITHIN_SECONDS + 4
            ) as response:
                assert response.status == 200
            slowest = max(slowest, time.monotonic() - began)
        assert slowest < ANSWER_WITHIN_SECONDS
        assert not waiting_done.is_set(), (
            "the lock was held for the whole of the checks"
        )
    finally:
        release.set()
        holder.join(10)
        waiter.join(10)
        server.shutdown()
        thread.join(timeout=2)
        database.close_all()
