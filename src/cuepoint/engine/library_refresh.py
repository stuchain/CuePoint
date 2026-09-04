#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Previewing and applying a refresh over the engine API (LIBRARY-10, DEC-032).

Two calls, not one. DEC-032 chose preview-then-confirm because DEC-003's
deletions cannot be undone, and a diff computed and applied in a single request
could not have been confirmed by anyone — there would be nothing between "I
wonder what changed" and tracks being gone.

So a preview produces a diff, keeps it here, and hands back its id; an apply
names that id. Both run as background jobs, for the same reason an import does
(DEC-033): reading a 50,000-track export is not something an HTTP request should
sit on.

How long a diff lives
---------------------
**A diff is valid until the file it describes changes.** Its lifetime is tied to
the thing that can make it wrong, not to a clock: a preview a user reads over
lunch is still true if nothing moved, and one computed a second ago is already a
lie if Rekordbox re-exported in between. Applying a stale diff would mean
deleting on the strength of numbers a user was shown for a file that no longer
exists in that form, which is exactly the confirmation DEC-032 exists to
protect.

Staleness is measured the same way DEC-035 measures it — modified time and size
— and it is checked twice: when the apply is requested, so the answer is
immediate and specific, and again inside the job just before the write, because
a file can change in between.

The store keeps the last few diffs and forgets older ones. It is deliberately
in-memory: a diff is a statement about a file at a moment, and one that survived
an engine restart would be a statement about a moment nobody can vouch for.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine.jobs import Job, JobState, JobStore, _ensure_services
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.models.library_source import describe_file
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.refresh_diff import RefreshDiff
from cuepoint.services.library_import_service import (
    PHASE_PLAYLISTS,
    ImportCancelled,
    RefreshSummary,
)

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminators for the two halves of a refresh.
JOB_TYPE_LIBRARY_REFRESH_PREVIEW = "library_refresh_preview"
JOB_TYPE_LIBRARY_REFRESH_APPLY = "library_refresh_apply"

#: Every job type that reads or writes the library as a whole. They exclude one
#: another, not just their own kind: an import and a refresh apply write the
#: same tables, and a preview running against a library being rewritten under it
#: would describe a state that never existed. One library operation at a time.
LIBRARY_JOB_TYPES: Tuple[str, ...] = (
    JOB_TYPE_LIBRARY_IMPORT,
    JOB_TYPE_LIBRARY_REFRESH_PREVIEW,
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
)

#: How many previews are remembered. Small on purpose: a user previews, looks,
#: and applies or does not. Keeping more would mostly keep diffs that are
#: already stale, at real memory cost — a diff over a large collection carries
#: hundreds of examples in each of seven categories.
MAX_STORED_DIFFS = 8

#: How often a tick is handed to the job store, matching the import's sampling.
_PROGRESS_REPORT_INTERVAL_SECONDS = 0.1

_PHASE_MESSAGES = {
    "tracks": "Applying tracks",
    PHASE_PLAYLISTS: "Mirroring playlists",
}


class DiffNotFoundError(LookupError):
    """The named diff is not in the store.

    Either it was never computed, or enough previews have happened since that it
    has been forgotten. Both mean the same thing to a caller — preview again —
    which is why they are not distinguished.
    """

    def __init__(self, diff_id: str) -> None:
        super().__init__(
            f"No preview {diff_id}. It may have expired; preview the refresh again."
        )
        self.diff_id = diff_id


class DiffStaleError(RuntimeError):
    """The file has changed since the diff was computed.

    Refused rather than applied, because the numbers a user confirmed describe a
    file that is no longer there. DEC-003 makes acting on them irreversible.
    """

    def __init__(self, diff_id: str, xml_path: str, reason: str) -> None:
        super().__init__(
            f"{xml_path} has changed since this preview was computed ({reason}). "
            "Preview the refresh again to see what would happen now."
        )
        self.diff_id = diff_id
        self.xml_path = xml_path
        self.reason = reason


@dataclass(frozen=True)
class StoredDiff:
    """A computed diff, and the state of the file it was computed against.

    The file state is recorded here rather than read from the DEC-035 source
    record on purpose: a preview can be run against a file the library was never
    imported from, and the question "has *this* file changed since *this*
    preview" has nothing to do with the last import.
    """

    diff_id: str
    diff: RefreshDiff
    xml_path: str
    created_at: str
    xml_modified_at: Optional[str] = None
    xml_size_bytes: Optional[int] = None

    @property
    def is_stat_known(self) -> bool:
        """True when the file's state was recorded and staleness can be judged."""
        return self.xml_modified_at is not None and self.xml_size_bytes is not None

    def staleness(self) -> Optional[str]:
        """Return why this diff is stale, or None if it still holds.

        A string rather than a bool so the refusal can say which of the three
        things happened; a caller only deciding whether to apply reads it as
        truthy.

        A file whose state could not be read — at preview time or now — counts
        as stale. "I cannot tell" and "it is the same" lead to opposite actions,
        and only one of them deletes tracks.
        """
        if not self.is_stat_known:
            return "its state could not be read when the preview was computed"
        current = describe_file(self.xml_path)
        if current is None:
            return "the file is no longer readable"
        modified, size = current
        if modified != self.xml_modified_at:
            return "it was modified"
        if size != self.xml_size_bytes:
            return "its size changed"
        return None

    def to_dict(self) -> Dict[str, Any]:
        """The preview job's result: the diff, plus how to apply it.

        ``diff_id`` is at the top level rather than inside the diff because the
        diff is a statement about two files and the id is a handle on this
        engine's memory of it — they have different lifetimes and the shape
        should say so.
        """
        payload = dict(self.diff.to_dict())
        payload["diff_id"] = self.diff_id
        payload["computed_at"] = self.created_at
        payload["xml_modified_at"] = self.xml_modified_at
        payload["xml_size_bytes"] = self.xml_size_bytes
        return payload


@dataclass
class RefreshDiffStore:
    """The previews this engine currently remembers.

    Thread-safe: previews are computed on job threads and read by HTTP handler
    threads.
    """

    max_entries: int = MAX_STORED_DIFFS
    _entries: Dict[str, StoredDiff] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def put(self, diff: RefreshDiff) -> StoredDiff:
        """Store a diff with the state of the file it describes, and return it."""
        described = describe_file(diff.xml_path)
        modified_at, size_bytes = described if described is not None else (None, None)
        stored = StoredDiff(
            diff_id=str(uuid.uuid4()),
            diff=diff,
            xml_path=diff.xml_path,
            created_at=utc_now_iso(),
            xml_modified_at=modified_at,
            xml_size_bytes=size_bytes,
        )
        with self._lock:
            self._entries[stored.diff_id] = stored
            # Insertion-ordered, so the oldest is the first key.
            while len(self._entries) > self.max_entries:
                self._entries.pop(next(iter(self._entries)))
        return stored

    def get(self, diff_id: str) -> StoredDiff:
        """Return a stored diff.

        Raises:
            DiffNotFoundError: If it is unknown or has been forgotten.
        """
        with self._lock:
            stored = self._entries.get(str(diff_id))
        if stored is None:
            raise DiffNotFoundError(str(diff_id))
        return stored

    def require_fresh(self, diff_id: str) -> StoredDiff:
        """Return a stored diff, refusing one whose file has moved on.

        Raises:
            DiffNotFoundError: If it is unknown.
            DiffStaleError: If the file has changed since it was computed.
        """
        stored = self.get(diff_id)
        reason = stored.staleness()
        if reason is not None:
            raise DiffStaleError(stored.diff_id, stored.xml_path, reason)
        return stored

    def clear(self) -> None:
        """Forget every diff. Used by tests and by a library that was replaced."""
        with self._lock:
            self._entries.clear()

    def count(self) -> int:
        """How many diffs are remembered."""
        with self._lock:
            return len(self._entries)


#: The engine's store. A module singleton for the same reason the job store is:
#: the HTTP handler and the job threads have to be talking about the same one.
_DIFF_STORE = RefreshDiffStore()


def get_diff_store() -> RefreshDiffStore:
    """Return the engine's diff store."""
    return _DIFF_STORE


def _progress(completed: int, total: int, phase: str, started: float) -> ProgressInfo:
    """Build a progress tick in the shape the status strip already reads."""
    return ProgressInfo(
        completed_tracks=completed,
        total_tracks=total,
        matched_count=0,
        unmatched_count=0,
        elapsed_time=time.monotonic() - started,
        status_message=_PHASE_MESSAGES.get(phase, "Refreshing"),
    )


def _sampler(job: Job, store: JobStore, started: float):
    """Return an ``on_progress`` that throttles what it hands the store.

    The same rule the import uses: a phase's last tick always goes through, so a
    bar reaches its total instead of stopping wherever the sampler last fired.
    """
    last_reported = 0.0

    def on_progress(completed: int, total: int, phase: str) -> None:
        nonlocal last_reported
        now = time.monotonic()
        if (
            completed < total
            and now - last_reported < _PROGRESS_REPORT_INTERVAL_SECONDS
        ):
            return
        last_reported = now
        store.report_progress(job, _progress(completed, total, phase, started))

    return on_progress


def _fail(store: JobStore, job: Job, exc: Exception, fallback_code: str) -> None:
    """Finish a job as failed, keeping a CuePoint error's own code.

    A generic code would throw away the one part of the message that says what
    to do next — ``LIBRARY_NOT_IMPORTED`` and ``LIBRARY_XML_NO_COLLECTION`` ask
    for completely different things.
    """
    code = fallback_code
    message = str(exc)
    if isinstance(exc, CuePointException):
        code = exc.error_code or fallback_code
        message = exc.message
    _logger.warning("[library] refresh job failed (%s): %s", code, message)
    store.finish(job, state=JobState.FAILED, error={"code": code, "message": message})


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------


def run_refresh_preview_job(
    job: Job,
    store: JobStore,
    xml_path: Optional[str],
    diff_store: Optional[RefreshDiffStore] = None,
    force: bool = False,
) -> None:
    """Compute a diff under ``job`` and publish it as the job's result.

    Writes nothing. That is the property DEC-032 rests on, and it is the service
    that guarantees it (LIBRARY-07) — this runner adds no writes of its own, and
    the engine test asserts the library is unchanged afterwards rather than
    trusting the layering.
    """
    _ensure_services()
    diffs = diff_store if diff_store is not None else get_diff_store()

    from cuepoint.services.interfaces import ILibraryImportService
    from cuepoint.utils.di_container import get_container

    service = get_container().resolve(ILibraryImportService)
    started = time.monotonic()

    def should_cancel() -> bool:
        return bool(job.cancel_requested)

    store.report_progress(job, _progress(0, 0, "tracks", started))

    try:
        diff = service.compute_refresh_diff(
            xml_path, should_cancel=should_cancel, force=force
        )
    except ImportCancelled as exc:
        _logger.info("[library] refresh preview cancelled: %s", exc)
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": str(exc)},
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _fail(store, job, exc, "LIBRARY_REFRESH_PREVIEW_FAILED")
        return

    stored = diffs.put(diff)
    _logger.info(
        "[library] Refresh preview %s for %s: +%s ~%s -%s",
        stored.diff_id,
        stored.xml_path,
        diff.added.count,
        diff.changed.count,
        diff.removed.count,
    )
    store.finish(job, state=JobState.SUCCEEDED, result=stored.to_dict())


def start_refresh_preview_job(
    store: JobStore,
    xml_path: Optional[str] = None,
    *,
    diff_store: Optional[RefreshDiffStore] = None,
    force: bool = False,
) -> Job:
    """Register and start a preview job.

    Raises:
        JobTypeBusyError: If any library job is already running.
    """
    path = str(xml_path).strip() if xml_path is not None else None

    def runner(job: Job) -> None:
        run_refresh_preview_job(job, store, path, diff_store, force)

    return store.create_job(
        job_type=JOB_TYPE_LIBRARY_REFRESH_PREVIEW,
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------


def run_refresh_apply_job(
    job: Job,
    store: JobStore,
    diff_id: str,
    confirm_references: bool = False,
    diff_store: Optional[RefreshDiffStore] = None,
) -> None:
    """Apply a stored diff under ``job``.

    The staleness check runs again here, immediately before the write, even
    though the endpoint already ran it. Between accepting the request and
    reaching this line a job was queued and a thread was scheduled, and a
    re-export in that window would otherwise be applied — the endpoint's check
    is there to answer quickly, this one is there to be right.
    """
    _ensure_services()
    diffs = diff_store if diff_store is not None else get_diff_store()

    from cuepoint.services.interfaces import ILibraryImportService
    from cuepoint.utils.di_container import get_container

    service = get_container().resolve(ILibraryImportService)
    started = time.monotonic()

    def should_cancel() -> bool:
        return bool(job.cancel_requested)

    store.report_progress(job, _progress(0, 0, "tracks", started))

    try:
        stored = diffs.require_fresh(diff_id)
    except DiffNotFoundError as exc:
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "LIBRARY_REFRESH_DIFF_NOT_FOUND", "message": str(exc)},
        )
        return
    except DiffStaleError as exc:
        store.finish(
            job,
            state=JobState.FAILED,
            error={"code": "LIBRARY_REFRESH_DIFF_STALE", "message": str(exc)},
        )
        return

    try:
        summary: RefreshSummary = service.apply_refresh(
            stored.diff,
            confirm_references=confirm_references,
            on_progress=_sampler(job, store, started),
            should_cancel=should_cancel,
        )
    except ImportCancelled as exc:
        # Nothing was applied: LIBRARY-09 runs the whole write in one
        # transaction, and a cancel rolls it back.
        _logger.info("[library] refresh apply cancelled: %s", exc)
        store.finish(
            job,
            state=JobState.CANCELLED,
            error={"code": "JOB_CANCELLED", "message": str(exc)},
        )
        return
    except Exception as exc:  # noqa: BLE001 — surfaced to the API client
        _fail(store, job, exc, "LIBRARY_REFRESH_APPLY_FAILED")
        return

    store.finish(
        job,
        state=JobState.SUCCEEDED,
        result=refresh_summary_to_dict(summary, stored.diff_id),
    )


def start_refresh_apply_job(
    store: JobStore,
    diff_id: str,
    *,
    confirm_references: bool = False,
    diff_store: Optional[RefreshDiffStore] = None,
) -> Job:
    """Register and start an apply job.

    Raises:
        JobTypeBusyError: If any library job is already running.
    """

    def runner(job: Job) -> None:
        run_refresh_apply_job(job, store, diff_id, confirm_references, diff_store)

    return store.create_job(
        job_type=JOB_TYPE_LIBRARY_REFRESH_APPLY,
        runner=runner,
        exclusive=True,
        conflicts_with=LIBRARY_JOB_TYPES,
    )


def refresh_summary_to_dict(summary: RefreshSummary, diff_id: str) -> Dict[str, Any]:
    """Serialize what a refresh did. A public shape; extend rather than rename.

    ``tracks_deleted`` is reported on its own rather than folded into a net
    change, because it is the irreversible number and the one an activity feed,
    a toast and a support question all ask about.
    """
    return {
        "diff_id": diff_id,
        "xml_path": summary.source.xml_path,
        "track_count": summary.track_count,
        "tracks_inserted": summary.tracks_inserted,
        "tracks_updated": summary.tracks_updated,
        "tracks_deleted": summary.tracks_deleted,
        "relinked_count": summary.relinked_count,
        "playlists": {
            "nodes": summary.playlists.nodes,
            "playlists": summary.playlists.playlists,
            "folders": summary.playlists.folders,
            "entries": summary.playlists.entries,
        },
        "references": summary.references.to_dict(),
        "duration_seconds": round(summary.duration_seconds, 3),
        "summary_line": summary.summary_line(),
    }
