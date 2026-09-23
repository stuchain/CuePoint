#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Pushing tracks to a Beatport playlist as a background job (DISCOVER-06, DEC-099).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what a push does; this decides where it runs.

Refused before it exists
------------------------
With no Beatport token, :func:`start_beatport_playlist_job` raises
DISCOVER-01's ``no_token`` refusal; a request the push cannot use — no tracks,
a name too long, every track already owned — raises ``ValueError``. Either
way no job exists and nothing is created on Beatport. A token Beatport rejects,
or one without playlist scope, is only found out by asking, so that one fails
the job with its class (DEC-098, DEC-099).

What waits for what
-------------------
Only another push, since two at once is almost always one click twice. A push
reads the library once, when it is planned, and writes nothing to it but its
activity event, so it waits for nothing else.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Optional, Sequence

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.beatport_playlist_service import (
    OUTCOME_CANCELLED,
    OUTCOME_FAILED,
    PlaylistPush,
)

if TYPE_CHECKING:
    from cuepoint.services.interfaces import IBeatportPlaylistService

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a playlist push.
JOB_TYPE_BEATPORT_PLAYLIST = "beatport_playlist"

#: The job error code for a push that failed with no Beatport class.
PLAYLIST_FAILED = "BEATPORT_PLAYLIST_FAILED"

#: How often progress is handed to the job store at most.
_PROGRESS_INTERVAL_SECONDS = 0.1


def _playlist_service() -> "IBeatportPlaylistService":
    """Resolve the service, bootstrapping the container if needed.

    Resolved per job: the container builds its Beatport client from the token
    configured *now*.
    """
    _ensure_services()

    from cuepoint.services.interfaces import IBeatportPlaylistService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IBeatportPlaylistService)  # type: ignore[type-abstract]


def run_beatport_playlist_job(
    job: Job,
    store: JobStore,
    service: "IBeatportPlaylistService",
    plan: PlaylistPush,
) -> None:
    """Push under ``job`` and set its terminal state in every outcome."""
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
        result = service.push(
            plan,
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[beatport] playlist push failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": exc.error_code or PLAYLIST_FAILED, "message": exc.message},
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[beatport] playlist push failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": PLAYLIST_FAILED, "message": str(exc)},
        )
        return

    _logger.info(
        "[beatport] playlist push %s in %.1f s: %s",
        result.outcome,
        time.monotonic() - started,
        result.summary_line(),
    )
    payload = result.to_dict()
    if result.outcome == OUTCOME_FAILED:
        code = (
            f"BEATPORT_{result.error_class.upper()}"
            if result.error_class is not None
            else PLAYLIST_FAILED
        )
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": code, "message": result.summary_line()},
            result=payload,
        )
        return
    if result.outcome == OUTCOME_CANCELLED:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": result.summary_line()},
            result=payload,
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=payload)


def start_beatport_playlist_job(
    store: JobStore,
    *,
    track_ids: Sequence[int],
    name: Optional[str] = None,
    include_owned: bool = False,
) -> Job:
    """Start pushing Beatport tracks to a new Beatport playlist.

    ``name`` of ``None`` takes the dated default; owned tracks are skipped
    unless ``include_owned``.

    Raises:
        BeatportAPIError: Classified ``no_token``, when no token is configured.
        ValueError: If the push could do nothing, or is not one it takes.
        JobTypeBusyError: If a push is already running.
    """
    service = _playlist_service()
    service.require_token()
    plan = service.plan(track_ids, name=name, include_owned=include_owned)

    def runner(job: Job) -> None:
        run_beatport_playlist_job(job, store, service, plan)

    return store.create_job(
        job_type=JOB_TYPE_BEATPORT_PLAYLIST,
        runner=runner,
        exclusive=True,
    )
