#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library's waveform analysis as a background job (WAVE-03, DEC-116).

:mod:`cuepoint.services.waveform_analysis_service` decides what a run analyses
and in which order; this decides when one runs, and what stops it. One
:class:`AnalysisCoordinator` per job store holds the analysis's state: the
running job, the queue of requested tracks, and whether a whole-library run is
owed once the running one ends.

When a run starts
-----------------
- **After every whole-library file check,** beside the artwork scan, and that
  run also ``stat``s every analysed file (:func:`analysis_after_file_check`).
- **When a job it stepped aside for ends,** however it ended (below).
- **At engine start, 30 seconds after the engine is serving,** when the
  analysis is not paused, there is a decoder, and the last check found present
  tracks with no row that counts (:func:`schedule_launch_analysis`). This reads
  only what that check found; it checks nothing, so DEC-073's refusal to check
  at launch stands.
- **On Resume.**
- **After "Delete waveform data",** unless paused (WAVE-05).
- **On a request** (:func:`request_analysis`), even while paused: a run of the
  requested tracks only. A request while a run goes joins its queue at the
  front.

What stops it
-------------
- **It steps aside** for every job in :data:`STEPS_ASIDE_FOR`: an import and a
  refresh apply rewrite the library, a file check decides which files may be
  opened, and a tag write or restore rewrites the files themselves. When one
  starts, a running analysis is asked to stop: it finishes the files in flight
  and ends as cancelled, with the reason ``stepped_aside``. It refuses to start
  beside one, and when the last of them ends the analysis starts again. None of
  them ever waits for it: it may have hours left to run.
- **Pause** records ``waveforms.analysis_paused`` in the engine's settings and
  stops a running job with the reason ``paused``. The setting persists, so a
  paused analysis stays paused across a restart; Resume clears it and starts
  a run.
- **"Delete waveform data"** stops a running job with the reason
  ``data_deleted``, waits for the files in flight, empties the store, and
  starts a run again unless paused. Nothing starts while it deletes, so no
  row lands after the store was emptied.
- **The status strip's Stop is Pause.** A cancel the settings did not record
  would leave a job the next start resumes anyway, so a cancel of this job,
  from any route, is a pause and is named for what it does.

Both observe the job store (:meth:`JobStore.add_listeners`), so no job it gives
way to needs to know it exists.
"""

from __future__ import annotations

import logging
import threading
import time
import weakref
from collections import OrderedDict
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Iterable, List, Optional, Tuple

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.data.audio_decode import REASON_DECODER_MISSING
from cuepoint.engine.file_check_jobs import JOB_TYPE_FILE_CHECK
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.library_refresh import JOB_TYPE_LIBRARY_REFRESH_APPLY
from cuepoint.engine.tag_write_jobs import JOB_TYPE_TAG_RESTORE, JOB_TYPE_TAG_WRITE
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.models.waveform_analysis import (
    ANALYSIS_IDLE,
    ANALYSIS_PAUSED,
    ANALYSIS_RUNNING,
    ANALYSIS_UNAVAILABLE,
    STOP_DATA_DELETED,
    STOP_PAUSED,
    STOP_STEPPED_ASIDE,
    STOP_UNAVAILABLE,
    AnalysisStatus,
    RunProgress,
    WaveformDataDeleted,
    WorkPlan,
)

if TYPE_CHECKING:
    from cuepoint.services.interfaces import IWaveformAnalysisService

_logger = logging.getLogger(__name__)

#: The ``jobs`` table discriminator, and what the status strip keys its label off.
JOB_TYPE_WAVEFORM_ANALYSIS = "waveform_analysis"

#: The jobs the analysis steps aside for, and refuses to start beside.
STEPS_ASIDE_FOR: Tuple[str, ...] = (
    JOB_TYPE_LIBRARY_IMPORT,
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
    JOB_TYPE_FILE_CHECK,
    JOB_TYPE_TAG_WRITE,
    JOB_TYPE_TAG_RESTORE,
)

#: What the status strip says while it runs.
PROGRESS_MESSAGE = "Analysing waveforms"

#: The engine setting Pause records.
SETTING_PAUSED = "waveforms.analysis_paused"

#: How long after the engine starts serving the launch run may start.
LAUNCH_DELAY_SECONDS = 30.0

#: Requested tracks remembered at once; beyond it, the oldest is dropped.
MAX_REQUESTS = 200

#: How long a count of the library answers the status route while nothing new
#: has been analysed. The Health view asks every two seconds, and at 50,000
#: tracks a count is two queries over both databases.
STATUS_COUNT_SECONDS = 5.0

#: What started a run, as Activity records it. A run that comes back after a job
#: it stepped aside for is named by that job's type.
TRIGGER_FILE_CHECK = "file_check"
TRIGGER_LAUNCH = "launch"
TRIGGER_RESUME = "resume"
TRIGGER_REQUEST = "request"
TRIGGER_DATA_DELETED = "data_deleted"

#: How long "Delete waveform data" waits for a running job to finish the files
#: it is decoding. A file takes a second or two; past this, the store is
#: emptied anyway, and a file finishing later is a correct waveform of it.
DELETE_WAIT_SECONDS = 30.0

#: Why a cancel ended the job, beside ``JOB_CANCELLED``.
ERROR_DECODER_UNAVAILABLE = "WAVEFORM_DECODER_UNAVAILABLE"
ERROR_ANALYSIS_FAILED = "WAVEFORM_ANALYSIS_FAILED"


class AnalysisSettings:
    """The analysis's one persisted setting, through the engine's config."""

    def __init__(self, config: Callable[[], Any]) -> None:
        """Read and write through ``config()``, an ``IConfigService``."""
        self._config = config

    def paused(self) -> bool:
        """True when the analysis is paused. Unreadable reads as not paused."""
        try:
            return bool(self._config().get(SETTING_PAUSED, False))
        except Exception:  # noqa: BLE001 — a setting must not stop the engine
            _logger.warning("[waveforms] the pause setting could not be read")
            return False

    def set_paused(self, paused: bool) -> None:
        """Record the setting, and save it so it outlives the engine.

        Raises:
            ConfigurationError: If the settings file cannot be written.
        """
        config = self._config()
        config.set(SETTING_PAUSED, bool(paused))
        config.save()


@dataclass
class _Owed:
    """A whole-library run asked for and not yet satisfied."""

    trigger: str
    verify: bool


class _Control:
    """One run's control: what its workers ask, and its job's controller."""

    def __init__(
        self,
        coordinator: "AnalysisCoordinator",
        whole: bool,
        verify: bool,
        trigger: str,
    ) -> None:
        self._coordinator = coordinator
        self.whole = whole
        self.verify_files = verify
        self.trigger = trigger
        self.job: Optional[Job] = None
        #: Set once the run has ended and the coordinator has let it go.
        self.ended = threading.Event()
        #: Why it must stop; set under the coordinator's lock.
        self.stop: Optional[str] = None
        #: A whole-library run asked for while this one goes, not yet satisfied.
        self.owed: Optional[_Owed] = None

    # AnalysisControl -------------------------------------------------------

    def next_request(self) -> Optional[int]:
        return self._coordinator._take_request()

    def pending_requests(self) -> int:
        return self._coordinator._pending_requests()

    def whole_library(self) -> bool:
        return self.whole

    def verify(self) -> bool:
        return self.verify_files

    def counted(self) -> None:
        self._coordinator._counted(self)

    def stop_reason(self) -> Optional[str]:
        job = self.job
        if self.stop is None and job is not None and job.cancel_requested:
            # A cancel that reached the job before its controller was
            # registered: the strip's Stop, so a pause.
            self.cancel()
        return self.stop

    # The job store's controller --------------------------------------------

    def cancel(self) -> None:
        """A cancel from any route: the status strip's Stop is Pause."""
        self._coordinator._paused_from_cancel(self)


class AnalysisCoordinator:
    """The analysis over one job store."""

    def __init__(
        self,
        store: JobStore,
        *,
        service: Callable[[], "IWaveformAnalysisService"],
        settings: AnalysisSettings,
        workers: Optional[int] = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Coordinate the analysis on ``store``.

        Args:
            store: The engine's job store, observed for the jobs the analysis
                steps aside for.
            service: Answers the ``IWaveformAnalysisService``, asked at each use.
            settings: The pause setting.
            workers: Files decoded at once; the service's default when None.
            clock: Times the status route's count.
        """
        self._store_ref = weakref.ref(store)
        self._service = service
        self._settings = settings
        self._workers = workers
        self._clock = clock
        self._lock = threading.Lock()
        self._requests: "OrderedDict[int, None]" = OrderedDict()
        self._job: Optional[Job] = None
        self._control: Optional[_Control] = None
        self._restart_for_requests = False
        self._decoder_refused = False
        #: "Delete waveform data" calls under way; nothing starts while any is.
        self._deleting = 0
        self._progress: Optional[RunProgress] = None
        self._count: Optional[Tuple[float, WorkPlan]] = None
        store.add_listeners(started=self._job_started, ended=self._job_ended)

    @property
    def store(self) -> JobStore:
        store = self._store_ref()
        if store is None:
            raise RuntimeError("The job store has gone")
        return store

    # --------------------------------------------------------- public API

    def start(self, trigger: str, *, verify: bool = False) -> Optional[Job]:
        """Start a whole-library run, or make sure the running one covers it.

        Nothing starts while paused, without a decoder, or beside a job the
        analysis steps aside for: that job starts it again as it ends. A run
        already going is told to count the library again before it ends, and to
        ``stat`` every analysed file when ``verify``.

        Returns:
            The job doing the work, or None.
        """
        if self._settings.paused() or not self.decoder_available():
            return None
        with self._lock:
            if self._deleting:
                # The deletion starts a run itself once the store is empty.
                return None
            control = self._control
            if self._job is None or control is None:
                return self._start_locked(True, verify, trigger)
            control.owed = _Owed(
                trigger, verify or bool(control.owed and control.owed.verify)
            )
            if control.whole and control.stop is None:
                control.verify_files = control.verify_files or verify
                return self._job
            return None

    def request(self, track_ids: Iterable[int]) -> Optional[Job]:
        """Put tracks at the front of the queue, and see they are analysed.

        A repeat moves to the front; beyond :data:`MAX_REQUESTS` the oldest is
        dropped. With no run going, one starts for the requests only, even while
        paused: a track a person is looking at is one file, and pausing is
        about background load.
        """
        wanted: List[int] = []
        for value in track_ids:
            if isinstance(value, bool):
                continue
            track_id = int(value)
            if track_id > 0 and track_id not in wanted:
                wanted.append(track_id)
        if not wanted or not self.decoder_available():
            return None
        with self._lock:
            for track_id in reversed(wanted):
                self._requests.pop(track_id, None)
                self._requests[track_id] = None
                self._requests.move_to_end(track_id, last=False)
            while len(self._requests) > MAX_REQUESTS:
                self._requests.popitem(last=True)
            if self._deleting:
                return None
            if self._job is None:
                return self._start_locked(False, False, TRIGGER_REQUEST)
            if self._control is not None and self._control.stop is not None:
                self._restart_for_requests = True
                return None
            return self._job

    def step_aside(self) -> bool:
        """Stop a running analysis for a job it gives way to; True when one ran."""
        with self._lock:
            job, control = self._job, self._control
            if job is None or control is None:
                return False
            if control.stop is None:
                control.stop = STOP_STEPPED_ASIDE
        self._request_cancel(job)
        return True

    def pause(self) -> AnalysisStatus:
        """Pause: record the setting, and stop a running job.

        Raises:
            ConfigurationError: If the setting cannot be saved. Nothing is
                stopped then: a pause that would not survive a restart is not
                the pause asked for.
        """
        self._settings.set_paused(True)
        with self._lock:
            job, control = self._job, self._control
            self._restart_for_requests = False
            if control is not None:
                control.owed = None
                if control.stop is None:
                    control.stop = STOP_PAUSED
        if job is not None:
            self._request_cancel(job)
        return self.status()

    def resume(self) -> AnalysisStatus:
        """Resume: clear the setting and start a run.

        Raises:
            ConfigurationError: If the setting cannot be saved.
        """
        self._settings.set_paused(False)
        self.start(TRIGGER_RESUME)
        return self.status()

    def delete_data(
        self, *, wait_seconds: float = DELETE_WAIT_SECONDS
    ) -> WaveformDataDeleted:
        """Empty the store, and start the analysis again unless paused.

        A running job is stopped with the reason ``data_deleted`` and waited
        for, so nothing it has in flight is written after the store is
        emptied. Nothing starts while the store is being emptied. Requests
        stay queued: a track a person is looking at is still wanted.

        Raises:
            WaveformStoreError: If the store cannot be emptied. The analysis
                then starts again as it would have.
        """
        with self._lock:
            self._deleting += 1
            job, control = self._job, self._control
            self._restart_for_requests = False
            if control is not None:
                control.owed = None
                if control.stop is None:
                    control.stop = STOP_DATA_DELETED
        try:
            if job is not None and control is not None:
                self._request_cancel(job)
                if not control.ended.wait(wait_seconds):
                    _logger.warning(
                        "[waveforms] the analysis had not stopped after %.0f s;"
                        " deleting the waveform data anyway",
                        wait_seconds,
                    )
            result = self._service().delete_data()
        finally:
            with self._lock:
                self._deleting -= 1
                self._count = None
            self._start_after_deletion()
        return result

    def _start_after_deletion(self) -> None:
        """A whole-library run unless paused; otherwise the requests, if any."""
        if self.start(TRIGGER_DATA_DELETED) is not None:
            return
        if not self.decoder_available():
            return
        with self._lock:
            if self._job is None and not self._deleting and self._requests:
                self._start_locked(False, False, TRIGGER_REQUEST)

    def paused(self) -> bool:
        """True when the analysis is paused, as the setting says."""
        return self._settings.paused()

    def start_at_launch(self) -> Optional[Job]:
        """The launch run: only unpaused, with a decoder, and with work waiting."""
        if self._settings.paused() or not self.decoder_available():
            return None
        try:
            plan = self._service().plan(limit=0, ordered=False)
        except Exception as exc:  # noqa: BLE001 — never a reason not to run
            _logger.warning("[waveforms] the launch count failed: %s", exc)
            return None
        if plan.pending_total == 0:
            return None
        _logger.info(
            "[waveforms] %d present files have no waveform; analysing them",
            plan.pending_total,
        )
        return self.start(TRIGGER_LAUNCH)

    def decoder_available(self) -> bool:
        """True when there is a decoder, and it has not refused to analyse."""
        if self._decoder_refused:
            return False
        try:
            return bool(self._service().decoder_available())
        except Exception:  # noqa: BLE001 — no service, no analysis
            return False

    def status(self) -> AnalysisStatus:
        """The analysis as a whole, with its counts."""
        available = self.decoder_available()
        paused = self._settings.paused()
        with self._lock:
            job = self._job
            progress = self._progress if job is not None else None
        count = self._library_count()
        if not available:
            state, reason = ANALYSIS_UNAVAILABLE, REASON_DECODER_MISSING
        elif paused:
            state, reason = ANALYSIS_PAUSED, None
        elif job is not None:
            state, reason = ANALYSIS_RUNNING, None
        else:
            state, reason = ANALYSIS_IDLE, None
        whole = progress is not None and progress.whole_library
        try:
            store_bytes = int(self._service().store_bytes())
        except Exception as exc:  # noqa: BLE001 — a status must answer
            _logger.warning("[waveforms] the store's size could not be read: %s", exc)
            store_bytes = 0
        return AnalysisStatus(
            state=state,
            paused=paused,
            job_id=job.id if job is not None else None,
            present=count.present,
            analysed=count.analysed,
            failed=count.failed,
            rate_per_hour=progress.rate_per_hour if whole and progress else None,
            eta_seconds=progress.eta_seconds if whole and progress else None,
            reason=reason,
            store_bytes=store_bytes,
        )

    # ------------------------------------------------------- the job store

    def _job_started(self, job: Job) -> None:
        if job.type in STEPS_ASIDE_FOR:
            if self.step_aside():
                _logger.info(
                    "[waveforms] the analysis steps aside for the %s job", job.type
                )

    def _job_ended(self, job: Job) -> None:
        if job.type in STEPS_ASIDE_FOR:
            # Refused while another of them still runs; the last to end starts it.
            self.start(job.type)

    def _request_cancel(self, job: Job) -> None:
        try:
            self.store.request_cancel(job.id)
        except (KeyError, RuntimeError):
            pass

    # ---------------------------------------------------------- the run

    def _start_locked(self, whole: bool, verify: bool, trigger: str) -> Optional[Job]:
        """Create the job. Under the lock, with no job running."""
        control = _Control(self, whole, verify, trigger)

        def runner(job: Job) -> None:
            self._run(job, control)

        try:
            job = self.store.create_job(
                job_type=JOB_TYPE_WAVEFORM_ANALYSIS,
                runner=runner,
                exclusive=True,
                conflicts_with=STEPS_ASIDE_FOR,
            )
        except JobTypeBusyError as exc:
            _logger.info(
                "[waveforms] the analysis waits for the %s job now running",
                exc.job_type,
            )
            return None
        control.job = job
        self._job, self._control = job, control
        self._progress = None
        return job

    def _run(self, job: Job, control: _Control) -> None:
        started = time.monotonic()
        self.store.register_controller(job.id, control)

        def on_progress(progress: RunProgress) -> None:
            with self._lock:
                if self._control is control:
                    self._progress = progress
            self.store.report_progress(
                job,
                ProgressInfo(
                    completed_tracks=progress.completed,
                    total_tracks=progress.total,
                    matched_count=progress.analysed,
                    unmatched_count=progress.failed,
                    elapsed_time=time.monotonic() - started,
                    eta_seconds=progress.eta_seconds,
                    status_message=PROGRESS_MESSAGE,
                ),
            )

        try:
            service = self._service()
            result = service.run(
                control,
                trigger=control.trigger,
                on_progress=on_progress,
                workers=self._workers,
            )
        except CuePointException as exc:
            _logger.warning("[waveforms] the analysis failed: %s", exc)
            self.store.finish(
                job,
                state=JobState.FAILED,
                error={
                    "code": exc.error_code or ERROR_ANALYSIS_FAILED,
                    "message": exc.message,
                },
            )
        except Exception as exc:  # noqa: BLE001 — surfaced to the API client
            _logger.warning("[waveforms] the analysis failed: %s", exc, exc_info=True)
            self.store.finish(
                job,
                state=JobState.FAILED,
                error={"code": ERROR_ANALYSIS_FAILED, "message": str(exc)},
            )
        else:
            service.record_run(result)
            payload = result.to_dict()
            if result.stopped is None:
                self.store.finish(job, state=JobState.SUCCEEDED, result=payload)
            elif result.stopped == STOP_UNAVAILABLE:
                self._decoder_refused = True
                self.store.finish(
                    job,
                    state=JobState.FAILED,
                    error={
                        "code": ERROR_DECODER_UNAVAILABLE,
                        "message": result.summary_line(),
                    },
                    result=payload,
                )
            else:
                self.store.finish(
                    job,
                    state=JobState.CANCELLED,
                    error={
                        "code": "JOB_CANCELLED",
                        "message": result.summary_line(),
                        "reason": result.stopped,
                    },
                    result=payload,
                )
        finally:
            try:
                self._finished(job, control)
            finally:
                control.ended.set()

    def _finished(self, job: Job, control: _Control) -> None:
        """Start what was owed once the job has ended."""
        with self._lock:
            if self._job is not job:
                return
            self._job, self._control = None, None
            self._count = None
            owed = control.owed
            for_requests = self._restart_for_requests
            self._restart_for_requests = False
            if self._decoder_refused:
                self._requests.clear()
                return
            if self._deleting:
                # The deletion starts what comes next once the store is empty.
                return
            if owed is not None and not self._settings.paused():
                self._start_locked(True, owed.verify, owed.trigger)
            elif self._requests and (control.stop != STOP_PAUSED or for_requests):
                self._start_locked(False, False, TRIGGER_REQUEST)

    # --------------------------------------------- what the run asks

    def _take_request(self) -> Optional[int]:
        with self._lock:
            if not self._requests:
                return None
            track_id, _ = self._requests.popitem(last=False)
            return track_id

    def _pending_requests(self) -> int:
        with self._lock:
            return len(self._requests)

    def _counted(self, control: _Control) -> None:
        with self._lock:
            control.owed = None

    def _paused_from_cancel(self, control: _Control) -> None:
        with self._lock:
            if control.stop is not None:
                return
            control.stop = STOP_PAUSED
            control.owed = None
            self._restart_for_requests = False
        try:
            self._settings.set_paused(True)
        except Exception as exc:  # noqa: BLE001 — the run still stops
            _logger.warning("[waveforms] the pause could not be saved: %s", exc)

    # -------------------------------------------------------- the count

    def _library_count(self) -> WorkPlan:
        """The library's counts, at most :data:`STATUS_COUNT_SECONDS` old.

        A run's end forgets the last count, so the status after it is exact.
        """
        now = self._clock()
        with self._lock:
            cached = self._count
        if cached is not None and now - cached[0] < STATUS_COUNT_SECONDS:
            return cached[1]
        try:
            count = self._service().plan(limit=0, ordered=False)
        except Exception as exc:  # noqa: BLE001 — a status must answer
            _logger.warning("[waveforms] the library could not be counted: %s", exc)
            return cached[1] if cached is not None else WorkPlan(0, 0, 0)
        with self._lock:
            self._count = (now, count)
        return count


# ------------------------------------------------------------------ registry

_COORDINATORS: "weakref.WeakKeyDictionary[JobStore, AnalysisCoordinator]" = (
    weakref.WeakKeyDictionary()
)
_REGISTRY_LOCK = threading.Lock()


def _default_service() -> "IWaveformAnalysisService":
    from cuepoint.engine.jobs import _ensure_services
    from cuepoint.services.interfaces import IWaveformAnalysisService
    from cuepoint.utils.di_container import get_container

    _ensure_services()
    return get_container().resolve(IWaveformAnalysisService)  # type: ignore[type-abstract]


def _default_config() -> Any:
    from cuepoint.engine.jobs import _ensure_services
    from cuepoint.services.interfaces import IConfigService
    from cuepoint.utils.di_container import get_container

    _ensure_services()
    return get_container().resolve(IConfigService)  # type: ignore[type-abstract]


def bind(
    store: JobStore,
    *,
    service: Optional[Callable[[], "IWaveformAnalysisService"]] = None,
    settings: Optional[AnalysisSettings] = None,
    workers: Optional[int] = None,
    clock: Callable[[], float] = time.monotonic,
) -> AnalysisCoordinator:
    """The analysis over ``store``, made with these parts if it is not made yet."""
    with _REGISTRY_LOCK:
        existing = _COORDINATORS.get(store)
        if existing is not None:
            return existing
        made = AnalysisCoordinator(
            store,
            service=service or _default_service,
            settings=settings or AnalysisSettings(_default_config),
            workers=workers,
            clock=clock,
        )
        _COORDINATORS[store] = made
        return made


def coordinator(store: JobStore) -> AnalysisCoordinator:
    """The analysis over ``store``, made with the engine's services."""
    return bind(store)


def analysis_after_file_check(store: JobStore, trigger: str) -> Optional[Job]:
    """Start the analysis after a whole-library file check, ``stat``ing every file.

    Never raises: the check it follows has already finished.
    """
    try:
        return coordinator(store).start(TRIGGER_FILE_CHECK, verify=True)
    except Exception as exc:  # noqa: BLE001 — must not fail a finished check
        _logger.warning(
            "[waveforms] could not start the analysis after the %s check: %s",
            trigger,
            exc,
        )
        return None


def request_analysis(store: JobStore, track_ids: Iterable[int]) -> Optional[Job]:
    """Analyse these tracks first; see :meth:`AnalysisCoordinator.request`."""
    return coordinator(store).request(track_ids)


def pause_analysis(store: JobStore) -> AnalysisStatus:
    """Pause the analysis; see :meth:`AnalysisCoordinator.pause`."""
    return coordinator(store).pause()


def resume_analysis(store: JobStore) -> AnalysisStatus:
    """Resume the analysis; see :meth:`AnalysisCoordinator.resume`."""
    return coordinator(store).resume()


def delete_waveform_data(store: JobStore) -> WaveformDataDeleted:
    """Empty the store; see :meth:`AnalysisCoordinator.delete_data`."""
    return coordinator(store).delete_data()


def analysis_paused(store: JobStore) -> bool:
    """True when the analysis is paused; see :meth:`AnalysisCoordinator.paused`."""
    return coordinator(store).paused()


def analysis_status(store: JobStore) -> AnalysisStatus:
    """The analysis as a whole; see :meth:`AnalysisCoordinator.status`."""
    return coordinator(store).status()


def schedule_launch_analysis(
    store: JobStore, delay_seconds: float = LAUNCH_DELAY_SECONDS
) -> threading.Timer:
    """Start the launch run after ``delay_seconds``, if it is owed.

    The coordinator is made now, so a job the analysis steps aside for is
    observed from the engine's first request.
    """
    analysis = coordinator(store)

    def launch() -> None:
        try:
            analysis.start_at_launch()
        except Exception as exc:  # noqa: BLE001 — never a reason to stop
            _logger.warning("[waveforms] the launch analysis did not start: %s", exc)

    timer = threading.Timer(delay_seconds, launch)
    timer.daemon = True
    timer.name = "waveform-launch"
    timer.start()
    return timer


__all__ = (
    "AnalysisCoordinator",
    "AnalysisSettings",
    "DELETE_WAIT_SECONDS",
    "ERROR_ANALYSIS_FAILED",
    "ERROR_DECODER_UNAVAILABLE",
    "JOB_TYPE_WAVEFORM_ANALYSIS",
    "LAUNCH_DELAY_SECONDS",
    "MAX_REQUESTS",
    "PROGRESS_MESSAGE",
    "SETTING_PAUSED",
    "STEPS_ASIDE_FOR",
    "TRIGGER_DATA_DELETED",
    "TRIGGER_FILE_CHECK",
    "TRIGGER_LAUNCH",
    "TRIGGER_REQUEST",
    "TRIGGER_RESUME",
    "analysis_after_file_check",
    "analysis_paused",
    "analysis_status",
    "bind",
    "coordinator",
    "delete_waveform_data",
    "pause_analysis",
    "request_analysis",
    "resume_analysis",
    "schedule_launch_analysis",
)
