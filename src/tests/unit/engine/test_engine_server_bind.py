"""The engine binds its socket without asking the network who it is.

``http.server.HTTPServer.server_bind`` calls ``socket.getfqdn(host)`` to fill in
``server_name``. That is a reverse DNS lookup, and on some macOS runners it
blocks for tens of seconds, so the engine took that long to start listening.
Nothing in the engine reads ``server_name``, so the lookup is pure cost.
"""

from __future__ import annotations

import socket
import urllib.request

import pytest

from cuepoint.engine import server as server_module
from cuepoint.engine.server import EngineConfig


pytestmark = pytest.mark.unit


def _refuse(*_args, **_kwargs):
    raise AssertionError("socket.getfqdn was called: a reverse DNS lookup at bind")


def test_the_engine_server_binds_without_a_reverse_dns_lookup(monkeypatch):
    monkeypatch.setattr(socket, "getfqdn", _refuse)
    server = server_module.ThreadingHTTPServer(
        ("127.0.0.1", 0),
        server_module.make_handler(
            EngineConfig(host="127.0.0.1", port=_free_port(), token="t")
        ),
    )
    try:
        host, port = server.server_address[:2]
        assert port != 0
        assert server.server_name == host == "127.0.0.1"
        assert server.server_port == port
    finally:
        server.server_close()


def test_a_server_bound_that_way_still_serves(monkeypatch):
    monkeypatch.setattr(socket, "getfqdn", _refuse)
    server, _thread = server_module.start_engine_thread(
        EngineConfig(host="127.0.0.1", port=_free_port(), token="t")
    )
    try:
        port = server.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health") as response:
            assert response.status == 200
    finally:
        server.shutdown()
        server.server_close()


def test_the_engine_server_queues_a_page_worth_of_connections():
    # Windows refuses a connection past the backlog instead of letting the
    # client retry; the stdlib default of 5 left Library pages with "fetch failed".
    assert server_module.ThreadingHTTPServer.request_queue_size >= 128


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_an_engine_started_for_a_test_shuts_down_without_waiting_out_a_poll(
    monkeypatch,
):
    """``shutdown()`` waits for ``serve_forever``'s poll, 0.5s by default.

    Over a thousand engine tests each paid it at teardown, which was most of
    the engine suite's run time (and a Windows runner's whole time budget).
    """
    import time

    server, _thread = server_module.start_engine_thread(
        EngineConfig(host="127.0.0.1", port=_free_port(), token="t")
    )
    try:
        time.sleep(0.1)  # let serve_forever settle into its poll
        started = time.perf_counter()
        server.shutdown()
        elapsed = time.perf_counter() - started
    finally:
        server.server_close()
    assert elapsed < 0.25, f"shutdown took {elapsed:.2f}s"
