#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Matching a library scope as a background job (CLEAN-03, DEC-065).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
that module is inKey's match runners and the store itself, and a match over
library tracks is a different kind of work that happens to share the verb. The
service decides what a match does; this decides where it runs.

Refusals come before the job
----------------------------
:func:`start_match_job` resolves the selection first, so a request that names
nothing, or only tracks already matched, is an error rather than a job that
starts and has nothing to do. The plan itself is written on the job's thread,
because it is keyed by the job's id, a moment after the store assigns one.
:func:`resume_match_job` checks there is something left before starting; which
of those tracks were answered since is decided inside the job, as it takes them
over.

One match at a time, and why a refresh may still run
----------------------------------------------------
A match job is exclusive with another match job — two would ask Beatport the
same questions and race to store the answers — and refuses to *start* while a
refresh is applying, because it would resolve its scope against a library being
rewritten. A refresh may start while a match runs, and must be able to: a
whole-library match takes hours, and a user cannot be told not to refresh for a
day. A track the refresh deletes is counted and skipped (CLEAN-03). So the
conflict is one-way on purpose, and the library job group is not joined: that
group's members exclude each other in both directions.

Resumption is offered, never assumed
------------------------------------
:func:`offer_interrupted_matches` runs as the engine starts, before stale job
records are closed out, and records one activity event per match job a restart
interrupted. It resumes nothing: DEC-065 declined unrequested network scraping,
and that includes after a restart.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.match_service import (
    EVENT_MATCH_INTERRUPTED,
    MatchJobResult,
    MatchStorageError,
    describe,
    describe_interrupted,
)

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a match over library tracks. Not
#: ``"match"``: that is inKey's file-based run, which retires in CLEAN-14.
JOB_TYPE_CLEAN_MATCH = "clean_match"

#: What a match job refuses to start beside, besides another match job.
MATCH_JOB_CONFLICTS = (JOB_TYPE_LIBRARY_REFRESH_APPLY,)

#: How often a tick is handed to the job store, as for every other job: a tick
#: takes the store's lock and wakes the SSE stream.
_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1


@dataclass(frozen=True)
class StartedMatch:
    """A match job that has started, and what it will cover.

    For a resume, ``planned`` is what the interrupted job had left; tracks
    answered since are left out as the new job takes over, and its progress
    reports the exact number.
    """

    job: Job
    selected: int
    excluded: int
    planned: int
    resumed_from: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns for a started match."""
        return {
            "job_id": self.job.id,
            "selected": self.selected,
            "excluded": self.excluded,
            "planned": self.planned,
            "resumed_from": self.resumed_from,
        }


def _match_service() -> Any:
    """Resolve the match service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IMatchService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IMatchService)


def _progress(result: MatchJobResult, started: float) -> ProgressInfo:
    """Build a tick in the shape the status strip reads.

    No ETA: a track takes five to forty-five seconds, and a number pretending
    to know which is worse than none (cross-cutting fact 6).
    """
    return ProgressInfo(
        completed_tracks=result.completed,
        total_tracks=result.planned,
        matched_count=result.matched,
        unmatched_count=result.no_match + result.errors,
        elapsed_time=time.monotonic() - started,
        status_message=describe(result),
    )


def run_match_job(job: Job, store: JobStore, prepare: Callable[[Any], Any]) -> None:
    """Write or take over a plan, then match it, under ``job``.

    Sets the terminal state itself in every outcome: a cancelled match has
    still stored every track it finished, and its counts are an answer.
    """
    service = _match_service()
    started = time.monotonic()
    last_reported = 0.0

    def on_progress(result: MatchJobResult) -> None:
        nonlocal last_reported
        now = time.monotonic()
        if now - last_reported < _PROGRESS_REPORT_INTERVAL_SECONDS:
            return
        last_reported = now
        store.report_progress(job, _progress(result, started))

    def should_cancel() -> bool:
        return bool(job.cancel_requested)

    try:
        prepare(service)
        result: MatchJobResult = service.run(
            job.id, on_progress=on_progress, should_cancel=should_cancel
        )
    except MatchStorageError as exc:
        _logger.warning("[clean-match] stopped: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "MATCH_STORAGE_FAILED", "message": str(exc)},
        )
        return
    except CuePointException as exc:
        _logger.warning("[clean-match] failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "CLEAN_MATCH_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[clean-match] failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "CLEAN_MATCH_FAILED", "message": str(exc)},
        )
        return

    # The last tick always goes through, whatever the sampler last did.
    store.report_progress(job, _progress(result, started))
    payload = result.to_dict()
    if result.search_unavailable:
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "MATCH_SEARCH_UNAVAILABLE", "message": describe(result)},
            result=payload,
        )
    elif result.cancelled:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": describe(result)},
            result=payload,
        )
    else:
        store.finish(job, state=JobState.SUCCEEDED, result=payload)


def _create(store: JobStore, runner: Callable[[Job], None]) -> Job:
    return store.create_job(
        job_type=JOB_TYPE_CLEAN_MATCH,
        runner=runner,
        exclusive=True,
        conflicts_with=MATCH_JOB_CONFLICTS,
    )


def start_match_job(
    store: JobStore, selection: BatchSelection, rematch: bool = False
) -> StartedMatch:
    """Start matching a selection on Beatport.

    Raises:
        ValueError: If the selection names no library tracks, or only tracks
            already settled when ``rematch`` is not set.
        BrowseQueryError: If a query selection cannot be built.
        JobTypeBusyError: If a match job is running or a refresh is applying.
    """
    service = _match_service()
    draft = service.prepare(selection, rematch)

    def runner(job: Job) -> None:
        run_match_job(job, store, lambda svc: svc.write_plan(job.id, draft))

    job = _create(store, runner)
    return StartedMatch(
        job=job,
        selected=draft.selected,
        excluded=draft.excluded,
        planned=draft.planned,
    )


def resume_match_job(store: JobStore, job_id: str) -> StartedMatch:
    """Start a job over the tracks an interrupted match job left.

    Raises:
        LookupError: If there is no such match job.
        ValueError: If it has nothing left.
        JobTypeBusyError: If a match job is running — including the one named,
            if it is still finishing — or a refresh is applying.
    """
    service = _match_service()
    waiting = service.check_resumable(job_id)

    def runner(job: Job) -> None:
        run_match_job(job, store, lambda svc: svc.take_over(job_id, job.id))

    job = _create(store, runner)
    return StartedMatch(
        job=job,
        selected=waiting.remaining,
        excluded=0,
        planned=waiting.remaining,
        resumed_from=job_id,
    )


def offer_interrupted_matches() -> int:
    """Record an activity event for each match job a restart interrupted.

    Called once, before stale job records are closed out (see
    ``server._resolve_job_repository``); returns how many were offered.
    """
    from cuepoint.services.interfaces import IActivityService, IMatchJobRepository
    from cuepoint.utils.di_container import get_container

    container = get_container()
    jobs = container.resolve(IMatchJobRepository)
    activity = container.resolve(IActivityService)
    offered = 0
    for waiting in jobs.interrupted(JOB_TYPE_CLEAN_MATCH):
        activity.record_event(
            EVENT_MATCH_INTERRUPTED,
            describe_interrupted(waiting),
            {
                "job_id": waiting.job_id,
                "remaining": waiting.remaining,
                "planned": waiting.plan.planned,
                "rematch": waiting.plan.rematch,
            },
        )
        offered += 1
    return offered
