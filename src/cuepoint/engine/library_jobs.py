#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Running a Rekordbox import as a background job (DEC-033, LIBRARY-05).

A separate module from :mod:`cuepoint.engine.jobs`, which is the match runners
and the store itself. Keeping the import out of it is what lets "generalize the
job store, do not rewrite it" stay true: the only changes there are a ``type``
field, a generic ``create_job`` and two small public methods a runner needs.

The import reports the same progress shape a match does — ``completed_tracks``,
``total_tracks`` and a percentage — so SHELL-07's status strip renders it with
no change to how progress is read. The strip's *label* did need one word: it
said "Matching" unconditionally, which is the wrong verb for an import.

Progress is sampled twice over. This module throttles what it hands the store,
because a fifty-thousand-track import ticks fifty thousand times and each tick
takes the store's lock and wakes the SSE stream; the store then throttles again
before writing to the database, at FOUNDATION-07's measured one-second interval.
Both ends always let the last tick of a phase through, so a run never appears to
stop short of its total.
"""

from __future__ import annotations

import logging
import time
from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.library_import_service import (
    PHASE_PLAYLISTS,
    ImportCancelled,
    ImportSummary,
)

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for an import, and what the renderer keys
#: its label off.
JOB_TYPE_LIBRARY_IMPORT = "library_import"

#: How often a tick is handed to the job store. Ten a second is smooth to watch
#: and two orders of magnitude fewer lock acquisitions than one per track.
_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1

_PHASE_MESSAGES = {
    "tracks": "Importing tracks",
    PHASE_PLAYLISTS: "Mirroring playlists",
}


def _progress(completed: int, total: int, phase: str, started: float) -> ProgressInfo:
    """Build a progress tick in the shape the status strip already reads.

    ``matched_count`` and ``unmatched_count`` are zero rather than repurposed:
    they mean something specific in a match run, they are part of a public
    payload, and an import has no equivalent. What an import has to say goes in
    ``status_message``.
    """
    return ProgressInfo(
        completed_tracks=completed,
        total_tracks=total,
        matched_count=0,
        unmatched_count=0,
        elapsed_time=time.monotonic() - started,
        status_message=_PHASE_MESSAGES.get(phase, "Importing"),
    )


def run_library_import_job(job: Job, store: JobStore, xml_path: str) -> None:
    """Import ``xml_path`` under ``job``, reporting progress and cancellation.

    Sets the job's terminal state itself in every outcome, which is deliberate:
    :meth:`JobStore._run_job` marks a job cancelled when a cancel was requested
    and the runner left the state unset, and an import that got past its point
    of no return has genuinely succeeded no matter when the request arrived.
    """
    _ensure_services()

    from cuepoint.services.interfaces import ILibraryImportService
    from cuepoint.utils.di_container import get_container

    service = get_container().resolve(ILibraryImportService)

    started = time.monotonic()
    last_reported = 0.0

    def on_progress(completed: int, total: int, phase: str) -> None:
        nonlocal last_reported
        now = time.monotonic()
        # The last tick of a phase always goes through, so the bar reaches its
        # total rather than stopping wherever the sampler last fired.
        if (
            completed < total
            and now - last_reported < _PROGRESS_REPORT_INTERVAL_SECONDS
        ):
            return
        last_reported = now
        store.report_progress(job, _progress(completed, total, phase, started))

    def should_cancel() -> bool:
        return bool(job.cancel_requested)

    store.report_progress(job, _progress(0, 0, "tracks", started))

    try:
        summary: ImportSummary = service.import_rekordbox_xml(
            xml_path, on_progress=on_progress, should_cancel=should_cancel
        )
    except ImportCancelled as exc:
        _logger.info("[library] import cancelled: %s", exc)
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": str(exc)},
        )
        return
    except CuePointException as exc:
        # A CuePoint error already carries a code worth reporting; a generic
        # JOB_FAILED would throw away the one thing that says what to do next.
        _logger.warning("[library] import failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "LIBRARY_IMPORT_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[library] import failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "LIBRARY_IMPORT_FAILED", "message": str(exc)},
        )
        return

    # No final tick here on purpose. The import's own last callback already
    # reports the playlist phase at 100%, and the sampler above always lets a
    # phase's last tick through — a second report would paper over that rule
    # being wrong, which is exactly the sort of thing no test could then catch.
    del summary
    store.finish(job, state=JobState.SUCCEEDED)


def start_library_import_job(
    store: JobStore, xml_path: str, *, demo: bool = False
) -> Job:
    """Register and start an import job.

    Validation of ``xml_path`` deliberately happens inside the job rather than
    here: a rejected file should show up as a failed job with a message the user
    can act on, in the same place every other job outcome appears, rather than
    as an error from whichever call happened to start it.
    """
    path = str(xml_path)

    def runner(job: Job) -> None:
        run_library_import_job(job, store, path)

    return store.create_job(job_type=JOB_TYPE_LIBRARY_IMPORT, demo=demo, runner=runner)
