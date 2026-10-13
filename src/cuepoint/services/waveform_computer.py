#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The CPU half of one file's analysis: decode, reduce, encode (C19g).

:meth:`WaveformService.analyse` decides whether a file needs analysing and
writes what comes of it. What lies between, supervising the decoder, parsing
its envelope, reducing it to the overview and the detail and encoding both,
is the one part that costs CPU, and it is a function of a path and a decoder
alone. That is the seam this module cuts: a :class:`WaveformComputer` takes
the path and answers a :class:`Computed`, and knows nothing of the store, the
library or the clock.

The seam exists so the work can move to a worker process (C19g, DEC to come)
without the service noticing. :class:`InProcessComputer` is today's behaviour
unchanged; it stays after the move, for tests, the command line and as the
fallback when a worker cannot be started.

What raises
-----------
Nothing a file contains. Every outcome of WAVE-01's vocabulary is a
:class:`Computed`. A computer may raise only for a programming error.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional, Protocol, Sequence

from cuepoint.core.waveform import encode, reduce
from cuepoint.core.waveform_detail import encode_detail, reduce_detail
from cuepoint.data.audio_decode import (
    NOT_MEASURED,
    REASON_DECODER_MISSING,
    REASON_NO_AUDIO,
    DecodeCancelled,
    DecodeFailed,
    DecoderUnavailable,
    Envelope,
    FileGone,
    Loudness,
    decode_envelope,
)

#: Decodes one file: ``(source, decoder, cancel) -> Envelope``, raising WAVE-01's
#: vocabulary. :func:`decode_envelope` in the engine; a stand-in in tests.
Decode = Callable[[str, Path, Optional[Callable[[], bool]]], Envelope]

#: The file was analysed.
COMPUTED_READY = "ready"
#: The file could not be analysed; ``reason`` says why.
COMPUTED_FAILED = "failed"
#: The file was gone when the decoder opened it.
COMPUTED_FILE_GONE = "file_gone"
#: The caller asked to stop, or the engine is stopping.
COMPUTED_CANCELLED = "cancelled"
#: The decoder cannot analyse anything, so no file is blamed.
COMPUTED_UNAVAILABLE = "unavailable"

COMPUTED_OUTCOMES = (
    COMPUTED_READY,
    COMPUTED_FAILED,
    COMPUTED_FILE_GONE,
    COMPUTED_CANCELLED,
    COMPUTED_UNAVAILABLE,
)


def _decode_with_mpv(
    source: str, decoder: Path, cancel: Optional[Callable[[], bool]]
) -> Envelope:
    return decode_envelope(source, decoder, cancel=cancel)


@dataclass(frozen=True)
class Computed:
    """What computing one file came to.

    Attributes:
        outcome: One of :data:`COMPUTED_OUTCOMES`.
        reason: For ``failed``, a :class:`DecodeFailed` reason or
            :data:`REASON_NO_AUDIO`; for ``unavailable``,
            :data:`REASON_DECODER_MISSING`.
        overview: The encoded overview, when ready and asked for.
        duration_ms: The reduced waveform's duration, with ``overview``.
        loudness: The file's loudness (WAVE-08), when ready.
        detail: The encoded detail, when ready and asked for.
        decode_errors: How many errors the decoder reported on a file that
            still decoded.
    """

    outcome: str
    reason: Optional[str] = None
    overview: Optional[bytes] = None
    duration_ms: Optional[int] = None
    loudness: Loudness = NOT_MEASURED
    detail: Optional[bytes] = None
    decode_errors: int = 0

    def __post_init__(self) -> None:
        if self.outcome not in COMPUTED_OUTCOMES:
            raise ValueError(f"unknown outcome {self.outcome!r}")
        if self.outcome == COMPUTED_FAILED and not self.reason:
            raise ValueError("A failed computation says why")


class WaveformComputer(Protocol):
    """Computes one file's waveform from its path."""

    def compute(
        self,
        path: str,
        decoder: Path,
        *,
        overview: bool,
        detail: bool,
        cancel: Optional[Callable[[], bool]] = None,
    ) -> Computed:
        """Decode ``path`` and make the pictures asked for.

        Never raises for anything a file contains; may raise only for a
        programming error.

        Args:
            path: The file.
            decoder: The decoder to run.
            overview: Also encode the overview.
            detail: Also encode the detail.
            cancel: Polled while the decoder runs.
        """
        ...


class InProcessComputer:
    """Computes in the calling process."""

    def __init__(self, decode_file: Decode = _decode_with_mpv) -> None:
        """Wire the computer.

        Args:
            decode_file: Decodes one file.
        """
        self._decode = decode_file

    def compute(
        self,
        path: str,
        decoder: Path,
        *,
        overview: bool,
        detail: bool,
        cancel: Optional[Callable[[], bool]] = None,
    ) -> Computed:
        """Decode ``path`` and make the pictures asked for."""
        try:
            envelope = self._decode(path, decoder, cancel)
        except FileGone:
            return Computed(COMPUTED_FILE_GONE)
        except DecodeCancelled:
            return Computed(COMPUTED_CANCELLED)
        except DecoderUnavailable:
            # The decoder cannot analyse anything, so no file is blamed.
            return Computed(COMPUTED_UNAVAILABLE, REASON_DECODER_MISSING)
        except DecodeFailed as failure:
            return Computed(COMPUTED_FAILED, failure.reason)

        if envelope.frames == 0:
            return Computed(COMPUTED_FAILED, REASON_NO_AUDIO)
        bands = [envelope.full, envelope.low, envelope.mid, envelope.high]
        encoded: Optional[bytes] = None
        duration_ms: Optional[int] = None
        if overview:
            waveform = reduce(bands, envelope.duration_ms)
            encoded = encode(waveform)
            duration_ms = waveform.duration_ms
        zoomed: Optional[bytes] = None
        if detail:
            zoomed = encode_detail(reduce_detail(bands, envelope.duration_ms))
        return Computed(
            COMPUTED_READY,
            overview=encoded,
            duration_ms=duration_ms,
            loudness=envelope.loudness,
            detail=zoomed,
            decode_errors=envelope.decode_errors,
        )


__all__: Sequence[str] = (
    "COMPUTED_CANCELLED",
    "COMPUTED_FAILED",
    "COMPUTED_FILE_GONE",
    "COMPUTED_OUTCOMES",
    "COMPUTED_READY",
    "COMPUTED_UNAVAILABLE",
    "Computed",
    "Decode",
    "InProcessComputer",
    "WaveformComputer",
)
