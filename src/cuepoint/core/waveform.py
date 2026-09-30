#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The shape of a waveform, and the bytes it is stored as (WAVE-02, DEC-117).

Pure: no file, no database, no decoder. WAVE-01's decoder hands over an
envelope, four bands of RMS amplitude at 150 samples a second, and this module
turns it into what the store keeps and what a picture is drawn from.

The shape
---------
- **1,200 columns per track, whatever its length.** That is Rekordbox's colour
  preview width, and wider than the player bar at the default window.
- **Four bytes a column:** the full band, then low, mid and high
  (:data:`BANDS`). Each is the highest envelope value over the column's span,
  so a short peak is never averaged away.
- **Each byte is** ``round(255 × √v)``, clamped. The square root spends the
  byte's resolution where a quiet passage needs it. A picture is drawn from the
  byte as it is; :func:`expand` exists for tests and measurements.
- **No per-track normalisation.** A quiet master looks quiet, as it does in
  Rekordbox.
- **A track shorter than 1,200 envelope samples** repeats values rather than
  inventing detail between them.

The encoded form
----------------
A 12-byte header, then the column bytes compressed with ``zlib``:

====== ===== ==========================================
Offset Bytes Meaning
====== ===== ==========================================
0      4     the magic ``CPWF``
4      1     :data:`FORMAT_VERSION`
5      1     the band count, 4
6      2     the column count, little-endian ``u16``
8      4     the duration in milliseconds, ``u32``
====== ===== ==========================================

The body stores each band's columns in turn rather than a column's four bands
together. Neighbouring values within a band are alike, so ``zlib`` finds more to
share: 11% smaller on the tracks WAVE-02 measured. :func:`decode` gives back the
column layout above, so nothing outside this module sees the difference.

:func:`decode` refuses anything that does not add up: a short or foreign header,
another format version, a body that does not decompress to exactly the size the
header states, or one ``zlib``'s checksum rejects. A refusal is never a partly
drawn waveform.

The version
-----------
:data:`FORMAT_VERSION` names these rules together: the column count, the maximum
rule, the companding and the layout. Change any of them and change the number.
A stored waveform in another version is refused on decode, and the store's row
is analysed again (WAVE-02's service).
"""

from __future__ import annotations

import math
import struct
import zlib
from array import array
from dataclasses import dataclass
from functools import lru_cache
from operator import itemgetter
from typing import Callable, List, Literal, Sequence, Tuple

#: Columns per track.
COLUMNS = 1_200

#: The narrowest picture :func:`downsample` makes. The Library column is the
#: narrowest place a waveform is drawn.
MIN_WIDTH = 16

#: The bands, in the order each column holds them. The same names and order as
#: the decoder's (``data/audio_decode.py``), which a test holds.
BANDS: Tuple[str, ...] = ("full", "low", "mid", "high")

#: Bytes per column.
BAND_COUNT = len(BANDS)

#: The encoded form's version. See the module's docstring.
FORMAT_VERSION = 1

#: The encoded form's first four bytes.
MAGIC = b"CPWF"

#: The largest byte value.
LEVELS = 255

#: The longest duration the header can carry, about 49 days.
MAX_DURATION_MS = 2**32 - 1

#: ``zlib``'s level for the body.
ZLIB_LEVEL = 6

_HEADER = struct.Struct("<4sBBHI")

#: The header's size in bytes.
HEADER_BYTES = _HEADER.size


class WaveformFormatError(ValueError):
    """An encoded waveform that does not add up."""


@dataclass(frozen=True)
class Waveform:
    """A track's waveform.

    Attributes:
        columns: How many columns.
        duration_ms: The track's decoded length.
        data: ``columns × 4`` bytes: each column's full, low, mid and high.
    """

    columns: int
    duration_ms: int
    data: bytes

    def __post_init__(self) -> None:
        """Validate the waveform."""
        if isinstance(self.columns, bool) or not 1 <= int(self.columns) <= 0xFFFF:
            raise ValueError(f"columns must be 1 to 65535, not {self.columns!r}")
        if isinstance(self.duration_ms, bool) or not (
            0 <= int(self.duration_ms) <= MAX_DURATION_MS
        ):
            raise ValueError(f"duration_ms is out of range: {self.duration_ms!r}")
        if not isinstance(self.data, (bytes, bytearray)):
            raise TypeError("data must be bytes")
        object.__setattr__(self, "data", bytes(self.data))
        if len(self.data) != self.columns * BAND_COUNT:
            raise ValueError(
                f"{self.columns} columns need {self.columns * BAND_COUNT} bytes,"
                f" not {len(self.data)}"
            )

    def band(self, name: str) -> bytes:
        """One band's column values, by its name in :data:`BANDS`."""
        return self.data[BANDS.index(name) :: BAND_COUNT]


def compand(value: float) -> int:
    """The byte for a linear amplitude: ``round(255 × √v)``, clamped.

    Anything not finite, or at or below zero, is silence.
    """
    if not math.isfinite(value) or value <= 0.0:
        return 0
    return min(LEVELS, round(LEVELS * math.sqrt(value)))


def expand(level: int) -> float:
    """The linear amplitude a byte stands for; :func:`compand` undone."""
    if not 0 <= level <= LEVELS:
        raise ValueError(f"A level is 0 to {LEVELS}, not {level}")
    return (level / LEVELS) ** 2


def spans(frames: int, columns: int) -> List[Tuple[int, int]]:
    """Each column's ``[start, end)`` over ``frames`` samples.

    With at least as many samples as columns, the spans cover every sample
    exactly once. With fewer, a column repeats the sample it falls on.
    """
    if frames <= 0:
        raise ValueError("There are no samples to divide")
    if columns <= 0:
        raise ValueError("There must be at least one column")
    result = []
    for index in range(columns):
        start = index * frames // columns
        end = max(start + 1, (index + 1) * frames // columns)
        result.append((start, end))
    return result


def reduce(
    bands: Sequence[Sequence[float]], duration_ms: int, columns: int = COLUMNS
) -> Waveform:
    """Reduce an envelope's four bands to a waveform.

    Args:
        bands: The full, low, mid and high bands, as the decoder gives them,
            all the same length.
        duration_ms: The decoded length, from the envelope's own sample count.
        columns: How many columns; :data:`COLUMNS` for anything stored.

    Raises:
        ValueError: If there are not four bands, they differ in length, or they
            are empty.
    """
    if len(bands) != BAND_COUNT:
        raise ValueError(f"A waveform has {BAND_COUNT} bands, not {len(bands)}")
    frames = len(bands[0])
    if any(len(band) != frames for band in bands):
        raise ValueError("The bands differ in length")
    ranges = spans(frames, columns)
    reduced = [
        [compand(max(band[start:end])) for start, end in ranges] for band in bands
    ]
    return Waveform(columns, duration_ms, _interleave(reduced, columns))


def downsample(data: bytes, width: int) -> bytes:
    """The same waveform, ``width`` columns wide.

    Each new column holds the highest value, per band, of the columns it
    covers, so no peak is lost at any width.

    Args:
        data: A waveform's column bytes (:attr:`Waveform.data`).
        width: From :data:`MIN_WIDTH` to the waveform's own column count.

    Raises:
        ValueError: If ``data`` is not whole columns, or ``width`` is out of
            range.
    """
    if not data or len(data) % BAND_COUNT:
        raise ValueError("The data is not whole columns")
    columns = len(data) // BAND_COUNT
    if isinstance(width, bool) or not MIN_WIDTH <= width <= columns:
        raise ValueError(f"width must be {MIN_WIDTH} to {columns}, not {width!r}")
    if width == columns:
        return bytes(data)
    return _downsample(data, columns, width)


# Downsampling runs for hundreds of pictures at a time (the Library asks for
# every visible row's), with no numpy (DEC-123). A loop over spans cost 0.23 ms a
# picture, and one `map(max, ...)` over them 0.15 ms. So the maximum is taken
# over all of a picture's bytes at once, in one Python integer: each byte is
# given a 16-bit lane, and a lane-wise maximum of two such integers is a handful
# of big-integer operations (SWAR, "SIMD within a register"). About 50 us at
# width 120.

#: A 4-byte word: one column's four bands, moved as one item.
_WORD: Literal["I", "L"] = "I" if memoryview(bytes(8)).cast("I").itemsize == 4 else "L"


@lru_cache(maxsize=64)
def _plan(
    columns: int, width: int
) -> Tuple[int, Tuple[Callable[[memoryview], Tuple[int, ...]], ...], int, int]:
    """How to gather each span's columns, and the lane masks for ``width``.

    Every span is ``q`` or ``q + 1`` columns long, where ``q = columns //
    width``. When every span is ``q`` long, the ``i``-th columns of all spans
    are one strided slice. Otherwise getter ``i`` picks them, and the last
    getter picks each span's extra column, or its first again where there is
    none, which a maximum does not notice.

    Returns:
        ``q`` when the spans are even (and no getters), else ``0`` and the
        getters; then the lanes' guard bits and their low bytes.
    """
    ranges = spans(columns, width)
    shortest = min(end - start for start, end in ranges)
    lanes = width * BAND_COUNT
    guard = int.from_bytes(b"\x01\x00" * lanes, "big")
    low = int.from_bytes(b"\x00\xff" * lanes, "big")
    if all(end - start == shortest for start, end in ranges):
        return shortest, (), guard, low
    getters = tuple(
        itemgetter(*[start + i if start + i < end else start for start, end in ranges])
        for i in range(shortest + 1)
    )
    return 0, getters, guard, low


def _lanes(vector: bytes) -> int:
    """``vector``'s bytes, each in the low byte of a 16-bit lane of one integer."""
    wide = bytearray(2 * len(vector))
    wide[1::2] = vector
    return int.from_bytes(wide, "big")


def _downsample(data: bytes, columns: int, width: int) -> bytes:
    stride, getters, guard, low = _plan(columns, width)
    words = memoryview(bytes(data)).cast(_WORD)
    if stride:
        vectors = [words[i::stride].tobytes() for i in range(stride)]
    else:
        vectors = [array(_WORD, getter(words)).tobytes() for getter in getters]
    highest = _lanes(vectors[0])
    for vector in vectors[1:]:
        other = _lanes(vector)
        # A lane of (highest | guard) - other keeps its guard bit exactly when
        # highest >= other there, and never borrows from its neighbour.
        keep = ((((highest | guard) - other) & guard) >> 8) * 0xFF
        highest = (highest & keep) | (other & (keep ^ low))
    return highest.to_bytes(2 * width * BAND_COUNT, "big")[1::2]


def encode(waveform: Waveform) -> bytes:
    """The stored form: the header, then the body compressed."""
    header = _HEADER.pack(
        MAGIC, FORMAT_VERSION, BAND_COUNT, waveform.columns, waveform.duration_ms
    )
    planar = b"".join(waveform.band(name) for name in BANDS)
    return header + zlib.compress(planar, ZLIB_LEVEL)


def decode(blob: bytes) -> Waveform:
    """A waveform from its stored form.

    Raises:
        WaveformFormatError: If the header, the length or the checksum does not
            add up.
    """
    if len(blob) < HEADER_BYTES:
        raise WaveformFormatError("shorter than a header")
    magic, version, band_count, columns, duration_ms = _HEADER.unpack_from(blob)
    if magic != MAGIC:
        raise WaveformFormatError("not a CuePoint waveform")
    if version != FORMAT_VERSION:
        raise WaveformFormatError(f"format version {version}, not {FORMAT_VERSION}")
    if band_count != BAND_COUNT:
        raise WaveformFormatError(f"{band_count} bands, not {BAND_COUNT}")
    if columns < 1:
        raise WaveformFormatError("no columns")
    expected = columns * BAND_COUNT
    inflater = zlib.decompressobj()
    try:
        planar = inflater.decompress(blob[HEADER_BYTES:], expected + 1)
    except zlib.error as exc:
        raise WaveformFormatError(f"the body does not decompress: {exc}") from exc
    if len(planar) != expected:
        raise WaveformFormatError(f"the body holds {len(planar)} bytes, not {expected}")
    if not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        raise WaveformFormatError("the body does not end where it should")
    bands = [
        planar[index * columns : (index + 1) * columns] for index in range(BAND_COUNT)
    ]
    return Waveform(columns, duration_ms, _interleave(bands, columns))


def _interleave(bands: Sequence[Sequence[int]], columns: int) -> bytes:
    """Four bands' values as columns of four bytes."""
    out = bytearray(columns * BAND_COUNT)
    for index, values in enumerate(bands):
        out[index::BAND_COUNT] = bytes(values)
    return bytes(out)


__all__: Sequence[str] = (
    "BANDS",
    "BAND_COUNT",
    "COLUMNS",
    "FORMAT_VERSION",
    "HEADER_BYTES",
    "LEVELS",
    "MAGIC",
    "MAX_DURATION_MS",
    "MIN_WIDTH",
    "Waveform",
    "WaveformFormatError",
    "compand",
    "decode",
    "downsample",
    "encode",
    "expand",
    "reduce",
    "spans",
)
