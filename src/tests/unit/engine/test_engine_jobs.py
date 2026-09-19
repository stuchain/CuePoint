"""Tests for the engine's job routes (Phase 3 P0).

The file-based match these were first written against retired with inKey
(CLEAN-14); the routes serve every job type, so a generic job stands in.
"""

import json
import socket
import threading
import urllib.error
import urllib.request

import pytest

from cuepoint.compat.gui_types import ProgressInfo
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
    return urllib.request.urlopen(req, timeout=5)


@pytest.fixture
def engine():
    port = _free_port()
    token = "job-test-token"
    store = JobStore()
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config, store=store)
    try:
        yield f"http://127.0.0.1:{port}", token, store
    finally:
        server.shutdown()
        thread.join(timeout=2)


def _finished_job(store: JobStore, *, result=None):
    done = threading.Event()

    def runner(job):
        store.report_progress(
            job,
            ProgressInfo(
                completed_tracks=5,
                total_tracks=5,
                matched_count=0,
                unmatched_count=0,
                status_message="Done",
            ),
        )
        store.finish(job, state=JobState.SUCCEEDED, result=result)
        done.set()

    job = store.create_job(job_type="library_refresh_preview", runner=runner)
    assert done.wait(timeout=5)
    return job


def test_status_reports_type_state_and_progress(engine):
    base, token, store = engine
    job = _finished_job(store)

    with _auth_request(f"{base}/api/v1/jobs/{job.id}", token) as resp:
        status = json.loads(resp.read().decode("utf-8"))

    assert status["id"] == job.id
    assert status["type"] == "library_refresh_preview"
    assert status["state"] == "succeeded"
    assert status["progress"]["total_tracks"] == 5
    assert "result" not in status


def test_results_serve_what_the_job_produced(engine):
    base, token, store = engine
    job = _finished_job(store, result={"added": 3})

    with _auth_request(f"{base}/api/v1/jobs/{job.id}/results", token) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    assert payload == {"id": job.id, "state": "succeeded", "result": {"added": 3}}


def test_results_carry_no_match_rows_since_inkey_retired(engine):
    # CLEAN-14 removed `results` and `batch_results`, which only the file-based
    # match ever filled.
    base, token, store = engine
    job = _finished_job(store)

    with _auth_request(f"{base}/api/v1/jobs/{job.id}/results", token) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    assert payload == {"id": job.id, "state": "succeeded"}


def test_job_routes_need_the_token(engine):
    base, _token, store = engine
    job = _finished_job(store)

    for suffix in ("", "/results"):
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(f"{base}/api/v1/jobs/{job.id}{suffix}", timeout=5)
        assert exc.value.code == 401


def test_get_unknown_job_returns_404(engine):
    base, token, _store = engine
    for suffix in ("", "/results", "/events"):
        with pytest.raises(urllib.error.HTTPError) as exc:
            _auth_request(f"{base}/api/v1/jobs/does-not-exist{suffix}", token)
        assert exc.value.code == 404
        body = json.loads(exc.value.read().decode("utf-8"))
        assert body["error"]["code"] == "JOB_NOT_FOUND"
