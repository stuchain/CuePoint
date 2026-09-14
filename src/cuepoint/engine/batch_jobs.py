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
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.batch_service import (
    BATCH_JOB_THRESHOLD,
    OPERATION_APPLY_MATCH,
    OPERATION_SET_OVERRIDE,
    OPERATION_ACCEPT_MATCH,
    OPERATION_ADD_TAG,
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_REMOVE_FROM_COLLECTION,
    OPERATION_REJECT_MATCH,
    OPERATION_REMOVE_TAG,
    OPERATION_SET_FAVORITE,
    OPERATION_SET_RATING,
    BatchOperation,
    BatchResult,
    BatchSelection,
)

if TYPE_CHECKING:
    from cuepoint.services.revert_service import BatchRevert

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
    OPERATION_ACCEPT_MATCH: "Accepting matches",
    OPERATION_REJECT_MATCH: "Rejecting matches",
    OPERATION_APPLY_MATCH: "Applying Beatport values",
    OPERATION_SET_OVERRIDE: "Editing tracks",
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


def _progress(completed: int, total: int, message: str, started: float) -> ProgressInfo:
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
        status_message=message,
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
    _run_counted(
        job,
        store,
        _PROGRESS_MESSAGES.get(operation.kind, "Editing tracks"),
        lambda on_progress, should_cancel: service.apply_batch(
            BatchSelection.of_ids(track_ids),
            operation,
            on_progress=on_progress,
            should_cancel=should_cancel,
        ),
        failure_code="LIBRARY_BATCH_FAILED",
        noun="tracks",
    )


def _run_counted(
    job: Job,
    store: JobStore,
    message: str,
    work: Callable[[Callable[[int, int], None], Callable[[], bool]], Any],
    *,
    failure_code: str,
    noun: str,
) -> None:
    """Run work that reports counts, and finish its job in every outcome.

    Shared by a batch edit and a batch revert (CLEAN-06): both move through
    committed chunks, honour a cancel between them, and answer with counts that
    are worth serving even when cancelled. ``work`` is handed the progress and
    cancel callbacks and returns a result with ``cancelled``, ``completed``,
    ``total`` and ``to_dict()``.
    """
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
        store.report_progress(job, _progress(completed, total, message, started))

    def should_cancel() -> bool:
        return bool(job.cancel_requested)

    try:
        result = work(on_progress, should_cancel)
    except CuePointException as exc:
        # A CuePoint error already carries a code worth reporting; a generic
        # JOB_FAILED would throw away the one thing that says what to do next.
        _logger.warning("[batch] failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or failure_code,
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[batch] failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": failure_code, "message": str(exc)},
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
                    f"Cancelled after {result.completed} of {result.total} {noun}"
                ),
            },
            result=result.to_dict(),
        )
        return

    store.finish(job, state=JobState.SUCCEEDED, result=result.to_dict())


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


# ---------------------------------------------------------------------------
# Reverting a batch (CLEAN-06)
# ---------------------------------------------------------------------------

#: What the status strip says while a batch is reverted.
REVERT_PROGRESS_MESSAGE = "Reverting changes"


def _revert_service() -> Any:
    """Resolve the revert service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IRevertService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IRevertService)


def run_revert_job(job: Job, store: JobStore, batch_id: str) -> None:
    """Revert every change in ``batch_id`` under ``job``.

    The same job, progress and terminal states as a batch edit: a revert is a
    batch too, over the batch's changes rather than a selection's tracks.
    """
    service = _revert_service()
    _run_counted(
        job,
        store,
        REVERT_PROGRESS_MESSAGE,
        lambda on_progress, should_cancel: service.revert_batch(
            batch_id, on_progress=on_progress, should_cancel=should_cancel
        ),
        failure_code="LIBRARY_REVERT_FAILED",
        noun="changes",
    )


def start_revert_job(store: JobStore, batch_id: str) -> Job:
    """Register and start a job reverting a batch.

    A ``library_batch`` job, not a new type: it writes the same tables a batch
    edit does, so it is exclusive with the import, the refresh and every other
    batch for the reason a batch edit is, and the status strip already knows
    how to show one.

    Raises:
        JobTypeBusyError: If any library job is already queued or running.
    """
    from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES

    def runner(job: Job) -> None:
        run_revert_job(job, store, batch_id)

    return store.create_job(
        job_type=JOB_TYPE_LIBRARY_BATCH,
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )


def revert_or_start(
    store: JobStore, batch_id: str
) -> Tuple[Optional["BatchRevert"], Optional[Job]]:
    """Revert a batch inline, or start a job for it, and say which happened.

    DEC-063's threshold, counted in changes: a batch of more than
    :data:`~cuepoint.services.batch_service.BATCH_JOB_THRESHOLD` changes runs as
    a job. The batch is checked first, so a Collection membership batch, an
    unknown id or a batch that recorded nothing is a refusal rather than a job
    that fails.

    Raises:
        ValueError: If the batch cannot be reverted.
        JobTypeBusyError: If a library job is already running.
    """
    service = _revert_service()
    total = service.check_batch(batch_id)
    if total <= BATCH_JOB_THRESHOLD:
        return service.revert_batch(batch_id), None
    return None, start_revert_job(store, batch_id)
