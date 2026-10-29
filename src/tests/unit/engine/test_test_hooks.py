"""The engine's test-only routes exist only with ``CUEPOINT_TEST_HOOKS=1`` (HARDEN-05).

A packaged app started normally must have no route that can make the engine stop answering.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.server import (
    TEST_HOOKS_ENV,
    TEST_STALL_PATH,
    EngineConfig,
    start_engine_thread,
)
from tests.unit.engine.test_engine_library_browse import _free_port

pytestmark = pytest.mark.unit

TOKEN = "test-hooks-token"


def _post(port: int, path: str, body: dict | None = None, timeout: float = 3.0):
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(body or {}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


@pytest.fixture
def engine_port(monkeypatch):
    started = []

    def start() -> int:
        port = _free_port()
        server, thread = start_engine_thread(
            EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
        )
        started.append((server, thread))
        return port

    yield start
    for server, thread in started:
        server.shutdown()
        thread.join(timeout=2)


def test_the_stall_route_is_absent_without_the_environment(monkeypatch, engine_port):
    monkeypatch.delenv(TEST_HOOKS_ENV, raising=False)
    port = engine_port()
    assert _post(port, TEST_STALL_PATH, {"seconds": 5}) == 404
    # Still answering: nothing was stalled.
    with urllib.request.urlopen(
        f"http://127.0.0.1:{port}/health", timeout=2
    ) as response:
        assert response.status == 200


@pytest.mark.parametrize("value", ["", "0", "true", "no"])
def test_the_stall_route_is_absent_unless_the_variable_is_one(
    monkeypatch, engine_port, value
):
    monkeypatch.setenv(TEST_HOOKS_ENV, value)
    assert _post(engine_port(), TEST_STALL_PATH) == 404


def test_the_stall_route_stops_health_answering_when_the_hooks_are_on(
    monkeypatch, engine_port
):
    monkeypatch.setenv(TEST_HOOKS_ENV, "1")
    port = engine_port()
    assert _post(port, TEST_STALL_PATH, {"seconds": 3}) == 202
    began = time.monotonic()
    with pytest.raises(
        Exception
    ):  # a timeout: the connection is taken and never answered
        urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.0)
    assert time.monotonic() - began < 5
