#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The zoomed waveform's shape, and the bytes it is stored as (T4, ADR-011).

Pure: no file, no database, no decoder. The overview (``core/waveform.py``)
keeps 1,200 columns whatever the track's length, about 3 a second on a six
minute track: too coarse to draw the 16 seconds around the playhead. The decoder
already makes a 150 a second envelope and the overview throws it away. This
module keeps :data:`DETAIL_RATE_HZ` (75) columns a second of it, in a format of
its own.

The shape
---------
- **75 columns a second,** as many as the longest strip the app draws (1,200
  units over 16 seconds) can show at one column to a unit. More would only be
  thrown away by the layout.
- **Four bytes a column,** as the overview: full, low, mid, high. Each is the
  highest envelope value over the column's span, so a short peak is never
  averaged away, companded with the overview's own ``round(255 × √v)``.
- **Planar and compressed,** as the overview: each band's columns in turn, then
  ``zlib`` level 6.

The encoded form
----------------
A 16-byte header, then the body:

====== ===== ==========================================
Offset Bytes Meaning
====== ===== ==========================================
0      4     the magic ``CPWD``
4      1     :data:`DETAIL_FORMAT_VERSION`
5      1     the band count, 4
6      2     the columns a second, little-endian ``u16``
8      4     the column count, ``u32``
12     4     the duration in milliseconds, ``u32``
====== ===== ==========================================

The column count is a ``u32`` because the overview's ``u16`` cannot hold even a
15 minute track at 75 a second (67,500 columns). A separate format, rather than
``CPWF`` version 2, keeps every stored overview valid: no library is analysed
again for this.

:func:`decode_detail` refuses anything that does not add up, as
:func:`cuepoint.core.waveform.decode` does: a foreign or short header, another
version, a body that does not decompress to exactly the size the header
states, or one ``zlib``'s checksum rejects.
"""

from __future__ import annotations

import math
import struct
import zlib
from dataclasses import dataclass
from itertools import repeat
from operator import mul
from typing import Sequence

from cuepoint.core.waveform import (
    BAND_COUNT,
    BANDS,
    MAX_DURATION_MS,
    ZLIB_LEVEL,
    WaveformFormatError,
    compand,
    spans,
)

#: The envelope's rate the decoder makes (``data/audio_decode.py``'s
#: ``ENVELOPE_RATE_HZ``; a test holds the two together).
SOURCE_RATE_HZ = 150

#: Columns a second.
DETAIL_RATE_HZ = 75

#: The encoded form's first four bytes.
DETAIL_MAGIC = b"CPWD"

#: The encoded form's version: the rate, the maximum rule, the companding and
#: the layout. Change any of them and change the number.
DETAIL_FORMAT_VERSION = 1

#: The most columns a header can carry.
MAX_COLUMNS = 2**32 - 1

_HEADER = struct.Struct("<4sBBHII")

#: The header's size in bytes.
DETAIL_HEADER_BYTES = _HEADER.size


@dataclass(frozen=True)
class WaveformDetail:
    """A track's zoomed waveform.

    Attributes:
        rate_hz: Columns a second.
        columns: How many columns.
        duration_ms: The track's decoded length.
        data: ``columns × 4`` bytes: each column's full, low, mid and high.
    """

    rate_hz: int
    columns: int
    duration_ms: int
    data: bytes

    def __post_init__(self) -> None:
        """Validate the detail."""
        if isinstance(self.rate_hz, bool) or not 1 <= int(self.rate_hz) <= 0xFFFF:
            raise ValueError(f"rate_hz must be 1 to 65535, not {self.rate_hz!r}")
        if isinstance(self.columns, bool) or not 1 <= int(self.columns) <= MAX_COLUMNS:
            raise ValueError(
                f"columns must be 1 to {MAX_COLUMNS}, not {self.columns!r}"
            )
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


def reduce_detail(
    bands: Sequence[Sequence[float]],
    duration_ms: int,
    source_rate_hz: int = SOURCE_RATE_HZ,
    rate_hz: int = DETAIL_RATE_HZ,
) -> WaveformDetail:
    """Reduce an envelope's four bands to ``rate_hz`` columns a second.

    Each column is the highest envelope value over its span, companded. When
    ``source_rate_hz`` is a whole multiple of ``rate_hz``, the spans are equal
    and the maximum is one ``map(max, ...)`` over strided slices; otherwise the
    spans are divided as the overview's are.

    Args:
        bands: The full, low, mid and high bands, all the same length.
        duration_ms: The decoded length.
        source_rate_hz: The envelope's samples a second.
        rate_hz: The columns a second.

    Raises:
        ValueError: If there are not four bands, they differ in length, they
            are empty, or a rate is not positive.
    """
    if len(bands) != BAND_COUNT:
        raise ValueError(f"A waveform has {BAND_COUNT} bands, not {len(bands)}")
    if source_rate_hz <= 0 or rate_hz <= 0:
        raise ValueError("The rates must be positive")
    frames = len(bands[0])
    if frames == 0:
        raise ValueError("There are no samples to divide")
    if any(len(band) != frames for band in bands):
        raise ValueError("The bands differ in length")
    columns = max(1, math.ceil(frames * rate_hz / source_rate_hz))
    ratio, remainder = divmod(source_rate_hz, rate_hz)
    reduced = [
        _levels(_highest(band, frames, columns, ratio, remainder)) for band in bands
    ]
    out = bytearray(columns * BAND_COUNT)
    for index, values in enumerate(reduced):
        out[index::BAND_COUNT] = values
    return WaveformDetail(rate_hz, columns, duration_ms, bytes(out))


def _levels(values: Sequence[float]) -> bytes:
    """``compand`` of every value, as bytes.

    A band of ordinary envelope values (finite, from 0 to 1) is companded by
    four C-level maps, twice as fast as calling :func:`compand` for each, with
    the very same arithmetic. Anything else, silence aside, takes the plain
    route and its clamps.
    """
    if values and min(values) >= 0.0 and max(values) <= 1.0:
        if math.isfinite(sum(values)):
            return bytes(map(round, map(mul, repeat(255.0), map(math.sqrt, values))))
    return bytes(map(compand, values))


def _highest(
    band: Sequence[float], frames: int, columns: int, ratio: int, remainder: int
) -> Sequence[float]:
    """The highest value of each of ``columns`` spans over ``band``."""
    if remainder == 0 and ratio >= 1:
        if ratio == 1:
            return band
        padded = columns * ratio - frames
        if padded:
            # A last span of fewer samples: repeating its last one changes
            # nothing a maximum sees.
            band = [*band, *([band[-1]] * padded)]
        return list(map(max, *(band[i::ratio] for i in range(ratio))))
    return [max(band[start:end]) for start, end in spans(frames, columns)]


def encode_detail(detail: WaveformDetail) -> bytes:
    """The stored form: the header, then the body compressed."""
    header = _HEADER.pack(
        DETAIL_MAGIC,
        DETAIL_FORMAT_VERSION,
        BAND_COUNT,
        detail.rate_hz,
        detail.columns,
        detail.duration_ms,
    )
    planar = b"".join(detail.band(name) for name in BANDS)
    return header + zlib.compress(planar, ZLIB_LEVEL)


def decode_detail(blob: bytes) -> WaveformDetail:
    """A detail from its stored form.

    Raises:
        WaveformFormatError: If the header, the length or the checksum does not
            add up.
    """
    if len(blob) < DETAIL_HEADER_BYTES:
        raise WaveformFormatError("shorter than a header")
    magic, version, band_count, rate_hz, columns, duration_ms = _HEADER.unpack_from(
        blob
    )
    if magic != DETAIL_MAGIC:
        raise WaveformFormatError("not a CuePoint detail waveform")
    if version != DETAIL_FORMAT_VERSION:
        raise WaveformFormatError(
            f"format version {version!r}, not {DETAIL_FORMAT_VERSION}"
        )
    if band_count != BAND_COUNT:
        raise WaveformFormatError(f"{band_count} bands, not {BAND_COUNT}")
    if columns < 1:
        raise WaveformFormatError("no columns")
    if rate_hz < 1:
        raise WaveformFormatError("no rate")
    expected = columns * BAND_COUNT
    inflater = zlib.decompressobj()
    try:
        planar = inflater.decompress(blob[DETAIL_HEADER_BYTES:], expected + 1)
    except zlib.error as exc:
        raise WaveformFormatError(f"the body does not decompress: {exc}") from exc
    if len(planar) != expected:
        raise WaveformFormatError(f"the body holds {len(planar)} bytes, not {expected}")
    if not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        raise WaveformFormatError("the body does not end where it should")
    out = bytearray(expected)
    for index in range(BAND_COUNT):
        out[index::BAND_COUNT] = planar[index * columns : (index + 1) * columns]
    try:
        return WaveformDetail(rate_hz, columns, duration_ms, bytes(out))
    except ValueError as exc:
        raise WaveformFormatError(str(exc)) from exc


__all__: Sequence[str] = (
    "DETAIL_FORMAT_VERSION",
    "DETAIL_HEADER_BYTES",
    "DETAIL_MAGIC",
    "DETAIL_RATE_HZ",
    "MAX_COLUMNS",
    "SOURCE_RATE_HZ",
    "WaveformDetail",
    "decode_detail",
    "encode_detail",
    "reduce_detail",
)
