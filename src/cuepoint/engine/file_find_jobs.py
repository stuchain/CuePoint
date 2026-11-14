#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Looking for missing files in a folder as a background job (DEC-073).

The decision of what a find does is :mod:`cuepoint.services.file_find_service`'s;
this decides where it runs and which tracks it looks for. It reads the library and
the folder and writes nothing: a track's path stays whatever Rekordbox says, and
relinking is Rekordbox's Relocate.

It refuses to start beside an import or a refresh apply, as a file check does: the
current status of each track is read from a library that job is rewriting.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.file_check_jobs import FILE_CHECK_CONFLICTS
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.models.file_status import FILE_MISSING
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.file_find_service import WantedFile, find_files
from cuepoint.utils.long_path import os_path

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator for a find.
JOB_TYPE_FILE_FIND = "file_find"

#: What the status strip says while a find runs.
PROGRESS_MESSAGE = "Looking in a folder"

#: What a find that has no missing track to look for says.
NOTHING_MISSING = (
    "None of the selected tracks is marked missing, so there is nothing to look for"
)

_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1


@dataclass(frozen=True)
class StartedFind:
    """A find started on request, and how many missing tracks it looks for."""

    job: Job
    tracks: int

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns for a started find."""
        return {"job_id": self.job.id, "tracks": self.tracks}


def _resolve(interface_name: str) -> Any:
    _ensure_services()

    from cuepoint.services import interfaces
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(getattr(interfaces, interface_name))


def missing_tracks(selection: BatchSelection) -> List[WantedFile]:
    """The selected tracks whose current file status is missing.

    Raises:
        ValueError: If the selection names no library tracks.
        BrowseQueryError: If a query selection cannot be built.
    """
    ids = _resolve("IFileCheckService").resolve(selection)
    current = _resolve("IFileStatusRepository").current_files(ids)
    missing = [item.track_id for item in current if item.status == FILE_MISSING]
    durations = {
        int(track.id): track.duration_seconds
        for track in _resolve("ITrackRepository").get_many(missing)
        if track.id is not None
    }
    paths = {item.track_id: item.path for item in current}
    return [
        WantedFile(track_id, paths[track_id], durations.get(track_id))
        for track_id in missing
    ]


def validate_folder(folder: Any) -> str:
    """Return ``folder`` when it names an existing directory.

    Raises:
        ValueError: If it is not an absolute path to a directory that exists.
    """
    if not isinstance(folder, str) or not folder.strip():
        raise ValueError("folder is required and must be a path")
    if not os.path.isabs(folder):
        raise ValueError("folder must be an absolute path")
    if not os.path.isdir(os_path(folder)):
        raise ValueError("folder is not a folder that exists")
    return folder


def run_file_find_job(
    job: Job, store: JobStore, folder: str, wanted: List[WantedFile]
) -> None:
    """Look for ``wanted`` in ``folder`` under ``job`` and set its terminal state."""
    started = time.monotonic()
    last_reported = 0.0

    def on_progress(scanned: int, known: int) -> None:
        nonlocal last_reported
        now = time.monotonic()
        if scanned < known and now - last_reported < _PROGRESS_REPORT_INTERVAL_SECONDS:
            return
        last_reported = now
        store.report_progress(
            job,
            ProgressInfo(
                completed_tracks=scanned,
                total_tracks=known,
                matched_count=0,
                unmatched_count=0,
                elapsed_time=now - started,
                status_message=PROGRESS_MESSAGE,
            ),
        )

    try:
        result = find_files(
            folder,
            wanted,
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
            path_owners=_resolve("ITrackRepository").track_ids_by_normalized_path,
        )
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[files] find failed: %s", exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={
                "code": "FILE_FIND_FAILED",
                "message": "Looking in the folder failed",
            },
        )
        return
    if result.cancelled:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": result.summary_line()},
            result=result.to_dict(),
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=result.to_dict())


def start_file_find_job(
    store: JobStore, selection: BatchSelection, folder: str
) -> StartedFind:
    """Start looking in ``folder`` for the missing files of a selection.

    Raises:
        ValueError: If the folder is not a folder, the selection names no
            library tracks, or none of them is missing.
        BrowseQueryError: If a query selection cannot be built.
        JobTypeBusyError: If an import or a refresh apply is running.
    """
    where = validate_folder(folder)
    wanted = missing_tracks(selection)
    if not wanted:
        raise ValueError(NOTHING_MISSING)

    def runner(job: Job) -> None:
        run_file_find_job(job, store, where, wanted)

    job = store.create_job(
        job_type=JOB_TYPE_FILE_FIND,
        runner=runner,
        exclusive=True,
        conflicts_with=FILE_CHECK_CONFLICTS,
    )
    return StartedFind(job=job, tracks=len(wanted))
