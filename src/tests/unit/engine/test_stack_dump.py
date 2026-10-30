"""The engine's thread stacks on request, for an end-to-end spec whose engine stopped answering."""

from __future__ import annotations

import socket
import threading
import time
from pathlib import Path

from cuepoint.engine.server import (
    STACK_DUMP_FILE,
    STACK_DUMP_REQUEST,
    watch_stack_dump_requests,
)


class _Server:
    def __init__(self) -> None:
        self.socket = socket.socket()


def test_a_request_file_is_answered_with_every_thread_and_the_socket(
    tmp_path: Path,
) -> None:
    server = _Server()
    stop = threading.Event()
    watcher = watch_stack_dump_requests(server, tmp_path, poll_seconds=0.02, stop=stop)
    try:
        (tmp_path / STACK_DUMP_REQUEST).write_text("", encoding="utf-8")
        dump = tmp_path / STACK_DUMP_FILE
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not (
            dump.exists() and "Thread" in dump.read_text(encoding="utf-8")
        ):
            time.sleep(0.02)
        text = dump.read_text(encoding="utf-8")
    finally:
        # Stopped and joined: a watcher left polling would stat files under later tests.
        stop.set()
        watcher.join(timeout=5)
        server.socket.close()
    assert not watcher.is_alive()
    assert "listening socket fileno" in text
    assert "test-stack-dump" in text
    assert "MainThread" in text
    assert not (tmp_path / STACK_DUMP_REQUEST).exists()
