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


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]
