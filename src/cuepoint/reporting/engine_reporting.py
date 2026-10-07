"""The engine reports its own unexpected failures (REPORT-03, DEC-126, DEC-127, DEC-153).

Sentry is set up here, in the background right after ``run_engine()`` has bound its port (the
setup takes about 150 ms, which would otherwise be added to every start; REPORT-08), and only when a
DSN resolves (:func:`resolve_engine_dsn`): ``CUEPOINT_SENTRY_DSN`` when it names one, none when it is
``off``, and the project's built-in DSN (DEC-148) only in the frozen sidecar, never from source
(DEC-150).

What happens in the window before the setup has finished. Failures that occur while the engine is
starting, before the port is bound, are not reported from here: the engine ends, and the app's
supervisor reports that exit with the tail of the engine's output (REPORT-05). After the port is
bound and until the setup finishes, a small bounded buffer holds what would have been reported: up to
``MAX_PENDING_REPORTS`` (16) calls to :func:`report_unexpected` (the exception and its route, job
type and error code, not its trace), up to ``MAX_BREADCRUMBS`` breadcrumbs, and up to 16 logged ERROR
records of the ``cuepoint`` loggers (a temporary handler). The setup replays them right after
``init``; ``before_send`` and the gated transport check the user's choice at that moment, so with
reporting off nothing is sent, and the buffer is emptied when the choice turns off or the setup does
not succeed. Not covered: errors that are neither raised through :func:`report_unexpected` nor logged
at ERROR (for example an uncaught exception in a thread, which the SDK's own hooks catch only once
set up), and logged records beyond the 16th. Every sender checks REPORT-01's flag
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

``release`` is never None: with None the SDK guesses one by running ``git rev-parse`` in the working
directory, which is a subprocess at start and, in a user's folder, a read of their repository. Under
Electron main the release, ``dist`` and environment arrive in ``CUEPOINT_RELEASE``, ``CUEPOINT_DIST``
and ``CUEPOINT_ENVIRONMENT`` and are used as given, an empty ``CUEPOINT_DIST`` meaning "no dist".
Only a bare engine, with none of them set, names its own release and the commit its build recorded.

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
import sys
import threading
from collections import OrderedDict, deque
from datetime import datetime
from collections.abc import Callable, Iterator, Mapping
from typing import TYPE_CHECKING, Any, Optional

from cuepoint.reporting.expected import is_expected_failure
from cuepoint.reporting.scrub import ScrubContext, scrub_breadcrumb, scrub_event
from cuepoint.version import get_release, get_short_commit_sha

if TYPE_CHECKING:  # pragma: no cover
    from cuepoint.engine.jobs import Job, JobStore

__all__ = [
    "DSN_ENV",
    "before_breadcrumb",
    "BUILT_IN_ENGINE_DSN",
    "before_send",
    "breadcrumb",
    "is_refusal",
    "report_unexpected",
    "request_scope",
    "resolve_engine_dsn",
    "route_template",
    "setup_engine_reporting",
    "start_engine_reporting_in_background",
    "teardown_engine_reporting",
    "watch_jobs",
]

#: Where the DSN comes from. Never stored, never in the UI; ``off`` also means none.
DSN_ENV = "CUEPOINT_SENTRY_DSN"
#: The Python project's DSN (DEC-148), EU region. A DSN only allows sending events, so it is shipped
#: as the Qt app shipped its own. Used only by a frozen engine with ``CUEPOINT_SENTRY_DSN`` unset.
BUILT_IN_ENGINE_DSN = (
    "https://f6809b0fe8cdd6674bccbe0c87fd9535"
    "@o4510867725746176.ingest.de.sentry.io/4510867733217360"
)
RELEASE_ENV = "CUEPOINT_RELEASE"
DIST_ENV = "CUEPOINT_DIST"
ENVIRONMENT_ENV = "CUEPOINT_ENVIRONMENT"

MAX_BREADCRUMBS = 50
#: Most reports (and, separately, logged errors) held while the setup is still running.
MAX_PENDING_REPORTS = 16

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


#: The window between the port being bound and the setup finishing: what would be reported waits here.
_pending = False
_pending_reports: list[tuple[BaseException, dict[str, Optional[str]]]] = []
_pending_crumbs: deque[tuple[str, str, Optional[dict[str, Any]]]] = deque(
    maxlen=MAX_BREADCRUMBS
)
_pending_logs: list[logging.LogRecord] = []
_pending_handler: Optional[logging.Handler] = None
_background: Optional[threading.Thread] = None


class _PendingLogHandler(logging.Handler):
    """Holds ERROR records of the ``cuepoint`` loggers while the SDK is not set up yet."""

    def __init__(self) -> None:
        super().__init__(level=logging.ERROR)

    def emit(self, record: logging.LogRecord) -> None:
        with _lock:
            if (
                _pending
                and len(_pending_logs) < MAX_PENDING_REPORTS
                and reporting_enabled()
            ):
                _pending_logs.append(record)


def _discard_pending() -> None:
    """Forget what waited, and stop waiting. Idempotent."""
    global _pending, _pending_handler
    with _lock:
        _pending = False
        _pending_reports.clear()
        _pending_crumbs.clear()
        _pending_logs.clear()
        handler, _pending_handler = _pending_handler, None
    if handler is not None:
        logging.getLogger("cuepoint").removeHandler(handler)


def _begin_pending() -> None:
    global _pending, _pending_handler
    handler = _PendingLogHandler()
    with _lock:
        _pending = True
        _pending_handler = handler
    logging.getLogger("cuepoint").addHandler(handler)
    try:
        from cuepoint.engine.reporting_api import add_reporting_listener

        add_reporting_listener(lambda enabled: None if enabled else _discard_pending())
    except Exception:  # noqa: BLE001
        _logger.debug("[reporting] no listener", exc_info=True)


def _replay_pending() -> None:
    """Called once the SDK is set up: hand it what waited. The choice is checked again by the hooks."""
    global _pending, _pending_handler
    with _lock:
        was_pending = _pending
        reports = list(_pending_reports)
        crumbs = list(_pending_crumbs)
        records = list(_pending_logs)
        _pending = False
        _pending_reports.clear()
        _pending_crumbs.clear()
        _pending_logs.clear()
        handler, _pending_handler = _pending_handler, None
    if handler is not None:
        logging.getLogger("cuepoint").removeHandler(handler)
    if not was_pending:
        return
    for category, message, data in crumbs:
        breadcrumb(category, message, data)
    for exc, context in reports:
        report_unexpected(exc, **context)  # type: ignore[arg-type]
    for record in records:
        try:
            logging.getLogger(record.name).handle(record)
        except Exception:  # noqa: BLE001
            _logger.debug("[reporting] a logged error was dropped", exc_info=True)


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


def _release_and_dist(environ: Mapping[str, str]) -> tuple[str, str | None]:
    """The release and ``dist`` to report. Main gives both (REPORT-07), and what it gives is final:
    an empty ``CUEPOINT_DIST`` is "this build has no commit", not a reason to use the sidecar's.
    Only when main gave no release (a bare engine) are they the engine's own."""
    given = environ.get(RELEASE_ENV)
    if given:
        return given, environ.get(DIST_ENV) or None
    return get_release(), environ.get(DIST_ENV) or get_short_commit_sha()


def resolve_engine_dsn(
    environ: Mapping[str, str] = os.environ, *, frozen: Optional[bool] = None
) -> Optional[str]:
    """The DSN the engine reports to, or None for none (DEC-148, DEC-150).

    ``CUEPOINT_SENTRY_DSN`` set to ``off`` (any case) is none; set to anything else it is that
    DSN, in any build; unset or empty it is the built-in DSN when the engine is the frozen
    sidecar (``frozen``, by default ``sys.frozen``) and none from source.
    """
    value = (environ.get(DSN_ENV) or "").strip()
    if value.lower() == "off":
        return None
    if value:
        return value
    if frozen is None:
        frozen = bool(getattr(sys, "frozen", False))
    return BUILT_IN_ENGINE_DSN if frozen else None


def start_engine_reporting_in_background(
    *, setup: Optional[Callable[[], bool]] = None
) -> threading.Thread:
    """Run the setup on a daemon thread and return it at once, so it is off the start-up path.

    Importing the SDK and starting its client cost about 150 ms; the engine starts listening
    first. Until the setup finishes, reports, breadcrumbs and logged errors wait in a small bounded
    buffer (see the module docstring). Never raises; a failed setup is no reporting, and drops the
    buffer. A second call returns the thread of the first and starts nothing.
    """
    global _background
    with _lock:
        if _background is not None:
            return _background
    if setup is not None or resolve_engine_dsn() is not None:
        _begin_pending()

    def run() -> None:
        try:
            (setup or setup_engine_reporting)()
        except Exception:  # noqa: BLE001 — reporting must never stop the engine
            _logger.debug("[reporting] the background setup failed", exc_info=True)
        finally:
            # A setup that worked has replayed the buffer; any other has nothing to replay it to.
            if not _active:
                _discard_pending()

    thread = threading.Thread(target=run, name="cuepoint-reporting-setup", daemon=True)
    with _lock:
        _background = thread
    thread.start()
    return thread


def setup_engine_reporting(
    environ: Mapping[str, str] = os.environ,
    *,
    transport: Any = None,
    frozen: Optional[bool] = None,
) -> bool:
    """Set Sentry up, or do nothing. True when it is set up.

    No DSN (:func:`resolve_engine_dsn`) means nothing is set up and every other call here does
    nothing. ``transport`` is for tests: a ``Transport`` instance that records what would be sent.
    """
    global _active, _scrub_context
    dsn = resolve_engine_dsn(environ, frozen=frozen)
    if dsn is None:
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
        release, dist = _release_and_dist(environ)
        sentry_sdk.init(
            dsn=dsn,
            # Main passes the build's release, ``dist`` and environment (REPORT-07). A bare engine
            # names its own release; never empty, which would let the SDK guess one by running
            # ``git`` in the user's folder.
            release=release,
            dist=dist,
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
    _replay_pending()
    return True


def teardown_engine_reporting() -> None:
    """Close the client and forget it was set up (tests; the engine never needs this)."""
    global _active, _scrub_context, _background
    _discard_pending()
    with _lock:
        _background = None
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
        _hold_report(exc, route=route, job_type=job_type, error_code=error_code)
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


def _hold_report(exc: BaseException, **context: Optional[str]) -> None:
    """Keep a report made before the setup finished (bounded), unless the user has said no."""
    if not _pending or not reporting_enabled():
        return
    with _lock:
        if not _pending or len(_pending_reports) >= MAX_PENDING_REPORTS:
            return
        key = _capture_key(exc)
        if any(_capture_key(held) == key for held, _ in _pending_reports):
            return
        _pending_reports.append((exc, dict(context)))


def is_active() -> bool:
    """True once :func:`setup_engine_reporting` has succeeded (and not been torn down)."""
    return _active


def breadcrumb(
    category: str, message: str, data: Optional[Mapping[str, Any]] = None
) -> None:
    """Record one step before a possible error. Never raises, and does nothing when off."""
    if not _active:
        if _pending and reporting_enabled():
            with _lock:
                if _pending:
                    _pending_crumbs.append(
                        (category, message, dict(data) if data else None)
                    )
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
