#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Checking files as a background job (CLEAN-07, DEC-073).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what a check does; this decides where it runs.

How a check starts
------------------
- **After every import, and after every applied refresh**, over the whole
  library, started by that job as it finishes (:func:`check_after_library_job`).
  DEC-073 declined checking at launch, because a disconnected drive would then
  sit in front of startup. Right after an import or a refresh is when a user
  expects the library to know where its files are.
- **On request**, over any selection (:func:`start_file_check_job`). The
  selection is resolved first, so one naming nothing is a refusal rather than
  a job with nothing to do.

What waits for what
-------------------
A check refuses to start while an import or a refresh apply is running: it would
read paths from a library being rewritten, and that job starts a check of its own
when it finishes. The specification names only the refresh; an import is the same
kind of rewrite, and a check started beside one is work its own check repeats.

Neither of those waits for a check, which is one-way on purpose, as a match job's
conflict is. A check over a slow share can take a long time, and a user must not
be told they cannot refresh until it ends. Nothing a refresh does leaves a
check's rows wrong: a deleted track is counted and skipped, and a changed path is
recorded against the path that was checked, which reads as not checked.

That leaves one gap, closed here. A library job that finishes while a check is
still running cannot start its check, and the running one read its tracks before
the library changed. So the follow-up is remembered, and the running check starts
it as it finishes. Remembering and finishing meet under one lock, so the follow-up
can be neither lost nor started twice.
"""

from __future__ import annotations

import logging
import threading
import time
import weakref
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import (
    Job,
    JobState,
    JobStore,
    JobTypeBusyError,
    _ensure_services,
)
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.file_check_service import TRIGGER_REQUEST, FileCheckResult

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a file check, and what the status strip
#: keys its label off.
JOB_TYPE_FILE_CHECK = "file_check"

#: What a check refuses to start beside, besides another check.
FILE_CHECK_CONFLICTS = (JOB_TYPE_LIBRARY_IMPORT, JOB_TYPE_LIBRARY_REFRESH_APPLY)

#: What the status strip says while a check runs.
PROGRESS_MESSAGE = "Checking files"

#: How often a tick is handed to the job store, as for every other job. A check
#: reports after every track, and on a local drive that is thousands a second.
_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1

#: Follow-up checks waiting for a running check to finish, per store: the
#: trigger of the library job that asked. Weakly keyed, so a store a test threw
#: away is not kept alive by a follow-up it will never run.
_follow_ups: "weakref.WeakKeyDictionary[JobStore, str]" = weakref.WeakKeyDictionary()
_follow_ups_lock = threading.Lock()


@dataclass(frozen=True)
class StartedCheck:
    """A check started on request, and how many tracks it covers."""

    job: Job
    tracks: int

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns for a started check."""
        return {"job_id": self.job.id, "tracks": self.tracks}


def _file_check_service() -> Any:
    """Resolve the file check service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IFileCheckService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IFileCheckService)


def _progress(completed: int, total: int, started: float) -> ProgressInfo:
    """Build a tick in the shape the status strip reads.

    ``matched_count`` and ``unmatched_count`` stay zero, as for an import: they
    mean something in a match, and a check has no equivalent.
    """
    return ProgressInfo(
        completed_tracks=completed,
        total_tracks=total,
        matched_count=0,
        unmatched_count=0,
        elapsed_time=time.monotonic() - started,
        status_message=PROGRESS_MESSAGE,
    )


def run_file_check_job(
    job: Job, store: JobStore, track_ids: Optional[Sequence[int]], trigger: str
) -> None:
    """Check files under ``job``, then start any follow-up that waited for it.

    Args:
        track_ids: The tracks to check, already resolved; or None for the whole
            library, read when the job starts rather than when it was asked for,
            so a follow-up checks the library the finished job left.
        trigger: What started it.
    """
    try:
        _run(job, store, track_ids, trigger)
    finally:
        _start_follow_up(store)


def _run(
    job: Job, store: JobStore, track_ids: Optional[Sequence[int]], trigger: str
) -> None:
    """Run the check and set the job's terminal state in every outcome.

    Every outcome, including an unexpected error, because the follow-up that
    runs after this must find the job finished rather than still running.
    """
    started = time.monotonic()
    last_reported = 0.0

    def on_progress(completed: int, total: int) -> None:
        nonlocal last_reported
        now = time.monotonic()
        # The last tick always goes through, so the bar reaches its total.
        if (
            completed < total
            and now - last_reported < _PROGRESS_REPORT_INTERVAL_SECONDS
        ):
            return
        last_reported = now
        store.report_progress(job, _progress(completed, total, started))

    def should_cancel() -> bool:
        return bool(job.cancel_requested)

    try:
        service = _file_check_service()
        wanted: List[int] = (
            list(track_ids) if track_ids is not None else service.library()
        )
        result: FileCheckResult = service.check(
            wanted,
            trigger=trigger,
            on_progress=on_progress,
            should_cancel=should_cancel,
        )
    except CuePointException as exc:
        _logger.warning("[files] check failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "FILE_CHECK_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[files] check failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "FILE_CHECK_FAILED", "message": str(exc)},
        )
        return

    payload = result.to_dict()
    if result.cancelled:
        # Cancelled and answered: every chunk it finished is committed.
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": result.summary_line()},
            result=payload,
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=payload)


def _create(store: JobStore, track_ids: Optional[Sequence[int]], trigger: str) -> Job:
    wanted = None if track_ids is None else list(track_ids)

    def runner(job: Job) -> None:
        run_file_check_job(job, store, wanted, trigger)

    return store.create_job(
        job_type=JOB_TYPE_FILE_CHECK,
        runner=runner,
        exclusive=True,
        conflicts_with=FILE_CHECK_CONFLICTS,
    )


def start_file_check_job(store: JobStore, selection: BatchSelection) -> StartedCheck:
    """Start checking the files of a selection.

    Raises:
        ValueError: If the selection names no library tracks.
        BrowseQueryError: If a query selection cannot be built.
        JobTypeBusyError: If a check, an import or a refresh apply is running.
    """
    track_ids = _file_check_service().resolve(selection)
    job = _create(store, track_ids, TRIGGER_REQUEST)
    return StartedCheck(job=job, tracks=len(track_ids))


def check_after_library_job(store: JobStore, trigger: str) -> Optional[Job]:
    """Start a whole-library check after an import or a refresh apply finished.

    Never raises: the library job it follows has already succeeded, and nothing
    about starting a check may turn that into a failure.

    Returns:
        The job, or None when it could not start now. A running check means the
        follow-up waits for it; another library job means that job will start a
        check of its own when it finishes.
    """
    try:
        with _follow_ups_lock:
            try:
                return _create(store, None, trigger)
            except JobTypeBusyError as exc:
                if exc.job_type == JOB_TYPE_FILE_CHECK:
                    _follow_ups[store] = trigger
                    _logger.info(
                        "[files] a check is running; the %s check follows it", trigger
                    )
                else:
                    _logger.info(
                        "[files] the %s check is left to the %s job now running",
                        trigger,
                        exc.job_type,
                    )
                return None
    except Exception as exc:  # noqa: BLE001 — must not fail a finished job
        _logger.warning("[files] could not start the %s check: %s", trigger, exc)
        return None


def _start_follow_up(store: JobStore) -> None:
    """Start the follow-up a library job left waiting for this check, if any."""
    with _follow_ups_lock:
        trigger = _follow_ups.pop(store, None)
    if trigger is not None:
        check_after_library_job(store, trigger)


def pending_follow_up(store: JobStore) -> Optional[str]:
    """Return the trigger of a follow-up waiting on ``store``, or None."""
    with _follow_ups_lock:
        return _follow_ups.get(store)
