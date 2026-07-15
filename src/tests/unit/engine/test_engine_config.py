"""Tests for engine Beatport token config API (Phase E)."""

import json
import socket
import urllib.request
from pathlib import Path
from unittest.mock import patch

from cuepoint.engine.config_api import mask_token
from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _auth_request(url: str, token: str, *, data: bytes | None = None, method: str = "GET"):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=10)


def test_mask_token_hides_value():
    assert mask_token("abcdefgh") == "••••efgh"
    assert mask_token("") == ""


def test_beatport_token_get_set_and_test(tmp_path: Path):
    config_file = tmp_path / "config.yaml"
    port = _free_port()
    token = "config-test-token"
    server, thread = start_engine_thread(EngineConfig(host="127.0.0.1", port=port, token=token))
    base = f"http://127.0.0.1:{port}"

    with patch("cuepoint.engine.config_api._get_config_service") as mock_get_service:
        from cuepoint.services.config_service import ConfigService

        service = ConfigService(config_file=config_file)
        mock_get_service.return_value = service

        try:
            with _auth_request(f"{base}/api/v1/config/beatport-token", token) as resp:
                status = json.loads(resp.read().decode("utf-8"))
            assert status == {"configured": False, "masked": None}

            payload = json.dumps({"token": "beatport-secret-token"}).encode("utf-8")
            with _auth_request(
                f"{base}/api/v1/config/beatport-token",
                token,
                data=payload,
                method="POST",
            ) as resp:
                saved = json.loads(resp.read().decode("utf-8"))
            assert saved["configured"] is True
            assert saved["masked"] == "••••oken"

            with _auth_request(f"{base}/api/v1/config/beatport-token", token) as resp:
                loaded = json.loads(resp.read().decode("utf-8"))
            assert loaded["configured"] is True
            assert "token" not in loaded

            with patch("requests.get") as mock_get:
                mock_get.return_value.status_code = 200
                with _auth_request(
                    f"{base}/api/v1/config/beatport-token/test",
                    token,
                    data=b"{}",
                    method="POST",
                ) as resp:
                    tested = json.loads(resp.read().decode("utf-8"))
            assert tested == {"ok": True, "message": "Token OK"}
        finally:
            server.shutdown()
            thread.join(timeout=2)

    assert service.get("incrate.beatport_access_token") == "beatport-secret-token"
