#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading a pre-WAVE-04 library's marks as a background job (WAVE-04).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what a backfill does; this decides where it runs.

When it runs
------------
At engine start, and only when it has to: the library's marks have not been
read (``library.marks_read``) and the file it was imported from is still
exactly as it was (DEC-035). That is a library upgraded from before WAVE-04,
the first launch after ``m0026``. Once it succeeds the record is written and it
never runs again; an import and a refresh write the record themselves. While
the source has changed it does not start, and the marks arrive with the next
refresh.

What waits for what
-------------------
It refuses to start beside any job in ``LIBRARY_JOB_TYPES``. The other
direction is not imposed, as the credit index's is not: an import or refresh
started while it runs writes every track's marks itself, and the backfill
checks before each chunk that nothing has, and ends without writing if
something did (:mod:`cuepoint.services.marks_backfill_service`).
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Optional

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import (
    Job,
    JobState,
    JobStore,
    JobTypeBusyError,
    _ensure_services,
)
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.marks_backfill_service import (
    OUTCOME_CANCELLED,
    MarksBackfillResult,
)

if TYPE_CHECKING:
    from cuepoint.services.interfaces import IMarksBackfillService

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator, and what the status strip keys its label off.
JOB_TYPE_MARKS_BACKFILL = "marks_backfill"

#: What the status strip says while it runs; the count goes beside it.
PROGRESS_MESSAGE = "Reading cue points"

#: How often progress is handed to the job store at most.
_PROGRESS_INTERVAL_SECONDS = 0.1


def _backfill_service() -> "IMarksBackfillService":
    """Resolve the backfill service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IMarksBackfillService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IMarksBackfillService)  # type: ignore[type-abstract]


def _progress(done: int, total: int, started: float) -> ProgressInfo:
    return ProgressInfo(
        completed_tracks=done,
        total_tracks=total,
        matched_count=0,
        unmatched_count=0,
        elapsed_time=time.monotonic() - started,
        status_message=PROGRESS_MESSAGE,
    )


def run_marks_backfill_job(job: Job, store: JobStore) -> None:
    """Read the marks under ``job`` and set its terminal state in every outcome."""
    started = time.monotonic()
    last_report = [0.0]

    def on_progress(done: int, total: int) -> None:
        now = time.monotonic()
        if done and done < total and now - last_report[0] < _PROGRESS_INTERVAL_SECONDS:
            return
        last_report[0] = now
        store.report_progress(job, _progress(done, total, started))

    try:
        result: MarksBackfillResult = _backfill_service().backfill(
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[library] reading the marks failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "MARKS_BACKFILL_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[library] reading the marks failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "MARKS_BACKFILL_FAILED", "message": str(exc)},
        )
        return

    _logger.info(
        "[library] marks backfill ended %s in %.2f s",
        result.outcome,
        time.monotonic() - started,
    )
    if result.outcome == OUTCOME_CANCELLED:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": result.summary_line()},
            result=result.to_dict(),
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=result.to_dict())


def start_marks_backfill_job(store: JobStore) -> Job:
    """Start reading the library's marks from its source.

    Raises:
        JobTypeBusyError: If a backfill, or any job in ``LIBRARY_JOB_TYPES``,
            is running.
    """
    # Imported here for the reason library_jobs gives: library_refresh imports
    # the job modules that import this one.
    from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES

    def runner(job: Job) -> None:
        run_marks_backfill_job(job, store)

    return store.create_job(
        job_type=JOB_TYPE_MARKS_BACKFILL,
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )


def start_marks_backfill_if_needed(store: JobStore) -> Optional[Job]:
    """Start the backfill when the marks are unread and the source unchanged.

    Called as the engine starts. Never raises: a backfill that cannot be
    checked or started now is checked again at the next start, and nothing
    about it may stop the engine serving a library that works without it.

    Returns:
        The job started, or ``None``.
    """
    try:
        if not _backfill_service().needed():
            return None
        return start_marks_backfill_job(store)
    except JobTypeBusyError as exc:
        _logger.info("[library] reading the marks waits for the next start: %s", exc)
    except Exception as exc:  # noqa: BLE001 — startup must not depend on it
        _logger.warning("[library] could not check the library's marks: %s", exc)
    return None
