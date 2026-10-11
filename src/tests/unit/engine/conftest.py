#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Engine tests end with the jobs they started (CLEAN-08).

Every import, refresh and match job now starts follow-up jobs of its own: a file
check and a duplicate scan. Those run on threads, and a test that ends while one
is still running hands it the next test's database and container — which is how
a stray scan came to migrate a database another test was migrating. So after
each test, the job threads that test started are given time to finish.

Threads the job store starts are named ``<type>-job-<id prefix>``. Only threads
that did not exist before the test are waited for, and the wait is bounded, so a
test that deliberately leaves a job blocked costs time rather than hanging.
"""

from __future__ import annotations

import gc
import os
import re
import socket
import subprocess
import sys
import threading
import time

import pytest

_JOB_THREAD = re.compile(r"-job-[0-9a-f]{8}$")

#: The longest the suite waits, in all, for one test's jobs.
_JOB_THREAD_PATIENCE_SECONDS = 30.0


@pytest.fixture(autouse=True)
def _job_threads_finish_with_their_test():
    before = set(threading.enumerate())
    yield
    deadline = time.monotonic() + _JOB_THREAD_PATIENCE_SECONDS
    # Looked for again after each round of joins: a job starts its follow-ups
    # as it finishes, so a list taken once missed them, and an import's
    # artwork scan ran on into the next test (5 tests in the engine suite).
    while time.monotonic() < deadline:
        started = [
            thread
            for thread in threading.enumerate()
            if thread not in before
            and _JOB_THREAD.search(thread.name)
            and thread.is_alive()
        ]
        if not started:
            break
        for thread in started:
            thread.join(max(0.0, deadline - time.monotonic()))


#: What the system said of a request's sockets while it was still unanswered.
_LIVE_REPORTS: list[str] = []

#: How long a request to an engine goes unanswered before its sockets are looked at.
_LIVE_REPORT_AFTER_SECONDS = 3.0


@pytest.fixture(autouse=True, scope="session")
def _look_at_unanswered_requests():
    """Look at a request's connection while it is still waiting for its answer.

    The Windows timeout left the engine's listener idle with nothing accepted,
    and by the time the test failed the client had closed its end, taking the
    evidence with it. So a request still unanswered after a few seconds has its
    own connection, and every socket on the engine's port, recorded then.
    """
    import http.client

    original = http.client.HTTPConnection.getresponse

    def getresponse(self, *args, **kwargs):
        def look() -> None:
            try:
                local = self.sock.getsockname() if self.sock else None
            except OSError:
                local = None
            _LIVE_REPORTS.append(
                f"request to {self.host}:{self.port} from {local}, "
                f"unanswered after {_LIVE_REPORT_AFTER_SECONDS} s\n"
                + _socket_report({self.port, *([local[1]] if local else [])})
                + "\n\nthreads then:\n"
                + _thread_stacks()
            )

        timer = threading.Timer(_LIVE_REPORT_AFTER_SECONDS, look)
        timer.daemon = True
        timer.start()
        try:
            return original(self, *args, **kwargs)
        finally:
            timer.cancel()

    http.client.HTTPConnection.getresponse = getresponse
    yield
    http.client.HTTPConnection.getresponse = original


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Name what the engine was doing when a request to it timed out.

    A request that timed out was waiting on a handler thread that is, at this
    moment, still stuck; its stack, and every other thread's, says on what.
    Rare (Windows CI, one test in a few thousand), so it is caught as it fails.
    """
    outcome = yield
    live = _LIVE_REPORTS[:]
    _LIVE_REPORTS.clear()
    if call.excinfo is None or not call.excinfo.errisinstance(TimeoutError):
        return
    if live:
        outcome.get_result().sections.append(
            ("sockets while the request waited", "\n\n".join(live))
        )
    outcome.get_result().sections.append(
        ("threads when the request timed out", _thread_stacks())
    )
    report = outcome.get_result()
    ports = _engine_ports(item)
    report.sections.append(
        ("sockets when the request timed out", _socket_report(ports))
    )


def _thread_stacks() -> str:
    """Every thread's name and stack, as it is now."""
    import traceback

    names = {thread.ident: thread.name for thread in threading.enumerate()}
    return "\n".join(
        f"--- {names.get(ident, '?')} ({ident})\n"
        + "".join(traceback.format_stack(frame))
        for ident, frame in sys._current_frames().items()
    )


_URL_PORT = re.compile(r"^https?://(?:127\.0\.0\.1|localhost):(\d+)")


def _engine_ports(item) -> set[int]:
    """The ports of the engines this test was talking to, from its fixtures."""
    ports: set[int] = set()
    for value in getattr(item, "funcargs", {}).values():
        values = value if isinstance(value, (tuple, list)) else (value,)
        for one in values:
            if isinstance(one, str) and (found := _URL_PORT.match(one)):
                ports.add(int(found.group(1)))
            address = getattr(one, "server_address", None)
            if isinstance(address, tuple) and len(address) >= 2:
                ports.add(int(address[1]))
    return ports


def _socket_report(ports: set[int]) -> str:
    """Every socket this process holds, and what the system says of the ports.

    The Windows timeout (a5a4abb) left serve_forever idle in select with no
    handler thread: the request's connection never reached the engine's
    listening socket. Who else holds the port, and in what state, says why.
    """
    lines = [
        f"engine ports: {sorted(ports) or 'none found'}",
        "",
        f"this process ({os.getpid()}):",
    ]
    for obj in gc.get_objects():
        if not isinstance(obj, socket.socket):
            continue
        try:
            fd = obj.fileno()
            local = obj.getsockname() if fd != -1 else None
            try:
                remote = obj.getpeername() if fd != -1 else None
            except OSError:
                remote = None
            lines.append(
                f"  fd={fd} local={local} remote={remote} {type(obj).__name__}"
            )
        except OSError as error:
            lines.append(f"  {type(obj).__name__}: {error}")
    lines += ["", "the system:"]
    if sys.platform == "win32":
        command = ["netstat", "-ano", "-p", "TCP"]
    elif sys.platform == "darwin":
        command = ["lsof", "-nP", "-iTCP"]
    else:
        command = ["ss", "-tanp"]
    try:
        output = subprocess.run(
            command, capture_output=True, text=True, timeout=20, check=False
        ).stdout
    except (OSError, subprocess.SubprocessError) as error:
        return "\n".join([*lines, f"  {command[0]} failed: {error}"])
    wanted = [f":{port}" for port in ports]
    lines += [
        "  " + line.strip()
        for line in output.splitlines()
        if not wanted
        or any(f"{port} " in line + " " or f"{port}->" in line for port in wanted)
    ]
    return "\n".join(lines)
