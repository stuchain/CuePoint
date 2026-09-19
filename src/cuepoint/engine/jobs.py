"""The engine's job store: every background job's lifecycle (Phase 3 P0).

Built for inKey's match over a playlist file and generalized by FOUNDATION-07
into the store every job type shares. The file-based match itself retired with
inKey (CLEAN-14, DEC-071); a match now runs over library tracks, in
:mod:`cuepoint.engine.match_jobs`.
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Sequence

from cuepoint.compat.gui_types import ProgressInfo

_services_bootstrapped = False
_bootstrap_lock = threading.Lock()


#: States a user would call "happening now".
_ACTIVE_STATES = frozenset({"queued", "running"})


class JobTypeBusyError(RuntimeError):
    """An exclusive job of this type is already queued or running.

    Carries the existing job's id so a caller can point at it rather than only
    saying no.
    """

    def __init__(self, job_type: str, job_id: str) -> None:
        super().__init__(f"A {job_type} job is already running: {job_id}")
        self.job_type = job_type
        self.job_id = job_id


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def progress_to_dict(progress: ProgressInfo) -> Dict[str, Any]:
    return {
        "completed_tracks": progress.completed_tracks,
        "total_tracks": progress.total_tracks,
        "matched_count": progress.matched_count,
        "unmatched_count": progress.unmatched_count,
        "current_track": progress.current_track,
        "elapsed_time": progress.elapsed_time,
        "eta_seconds": progress.eta_seconds,
        "status_message": progress.status_message,
        "reliability_state": progress.reliability_state,
        "percentage": getattr(progress, "percentage", 0.0),
    }


@dataclass
class Job:
    """One background job, of any type."""

    id: str
    #: Which kind of work this job is doing, matching the ``jobs`` table's
    #: discriminator, e.g. ``"clean_match"`` or ``"library_import"``.
    #: Required since inKey's file-based match, the one it once defaulted to,
    #: retired (CLEAN-14): a job that does not say what it is cannot be named
    #: in Activity or the status strip.
    type: str
    state: JobState = JobState.QUEUED
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    progress: Optional[ProgressInfo] = None
    #: What a job produced, for a job type that produces something to read
    #: back. A refresh preview's diff was the first (LIBRARY-10). Deliberately
    #: absent from :meth:`to_status_dict`: that payload is polled, and for every
    #: job in the list, so a diff carrying hundreds of examples would be sent
    #: over and over to render a progress bar. It is served from
    #: ``GET /api/v1/jobs/{id}/results``, which a caller asks for once.
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, str]] = None
    demo: bool = False
    cancel_requested: bool = False

    def to_status_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "id": self.id,
            "type": self.type,
            "state": self.state.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "demo": self.demo,
        }
        if self.progress is not None:
            payload["progress"] = progress_to_dict(self.progress)
        if self.error is not None:
            payload["error"] = self.error
        return payload


# Progress ticks arrive per track; a run over a few thousand tracks would mean
# a few thousand database writes for information that is superseded moments
# later. State transitions are always persisted; progress is sampled.
_PROGRESS_PERSIST_INTERVAL_SECONDS = 1.0


class JobStore:
    """Thread-safe job registry.

    In-memory state is the hot path that status polling and SSE read. When a
    job repository is available, records are also written through to the
    database so job history survives an engine restart (DEC-007). Persistence
    is best-effort: a database problem must never fail a running job.
    """

    def __init__(
        self,
        job_repository: Optional[Any] = None,
        job_repository_provider: Optional[Callable[[], Any]] = None,
    ) -> None:
        """Initialize the store.

        Args:
            job_repository: Repository for durable job records. Optional —
                without one the store is purely in-memory, which is what tests
                and any non-persistent embedding get.
            job_repository_provider: Resolved on first use. The engine's job
                store is built at import time, before services are
                bootstrapped, so the repository cannot be passed in directly.
        """
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
        self._controllers: Dict[str, Any] = {}
        self._repository = job_repository
        self._repository_provider = job_repository_provider
        self._repository_resolved = job_repository is not None
        self._last_progress_persist: Dict[str, float] = {}

    def _get_repository(self) -> Optional[Any]:
        """Return the repository, resolving it once if a provider was given."""
        if self._repository_resolved:
            return self._repository
        self._repository_resolved = True
        if self._repository_provider is not None:
            try:
                self._repository = self._repository_provider()
            except Exception:  # noqa: BLE001 — persistence is best-effort
                self._repository = None
        return self._repository

    def _persist(self, job: Job, *, force: bool) -> None:
        """Write a job record through to the database, best-effort.

        Args:
            force: Persist regardless of the progress sampling interval. Set
                for state transitions, which must never be dropped.
        """
        repository = self._get_repository()
        if repository is None:
            return

        if not force:
            now = time.monotonic()
            last = self._last_progress_persist.get(job.id, 0.0)
            if now - last < _PROGRESS_PERSIST_INTERVAL_SECONDS:
                return
            self._last_progress_persist[job.id] = now

        try:
            from cuepoint.persistence.job_repository import JobRecord

            repository.save(
                JobRecord(
                    id=job.id,
                    type=job.type,
                    state=job.state.value,
                    demo=job.demo,
                    progress=progress_to_dict(job.progress)
                    if job.progress is not None
                    else None,
                    error=job.error,
                    created_at=job.created_at,
                    updated_at=job.updated_at,
                )
            )
        except Exception:  # noqa: BLE001 — a job record must not fail a job
            return

    def register_controller(self, job_id: str, controller: Any) -> None:
        with self._lock:
            self._controllers[job_id] = controller

    def unregister_controller(self, job_id: str) -> None:
        with self._lock:
            self._controllers.pop(job_id, None)

    def request_cancel(self, job_id: str) -> Job:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)
            if job.state in (
                JobState.SUCCEEDED,
                JobState.FAILED,
                JobState.CANCELLED,
            ):
                return job
            job.cancel_requested = True
            job.updated_at = _utc_now()
            controller = self._controllers.get(job_id)
        self._persist(job, force=True)
        if controller is not None:
            controller.cancel()
        return job

    def create_job(
        self,
        *,
        job_type: str,
        demo: bool = False,
        runner: Callable[[Job], None],
        exclusive: bool = False,
        conflicts_with: Sequence[str] = (),
    ) -> Job:
        """Register a job of any type and start it on a background thread.

        The lifecycle — queued, running, terminal, persisted, cancellable — is
        the same for every type; only the discriminator differs.

        Args:
            job_type: The ``jobs`` table discriminator, e.g. ``"clean_match"``
                or ``"library_import"``.
            demo: Whether this is a demo run, which the renderer labels.
            runner: Called on the worker thread with the job. It may set a
                terminal state itself; :meth:`_run_job` only supplies one when
                the runner did not.
            exclusive: Refuse if a job of this type is already active. Checked
                and acted on **under the same lock** that registers the job:
                asking the store and then creating would let two requests
                arriving together both see an idle store, and two concurrent
                imports would interleave their writes to the same tables.
            conflicts_with: Other job types that must also not be active. Same
                lock, same reason, one step further: mutual exclusion within a
                type stops two imports, and does nothing about an import and a
                refresh running together — which write the same tables just as
                badly. Only consulted when ``exclusive``, because a job that
                does not mind a twin has no business minding a cousin.

        Raises:
            JobTypeBusyError: If ``exclusive`` and a job of this type or of a
                conflicting type is already active. The error names the type
                actually holding the library, not the one that was asked for.
        """
        job = Job(id=str(uuid.uuid4()), type=job_type, demo=demo)
        blocking = {job_type, *conflicts_with}
        with self._lock:
            if exclusive:
                for existing in self._jobs.values():
                    if (
                        existing.type in blocking
                        and existing.state.value in _ACTIVE_STATES
                    ):
                        raise JobTypeBusyError(existing.type, existing.id)
            self._jobs[job.id] = job
        self._persist(job, force=True)

        thread = threading.Thread(
            target=self._run_job,
            args=(job, runner),
            daemon=True,
            name=f"{job_type}-job-{job.id[:8]}",
        )
        thread.start()
        return job

    def list_all(self) -> List[Job]:
        """Return a snapshot of every job this process knows about.

        A copy taken under the lock: callers iterate outside it, and a job
        finishing mid-iteration must not change the list under them.
        """
        with self._lock:
            return list(self._jobs.values())

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def _run_job(self, job: Job, runner: Callable[[Job], None]) -> None:
        self._update(job, state=JobState.RUNNING)
        try:
            runner(job)
            # Decided under the lock, written after it: ``_update`` takes the
            # same lock, which is not re-entrant, and calling it from in here
            # locked the whole store for good (CLEAN-14).
            with self._lock:
                ended = job.state in (
                    JobState.FAILED,
                    JobState.SUCCEEDED,
                    JobState.CANCELLED,
                )
                cancelled = job.cancel_requested
            if ended:
                return
            if cancelled:
                self._update(
                    job,
                    state=JobState.CANCELLED,
                    error={
                        "code": "JOB_CANCELLED",
                        "message": "Cancelled by user",
                    },
                )
                return
            if job.state not in (JobState.FAILED, JobState.SUCCEEDED):
                self._update(job, state=JobState.SUCCEEDED)
        except Exception as exc:  # noqa: BLE001 — surface to API client
            self._update(
                job,
                state=JobState.FAILED,
                error={"code": "JOB_FAILED", "message": str(exc)},
            )
        finally:
            self.unregister_controller(job.id)

    def report_progress(self, job: Job, progress: ProgressInfo) -> None:
        """Record a progress tick from a runner.

        The public form of :meth:`_update` for progress alone. A runner outside
        this module should not have to reach for a private method to say how far
        it has got, and should not be able to change a job's state by accident
        while doing so.
        """
        self._update(job, progress=progress)

    def finish(
        self,
        job: Job,
        *,
        state: JobState,
        error: Optional[Dict[str, str]] = None,
        result: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Set a job's terminal state, and what it produced, from its runner.

        A runner that ends a job itself — an import that honoured a cancel, for
        instance — needs to say so before returning, because :meth:`_run_job`
        treats an unset state as success.

        ``result`` is set in the same call rather than a second one so a caller
        watching for the terminal state never sees it arrive before the answer
        it is waiting for.
        """
        self._update(job, state=state, error=error, result=result)

    def _update(
        self,
        job: Job,
        *,
        state: Optional[JobState] = None,
        progress: Optional[ProgressInfo] = None,
        error: Optional[Dict[str, str]] = None,
        result: Optional[Dict[str, Any]] = None,
    ) -> None:
        with self._lock:
            if state is not None:
                job.state = state
            if progress is not None:
                job.progress = progress
            if error is not None:
                job.error = error
            if result is not None:
                job.result = result
            job.updated_at = _utc_now()

        # Outside the lock: the in-memory update is what callers wait on, and a
        # database write must not hold up status polling or SSE.
        self._persist(job, force=state is not None or error is not None)


def _ensure_services() -> None:
    global _services_bootstrapped
    with _bootstrap_lock:
        if _services_bootstrapped:
            return
        from cuepoint.services.bootstrap import bootstrap_services

        bootstrap_services()
        _services_bootstrapped = True
