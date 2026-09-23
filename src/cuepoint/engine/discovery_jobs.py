#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discovery as a background job (DISCOVER-05, DEC-091).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what a run does; this decides where it runs.

Refused before it exists
------------------------
With no Beatport token, :func:`start_discovery_job` raises DISCOVER-01's
``no_token`` refusal, and a request a run cannot use raises ``ValueError``;
either way no job and no run are created. A token Beatport rejects is only
found out by asking, so that one fails the run, with its class, keeping what
it had found (DEC-098).

What waits for what
-------------------
Only another discovery. A run reads the library once, when it starts, and
writes nothing to it, so an import or a refresh beside it changes nothing it
has already resolved and waits for nothing.

A run a crash left open
-----------------------
The schema cannot tell a live run from a dead one (DISCOVER-02).
:func:`close_interrupted_discovery_runs` ends every open run as failed when the
engine starts, before any new run can begin, keeping what each had found.
"""

from __future__ import annotations

import logging
import time
from datetime import date
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Optional

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.models.discovery_run import RUN_CANCELLED, RUN_FAILED, DiscoveryRun
from cuepoint.services.discovery_service import DiscoveryRequest, summary_line

if TYPE_CHECKING:
    from cuepoint.services.interfaces import IDiscoveryService

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a discovery run.
JOB_TYPE_DISCOVERY = "discovery"

#: How often progress is handed to the job store at most.
_PROGRESS_INTERVAL_SECONDS = 0.1


def _discovery_service() -> "IDiscoveryService":
    """Resolve the service, bootstrapping the container if needed.

    Resolved per job: the container builds its Beatport client from the token
    configured *now*.
    """
    _ensure_services()

    from cuepoint.services.interfaces import IDiscoveryService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IDiscoveryService)  # type: ignore[type-abstract]


def _result(run: DiscoveryRun) -> Dict[str, Any]:
    """The job's result: the run's id, outcome and counts, not its scope."""
    payload = run.to_dict()
    payload.pop("params_json", None)
    return payload


def run_discovery_job(
    job: Job,
    store: JobStore,
    service: "IDiscoveryService",
    request: DiscoveryRequest,
) -> None:
    """Run discovery under ``job`` and set its terminal state in every outcome."""
    started = time.monotonic()
    last_time = 0.0
    last_stage = ""

    def on_progress(stage: str, done: int, total: int) -> None:
        nonlocal last_time, last_stage
        now = time.monotonic()
        if (
            stage == last_stage
            and done < total
            and now - last_time < _PROGRESS_INTERVAL_SECONDS
        ):
            return
        last_time, last_stage = now, stage
        store.report_progress(
            job,
            ProgressInfo(
                completed_tracks=done,
                total_tracks=total,
                matched_count=0,
                unmatched_count=0,
                elapsed_time=now - started,
                status_message=stage,
            ),
        )

    try:
        run = service.run(
            request,
            job_id=job.id,
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[discover] run failed to start or end: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "DISCOVERY_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[discover] run failed to start or end: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "DISCOVERY_FAILED", "message": str(exc)},
        )
        return

    _logger.info(
        "[discover] run %s %s in %.1f s: %s",
        run.id,
        run.outcome,
        time.monotonic() - started,
        summary_line(run),
    )
    payload = _result(run)
    if run.outcome == RUN_FAILED:
        code = (
            f"BEATPORT_{run.error_class.upper()}"
            if run.error_class is not None
            else "DISCOVERY_FAILED"
        )
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": code, "message": summary_line(run)},
            result=payload,
        )
        return
    if run.outcome == RUN_CANCELLED:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": summary_line(run)},
            result=payload,
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=payload)


def start_discovery_job(
    store: JobStore,
    *,
    genre_ids: Optional[Iterable[int]] = None,
    charts_from: Optional[date] = None,
    charts_to: Optional[date] = None,
    new_releases_days: Optional[int] = None,
    artists: Optional[Iterable[str]] = None,
    labels: Optional[Iterable[str]] = None,
) -> Job:
    """Start a discovery run over the library.

    Anything not given takes inCrate's default (see
    ``DiscoveryService.request``); ``artists`` and ``labels`` of ``None`` mean
    the whole library.

    Raises:
        BeatportAPIError: Classified ``no_token``, when no token is configured.
        ValueError: If the request is not one a run can use.
        JobTypeBusyError: If a discovery is already running.
    """
    service = _discovery_service()
    service.require_token()
    request = service.request(
        genre_ids=genre_ids,
        charts_from=charts_from,
        charts_to=charts_to,
        new_releases_days=new_releases_days,
        artists=artists,
        labels=labels,
    )

    def runner(job: Job) -> None:
        run_discovery_job(job, store, service, request)

    return store.create_job(
        job_type=JOB_TYPE_DISCOVERY,
        runner=runner,
        exclusive=True,
    )


def close_interrupted_discovery_runs() -> List[int]:
    """End every run the last engine left open, as failed.

    Called as the engine starts. Never raises: a run that cannot be closed now
    is closed at the next start, and nothing about it may stop the engine.

    Returns:
        The ids closed.
    """
    try:
        closed = _discovery_service().close_interrupted()
    except Exception as exc:  # noqa: BLE001 — startup must not depend on it
        _logger.warning("[discover] could not close interrupted runs: %s", exc)
        return []
    if closed:
        _logger.info("[discover] closed %d interrupted run(s): %s", len(closed), closed)
    return closed
