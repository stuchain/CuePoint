#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A stored waveform, and a track's waveform state (WAVE-02, DEC-122).

Two types:

- :class:`StoredWaveform` is a row of ``waveforms.db``: what was analysed, at
  which path, size, modified time and analysis version, and the result. It is
  keyed by the file's path, not the track's id, so a restored backup or a fresh
  import that gives tracks new ids keeps every waveform.
  :class:`WaveformSummary` is the same row without its picture, which is what a
  state needs and all a batch of states reads.
- :class:`WaveformState` answers one track's question, "is there a waveform,
  and if not, why", from the library database and the store together, without
  touching a file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from cuepoint.models.row_values import (
    non_negative,
    one_of,
    optional_non_negative,
    optional_text,
    required_id,
    required_text,
    whole_number,
)

#: A stored analysis that produced a waveform.
STORED_READY = "ready"

#: A stored analysis that could not, with its reason.
STORED_FAILED = "failed"

STORED_STATES = (STORED_READY, STORED_FAILED)

#: A track's state: a current waveform.
STATE_READY = "ready"

#: A current analysis failed, with its reason.
STATE_FAILED = "failed"

#: The file check found no readable file at the track's current path. The
#: reason says which: ``missing``, ``unreadable``, ``root_unavailable`` or
#: ``no_path``.
STATE_MISSING = "missing"

#: Nobody has checked the file at the track's current path yet.
STATE_UNCHECKED = "unchecked"

#: The file was present when checked, and has no current waveform yet.
STATE_WAITING = "waiting"

#: There is no decoder, so nothing can be analysed (fact 2).
STATE_UNAVAILABLE = "unavailable"

WAVEFORM_STATES = (
    STATE_READY,
    STATE_FAILED,
    STATE_MISSING,
    STATE_UNCHECKED,
    STATE_WAITING,
    STATE_UNAVAILABLE,
)

#: Why a track is :data:`STATE_MISSING` when Rekordbox gave it no location: the
#: file check has nothing to look at, so it never writes a row.
REASON_NO_PATH = "no_path"


@dataclass(frozen=True)
class WaveformSummary:
    """A stored analysis, without its picture.

    Attributes:
        path: The file's path, exactly as the library holds it.
        size_bytes: The file's size when analysed.
        mtime_ns: The file's modified time when analysed, in nanoseconds.
        analysis_version: The decoder's ``ANALYSIS_VERSION`` that analysed it.
        state: One of :data:`STORED_STATES`.
        analysed_at: When, as ISO-8601 text.
        reason: Why a failed analysis failed. Only a failed one has one.
        duration_ms: The decoded length. Only a ready one has one.
    """

    path: str
    size_bytes: int
    mtime_ns: int
    analysis_version: int
    state: str
    analysed_at: str
    reason: Optional[str] = None
    duration_ms: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the row, as the table's checks would."""
        required_text(self.path, "path")
        object.__setattr__(
            self, "size_bytes", non_negative(self.size_bytes, "size_bytes")
        )
        object.__setattr__(self, "mtime_ns", whole_number(self.mtime_ns, "mtime_ns"))
        object.__setattr__(
            self,
            "analysis_version",
            required_id(self.analysis_version, "analysis_version"),
        )
        one_of(self.state, STORED_STATES, "state")
        required_text(self.analysed_at, "analysed_at")
        optional_text(self.reason, "reason")
        object.__setattr__(
            self, "duration_ms", optional_non_negative(self.duration_ms, "duration_ms")
        )
        if (self.state == STORED_FAILED) != (self.reason is not None):
            raise ValueError("A failed analysis, and only a failed one, has a reason")
        if (self.state == STORED_READY) != (self.duration_ms is not None):
            raise ValueError("A ready analysis, and only a ready one, has a duration")

    @property
    def is_ready(self) -> bool:
        """True when the analysis produced a waveform."""
        return self.state == STORED_READY

    def counts_for(self, size_bytes: int, mtime_ns: int) -> bool:
        """True when the row answers for the file as it is now.

        The analysis job asks this with a fresh ``stat``. A display never does:
        it shows what the store holds for the current version, and the next
        analysis replaces a changed file's row.
        """
        return self.size_bytes == int(size_bytes) and self.mtime_ns == int(mtime_ns)


@dataclass(frozen=True)
class StoredWaveform(WaveformSummary):
    """A stored analysis with its picture.

    Attributes:
        data: The encoded waveform (``core/waveform.py``). Only a ready
            analysis has one.
    """

    data: Optional[bytes] = None

    def __post_init__(self) -> None:
        """Validate the row, as the table's checks would."""
        super().__post_init__()
        if self.data is not None:
            if not isinstance(self.data, (bytes, bytearray, memoryview)):
                raise TypeError("data must be bytes")
            object.__setattr__(self, "data", bytes(self.data))
        if (self.state == STORED_READY) != (self.data is not None):
            raise ValueError("A ready analysis, and only a ready one, has data")

    @property
    def summary(self) -> WaveformSummary:
        """The row without its picture."""
        return WaveformSummary(
            path=self.path,
            size_bytes=self.size_bytes,
            mtime_ns=self.mtime_ns,
            analysis_version=self.analysis_version,
            state=self.state,
            analysed_at=self.analysed_at,
            reason=self.reason,
            duration_ms=self.duration_ms,
        )


@dataclass(frozen=True)
class WaveformState:
    """A track's waveform state.

    Attributes:
        track_id: The library track.
        state: One of :data:`WAVEFORM_STATES`.
        reason: Why a failed analysis failed, or why a track is missing.
        duration_ms: A ready waveform's decoded length.
    """

    track_id: int
    state: str
    reason: Optional[str] = None
    duration_ms: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the state."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.state, WAVEFORM_STATES, "state")
        optional_text(self.reason, "reason")
        object.__setattr__(
            self, "duration_ms", optional_non_negative(self.duration_ms, "duration_ms")
        )
        if self.reason is None and self.state in (STATE_FAILED, STATE_MISSING):
            raise ValueError(f"A {self.state} waveform state needs a reason")
        if self.reason is not None and self.state not in (STATE_FAILED, STATE_MISSING):
            raise ValueError(f"A {self.state} waveform state has no reason")
        if (self.state == STATE_READY) != (self.duration_ms is not None):
            raise ValueError("A ready waveform, and only a ready one, has a duration")

    def to_dict(self) -> Dict[str, Any]:
        """The state as the wire will carry it (WAVE-05)."""
        return {
            "track_id": self.track_id,
            "state": self.state,
            "reason": self.reason,
            "duration_ms": self.duration_ms,
        }


#: What one file's analysis did (``WaveformService.analyse``).
#: A waveform was stored.
OUTCOME_READY = "ready"
#: The file could not be analysed, and that was stored with its reason.
OUTCOME_FAILED = "failed"
#: The stored row already answers for the file as it is; nothing was decoded.
OUTCOME_CURRENT = "current"
#: No such track, or its file is not there now. Nothing was written.
OUTCOME_NOT_FOUND = "not_found"
#: The last file check did not find the file present at the track's current
#: path, so it was not opened (fact 6). Nothing was written.
OUTCOME_NOT_PRESENT = "not_present"
#: There is no decoder, or it cannot analyse. Nothing was written.
OUTCOME_UNAVAILABLE = "unavailable"
#: The caller cancelled, or the engine is stopping. Nothing was written.
OUTCOME_CANCELLED = "cancelled"

ANALYSIS_OUTCOMES = (
    OUTCOME_READY,
    OUTCOME_FAILED,
    OUTCOME_CURRENT,
    OUTCOME_NOT_FOUND,
    OUTCOME_NOT_PRESENT,
    OUTCOME_UNAVAILABLE,
    OUTCOME_CANCELLED,
)


@dataclass(frozen=True)
class AnalysisOutcome:
    """What analysing one track's file did.

    Attributes:
        track_id: The track.
        outcome: One of :data:`ANALYSIS_OUTCOMES`.
        reason: Why it failed, why it was not opened, or why the decoder is
            unavailable.
        decode_errors: Errors the decoder logged for a file that still gave a
            waveform, such as a truncated download.
    """

    track_id: int
    outcome: str
    reason: Optional[str] = None
    decode_errors: int = 0

    def __post_init__(self) -> None:
        """Validate the outcome."""
        one_of(self.outcome, ANALYSIS_OUTCOMES, "outcome")
        optional_text(self.reason, "reason")
        object.__setattr__(
            self, "decode_errors", non_negative(self.decode_errors, "decode_errors")
        )

    @property
    def wrote(self) -> bool:
        """True when a row was written to the store."""
        return self.outcome in (OUTCOME_READY, OUTCOME_FAILED)


@dataclass(frozen=True)
class WaveformAnswer:
    """A track's waveform at a width, or the state that explains its absence.

    Attributes:
        state: The track's state.
        width: The columns asked for.
        data: ``width × 4`` bytes, each column's full, low, mid and high, when
            the state is ready; otherwise ``None``.
    """

    state: WaveformState
    width: int
    data: Optional[bytes] = None

    def __post_init__(self) -> None:
        """Validate the answer."""
        ready = self.state.state == STATE_READY
        if ready != (self.data is not None):
            raise ValueError("A ready waveform, and only a ready one, has data")
        if self.data is not None and len(self.data) != self.width * 4:
            raise ValueError(f"{self.width} columns need {self.width * 4} bytes")


__all__ = (
    "ANALYSIS_OUTCOMES",
    "AnalysisOutcome",
    "OUTCOME_CANCELLED",
    "OUTCOME_CURRENT",
    "OUTCOME_FAILED",
    "OUTCOME_NOT_FOUND",
    "OUTCOME_NOT_PRESENT",
    "OUTCOME_READY",
    "OUTCOME_UNAVAILABLE",
    "REASON_NO_PATH",
    "STATE_FAILED",
    "STATE_MISSING",
    "STATE_READY",
    "STATE_UNAVAILABLE",
    "STATE_UNCHECKED",
    "STATE_WAITING",
    "STORED_FAILED",
    "STORED_READY",
    "STORED_STATES",
    "StoredWaveform",
    "WAVEFORM_STATES",
    "WaveformAnswer",
    "WaveformState",
    "WaveformSummary",
)
