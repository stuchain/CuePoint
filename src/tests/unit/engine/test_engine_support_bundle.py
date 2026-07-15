"""Tests for support bundle engine API (Phase 7)."""

import json
import socket
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _post_json(url: str, body: dict, token: str) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def test_support_bundle_requires_output_dir():
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token="secret")
    server, thread = start_engine_thread(config)
    try:
        url = f"http://127.0.0.1:{port}/api/v1/support/bundle"
        with pytest.raises(urllib.error.HTTPError) as exc:
            _post_json(url, {}, "secret")
        assert exc.value.code == 400
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_support_bundle_generates_zip():
    port = _free_port()
    config = EngineConfig(host="127.0.0.1", port=port, token="secret")
    server, thread = start_engine_thread(config)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            url = f"http://127.0.0.1:{port}/api/v1/support/bundle"
            payload = _post_json(
                url,
                {"output_dir": tmp, "include_logs": True, "include_config": True, "sanitize": True},
                "secret",
            )
            bundle_path = Path(payload["bundle_path"])
            assert bundle_path.exists()
            assert bundle_path.suffix == ".zip"
            assert payload["file_name"] == bundle_path.name
            assert payload["size_bytes"] > 0
    finally:
        server.shutdown()
        thread.join(timeout=2)
