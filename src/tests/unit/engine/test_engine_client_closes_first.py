"""The client closes the connection first, so the engine's port keeps no TIME_WAIT.

The engine answers HTTP/1.0 and closed every connection itself, so every
request left a TIME_WAIT on the engine's own port for 30 s on macOS. A client
connecting again from a port one of those still held met the old connection:
on GitHub's macOS runners a search during a 1,000-track match once took exactly
1.00 s to connect, a SYN retransmitted, while one connection at a time was open
and the listen queue could not have been full (DEC-223). The engine now waits,
briefly, for the client to close first.
"""

from __future__ import annotations

import socket
import time

import pytest

from cuepoint.engine import server as server_module
from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread

pytestmark = pytest.mark.unit


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
def port():
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token="t"), store=JobStore()
    )
    try:
        yield port
    finally:
        server.shutdown()
        thread.join(timeout=2)


def _answer(sock: socket.socket) -> bytes:
    """Read one answer by its Content-Length, as the app's client does."""
    data = b""
    while b"\r\n\r\n" not in data:
        data += sock.recv(4096)
    head, body = data.split(b"\r\n\r\n", 1)
    length = next(
        int(line.split(b":", 1)[1])
        for line in head.split(b"\r\n")
        if line.lower().startswith(b"content-length:")
    )
    while len(body) < length:
        body += sock.recv(4096)
    return head


def test_the_engine_does_not_close_an_answered_connection_before_the_client(port):
    with socket.create_connection(("127.0.0.1", port), timeout=5) as sock:
        sock.sendall(b"GET /health HTTP/1.0\r\n\r\n")
        assert b" 200 " in _answer(sock)
        # The engine closing first is an end of stream here.
        sock.settimeout(0.2)
        with pytest.raises(socket.timeout):
            sock.recv(1)


def test_a_client_that_reads_until_the_close_still_gets_it(port, monkeypatch):
    monkeypatch.setattr(server_module, "CLIENT_CLOSES_FIRST_SECONDS", 0.05)
    with socket.create_connection(("127.0.0.1", port), timeout=5) as sock:
        sock.sendall(b"GET /health HTTP/1.0\r\n\r\n")
        began = time.monotonic()
        data = b""
        while chunk := sock.recv(4096):
            data += chunk
    assert b" 200 " in data
    assert time.monotonic() - began < 2.0


def test_the_wait_ends_when_the_client_closes():
    left, right = socket.socketpair()
    try:
        right.close()
        began = time.monotonic()
        assert server_module.wait_for_client_to_close(left, timeout=5) is True
        assert time.monotonic() - began < 1.0
    finally:
        left.close()


def test_the_wait_gives_up_on_a_client_that_stays():
    left, right = socket.socketpair()
    try:
        assert server_module.wait_for_client_to_close(left, timeout=0.05) is False
    finally:
        left.close()
        right.close()
