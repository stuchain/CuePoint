"""Tests for engine job cancel API (Phase 3 P1)."""

import json
import socket
import time
import urllib.request

from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _auth_request(
    url: str, token: str, *, data: bytes | None = None, method: str = "GET"
):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=10)


def test_cancel_demo_job():
    port = _free_port()
    token = "cancel-test-token"
    store = JobStore()
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config, store=store)
    base = f"http://127.0.0.1:{port}"
    try:
        with _auth_request(
            f"{base}/api/v1/jobs/match",
            token,
            data=json.dumps({"demo": True}).encode("utf-8"),
            method="POST",
        ) as resp:
            created = json.loads(resp.read().decode("utf-8"))
        job_id = created["id"]

        time.sleep(0.08)

        with _auth_request(
            f"{base}/api/v1/jobs/{job_id}/cancel",
            token,
            data=b"{}",
            method="POST",
        ) as resp:
            assert resp.status == 200
            payload = json.loads(resp.read().decode("utf-8"))
        assert payload["id"] == job_id

        cancelled = False
        for _ in range(50):
            with _auth_request(f"{base}/api/v1/jobs/{job_id}", token) as resp:
                status = json.loads(resp.read().decode("utf-8"))
            if status["state"] == "cancelled":
                cancelled = True
                assert status["error"]["code"] == "JOB_CANCELLED"
                break
            time.sleep(0.05)
        assert cancelled
    finally:
        server.shutdown()
        thread.join(timeout=2)
