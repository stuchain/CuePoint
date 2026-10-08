"""The engine reports its own failures, and no refusal (REPORT-03, DEC-126, DEC-127, DEC-153).

Everything runs against a transport that records what would be sent and a fake DSN, so nothing
leaves the machine. Sentry state is reset around every test.
"""

from __future__ import annotations

import ast
import json
import logging
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("sentry_sdk")

import sentry_sdk  # noqa: E402

from cuepoint.engine import server as server_module  # noqa: E402
from cuepoint.engine.api_errors import ApiError  # noqa: E402
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError  # noqa: E402
from cuepoint.engine.reporting_api import (  # noqa: E402
    REPORTING_ENV,
    set_reporting_enabled,
)
from cuepoint.engine.server import EngineConfig, start_engine_thread  # noqa: E402
from cuepoint.reporting import engine_reporting  # noqa: E402
from cuepoint.reporting.expected import EXPECTED_JOB_ERROR_CODES  # noqa: E402
from cuepoint.reporting.gated_transport import GatedHttpTransport  # noqa: E402
from cuepoint.reporting.scrub import ScrubContext  # noqa: E402

FAKE_DSN = "https://public@example.invalid/1"
TOKEN = "engine-test-token"
SRC = Path(__file__).resolve().parents[3]

USER = "annabel"
HOME = "/Users/annabel"
SECRET_TITLE = "Midnight Zebra Anthem"
SECRET_ARTIST = "DJ Quartz Hollow"
SECRET_PATH = f"{HOME}/Music/House/{SECRET_TITLE}.flac"


class RecordingTransport(GatedHttpTransport):
    """Records what would be sent. ``hold`` stalls the worker, as a slow network would."""

    # Class attributes: the SDK builds the instance, from the class it is given.
    events: list[dict[str, Any]] = []
    hold = threading.Event()

    @classmethod
    def reset(cls) -> None:
        cls.events = []
        cls.hold = threading.Event()
        cls.hold.set()

    def _send_envelope(self, envelope: Any) -> None:
        self.hold.wait(10)
        super()._send_envelope(envelope)

    def _send_request(self, body, headers, endpoint_type, envelope=None):  # type: ignore[no-untyped-def]
        for item in envelope.items if envelope is not None else []:
            if item.type == "event":
                self.events.append(item.payload.json)


@pytest.fixture
def reporting(monkeypatch):
    """Reporting set up with a recording transport, the flag on, a known user to hide."""
    monkeypatch.delenv(REPORTING_ENV, raising=False)
    set_reporting_enabled(True)
    transport = RecordingTransport
    transport.reset()
    assert engine_reporting.setup_engine_reporting(
        {engine_reporting.DSN_ENV: FAKE_DSN}, transport=transport
    )
    engine_reporting._scrub_context = ScrubContext(home=HOME, user_name=USER)
    try:
        yield transport
    finally:
        engine_reporting.teardown_engine_reporting()
        set_reporting_enabled(False)


def _crumbs(event: dict[str, Any]) -> list[dict[str, Any]]:
    breadcrumbs = event.get("breadcrumbs") or {}
    return (
        list(breadcrumbs.get("values", []))
        if isinstance(breadcrumbs, dict)
        else breadcrumbs
    )


def _flush() -> None:
    sentry_sdk.flush(timeout=5)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.delenv(REPORTING_ENV, raising=False)
    port = _free_port()
    server, _thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=JobStore()
    )
    # start_engine_thread resets the flag to its launch value (off); a test that set reporting
    # up wants it on.
    if engine_reporting._active:
        set_reporting_enabled(True)
    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()


def call(
    port: int,
    method: str,
    path: str,
    body: Any = None,
    *,
    token: str | None = TOKEN,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, Any]]:
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=data if method == "POST" else None,
        headers=request_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode() or "{}")


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------


def test_an_exception_that_escapes_a_handler_answers_500_with_a_report_id(
    reporting, engine, monkeypatch
):
    def boom() -> str:
        raise RuntimeError("the logs folder blew up")

    monkeypatch.setattr(server_module, "get_cuepoint_logs_dir", boom)
    status, body = call(engine, "GET", "/api/v1/logs/dir")
    _flush()
    assert status == 500
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert len(reporting.events) == 1
    event = reporting.events[0]
    assert body["error"]["report_id"] == event["event_id"]
    assert len(event["event_id"]) == 32
    assert event["tags"]["route"] == "/api/v1/logs/dir"


def test_a_route_that_answers_500_reports_once_and_names_the_report(
    reporting, engine, monkeypatch
):
    def boom(*_a: Any, **_k: Any) -> Any:
        raise RuntimeError("refresh exploded")

    monkeypatch.setattr(
        server_module, "parse_refresh_preview_body", lambda raw: (None, False)
    )
    monkeypatch.setattr(server_module, "start_refresh_preview", boom)
    status, body = call(engine, "POST", "/api/v1/library/refresh/preview", {})
    _flush()
    assert status == 500
    assert body["error"]["code"] == "LIBRARY_REFRESH_FAILED"
    assert len(reporting.events) == 1
    assert body["error"]["report_id"] == reporting.events[0]["event_id"]


def test_a_mapped_500_reports_once_and_names_the_report(reporting, engine, monkeypatch):
    path = _a_clean_post_path()

    def boom(*_a: Any, **_k: Any) -> Any:
        raise RuntimeError("clean exploded")

    monkeypatch.setattr(server_module, "clean_post", boom)
    status, body = call(engine, "POST", path, {})
    _flush()
    assert status == 500
    assert body["error"]["code"] == "CLEAN_FAILED"
    assert len(reporting.events) == 1
    assert body["error"]["report_id"] == reporting.events[0]["event_id"]


def _a_clean_post_path() -> str:
    from cuepoint.engine.clean_api import POST_PATHS

    return next(p for p in POST_PATHS if "{" not in p and "<" not in p)


def test_refusals_record_nothing(reporting, engine, monkeypatch):
    from cuepoint.engine.clean_api import CleanUnavailableError
    from cuepoint.engine.library_refresh import DiffNotFoundError

    monkeypatch.setattr(
        server_module, "parse_refresh_preview_body", lambda raw: (None, False)
    )
    raised: list[BaseException] = []

    def refuse(*_a: Any, **_k: Any) -> Any:
        raise raised[0]

    monkeypatch.setattr(server_module, "start_refresh_preview", refuse)
    refusals = {
        400: ValueError("bad body"),
        404: DiffNotFoundError("gone"),
        409: JobTypeBusyError("library_import", "job-1"),
    }
    for expected, exc in refusals.items():
        raised[:] = [exc]
        status, body = call(engine, "POST", "/api/v1/library/refresh/preview", {})
        assert status == expected, body
        assert "report_id" not in body["error"]

    # 401: no token. 404: no such path.
    status, body = call(engine, "GET", "/api/v1/logs/dir", token=None)
    assert status == 401 and "report_id" not in body["error"]
    status, body = call(engine, "GET", "/api/v1/nowhere")
    assert status == 404 and "report_id" not in body["error"]

    # 503 and a 409 from a routed module's own mapping.
    def unavailable(*_a: Any, **_k: Any) -> Any:
        raise CleanUnavailableError("database unreachable")

    monkeypatch.setattr(server_module, "clean_post", unavailable)
    status, body = call(engine, "POST", _a_clean_post_path(), {})
    assert status == 503 and "report_id" not in body["error"]

    def refused(*_a: Any, **_k: Any) -> Any:
        raise ApiError(409, "LIBRARY_BUSY", "busy")

    monkeypatch.setattr(server_module, "clean_post", refused)
    status, _body = call(engine, "POST", _a_clean_post_path(), {})
    assert status == 409
    _flush()
    assert reporting.events == []


def test_a_500_whose_code_the_user_owns_is_not_reported(reporting, engine, monkeypatch):
    def refuse(*_a: Any, **_k: Any) -> Any:
        raise ApiError(500, "SET_LIST_WRITE_FAILED", "disk is read-only")

    monkeypatch.setattr(server_module, "clean_post", refuse)
    status, body = call(engine, "POST", _a_clean_post_path(), {})
    _flush()
    assert status == 500
    assert "report_id" not in body["error"]
    assert reporting.events == []


def test_a_closed_connection_is_not_a_failure(reporting, engine, monkeypatch):
    def gone() -> str:
        raise BrokenPipeError("client went away")

    monkeypatch.setattr(server_module, "get_cuepoint_logs_dir", gone)
    with socket.create_connection(("127.0.0.1", engine), timeout=5) as sock:
        sock.sendall(
            f"GET /api/v1/logs/dir HTTP/1.0\r\nAuthorization: Bearer {TOKEN}\r\n\r\n".encode()
        )
        sock.recv(1)
    _flush()
    assert reporting.events == []


def test_the_request_continues_the_trace_main_started(reporting, engine, monkeypatch):
    def boom() -> str:
        raise RuntimeError("traced")

    monkeypatch.setattr(server_module, "get_cuepoint_logs_dir", boom)
    trace_id = "0123456789abcdef0123456789abcdef"
    status, _ = call(
        engine,
        "GET",
        "/api/v1/logs/dir",
        headers={
            "sentry-trace": f"{trace_id}-fedcba9876543210-1",
            "baggage": f"sentry-trace_id={trace_id},sentry-environment=development",
        },
    )
    _flush()
    assert status == 500
    assert reporting.events[0]["contexts"]["trace"]["trace_id"] == trace_id


def test_a_request_breadcrumb_names_method_route_and_status_only(
    reporting, engine, monkeypatch
):
    monkeypatch.setattr(server_module, "get_cuepoint_logs_dir", lambda: "/x")
    call(engine, "GET", "/api/v1/logs/dir?secret=Midnight%20Zebra")
    engine_reporting.report_unexpected(RuntimeError("after"))
    _flush()
    crumbs = [c for c in _crumbs(reporting.events[0]) if c["category"] == "http"]
    assert crumbs
    assert crumbs[0]["message"] == "GET /api/v1/logs/dir 200"
    assert crumbs[0]["data"] == {
        "method": "GET",
        "route": "/api/v1/logs/dir",
        "status": 200,
    }
    assert "Zebra" not in json.dumps(reporting.events[0])


def test_without_reporting_a_500_has_no_report_id(engine, monkeypatch):
    def boom() -> str:
        raise RuntimeError("no sentry here")

    monkeypatch.setattr(server_module, "get_cuepoint_logs_dir", boom)
    status, body = call(engine, "GET", "/api/v1/logs/dir")
    assert status == 500
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "report_id" not in body["error"]


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


def _run_job(store: JobStore, job_type: str, runner: Any) -> Any:
    job = store.create_job(job_type=job_type, runner=runner)
    for thread in threading.enumerate():
        if thread.name.endswith(job.id[:8]):
            thread.join(10)
    return job


def test_a_job_that_raises_records_one_event_with_its_type(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        raise RuntimeError("the matcher broke")

    job = _run_job(store, "clean_match", runner)
    _flush()
    assert job.state is JobState.FAILED
    assert len(reporting.events) == 1
    event = reporting.events[0]
    assert event["tags"]["job_type"] == "clean_match"
    assert event["exception"]["values"][0]["type"] == "RuntimeError"
    crumbs = [c["message"] for c in _crumbs(event) if c["category"] == "job"]
    assert "clean_match started" in crumbs


def test_a_job_that_fails_itself_keeps_the_exception_it_was_handling(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        try:
            raise KeyError("column")
        except KeyError as exc:
            store.finish(
                job,
                state=JobState.FAILED,
                error={"code": "CLEAN_MATCH_FAILED", "message": str(exc)},
            )

    _run_job(store, "clean_match", runner)
    _flush()
    assert len(reporting.events) == 1
    assert reporting.events[0]["exception"]["values"][0]["type"] == "KeyError"


def test_a_failure_with_no_exception_is_reported_from_its_code(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "MATCH_STORAGE_FAILED", "message": "x"},
        )

    _run_job(store, "clean_match", runner)
    _flush()
    assert len(reporting.events) == 1
    assert (
        "MATCH_STORAGE_FAILED" in reporting.events[0]["exception"]["values"][0]["value"]
    )


def test_a_cancelled_job_records_nothing(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        job.cancel_requested = True

    job = _run_job(store, "clean_match", runner)
    _flush()
    assert job.state is JobState.CANCELLED
    assert reporting.events == []


def test_a_job_cancelled_while_it_raised_records_nothing(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        job.cancel_requested = True
        raise RuntimeError("stopped half way")

    _run_job(store, "clean_match", runner)
    _flush()
    assert reporting.events == []


@pytest.mark.parametrize("code", sorted(EXPECTED_JOB_ERROR_CODES))
def test_a_job_failing_with_an_expected_code_records_nothing(reporting, code):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        store.finish(job, state=JobState.FAILED, error={"code": code, "message": "x"})

    _run_job(store, "library_import", runner)
    _flush()
    assert reporting.events == []


# ---------------------------------------------------------------------------
# Threads, logs, breadcrumbs
# ---------------------------------------------------------------------------


@pytest.mark.filterwarnings("ignore::pytest.PytestUnhandledThreadExceptionWarning")
def test_a_thread_that_raises_outside_a_job_records_one_event(reporting):
    def work() -> None:
        raise RuntimeError("a background thread died")

    thread = threading.Thread(target=work, name="background-work")
    thread.start()
    thread.join(10)
    _flush()
    assert len(reporting.events) == 1
    assert (
        reporting.events[0]["exception"]["values"][0]["value"]
        == "a background thread died"
    )


@pytest.fixture
def cuepoint_logger():
    """The ``cuepoint`` logger as ``LoggingService`` leaves it: no propagation, no handlers."""
    logger = logging.getLogger("cuepoint")
    saved = (logger.level, logger.propagate, list(logger.handlers))
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.handlers.clear()
    try:
        yield logger
    finally:
        logger.setLevel(saved[0])
        logger.propagate = saved[1]
        logger.handlers[:] = saved[2]


def test_an_error_log_under_cuepoint_engine_records_one_event(
    reporting, cuepoint_logger
):
    logging.getLogger("cuepoint.engine.something").error("the engine logged an error")
    _flush()
    assert len(reporting.events) == 1
    assert reporting.events[0]["logger"] == "cuepoint.engine.something"


def test_an_info_log_becomes_a_breadcrumb_on_the_next_event(reporting, cuepoint_logger):
    logging.getLogger("cuepoint.engine.something").info("a step before the error")
    logging.getLogger("cuepoint.engine.something").warning("a warning is a step too")
    _flush()
    assert reporting.events == [], "INFO and WARNING are not events"
    engine_reporting.report_unexpected(RuntimeError("later"))
    _flush()
    messages = [c.get("message") for c in _crumbs(reporting.events[0])]
    assert "a step before the error" in messages
    assert "a warning is a step too" in messages


def test_breadcrumbs_keep_the_last_fifty(reporting):
    for number in range(80):
        engine_reporting.breadcrumb("step", f"step {number}")
    engine_reporting.report_unexpected(RuntimeError("end"))
    _flush()
    crumbs = _crumbs(reporting.events[0])
    assert len(crumbs) == 50
    assert crumbs[-1]["message"] == "step 79"


def test_an_activity_event_leaves_a_breadcrumb_with_its_type_only(reporting):
    from cuepoint.services.activity_service import ActivityService

    class Repo:
        def add_event(self, event):
            return event

    service = ActivityService(Repo(), None)  # type: ignore[arg-type]
    service.record_event(
        "library.refreshed", f"Refreshed '{SECRET_TITLE}'", {"file": SECRET_PATH}
    )
    engine_reporting.report_unexpected(RuntimeError("after"))
    _flush()
    activity = [c for c in _crumbs(reporting.events[0]) if c["category"] == "activity"]
    assert [c["message"] for c in activity] == ["library.refreshed"]
    assert SECRET_TITLE not in json.dumps(reporting.events[0])


# ---------------------------------------------------------------------------
# The flag, the DSN
# ---------------------------------------------------------------------------


def test_with_the_flag_off_nothing_is_recorded(reporting):
    set_reporting_enabled(False)
    assert engine_reporting.report_unexpected(RuntimeError("off")) is None
    engine_reporting.breadcrumb("step", "while off")
    logging.getLogger("cuepoint.engine").error("off too")
    set_reporting_enabled(True)
    engine_reporting.report_unexpected(RuntimeError("on"))
    _flush()
    assert len(reporting.events) == 1
    assert "while off" not in json.dumps(reporting.events[0])


def test_an_event_captured_just_before_the_flag_turned_off_is_not_sent(reporting):
    # ``before_send`` runs at capture, so this event passes it; the transport still holds it.
    reporting.hold.clear()
    event_id = engine_reporting.report_unexpected(RuntimeError("captured while on"))
    assert event_id
    set_reporting_enabled(False)
    reporting.hold.set()
    _flush()
    assert reporting.events == []


def test_the_flag_is_checked_at_capture(reporting):
    set_reporting_enabled(False)
    assert engine_reporting.report_unexpected(RuntimeError("off at capture")) is None
    _flush()
    assert reporting.events == []


@pytest.mark.parametrize("value", [None, "", "off", "  "])
def test_without_a_dsn_nothing_is_set_up(value):
    environ = {} if value is None else {engine_reporting.DSN_ENV: value}
    assert engine_reporting.setup_engine_reporting(environ) is False
    assert engine_reporting.report_unexpected(RuntimeError("x")) is None
    engine_reporting.breadcrumb("step", "x")
    assert not sentry_sdk.get_client().dsn


def test_setup_uses_the_release_dist_and_environment_from_the_environment():
    transport = RecordingTransport
    transport.reset()
    set_reporting_enabled(True)
    try:
        assert engine_reporting.setup_engine_reporting(
            {
                engine_reporting.DSN_ENV: FAKE_DSN,
                "CUEPOINT_RELEASE": "cuepoint@9.9.9",
                "CUEPOINT_DIST": "abc123",
                "CUEPOINT_ENVIRONMENT": "production",
            },
            transport=transport,
        )
        engine_reporting.report_unexpected(RuntimeError("x"))
        _flush()
        event = transport.events[0]
        assert (event["release"], event["dist"], event["environment"]) == (
            "cuepoint@9.9.9",
            "abc123",
            "production",
        )
    finally:
        engine_reporting.teardown_engine_reporting()
        set_reporting_enabled(False)


def test_setup_defaults_to_development_and_names_its_own_release_without_guessing(
    reporting,
):
    from cuepoint.version import get_release

    engine_reporting.report_unexpected(RuntimeError("x"))
    _flush()
    event = reporting.events[0]
    assert event["environment"] == "development"
    # The engine's own release (REPORT-07), never one the SDK guessed by running ``git``.
    assert event["release"] == get_release()
    assert not event.get("dist")


# ---------------------------------------------------------------------------
# What is in an event
# ---------------------------------------------------------------------------


def test_every_recorded_event_has_nothing_personal_left(
    reporting, cuepoint_logger, monkeypatch
):
    monkeypatch.setattr(socket, "gethostname", lambda: USER + "-lap" + "top-9")

    def work() -> None:
        title = SECRET_TITLE  # a local variable: never sent
        raise ValueError(
            f"No match for '{title}' by '{SECRET_ARTIST}' at '{SECRET_PATH}'"
        )

    engine_reporting.breadcrumb(
        "step",
        f"opened '{SECRET_PATH}'",
        {"track_title": SECRET_TITLE, "playlist": "My Secret Playlist"},
    )
    logging.getLogger("cuepoint.engine.x").info(
        "read %s for %s", f"'{SECRET_PATH}'", USER
    )
    logging.getLogger("cuepoint.engine.x").error(
        "failed for '%s' (%s)", SECRET_TITLE, USER
    )
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("where", SECRET_PATH)
        scope.set_extra("track_title", SECRET_TITLE)
        scope.set_user({"username": USER})
        try:
            work()
        except ValueError as exc:
            engine_reporting.report_unexpected(exc, route="/api/v1/library/tracks/{id}")
    _flush()
    assert len(reporting.events) == 2
    haystack = json.dumps(reporting.events, ensure_ascii=False).lower()
    for forbidden in (
        USER,
        HOME,
        SECRET_TITLE,
        SECRET_ARTIST,
        "my secret playlist",
        "laptop-9",
    ):
        assert forbidden.lower() not in haystack, forbidden
    for event in reporting.events:
        assert "server_name" not in event
        assert "user" not in event
        assert "request" not in event
        for value in event.get("exception", {}).get("values", []):
            for frame in value.get("stacktrace", {}).get("frames", []):
                assert "vars" not in frame


# ---------------------------------------------------------------------------
# route_template
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/health", "/health"),
        ("/api/v1/status", "/api/v1/status"),
        ("/api/v1/jobs", "/api/v1/jobs"),
        ("/api/v1/jobs?limit=5&state=all", "/api/v1/jobs"),
        ("/api/v1/jobs/3f2b8a1c-9d4e-4f6a-8b7c-1234567890ab", "/api/v1/jobs/{id}"),
        (
            "/api/v1/jobs/3f2b8a1c-9d4e-4f6a-8b7c-1234567890ab/events",
            "/api/v1/jobs/{id}/events",
        ),
        (
            "/api/v1/library/tracks/42/artwork?size=64",
            "/api/v1/library/tracks/{id}/artwork",
        ),
        ("/api/v1/library/tracks/42/matches", "/api/v1/library/tracks/{id}/matches"),
        ("/api/v1/discover/runs/run_abcdefghijklmnop", "/api/v1/discover/runs/{id}"),
        ("/api/v1/discover/runs/ABCDEFGHIJKLMNOPQRSTUV", "/api/v1/discover/runs/{id}"),
        ("/api/v1/privacy/clear-logs", "/api/v1/privacy/clear-logs"),
        ("/api/v1/library/tracks/Midnight%20Zebra", "/api/v1/library/tracks/{id}"),
        ("/api/v1/library/tracks/Daft-Punk", "/api/v1/library/tracks/{id}"),
        ("/api/v1/x#fragment", "/api/v1/x"),
        ("/", "/"),
        ("", "/"),
    ],
)
def test_route_template(path, expected):
    assert engine_reporting.route_template(path) == expected


def test_every_registered_static_route_is_its_own_template():
    from cuepoint.engine import (
        clean_api,
        discover_api,
        organization_api,
        rekordbox_export_api,
        sets_api,
        waveforms_api,
    )

    for module in (
        clean_api,
        discover_api,
        organization_api,
        rekordbox_export_api,
        sets_api,
        waveforms_api,
    ):
        for name in ("GET_PATHS", "POST_PATHS"):
            for path in getattr(module, name, ()):
                if "{" in path or "<" in path:
                    continue
                assert engine_reporting.route_template(path) == path, path


# ---------------------------------------------------------------------------
# Structure: every 500 goes through the reporting helper
# ---------------------------------------------------------------------------

_API_FILES = sorted((SRC / "cuepoint" / "engine").glob("*_api.py"))
_SERVER = SRC / "cuepoint" / "engine" / "server.py"


def _enclosing_functions(tree: ast.AST) -> dict[ast.AST, str]:
    names: dict[ast.AST, str] = {}

    def visit(node: ast.AST, current: str) -> None:
        for child in ast.iter_child_nodes(node):
            inner = (
                child.name
                if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef)
                else current
            )
            names[child] = inner
            visit(child, inner)

    visit(tree, "<module>")
    return names


def _calls(node: ast.AST, attr: str) -> list[ast.Call]:
    return [
        n
        for n in ast.walk(node)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == attr
    ]


def _is_500(call_node: ast.Call) -> bool:
    return (
        bool(call_node.args)
        and isinstance(call_node.args[0], ast.Constant)
        and call_node.args[0].value == 500
    )


def test_no_route_sends_a_500_except_through_the_reporting_helper():
    tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
    owner = _enclosing_functions(tree)
    sends_500 = [c for c in _calls(tree, "_send_json") if _is_500(c)]
    assert [owner[c] for c in sends_500] == ["_send_unexpected"], (
        "a 500 must be answered by _send_unexpected, which reports it"
    )
    helper = next(
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name == "_send_unexpected"
    )
    assert any(
        isinstance(c.func, ast.Name) and c.func.id == "report_unexpected"
        for c in ast.walk(helper)
        if isinstance(c, ast.Call)
    )


def test_a_status_for_result_is_only_sent_through_the_mapped_helper():
    tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
    owner = _enclosing_functions(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "status_for":
                assert owner[node] == "_send_mapped", (
                    "status_for is called outside _send_mapped"
                )
    mapped = next(
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name == "_send_mapped"
    )
    assert any(
        isinstance(c.func, ast.Name) and c.func.id == "report_unexpected"
        for c in ast.walk(mapped)
        if isinstance(c, ast.Call)
    )
    # Every `except` in a routed handler that maps an exception calls _send_mapped.
    routed = next(
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name == "_handle_routed"
    )
    assert _calls(routed, "_send_mapped")


def test_the_api_modules_answer_nothing_themselves():
    for path in _API_FILES:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        assert not _calls(tree, "_send_json"), f"{path.name} sends a response itself"
        assert not _calls(tree, "send_response"), f"{path.name} sends a response itself"


def test_every_http_verb_is_dispatched_through_the_guard():
    tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
    verbs = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name.startswith("do_")
    ]
    assert {v.name for v in verbs} == {"do_GET", "do_POST"}
    for verb in verbs:
        assert _calls(verb, "_dispatch"), f"{verb.name} bypasses the guard"


def test_the_engine_server_does_not_print_a_traceback(reporting, monkeypatch, capsys):
    server = server_module.with_error_reporting(
        server_module.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            server_module.make_handler(
                EngineConfig(host="127.0.0.1", port=_free_port(), token=TOKEN)
            ),
        )
    )
    set_reporting_enabled(True)  # make_handler reset it to the launch value
    try:
        try:
            raise RuntimeError(f"failed on '{SECRET_PATH}'")
        except RuntimeError:
            server.handle_error(None, ("127.0.0.1", 1))
        _flush()
    finally:
        server.server_close()
    captured = capsys.readouterr()
    assert SECRET_TITLE not in captured.err and SECRET_TITLE not in captured.out
    assert len(reporting.events) == 1
    assert time  # keep the import used when a wait is added


# ---------------------------------------------------------------------------
# Review follow-ups
# ---------------------------------------------------------------------------


def _raw_status(port: int, payload: bytes) -> int:
    """The status the server answered a hand-written request with.

    Before Python 3.13, ``http.server`` answers a request line it could not
    parse (``GET`` alone, an unsupported version) HTTP/0.9-style: no status
    line, just the HTML error page, whose body carries ``Error code: NNN``.
    From 3.13 on the same request gets a real ``HTTP/1.0 NNN`` status line.
    Either way the client got its answer, so read the whole reply and take
    the code from whichever form it came in.
    """
    with socket.create_connection(("127.0.0.1", port), timeout=10) as sock:
        sock.sendall(payload)
        data = b""
        while True:
            try:
                chunk = sock.recv(4096)
            except ConnectionResetError:
                # Windows can reset after the reply when request bytes went unread.
                if data:
                    break
                raise
            if not chunk:
                break
            data += chunk
    if data.startswith(b"HTTP/"):
        return int(data.split(b" ", 2)[1])
    # Only an older http.server answers without a status line.
    assert sys.version_info < (3, 13), data
    match = re.search(rb"Error code: (\d{3})", data)
    assert match, data
    return int(match.group(1))


@pytest.mark.parametrize("with_reporting", [False, True])
def test_a_request_refused_before_it_was_parsed_still_gets_its_answer(
    engine, monkeypatch, with_reporting
):
    if with_reporting:
        set_reporting_enabled(True)
        RecordingTransport.reset()
        engine_reporting.setup_engine_reporting(
            {engine_reporting.DSN_ENV: FAKE_DSN}, transport=RecordingTransport
        )
    try:
        # send_error runs before self.path or self.command exist in each of these.
        assert _raw_status(engine, b"GET /x HTTP/9.9.9\r\n\r\n") == 400
        assert _raw_status(engine, b"GET\r\n\r\n") == 400
        assert (
            _raw_status(engine, b"GET /" + b"a" * 70000 + b" HTTP/1.0\r\n\r\n") == 414
        )
        if with_reporting:
            _flush()
            assert RecordingTransport.events == []
    finally:
        engine_reporting.teardown_engine_reporting()
        set_reporting_enabled(False)


def test_a_beatport_refusal_mapped_to_502_is_not_reported(
    reporting, engine, monkeypatch
):
    def refuse(*_a: Any, **_k: Any) -> Any:
        raise ApiError(502, "BEATPORT_REFUSED", "Beatport said no")

    monkeypatch.setattr(server_module, "clean_post", refuse)
    status, body = call(engine, "POST", _a_clean_post_path(), {})
    _flush()
    assert status == 502
    assert "report_id" not in body["error"]
    assert reporting.events == []


def test_a_job_does_not_keep_its_exception_after_it_ended(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        raise RuntimeError("holds a traceback")

    job = _run_job(store, "clean_match", runner)
    for _ in range(100):
        if job.cause is None:
            break
        time.sleep(0.05)
    assert job.cause is None
    _flush()
    assert len(reporting.events) == 1


def test_a_job_finished_outside_its_runner_keeps_no_cause():
    store = JobStore()
    job = _run_job(store, "x", lambda j: None)
    try:
        raise ValueError("handled elsewhere")
    except ValueError:
        store.finish(
            job, state=JobState.FAILED, error={"code": "X_FAILED", "message": ""}
        )
    assert job.cause is None


def test_an_exception_logged_with_exc_info_is_one_event_and_the_500_names_it(
    reporting, engine, cuepoint_logger, monkeypatch
):
    def boom() -> str:
        try:
            raise RuntimeError("logged then raised")
        except RuntimeError as exc:
            logging.getLogger("cuepoint.engine.x").error("it broke", exc_info=exc)
            raise

    monkeypatch.setattr(server_module, "get_cuepoint_logs_dir", boom)
    status, body = call(engine, "GET", "/api/v1/logs/dir")
    _flush()
    assert status == 500
    assert len(reporting.events) == 1
    assert body["error"]["report_id"] == reporting.events[0]["event_id"]


def test_a_job_event_carries_the_error_code_tag(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "MATCH_STORAGE_FAILED", "message": "x"},
        )

    _run_job(store, "clean_match", runner)
    _flush()
    assert reporting.events[0]["tags"]["error_code"] == "MATCH_STORAGE_FAILED"


def test_a_job_failing_on_a_missing_file_records_nothing(reporting):
    store = JobStore()
    engine_reporting.watch_jobs(store)

    def runner(job):
        raise FileNotFoundError(2, "No such file")

    _run_job(store, "library_import", runner)
    _flush()
    assert reporting.events == []


def test_turning_reporting_off_forgets_the_steps_so_far(reporting):
    engine_reporting.breadcrumb("step", "before off")
    set_reporting_enabled(False)
    set_reporting_enabled(True)
    engine_reporting.breadcrumb("step", "after on")
    engine_reporting.report_unexpected(RuntimeError("x"))
    _flush()
    messages = [c.get("message") for c in _crumbs(reporting.events[0])]
    assert "after on" in messages
    assert "before off" not in messages


def test_the_transport_method_the_gate_overrides_still_exists():
    from sentry_sdk.transport import HttpTransport

    assert callable(getattr(HttpTransport, "_send_envelope", None))


def test_a_vanished_client_at_connection_level_is_not_reported(reporting):
    for exc in (
        TimeoutError("timed out"),
        OSError(9, "bad file descriptor"),
        BrokenPipeError(),
    ):
        try:
            raise exc
        except OSError:
            server_module.report_connection_error(None, ("127.0.0.1", 1))
    _flush()
    assert reporting.events == []


@pytest.mark.parametrize(
    ("environ", "expected"),
    [
        # Under main: what it gave is final, an empty dist included.
        (
            {"CUEPOINT_RELEASE": "cuepoint@2.0.0", "CUEPOINT_DIST": ""},
            ("cuepoint@2.0.0", None),
        ),
        ({"CUEPOINT_RELEASE": "cuepoint@2.0.0"}, ("cuepoint@2.0.0", None)),
        (
            {"CUEPOINT_RELEASE": "cuepoint@2.0.0", "CUEPOINT_DIST": "abc1234"},
            ("cuepoint@2.0.0", "abc1234"),
        ),
    ],
)
def test_under_main_the_given_release_and_dist_are_final(
    environ, expected, monkeypatch
):
    monkeypatch.setattr(engine_reporting, "get_short_commit_sha", lambda: "5ide5ca")
    assert engine_reporting._release_and_dist(environ) == expected


def test_a_bare_engine_names_its_own_release_and_the_commit_its_build_recorded(
    monkeypatch,
):
    from cuepoint.version import get_release

    monkeypatch.setattr(engine_reporting, "get_short_commit_sha", lambda: "5ide5ca")
    assert engine_reporting._release_and_dist({}) == (get_release(), "5ide5ca")
    assert engine_reporting._release_and_dist({"CUEPOINT_DIST": "abc1234"}) == (
        get_release(),
        "abc1234",
    )
