#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Resolving Beatport identities as a background job (DISCOVER-04, DEC-095).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what a resolve does; this decides where it runs.

When it runs
------------
When asked, and after a Clean match (DSC-4, PAGES-08). Nothing starts it at
engine start or when a page is browsed: it spends Beatport requests on the
user's token, and DEC-095 makes it an explicit action — offered on the Discover
page and on a name-matched Artist or Label page, whose routes are DISCOVER-09's.
A finished match is the person's own work, and the tracks it accepted are what
a resolve reads, so :func:`resolve_after_matches` starts one then, with a token
set and something to read, and never beside another.

Refused before it exists
------------------------
With no token configured, :func:`start_beatport_resolve_job` raises
DISCOVER-01's ``no_token`` refusal and no job is created, so the person is told
what to do rather than shown a job that failed. A token Beatport rejects is
only discovered by asking, so that one fails the job, with its class in the
result for the empty state to be drawn from (DEC-098).

What waits for what
-------------------
Only another resolve. It reads accepted matches once, at the start, and writes
nothing but the catalog cache, so an import, a refresh or a match job beside it
changes nothing it has read: a match accepted while it runs is read by the
next resolve, and ownership itself is never stale, because it is a view.
"""

from __future__ import annotations

import logging
import time
import weakref
from typing import TYPE_CHECKING

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import (
    Job,
    JobState,
    JobStore,
    JobTypeBusyError,
    _ensure_services,
)
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError, CuePointException
from cuepoint.services.beatport_resolve_service import BeatportResolveResult

if TYPE_CHECKING:
    from cuepoint.services.interfaces import IBeatportResolveService

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a resolve.
JOB_TYPE_BEATPORT_RESOLVE = "beatport_resolve"

#: What the status strip says while it runs; the count goes beside it.
PROGRESS_MESSAGE = "Resolving Beatport identities"

#: The ``jobs`` table discriminator of a Clean match (``match_jobs``). Written
#: here rather than imported so this module does not depend on the match's.
_JOB_TYPE_CLEAN_MATCH = "clean_match"

#: The stores :func:`resolve_after_matches` already watches.
_WATCHED: "weakref.WeakSet[JobStore]" = weakref.WeakSet()

#: How often progress is handed to the job store at most.
_PROGRESS_INTERVAL_SECONDS = 0.1


def _resolve_service() -> "IBeatportResolveService":
    """Resolve the service, bootstrapping the container if needed.

    Resolved per job: the container builds its Beatport client from the token
    configured *now*, so a token entered a minute ago is the one used.
    """
    _ensure_services()

    from cuepoint.services.interfaces import IBeatportResolveService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IBeatportResolveService)  # type: ignore[type-abstract]


def _progress(done: int, total: int, started: float) -> ProgressInfo:
    return ProgressInfo(
        completed_tracks=done,
        total_tracks=total,
        matched_count=0,
        unmatched_count=0,
        elapsed_time=time.monotonic() - started,
        status_message=PROGRESS_MESSAGE,
    )


def _error_code(error_class: str) -> str:
    """``BEATPORT_REJECTED`` and so on: the job error's code for a class."""
    return f"BEATPORT_{error_class.upper()}"


def run_beatport_resolve_job(
    job: Job, store: JobStore, service: "IBeatportResolveService"
) -> None:
    """Resolve under ``job`` and set its terminal state in every outcome."""
    started = time.monotonic()
    last_report = [0.0]

    def on_progress(done: int, total: int) -> None:
        now = time.monotonic()
        if done and done < total and now - last_report[0] < _PROGRESS_INTERVAL_SECONDS:
            return
        last_report[0] = now
        store.report_progress(job, _progress(done, total, started))

    try:
        result: BeatportResolveResult = service.resolve(
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[beatport] resolve failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "BEATPORT_RESOLVE_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[beatport] resolve failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "BEATPORT_RESOLVE_FAILED", "message": str(exc)},
        )
        return

    _logger.info(
        "[beatport] resolve %s in %.2f s: %s",
        result.outcome,
        time.monotonic() - started,
        result.summary_line(),
    )
    payload = result.to_dict()
    if result.error_class is not None:
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": _error_code(result.error_class),
                "message": result.summary_line(),
            },
            result=payload,
        )
        return
    if result.cancelled:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": result.summary_line()},
            result=payload,
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=payload)


def start_beatport_resolve_job(store: JobStore) -> Job:
    """Start resolving the library's accepted matches on Beatport.

    Raises:
        BeatportAPIError: Classified ``no_token``, when no token is configured.
            No job is created.
        JobTypeBusyError: If a resolve is already running.
    """
    service = _resolve_service()
    service.require_token()

    def runner(job: Job) -> None:
        run_beatport_resolve_job(job, store, service)

    return store.create_job(
        job_type=JOB_TYPE_BEATPORT_RESOLVE,
        runner=runner,
        exclusive=True,
    )


def resolve_after_matches(store: JobStore) -> None:
    """Start a resolve whenever a Clean match finishes (DSC-4).

    Observes ``store``'s end listeners. A match that succeeded, with a token
    configured and tracks the cache lacks, starts one resolve; with no token,
    nothing to read, a match that failed or was stopped, or a resolve already
    queued or running, it starts none. The store's exclusive check is what
    keeps it to one at a time, under the lock that registers the job. Watching
    a store twice is the same as once.
    """
    if store in _WATCHED:
        return
    _WATCHED.add(store)

    def ended(job: Job) -> None:
        if job.type != _JOB_TYPE_CLEAN_MATCH or job.state is not JobState.SUCCEEDED:
            return
        try:
            if _resolve_service().plan().to_read <= 0:
                return
            start_beatport_resolve_job(store)
        except BeatportAPIError:
            # No token (or one Beatport will not take): the Discover page says
            # so, and a resolve that can only fail is not started.
            return
        except JobTypeBusyError:
            return

    store.add_listeners(ended=ended)
