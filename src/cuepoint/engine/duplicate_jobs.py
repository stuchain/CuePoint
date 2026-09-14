#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Finding duplicates as a background job (CLEAN-08, DEC-074).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what a scan does; this decides where it runs.

When a scan runs
----------------
- **After every import and every applied refresh**, which change paths, titles
  and lengths; and **after every match job**, which changes accepted Beatport
  ids. Each asks through :func:`scan_after`, and a scan that is already running
  when one asks is followed by another (see :mod:`cuepoint.engine.follow_ups`).
- **On request**, for any of the three signals.

What waits for what
-------------------
A scan refuses to start while an import or a refresh apply is running, for the
file check's reason: it would read a library being rewritten, and that job asks
for a scan when it finishes. Neither waits for a scan. A match job does not
conflict with one either; the scan it asks for when it ends reads the states it
wrote.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence, Tuple

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.follow_ups import FollowUps
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.models.duplicate_group import SIGNALS
from cuepoint.services.duplicate_service import (
    TRIGGER_REQUEST,
    DuplicateScanResult,
    validate_signals,
)

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a scan, and what the status strip keys
#: its label off.
JOB_TYPE_DUPLICATE_SCAN = "duplicate_scan"

#: What a scan refuses to start beside, besides another scan.
DUPLICATE_SCAN_CONFLICTS = (JOB_TYPE_LIBRARY_IMPORT, JOB_TYPE_LIBRARY_REFRESH_APPLY)

#: What the status strip says while a scan runs. No count goes with it: a scan
#: is three steps of very different lengths, and "1/3" would say nothing true.
PROGRESS_MESSAGE = "Finding duplicates"


@dataclass(frozen=True)
class StartedScan:
    """A scan started on request, and the signals it covers."""

    job: Job
    signals: Tuple[str, ...]

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns for a started scan."""
        return {"job_id": self.job.id, "signals": list(self.signals)}


def _duplicate_service() -> Any:
    """Resolve the duplicate service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IDuplicateService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IDuplicateService)


def run_duplicate_scan_job(
    job: Job, store: JobStore, signals: Sequence[str], trigger: str
) -> None:
    """Scan under ``job``, then start any scan that waited for this one."""
    try:
        _run(job, store, signals, trigger)
    finally:
        _FOLLOW_UPS.job_finished(store)


def _run(job: Job, store: JobStore, signals: Sequence[str], trigger: str) -> None:
    """Run the scan and set the job's terminal state in every outcome."""
    started = time.monotonic()
    store.report_progress(
        job,
        ProgressInfo(
            completed_tracks=0,
            total_tracks=0,
            matched_count=0,
            unmatched_count=0,
            elapsed_time=0.0,
            status_message=PROGRESS_MESSAGE,
        ),
    )
    try:
        result: DuplicateScanResult = _duplicate_service().scan(
            signals,
            trigger=trigger,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[duplicates] scan failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "DUPLICATE_SCAN_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[duplicates] scan failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "DUPLICATE_SCAN_FAILED", "message": str(exc)},
        )
        return

    _logger.debug("[duplicates] scan took %.2f s", time.monotonic() - started)
    payload = result.to_dict()
    if result.cancelled:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": result.summary_line()},
            result=payload,
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=payload)


def _create(store: JobStore, signals: Sequence[str], trigger: str) -> Job:
    wanted = tuple(signals)

    def runner(job: Job) -> None:
        run_duplicate_scan_job(job, store, wanted, trigger)

    return store.create_job(
        job_type=JOB_TYPE_DUPLICATE_SCAN,
        runner=runner,
        exclusive=True,
        conflicts_with=DUPLICATE_SCAN_CONFLICTS,
    )


def start_duplicate_scan_job(
    store: JobStore, signals: Optional[Sequence[str]] = None
) -> StartedScan:
    """Start a scan for some signals, or all of them.

    Raises:
        ValueError: If a signal is unknown or none are named.
        JobTypeBusyError: If a scan, an import or a refresh apply is running.
    """
    wanted = validate_signals(signals)
    return StartedScan(job=_create(store, wanted, TRIGGER_REQUEST), signals=wanted)


def scan_after(store: JobStore, trigger: str) -> Optional[Job]:
    """Start a whole-library scan after an import, a refresh or a match job.

    Never raises; see :meth:`FollowUps.request`.
    """
    return _FOLLOW_UPS.request(store, trigger)


def pending_scan(store: JobStore) -> Optional[str]:
    """The trigger of a scan waiting for the running one, or None."""
    return _FOLLOW_UPS.pending(store)


_FOLLOW_UPS = FollowUps(
    JOB_TYPE_DUPLICATE_SCAN,
    "duplicate scan",
    lambda store, trigger: _create(store, SIGNALS, trigger),
)
