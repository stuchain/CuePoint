"""Tests for engine Beatport token config API (Phase E)."""

import json
import socket
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.engine.config_api import mask_token
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.services.beatport_token import set_session_token


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


def test_mask_token_hides_value():
    assert mask_token("abcdefgh") == "••••efgh"
    assert mask_token("") == ""


@pytest.fixture(autouse=True)
def _clean_token_sources(monkeypatch):
    monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
    set_session_token(None)
    yield
    set_session_token(None)


def test_beatport_token_get_set_and_test(tmp_path: Path):
    config_file = tmp_path / "config.yaml"
    port = _free_port()
    token = "config-test-token"
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=token)
    )
    base = f"http://127.0.0.1:{port}"

    with patch("cuepoint.engine.config_api._get_config_service") as mock_get_service:
        from cuepoint.services.config_service import ConfigService

        service = ConfigService(config_file=config_file)
        mock_get_service.return_value = service

        try:
            with _auth_request(f"{base}/api/v1/config/beatport-token", token) as resp:
                status = json.loads(resp.read().decode("utf-8"))
            assert status == {"configured": False, "masked": None, "source": None}

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
            assert saved["source"] == "config"

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

            def _test_answer() -> dict:
                with _auth_request(
                    f"{base}/api/v1/config/beatport-token/test",
                    token,
                    data=b"{}",
                    method="POST",
                ) as resp:
                    return json.loads(resp.read().decode("utf-8"))

            with patch("requests.get") as mock_get:
                mock_get.return_value.status_code = 401
                assert _test_answer()["reason"] == "rejected"
                mock_get.return_value.status_code = 403
                assert _test_answer()["reason"] == "rejected"
                mock_get.return_value.status_code = 500
                answer = _test_answer()
                assert answer["ok"] is False and answer["reason"] == "unreachable"
            with patch("requests.get", side_effect=OSError("boom")):
                answer = _test_answer()
                assert answer["reason"] == "unreachable"
                assert "boom" not in answer["message"]
        finally:
            server.shutdown()
            thread.join(timeout=2)

    assert service.get("incrate.beatport_access_token") == "beatport-secret-token"


class _Engine:
    """A running engine whose config service is a real one in ``tmp_path``."""

    def __init__(self, tmp_path: Path):
        from cuepoint.services.config_service import ConfigService

        self.token = "config-test-token"
        port = _free_port()
        self.base = f"http://127.0.0.1:{port}"
        self.service = ConfigService(config_file=tmp_path / "config.yaml")
        self._patch = patch(
            "cuepoint.engine.config_api._get_config_service",
            return_value=self.service,
        )
        self.server, self.thread = start_engine_thread(
            EngineConfig(host="127.0.0.1", port=port, token=self.token)
        )

    def call(self, path: str, body=None, method: str = "GET", token="__own__"):
        data = None if body is None else json.dumps(body).encode("utf-8")
        bearer = self.token if token == "__own__" else token
        headers = {"Content-Type": "application/json"}
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        req = urllib.request.Request(
            f"{self.base}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def __enter__(self):
        self._patch.start()
        return self

    def __exit__(self, *exc):
        self._patch.stop()
        self.server.shutdown()
        self.thread.join(timeout=2)


def test_status_reflects_the_environment_variable(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", "env-token-9999")
    with _Engine(tmp_path) as engine:
        status, body = engine.call("/api/v1/config/beatport-token")
    assert status == 200
    assert body == {"configured": True, "masked": "••••9999", "source": "env"}


def test_session_put_sets_clears_and_never_echoes(tmp_path: Path):
    path = "/api/v1/config/beatport-session"
    with _Engine(tmp_path) as engine:
        status, body = engine.call(path, {"token": "session-abcd"}, "PUT")
        assert status == 200
        assert body == {"configured": True, "masked": "••••abcd", "source": "session"}
        assert "session-abcd" not in json.dumps(body)
        # The yaml is untouched: the session token lives in memory.
        assert engine.service.get("incrate.beatport_access_token") in (None, "")

        status, body = engine.call(path, {"token": None}, "PUT")
        assert status == 200
        assert body["configured"] is False and body["source"] is None


def test_precedence_is_env_then_session_then_config(tmp_path: Path, monkeypatch):
    with _Engine(tmp_path) as engine:
        engine.call("/api/v1/config/beatport-token", {"token": "config-1111"}, "POST")
        _, body = engine.call("/api/v1/config/beatport-token")
        assert body["source"] == "config"

        engine.call("/api/v1/config/beatport-session", {"token": "session-2222"}, "PUT")
        _, body = engine.call("/api/v1/config/beatport-token")
        assert (body["source"], body["masked"]) == ("session", "••••2222")

        monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", "env-3333")
        _, body = engine.call("/api/v1/config/beatport-token")
        assert (body["source"], body["masked"]) == ("env", "••••3333")

        monkeypatch.delenv("BEATPORT_ACCESS_TOKEN")
        engine.call("/api/v1/config/beatport-session", {"token": None}, "PUT")
        _, body = engine.call("/api/v1/config/beatport-token")
        assert body["source"] == "config"


def test_session_put_rejects_bad_bodies(tmp_path: Path):
    path = "/api/v1/config/beatport-session"
    with _Engine(tmp_path) as engine:
        for bad in ({}, {"token": 5}, [1]):
            status, body = engine.call(path, bad, "PUT")
            assert status == 400
            assert body["error"]["code"] == "INVALID_REQUEST"


def test_take_legacy_returns_the_config_token_then_null_after_blanking(
    tmp_path: Path,
):
    with _Engine(tmp_path) as engine:
        path = "/api/v1/config/beatport-token/take-legacy"
        assert engine.call(path, {}, "POST") == (200, {"token": None})
        engine.call("/api/v1/config/beatport-token", {"token": "legacy-7777"}, "POST")
        assert engine.call(path, {}, "POST") == (200, {"token": "legacy-7777"})
        engine.call("/api/v1/config/beatport-token", {"token": ""}, "POST")
        assert engine.call(path, {}, "POST") == (200, {"token": None})


def test_the_new_routes_need_the_bearer(tmp_path: Path):
    with _Engine(tmp_path) as engine:
        for path, method in (
            ("/api/v1/config/beatport-session", "PUT"),
            ("/api/v1/config/beatport-token/take-legacy", "POST"),
        ):
            for bearer in (None, "wrong"):
                status, body = engine.call(path, {"token": "x"}, method, token=bearer)
                assert status == 401
                assert body["error"]["code"] == "UNAUTHORIZED"


def test_take_legacy_is_refused_by_an_engine_with_no_bearer(tmp_path: Path):
    from cuepoint.services.config_service import ConfigService

    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token="")
    )
    service = ConfigService(config_file=tmp_path / "config.yaml")
    service.set("incrate.beatport_access_token", "legacy-secret-1")
    try:
        with patch(
            "cuepoint.engine.config_api._get_config_service", return_value=service
        ):
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/v1/config/beatport-token/take-legacy",
                data=b"{}",
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            try:
                urllib.request.urlopen(req, timeout=10)
                raise AssertionError("expected a refusal")
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8")
                assert exc.code == 403
                assert "legacy-secret-1" not in body
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_session_and_config_tokens_join_the_report_scrub(tmp_path: Path):
    from cuepoint.reporting import engine_reporting
    from cuepoint.reporting.scrub import scrub_text

    before = engine_reporting._scrub_context
    engine_reporting._scrub_context = None
    try:
        with _Engine(tmp_path) as engine:
            engine.call(
                "/api/v1/config/beatport-session", {"token": "sess-secret-0001"}, "PUT"
            )
            engine.call(
                "/api/v1/config/beatport-token", {"token": "cfg-secret-0002"}, "POST"
            )
        ctx = engine_reporting._context()
        text = scrub_text("failed with sess-secret-0001 and cfg-secret-0002", ctx)
        assert "sess-secret-0001" not in text
        assert "cfg-secret-0002" not in text
    finally:
        engine_reporting._scrub_context = before


def test_session_push_forgets_a_cached_genres_failure():
    """regression: C20 a new Beatport sign-in asks for genres again at once."""
    from cuepoint.engine import config_api

    with patch("cuepoint.services.beatport_api.forget_genres_failure") as forget:
        config_api.set_session_token("new-session-token")
        config_api.set_session_token(None)
    assert forget.call_count == 2
