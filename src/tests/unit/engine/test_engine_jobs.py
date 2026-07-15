"""Tests for engine match job API (Phase 3 P0)."""

import json
import socket
import time
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.jobs import JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _auth_request(url: str, token: str, *, data: bytes | None = None, method: str = "GET"):
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=5)


def test_post_demo_match_job_and_poll_results():
    port = _free_port()
    token = "job-test-token"
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
            assert resp.status == 202
            created = json.loads(resp.read().decode("utf-8"))
        job_id = created["id"]
        assert created["state"] in ("queued", "running")

        succeeded = False
        for _ in range(50):
            with _auth_request(f"{base}/api/v1/jobs/{job_id}", token) as resp:
                status = json.loads(resp.read().decode("utf-8"))
            if status["state"] == "succeeded":
                succeeded = True
                assert status["progress"]["total_tracks"] == 5
                break
            time.sleep(0.05)
        assert succeeded

        with _auth_request(f"{base}/api/v1/jobs/{job_id}/results", token) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        assert len(payload["results"]) == 5
        assert payload["results"][0]["title"].startswith("Demo Track")
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_get_unknown_job_returns_404():
    port = _free_port()
    token = "job-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    try:
        with pytest.raises(urllib.error.HTTPError) as exc:
            _auth_request(f"http://127.0.0.1:{port}/api/v1/jobs/does-not-exist", token)
        assert exc.value.code == 404
        body = json.loads(exc.value.read().decode("utf-8"))
        assert body["error"]["code"] == "JOB_NOT_FOUND"
    finally:
        server.shutdown()
        thread.join(timeout=2)
