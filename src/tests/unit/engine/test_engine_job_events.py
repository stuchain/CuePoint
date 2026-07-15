"""Tests for engine job SSE events (Phase 3 P1)."""

import json
import socket
import time
import urllib.request

from cuepoint.engine.job_events import iter_job_events
from cuepoint.engine.jobs import JobStore, start_match_job
from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_iter_job_events_emits_terminal_status():
    store = JobStore()
    job = start_match_job(store, {"demo": True})
    frames: list[bytes] = []
    for _ in range(200):
        job = store.get(job.id)
        if job and job.state.value == "succeeded":
            break
        time.sleep(0.05)
    frames = list(iter_job_events(store, job.id, poll_interval_s=0.05, max_wait_s=5.0))
    body = b"".join(frames).decode("utf-8")
    assert "succeeded" in body
    assert "progress" in body


def test_job_events_http_endpoint_headers():
    port = _free_port()
    token = "events-test-token"
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config)
    base = f"http://127.0.0.1:{port}"
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        req = urllib.request.Request(
            f"{base}/api/v1/jobs/match",
            data=json.dumps({"demo": True}).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            created = json.loads(resp.read().decode("utf-8"))
        job_id = created["id"]

        stream_req = urllib.request.Request(
            f"{base}/api/v1/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
        )
        with urllib.request.urlopen(stream_req, timeout=5) as resp:
            assert resp.status == 200
            assert resp.headers.get("Content-Type", "").startswith("text/event-stream")
            first_chunk = resp.read(512)
        assert b"state" in first_chunk
    finally:
        server.shutdown()
        thread.join(timeout=2)
