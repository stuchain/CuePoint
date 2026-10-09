"""Server-Sent Events helpers for engine job progress."""

from __future__ import annotations

import json
import time
from typing import Any, Dict, Iterator, Optional

from cuepoint.engine.jobs import JobState, JobStore, progress_to_dict

TERMINAL_STATES = frozenset({JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED})
_TERMINAL_VALUES = frozenset(state.value for state in TERMINAL_STATES)


def job_event_payload(job) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "type": "status",
        "id": job.id,
        "state": job.state.value,
        "updated_at": job.updated_at,
        "demo": job.demo,
    }
    if job.progress is not None:
        payload["progress"] = progress_to_dict(job.progress)
    if job.error is not None:
        payload["error"] = job.error
    return payload


def format_sse_event(payload: Dict[str, Any], event: str = "status") -> bytes:
    data = json.dumps(payload, separators=(",", ":"))
    return f"event: {event}\ndata: {data}\n\n".encode("utf-8")


def iter_job_events(
    store: JobStore,
    job_id: str,
    *,
    poll_interval_s: float = 0.2,
    heartbeat_interval_s: float = 15.0,
    max_wait_s: float = 300.0,
) -> Iterator[bytes]:
    """Yield SSE frames until the job reaches a terminal state.

    The last frame is always the terminal one. The job is read once per pass and
    the decision to stop is made from the frame that was sent, not from a second
    look at the job: the job's thread runs while this one is suspended at a
    ``yield`` (the caller is writing the frame to the socket), so a job that
    finished in that window used to be seen as terminal on resuming and ended
    the stream without its terminal frame. A client that stops at the terminal
    frame then waited forever, and the Library's refresh never came back.
    """
    started = time.monotonic()
    last_updated: Optional[str] = None
    last_heartbeat = started

    while True:
        job = store.get(job_id)
        if job is None:
            yield format_sse_event(
                {
                    "type": "error",
                    "code": "JOB_NOT_FOUND",
                    "message": f"Job {job_id} not found",
                },
                event="error",
            )
            return

        now = time.monotonic()
        payload = job_event_payload(job)
        terminal = payload["state"] in _TERMINAL_VALUES
        if terminal or payload["updated_at"] != last_updated:
            last_updated = payload["updated_at"]
            yield format_sse_event(payload)

        if terminal:
            return

        if now - last_heartbeat >= heartbeat_interval_s:
            yield b": heartbeat\n\n"
            last_heartbeat = now

        if now - started >= max_wait_s:
            yield format_sse_event(
                {
                    "type": "error",
                    "code": "TIMEOUT",
                    "message": "Job event stream timed out",
                },
                event="error",
            )
            return

        time.sleep(poll_interval_s)
