"""Server-Sent Events helpers for engine job progress."""

from __future__ import annotations

import json
import time
from typing import Any, Dict, Iterator, Optional

from cuepoint.engine.jobs import JobState, JobStore, progress_to_dict

TERMINAL_STATES = frozenset({JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED})


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
    """Yield SSE frames until the job reaches a terminal state."""
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
        if job.updated_at != last_updated:
            last_updated = job.updated_at
            yield format_sse_event(job_event_payload(job))

        if job.state in TERMINAL_STATES:
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
