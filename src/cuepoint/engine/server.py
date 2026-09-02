"""HTTP server for CuePoint engine sidecar."""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional, Tuple, Type
from urllib.parse import parse_qs, urlparse

from cuepoint.engine.config_api import (
    get_beatport_token_status,
    parse_beatport_token_body,
    parse_beatport_token_test_body,
    set_beatport_token,
    test_beatport_token,
)
from cuepoint.engine.job_events import iter_job_events
from cuepoint.engine.export_api import parse_export_body, run_export
from cuepoint.engine.sync_tags_api import parse_sync_tags_body, run_sync_tags
from cuepoint.engine.support_bundle_api import (
    parse_support_bundle_body,
    run_support_bundle,
)
from cuepoint.engine.logs_api import get_cuepoint_log_text, get_cuepoint_logs_dir
from cuepoint.engine.privacy_api import clear_cache_now, clear_logs_now
from cuepoint.engine.history_api import list_recent_history, load_history_csv
from cuepoint.engine.library_api import (
    LibraryUnavailableError,
    SEARCH_LIMIT_DEFAULT,
    parse_int_param,
    search_library,
)
from cuepoint.engine.incrate_api import (
    demo_inventory_snapshot,
    get_discover_options,
    get_inventory_snapshot,
    parse_discover_body,
    parse_incrate_import_body,
    parse_playlist_body,
    run_discover,
    run_incrate_import,
    run_incrate_reset,
    run_playlist_create,
)
from cuepoint.engine.xml_api import list_xml_playlists
from cuepoint.engine.jobs import (
    JobStore,
    cancel_match_job,
    parse_match_job_body,
    start_match_job,
    track_result_to_dict,
)
from cuepoint.version import __version__

_logger = logging.getLogger(__name__)

ALLOWED_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
JOB_ROUTE = re.compile(r"^/api/v1/jobs/([^/]+)(?:/(results|events))?$")
JOB_CANCEL_ROUTE = re.compile(r"^/api/v1/jobs/([^/]+)/cancel$")


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
    payload = {"status": "ok", "version": __version__}
    session_id = os.environ.get("CUEPOINT_SESSION_ID", "").strip()
    if session_id:
        payload["session_id"] = session_id
    return payload


def error_payload(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def get_job_store() -> JobStore:
    return _JOB_STORE


def make_handler(
    config: EngineConfig, store: Optional[JobStore] = None
) -> Type[BaseHTTPRequestHandler]:
    job_store = store or _JOB_STORE

    class EngineHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:  # noqa: A003
            return

        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self) -> bool:
            if not config.token:
                return True
            auth = self.headers.get("Authorization", "")
            expected = f"Bearer {config.token}"
            return auth == expected

        def _read_body(self) -> bytes:
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0:
                return b""
            return self.rfile.read(length)

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
                    "results": [track_result_to_dict(r) for r in job.results],
                }
                if job.batch_results:
                    payload["batch_results"] = {
                        name: [track_result_to_dict(r) for r in rows]
                        for name, rows in job.batch_results.items()
                    }
                self._send_json(200, payload)
                return
            self._send_json(200, job.to_status_dict())

        def _handle_incrate_get(self, path: str, query: str) -> None:
            if not self._authorized():
                self._send_json(
                    401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                )
                return
            if path == "/api/v1/incrate/discover/options":
                try:
                    payload = get_discover_options()
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(500, error_payload("INCRATE_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return
            if path != "/api/v1/incrate/inventory":
                self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))
                return
            params = parse_qs(query)
            limit_raw = params.get("limit", ["100"])[0]
            search = params.get("search", [""])[0] or None
            demo = params.get("demo", ["false"])[0].lower() in ("1", "true", "yes")
            try:
                limit = int(limit_raw)
            except ValueError:
                self._send_json(
                    400, error_payload("INVALID_REQUEST", "limit must be an integer")
                )
                return
            try:
                if demo:
                    payload = demo_inventory_snapshot()
                else:
                    payload = get_inventory_snapshot(limit=limit, search=search)
            except Exception as exc:  # noqa: BLE001 — surface to API client
                self._send_json(500, error_payload("INCRATE_FAILED", str(exc)))
                return
            self._send_json(200, payload)

        def do_GET(self) -> None:  # noqa: N802
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
                    self._send_json(500, error_payload("LOGS_READ_FAILED", str(exc)))
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
                try:
                    limit = parse_int_param(
                        params.get("limit", [None])[0],
                        default=SEARCH_LIMIT_DEFAULT,
                        name="limit",
                    )
                    offset = parse_int_param(
                        params.get("offset", [None])[0], default=0, name="offset"
                    )
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                try:
                    payload = search_library(
                        params.get("q", [""])[0], limit=limit, offset=offset
                    )
                except LibraryUnavailableError as exc:
                    self._send_json(503, error_payload("LIBRARY_UNAVAILABLE", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(500, error_payload("SEARCH_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return
            if path.startswith("/api/v1/jobs/"):
                self._handle_job_get(path)
                return
            if path.startswith("/api/v1/incrate/"):
                self._handle_incrate_get(path, parsed.query)
                return
            if path == "/api/v1/history/recent":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                limit_raw = params.get("limit", ["50"])[0]
                try:
                    limit = int(limit_raw)
                except ValueError:
                    self._send_json(
                        400,
                        error_payload("INVALID_REQUEST", "limit must be an integer"),
                    )
                    return
                self._send_json(
                    200, list_recent_history(max_files=max(1, min(limit, 200)))
                )
                return
            if path == "/api/v1/history/load":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                csv_path = params.get("path", [""])[0]
                if not csv_path:
                    self._send_json(
                        400,
                        error_payload(
                            "INVALID_REQUEST", "path query parameter required"
                        ),
                    )
                    return
                try:
                    payload = load_history_csv(csv_path)
                except FileNotFoundError as exc:
                    self._send_json(404, error_payload("FILE_NOT_FOUND", str(exc)))
                    return
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(500, error_payload("HISTORY_LOAD_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/xml/playlists":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                params = parse_qs(parsed.query)
                xml_path = params.get("path", [""])[0]
                if not xml_path:
                    self._send_json(
                        400,
                        error_payload(
                            "INVALID_REQUEST", "path query parameter required"
                        ),
                    )
                    return
                try:
                    payload = list_xml_playlists(xml_path)
                except FileNotFoundError as exc:
                    self._send_json(404, error_payload("FILE_NOT_FOUND", str(exc)))
                    return
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(500, error_payload("XML_PARSE_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/config/beatport-token":
                if not self._authorized():
                    self._send_json(
                        401, error_payload("UNAUTHORIZED", "Missing or invalid token")
                    )
                    return
                self._send_json(200, get_beatport_token_status())
                return
            self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))

        def do_POST(self) -> None:  # noqa: N802
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
                    self._send_json(
                        500, error_payload("PRIVACY_CLEAR_LOGS_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return
            if path == "/api/v1/privacy/clear-cache":
                try:
                    payload = clear_cache_now()
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(
                        500, error_payload("PRIVACY_CLEAR_CACHE_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/jobs/match":
                try:
                    body = parse_match_job_body(self._read_body())
                    job = start_match_job(job_store, body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                self._send_json(202, {"id": job.id, "state": job.state.value})
                return

            cancel_match = JOB_CANCEL_ROUTE.match(path)
            if cancel_match:
                job_id = cancel_match.group(1)
                job = job_store.get(job_id)
                if job is None:
                    self._send_json(
                        404, error_payload("JOB_NOT_FOUND", f"Job {job_id} not found")
                    )
                    return
                cancelled = cancel_match_job(job_store, job_id)
                self._send_json(
                    200, {"id": cancelled.id, "state": cancelled.state.value}
                )
                return

            if path == "/api/v1/export":
                try:
                    body = parse_export_body(self._read_body())
                    payload = run_export(body, job_store)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(500, error_payload("EXPORT_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/tags/sync":
                try:
                    body = parse_sync_tags_body(self._read_body())
                    payload = run_sync_tags(body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(500, error_payload("SYNC_TAGS_FAILED", str(exc)))
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/support/bundle":
                try:
                    body = parse_support_bundle_body(self._read_body())
                    payload = run_support_bundle(body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(
                        500, error_payload("SUPPORT_BUNDLE_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/incrate/import":
                try:
                    body = parse_incrate_import_body(self._read_body())
                    payload = run_incrate_import(body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except FileNotFoundError as exc:
                    self._send_json(404, error_payload("FILE_NOT_FOUND", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(
                        500, error_payload("INCRATE_IMPORT_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/incrate/reset":
                try:
                    raw = self._read_body()
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                    if not isinstance(body, dict):
                        raise ValueError("JSON body must be an object")
                    payload = run_incrate_reset(body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(
                        500, error_payload("INCRATE_RESET_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/incrate/discover":
                try:
                    body = parse_discover_body(self._read_body())
                    payload = run_discover(body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(
                        500, error_payload("INCRATE_DISCOVER_FAILED", str(exc))
                    )
                    return
                self._send_json(200, payload)
                return

            if path == "/api/v1/incrate/playlist":
                try:
                    body = parse_playlist_body(self._read_body())
                    payload = run_playlist_create(body)
                except ValueError as exc:
                    self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                    return
                except Exception as exc:  # noqa: BLE001 — surface to API client
                    self._send_json(
                        500, error_payload("INCRATE_PLAYLIST_FAILED", str(exc))
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

            self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))

    return EngineHandler


def backup_library_on_launch() -> None:
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
    """
    try:
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IBackupService
        from cuepoint.utils.di_container import get_container

        bootstrap_services()
        get_container().resolve(IBackupService).backup_on_launch()
    except Exception as exc:  # noqa: BLE001 - startup must not depend on backups
        _logger.warning("[backup] launch backup unavailable: %s", exc)


def run_engine(config: Optional[EngineConfig] = None) -> None:
    cfg = config or EngineConfig.from_env()
    if cfg.host not in ALLOWED_HOSTS:
        raise ValueError(f"Refusing to bind engine to non-loopback host: {cfg.host}")
    # Synchronous and before the server exists: a backup running concurrently
    # with the first migration would lose the ordering guarantee above. It is
    # skipped entirely when nothing changed since the last one, so the usual
    # cost is a few stat() calls.
    backup_library_on_launch()
    server = ThreadingHTTPServer((cfg.host, cfg.port), make_handler(cfg))
    try:
        server.serve_forever()
    finally:
        server.server_close()


def start_engine_thread(
    config: Optional[EngineConfig] = None,
    store: Optional[JobStore] = None,
) -> Tuple[ThreadingHTTPServer, threading.Thread]:
    """Start engine in a background thread (tests)."""
    cfg = config or EngineConfig.from_env()
    server = ThreadingHTTPServer((cfg.host, cfg.port), make_handler(cfg, store=store))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread
