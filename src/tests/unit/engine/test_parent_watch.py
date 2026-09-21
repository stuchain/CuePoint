#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine ends when the app that started it has gone.

Found in EXPORT-07's packaged runs: an engine left running after its app, on
its port and holding the library database, with nothing that could reach it.
These prove the watch against real processes — a stand-in for the app is
started, the engine is told its id, and the stand-in is killed the way a crash
or End Task kills an app, with no chance to clean anything up.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine import parent_watch
from cuepoint.engine.parent_watch import (
    PARENT_PID_ENV,
    is_alive,
    parent_pid_from_env,
    watch_parent,
)

pytestmark = pytest.mark.unit

SRC = Path(__file__).resolve().parents[3]


def stand_in() -> subprocess.Popen:
    """A process that waits to be killed, standing in for the app."""
    return subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(120)"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def stop_tree(process: subprocess.Popen) -> None:
    """Stop a process and what it started.

    A virtual environment's ``python.exe`` on Windows is a launcher that runs
    the real interpreter as its child, so killing the launcher alone would
    leave the child behind — the very leak these tests are about.
    """
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/T", "/F", "/PID", str(process.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    if process.poll() is None:
        process.kill()
    process.wait(10)


def ended(process: subprocess.Popen) -> int:
    stop_tree(process)
    return process.pid


def wait_until(predicate, timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


class TestWhichProcessIsWatched:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("4242", 4242),
            (" 4242 ", 4242),
            ("1", 1),
        ],
    )
    def test_a_process_id_is_read(self, raw, expected):
        assert parent_pid_from_env({PARENT_PID_ENV: raw}) == expected

    @pytest.mark.parametrize("raw", ["", "  ", "0", "-5", "12a", "4.2", "²", "0x10"])
    def test_anything_else_watches_nothing_and_does_not_stop_the_engine(self, raw):
        assert parent_pid_from_env({PARENT_PID_ENV: raw}) is None

    def test_no_variable_watches_nothing(self):
        """The CLI, the tests and a hand-started engine behave as before."""
        assert parent_pid_from_env({}) is None


class TestIsAlive:
    def test_this_process_is_alive(self):
        assert is_alive(os.getpid()) is True

    def test_a_running_process_is_alive_and_is_not_harmed_by_asking(self):
        """On Windows, ``os.kill(pid, 0)`` would have terminated it."""
        process = stand_in()
        try:
            assert is_alive(process.pid) is True
            time.sleep(0.2)
            assert process.poll() is None
        finally:
            ended(process)

    def test_a_process_that_has_ended_is_not(self):
        assert is_alive(ended(stand_in())) is False


class TestTheWatch:
    def test_it_answers_once_the_process_is_killed(self):
        process = stand_in()
        gone = threading.Event()
        calls = []

        def on_gone():
            calls.append(1)
            gone.set()

        watch_parent(process.pid, on_gone, poll_seconds=0.05)
        time.sleep(0.3)
        assert not gone.is_set(), "answered while the process was still running"

        ended(process)
        assert gone.wait(10)
        time.sleep(0.2)
        assert calls == [1]

    def test_a_process_already_gone_is_answered_at_once(self):
        gone = threading.Event()
        watch_parent(ended(stand_in()), gone.set, poll_seconds=0.05)
        assert gone.wait(10)

    def test_the_watch_never_keeps_the_engine_alive(self):
        process = stand_in()
        try:
            thread = watch_parent(process.pid, lambda: None, poll_seconds=0.05)
            assert thread.daemon is True
        finally:
            ended(process)

    @pytest.mark.skipif(sys.platform != "win32", reason="the handle is Windows's")
    def test_on_windows_the_process_is_held_by_a_handle(self, monkeypatch):
        """Opened once, at the start, so a reused id cannot pass for the app."""
        opened = []
        real = parent_watch._WindowsProcess

        class Counting(real):  # type: ignore[misc, valid-type]
            def __init__(self, pid: int) -> None:
                opened.append(pid)
                super().__init__(pid)

        monkeypatch.setattr(parent_watch, "_WindowsProcess", Counting)
        process = stand_in()
        gone = threading.Event()
        watch_parent(process.pid, gone.set, poll_seconds=0.05)
        time.sleep(0.3)
        ended(process)
        assert gone.wait(10)
        assert opened == [process.pid]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _engine(home: Path, port: int, parent: int | None) -> subprocess.Popen:
    env = {
        **os.environ,
        "CUEPOINT_HOME": str(home),
        "CUEPOINT_PORT": str(port),
        "CUEPOINT_TOKEN": "parent-watch-token",
        "PYTHONPATH": str(SRC),
    }
    env.pop(PARENT_PID_ENV, None)
    if parent is not None:
        env[PARENT_PID_ENV] = str(parent)
    return subprocess.Popen(
        [sys.executable, "-m", "cuepoint.engine"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _healthy(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1):
            return True
    except OSError:
        return False


class TestTheEngine:
    def test_it_exits_when_the_app_that_started_it_is_killed(self, tmp_path):
        """The regression: before the watch, this engine ran until the machine
        restarted."""
        app = stand_in()
        port = _free_port()
        engine = _engine(tmp_path, port, app.pid)
        try:
            assert wait_until(lambda: _healthy(port), 60), "the engine never started"
            ended(app)
            assert wait_until(lambda: engine.poll() is not None, 20), (
                "the engine outlived the app that started it"
            )
            assert not _healthy(port)
        finally:
            stop_tree(engine)

    def test_it_keeps_serving_while_the_app_is_there(self, tmp_path):
        app = stand_in()
        port = _free_port()
        engine = _engine(tmp_path, port, app.pid)
        try:
            assert wait_until(lambda: _healthy(port), 60), "the engine never started"
            time.sleep(1.5)
            assert engine.poll() is None
            assert _healthy(port)
        finally:
            stop_tree(engine)
            ended(app)

    def test_without_the_variable_nothing_is_watched(self, tmp_path):
        port = _free_port()
        engine = _engine(tmp_path, port, None)
        try:
            assert wait_until(lambda: _healthy(port), 60), "the engine never started"
            time.sleep(1.5)
            assert engine.poll() is None
        finally:
            stop_tree(engine)
