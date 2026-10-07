"""Tests for the error-reporting choice and its route (REPORT-01, DEC-128)."""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

import pytest

from cuepoint.engine.reporting_api import (
    REPORTING_ENV,
    initial_reporting_enabled,
    parse_reporting_body,
    reporting_enabled,
    set_reporting_enabled,
)
from cuepoint.engine.server import EngineConfig, start_engine_thread

TOKEN = "secret-token"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _post(
    port: int, raw: bytes, token: Optional[str] = TOKEN
) -> Tuple[int, Dict[str, Any]]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/v1/reporting",
        data=raw,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.delenv(REPORTING_ENV, raising=False)
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        set_reporting_enabled(False)


def test_route_needs_the_token(engine):
    set_reporting_enabled(False)
    status, payload = _post(engine, b'{"enabled": true}', token=None)
    assert status == 401
    assert payload["error"]["code"] == "UNAUTHORIZED"
    assert reporting_enabled() is False


@pytest.mark.parametrize(
    "raw",
    [b'{"enabled": "no"}', b'{"enabled": 1}', b"{}", b"[]", b"not json", b""],
)
def test_route_refuses_anything_but_a_boolean(engine, raw):
    set_reporting_enabled(True)
    status, payload = _post(engine, raw)
    assert status == 400
    assert payload["error"]["code"] == "INVALID_REQUEST"
    assert reporting_enabled() is True


def test_route_flips_the_flag(engine):
    status, payload = _post(engine, b'{"enabled": false}')
    assert (status, payload) == (200, {"enabled": False})
    assert reporting_enabled() is False
    status, payload = _post(engine, b'{"enabled": true}')
    assert (status, payload) == (200, {"enabled": True})
    assert reporting_enabled() is True


def test_initial_value_from_environment():
    assert initial_reporting_enabled({}) is False
    assert initial_reporting_enabled({REPORTING_ENV: "0"}) is False
    assert initial_reporting_enabled({REPORTING_ENV: "1"}) is True
    assert initial_reporting_enabled({REPORTING_ENV: "true"}) is False


def test_parse_reporting_body_accepts_only_booleans():
    assert parse_reporting_body(b'{"enabled": true}') is True
    assert parse_reporting_body(b'{"enabled": false}') is False
    for raw in (b'{"enabled": null}', b'{"enabled": "true"}', b"\xff"):
        with pytest.raises(ValueError):
            parse_reporting_body(raw)


@pytest.mark.parametrize(
    ("value", "expected"), [(None, False), ("0", False), ("1", True)]
)
def test_server_start_reads_the_environment(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv(REPORTING_ENV, raising=False)
    else:
        monkeypatch.setenv(REPORTING_ENV, value)
    # Start from the opposite so the start itself has to set it.
    set_reporting_enabled(not expected)
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=_free_port(), token=TOKEN)
    )
    try:
        assert reporting_enabled() is expected
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        set_reporting_enabled(False)
