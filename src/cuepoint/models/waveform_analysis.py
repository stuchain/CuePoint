#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library's waveform analysis: its work, its runs and its state (WAVE-03).

Four types, in the order a run meets them:

- :class:`PresentFile` is a track the last file check found present at its
  current path, with the size that check recorded. The work list is made of
  them.
- :class:`WorkPlan` compares those with ``waveforms.db``: how many have a row
  that counts, and which do not, in the order they are analysed.
- :class:`RunProgress` is what a running analysis reports, and
  :class:`AnalysisRunResult` what one run did, which Activity records once.
- :class:`AnalysisStatus` is the analysis as a whole: running, paused, idle or
  unavailable, with its counts.

A row counts for the work list when it is of the current analysis version and
its size is the one the file check recorded. The check records no modified
time, so a file changed without changing size is found by the run that follows
a whole-library check, which ``stat``s every analysed file (``verify``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from cuepoint.models.row_values import (
    non_negative,
    one_of,
    optional_text,
    required_id,
    required_text,
)

#: Why a run stopped before it had drained its work. A run that drained it has
#: no stop reason.
#: The analysis was paused: by Pause, or by the status strip's Stop.
STOP_PAUSED = "paused"
#: An import, a refresh apply, a file check or a tag write started. The run
#: steps aside for it, and the file check that follows starts the analysis again.
STOP_STEPPED_ASIDE = "stepped_aside"
#: The decoder could not analyse audio at all, so no file was blamed.
STOP_UNAVAILABLE = "unavailable"
#: The engine is closing, and ended the decoder mid-file.
STOP_CANCELLED = "cancelled"
#: "Delete waveform data" emptied the store. The run stops so nothing it has in
#: flight lands after the deletion, and a new run starts after it unless paused.
STOP_DATA_DELETED = "data_deleted"

STOP_REASONS = (
    STOP_PAUSED,
    STOP_STEPPED_ASIDE,
    STOP_UNAVAILABLE,
    STOP_CANCELLED,
    STOP_DATA_DELETED,
)

#: The analysis as a whole (``GET /api/v1/waveforms/analysis``).
#: A run is going, and the analysis is not paused.
ANALYSIS_RUNNING = "running"
#: Paused: nothing runs in the background. A requested track still does.
ANALYSIS_PAUSED = "paused"
#: Nothing is running, and nothing is paused.
ANALYSIS_IDLE = "idle"
#: There is no decoder, or it cannot analyse; nothing will run.
ANALYSIS_UNAVAILABLE = "unavailable"

ANALYSIS_STATES = (
    ANALYSIS_RUNNING,
    ANALYSIS_PAUSED,
    ANALYSIS_IDLE,
    ANALYSIS_UNAVAILABLE,
)


def _plural(count: int, one: str, many: str) -> str:
    return f"{count:,} {one if count == 1 else many}"


@dataclass(frozen=True)
class PresentFile:
    """A track whose file the last check found present at its current path.

    Attributes:
        track_id: The track.
        path: Its current path, exactly as the library and the store hold it.
        size_bytes: The size the check found, or ``None`` when it recorded none.
    """

    track_id: int
    path: str
    size_bytes: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the file."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        required_text(self.path, "path")
        if self.size_bytes is not None:
            object.__setattr__(
                self, "size_bytes", non_negative(self.size_bytes, "size_bytes")
            )


@dataclass(frozen=True)
class WorkItem:
    """One file a run will analyse, named by a track whose path it is."""

    track_id: int
    path: str


@dataclass(frozen=True)
class WorkPlan:
    """The library's present files against the store, at one moment.

    Attributes:
        present: Tracks whose file the last check found present.
        analysed: Of those, tracks with a ready row that counts.
        failed: Of those, tracks with a failed row that counts.
        pending: Files with no row that counts, in the order they are
            analysed: Sets' entries, then Collections', then the newest. One
            item per path, and none a run has already taken.
        verify: Files whose row counts, to be ``stat``ed by a run that follows
            a whole-library check, in the same order.
        pending_total: How many files ``pending`` would hold without a limit.
    """

    present: int
    analysed: int
    failed: int
    pending: Tuple[WorkItem, ...] = ()
    verify: Tuple[WorkItem, ...] = ()
    pending_total: int = 0

    @property
    def remaining(self) -> int:
        """Present tracks with no row that counts."""
        return max(0, self.present - self.analysed - self.failed)

    @property
    def done(self) -> int:
        """Present tracks with a row that counts, ready or failed."""
        return self.analysed + self.failed


@dataclass(frozen=True)
class RunProgress:
    """What a running analysis reports, at most every half second.

    Attributes:
        completed: Done so far. For a whole-library run, the present tracks with
            a row that counts; for a run of requests only, the requests handled.
        total: What ``completed`` counts towards: the present tracks, or the
            requests handled and still queued.
        analysed: Files this run stored a waveform for.
        failed: Files this run stored as failed.
        not_found: Files this run found gone, which it skipped.
        remaining: Present tracks with no row that counts.
        rate_per_hour: Files decoded an hour, over the last ten minutes, or
            ``None`` until there is enough to say.
        eta_seconds: ``remaining`` at that rate, when there is one.
        whole_library: False for a run of requests only.
    """

    completed: int
    total: int
    analysed: int = 0
    failed: int = 0
    not_found: int = 0
    remaining: int = 0
    rate_per_hour: Optional[float] = None
    eta_seconds: Optional[float] = None
    whole_library: bool = True


@dataclass(frozen=True)
class AnalysisRunResult:
    """What one run did, from start to stop. Activity records it once.

    Attributes:
        trigger: What started it: ``file_check``, ``launch``, ``resume``,
            ``request`` or ``tag_write``.
        whole_library: False for a run of requests only.
        analysed: Files it stored a waveform for.
        failed: Files it stored as failed.
        not_found: Files it found gone and skipped. Never failures: a
            disconnected drive is not a broken file.
        up_to_date: Files whose row already counted when looked at.
        present: Present tracks when it last counted.
        remaining: Present tracks with no row that counts, when it ended.
        stopped: One of :data:`STOP_REASONS`, or ``None`` when it drained its
            work.
        pruned: Store rows deleted because no track has their path. Only a
            whole-library run that drained the library prunes.
        decode_errors: Errors the decoder logged for files that still gave a
            waveform.
    """

    trigger: str
    whole_library: bool
    analysed: int = 0
    failed: int = 0
    not_found: int = 0
    up_to_date: int = 0
    present: int = 0
    remaining: int = 0
    stopped: Optional[str] = None
    pruned: int = 0
    decode_errors: int = 0

    def __post_init__(self) -> None:
        """Validate the result."""
        required_text(self.trigger, "trigger")
        optional_text(self.stopped, "stopped")
        if self.stopped is not None:
            one_of(self.stopped, STOP_REASONS, "stopped")
        for name in (
            "analysed",
            "failed",
            "not_found",
            "up_to_date",
            "present",
            "remaining",
            "pruned",
            "decode_errors",
        ):
            object.__setattr__(self, name, non_negative(getattr(self, name), name))

    @property
    def drained(self) -> bool:
        """True when it ran out of work rather than being stopped."""
        return self.stopped is None

    @property
    def did_anything(self) -> bool:
        """True when it stored, refused or skipped at least one file."""
        return bool(self.analysed or self.failed or self.not_found or self.pruned)

    def summary_line(self) -> str:
        """One sentence for Activity: what it did, and how it ended."""
        if self.analysed or self.failed:
            line = f"Analysed {_plural(self.analysed, 'waveform', 'waveforms')}"
            if self.failed:
                line += f"; {_plural(self.failed, 'file', 'files')} could not be read"
        elif self.whole_library and self.stopped is None:
            line = "Every waveform is up to date"
        else:
            line = "No waveforms analysed"
        if self.not_found:
            line += (
                f"; {_plural(self.not_found, 'file was', 'files were')}"
                " not found, and will be looked for after the next file check"
            )
        if self.stopped == STOP_PAUSED:
            return f"{line}. Paused."
        if self.stopped == STOP_STEPPED_ASIDE:
            return f"{line}. Stopped for a library change, and continues after it."
        if self.stopped == STOP_UNAVAILABLE:
            return f"{line}. Stopped: the decoder could not analyse audio."
        if self.stopped == STOP_CANCELLED:
            return f"{line}. Stopped as the engine closed."
        if self.stopped == STOP_DATA_DELETED:
            return f"{line}. Stopped to delete the waveform data."
        return f"{line}." if not self.whole_library else f"{line}. Finished."

    def to_dict(self) -> Dict[str, Any]:
        """The result as a job's result, and as the activity event's detail."""
        return {
            "trigger": self.trigger,
            "whole_library": self.whole_library,
            "analysed": self.analysed,
            "failed": self.failed,
            "not_found": self.not_found,
            "up_to_date": self.up_to_date,
            "present": self.present,
            "remaining": self.remaining,
            "stopped": self.stopped,
            "pruned": self.pruned,
            "decode_errors": self.decode_errors,
        }


@dataclass(frozen=True)
class AnalysisStatus:
    """The library's waveform analysis as a whole.

    Attributes:
        state: One of :data:`ANALYSIS_STATES`. Unavailable first, then paused,
            then running: a requested track analysed while the analysis is
            paused does not make it read as running.
        paused: The persisted setting, whatever is running.
        job_id: The running job, if any.
        present: Tracks whose file the last check found present.
        analysed: Of those, tracks with a ready row that counts.
        failed: Of those, tracks with a failed row that counts.
        remaining: Present tracks with no row that counts.
        rate_per_hour: Files decoded an hour over the last ten minutes, while
            a run is going and there is enough to say.
        eta_seconds: ``remaining`` at that rate.
        reason: Why it is unavailable: ``decoder_missing``.
        store_bytes: What ``waveforms.db`` takes on disk, which "Delete
            waveform data" says before it deletes it (WAVE-05).
    """

    state: str
    paused: bool
    present: int
    analysed: int
    failed: int
    job_id: Optional[str] = None
    rate_per_hour: Optional[float] = None
    eta_seconds: Optional[float] = None
    reason: Optional[str] = None
    store_bytes: int = 0

    def __post_init__(self) -> None:
        """Validate the status."""
        one_of(self.state, ANALYSIS_STATES, "state")
        for name in ("present", "analysed", "failed", "store_bytes"):
            object.__setattr__(self, name, non_negative(getattr(self, name), name))
        optional_text(self.job_id, "job_id")
        optional_text(self.reason, "reason")
        if (self.state == ANALYSIS_UNAVAILABLE) != (self.reason is not None):
            raise ValueError("An unavailable analysis, and only one, has a reason")

    @property
    def remaining(self) -> int:
        """Present tracks with no row that counts."""
        return max(0, self.present - self.analysed - self.failed)

    def to_dict(self) -> Dict[str, Any]:
        """The status as the wire carries it."""
        return {
            "state": self.state,
            "paused": self.paused,
            "job_id": self.job_id,
            "present": self.present,
            "analysed": self.analysed,
            "failed": self.failed,
            "remaining": self.remaining,
            "rate_per_hour": self.rate_per_hour,
            "eta_seconds": self.eta_seconds,
            "reason": self.reason,
            "store_bytes": self.store_bytes,
        }


@dataclass(frozen=True)
class WaveformDataDeleted:
    """What "Delete waveform data" did (WAVE-05). Activity records it once.

    Attributes:
        waveforms: Rows deleted, ready and failed alike.
        freed_bytes: What the store took on disk before, less what it takes now.
    """

    waveforms: int
    freed_bytes: int

    def __post_init__(self) -> None:
        """Validate the result."""
        for name in ("waveforms", "freed_bytes"):
            object.__setattr__(self, name, non_negative(getattr(self, name), name))

    def summary_line(self) -> str:
        """One sentence for Activity."""
        if not self.waveforms:
            return "Deleted the waveform data; there were no waveforms to delete."
        return (
            f"Deleted {_plural(self.waveforms, 'waveform', 'waveforms')};"
            " the library will be analysed again."
        )

    def to_dict(self) -> Dict[str, Any]:
        """The result as the route answers it, and as the event's detail."""
        return {"waveforms": self.waveforms, "freed_bytes": self.freed_bytes}


__all__ = (
    "ANALYSIS_IDLE",
    "ANALYSIS_PAUSED",
    "ANALYSIS_RUNNING",
    "ANALYSIS_STATES",
    "ANALYSIS_UNAVAILABLE",
    "AnalysisRunResult",
    "AnalysisStatus",
    "PresentFile",
    "RunProgress",
    "STOP_CANCELLED",
    "STOP_DATA_DELETED",
    "STOP_PAUSED",
    "STOP_REASONS",
    "STOP_STEPPED_ASIDE",
    "STOP_UNAVAILABLE",
    "WaveformDataDeleted",
    "WorkItem",
    "WorkPlan",
)
