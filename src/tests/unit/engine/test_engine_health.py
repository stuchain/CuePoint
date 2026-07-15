"""Tests for cuepoint.engine (Spike S1)."""

import json
import socket
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.server import (
    EngineConfig,
    health_payload,
    start_engine_thread,
)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_engine_config_rejects_public_bind():
    with pytest.raises(ValueError, match="loopback"):
        EngineConfig(host="0.0.0.0", port=8765)


def test_health_endpoint_returns_ok():
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token="test-token")
    server, thread = start_engine_thread(config)
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
        assert data["status"] == "ok"
        assert data["version"] == health_payload()["version"]
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_health_includes_session_id_from_env(monkeypatch):
    port = _free_port()
    monkeypatch.setenv("CUEPOINT_SESSION_ID", "session-abc-123")
    config = EngineConfig(host="127.0.0.1", port=port, token="test-token")
    server, thread = start_engine_thread(config)
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        assert data.get("session_id") == "session-abc-123"
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_status_requires_bearer_token():
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token="secret")
    server, thread = start_engine_thread(config)
    try:
        url = f"http://127.0.0.1:{port}/api/v1/status"
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(url, timeout=2)
        assert exc.value.code == 401

        req = urllib.request.Request(
            url,
            headers={"Authorization": "Bearer secret"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        assert data["ready"] is True
    finally:
        server.shutdown()
        thread.join(timeout=2)
