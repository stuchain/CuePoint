#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Running a batch edit inline or as a background job (ORG-07, DEC-063).

A separate module from :mod:`cuepoint.engine.jobs`, for the reason
:mod:`cuepoint.engine.library_jobs` is one: that module is the match runners and
the store itself, and every kind of work that is not a match belongs beside it
rather than inside it.

The threshold, and where it is decided
--------------------------------------
:func:`apply_or_start` is the one entry point ORG-08's route calls. It resolves
the selection **first**, because the count is what decides inline from job and
because DEC-063 says the id set is fixed once — so the same list that answered
"how many" is the list the work is done over, and no second query can disagree
with the first. Below :data:`~cuepoint.services.batch_service.BATCH_JOB_THRESHOLD`
the work happens on the calling thread and the caller gets counts; above it a
job starts and the caller gets a job id to follow in the status strip.

Resolving before the job is not the same as resolving inside it, and the
difference is deliberate: a request that names nothing, an operation with a bad
value, or a tag that was deleted a moment ago is refused as a refusal, rather
than as a job that starts, fails, and has to be explained.

One library operation at a time
-------------------------------
A batch is exclusive with the import and the refresh, and they with it. An
import rewrites the tracks a batch is in the middle of tagging, and a refresh
deletes some of them; both would turn a batch's honest counts into a report of
what a race happened to leave behind. Two batches at once would do the same to
each other's ``unchanged`` counts.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.batch_service import (
    BATCH_JOB_THRESHOLD,
    OPERATION_ADD_TAG,
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_REMOVE_FROM_COLLECTION,
    OPERATION_REMOVE_TAG,
    OPERATION_SET_FAVORITE,
    OPERATION_SET_RATING,
    BatchOperation,
    BatchResult,
    BatchSelection,
)

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a batch edit, and what the renderer
#: keys its label off.
JOB_TYPE_LIBRARY_BATCH = "library_batch"

#: How often a tick is handed to the job store, matching the import's sampler
#: and for the same reason: a tick takes the store's lock and wakes the SSE
#: stream, and a batch of 47,913 tracks has no need to do that fifty times a
#: second. A batch reports per chunk rather than per track, so this throttles a
#: slow trickle rather than a flood — but the last tick always goes through, so
#: the bar reaches its total.
_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1

#: What the status strip says while each operation runs. The verb is the
#: operation's, because "Applying" tells a user nothing they did not know.
_PROGRESS_MESSAGES = {
    OPERATION_SET_RATING: "Rating tracks",
    OPERATION_SET_FAVORITE: "Marking favorites",
    OPERATION_ADD_TAG: "Tagging tracks",
    OPERATION_REMOVE_TAG: "Removing a tag",
    OPERATION_ADD_TO_COLLECTION: "Adding to a Collection",
    OPERATION_REMOVE_FROM_COLLECTION: "Removing from a Collection",
}


def batch_result_to_dict(result: BatchResult) -> Dict[str, Any]:
    """Return the counts as a job result payload.

    The job's answer rather than its progress: it is served from
    ``GET /api/v1/jobs/{id}/results``, which a caller asks for once, and is
    deliberately not in the polled status payload.
    """
    return result.to_dict()


def _batch_service() -> Any:
    """Resolve the batch service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IBatchService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IBatchService)


def _progress(
    completed: int, total: int, operation: str, started: float
) -> ProgressInfo:
    """Build a progress tick in the shape the status strip already reads.

    ``matched_count`` and ``unmatched_count`` are zero rather than repurposed,
    exactly as the import leaves them: they mean something specific in a match
    run and a batch has no equivalent. What a batch has to say is a verb, and
    that goes in ``status_message``.
    """
    return ProgressInfo(
        completed_tracks=completed,
        total_tracks=total,
        matched_count=0,
        unmatched_count=0,
        elapsed_time=time.monotonic() - started,
        status_message=_PROGRESS_MESSAGES.get(operation, "Editing tracks"),
    )


def run_batch_job(
    job: Job, store: JobStore, track_ids: Sequence[int], operation: BatchOperation
) -> None:
    """Apply ``operation`` to ``track_ids`` under ``job``.

    The ids are already resolved: :func:`apply_or_start` did it to decide
    whether a job was needed at all, and DEC-063 wants that answer fixed once.

    Sets the job's terminal state itself in every outcome, for the reason the
    import does: a cancelled batch has still *applied* everything it got
    through, and its counts are an answer worth serving rather than an error.
    """
    service = _batch_service()

    started = time.monotonic()
    last_reported = 0.0

    def on_progress(completed: int, total: int) -> None:
        nonlocal last_reported
        now = time.monotonic()
        if (
            completed < total
            and now - last_reported < _PROGRESS_REPORT_INTERVAL_SECONDS
        ):
            return
        last_reported = now
        store.report_progress(job, _progress(completed, total, operation.kind, started))

    def should_cancel() -> bool:
        return bool(job.cancel_requested)

    try:
        result = service.apply_batch(
            BatchSelection.of_ids(track_ids),
            operation,
            on_progress=on_progress,
            should_cancel=should_cancel,
        )
    except CuePointException as exc:
        # A CuePoint error already carries a code worth reporting; a generic
        # JOB_FAILED would throw away the one thing that says what to do next.
        _logger.warning("[batch] failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "LIBRARY_BATCH_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[batch] failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "LIBRARY_BATCH_FAILED", "message": str(exc)},
        )
        return

    if result.cancelled:
        # Cancelled *and* answered: the result carries how far it got, because
        # the work it did is still done (DEC-063) and a user who stopped a
        # batch at 3,000 of 47,913 is owed that number.
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={
                "code": "JOB_CANCELLED",
                "message": (
                    f"Cancelled after {result.completed} of {result.total} tracks"
                ),
            },
            result=batch_result_to_dict(result),
        )
        return

    store.finish(job, state=JobState.SUCCEEDED, result=batch_result_to_dict(result))


def start_batch_job(
    store: JobStore, track_ids: Sequence[int], operation: BatchOperation
) -> Job:
    """Register and start a batch job over ids already resolved.

    Raises:
        JobTypeBusyError: If any library job is already queued or running.
    """
    # Imported here rather than at module scope: ``library_refresh`` imports
    # this module's job type to build that group, so importing it back at the
    # top would be a cycle — the same shape, and the same reason, as
    # ``library_jobs``.
    from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES

    wanted = list(track_ids)

    def runner(job: Job) -> None:
        run_batch_job(job, store, wanted, operation)

    return store.create_job(
        job_type=JOB_TYPE_LIBRARY_BATCH,
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )


def apply_or_start(
    store: JobStore, selection: BatchSelection, operation: BatchOperation
) -> Tuple[Optional[BatchResult], Optional[Job]]:
    """Apply a batch inline, or start a job for it, and say which happened.

    Returns exactly one of the two: counts for work that is already done, or
    the job now doing it. ORG-08's route serves the first as a result and the
    second as a job id; ORG-11 follows the second in the status strip.

    Raises:
        ValueError: If the operation or the selection cannot be honoured. This
            is why the resolve happens here and not inside the job: a bad
            request should be a refusal, not a job that fails.
        JobTypeBusyError: If a library job is already running.
    """
    service = _batch_service()
    wanted = operation.validated()
    # Both refusals happen here, before the fork: an operation whose tag was
    # deleted a moment ago and a selection that names nothing are requests that
    # cannot be honoured, and a job that starts and immediately fails is a
    # worse way to say so than an error is.
    service.check(wanted)
    track_ids: List[int] = service.resolve(selection)

    if len(track_ids) <= BATCH_JOB_THRESHOLD:
        result: BatchResult = service.apply_batch(
            BatchSelection.of_ids(track_ids), wanted
        )
        return result, None

    return None, start_batch_job(store, track_ids, wanted)
