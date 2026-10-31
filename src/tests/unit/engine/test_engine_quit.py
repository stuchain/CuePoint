#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The engine ends itself when the app asks it to quit.

On Windows the packaged engine is a one-file build: its bootloader unpacks it
into the temp folder and deletes that copy only once the engine has ended by
itself. The app ended it with ``taskkill /F``, which ends the bootloader too, so
every stop left a whole engine in the temp folder; the test.5 release runner's
disk filled with them (10-30). The app now asks first (``POST /api/v1/engine/quit``).
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine import server as engine_server
from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import QUIT_PATH, EngineConfig, start_engine_thread

pytestmark = pytest.mark.unit

SRC = Path(__file__).resolve().parents[3]
TOKEN = "engine-quit-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _post(port: int, path: str, token: str | None = TOKEN) -> int:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}", data=b"", method="POST"
    )
    if token is not None:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)


def _healthy(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1):
            return True
    except OSError:
        return False


def _wait_until(predicate, timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


class TestTheRoute:
    def test_it_needs_the_token_and_then_stops_the_server_and_ends_the_process(
        self, monkeypatch
    ):
        closed: list[int] = []
        monkeypatch.setattr(
            "cuepoint.services.analysis_worker_client.close_shared_worker",
            lambda: closed.append(1),
        )
        port = _free_port()
        server, thread = start_engine_thread(
            EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=JobStore()
        )
        ended: list[int] = []
        server.end_process = lambda: ended.append(1)  # type: ignore[attr-defined]
        try:
            assert _post(port, QUIT_PATH, token=None) == 401
            assert _healthy(port)

            assert _post(port, QUIT_PATH) == 202
            assert _wait_until(lambda: bool(ended), timeout=5)
            assert closed == [1], "the worker is told to finish before the exit"
            assert not _healthy(port)
        finally:
            thread.join(timeout=2)

    def test_a_test_engine_without_an_end_only_stops_its_server(self, monkeypatch):
        """``start_engine_thread`` sets no ``end_process``: a quit must not end pytest."""
        monkeypatch.setattr(
            "cuepoint.services.analysis_worker_client.close_shared_worker", lambda: None
        )
        port = _free_port()
        server, thread = start_engine_thread(
            EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=JobStore()
        )
        assert not hasattr(server, "end_process")
        assert _post(port, QUIT_PATH) == 202
        thread.join(timeout=5)
        assert not thread.is_alive()
        assert engine_server.QUIT_PATH == "/api/v1/engine/quit"


class TestTheProcess:
    def test_a_running_engine_exits_by_itself_with_code_0(self, tmp_path):
        """What lets a one-file bootloader delete its unpacked copy: the engine's own exit."""
        port = _free_port()
        env = {
            **os.environ,
            "CUEPOINT_HOME": str(tmp_path),
            "CUEPOINT_PORT": str(port),
            "CUEPOINT_TOKEN": TOKEN,
            "PYTHONPATH": str(SRC),
        }
        env.pop("CUEPOINT_PARENT_PID", None)
        process = subprocess.Popen(
            [sys.executable, "-m", "cuepoint.engine"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            assert _wait_until(lambda: _healthy(port), timeout=60)
            assert _post(port, QUIT_PATH) == 202
            assert process.wait(15) == 0
        finally:
            if process.poll() is None:
                if sys.platform == "win32":
                    subprocess.run(
                        ["taskkill", "/T", "/F", "/PID", str(process.pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                process.kill()
                process.wait(10)
