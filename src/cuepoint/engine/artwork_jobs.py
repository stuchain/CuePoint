#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading artwork as a background job, and serving a thumbnail (CLEAN-09, DEC-076).

When a scan runs
----------------
- **After every whole-library file check**, which follows every import and
  refresh. The scan reads only the files that check found present, so it waits
  for its answer rather than following the import directly.
- **On request**, over any selection, optionally fetching Beatport's images for
  the accepted matches in it.

What waits for what
-------------------
A scan refuses to start while an import, a refresh apply or a file check runs:
the first two rewrite the paths it would read, and the third decides which files
it may open. None of them waits for a scan. A check that finishes during a scan
asks for another, which waits for this one (:mod:`cuepoint.engine.follow_ups`).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.file_check_jobs import JOB_TYPE_FILE_CHECK
from cuepoint.engine.follow_ups import FollowUps
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.artwork_service import TRIGGER_REQUEST, ArtworkScanResult
from cuepoint.services.batch_service import BatchSelection

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for an artwork scan.
JOB_TYPE_ARTWORK_SCAN = "artwork_scan"

#: What a scan refuses to start beside, besides another scan.
ARTWORK_SCAN_CONFLICTS = (
    JOB_TYPE_LIBRARY_IMPORT,
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
    JOB_TYPE_FILE_CHECK,
)

#: What the status strip says while a scan runs.
PROGRESS_MESSAGE = "Reading artwork"

_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1


@dataclass(frozen=True)
class StartedArtworkScan:
    """A scan started on request, and how many tracks it covers."""

    job: Job
    tracks: int
    fetch_beatport: bool

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns for a started scan."""
        return {
            "job_id": self.job.id,
            "tracks": self.tracks,
            "fetch_beatport": self.fetch_beatport,
        }


def _artwork_service() -> Any:
    """Resolve the artwork service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IArtworkService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IArtworkService)


def run_artwork_scan_job(
    job: Job,
    store: JobStore,
    track_ids: Optional[Sequence[int]],
    trigger: str,
    fetch_beatport: bool,
) -> None:
    """Scan under ``job``, then start any scan that waited for this one."""
    try:
        _run(job, store, track_ids, trigger, fetch_beatport)
    finally:
        _FOLLOW_UPS.job_finished(store)


def _run(
    job: Job,
    store: JobStore,
    track_ids: Optional[Sequence[int]],
    trigger: str,
    fetch_beatport: bool,
) -> None:
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
        store.report_progress(
            job,
            ProgressInfo(
                completed_tracks=completed,
                total_tracks=total,
                matched_count=0,
                unmatched_count=0,
                elapsed_time=now - started,
                status_message=PROGRESS_MESSAGE,
            ),
        )

    try:
        service = _artwork_service()
        wanted: List[int] = (
            list(track_ids) if track_ids is not None else service.library()
        )
        result: ArtworkScanResult = service.scan(
            wanted,
            trigger=trigger,
            fetch_beatport=fetch_beatport,
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        _logger.warning("[artwork] scan failed: %s", exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": exc.error_code or "ARTWORK_SCAN_FAILED",
                "message": exc.message,
            },
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[artwork] scan failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "ARTWORK_SCAN_FAILED", "message": str(exc)},
        )
        return

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


def _create(
    store: JobStore,
    track_ids: Optional[Sequence[int]],
    trigger: str,
    fetch_beatport: bool,
) -> Job:
    wanted = None if track_ids is None else list(track_ids)

    def runner(job: Job) -> None:
        run_artwork_scan_job(job, store, wanted, trigger, fetch_beatport)

    return store.create_job(
        job_type=JOB_TYPE_ARTWORK_SCAN,
        runner=runner,
        exclusive=True,
        conflicts_with=ARTWORK_SCAN_CONFLICTS,
    )


def start_artwork_scan_job(
    store: JobStore, selection: BatchSelection, *, fetch_beatport: bool = False
) -> StartedArtworkScan:
    """Start reading the artwork of a selection.

    Raises:
        ValueError: If the selection names no library tracks.
        BrowseQueryError: If a query selection cannot be built.
        JobTypeBusyError: If a scan, an import, a refresh apply or a file check
            is running.
    """
    track_ids = _artwork_service().resolve(selection)
    job = _create(store, track_ids, TRIGGER_REQUEST, bool(fetch_beatport))
    return StartedArtworkScan(
        job=job, tracks=len(track_ids), fetch_beatport=bool(fetch_beatport)
    )


def artwork_scan_after(store: JobStore, trigger: str) -> Optional[Job]:
    """Start a whole-library scan after a whole-library file check finished.

    Never raises; see :meth:`FollowUps.request`.
    """
    return _FOLLOW_UPS.request(store, trigger)


def pending_artwork_scan(store: JobStore) -> Optional[str]:
    """The trigger of a scan waiting for the running one, or None."""
    return _FOLLOW_UPS.pending(store)


def track_thumbnail(track_id: int, size: str) -> Optional[bytes]:
    """A track's artwork thumbnail as JPEG bytes, or None when it has none.

    Raises:
        ValueError: If the size is unknown.
        LookupError: If there is no such track.
    """
    return _artwork_service().thumbnail(int(track_id), size)


_FOLLOW_UPS = FollowUps(
    JOB_TYPE_ARTWORK_SCAN,
    "artwork scan",
    lambda store, trigger: _create(store, None, trigger, False),
)
