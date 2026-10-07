"""The engine reports its own unexpected failures (REPORT-03, DEC-126, DEC-127, DEC-153).

Sentry is set up here, first thing in ``run_engine()``, and only when ``CUEPOINT_SENTRY_DSN``
is set (REPORT-08 builds it into releases; a source checkout and a user's build have none, so
nothing here sends anything until then). Every sender checks REPORT-01's flag
(:func:`~cuepoint.engine.reporting_api.reporting_enabled`) and ends in REPORT-02's scrubber.

**The CLI never calls any of this** (DEC-151). It does not set the DSN or the flag, and nothing
in ``src/main.py`` imports this module. ``breadcrumb`` is called from shared services and does
nothing until :func:`setup_engine_reporting` has succeeded.

``sentry_sdk`` is imported inside :func:`setup_engine_reporting` so that an engine, or the CLI,
without a DSN never loads it.

What the flag stops, and when. ``before_send`` runs when an event is captured, so an event
captured while the flag was off is never made. An event captured just before the flag turned
off is already queued for the transport, and the transport (``gated_transport.GatedHttpTransport``) checks the
flag again immediately before it sends, so that one is dropped too: nothing is sent after the
switch is off, and nothing is kept for later.

``release`` is passed as ``""`` and not None when ``CUEPOINT_RELEASE`` is unset: with None the SDK
guesses one by running ``git rev-parse`` in the working directory, which is a subprocess at start
and, in a user's folder, a read of their repository.

Each event is recorded by exception (a bounded map from the exception to its event id), so an
exception the logging integration already reported is not reported twice: ``report_unexpected``
gives back the first event's id, and the 500 envelope names it.

Attachments: the Python SDK holds them on the scope, not in the hint, and the engine adds none.
REPORT-05 adds the output tails, scrubbed by ``scrub_attachment``.
"""

from __future__ import annotations

import contextlib
import contextvars
import logging
import os
import re
import threading
from collections import OrderedDict, deque
from datetime import datetime
from collections.abc import Iterator, Mapping
from typing import TYPE_CHECKING, Any, Optional

from cuepoint.reporting.expected import is_expected_failure
from cuepoint.reporting.scrub import ScrubContext, scrub_breadcrumb, scrub_event

if TYPE_CHECKING:  # pragma: no cover
    from cuepoint.engine.jobs import Job, JobStore

__all__ = [
    "DSN_ENV",
    "before_breadcrumb",
    "before_send",
    "breadcrumb",
    "is_refusal",
    "report_unexpected",
    "request_scope",
    "route_template",
    "setup_engine_reporting",
    "teardown_engine_reporting",
    "watch_jobs",
]

#: Where the DSN comes from. Never stored, never in the UI; ``off`` also means none.
DSN_ENV = "CUEPOINT_SENTRY_DSN"
RELEASE_ENV = "CUEPOINT_RELEASE"
DIST_ENV = "CUEPOINT_DIST"
ENVIRONMENT_ENV = "CUEPOINT_ENVIRONMENT"

MAX_BREADCRUMBS = 50

_logger = logging.getLogger(__name__)

_lock = threading.Lock()
_active = False
_scrub_context: ScrubContext | None = None
#: The steps before an error, shared by every thread, already scrubbed. The SDK keeps breadcrumbs
#: per thread (each thread makes its own isolation scope), which would leave an error with only
#: its own thread's steps; so every breadcrumb, ours and the logging integration's, is taken here
#: in ``before_breadcrumb`` and put on each event in ``before_send``.
_ring: deque[dict[str, Any]] = deque(maxlen=MAX_BREADCRUMBS)
#: Events already made, by exception: (id, type, message) -> event id. No reference to the
#: exception is kept, since it holds its traceback; bounded, oldest out first.
_captured: OrderedDict[tuple[int, str, str], str] = OrderedDict()
_CAPTURED_LIMIT = 64
#: The trace headers of the request being answered on this thread, if main sent any.
_trace_headers: contextvars.ContextVar[dict[str, str] | None] = contextvars.ContextVar(
    "cuepoint_trace_headers", default=None
)


def reporting_enabled() -> bool:
    """REPORT-01's flag. Imported on use: ``cuepoint.engine`` loads the whole server, which the
    services (``breadcrumb`` is called from one) and the CLI must not pay for or cycle through."""
    from cuepoint.engine.reporting_api import reporting_enabled as flag

    return flag()


def _context() -> ScrubContext:
    global _scrub_context
    if _scrub_context is None:
        _scrub_context = ScrubContext.from_environment()
    return _scrub_context


# ---------------------------------------------------------------------------
# Route templates
# ---------------------------------------------------------------------------

#: A segment kept as written: a word of the engine's own routes (``library``, ``clear-logs``) or an
#: API version (``v1``). Anything else in a path is data, so it becomes ``{id}``.
_STATIC_SEGMENT = re.compile(r"^(?:v\d+|[a-z]{1,24}(?:-[a-z]{1,24})*)$")


def route_template(path: str) -> str:
    """The route a request path matched, with every id removed: ``/api/v1/jobs/{id}/events``.

    The query is dropped. A segment with a digit, a uuid or opaque id (16 or more characters of
    ``A-Za-z0-9_-``), or anything that is not a lower-case word or hyphenated words (as every route of the
    engine is), becomes ``{id}``, so a name or slug that reached
    a path is never kept (DEC-127).
    """
    try:
        path = str(path).split("?", 1)[0].split("#", 1)[0]
        segments = path.split("/")
        out = []
        for segment in segments:
            keep = segment == "" or _STATIC_SEGMENT.match(segment)
            out.append(segment if keep else "{id}")
        return "/".join(out) or "/"
    except Exception:  # noqa: BLE001 — never a reason to fail a request
        return "/{id}"


# ---------------------------------------------------------------------------
# Hooks the SDK calls
# ---------------------------------------------------------------------------


def is_refusal(
    event: Mapping[str, Any], hint: Optional[Mapping[str, Any]] = None
) -> bool:
    """True for an event that records a refusal, not a failure (DEC-126).

    A refusal that is logged with its exception, or captured by mistake, must not become a
    report: an ``ApiError`` below 500 or answering 503, and a busy-library error.
    """
    exc = None
    exc_info = (hint or {}).get("exc_info")
    if isinstance(exc_info, tuple) and len(exc_info) == 3:
        exc = exc_info[1]
    if exc is None:
        return False
    try:
        from cuepoint.engine.api_errors import ApiError
        from cuepoint.engine.jobs import JobTypeBusyError
    except Exception:  # noqa: BLE001
        return False
    if isinstance(exc, ApiError):
        return exc.status < 500 or exc.status == 503
    return isinstance(exc, JobTypeBusyError)


def _capture_key(exc: BaseException) -> tuple[int, str, str]:
    return (id(exc), type(exc).__name__, str(exc)[:200])


def _remember_capture(event: Mapping[str, Any], hint: Mapping[str, Any] | None) -> None:
    exc_info = (hint or {}).get("exc_info")
    event_id = event.get("event_id")
    if not (isinstance(exc_info, tuple) and len(exc_info) == 3 and exc_info[1]):
        return
    if not isinstance(event_id, str):
        return
    with _lock:
        _captured[_capture_key(exc_info[1])] = event_id
        while len(_captured) > _CAPTURED_LIMIT:
            _captured.popitem(last=False)


def before_send(
    event: dict[str, Any], hint: Optional[Mapping[str, Any]] = None
) -> Optional[dict[str, Any]]:
    """Drop the event when the flag is off or it is a refusal; otherwise scrub it, last."""
    if not reporting_enabled():
        return None
    try:
        if is_refusal(event, hint):
            return None
        logentry = event.get("logentry")
        if isinstance(logentry, dict) and "params" in logentry:
            # The message's arguments are the raw values, unquoted; the formatted message, where
            # the scrubber's quote rule applies, says the same thing.
            event = {
                **event,
                "logentry": {k: v for k, v in logentry.items() if k != "params"},
            }
        scrubbed = scrub_event(event, _context())
        _remember_capture(event, hint)
        # Breadcrumbs were scrubbed as they were taken; they replace whatever the SDK holds.
        scrubbed["breadcrumbs"] = {"values": list(_ring)}
        return scrubbed
    except Exception:  # noqa: BLE001 — an event that cannot be scrubbed is not sent
        return None


def before_breadcrumb(
    crumb: dict[str, Any], hint: Optional[Mapping[str, Any]] = None
) -> Optional[dict[str, Any]]:
    """Take the breadcrumb into the shared trail, scrubbed; never leave it on the SDK's scope.

    Dropped when the flag is off. Returns None always: the trail in ``_ring`` is the one every
    event is given (see ``_ring``).
    """
    if not reporting_enabled():
        _ring.clear()
        return None
    try:
        scrubbed = scrub_breadcrumb(crumb, _context())
        if scrubbed is not None:
            stamp = scrubbed.get("timestamp")
            if isinstance(stamp, datetime):
                # The SDK serialises an event's own datetimes, not ones we put on it later.
                scrubbed["timestamp"] = stamp.isoformat()
            _ring.append(scrubbed)
    except Exception:
        _logger.debug("[reporting] a breadcrumb was dropped", exc_info=True)
    return None


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


def setup_engine_reporting(
    environ: Mapping[str, str] = os.environ, *, transport: Any = None
) -> bool:
    """Set Sentry up, or do nothing. True when it is set up.

    No DSN (unset, empty or ``off``) means nothing is set up and every other call here does
    nothing. ``transport`` is for tests: a ``Transport`` instance that records what would be sent.
    """
    global _active, _scrub_context
    dsn = (environ.get(DSN_ENV) or "").strip()
    if not dsn or dsn.lower() == "off":
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.atexit import AtexitIntegration
        from sentry_sdk.integrations.dedupe import DedupeIntegration
        from sentry_sdk.integrations.excepthook import ExcepthookIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.threading import ThreadingIntegration

        if transport is None:
            from cuepoint.reporting.gated_transport import GatedHttpTransport

            transport = GatedHttpTransport
        _scrub_context = ScrubContext.from_environment()
        sentry_sdk.init(
            dsn=dsn,
            # An empty release stops the SDK guessing one by running ``git`` in the user's folder.
            release=environ.get(RELEASE_ENV) or "",
            dist=environ.get(DIST_ENV) or None,
            environment=environ.get(ENVIRONMENT_ENV) or "development",
            include_local_variables=False,
            send_default_pii=False,
            max_request_body_size="never",
            server_name="",
            traces_sample_rate=None,
            default_integrations=False,
            auto_enabling_integrations=False,
            send_client_reports=False,
            max_breadcrumbs=MAX_BREADCRUMBS,
            before_send=before_send,  # type: ignore[arg-type]
            before_breadcrumb=before_breadcrumb,
            transport=transport,
            in_app_include=["cuepoint"],
            integrations=[
                # ``cuepoint`` records are seen even though ``LoggingService`` turns the logger's
                # propagation off: the SDK hooks ``Logger.callHandlers``, which runs for every
                # record whatever its logger propagates to. ERROR is an event; INFO and above are
                # breadcrumbs. No stdlib integration: its HTTP and subprocess breadcrumbs carry
                # URLs and command lines.
                LoggingIntegration(
                    level=logging.INFO,
                    event_level=logging.ERROR,
                    sentry_logs_level=None,
                ),
                # Not propagating the scope: each thread would otherwise carry its own copy of
                # the breadcrumbs, and the steps before an error would be only that thread's.
                ThreadingIntegration(propagate_scope=False),
                ExcepthookIntegration(),
                DedupeIntegration(),
                AtexitIntegration(),
            ],
        )
    except Exception:
        _logger.debug("[reporting] could not set up", exc_info=True)
        return False
    try:
        from cuepoint.engine.reporting_api import add_reporting_listener

        # Turning reporting off forgets the steps recorded so far: turning it on again must not
        # attach what happened while it was off, or before.
        add_reporting_listener(lambda enabled: None if enabled else _ring.clear())
    except Exception:
        _logger.debug("[reporting] no listener", exc_info=True)
    with _lock:
        _active = True
    return True


def teardown_engine_reporting() -> None:
    """Close the client and forget it was set up (tests; the engine never needs this)."""
    global _active, _scrub_context
    with _lock:
        was_active = _active
        _active = False
        _scrub_context = None
        _ring.clear()
        _captured.clear()
    if not was_active:
        return
    try:
        import sentry_sdk

        scope = sentry_sdk.get_global_scope()
        scope.client.close(timeout=0)
        scope.set_client(None)  # the SDK's own do-nothing client
    except Exception:  # noqa: BLE001
        _logger.debug("[reporting] a call failed", exc_info=True)


# ---------------------------------------------------------------------------
# What the engine calls
# ---------------------------------------------------------------------------


def report_unexpected(
    exc: BaseException,
    *,
    route: Optional[str] = None,
    job_type: Optional[str] = None,
    error_code: Optional[str] = None,
) -> Optional[str]:
    """Report ``exc`` and return the 32-hex event id, or None. Never raises.

    None when reporting is not set up, the flag is off, the event was dropped (a refusal) or it
    repeats one already reported.
    """
    if not _active:
        return None
    try:
        import sentry_sdk

        with _lock:
            known = _captured.get(_capture_key(exc))
        if known:
            return known
        with sentry_sdk.new_scope() as scope:
            if error_code:
                scope.set_tag("error_code", error_code)
            if route:
                scope.set_tag("route", route)
            if job_type:
                scope.set_tag("job_type", job_type)
            incoming = _trace_headers.get()
            if incoming:
                scope.continue_trace(incoming)
            event_id = sentry_sdk.capture_exception(exc)
        return event_id or None
    except Exception:  # noqa: BLE001
        return None


def is_active() -> bool:
    """True once :func:`setup_engine_reporting` has succeeded (and not been torn down)."""
    return _active


def breadcrumb(
    category: str, message: str, data: Optional[Mapping[str, Any]] = None
) -> None:
    """Record one step before a possible error. Never raises, and does nothing when off."""
    if not _active:
        return
    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            category=category,
            message=message,
            data=dict(data) if data else None,
            level="info",
        )
    except Exception:  # noqa: BLE001
        _logger.debug("[reporting] a call failed", exc_info=True)


@contextlib.contextmanager
def request_scope(headers: Any) -> Iterator[None]:
    """Remember the trace Electron main sent, for the events made while answering this request.

    Main sends ``sentry-trace`` and ``baggage`` on every engine request when it reports, so an
    event reported from the request carries main's ``trace_id`` (:func:`report_unexpected` reads
    it). No transaction or span is started. A context variable, because the engine answers on
    many threads: each thread sees only its own request's headers. Breadcrumbs are not scoped to
    the request on purpose; the steps before an error include the other requests and jobs.
    """
    if not _active or headers is None:
        yield
        return
    incoming: dict[str, str] = {}
    try:
        for name in ("sentry-trace", "baggage"):
            value = headers.get(name)
            if value:
                incoming[name] = str(value)
    except Exception:
        incoming = {}
    token = _trace_headers.set(incoming or None)
    try:
        yield
    finally:
        _trace_headers.reset(token)


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


def watch_jobs(store: "JobStore") -> None:
    """Breadcrumb every job's start and end, and report a failure that is not expected."""
    from cuepoint.engine.jobs import JobState

    def started(job: "Job") -> None:
        breadcrumb("job", f"{job.type} started", {"job_type": job.type})

    def ended(job: "Job") -> None:
        code = (job.error or {}).get("code")
        breadcrumb(
            "job",
            f"{job.type} {job.state.value}",
            {"job_type": job.type, "state": job.state.value, "code": code},
        )
        if job.state is not JobState.FAILED or job.cancel_requested:
            return
        cause = getattr(job, "cause", None)
        if is_expected_failure(
            code, cause if isinstance(cause, BaseException) else None
        ):
            return
        report_unexpected(
            cause
            if isinstance(cause, BaseException)
            else RuntimeError(str(code or "JOB_FAILED")),
            job_type=job.type,
            error_code=str(code) if code else None,
        )

    store.add_listeners(started=started, ended=ended)
