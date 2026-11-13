#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Checking followed artists and labels as a background job (DEC-317).

A separate module from :mod:`cuepoint.engine.jobs` for ``beatport_resolve_jobs``'s
reason: the follow service decides what a check reads; this decides where it
runs. Only a person asking starts it (the Following tab opening, or Check
again): it spends Beatport requests on the user's token.

How it ends
-----------
- **Succeeded**, with the result's ``failed`` listing any follow Beatport
  refused: one refusal is that follow's state, not the job's.
- **Failed** with ``BEATPORT_NO_TOKEN`` and ``state: "no_token"`` in the result,
  when no token is configured, so the tab can offer Settings (DEC-098). No job
  is refused at the start for it: the answer arrives the way every other does.
- **Cancelled** when stopped, with what had been read kept in the cache.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.exceptions.cuepoint_exceptions import CuePointException

if TYPE_CHECKING:
    from cuepoint.services.interfaces import IFollowService

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a check.
JOB_TYPE_FOLLOWS_CHECK = "follows_check"

#: What the status strip says while it runs; the count goes beside it.
PROGRESS_MESSAGE = "Checking followed artists and labels"

#: How often progress is handed to the job store at most.
_PROGRESS_INTERVAL_SECONDS = 0.1


def _follow_service() -> "IFollowService":
    """Resolve the service per job, so the token configured now is the one used."""
    _ensure_services()

    from cuepoint.services.interfaces import IFollowService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IFollowService)  # type: ignore[type-abstract]


def run_follow_check_job(
    job: Job, store: JobStore, service: "IFollowService", refresh: bool
) -> None:
    """Check under ``job`` and set its terminal state in every outcome."""
    started = time.monotonic()
    last_report = [0.0]

    def on_progress(done: int, total: int) -> None:
        now = time.monotonic()
        if done and done < total and now - last_report[0] < _PROGRESS_INTERVAL_SECONDS:
            return
        last_report[0] = now
        store.report_progress(
            job,
            ProgressInfo(
                completed_tracks=done,
                total_tracks=total,
                matched_count=0,
                unmatched_count=0,
                elapsed_time=now - started,
                status_message=PROGRESS_MESSAGE,
            ),
        )

    try:
        result = service.check(
            refresh,
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[follows] check failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "FOLLOWS_CHECK_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[follows] check failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "FOLLOWS_CHECK_FAILED", "message": str(exc)},
        )
        return

    outcome = result["outcome"]
    if outcome == "no_token":
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": "BEATPORT_NO_TOKEN",
                "message": "You are not signed in to Beatport, so CuePoint cannot read it",
            },
            result=result,
        )
    elif outcome == "cancelled":
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": "The check was stopped"},
            result=result,
        )
    else:
        store.finish(job, state=JobState.SUCCEEDED, result=result)


def start_follow_check_job(store: JobStore, refresh: bool = False) -> Job:
    """Start checking every follow, one at a time.

    Raises:
        JobTypeBusyError: If a check is already running.
    """
    service = _follow_service()

    def runner(job: Job) -> None:
        run_follow_check_job(job, store, service, refresh)

    return store.create_job(
        job_type=JOB_TYPE_FOLLOWS_CHECK,
        runner=runner,
        exclusive=True,
    )
