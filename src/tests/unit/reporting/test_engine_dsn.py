"""Which DSN the engine reports to, and when it is set up (REPORT-08, DEC-148, DEC-150, DEC-151).

The built-in DSN is only a place to send events to (it cannot read anything back), so it is
shipped in the source. A source checkout never uses it: from source, only a DSN set by hand sends.
"""

from __future__ import annotations

import ast
import os
import subprocess
import sys
import threading
from pathlib import Path

import pytest

from cuepoint.engine.reporting_api import set_reporting_enabled
from cuepoint.reporting import engine_reporting
from cuepoint.reporting.engine_reporting import (
    BUILT_IN_ENGINE_DSN,
    DSN_ENV,
    resolve_engine_dsn,
)

SRC = Path(__file__).resolve().parents[3]
EXPLICIT = "https://public@example.invalid/1"


@pytest.fixture(autouse=True)
def _clean_reporting():
    engine_reporting.teardown_engine_reporting()
    yield
    engine_reporting.teardown_engine_reporting()
    set_reporting_enabled(False)


@pytest.mark.parametrize(
    ("environ", "frozen", "expected"),
    [
        # packaged (frozen sidecar)
        ({}, True, BUILT_IN_ENGINE_DSN),
        ({DSN_ENV: ""}, True, BUILT_IN_ENGINE_DSN),
        ({DSN_ENV: "   "}, True, BUILT_IN_ENGINE_DSN),
        ({DSN_ENV: "off"}, True, None),
        ({DSN_ENV: "OFF"}, True, None),
        ({DSN_ENV: " Off "}, True, None),
        ({DSN_ENV: EXPLICIT}, True, EXPLICIT),
        ({DSN_ENV: f" {EXPLICIT} "}, True, EXPLICIT),
        # from source
        ({}, False, None),
        ({DSN_ENV: ""}, False, None),
        ({DSN_ENV: "off"}, False, None),
        ({DSN_ENV: EXPLICIT}, False, EXPLICIT),
    ],
)
def test_the_dsn_resolution_table(environ, frozen, expected):
    assert resolve_engine_dsn(environ, frozen=frozen) == expected


def test_the_built_in_dsn_is_the_python_project_in_the_eu_region():
    assert BUILT_IN_ENGINE_DSN.startswith("https://")
    assert BUILT_IN_ENGINE_DSN.endswith("/4510867733217360")
    assert ".ingest.de.sentry.io/" in BUILT_IN_ENGINE_DSN
    # A DSN has a public key only: nothing that reads data back.
    assert (
        "@" in BUILT_IN_ENGINE_DSN and ":" not in BUILT_IN_ENGINE_DSN.split("@")[0][8:]
    )


def test_frozen_defaults_to_the_running_interpreter(monkeypatch):
    monkeypatch.delattr(sys, "frozen", raising=False)
    assert resolve_engine_dsn({}) is None
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert resolve_engine_dsn({}) == BUILT_IN_ENGINE_DSN


def test_off_sets_nothing_up_even_when_frozen():
    assert (
        engine_reporting.setup_engine_reporting({DSN_ENV: "off"}, frozen=True) is False
    )
    assert engine_reporting.setup_engine_reporting({}, frozen=False) is False


def test_the_background_start_returns_before_the_setup_finishes():
    release = threading.Event()
    started = threading.Event()
    calls: list[str] = []

    def slow_setup() -> bool:
        started.set()
        release.wait(5)
        calls.append("done")
        return True

    thread = engine_reporting.start_engine_reporting_in_background(setup=slow_setup)
    try:
        assert started.wait(5)
        assert calls == []  # the caller was not held up
        assert thread.daemon is True
    finally:
        release.set()
        thread.join(5)
    assert calls == ["done"]


def test_the_background_start_never_raises():
    def broken() -> bool:
        raise RuntimeError("boom")

    thread = engine_reporting.start_engine_reporting_in_background(setup=broken)
    thread.join(5)
    assert not thread.is_alive()


def _run_engine_calls() -> list[tuple[str, int]]:
    tree = ast.parse(
        (SRC / "cuepoint" / "engine" / "server.py").read_text(encoding="utf-8")
    )
    func = next(
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name == "run_engine"
    )
    calls = []
    for node in ast.walk(func):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "id", getattr(node.func, "attr", ""))
            calls.append((name, node.lineno))
    return calls


def test_run_engine_sets_reporting_up_in_the_background_once_the_server_exists():
    calls = _run_engine_calls()
    names = [n for n, _ in calls]
    # Not on the start-up path: no synchronous setup.
    assert "setup_engine_reporting" not in names
    background = [
        line for n, line in calls if n == "start_engine_reporting_in_background"
    ]
    assert len(background) == 1
    server_made = min(line for n, line in calls if n == "ThreadingHTTPServer")
    serving = min(line for n, line in calls if n == "serve_forever")
    assert server_made < background[0] < serving


def test_the_cli_never_sets_reporting_up_even_with_a_dsn():
    """DEC-151: the CLI imports the breadcrumb helper but never sets Sentry up or loads the SDK."""
    code = (
        "import sys\n"
        f"sys.path.insert(0, {str(SRC)!r})\n"
        "sys.argv = ['cli', '--help']\n"
        "import main as m\n"
        "try:\n    m.main()\nexcept SystemExit:\n    pass\n"
        "from cuepoint.reporting import engine_reporting as e\n"
        "assert not e.is_active(), 'the CLI set reporting up'\n"
        "assert 'sentry_sdk' not in sys.modules, 'the CLI loaded the SDK'\n"
        "print('CLI-OK')\n"
    )
    env = {**os.environ, DSN_ENV: EXPLICIT, "PYTHONPATH": str(SRC)}
    done = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        env=env,
        timeout=120,
    )
    assert done.returncode == 0, done.stderr
    assert "CLI-OK" in done.stdout


def test_only_the_engine_calls_the_setup():
    callers = []
    for path in SRC.rglob("*.py"):
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if (
            "setup_engine_reporting(" in text
            or "start_engine_reporting_in_background(" in text
        ):
            callers.append(path.relative_to(SRC).as_posix())
    assert sorted(callers) == [
        "cuepoint/engine/server.py",
        "cuepoint/reporting/engine_reporting.py",
    ]


def test_a_second_background_start_starts_nothing():
    release = threading.Event()
    calls: list[int] = []

    def setup() -> bool:
        calls.append(1)
        release.wait(5)
        return False

    first = engine_reporting.start_engine_reporting_in_background(setup=setup)
    second = engine_reporting.start_engine_reporting_in_background(setup=setup)
    release.set()
    first.join(5)
    assert second is first
    assert calls == [1]


# ---------------------------------------------------------------------------
# What is held while the setup is still running
# ---------------------------------------------------------------------------

from tests.unit.reporting.test_engine_reporting import RecordingTransport  # noqa: E402


class _Gate:
    """A setup that waits to be released, then sets Sentry up with a recording transport."""

    def __init__(self) -> None:
        self.release = threading.Event()

    def __call__(self) -> bool:
        self.release.wait(10)
        return engine_reporting.setup_engine_reporting(
            {DSN_ENV: EXPLICIT}, transport=RecordingTransport
        )


@pytest.fixture
def window():
    RecordingTransport.reset()
    set_reporting_enabled(True)
    gate = _Gate()
    thread = engine_reporting.start_engine_reporting_in_background(setup=gate)
    yield gate, thread
    gate.release.set()
    thread.join(10)


def _events_after(gate, thread):
    import sentry_sdk

    gate.release.set()
    thread.join(10)
    sentry_sdk.flush(timeout=5)
    return RecordingTransport.events


def test_a_job_failure_before_the_setup_ends_arrives_after_it(window):
    gate, thread = window
    assert (
        engine_reporting.report_unexpected(RuntimeError("job broke"), job_type="export")
        is None
    )
    engine_reporting.breadcrumb("job", "export started", {"job_type": "export"})

    events = _events_after(gate, thread)

    assert len(events) == 1
    assert events[0]["tags"]["job_type"] == "export"
    assert "export started" in str(events[0]["breadcrumbs"])


def test_a_logged_error_before_the_setup_ends_arrives_after_it(window):
    import logging

    gate, thread = window
    try:
        raise ValueError("logged failure")
    except ValueError:
        logging.getLogger("cuepoint.some.module").error("it failed", exc_info=True)

    events = _events_after(gate, thread)

    assert len(events) == 1
    assert "logged failure" in str(events[0])


def test_with_the_choice_off_nothing_waits_and_nothing_arrives(window):
    gate, thread = window
    set_reporting_enabled(False)
    engine_reporting.report_unexpected(RuntimeError("after off"))
    engine_reporting.breadcrumb("job", "after off")
    assert engine_reporting._pending_reports == []
    assert len(engine_reporting._pending_crumbs) == 0

    assert _events_after(gate, thread) == []


def test_turning_the_choice_off_while_waiting_empties_the_buffer(window):
    gate, thread = window
    engine_reporting.report_unexpected(RuntimeError("held"))
    engine_reporting.breadcrumb("job", "held")
    assert len(engine_reporting._pending_reports) == 1

    set_reporting_enabled(False)

    assert engine_reporting._pending_reports == []
    assert len(engine_reporting._pending_crumbs) == 0
    set_reporting_enabled(True)
    assert _events_after(gate, thread) == []


def test_the_buffer_is_bounded(window):
    gate, thread = window
    for i in range(60):
        engine_reporting.report_unexpected(RuntimeError(f"failure {i}"))
        engine_reporting.breadcrumb("job", f"step {i}")
    assert (
        len(engine_reporting._pending_reports)
        == engine_reporting.MAX_PENDING_REPORTS
        == 16
    )
    assert len(engine_reporting._pending_crumbs) == engine_reporting.MAX_BREADCRUMBS
    assert len(_events_after(gate, thread)) == 16


def test_a_failed_setup_drops_what_waited():
    set_reporting_enabled(True)
    thread = engine_reporting.start_engine_reporting_in_background(setup=lambda: False)
    thread.join(5)
    engine_reporting.report_unexpected(RuntimeError("late"))
    assert engine_reporting._pending is False
    assert engine_reporting._pending_reports == []


def test_no_dsn_means_nothing_waits(monkeypatch):
    monkeypatch.delenv(DSN_ENV, raising=False)
    set_reporting_enabled(True)
    thread = engine_reporting.start_engine_reporting_in_background()
    thread.join(5)
    assert engine_reporting._pending is False
    assert engine_reporting.is_active() is False
