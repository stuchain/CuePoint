"""Tests for engine job SSE events (Phase 3 P1).

A generic job stands in for the file-based match these were first written
against, which retired in CLEAN-14.
"""

import socket
import threading
import time
import urllib.request

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.job_events import iter_job_events
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.server import EngineConfig, start_engine_thread


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _finished_job(store: JobStore):
    done = threading.Event()

    def runner(job):
        store.report_progress(
            job,
            ProgressInfo(
                completed_tracks=2, total_tracks=2, matched_count=0, unmatched_count=0
            ),
        )
        store.finish(job, state=JobState.SUCCEEDED)
        done.set()

    job = store.create_job(job_type="file_check", runner=runner)
    assert done.wait(timeout=5)
    return job


def test_iter_job_events_emits_terminal_status():
    store = JobStore()
    job = _finished_job(store)

    frames = list(iter_job_events(store, job.id, poll_interval_s=0.05, max_wait_s=5.0))
    body = b"".join(frames).decode("utf-8")

    assert "succeeded" in body
    assert "progress" in body


def test_a_job_that_ends_while_a_frame_is_being_sent_still_sends_its_end():
    """The terminal frame is never skipped.

    The job finishes while the stream is suspended at a ``yield`` — the handler
    is writing the "running" frame to the socket, which lets the job's thread
    run. Resuming, the stream used to look at the job again, find it terminal
    and stop without sending that state. A client stops reading at the terminal
    frame, so it never stopped: the Library's refresh preview and apply waited
    forever with the job long finished (libraryJourney.spec.ts).
    """
    store = JobStore()
    release = threading.Event()
    job = store.create_job(job_type="file_check", runner=lambda _job: release.wait(5))
    while store.get(job.id).state is not JobState.RUNNING:
        time.sleep(0.01)

    frames = iter_job_events(store, job.id, poll_interval_s=0.01, max_wait_s=5.0)
    first = next(frames)
    assert b'"state":"running"' in first

    # The job ends between the frame being handed over and the stream resuming.
    store.finish(job, state=JobState.SUCCEEDED)
    release.set()

    rest = b"".join(frames)
    assert b'"state":"succeeded"' in rest


def test_the_stream_closes_its_connection_when_it_ends():
    """A stream's end is its connection's end: the body has no length."""
    port = _free_port()
    token = "events-close-token"
    store = JobStore()
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config, store=store)
    try:
        job = _finished_job(store)
        stream_req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/v1/jobs/{job.id}/events",
            headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
        )
        with urllib.request.urlopen(stream_req, timeout=5) as resp:
            # Reads to the end of the body; a connection kept open never gets
            # there and times out instead.
            body = resp.read()
        assert b'"state":"succeeded"' in body
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_job_events_http_endpoint_headers():
    port = _free_port()
    token = "events-test-token"
    store = JobStore()
    config = EngineConfig(host="127.0.0.1", port=port, token=token)
    server, thread = start_engine_thread(config, store=store)
    base = f"http://127.0.0.1:{port}"
    try:
        job = _finished_job(store)
        stream_req = urllib.request.Request(
            f"{base}/api/v1/jobs/{job.id}/events",
            headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
        )
        with urllib.request.urlopen(stream_req, timeout=5) as resp:
            assert resp.status == 200
            assert resp.headers.get("Content-Type", "").startswith("text/event-stream")
            # Line by line: a finished job's one frame is shorter than any
            # fixed read.
            event = resp.readline()
            data = resp.readline()
        assert event == b"event: status\n"
        assert b'"state":"succeeded"' in data
    finally:
        server.shutdown()
        thread.join(timeout=2)
