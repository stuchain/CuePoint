#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library's waveform analysis: what a run does (WAVE-03, DEC-116).

A run drains a queue rather than a list fixed when it started. Its workers ask
for the next file one at a time:

1. **A requested track first**, from the engine's queue (WAVE-06 asks for the
   track a person is looking at). Asked before every file, so a request waits
   for at most the files already being decoded, never for a chunk.
2. **Then the library's work, 200 files at a time.** When that buffer is empty
   the run counts the library again: the present files with no row that
   counts, in the analysis's order (Sets, then Collections, then the newest),
   leaving out every path the run has already taken. So a track imported while
   the run goes is analysed in the same run, and a run asked for again while it
   goes is already doing what was asked.
3. **Then, after a whole-library file check, every analysed file again**
   (``verify``), each only ``stat``ed unless it changed. The check records a
   size but no modified time, so a file rewritten at the same size is found
   here, and nowhere cheaper.

A run of requests only ends when its queue does. A whole-library run ends when
a count finds nothing left, and only then prunes the store rows whose path no
track has.

Stopping
--------
The engine stops a run by its control's stop reason: paused, or stepped aside
for an import, a refresh apply, a file check or a tag write. A worker finishes
the file it is decoding, every row written is committed as it is written, and
the run ends saying why. The decoder's own cancel is not used: a pause should
not throw away a file a second from done, and the engine's exit ends the
decoders itself.

What a run reports
------------------
Analysed, failed, "not found now" and remaining, at most every half second.
Remaining is recounted at every refill and counted down in between, so it is
never more than one chunk from the truth. The rate is the files decoded an hour
over the last ten minutes, and the time left is the remaining files at that
rate.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import deque
from typing import Callable, Deque, Iterable, List, Optional, Protocol, Set

from cuepoint.data.audio_decode import ANALYSIS_VERSION
from cuepoint.models.waveform import (
    OUTCOME_CANCELLED,
    OUTCOME_CURRENT,
    OUTCOME_FAILED,
    OUTCOME_NOT_FOUND,
    OUTCOME_NOT_PRESENT,
    OUTCOME_READY,
    OUTCOME_UNAVAILABLE,
    STORED_READY,
    AnalysisOutcome,
)
from cuepoint.models.waveform_analysis import (
    STOP_CANCELLED,
    STOP_UNAVAILABLE,
    AnalysisRunResult,
    RunProgress,
    WaveformDataDeleted,
    WorkItem,
    WorkPlan,
)
from cuepoint.persistence.waveform_store import WaveformStore
from cuepoint.services.interfaces import (
    IActivityService,
    IWaveformAnalysisService,
    IWaveformService,
    IWaveformWorkRepository,
)

_logger = logging.getLogger(__name__)

#: Files taken from the library at a time, and counted again between.
REFILL = 200

#: How long the rate looks back.
RATE_WINDOW_SECONDS = 600.0

#: Too little to call a rate: fewer files, or a shorter look back.
_RATE_MIN_FILES = 2
_RATE_MIN_SECONDS = 10.0

#: How often progress is reported.
PROGRESS_INTERVAL_SECONDS = 0.5

#: The activity event every run records, once, whatever started it.
EVENT_WAVEFORMS_ANALYSED = "waveforms.analysed"

#: The activity event "Delete waveform data" records (WAVE-05).
EVENT_WAVEFORM_DATA_DELETED = "waveforms.data_deleted"


def default_workers(cpu_count: Optional[int] = None) -> int:
    """How many files are decoded at once: one on four cores, two on eight or more.

    Each decode is a separate ``mpv`` at lowered priority, which uses more than
    one core of its own; more workers would buy throughput with the fan noise
    and battery a background job should not spend (DEC-116).
    """
    cores = os.cpu_count() if cpu_count is None else cpu_count
    return min(2, max(1, int(cores or 1) // 4))


class AnalysisControl(Protocol):
    """What a run asks the engine, before every file."""

    def next_request(self) -> Optional[int]:
        """The next requested track, taken off the queue, or ``None``."""
        ...

    def pending_requests(self) -> int:
        """Requested tracks still queued."""
        ...

    def whole_library(self) -> bool:
        """True when the run analyses the library, not only requests.

        Asked again before every file: a run of requests becomes a
        whole-library run when one is asked for while it goes.
        """
        ...

    def verify(self) -> bool:
        """True when the run also ``stat``s every analysed file."""
        ...

    def counted(self) -> None:
        """Told after every count of the library, before its files are taken.

        A whole-library run asked for while this one goes is satisfied by any
        count after the asking, which sees the library as it is now. One asked
        for after the last count is not, and the engine starts it again.
        """
        ...

    def stop_reason(self) -> Optional[str]:
        """Why the run must stop now, or ``None`` to carry on."""
        ...


class RateWindow:
    """Events an hour over the last ten minutes."""

    def __init__(
        self,
        window_seconds: float = RATE_WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Count over ``window_seconds``, timed by ``clock``."""
        self._window = float(window_seconds)
        self._clock = clock
        self._started = clock()
        self._events: Deque[float] = deque()

    def add(self) -> None:
        """Count one event, now."""
        self._events.append(self._clock())

    def per_hour(self) -> Optional[float]:
        """The rate an hour, or ``None`` until there is enough to say."""
        now = self._clock()
        while self._events and self._events[0] < now - self._window:
            self._events.popleft()
        span = min(self._window, now - self._started)
        if len(self._events) < _RATE_MIN_FILES or span < _RATE_MIN_SECONDS:
            return None
        return len(self._events) * 3600.0 / span


class WaveformAnalysisService(IWaveformAnalysisService):
    """Plans and runs the library's analysis, and records each run."""

    def __init__(
        self,
        work_repository: IWaveformWorkRepository,
        store: WaveformStore,
        waveform_service: IWaveformService,
        activity_service: Optional[IActivityService] = None,
        *,
        analysis_version: int = ANALYSIS_VERSION,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Wire the service.

        Args:
            work_repository: The library's present files and paths.
            store: ``waveforms.db``.
            waveform_service: Analyses one file (WAVE-02).
            activity_service: Where each run is recorded. Without one, nothing
                is.
            analysis_version: The version whose rows count.
            clock: Times the rate and the progress reports.
        """
        self._work = work_repository
        self._store = store
        self._waveforms = waveform_service
        self._activity = activity_service
        self._version = int(analysis_version)
        self._clock = clock

    def decoder_available(self) -> bool:
        """True when there is a decoder to analyse with."""
        return self._waveforms.decoder_available()

    # --------------------------------------------------------------- plan

    def plan(
        self, exclude: Iterable[str] = (), limit: int = REFILL, *, ordered: bool = True
    ) -> WorkPlan:
        """The library's present files against the store, and what to analyse next.

        A row counts when it is of the current version and its size is the one
        the last check recorded; a check that recorded no size takes any row of
        the version. Tracks that share a path are counted each, and analysed
        once.

        Args:
            exclude: Paths a run has already taken, left out of ``pending`` and
                ``verify`` but still counted.
            limit: The most items ``pending`` and ``verify`` each hold. 0 counts
                only.
            ordered: Answer the items in the analysis's order. Counting needs no
                order, and is a query cheaper without it.
        """
        present = self._work.present_files(ordered=ordered)
        stored = self._store.current_files(self._version)
        skip: Set[str] = exclude if isinstance(exclude, set) else set(exclude)
        analysed = failed = pending_total = 0
        pending: List[WorkItem] = []
        verify: List[WorkItem] = []
        seen: Set[str] = set()
        for found in present:
            row = stored.get(found.path)
            counts = row is not None and (
                found.size_bytes is None or row.size_bytes == found.size_bytes
            )
            if counts:
                assert row is not None
                if row.state == STORED_READY:
                    analysed += 1
                else:
                    failed += 1
            if found.path in seen or found.path in skip:
                continue
            seen.add(found.path)
            item = WorkItem(found.track_id, found.path)
            if counts:
                if len(verify) < limit:
                    verify.append(item)
            else:
                pending_total += 1
                if len(pending) < limit:
                    pending.append(item)
        return WorkPlan(
            present=len(present),
            analysed=analysed,
            failed=failed,
            pending=tuple(pending),
            verify=tuple(verify),
            pending_total=pending_total,
        )

    # ---------------------------------------------------------------- run

    def run(
        self,
        control: AnalysisControl,
        *,
        trigger: str,
        on_progress: Optional[Callable[[RunProgress], None]] = None,
        workers: Optional[int] = None,
    ) -> AnalysisRunResult:
        """Run until the work, or the requests, run out, or ``control`` stops it.

        Raises:
            WaveformStoreError: If the store cannot be read or written. The
                files already analysed stay analysed.
        """
        return _Run(self, control, trigger, on_progress, self._clock).run(
            workers if workers is not None else default_workers()
        )

    def _analyse(self, track_id: int) -> AnalysisOutcome:
        return self._waveforms.analyse(track_id)

    # -------------------------------------------------------------- prune

    def prune(self) -> int:
        """Delete the store rows no track's path has; how many went.

        Never while the library has no track at all: an empty library is far
        more often a new or reset database than a decision to throw away hours
        of analysis, and a re-import would analyse it all again.
        """
        library = self._work.library_paths()
        if not library:
            return 0
        dead = [path for path in self._store.paths() if path not in library]
        return self._store.delete_paths(dead)

    # ------------------------------------------------------- the store's data

    def store_bytes(self) -> int:
        """What ``waveforms.db`` takes on disk now; never opens it."""
        return self._store.disk_bytes()

    def delete_data(self) -> WaveformDataDeleted:
        """Empty the store, give its space back, and record it in Activity once.

        Every waveform goes, ready and failed alike, so a file refused before is
        tried again. Stopping a run first, and starting the next, is the
        engine's (``engine/waveform_jobs.py``).

        Raises:
            WaveformStoreError: If the rows cannot be deleted.
        """
        before = self._store.disk_bytes()
        deleted = self._store.clear()
        result = WaveformDataDeleted(
            waveforms=deleted, freed_bytes=max(0, before - self._store.disk_bytes())
        )
        _logger.info(
            "[waveforms] deleted %d waveforms, freeing %d bytes",
            result.waveforms,
            result.freed_bytes,
        )
        if self._activity is not None:
            try:
                self._activity.record_event(
                    EVENT_WAVEFORM_DATA_DELETED,
                    result.summary_line(),
                    result.to_dict(),
                )
            except Exception as exc:  # noqa: BLE001 — the feed is best-effort
                _logger.warning("[waveforms] could not record the deletion: %s", exc)
        return result

    # ------------------------------------------------------------- record

    def record_run(self, result: AnalysisRunResult) -> None:
        """Record one run in Activity, once.

        A run of requests that found every request already analysed records
        nothing: it did nothing, and a person looking through their library
        would otherwise fill the feed with runs that only looked.
        """
        if self._activity is None:
            return
        if not result.whole_library and not result.did_anything:
            return
        try:
            self._activity.record_event(
                EVENT_WAVEFORMS_ANALYSED, result.summary_line(), result.to_dict()
            )
        except Exception as exc:  # noqa: BLE001 — the feed is best-effort
            _logger.warning("[waveforms] could not record the run: %s", exc)


class _Run:
    """One run's state, shared by its workers under one lock."""

    def __init__(
        self,
        service: WaveformAnalysisService,
        control: AnalysisControl,
        trigger: str,
        on_progress: Optional[Callable[[RunProgress], None]],
        clock: Callable[[], float],
    ) -> None:
        self._service = service
        self._control = control
        self._trigger = trigger
        self._on_progress = on_progress
        self._clock = clock
        self._lock = threading.Lock()
        self._buffer: Deque[WorkItem] = deque()
        self._visited: Set[str] = set()
        self._exhausted = False
        self._whole = False
        self._stopped: Optional[str] = None
        self._error: Optional[BaseException] = None
        self._counted = WorkPlan(0, 0, 0)
        self._since_count = 0
        self._requests_done = 0
        self._analysed = 0
        self._failed = 0
        self._not_found = 0
        self._up_to_date = 0
        self._decode_errors = 0
        self._rate = RateWindow(clock=clock)
        self._last_report = float("-inf")

    # ----------------------------------------------------------- dispatch

    def _next(self) -> Optional[int]:
        """The next track to analyse, or ``None`` when this worker is done."""
        with self._lock:
            if self._stopped is not None or self._error is not None:
                return None
            reason = self._control.stop_reason()
            if reason is not None:
                self._stopped = reason
                return None
            requested = self._control.next_request()
            if requested is not None:
                self._requests_done += 1
                return int(requested)
            if not self._control.whole_library():
                return None
            self._whole = True
            if not self._buffer and not self._exhausted:
                self._refill()
            return self._buffer.popleft().track_id if self._buffer else None

    def _refill(self) -> None:
        """Count the library again and take the next files. Under the lock."""
        self._control.counted()
        plan = self._service.plan(self._visited, REFILL)
        self._counted, self._since_count = plan, 0
        items = plan.pending or (plan.verify if self._control.verify() else ())
        if not items:
            self._exhausted = True
            return
        self._buffer.extend(items)
        self._visited.update(item.path for item in items)

    # -------------------------------------------------------------- work

    def _work(self) -> None:
        while True:
            track_id = self._next()
            if track_id is None:
                return
            try:
                outcome = self._service._analyse(track_id)
            except BaseException as exc:  # noqa: BLE001 — raised by run()
                with self._lock:
                    if self._error is None:
                        self._error = exc
                return
            with self._lock:
                self._record(outcome)
            self._report()

    def _record(self, outcome: AnalysisOutcome) -> None:
        """Count one file's outcome. Under the lock."""
        kind = outcome.outcome
        if kind == OUTCOME_READY:
            self._analysed += 1
            self._since_count += 1
            self._decode_errors += outcome.decode_errors
            self._rate.add()
        elif kind == OUTCOME_FAILED:
            self._failed += 1
            self._since_count += 1
            self._rate.add()
        elif kind == OUTCOME_CURRENT:
            self._up_to_date += 1
        elif kind in (OUTCOME_NOT_FOUND, OUTCOME_NOT_PRESENT):
            self._not_found += 1
        elif kind == OUTCOME_UNAVAILABLE:
            # The decoder cannot analyse anything, so no file is blamed and no
            # other file is tried.
            if self._stopped is None:
                self._stopped = STOP_UNAVAILABLE
        elif kind == OUTCOME_CANCELLED:
            if self._stopped is None:
                self._stopped = STOP_CANCELLED

    # ---------------------------------------------------------- progress

    def _snapshot(self) -> RunProgress:
        """What to report now. Under the lock."""
        rate = self._rate.per_hour()
        if self._whole:
            counted = self._counted
            remaining = max(0, counted.remaining - self._since_count)
            completed = min(counted.present, counted.done + self._since_count)
            total = counted.present
        else:
            remaining = 0
            completed = self._requests_done
            total = completed + self._control.pending_requests()
        eta = remaining * 3600.0 / rate if rate and remaining else None
        return RunProgress(
            completed=completed,
            total=total,
            analysed=self._analysed,
            failed=self._failed,
            not_found=self._not_found,
            remaining=remaining,
            rate_per_hour=rate,
            eta_seconds=eta,
            whole_library=self._whole,
        )

    def _report(self, *, force: bool = False) -> None:
        if self._on_progress is None:
            return
        with self._lock:
            now = self._clock()
            if not force and now - self._last_report < PROGRESS_INTERVAL_SECONDS:
                return
            self._last_report = now
            snapshot = self._snapshot()
        try:
            self._on_progress(snapshot)
        except Exception:  # noqa: BLE001 — a report must not stop the run
            _logger.debug("[waveforms] a progress report failed", exc_info=True)

    # --------------------------------------------------------------- run

    def run(self, workers: int) -> AnalysisRunResult:
        threads = [
            threading.Thread(
                target=self._work, name=f"waveform-worker-{index}", daemon=True
            )
            for index in range(max(1, int(workers)))
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        if self._error is not None:
            raise self._error

        pruned = 0
        present = remaining = 0
        if self._whole:
            if self._stopped is None and self._exhausted:
                pruned = self._service.prune()
            final = self._service.plan(limit=0, ordered=False)
            present, remaining = final.present, final.remaining
            with self._lock:
                self._counted, self._since_count = final, 0
        self._report(force=True)
        return AnalysisRunResult(
            trigger=self._trigger,
            whole_library=self._whole,
            analysed=self._analysed,
            failed=self._failed,
            not_found=self._not_found,
            up_to_date=self._up_to_date,
            present=present,
            remaining=remaining,
            stopped=self._stopped,
            pruned=pruned,
            decode_errors=self._decode_errors,
        )


__all__ = (
    "AnalysisControl",
    "EVENT_WAVEFORMS_ANALYSED",
    "EVENT_WAVEFORM_DATA_DELETED",
    "PROGRESS_INTERVAL_SECONDS",
    "RATE_WINDOW_SECONDS",
    "REFILL",
    "RateWindow",
    "WaveformAnalysisService",
    "default_workers",
)
