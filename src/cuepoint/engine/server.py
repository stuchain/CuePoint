"""HTTP server for CuePoint engine sidecar."""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional, Tuple, Type
from urllib.parse import urlparse

from cuepoint.engine.jobs import JobStore, parse_match_job_body, start_match_job
from cuepoint.engine.jobs import track_result_to_dict
from cuepoint.version import __version__

ALLOWED_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
JOB_ID_PATH = re.compile(r"^/api/v1/jobs/([^/]+)(/results)?$")

# Shared job store for process lifetime
_JOB_STORE = JobStore()


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
    return {"status": "ok", "version": __version__}


def error_payload(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def get_job_store() -> JobStore:
    return _JOB_STORE


def make_handler(config: EngineConfig, store: Optional[JobStore] = None) -> Type[BaseHTTPRequestHandler]:
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

        def _handle_job_get(self, path: str) -> None:
            if not self._authorized():
                self._send_json(401, error_payload("UNAUTHORIZED", "Missing or invalid token"))
                return
            match = JOB_ID_PATH.match(path)
            if not match:
                self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))
                return
            job_id, results_suffix = match.group(1), match.group(2)
            job = job_store.get(job_id)
            if job is None:
                self._send_json(404, error_payload("JOB_NOT_FOUND", f"Job {job_id} not found"))
                return
            if results_suffix:
                self._send_json(
                    200,
                    {
                        "id": job.id,
                        "state": job.state.value,
                        "results": [track_result_to_dict(r) for r in job.results],
                    },
                )
                return
            self._send_json(200, job.to_status_dict())

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path == "/health":
                self._send_json(200, health_payload())
                return
            if path == "/api/v1/status":
                if not self._authorized():
                    self._send_json(401, error_payload("UNAUTHORIZED", "Missing or invalid token"))
                    return
                self._send_json(200, {"ready": True, **health_payload()})
                return
            if path.startswith("/api/v1/jobs/"):
                self._handle_job_get(path)
                return
            self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path != "/api/v1/jobs/match":
                self._send_json(404, error_payload("NOT_FOUND", "Unknown path"))
                return
            if not self._authorized():
                self._send_json(401, error_payload("UNAUTHORIZED", "Missing or invalid token"))
                return
            try:
                body = parse_match_job_body(self._read_body())
                job = start_match_job(job_store, body)
            except ValueError as exc:
                self._send_json(400, error_payload("INVALID_REQUEST", str(exc)))
                return
            self._send_json(202, {"id": job.id, "state": job.state.value})

    return EngineHandler


def run_engine(config: Optional[EngineConfig] = None) -> None:
    cfg = config or EngineConfig.from_env()
    if cfg.host not in ALLOWED_HOSTS:
        raise ValueError(f"Refusing to bind engine to non-loopback host: {cfg.host}")
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
