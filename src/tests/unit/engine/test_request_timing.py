"""A slow engine request is logged, with its route template and nothing from the query.

The engine has no per-request timing, so a "the app feels slow" report could not
say which route was slow. Requests over 500 ms are logged at WARNING; those over
100 ms are counted per route at DEBUG. The clock is replaced, so no test waits.
"""

from __future__ import annotations

import logging
import socket
import time
import urllib.error
import urllib.request

import pytest

from cuepoint.engine import request_timing
from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread

pytestmark = pytest.mark.unit

TOKEN = "request-timing-token"
JOB_ID = "0123456789abcdef0123456789abcdef"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture(scope="module")
def port():
    port = _free_port()
    server, thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=JobStore()
    )
    try:
        yield port
    finally:
        server.shutdown()
        thread.join(timeout=2)


class _SlowClock:
    """A clock that reads 0 the first time and ``seconds`` every time after."""

    def __init__(self, seconds: float) -> None:
        self.seconds = seconds
        self.reads = 0

    def __call__(self) -> float:
        self.reads += 1
        return 0.0 if self.reads == 1 else self.seconds


def _get(port: int, path: str) -> int:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}", headers={"Authorization": f"Bearer {TOKEN}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
            return int(response.status)
    except urllib.error.HTTPError as exc:
        exc.read()
        return int(exc.code)


def _warnings(caplog) -> list[str]:
    return [
        r.getMessage()
        for r in caplog.records
        if r.levelno >= logging.WARNING and "slow request" in r.getMessage()
    ]


def _logged_warnings(caplog) -> list[str]:
    """The slow-request lines, once the server has written one.

    The server logs in ``track``'s ``finally``, after the answer has gone out, so
    the client can read its answer before the line exists.
    """
    deadline = time.monotonic() + 5.0
    while not _warnings(caplog) and time.monotonic() < deadline:
        time.sleep(0.01)
    return _warnings(caplog)


def _notes(caplog) -> list[str]:
    return [
        r.getMessage()
        for r in caplog.records
        if r.levelno == logging.DEBUG and r.name == "cuepoint.engine.request_timing"
    ]


def _logged_notes(caplog) -> list[str]:
    """The over-100 ms lines, once the server has counted and written one.

    Like ``_logged_warnings``: both happen in ``track``'s ``finally``, after the
    answer has gone out.
    """
    deadline = time.monotonic() + 5.0
    while not (_notes(caplog) and request_timing.noted_counts()):
        if time.monotonic() >= deadline:
            break
        time.sleep(0.01)
    return _notes(caplog)


def test_slow_request_logs_one_line_without_the_query(port, monkeypatch, caplog):
    monkeypatch.setattr(request_timing, "_clock", _SlowClock(0.6))
    with caplog.at_level(logging.DEBUG):
        status = _get(port, f"/api/v1/jobs/{JOB_ID}/results?q=secretvalue")
    lines = _logged_warnings(caplog)
    assert len(lines) == 1
    line = lines[0]
    assert line.startswith("[engine] slow request GET /api/v1/jobs/{id}/results ")
    assert f" {status} 600 ms (1 in flight)" in line
    assert "secretvalue" not in line and JOB_ID not in line


def test_slow_request_that_raises_is_logged_with_status_500(port, monkeypatch, caplog):
    def boom(self, job_id):
        raise RuntimeError("boom")

    monkeypatch.setattr(JobStore, "get", boom)
    monkeypatch.setattr(request_timing, "_clock", _SlowClock(0.6))
    with caplog.at_level(logging.DEBUG):
        assert _get(port, f"/api/v1/jobs/{JOB_ID}/results") == 500
    lines = _logged_warnings(caplog)
    assert len(lines) == 1
    assert " GET /api/v1/jobs/{id}/results 500 600 ms" in lines[0]


def test_event_stream_is_never_logged(port, monkeypatch, caplog):
    monkeypatch.setattr(request_timing, "_clock", _SlowClock(30.0))
    with caplog.at_level(logging.DEBUG):
        assert _get(port, f"/api/v1/jobs/{JOB_ID}/events") == 404
    assert _warnings(caplog) == []


def test_event_stream_with_path_params_is_never_logged(port, monkeypatch, caplog):
    # Routing drops ``;params``, so ``/events;x`` is the live stream and is not timed.
    monkeypatch.setattr(request_timing, "_clock", _SlowClock(30.0))
    with caplog.at_level(logging.DEBUG):
        assert _get(port, f"/api/v1/jobs/{JOB_ID}/events;x") == 404
    assert _warnings(caplog) == []
    assert request_timing.noted_counts().get("/api/v1/jobs/{id}/{id}") is None


def test_fast_request_logs_nothing(port, monkeypatch, caplog):
    monkeypatch.setattr(request_timing, "_clock", _SlowClock(0.05))
    with caplog.at_level(logging.DEBUG):
        _get(port, f"/api/v1/jobs/{JOB_ID}/results")
    assert _warnings(caplog) == []


def test_health_is_never_logged(port, monkeypatch, caplog):
    monkeypatch.setattr(request_timing, "_clock", _SlowClock(5.0))
    with caplog.at_level(logging.DEBUG):
        assert _get(port, "/health") == 200
    assert _warnings(caplog) == []


def test_requests_over_the_note_threshold_are_counted_per_route(
    port, monkeypatch, caplog
):
    request_timing.reset_counts()
    monkeypatch.setattr(request_timing, "_clock", _SlowClock(0.2))
    with caplog.at_level(logging.DEBUG, logger="cuepoint.engine.request_timing"):
        _get(port, f"/api/v1/jobs/{JOB_ID}/results")
        debug = _logged_notes(caplog)
    assert request_timing.noted_counts() == {"/api/v1/jobs/{id}/results": 1}
    assert _warnings(caplog) == []
    assert debug == [
        "[engine] request over 100 ms: GET /api/v1/jobs/{id}/results 200 ms"
    ]


def test_in_flight_count_rises_and_falls():
    before = request_timing.in_flight()
    with request_timing.track("/api/v1/a"):
        with request_timing.track("/api/v1/b"):
            assert request_timing.in_flight() == before + 2
        assert request_timing.in_flight() == before + 1
    assert request_timing.in_flight() == before


def test_format_slow_shows_a_dash_for_status_zero():
    line = request_timing.format_slow("GET", "/api/v1/a", 0, 700, 2)
    assert line == "[engine] slow request GET /api/v1/a - 700 ms (2 in flight)"


def test_in_flight_falls_when_the_request_raises():
    before = request_timing.in_flight()
    with pytest.raises(RuntimeError), request_timing.track("/api/v1/a"):
        raise RuntimeError("boom")
    assert request_timing.in_flight() == before


def test_untimed_paths_are_not_counted_in_flight():
    before = request_timing.in_flight()
    for path in ("/health", "/api/v1/jobs/{id}/events", "/other"):
        with request_timing.track(path):
            assert request_timing.in_flight() == before


@pytest.mark.parametrize(
    "template,expected",
    [
        ("/api/v1/clean/health", True),
        ("/api/v1/jobs/{id}/results", True),
        ("/api/v1/jobs/{id}/events", False),
        ("/health", False),
        ("/", False),
    ],
)
def test_should_time(template, expected):
    assert request_timing.should_time(template) is expected
