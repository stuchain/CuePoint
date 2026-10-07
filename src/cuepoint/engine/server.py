"""HTTP server for CuePoint engine sidecar."""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Type
from urllib.parse import parse_qs, urlparse

from cuepoint.engine.config_api import (
    get_beatport_token_status,
    parse_beatport_token_body,
    parse_beatport_token_test_body,
    set_beatport_token,
    test_beatport_token,
)
from cuepoint.engine.api_errors import error_payload as _error_payload
from cuepoint.engine.job_events import iter_job_events
from cuepoint.engine.support_bundle_api import (
    parse_support_bundle_body,
    run_support_bundle,
)
from cuepoint.engine.logs_api import get_cuepoint_log_text, get_cuepoint_logs_dir
from cuepoint.engine.privacy_api import clear_cache_now, clear_logs_now
from cuepoint.engine.reporting_api import (
    initial_reporting_enabled,
    parse_reporting_body,
    set_reporting_enabled,
)
from cuepoint.engine.activity_api import (
    RECENT_LIMIT_DEFAULT,
    ActivityUnavailableError,
    recent_activity,
)
from cuepoint.engine.jobs_api import (
    LIST_LIMIT_DEFAULT,
    list_jobs,
)
from cuepoint.engine.library_api import (
    LibraryUnavailableError,
    MODE_BROWSE,
    SEARCH_LIMIT_DEFAULT,
    library_facet,
    parse_collection_id,
    parse_optional_sort,
    parse_scope,
    library_filter_fields,
    library_playlists,
    library_summary,
    library_track_detail,
    parse_direction,
    parse_fields,
    parse_filters_param,
    parse_import_body,
    parse_int_param,
    parse_mode,
    parse_playlist_id,
    parse_refresh_apply_body,
    parse_refresh_preview_body,
    search_library,
    start_import,
    start_refresh_apply,
    start_refresh_preview,
)
from cuepoint.models.filter_rule import FilterRuleError
from cuepoint.persistence.track_query import (
    BROWSE_IDS_LIMIT_DEFAULT,
    BROWSE_LIMIT_DEFAULT,
)
from cuepoint.engine.discover_api import (
    handle_get as discover_get,
    handle_post as discover_post,
    handles_get as discover_handles_get,
    handles_post as discover_handles_post,
    status_for as discover_status,
)
from cuepoint.engine.clean_api import (
    handle_get as clean_get,
    handle_post as clean_post,
    handles_get as clean_handles_get,
    handles_post as clean_handles_post,
    status_for as clean_status,
)
from cuepoint.engine.organization_api import (
    handle_get as organization_get,
    handle_post as organization_post,
    handles_get as organization_handles_get,
    handles_post as organization_handles_post,
    status_for as organization_status,
)
from cuepoint.engine.rekordbox_export_api import (
    handle_get as rekordbox_export_get,
    handle_post as rekordbox_export_post,
    handles_get as rekordbox_export_handles_get,
    handles_post as rekordbox_export_handles_post,
    status_for as rekordbox_export_status,
)
from cuepoint.engine.sets_api import (
    handle_get as sets_get,
    handle_post as sets_post,
    handles_get as sets_handles_get,
    handles_post as sets_handles_post,
    status_for as sets_status,
)
from cuepoint.engine.waveforms_api import (
    handle_get as waveforms_get,
    handle_post as waveforms_post,
    handles_get as waveforms_handles_get,
    handles_post as waveforms_handles_post,
    status_for as waveforms_status,
)
from cuepoint.engine.jobs import JobStore, JobTypeBusyError
from cuepoint.reporting.engine_reporting import (
    breadcrumb,
    is_active as reporting_active,
    report_unexpected,
    request_scope,
    route_template,
    setup_engine_reporting,
    watch_jobs,
)
from cuepoint.reporting.expected import is_expected_failure
from cuepoint.version import __version__, get_release

_logger = logging.getLogger(__name__)

ALLOWED_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
JOB_ROUTE = re.compile(r"^/api/v1/jobs/([^/]+)(?:/(results|events))?$")
JOB_CANCEL_ROUTE = re.compile(r"^/api/v1/jobs/([^/]+)/cancel$")
ARTWORK_ROUTE = re.compile(r"^/api/v1/library/tracks/(\d+)/artwork$")


def _resolve_job_repository() -> Optional[Any]:
    """Resolve the job repository, or None if persistence is unavailable.

    The job store is built at import time, before services are bootstrapped, so
    the repository is resolved lazily on first use. Job records are a
    convenience: if the database cannot be reached the engine still runs jobs,
    it just cannot report on them after a restart.
    """
    try:
        from cuepoint.services.interfaces import IJobRepository
        from cuepoint.utils.di_container import get_container

        repository = get_container().resolve(IJobRepository)
    except Exception:  # noqa: BLE001 — persistence is best-effort
        return None

    try:
        # Before the stale records below are closed out, while "still running"
        # still means "interrupted": a match job a restart cut short is offered
        # for resumption in the activity feed, never resumed unasked (DEC-065).
        from cuepoint.engine.match_jobs import offer_interrupted_matches

        offer_interrupted_matches()
    except Exception:  # noqa: BLE001 — an offer must not stop jobs being recorded
        pass

    try:
        # The same moment, for the same reason: a tag write or restore a
        # restart cut short is offered for restoring, never restored unasked
        # (CLEAN-13, DEC-070).
        from cuepoint.engine.tag_write_jobs import offer_interrupted_tag_jobs

        offer_interrupted_tag_jobs()
    except Exception:  # noqa: BLE001 — an offer must not stop jobs being recorded
        pass

    try:
        # Anything still marked running belongs to a process that is gone.
        repository.mark_interrupted(datetime.now(timezone.utc).isoformat())
    except Exception:  # noqa: BLE001
        pass
    return repository


# Shared job store for process lifetime
_JOB_STORE = JobStore(job_repository_provider=_resolve_job_repository)


@dataclass(frozen=True)
class EngineConfig:
    host: str
    port: int
    token: Optional[str] = None

    def __post_init__(self) -> None:
        if self.host not in ALLOWED_HOSTS:
            raise ValueError(
                f"Host must be loopback only (got {self.host!r}); allowed: {sorted(ALLOWED_HOSTS)}"
            )
        if not (1 <= self.port <= 65535):
            raise ValueError(f"Port out of range: {self.port}")

    @classmethod
    def from_env(cls) -> "EngineConfig":
        host = os.environ.get("CUEPOINT_HOST", "127.0.0.1").strip()
        port_raw = os.environ.get("CUEPOINT_PORT", "8765").strip()
        token = os.environ.get("CUEPOINT_TOKEN") or None
        if host not in ALLOWED_HOSTS:
            raise ValueError(
                f"CUEPOINT_HOST must be loopback only (got {host!r}); allowed: {sorted(ALLOWED_HOSTS)}"
            )
        try:
            port = int(port_raw)
        except ValueError as exc:
            raise ValueError(f"Invalid CUEPOINT_PORT: {port_raw!r}") from exc
        return cls(host=host, port=port, token=token)


def health_payload() -> dict:
    # `release` is the name every process reports to Sentry (REPORT-07); not a secret.
    payload = {"status": "ok", "version": __version__, "release": get_release()}
    session_id = os.environ.get("CUEPOINT_SESSION_ID", "").strip()
    if session_id:
        payload["session_id"] = session_id
    return payload


#: Re-exported so every module that built this envelope before ORG-08 still
#: imports it from where it was. There is one definition, in ``api_errors``.
error_payload = _error_payload


def get_job_store() -> JobStore:
    return _JOB_STORE


#: The most of an unread request body read and dropped before an answer. The
#: engine's bodies are small JSON; past this the connection is let reset.
_MAX_DISCARDED_BODY = 16 * 1024 * 1024


def report_connection_error(request: Any, client_address: Any) -> None:
    """What the engine's server does with an exception that escaped a request thread.

    ``socketserver`` calls ``handle_error`` for it and by default prints the traceback to stderr,
    which nothing reads and which holds paths. An OSError here is the client going away (a closed
    or timed out connection) and is not an error; anything else is reported (REPORT-03) and written to the log with its stack.
    """
    exc = sys.exc_info()[1]
    if exc is None or isinstance(exc, OSError):
        return
    report_unexpected(exc, route="{connection}")
    _logger.warning(
        "[engine] a request ended with an unhandled %s",
        type(exc).__name__,
        exc_info=exc,
    )


def with_error_reporting(server: ThreadingHTTPServer) -> ThreadingHTTPServer:
    """Give ``server`` the engine's ``handle_error``: reported, never printed. Returns it."""

    def handle_error(request: Any, client_address: Any) -> None:
        report_connection_error(request, client_address)

    server.handle_error = handle_error  # type: ignore[method-assign]
    return server


#: What an exception that escapes a route is answered with, when no answer was started.
INTERNAL_ERROR = "INTERNAL_ERROR"


def make_handler(
    config: EngineConfig, store: Optional[JobStore] = None
) -> Type[BaseHTTPRequestHandler]:
    job_store = store or _JOB_STORE
    # Resets the flag to the launch value for each server, which is what the
    # tests' start_engine_thread needs; run_engine has already set it (REPORT-01).
    set_reporting_enabled(initial_reporting_enabled(os.environ))

    class EngineHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:  # noqa: A003
            return

        #: Whether this request's status line has gone out; reset per request.
        _response_started: bool = False

        def _send_unexpected(self, exc: BaseException, payload: dict) -> None:
            """Answer a failure that is ours: report it, then send the 500 envelope.

            The one place a route answers 500 (REPORT-03). The event id goes into the
            envelope as ``error.report_id`` when one was made, so the renderer can name it.
            """
            error = payload.get("error")
            code = error.get("code") if isinstance(error, dict) else None
            event_id = (
                None
                if is_expected_failure(code, exc)
                else report_unexpected(exc, route=route_template(self.path))
            )
            if event_id and isinstance(payload.get("error"), dict):
                payload["error"]["report_id"] = event_id
            self._send_json(500, payload)

        def _send_mapped(self, exc: BaseException, status_for) -> None:
            """Answer a routed module's mapping of ``exc``, reporting it if it is a failure.

            Everything but a 500 is sent as mapped, with no report: below 500, 503 and 502 (a
            Beatport refusal) are refusals (DEC-126). A 500 whose code
            names a cause the user owns is sent as mapped too (DEC-153).
            """
            status, payload = status_for(exc)
            error = payload.get("error") if isinstance(payload, dict) else None
            code = error.get("code") if isinstance(error, dict) else None
            if status == 500 and not is_expected_failure(code, exc):
                event_id = report_unexpected(exc, route=route_template(self.path))
                if event_id and isinstance(error, dict):
                    error["report_id"] = event_id
            self._send_json(status, payload)

        def _dispatch(self, route) -> None:
            """Run one route in its own scope; an exception that escapes it is answered.

            What escapes is a bug: it is reported with the route's template and, when no answer
            was started, answered ``500 INTERNAL_ERROR`` with the ``report_id`` rather than a
            dropped connection. A client that went away (a closed connection) is not reported.
            """
            with request_scope(self.headers):
                try:
                    route()
                except ConnectionError:
                    return
                except Exception as exc:  # noqa: BLE001 — the last resort for a request
                    if self._response_started:
                        report_unexpected(exc, route=route_template(self.path))
                        return
                    self._send_unexpected(
                        exc,
                        error_payload(INTERNAL_ERROR, str(exc) or type(exc).__name__),
                    )

        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_image(self, body: bytes) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _send_no_content(self) -> None:
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def _handle_artwork(self, raw_track_id: str, query: str) -> None:
            """A track's artwork thumbnail as JPEG bytes (CLEAN-09).

            204 when the track has none, which the renderer draws as an empty
            state; never a path, never the original image.
            """
            if not self._authorized():
                self._send_json(
                    401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                )
                return
            sizes = parse_qs(query).get("size", [])
            if len(sizes) != 1:
                self._send_json(
                    400,
                    error_payload("INVALID_REQUEST", "size is required, once"),
                )
                return
            from cuepoint.engine.artwork_jobs import track_thumbnail

            try:
                body = track_thumbnail(int(raw_track_id), sizes[0])
            except ValueError as exc:
                self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                return
            except LookupError as exc:
                self._send_json(404, error_payload("TRACK_NOT_FOUND", str(exc)))
                return
            except Exception as exc:  # noqa: BLE001 — surface to API client
                self._send_unexpected(exc, error_payload("ARTWORK_FAILED", str(exc)))
                return
            if body is None:
                self._send_no_content()
                return
            self._send_image(body)

        def _authorized(self) -> bool:
            if not config.token:
                return True
            auth = self.headers.get("Authorization", "")
            expected = f"Bearer {config.token}"
            return auth == expected

        #: The request's body once read; ``None`` until then. Reset per request.
        _body: Optional[bytes] = None

        def handle_one_request(self) -> None:
            self._body = None
            self._response_started = False
            super().handle_one_request()

        def _content_length(self) -> int:
            try:
                return max(0, int(self.headers.get("Content-Length", "0") or 0))
            except ValueError:
                return 0

        def _read_body(self) -> bytes:
            if self._body is None:
                length = self._content_length()
                self._body = self.rfile.read(length) if length else b""
            return self._body

        def _discard_unread_body(self) -> None:
            """Read and drop a body no route read, before answering.

            The server answers and closes (HTTP/1.0). Closing a socket with the
            client's body still unread makes Windows reset the connection, and
            the client then sees "connection aborted" instead of the answer:
            a POST to an unknown path, or one refused for its token, failed
            that way at random. Bounded, so a huge body is not read in full.
            """
            if self._body is not None or getattr(self, "headers", None) is None:
                return
            remaining = min(self._content_length(), _MAX_DISCARDED_BODY)
            self._body = b""
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 65536))
                if not chunk:
                    break
                remaining -= len(chunk)

        def send_response(self, code: int, message: Optional[str] = None) -> None:
            self._discard_unread_body()
            self._response_started = True
            # A step before any later error: the method, the route's template and the status,
            # never the query or the body (REPORT-03).
            # ``send_error`` can run before the request line was parsed (a too long line, a bad
            # version), when there is no command or path yet; and nothing is built unless
            # reporting is set up.
            command = getattr(self, "command", None)
            path = getattr(self, "path", None)
            if reporting_active() and command and isinstance(path, str):
                route = route_template(path)
                breadcrumb(
                    "http",
                    f"{command} {route} {code}",
                    {"method": command, "route": route, "status": code},
                )
            super().send_response(code, message)

        def _stream_job_events(self, job_id: str) -> None:
            job = job_store.get(job_id)
            if job is None:
                self._send_json(
                    404, error_payload("JOB_NOT_FOUND", f"Job {job_id} not found")
                )
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                for frame in iter_job_events(job_store, job_id):
                    self.wfile.write(frame)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return

        def _handle_job_get(self, path: str) -> None:
            if not self._authorized():
                self._send_json(
                    401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                )
                return
            match = JOB_ROUTE.match(path)
            if not match:
                self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))
                return
            job_id, suffix = match.group(1), match.group(2)
            job = job_store.get(job_id)
            if job is None:
                self._send_json(
                    404, error_payload("JOB_NOT_FOUND", f"Job {job_id} not found")
                )
                return
            if suffix == "events":
                self._stream_job_events(job_id)
                return
            if suffix == "results":
                payload: Dict[str, Any] = {
                    "id": job.id,
                    "state": job.state.value,
                }
                # What the job produced (LIBRARY-10's refresh diff was the
                # first). Served from this route rather than the status one,
                # because status is polled and this is asked for once. The
                # file-based match's `results` and `batch_results` retired
                # with inKey (CLEAN-14).
                if job.result is not None:
                    payload["result"] = job.result
                self._send_json(200, payload)
                return
            self._send_json(200, job.to_status_dict())

        def _handle_refresh_post(self, path: str) -> None:
            """Preview or apply a refresh (LIBRARY-10).

            Both answer 202 with a job identity, because both do real work over
            a whole export and neither belongs on an HTTP request's thread.
            Everything that can be decided without reading the file is decided
            here, so a caller learns about a bad diff id or a busy library at
            once rather than by watching a job fail.
            """
            from cuepoint.engine.library_refresh import (
                DiffNotFoundError,
                DiffStaleError,
            )

            try:
                if path.endswith("/preview"):
                    requested, force = parse_refresh_preview_body(self._read_body())
                    payload = start_refresh_preview(
                        requested, force, job_store=job_store
                    )
                else:
                    diff_id, confirm = parse_refresh_apply_body(self._read_body())
                    payload = start_refresh_apply(diff_id, confirm, job_store=job_store)
            except ValueError as exc:
                self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                return
            except DiffNotFoundError as exc:
                # 404, not 400: the request was well formed, the thing it named
                # is not here.
                self._send_json(
                    404,
                    error_payload("LIBRARY_REFRESH_DIFF_NOT_FOUND", str(exc)),
                )
                return
            except DiffStaleError as exc:
                # 409: the request was fine and so was the diff, but the world
                # moved. The reason goes back so the message can say what
                # changed rather than only that something did.
                self._send_json(
                    409,
                    {
                        "error": {
                            "code": "LIBRARY_REFRESH_DIFF_STALE",
                            "message": str(exc),
                            "diff_id": exc.diff_id,
                            "xml_path": exc.xml_path,
                        }
                    },
                )
                return
            except JobTypeBusyError as exc:
                # 409, not 400: the request was fine, the library was busy. The
                # running job's id and type go back, so a caller can follow it
                # rather than only being told no — and the type matters here,
                # because an import can be what is blocking a refresh.
                self._send_json(
                    409,
                    {
                        "error": {
                            "code": "LIBRARY_BUSY",
                            "message": str(exc),
                            "job_id": exc.job_id,
                            "job_type": exc.job_type,
                        }
                    },
                )
                return
            except Exception as exc:  # noqa: BLE001 — surface to API client
                self._send_unexpected(
                    exc, error_payload("LIBRARY_REFRESH_FAILED", str(exc))
                )
                return
            self._send_json(202, payload)

        def do_GET(self) -> None:  # noqa: N802
            self._dispatch(self._route_get)

        def _route_get(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/health":
                self._send_json(200, health_payload())
                return
            if path == "/api/v1/status":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                self._send_json(200, {"ready": True, **health_payload()})
                return
            if path == "/api/v1/logs/dir":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                self._send_json(200, {"logs_dir": get_cuepoint_logs_dir()})
                return
            if path == "/api/v1/logs/cuepoint":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                level = params.get("level", ["All"])[0] or None
                search = params.get("search", [""])[0] or None
                tail_lines_raw = params.get("tail_lines", ["10000"])[0]
                max_bytes_raw = params.get("max_bytes", ["5000000"])[0]
                try:
                    tail_lines = int(tail_lines_raw)
                except ValueError:
                    self._send_json(
                        400,
                        error_payload(
                            "INVALID_REQUEST", "tail_lines must be an integer"
                        ),
                    )
                    return
                try:
                    max_bytes = int(max_bytes_raw)
                except ValueError:
                    self._send_json(
                        400,
                        error_payload(
                            "INVALID_REQUEST", "max_bytes must be an integer"
                        ),
                    )
                    return
                try:
                    payload = get_cuepoint_log_text(
                        level=level,
                        search=search,
                        tail_lines=tail_lines,
                        max_bytes=max_bytes,
                        sanitize=True,
                    )
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("LOGS_READ_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/library/summary":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                try:
                    payload = library_summary()
                except LibraryUnavailableError as exc:
                    self._send_json(503, error_payload("LIBRARY_UNAVAILABLE", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("LIBRARY_SUMMARY_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/library/search":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                # One endpoint, two modes (DEC-023). Every browsing parameter is
                # optional and absent means what it meant before Phase 4, so a
                # caller written against SHELL-04 gets exactly what it got.
                try:
                    mode = parse_mode(params.get("mode", [None])[0])
                    fields = parse_fields(params.get("fields", [None])[0])
                    default_limit = SEARCH_LIMIT_DEFAULT
                    if mode == MODE_BROWSE:
                        default_limit = (
                            BROWSE_IDS_LIMIT_DEFAULT
                            if fields is not None
                            else BROWSE_LIMIT_DEFAULT
                        )
                    limit = parse_int_param(
                        params.get("limit", [None])[0],
                        default=default_limit,
                        name="limit",
                    )
                    offset = parse_int_param(
                        params.get("offset", [None])[0], default=0, name="offset"
                    )
                    playlist_id = parse_playlist_id(
                        params.get("playlist_id", [None])[0]
                    )
                    # Absent stays absent: a scope with an order of its own
                    # answers for it, and the library's default answers for a
                    # request that names neither (ORG-08, ORG-09).
                    sort = parse_optional_sort(params.get("sort", [None])[0])
                    raw_dir = params.get("dir", [None])[0]
                    direction = parse_direction(raw_dir) if raw_dir else None
                    filters = parse_filters_param(params.get("filters", [None])[0])
                    scope = parse_scope(params.get("scope", [None])[0])
                    collection_id = parse_collection_id(
                        params.get("collection_id", [None])[0]
                    )
                except (ValueError, FilterRuleError) as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                try:
                    payload = search_library(
                        params.get("q", [""])[0],
                        limit=limit,
                        offset=offset,
                        mode=mode,
                        playlist_id=playlist_id,
                        sort=sort,
                        direction=direction,
                        filters=filters,
                        fields=fields,
                        scope=scope,
                        collection_id=collection_id,
                    )
                except ValueError as exc:
                    # A request that cannot be honoured as written, not a
                    # failure: it names the clause, and the caller can fix it.
                    # ``BrowseQueryError`` and ``FilterRuleError`` are both
                    # ValueErrors, and so is a scope that does not go with the
                    # collection it was given (ORG-08).
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except LibraryUnavailableError as exc:
                    self._send_json(503, error_payload("LIBRARY_UNAVAILABLE", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(exc, error_payload("SEARCH_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/library/playlists":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                try:
                    payload = library_playlists()
                except LibraryUnavailableError as exc:
                    self._send_json(503, error_payload("LIBRARY_UNAVAILABLE", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("PLAYLISTS_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/library/filter-fields":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                self._send_json(200, library_filter_fields())
                return
            if path == "/api/v1/library/facets":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                field = params.get("field", [""])[0]
                if not field:
                    self._send_json(
                        400, error_payload("INVALID_REQUEST", "field is required")
                    )
                    return
                try:
                    limit = parse_int_param(
                        params.get("limit", [None])[0], default=0, name="limit"
                    )
                    playlist_id = parse_playlist_id(
                        params.get("playlist_id", [None])[0]
                    )
                    filters = parse_filters_param(params.get("filters", [None])[0])
                    scope = parse_scope(params.get("scope", [None])[0])
                    collection_id = parse_collection_id(
                        params.get("collection_id", [None])[0]
                    )
                except (ValueError, FilterRuleError) as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                try:
                    payload = library_facet(
                        field,
                        query=params.get("q", [""])[0],
                        playlist_id=playlist_id,
                        filters=filters,
                        limit=limit,
                        scope=scope,
                        collection_id=collection_id,
                    )
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except LibraryUnavailableError as exc:
                    self._send_json(503, error_payload("LIBRARY_UNAVAILABLE", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(exc, error_payload("FACET_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return
            artwork = ARTWORK_ROUTE.match(path)
            if artwork:
                self._handle_artwork(artwork.group(1), parsed.query)
                return
            if clean_handles_get(path):
                # Before the track prefix below, for the organization routes'
                # reason: it would read "7/matches" as a track id (CLEAN-11).
                self._handle_routed(
                    lambda: clean_get(path, parse_qs(parsed.query)), clean_status
                )
                return
            if rekordbox_export_handles_get(path):
                self._handle_routed(
                    lambda: rekordbox_export_get(path, parse_qs(parsed.query)),
                    rekordbox_export_status,
                )
                return
            if discover_handles_get(path):
                self._handle_routed(
                    lambda: discover_get(path, parse_qs(parsed.query)),
                    discover_status,
                )
                return
            if sets_handles_get(path):
                self._handle_routed(
                    lambda: sets_get(path, parse_qs(parsed.query)), sets_status
                )
                return
            if waveforms_handles_get(path):
                self._handle_routed(
                    lambda: waveforms_get(
                        path, parse_qs(parsed.query), job_store=job_store
                    ),
                    waveforms_status,
                )
                return
            if organization_handles_get(path):
                # Before the prefix below, which would read the whole of
                # "7/history" as a track id and refuse it as one.
                self._handle_organization(
                    lambda: organization_get(path, parse_qs(parsed.query))
                )
                return
            if path.startswith("/api/v1/library/tracks/"):
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                raw_id = path[len("/api/v1/library/tracks/") :].strip("/")
                try:
                    track_id = int(raw_id)
                except ValueError:
                    self._send_json(
                        400,
                        error_payload(
                            "INVALID_REQUEST",
                            f"track id must be a number, not {raw_id!r}",
                        ),
                    )
                    return
                try:
                    payload = library_track_detail(track_id)
                except LookupError as exc:
                    self._send_json(404, error_payload("TRACK_NOT_FOUND", str(exc)))
                    return
                except LibraryUnavailableError as exc:
                    self._send_json(503, error_payload("LIBRARY_UNAVAILABLE", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("TRACK_DETAIL_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/activity/recent":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                try:
                    limit = parse_int_param(
                        params.get("limit", [None])[0],
                        default=RECENT_LIMIT_DEFAULT,
                        name="limit",
                    )
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                event_type = params.get("type", [None])[0] or None
                try:
                    payload = recent_activity(limit=limit, event_type=event_type)
                except ActivityUnavailableError as exc:
                    self._send_json(
                        503, error_payload("ACTIVITY_UNAVAILABLE", str(exc))
                    )
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("ACTIVITY_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/jobs":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                try:
                    limit = parse_int_param(
                        params.get("limit", [None])[0],
                        default=LIST_LIMIT_DEFAULT,
                        name="limit",
                    )
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                state = params.get("state", ["active"])[0] or "active"
                if state not in ("active", "all"):
                    self._send_json(
                        400,
                        error_payload(
                            "INVALID_REQUEST", "state must be 'active' or 'all'"
                        ),
                    )
                    return
                self._send_json(
                    200, list_jobs(state=state, limit=limit, job_store=job_store)
                )
                return
            if path.startswith("/api/v1/jobs/"):
                self._handle_job_get(path)
                return
            if path == "/api/v1/config/beatport-token":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                self._send_json(200, get_beatport_token_status())
                return
            if organization_handles_get(path):
                self._handle_organization(
                    lambda: organization_get(path, parse_qs(parsed.query))
                )
                return
            self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))

        def _handle_organization(self, run) -> None:
            """Answer one organization route (ORG-08).

            The whole of the server's knowledge of that module: whether it
            handles the path, and how to send what it answers. Every status it
            can produce — a refused clause, a missing track, a busy library, an
            unreachable database — is decided there, beside the handler that
            knows which it is, rather than in five ``except`` clauses here.
            """
            if not self._authorized():
                self._send_json(
                    401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                )
                return
            self._handle_routed(run, organization_status)

        def _handle_routed(self, run, status_for) -> None:
            """Answer one route of a module that maps its own refusals.

            ORG-08's shape, shared by the organization and Clean modules: the
            module says whether it handles a path and what each refusal is;
            this sends the answer.
            """
            if not self._authorized():
                self._send_json(
                    401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                )
                return
            try:
                status, payload = run()
            except Exception as exc:  # noqa: BLE001 — mapped, not swallowed
                self._send_mapped(exc, status_for)
                return
            self._send_json(status, payload)

        def do_POST(self) -> None:  # noqa: N802
            self._dispatch(self._route_post)

        def _route_post(self) -> None:
            path = urlparse(self.path).path
            if not self._authorized():
                self._send_json(
                    401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                )
                return
            if path == "/api/v1/privacy/clear-logs":
                try:
                    payload = clear_logs_now()
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("PRIVACY_CLEAR_LOGS_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/privacy/clear-cache":
                try:
                    payload = clear_cache_now()
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("PRIVACY_CLEAR_CACHE_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/reporting":
                try:
                    enabled = parse_reporting_body(self._read_body())
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                self._send_json(200, set_reporting_enabled(enabled))
                return

            if path == "/api/v1/library/import":
                try:
                    payload = start_import(
                        parse_import_body(self._read_body()), job_store=job_store
                    )
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except JobTypeBusyError as exc:
                    # 409, not 400: the request was fine, the library was busy.
                    # The running job's id goes back too, so a caller can follow
                    # it rather than only being told no.
                    self._send_json(
                        409,
                        {
                            "error": {
                                "code": "LIBRARY_IMPORT_IN_PROGRESS",
                                "message": str(exc),
                                "job_id": exc.job_id,
                            }
                        },
                    )
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("LIBRARY_IMPORT_FAILED", str(exc))
                    )
                    return
                self._send_json(202, payload)
                return
            if path in (
                "/api/v1/library/refresh/preview",
                "/api/v1/library/refresh/apply",
            ):
                self._handle_refresh_post(path)
                return
            cancel = JOB_CANCEL_ROUTE.match(path)
            if cancel:
                job_id = cancel.group(1)
                job = job_store.get(job_id)
                if job is None:
                    self._send_json(
                        404, error_payload("JOB_NOT_FOUND", f"Job {job_id} not found")
                    )
                    return
                cancelled = job_store.request_cancel(job_id)
                self._send_json(
                    200, {"id": cancelled.id, "state": cancelled.state.value}
                )
                return

            if path == "/api/v1/support/bundle":
                try:
                    body = parse_support_bundle_body(self._read_body())
                    payload = run_support_bundle(body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_unexpected(
                        exc, error_payload("SUPPORT_BUNDLE_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/config/beatport-token":
                try:
                    body = parse_beatport_token_body(self._read_body())
                    payload = set_beatport_token(body["token"])
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/config/beatport-token/test":
                try:
                    body = parse_beatport_token_test_body(self._read_body())
                    ok, message = test_beatport_token(body.get("token"))
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                self._send_json(200, {"ok": ok, "message": message})
                return

            if clean_handles_post(path):
                raw = self._read_body()
                self._handle_routed(
                    lambda: clean_post(path, raw, job_store=job_store), clean_status
                )
                return

            if rekordbox_export_handles_post(path):
                raw = self._read_body()
                self._handle_routed(
                    lambda: rekordbox_export_post(path, raw, job_store=job_store),
                    rekordbox_export_status,
                )
                return

            if discover_handles_post(path):
                raw = self._read_body()
                self._handle_routed(
                    lambda: discover_post(path, raw, job_store=job_store),
                    discover_status,
                )
                return

            if sets_handles_post(path):
                raw = self._read_body()
                self._handle_routed(
                    lambda: sets_post(path, raw, job_store=job_store), sets_status
                )
                return

            if waveforms_handles_post(path):
                raw = self._read_body()
                self._handle_routed(
                    lambda: waveforms_post(path, raw, job_store=job_store),
                    waveforms_status,
                )
                return

            if organization_handles_post(path):
                body = self._read_body()
                self._handle_organization(
                    lambda: organization_post(path, body, job_store=job_store)
                )
                return

            self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))

    return EngineHandler


def backup_library_on_launch() -> Optional[Any]:
    """Take the DEC-009 launch backup, before anything migrates the database.

    Ordering is the point. Repository factories apply migrations the first time
    they are resolved, so taking the backup here — before a single repository is
    touched — captures the database as it was *before* any schema change. That
    is precisely the copy you want when the migration is what went wrong.

    Resolving :class:`IBackupService` neither opens nor migrates the database,
    so this does not itself create the thing it is backing up. On a fresh
    install there is no database yet and this does nothing.

    Never raises. A backup problem must not stop the engine starting, and
    :meth:`BackupService.backup_on_launch` already logs its own failures; this
    only has to catch a broken container or bootstrap.

    Returns the backup taken, or None when one was not needed. Recording the
    activity event is deliberately left to the caller: resolving the activity
    service resolves a repository, and repository factories migrate on first
    use — which would make this a *post*-migration copy and destroy the whole
    point of taking it here.
    """
    try:
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IBackupService
        from cuepoint.utils.di_container import get_container

        bootstrap_services()
        return get_container().resolve(IBackupService).backup_on_launch()
    except Exception as exc:  # noqa: BLE001 - startup must not depend on backups
        _logger.warning("[backup] launch backup unavailable: %s", exc)
        return None


def record_activity(
    event_type: str, summary: str, detail: Optional[Dict[str, Any]] = None
) -> None:
    """Record one activity event, or quietly do nothing (DEC-029).

    Never raises. The activity feed is a record of what happened, not a
    dependency of it: a database that cannot be written must not stop the
    engine starting or a backup from counting as taken.
    """
    try:
        from cuepoint.services.interfaces import IActivityService
        from cuepoint.utils.di_container import get_container

        get_container().resolve(IActivityService).record_event(
            event_type=event_type, summary=summary, detail=detail or {}
        )
    except Exception as exc:  # noqa: BLE001 — the feed is best-effort
        _logger.debug("[activity] could not record %s: %s", event_type, exc)


def fine_timer_resolution(platform: str = sys.platform) -> bool:
    """On Windows, ask for a 1 ms timer for this process; True when granted.

    Measured in WAVE-03: while the waveform analysis ran, the Library's search
    p95 rose 40% on Windows against 27% with this. A thread that gives up the
    interpreter's lock for a SQLite call waits to have it back on a timed
    condition, and Windows times those waits at its default 15.6 ms, not the
    lock's 5 ms interval, so every engine request paid for any background job's
    computing in 15.6 ms steps. Since Windows 10 2004 the request is the calling
    process's alone, and the engine spends its life blocked on sockets, so it
    costs no measurable power. Elsewhere waits are already fine-grained.
    """
    if platform != "win32":
        return False
    try:
        import ctypes

        winmm = ctypes.WinDLL("winmm")
        return int(winmm.timeBeginPeriod(1)) == 0
    except Exception as exc:  # noqa: BLE001 — a slower engine, never a stopped one
        _logger.debug("[engine] the timer resolution was not raised: %s", exc)
        return False


def run_engine(config: Optional[EngineConfig] = None) -> None:
    # First, so "may I send?" has its answer before any work starts (REPORT-01, DEC-128).
    set_reporting_enabled(initial_reporting_enabled(os.environ))
    # Before anything that can fail, so a failure while starting is caught (REPORT-03). Does
    # nothing without CUEPOINT_SENTRY_DSN.
    setup_engine_reporting()
    watch_jobs(_JOB_STORE)
    cfg = config or EngineConfig.from_env()
    if cfg.host not in ALLOWED_HOSTS:
        raise ValueError(f"Refusing to bind engine to non-loopback host: {cfg.host!r}")
    fine_timer_resolution()
    # Synchronous and before the server exists: a backup running concurrently
    # with the first migration would lose the ordering guarantee above. It is
    # skipped entirely when nothing changed since the last one, so the usual
    # cost is a few stat() calls.
    backup = backup_library_on_launch()

    # Both events are recorded here, after the backup has been taken: resolving
    # the activity service migrates the database, and doing that any earlier
    # would turn the launch backup into a copy of the migrated state.
    if backup is not None:
        # None means nothing had changed, and a skipped backup is not something
        # a user needs telling about.
        record_activity(
            "backup.created",
            "Library backed up",
            {"file": Path(backup.path).name, "reason": "launch"},
        )
    # DEC-028/DEC-029: every start is recorded, so a restarting engine leaves a
    # visible trail rather than healing silently.
    record_activity(
        "engine.started",
        f"Engine started (v{__version__})",
        {"version": __version__, "port": cfg.port},
    )
    # DISCOVER-03: a library the running name rule did not index — one upgraded
    # from before the index existed, or one a rule change made stale — is
    # rebuilt in the background. After the migrations the lines above ran, and
    # never a reason not to start: it logs and waits for the next start.
    from cuepoint.engine.credit_index_jobs import start_credit_index_if_stale

    start_credit_index_if_stale(_JOB_STORE)
    # WAVE-04: a library imported before cue points and beat grids were read
    # has them read once from its source, when that file is still exactly the
    # one imported. Otherwise they arrive with the next refresh. Never a reason
    # not to start.
    from cuepoint.engine.marks_backfill_jobs import start_marks_backfill_if_needed

    start_marks_backfill_if_needed(_JOB_STORE)
    # DISCOVER-05: a discovery run the last engine left open is ended as
    # failed, keeping what it found, before any new run can start. Never a
    # reason not to start.
    from cuepoint.engine.discovery_jobs import close_interrupted_discovery_runs

    close_interrupted_discovery_runs()
    server = with_error_reporting(
        ThreadingHTTPServer((cfg.host, cfg.port), make_handler(cfg))
    )
    # WAVE-03: an analysis the last engine left unfinished continues, unless it
    # was paused, once this one has been serving for a while, so a launch is
    # never slowed by it. The engine is serving from the line below.
    from cuepoint.engine.waveform_jobs import schedule_launch_analysis

    try:
        schedule_launch_analysis(_JOB_STORE)
    except Exception as exc:  # noqa: BLE001 — never a reason not to start
        _logger.warning("[waveforms] the launch analysis was not scheduled: %s", exc)
    _stop_with_parent(server)
    try:
        server.serve_forever()
    finally:
        server.server_close()


#: How long a running job gets to reach a stopping point once the app has gone.
PARENT_GONE_GRACE_SECONDS = 3.0


def _stop_with_parent(server: ThreadingHTTPServer) -> None:
    """End the engine when the app that started it has gone (see ``parent_watch``).

    The server stops accepting first, so nothing new starts; a job already
    running gets a moment, and then the process ends whatever is still running
    — nothing is left that could ever ask for its result, and it would otherwise
    hold the library database and its port until the machine restarts. SQLite
    rolls back an interrupted transaction, and an export's temp file is the one
    thing such an end can leave, as a crash would.
    """
    from cuepoint.engine.parent_watch import parent_pid_from_env, watch_parent

    pid = parent_pid_from_env(os.environ)
    if pid is None:
        return

    def gone() -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()
        timer = threading.Timer(PARENT_GONE_GRACE_SECONDS, _exit_now)
        timer.daemon = True
        timer.start()

    watch_parent(pid, gone)


def _exit_now() -> None:
    """End the process, and every decoder child it started (WAVE-01).

    ``os._exit`` skips ``atexit``, where the decoder's own clean-up is
    registered, so the children are ended here first: a waveform analysis must
    not outlive the engine that started it.
    """
    try:
        from cuepoint.data.audio_decode import terminate_children

        terminate_children()
    finally:
        # Whatever happened above, the engine still ends: an engine left
        # running with nobody to serve is the failure this exit exists to stop.
        os._exit(0)


def start_engine_thread(
    config: Optional[EngineConfig] = None,
    store: Optional[JobStore] = None,
) -> Tuple[ThreadingHTTPServer, threading.Thread]:
    """Start engine in a background thread (tests)."""
    cfg = config or EngineConfig.from_env()
    server = with_error_reporting(
        ThreadingHTTPServer((cfg.host, cfg.port), make_handler(cfg, store=store))
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread
