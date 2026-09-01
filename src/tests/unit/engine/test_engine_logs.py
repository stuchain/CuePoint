"""Tests for engine logs + privacy endpoints (Phase 6)."""

from __future__ import annotations

import json
import socket
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict

import pytest

from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.utils.paths import AppPaths


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _get_json(url: str, token: str) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=_headers(token), method="GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post_json(url: str, body: Dict[str, Any], token: str) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=_headers(token),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def test_logs_endpoint_returns_sanitized_filtered_content(monkeypatch):
    port = _free_port()
    token = "secret-token"
    with tempfile.TemporaryDirectory() as tmp:
        logs_dir = Path(tmp) / "logs"
        cache_dir = Path(tmp) / "cache"

        def _logs_dir() -> Path:
            logs_dir.mkdir(parents=True, exist_ok=True)
            return logs_dir

        def _cache_dir() -> Path:
            cache_dir.mkdir(parents=True, exist_ok=True)
            return cache_dir

        monkeypatch.setattr(AppPaths, "logs_dir", staticmethod(_logs_dir))
        monkeypatch.setattr(AppPaths, "cache_dir", staticmethod(_cache_dir))

        logs_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)

        log_file = logs_dir / "cuepoint.log"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        log_file.write_text(
            "\n".join(
                [
                    "2026-01-01 00:00:00 [INFO    ] cuepoint: hello token=abc",
                    "2026-01-01 00:00:01 [ERROR   ] cuepoint: Bearer xyz",
                    "2026-01-01 00:00:02 [INFO    ] cuepoint: second INFO",
                ]
            ),
            encoding="utf-8",
        )

        config = EngineConfig(host="127.0.0.1", port=port, token=token)
        server, thread = start_engine_thread(config)
        try:
            payload = _get_json(
                f"http://127.0.0.1:{port}/api/v1/logs/cuepoint?level=INFO&tail_lines=10&max_bytes=1000000",
                token,
            )
            assert "logs_dir" in payload
            assert payload["cuepoint_log"].count("ERROR") == 0
            assert "token=[REDACTED]" in payload["cuepoint_log"]
            assert "Bearer [REDACTED]" not in payload["cuepoint_log"]
        finally:
            server.shutdown()
            thread.join(timeout=2)


def test_logs_clear_and_cache_clear(monkeypatch):
    port = _free_port()
    token = "secret-token"

    with tempfile.TemporaryDirectory() as tmp:
        logs_dir = Path(tmp) / "logs"
        cache_dir = Path(tmp) / "cache"

        def _logs_dir() -> Path:
            logs_dir.mkdir(parents=True, exist_ok=True)
            return logs_dir

        def _cache_dir() -> Path:
            cache_dir.mkdir(parents=True, exist_ok=True)
            return cache_dir

        monkeypatch.setattr(AppPaths, "logs_dir", staticmethod(_logs_dir))
        monkeypatch.setattr(AppPaths, "cache_dir", staticmethod(_cache_dir))

        logs_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)

        (logs_dir / "cuepoint.log").write_text("hello", encoding="utf-8")
        (cache_dir / "some-cache.txt").write_text("cached", encoding="utf-8")

        config = EngineConfig(host="127.0.0.1", port=port, token=token)
        server, thread = start_engine_thread(config)
        try:
            clear_logs = _post_json(
                f"http://127.0.0.1:{port}/api/v1/privacy/clear-logs",
                body={},
                token=token,
            )
            assert clear_logs["ok"] is True
            assert not (logs_dir / "cuepoint.log").exists()

            clear_cache = _post_json(
                f"http://127.0.0.1:{port}/api/v1/privacy/clear-cache",
                body={},
                token=token,
            )
            assert clear_cache["ok"] is True
            assert not (cache_dir / "some-cache.txt").exists()
        finally:
            server.shutdown()
            thread.join(timeout=2)


def test_logs_requires_auth(monkeypatch):
    port = _free_port()
    token = "secret-token"
    with tempfile.TemporaryDirectory() as tmp:
        logs_dir = Path(tmp) / "logs"
        cache_dir = Path(tmp) / "cache"

        def _logs_dir() -> Path:
            logs_dir.mkdir(parents=True, exist_ok=True)
            return logs_dir

        def _cache_dir() -> Path:
            cache_dir.mkdir(parents=True, exist_ok=True)
            return cache_dir

        monkeypatch.setattr(AppPaths, "logs_dir", staticmethod(_logs_dir))
        monkeypatch.setattr(AppPaths, "cache_dir", staticmethod(_cache_dir))
        logs_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)
        (logs_dir / "cuepoint.log").write_text("hello", encoding="utf-8")

        config = EngineConfig(host="127.0.0.1", port=port, token=token)
        server, thread = start_engine_thread(config)
        try:
            url = f"http://127.0.0.1:{port}/api/v1/logs/dir"
            with pytest.raises(urllib.error.HTTPError) as exc:
                urllib.request.urlopen(url, timeout=5)
            assert exc.value.code == 401
        finally:
            server.shutdown()
            thread.join(timeout=2)
