#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Writing tags to files as jobs: preview, write, restore (CLEAN-10, DEC-070).

Previewed, then written by id
-----------------------------
A preview reads every file in scope, so it is a job above DEC-063's threshold
and an answer on the calling thread below it — the same fork a batch edit takes.
Either way the preview is kept here, by id, and a write names that id: the id
of the job that computed it, or a fresh one for a preview answered inline. It is
the refresh's shape (LIBRARY-10), for the same reason: a person confirms a
statement about their files, and the write acts on that statement rather than on
a second computation nobody saw.

Unlike a refresh diff, a preview does not go stale as a whole. Its write looks
at each file again and skips the ones that changed since, so the statement stays
true file by file. A preview is written once: the write takes it out of the
store, so a second request for the same id is refused rather than writing again.
The store is in memory and small, as the refresh's is.

What waits for what
-------------------
A preview, a write and a restore each refuse to start beside one another, and
beside an import, a refresh apply, a file check or an artwork scan: the first
two rewrite the paths a write opens, the third decides which files may be
opened, and the fourth reads the same files' tags. None of those waits for a tag
job. They run on their own schedule — a check and a scan follow every import —
and a tag write that finds a path, a file status or a value changed under it
skips that file and says so.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.artwork_jobs import JOB_TYPE_ARTWORK_SCAN
from cuepoint.engine.file_check_jobs import JOB_TYPE_FILE_CHECK
from cuepoint.engine.jobs import (
    Job,
    JobState,
    JobStore,
    JobTypeBusyError,
    _ensure_services,
)
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.batch_service import BATCH_JOB_THRESHOLD, BatchSelection
from cuepoint.services.tag_write_options import TagWriteOptions
from cuepoint.services.tag_write_service import TagWritePreview

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminators.
JOB_TYPE_TAG_WRITE_PREVIEW = "tag_write_preview"
JOB_TYPE_TAG_WRITE = "tag_write"
JOB_TYPE_TAG_RESTORE = "tag_restore"

TAG_FILE_JOB_TYPES: Tuple[str, ...] = (
    JOB_TYPE_TAG_WRITE_PREVIEW,
    JOB_TYPE_TAG_WRITE,
    JOB_TYPE_TAG_RESTORE,
)

#: What every tag job refuses to start beside.
TAG_FILE_CONFLICTS: Tuple[str, ...] = (
    *TAG_FILE_JOB_TYPES,
    JOB_TYPE_LIBRARY_IMPORT,
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
    JOB_TYPE_FILE_CHECK,
    JOB_TYPE_ARTWORK_SCAN,
)

#: Previews remembered at once. A person previews, reads, and writes or does not.
MAX_STORED_PREVIEWS = 4

#: What the status strip says while each job runs.
PREVIEW_MESSAGE = "Reading tags"
WRITE_MESSAGE = "Writing tags"
RESTORE_MESSAGE = "Restoring tags"

_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1
_ACTIVE_STATES = ("queued", "running")


class PreviewNotFoundError(LookupError):
    """The named preview is not in the store: never made, forgotten, or written."""

    def __init__(self, preview_id: str) -> None:
        super().__init__(
            f"No tag write preview {preview_id}. It may have expired or already been"
            " written; preview again."
        )
        self.preview_id = preview_id


class TagWritePreviewStore:
    """The previews this engine remembers. Thread-safe."""

    def __init__(self, max_entries: int = MAX_STORED_PREVIEWS) -> None:
        """Remember at most ``max_entries`` previews, forgetting the oldest.

        Raises:
            ValueError: If ``max_entries`` is below one.
        """
        if max_entries < 1:
            raise ValueError("A preview store holds at least one preview")
        self._max = int(max_entries)
        self._entries: "OrderedDict[str, TagWritePreview]" = OrderedDict()
        self._lock = threading.Lock()

    def put(self, preview: TagWritePreview) -> TagWritePreview:
        """Remember a finished preview.

        Raises:
            ValueError: If the preview was cancelled, so cannot be written.
        """
        if preview.cancelled:
            raise ValueError("A cancelled preview is not kept")
        with self._lock:
            self._entries[preview.preview_id] = preview
            self._entries.move_to_end(preview.preview_id)
            while len(self._entries) > self._max:
                self._entries.popitem(last=False)
        return preview

    def get(self, preview_id: str) -> TagWritePreview:
        """Return a preview, keeping it.

        Raises:
            PreviewNotFoundError: If it is not remembered.
        """
        with self._lock:
            preview = self._entries.get(str(preview_id))
        if preview is None:
            raise PreviewNotFoundError(str(preview_id))
        return preview

    def take(self, preview_id: str) -> TagWritePreview:
        """Return a preview and forget it, so it is written once.

        Raises:
            PreviewNotFoundError: If it is not remembered.
        """
        with self._lock:
            preview = self._entries.pop(str(preview_id), None)
        if preview is None:
            raise PreviewNotFoundError(str(preview_id))
        return preview

    def clear(self) -> None:
        """Forget every preview."""
        with self._lock:
            self._entries.clear()

    def count(self) -> int:
        """How many previews are remembered."""
        with self._lock:
            return len(self._entries)


_PREVIEWS = TagWritePreviewStore()


def get_preview_store() -> TagWritePreviewStore:
    """Return the engine's preview store."""
    return _PREVIEWS


@dataclass(frozen=True)
class StartedTagRestore:
    """A restore started, and how many recorded writes it covers."""

    job: Job
    writes: int
    restored_job_id: Optional[str] = None
    track_id: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """The answer a route returns for a started restore."""
        return {
            "job_id": self.job.id,
            "writes": self.writes,
            "restored_job_id": self.restored_job_id,
            "track_id": self.track_id,
        }


def _tag_write_service() -> Any:
    """Resolve the tag write service, bootstrapping the container if needed."""
    _ensure_services()

    from cuepoint.services.interfaces import ITagWriteService
    from cuepoint.utils.di_container import get_container

    return get_container().resolve(ITagWriteService)  # type: ignore[type-abstract]


def refuse_if_busy(store: JobStore) -> None:
    """Refuse work on files while a job that conflicts with it is active.

    For a preview answered inline, which registers no job to take the store's
    lock with.

    Raises:
        JobTypeBusyError: Naming the job holding the files.
    """
    for job in store.list_all():
        if job.type in TAG_FILE_CONFLICTS and job.state.value in _ACTIVE_STATES:
            raise JobTypeBusyError(job.type, job.id)


def preview_or_start(
    store: JobStore,
    selection: BatchSelection,
    options: TagWriteOptions,
    *,
    previews: Optional[TagWritePreviewStore] = None,
) -> Tuple[Optional[TagWritePreview], Optional[Job]]:
    """Preview a write inline, or start a job for it, and say which happened.

    Returns exactly one of the two: a preview already kept, or the job computing
    one, whose result carries its ``preview_id``.

    Raises:
        ValueError: If the selection names no tracks.
        BrowseQueryError: If a query selection cannot be built.
        JobTypeBusyError: If a conflicting job is running.
    """
    kept = previews if previews is not None else get_preview_store()
    service = _tag_write_service()
    track_ids: List[int] = service.resolve(selection)
    if len(track_ids) <= BATCH_JOB_THRESHOLD:
        refuse_if_busy(store)
        preview = service.preview(track_ids, options, preview_id=str(uuid.uuid4()))
        return kept.put(preview), None
    return None, start_tag_preview_job(store, track_ids, options, previews=kept)


def start_tag_preview_job(
    store: JobStore,
    track_ids: Sequence[int],
    options: TagWriteOptions,
    *,
    previews: Optional[TagWritePreviewStore] = None,
) -> Job:
    """Start a preview over tracks already resolved.

    Raises:
        JobTypeBusyError: If a conflicting job is running.
    """
    kept = previews if previews is not None else get_preview_store()
    wanted = list(track_ids)

    def runner(job: Job) -> None:
        run_tag_preview_job(job, store, wanted, options, kept)

    return store.create_job(
        job_type=JOB_TYPE_TAG_WRITE_PREVIEW,
        runner=runner,
        exclusive=True,
        conflicts_with=TAG_FILE_CONFLICTS,
    )


def run_tag_preview_job(
    job: Job,
    store: JobStore,
    track_ids: Sequence[int],
    options: TagWriteOptions,
    previews: TagWritePreviewStore,
) -> None:
    """Compute a preview under ``job``, keep it under the job's id, and answer it."""

    def work(
        on_progress: Callable[[int, int], None], should_cancel: Callable[[], bool]
    ) -> TagWritePreview:
        preview: TagWritePreview = _tag_write_service().preview(
            track_ids,
            options,
            preview_id=job.id,
            on_progress=on_progress,
            should_cancel=should_cancel,
        )
        if not preview.cancelled:
            previews.put(preview)
        return preview

    _run(job, store, PREVIEW_MESSAGE, work, "TAG_WRITE_PREVIEW_FAILED")


def start_tag_write_job(
    store: JobStore,
    preview_id: str,
    *,
    previews: Optional[TagWritePreviewStore] = None,
) -> Job:
    """Start writing what a preview planned.

    Raises:
        PreviewNotFoundError: If the preview is not remembered.
        JobTypeBusyError: If a conflicting job is running.
    """
    kept = previews if previews is not None else get_preview_store()
    kept.get(preview_id)

    def runner(job: Job) -> None:
        run_tag_write_job(job, store, preview_id, kept)

    return store.create_job(
        job_type=JOB_TYPE_TAG_WRITE,
        runner=runner,
        exclusive=True,
        conflicts_with=TAG_FILE_CONFLICTS,
    )


def run_tag_write_job(
    job: Job, store: JobStore, preview_id: str, previews: TagWritePreviewStore
) -> None:
    """Write a preview under ``job``, taking it out of the store first."""
    try:
        preview = previews.take(preview_id)
    except PreviewNotFoundError as exc:
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "TAG_WRITE_PREVIEW_NOT_FOUND", "message": str(exc)},
        )
        return
    _run(
        job,
        store,
        WRITE_MESSAGE,
        lambda on_progress, should_cancel: _tag_write_service().write(
            preview, job.id, on_progress=on_progress, should_cancel=should_cancel
        ),
        "TAG_WRITE_FAILED",
    )


def start_tag_restore_job(
    store: JobStore, *, job_id: Optional[str] = None, track_id: Optional[int] = None
) -> StartedTagRestore:
    """Start restoring what a write job, or every write to a track, replaced.

    Raises:
        ValueError: Unless exactly one of the two is named, or when there is
            nothing to restore.
        JobTypeBusyError: If a conflicting job is running.
    """
    service = _tag_write_service()
    writes = int(service.restorable_count(job_id=job_id, track_id=track_id))
    if writes == 0:
        from cuepoint.services.tag_write_service import NOTHING_TO_RESTORE

        raise ValueError(NOTHING_TO_RESTORE)

    def runner(job: Job) -> None:
        run_tag_restore_job(job, store, job_id, track_id)

    job = store.create_job(
        job_type=JOB_TYPE_TAG_RESTORE,
        runner=runner,
        exclusive=True,
        conflicts_with=TAG_FILE_CONFLICTS,
    )
    return StartedTagRestore(
        job=job, writes=writes, restored_job_id=job_id, track_id=track_id
    )


def run_tag_restore_job(
    job: Job, store: JobStore, job_id: Optional[str], track_id: Optional[int]
) -> None:
    """Restore under ``job``."""
    _run(
        job,
        store,
        RESTORE_MESSAGE,
        lambda on_progress, should_cancel: _tag_write_service().restore(
            job.id,
            job_id=job_id,
            track_id=track_id,
            on_progress=on_progress,
            should_cancel=should_cancel,
        ),
        "TAG_RESTORE_FAILED",
    )


def _run(
    job: Job,
    store: JobStore,
    message: str,
    work: Callable[[Callable[[int, int], None], Callable[[], bool]], Any],
    failure_code: str,
) -> None:
    """Run work that answers with a result, and finish its job in every outcome."""
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
                status_message=message,
            ),
        )

    try:
        result = work(on_progress, lambda: bool(job.cancel_requested))
    except CuePointException as exc:
        _logger.warning("[tags] %s failed: %s", job.type, exc)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": exc.error_code or failure_code, "message": exc.message},
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _logger.warning("[tags] %s failed: %s", job.type, exc, exc_info=True)
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": failure_code, "message": str(exc)},
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


__all__ = (
    "JOB_TYPE_TAG_RESTORE",
    "JOB_TYPE_TAG_WRITE",
    "JOB_TYPE_TAG_WRITE_PREVIEW",
    "MAX_STORED_PREVIEWS",
    "PreviewNotFoundError",
    "StartedTagRestore",
    "TAG_FILE_CONFLICTS",
    "TAG_FILE_JOB_TYPES",
    "TagWritePreviewStore",
    "get_preview_store",
    "preview_or_start",
    "refuse_if_busy",
    "start_tag_preview_job",
    "start_tag_restore_job",
    "start_tag_write_job",
)
