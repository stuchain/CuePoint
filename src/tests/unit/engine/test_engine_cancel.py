"""Tests for the engine's job cancel route (Phase 3 P1).

One cancel serves every job type (ORG-13); a generic job stands in for the
file-based match these were first written against, which retired in CLEAN-14.
"""

import json
import socket
import threading
import time
import urllib.error
import urllib.request

import pytest

from cuepoint.engine.jobs import JobState, JobStore
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


@pytest.fixture
def engine():
    port = _free_port()
    token = "cancel-test-token"
    store = JobStore()
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config, store=store)
    try:
        yield f"http://127.0.0.1:{port}", token, store
    finally:
        server.shutdown()
        thread.join(timeout=2)


def _running_job(store: JobStore):
    """A job that runs until it is asked to stop, as every runner checks."""
    started = threading.Event()

    def runner(job):
        started.set()
        for _ in range(500):
            if job.cancel_requested:
                return
            time.sleep(0.01)

    job = store.create_job(job_type="library_batch", runner=runner)
    assert started.wait(timeout=5)
    return job


def _post_cancel(base: str, token: str, job_id: str):
    return _auth_request(
        f"{base}/api/v1/jobs/{job_id}/cancel", token, data=b"{}", method="POST"
    )


def test_cancel_a_running_job(engine):
    base, token, store = engine
    job = _running_job(store)

    with _post_cancel(base, token, job.id) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
    assert payload["id"] == job.id

    cancelled = False
    for _ in range(100):
        with _auth_request(f"{base}/api/v1/jobs/{job.id}", token) as resp:
            status = json.loads(resp.read().decode("utf-8"))
        if status["state"] == "cancelled":
            cancelled = True
            assert status["error"]["code"] == "JOB_CANCELLED"
            break
        time.sleep(0.02)
    assert cancelled


def test_cancel_a_finished_job_leaves_it_alone(engine):
    base, token, store = engine
    done = threading.Event()

    def runner(job):
        store.finish(job, state=JobState.SUCCEEDED)
        done.set()

    job = store.create_job(job_type="library_batch", runner=runner)
    assert done.wait(timeout=5)

    with _post_cancel(base, token, job.id) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    assert payload == {"id": job.id, "state": "succeeded"}


def test_cancel_an_unknown_job_is_404(engine):
    base, token, _store = engine
    with pytest.raises(urllib.error.HTTPError) as exc:
        _post_cancel(base, token, "does-not-exist")
    assert exc.value.code == 404
    assert json.loads(exc.value.read())["error"]["code"] == "JOB_NOT_FOUND"


def test_cancel_needs_the_token(engine):
    base, _token, store = engine
    job = _running_job(store)
    try:
        with pytest.raises(urllib.error.HTTPError) as exc:
            _post_cancel(base, "wrong-token", job.id)
        assert exc.value.code == 401
        assert store.get(job.id).cancel_requested is False
    finally:
        store.request_cancel(job.id)
