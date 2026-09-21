#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Running a Rekordbox export as a background job (EXPORT-05, DEC-084).

A separate module from :mod:`cuepoint.engine.jobs` for ``batch_jobs``'s reason:
the service decides what an export does; this decides where it runs. The
Rekordbox export, not the CSV, JSON and Excel one — the job type says so, and so
does every name here.

Refused before it starts
------------------------
:func:`start_rekordbox_export` validates on the calling thread before a job
exists: the notation, the source, the destination, the chosen nodes and their
rules. So a destination that is the source, or a library never imported, is a
typed error returned to whoever asked, never a job that fails a moment later in
a log. The job validates again as it starts, because the source can go in
between, and a refusal there fails the job and records no row.

What waits for what
-------------------
An export is one more member of ``LIBRARY_JOB_TYPES``: it refuses to start beside
an import, a refresh or a batch edit, and each of those refuses to start beside
it. The export is a snapshot of the database — every track's two value layers and
every chosen Collection's entries — and a batch edit or a refresh landing half way
through would produce a file that matches neither state. Two exports at once are
refused too; they would be two snapshots racing for a folder.

A match, a tag write, a file check and a scan do not conflict with it. None of
them writes anything the export reads: a match records attempts and decisions but
applies no values, a tag write changes audio files and its own record, and a file
check's missing count is read once, at the start, and recorded as what the last
check found then. Blocking an export for an hour-long match would be a refusal
with no reason behind it.

Cancelling
----------
A cancel is asked between tracks, between playlists, and once more before the
written file replaces anything, so it is honoured in bounded time and leaves
nothing at the destination. There is no resume (contrast DEC-065's match): an
export is cheap to repeat, so a cancelled one is simply gone, and its row says
``cancelled``.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Dict, Optional, Sequence

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.data.rekordbox_export import PHASE_PLAYLISTS, PHASE_TRACKS
from cuepoint.engine.jobs import (
    _ACTIVE_STATES,
    Job,
    JobState,
    JobStore,
    JobTypeBusyError,
    _ensure_services,
)
from cuepoint.exceptions.cuepoint_exceptions import CuePointException

if TYPE_CHECKING:
    from cuepoint.services.rekordbox_export_service import ExportRequest

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator, and what the status strip keys its label off.
#: Not ``"export"``: that word already means the CSV, JSON and Excel files.
JOB_TYPE_REKORDBOX_EXPORT = "rekordbox_export"

#: What the status strip says in each phase. Two, because the first is
#: proportional to the collection and the second to the selection, and one bar
#: that jumps between them is worse than two honest ones.
PHASE_MESSAGES: Dict[str, str] = {
    PHASE_TRACKS: "Patching tracks",
    PHASE_PLAYLISTS: "Building playlists",
}

#: The job's answer when it fails for a reason without a code of its own.
FAILURE_CODE = "REKORDBOX_EXPORT_FAILED"

#: How often a tick is handed to the job store, as for every other job: a tick
#: takes the store's lock and wakes the event stream.
_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1


@dataclass(frozen=True)
class StartedRekordboxExport:
    """An export started on request, and what it will write.

    ``request`` is the export as validated — the destination made absolute and
    each node once — so whoever started it shows what is running rather than
    what it sent, and nothing has to validate a second time to learn it.
    """

    job: Job
    request: "ExportRequest"

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns for a started export."""
        return {
            "job_id": self.job.id,
            "collection_ids": list(self.request.collection_ids),
            "key_format": self.request.key_format,
            "destination_path": self.request.destination_path,
        }


def _export_service() -> Any:
    """Resolve the export service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import IRekordboxExportService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(IRekordboxExportService)  # type: ignore[type-abstract]


def refuse_if_library_busy(store: JobStore) -> None:
    """Refuse a preview while the library is held by a job an export waits for.

    Exactly the jobs :func:`start_rekordbox_export` is refused beside, so a
    preview is refused when — and only when — the export it describes could
    not start. A preview computed while an import or a batch edit rewrites the
    library would describe numbers that are about to change, and one shown
    beside a running export would offer a confirm that can only be refused.
    For the preview, which registers no job to take the store's lock with.

    Raises:
        JobTypeBusyError: Naming the job holding the library.
    """
    from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES

    for job in store.list_all():
        if job.type in LIBRARY_JOB_TYPES and job.state.value in _ACTIVE_STATES:
            raise JobTypeBusyError(job.type, job.id)


def start_rekordbox_export(
    store: JobStore,
    collection_ids: Sequence[int],
    key_format: str,
    destination_path: str,
    *,
    service: Optional[Any] = None,
) -> StartedRekordboxExport:
    """Validate an export on this thread, then start it as a job.

    Args:
        store: The engine's job store.
        collection_ids: The chosen Collections, Smart Collections and folders.
        key_format: One of ``KEY_FORMATS``.
        destination_path: The file a person chose in the save dialog.
        service: The export service. Resolved from the container when not
            given; a test hands in one over its own database.

    Returns:
        The job, and the export as validated.

    Raises:
        ValueError, ExportSourceError, ExportDestinationError, BrokenRuleError:
            The export cannot run, and why — before any job exists.
        JobTypeBusyError: An export, an import, a refresh or a batch edit is
            already running.
    """
    # Imported here, not at module scope: ``library_refresh`` imports this
    # module's job type to build that group, so importing it back at the top
    # would be a cycle — the shape ``library_jobs`` and ``batch_jobs`` share.
    from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES

    exporter = service if service is not None else _export_service()
    request = exporter.validate(collection_ids, key_format, destination_path)

    def runner(job: Job) -> None:
        run_rekordbox_export_job(
            job,
            store,
            request.collection_ids,
            request.key_format,
            request.destination_path,
            exporter,
        )

    job = store.create_job(
        job_type=JOB_TYPE_REKORDBOX_EXPORT,
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )
    return StartedRekordboxExport(job=job, request=request)


def run_rekordbox_export_job(
    job: Job,
    store: JobStore,
    collection_ids: Sequence[int],
    key_format: str,
    destination_path: str,
    service: Any,
) -> None:
    """Run one export under ``job`` and finish the job in every outcome.

    Written, cancelled and failed each end the job in the matching state with
    the export's own answer as its result, so whoever started it can read the
    export row's id, the counts and the reason from the job alone.
    """
    on_progress = _progress_reporter(job, store)
    try:
        ended = service.export(
            collection_ids,
            key_format,
            destination_path,
            job_id=job.id,
            on_progress=on_progress,
            should_cancel=lambda: bool(job.cancel_requested),
        )
    except CuePointException as exc:
        # A refusal found as the job started, or the database refusing the row
        # after the file was written. Either way there is a reason to show.
        _logger.warning("[rekordbox export] %s refused: %s", job.id, exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": exc.error_code or FAILURE_CODE, "message": exc.message},
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[rekordbox export] %s failed: %s", job.id, exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": FAILURE_CODE, "message": str(exc) or type(exc).__name__},
        )
        return

    payload = ended.to_dict()
    if ended.cancelled:
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": ended.summary_line()},
            result=payload,
        )
        return
    if ended.failed:
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": FAILURE_CODE, "message": str(ended.record.error)},
            result=payload,
        )
        return
    store.finish(job, state=JobState.SUCCEEDED, result=payload)


def _progress_reporter(job: Job, store: JobStore) -> Callable[[str, int, int], None]:
    """A progress callback that samples ticks into the job store.

    Sampled, as every job's is, except that the first and the last tick of each
    phase always get through: a phase's bar must be seen to start at zero and to
    finish, or the jump between phases is exactly what two bars were meant to
    avoid.
    """
    started = time.monotonic()
    last_reported = 0.0
    last_phase: Optional[str] = None

    def on_progress(phase: str, done: int, total: int) -> None:
        nonlocal last_reported, last_phase
        now = time.monotonic()
        boundary = phase != last_phase or done >= total
        if not boundary and now - last_reported < _PROGRESS_REPORT_INTERVAL_SECONDS:
            return
        last_reported = now
        last_phase = phase
        store.report_progress(
            job,
            ProgressInfo(
                completed_tracks=done,
                total_tracks=total,
                matched_count=0,
                unmatched_count=0,
                elapsed_time=now - started,
                status_message=PHASE_MESSAGES.get(phase, "Exporting"),
            ),
        )

    return on_progress


__all__ = (
    "FAILURE_CODE",
    "JOB_TYPE_REKORDBOX_EXPORT",
    "PHASE_MESSAGES",
    "StartedRekordboxExport",
    "refuse_if_library_busy",
    "run_rekordbox_export_job",
    "start_rekordbox_export",
)
