#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine stopped answering while another thread computed (DEC-221).

**What broke.** On GitHub's Windows runners an engine request sometimes got no
answer for 5 s or more: a library search during a 1,000-track match, a blank
browse, a Set suggestion read. On an Intel Mac, in the packaged app, inserting a
track into a Set took 8 to 14 s to show while a match job had just started. Nothing
failed and nothing was logged; the same request alone took 10 ms.

**Why.** Nothing was locked. A request gives up the interpreter's lock hundreds of
times (SQLite releases it for every statement and every row, the socket for every
read and write), and each time it has to get it back. While another thread is
computing in Python, getting it back means waiting until that thread is asked to
stop, which Python does after its switch interval: 5 ms by default, and 15.6 ms on
Windows, whose timed waits round up to its timer. Hundreds of returns at 5 or
15.6 ms each are seconds. The engine now runs with a 0.5 ms interval.

**Why it is easy to bring back.** Every request is fast on its own and every busy
thread is fine on its own; only the two together are slow, and only by as much as
the machine is slow. The test starts its busy thread before the engine, the order
in which the delay showed most reliably.
"""

from __future__ import annotations

import http.client
import socket
import sys
import threading
import time
import urllib.parse

import pytest

from cuepoint.engine import jobs as jobs_module
from cuepoint.engine.server import (
    ENGINE_SWITCH_INTERVAL_SECONDS,
    EngineConfig,
    start_engine_thread,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import (
    IDatabaseService,
    IMigrationRunner,
    ITrackRepository,
)
from cuepoint.utils.di_container import get_container, reset_container

TOKEN = "busy-thread-token"

#: What the test the delay was found by allows a search during a match.
ANSWER_WITHIN_SECONDS = 1.0


@pytest.fixture
def library(tmp_path, monkeypatch):
    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    monkeypatch.setattr(jobs_module, "_services_bootstrapped", True)
    reset_container()
    bootstrap_services()
    container = get_container()
    container.resolve(IMigrationRunner).migrate()
    container.resolve(ITrackRepository).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/music/{i:04d}.mp3",
                title=f"Track {i:04d}",
                artist=f"Artist {i % 7}",
            )
            for i in range(1, 1_001)
        ]
    )
    yield container
    container.resolve(IDatabaseService).close_all()
    reset_container()


@pytest.fixture
def busy_thread():
    """A thread that computes in Python and never waits for anything."""
    stop = threading.Event()

    def compute() -> None:
        count = 0
        while not stop.is_set():
            count += 1

    thread = threading.Thread(target=compute, name="busy", daemon=True)
    thread.start()
    yield thread
    stop.set()
    thread.join(timeout=5)


@pytest.fixture
def switch_interval():
    """Put back the interval the suite had, whatever the engine set."""
    before = sys.getswitchinterval()
    yield
    sys.setswitchinterval(before)


def test_the_engine_runs_with_the_short_switch_interval(switch_interval):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        assert sys.getswitchinterval() == pytest.approx(ENGINE_SWITCH_INTERVAL_SECONDS)
    finally:
        server.shutdown()
        thread.join(timeout=5)


def test_a_search_is_answered_while_another_thread_computes(
    switch_interval, library, busy_thread
):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = int(sock.getsockname()[1])
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    query = urllib.parse.urlencode({"q": "Track 09", "limit": 50})
    answers = []
    try:
        for _ in range(5):
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
            try:
                began = time.monotonic()
                connection.request(
                    "GET",
                    f"/api/v1/library/search?{query}",
                    headers={"Authorization": f"Bearer {TOKEN}"},
                )
                response = connection.getresponse()
                response.read()
                answers.append(time.monotonic() - began)
            finally:
                connection.close()
            assert response.status == 200
    finally:
        server.shutdown()
        thread.join(timeout=5)

    assert busy_thread.is_alive()
    slowest = max(answers)
    assert slowest < ANSWER_WITHIN_SECONDS, (
        f"a search took {slowest:.2f} s beside a busy thread "
        f"(all: {', '.join(f'{a:.2f}' for a in answers)})"
    )
