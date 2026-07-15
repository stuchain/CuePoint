"""Tests for engine inCrate inventory API (Phase 3 P1)."""

import json
import socket
import urllib.request

from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_incrate_inventory_demo_endpoint():
    port = _free_port()
    token = "incrate-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/v1/incrate/inventory?demo=true",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            assert resp.status == 200
            payload = json.loads(resp.read().decode("utf-8"))
        assert payload["stats"]["total"] == 3
        assert len(payload["rows"]) == 3
        assert payload["demo"] is True
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_incrate_inventory_live_empty_db():
    port = _free_port()
    token = "incrate-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/v1/incrate/inventory?limit=10",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert "stats" in payload
        assert "rows" in payload
        assert isinstance(payload["rows"], list)
    finally:
        server.shutdown()
        thread.join(timeout=2)
