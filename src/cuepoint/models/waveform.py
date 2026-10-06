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

A waveform's loudness (WAVE-08, DEC-124) is measured in the pass that draws it,
and stored beside it as a :class:`StoredLoudness`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, NamedTuple, Optional

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

#: Why a measured file has no loudness value (WAVE-08). The same words as
#: ``data/audio_decode.py``'s, which measures; a test holds them together.
#: Below the meter's floor: silence, or shorter than one 400 ms block.
LOUDNESS_TOO_QUIET = "too_quiet"
#: Not one sample above zero: no value and no peak.
LOUDNESS_SILENT = "silent"
#: The decoder's log held no reading.
LOUDNESS_NOT_MEASURED = "not_measured"

LOUDNESS_REASONS = (LOUDNESS_TOO_QUIET, LOUDNESS_SILENT, LOUDNESS_NOT_MEASURED)


def _measure(value: Any, name: str) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{name} must be a number, not {value!r}")
    if not math.isfinite(value):
        raise ValueError(f"{name} must be finite, not {value!r}")
    return float(value)


@dataclass(frozen=True)
class StoredLoudness:
    """A file's loudness, as measured with its waveform (WAVE-08).

    Read-only everywhere: shown, never applied to playback or written to a file
    (DEC-124). Either a value with its peak, or a reason without a value; a
    file too quiet to measure may still have a peak.

    Attributes:
        loudness_version: The decoder's ``LOUDNESS_VERSION`` that measured it.
        integrated_lufs: The whole file's integrated loudness, in LUFS.
        peak_dbfs: Its highest sample, in dBFS.
        reason: Why there is no value; one of :data:`LOUDNESS_REASONS`.
    """

    loudness_version: int
    integrated_lufs: Optional[float] = None
    peak_dbfs: Optional[float] = None
    reason: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the reading, as ``audio_decode.Loudness`` does."""
        object.__setattr__(
            self,
            "loudness_version",
            required_id(self.loudness_version, "loudness_version"),
        )
        object.__setattr__(
            self,
            "integrated_lufs",
            _measure(self.integrated_lufs, "integrated_lufs"),
        )
        object.__setattr__(self, "peak_dbfs", _measure(self.peak_dbfs, "peak_dbfs"))
        if self.reason is not None:
            one_of(self.reason, LOUDNESS_REASONS, "reason")
        if (self.reason is None) != (self.integrated_lufs is not None):
            raise ValueError("A loudness has a value or a reason, never both")
        if self.reason is None and self.peak_dbfs is None:
            raise ValueError("A loudness value has its peak")
        if self.reason in (LOUDNESS_SILENT, LOUDNESS_NOT_MEASURED) and (
            self.peak_dbfs is not None
        ):
            raise ValueError(f"A {self.reason} loudness has no peak")

    def to_dict(self) -> Dict[str, Any]:
        """The reading as the wire carries it; its version stays in the engine."""
        return {
            "integrated_lufs": self.integrated_lufs,
            "peak_dbfs": self.peak_dbfs,
            "reason": self.reason,
        }


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
        loudness: Its loudness, measured from the same file in the same pass,
            of any version; ``None`` when it was not. Only a ready one has one.
    """

    path: str
    size_bytes: int
    mtime_ns: int
    analysis_version: int
    state: str
    analysed_at: str
    reason: Optional[str] = None
    duration_ms: Optional[int] = None
    loudness: Optional[StoredLoudness] = None

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
        if self.loudness is not None:
            if not isinstance(self.loudness, StoredLoudness):
                raise TypeError("loudness must be a StoredLoudness")
            if self.state != STORED_READY:
                raise ValueError("Only a ready analysis has a loudness")

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

    def measured(self, loudness_version: int) -> bool:
        """True when nothing is left to measure (WAVE-08).

        A failed analysis has nothing to measure; a ready one has its loudness
        at ``loudness_version``.
        """
        if self.state == STORED_FAILED:
            return True
        return self.loudness is not None and self.loudness.loudness_version == int(
            loudness_version
        )


class StoredFile(NamedTuple):
    """A current row reduced to what the analysis job's work list compares.

    Attributes:
        size_bytes: The file's size when it was analysed.
        state: One of :data:`STORED_STATES`.
        loudness_version: The version of the loudness measured with it, from
            a file of the same size; ``None`` when there is none (WAVE-08).
    """

    size_bytes: int
    state: str
    loudness_version: Optional[int] = None

    def measured(self, loudness_version: int) -> bool:
        """As :meth:`WaveformSummary.measured`: failed, or measured at this version."""
        if self.state == STORED_FAILED:
            return True
        return self.loudness_version == int(loudness_version)


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
            loudness=self.loudness,
        )


@dataclass(frozen=True)
class WaveformState:
    """A track's waveform state.

    Attributes:
        track_id: The library track.
        state: One of :data:`WAVEFORM_STATES`.
        reason: Why a failed analysis failed, or why a track is missing.
        duration_ms: A ready waveform's decoded length.
        loudness: A ready waveform's loudness at the current version, or
            ``None`` while it is still to be measured (WAVE-08).
    """

    track_id: int
    state: str
    reason: Optional[str] = None
    duration_ms: Optional[int] = None
    loudness: Optional[StoredLoudness] = None

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
        if self.loudness is not None and self.state != STATE_READY:
            raise ValueError("Only a ready waveform has a loudness")

    def to_dict(self) -> Dict[str, Any]:
        """The state as the wire carries it (WAVE-05, WAVE-08)."""
        return {
            "track_id": self.track_id,
            "state": self.state,
            "reason": self.reason,
            "duration_ms": self.duration_ms,
            "loudness": None if self.loudness is None else self.loudness.to_dict(),
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
    "LOUDNESS_NOT_MEASURED",
    "LOUDNESS_REASONS",
    "LOUDNESS_SILENT",
    "LOUDNESS_TOO_QUIET",
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
    "StoredFile",
    "StoredLoudness",
    "StoredWaveform",
    "WAVEFORM_STATES",
    "WaveformAnswer",
    "WaveformState",
    "WaveformSummary",
)
