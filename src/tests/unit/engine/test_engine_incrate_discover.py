"""Tests for engine inCrate discover + playlist API."""

import json
import socket
import urllib.error
import urllib.request

from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _auth_request(
    url: str, token: str, *, data: bytes | None = None, method: str = "GET"
):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=10)


def test_incrate_discover_options_endpoint():
    port = _free_port()
    token = "incrate-discover-token"
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=token)
    )
    base = f"http://127.0.0.1:{port}"
    try:
        with _auth_request(f"{base}/api/v1/incrate/discover/options", token) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert "inventory_stats" in payload
        assert "genres" in payload
        assert "defaults" in payload
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_incrate_discover_demo_endpoint():
    port = _free_port()
    token = "incrate-discover-token"
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=token)
    )
    base = f"http://127.0.0.1:{port}"
    try:
        with _auth_request(
            f"{base}/api/v1/incrate/discover",
            token,
            data=json.dumps({"demo": True}).encode("utf-8"),
            method="POST",
        ) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert payload["demo"] is True
        assert payload["count"] == 2
        assert len(payload["tracks"]) == 2
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_incrate_playlist_requires_name():
    port = _free_port()
    token = "incrate-discover-token"
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=token)
    )
    base = f"http://127.0.0.1:{port}"
    try:
        try:
            _auth_request(
                f"{base}/api/v1/incrate/playlist",
                token,
                data=json.dumps({"tracks": []}).encode("utf-8"),
                method="POST",
            )
        except urllib.error.HTTPError as exc:
            assert exc.code == 400
        else:
            raise AssertionError("Expected HTTP 400 for missing playlist name")
    finally:
        server.shutdown()
        thread.join(timeout=2)
