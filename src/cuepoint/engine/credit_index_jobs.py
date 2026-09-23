#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Building the library's name index as a background job (DISCOVER-03).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what a rebuild does; this decides where it runs.

When it runs
------------
At engine start, and only when it has to: when the credits and label keys were
not built by the running version of the name rule. That is a library upgraded
from before DISCOVER-03, whose credit table migration 0021 created empty, or
one whose rule version has since been bumped. Otherwise nothing starts — an
import, a refresh and a revert keep the index current as they write, so an
index built once stays built.

What waits for what
-------------------
It refuses to start beside any job in ``LIBRARY_JOB_TYPES``, as the
specification asks. The other direction is not needed and is not imposed: an
import started while a rebuild runs is safe, because every chunk of the
rebuild reads its tracks and writes their credits in one ``BEGIN IMMEDIATE``
transaction, and the import writes its own tracks' credits in its own. Two
writers of the same rows under one lock, each writing what it just read, cannot
leave a stale credit behind — and a user who imports during the few seconds a
start-up rebuild takes is not told to wait for work they did not ask for.
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
from cuepoint.services.credit_index_service import CreditIndexResult

if TYPE_CHECKING:
    from cuepoint.services.interfaces import ICreditIndexService

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a rebuild, and what the status strip
#: keys its label off.
JOB_TYPE_CREDIT_INDEX = "credit_index"

#: What the status strip says while it runs; the count goes beside it.
PROGRESS_MESSAGE = "Indexing artists and labels"

#: How often progress is handed to the job store at most. A chunk takes tens of
#: milliseconds, and the store needs no more than the strip can show.
_PROGRESS_INTERVAL_SECONDS = 0.1


def _credit_index_service() -> "ICreditIndexService":
    """Resolve the rebuild service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import ICreditIndexService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(ICreditIndexService)  # type: ignore[type-abstract]


def _progress(done: int, total: int, started: float) -> ProgressInfo:
    return ProgressInfo(
        completed_tracks=done,
        total_tracks=total,
        matched_count=0,
        unmatched_count=0,
        elapsed_time=time.monotonic() - started,
        status_message=PROGRESS_MESSAGE,
    )


def run_credit_index_job(job: Job, store: JobStore) -> None:
    """Rebuild under ``job`` and set its terminal state in every outcome."""
    started = time.monotonic()
    last_report = [0.0]

    def on_progress(done: int, total: int) -> None:
        now = time.monotonic()
        if done and done < total and now - last_report[0] < _PROGRESS_INTERVAL_SECONDS:
            return
        last_report[0] = now
        store.report_progress(job, _progress(done, total, started))

    try:
        result: CreditIndexResult = _credit_index_service().rebuild(
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[credits] rebuild failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "CREDIT_INDEX_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[credits] rebuild failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "CREDIT_INDEX_FAILED", "message": str(exc)},
        )
        return

    _logger.info(
        "[credits] rebuilt %d of %d tracks in %.2f s (rule version %d)%s",
        result.tracks,
        result.total,
        time.monotonic() - started,
        result.version,
        ", cancelled" if result.cancelled else "",
    )
    if result.cancelled:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={
                "code": "JOB_CANCELLED",
                "message": "Stopped indexing artists and labels; it finishes at "
                "the next start",
            },
            result=result.to_dict(),
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=result.to_dict())


def start_credit_index_job(store: JobStore) -> Job:
    """Start a rebuild of the whole name index.

    Raises:
        JobTypeBusyError: If a rebuild, or any job in ``LIBRARY_JOB_TYPES``, is
            running.
    """
    # Imported here for the reason library_jobs gives: library_refresh imports
    # the job modules that import this one.
    from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES

    def runner(job: Job) -> None:
        run_credit_index_job(job, store)

    return store.create_job(
        job_type=JOB_TYPE_CREDIT_INDEX,
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )


def start_credit_index_if_stale(store: JobStore) -> Optional[Job]:
    """Start a rebuild when the running rule did not build the index.

    Called as the engine starts. Never raises: an index that cannot be checked
    or started now is checked again at the next start, and nothing about it may
    stop the engine serving the library — whose every other part works without
    it.

    Returns:
        The job started, or ``None`` when the index is current or a rebuild
        could not start.
    """
    try:
        if _credit_index_service().is_current():
            return None
        return start_credit_index_job(store)
    except JobTypeBusyError as exc:
        _logger.info("[credits] rebuild waits for the next start: %s", exc)
    except Exception as exc:  # noqa: BLE001 — startup must not depend on it
        _logger.warning("[credits] could not check the name index: %s", exc)
    return None
