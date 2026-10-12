#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The zoomed waveform's shape and stored bytes (T4, ADR-011).

Pure, so these tests are about the ways a detail goes wrong without an error:

1. **A lost peak.** A span maximum that skipped a sample, at an odd length or a
   boundary, would flatten the transient a DJ lines a beat grid up with.
2. **A shifted track.** A column count that drifts from the rate places every
   beat line wrongly.
3. **A count that overflows.** The overview's ``u16`` holds 65,535 columns; at
   75 a second a 15 minute track has 67,500.
4. **A partly drawn waveform.** A blob cut short, foreign or corrupted is
   refused whole.
5. **A silent rule change.** :data:`PINNED` holds a fixed envelope's bytes to
   the current format version.
"""

from __future__ import annotations

import hashlib
import struct
import zlib
from array import array

import pytest

from cuepoint.core import waveform_detail as module
from cuepoint.core.waveform import BAND_COUNT, WaveformFormatError, compand
from cuepoint.core.waveform_detail import (
    DETAIL_FORMAT_VERSION,
    DETAIL_HEADER_BYTES,
    DETAIL_MAGIC,
    DETAIL_RATE_HZ,
    SOURCE_RATE_HZ,
    WaveformDetail,
    decode_detail,
    encode_detail,
    reduce_detail,
)

pytestmark = pytest.mark.unit


def flat(frames: int, level: float = 0.25):
    return [array("f", [level] * frames) for _ in range(4)]


def test_the_rates_agree_with_the_decoder():
    from cuepoint.data.audio_decode import ENVELOPE_RATE_HZ

    assert SOURCE_RATE_HZ == ENVELOPE_RATE_HZ
    assert DETAIL_RATE_HZ == 75
    assert DETAIL_HEADER_BYTES == 16


class TestReduce:
    def test_halves_the_150_hz_envelope_to_75_columns_a_second(self):
        detail = reduce_detail(flat(1_500), 10_000)

        assert (detail.rate_hz, detail.columns, detail.duration_ms) == (75, 750, 10_000)
        assert len(detail.data) == 750 * BAND_COUNT
        assert set(detail.data) == {compand(0.25)}

    def test_each_column_is_the_highest_of_its_two_samples(self):
        full = array("f", [0.0, 0.0625, 0.25, 0.0625, 0.0, 0.5625])
        detail = reduce_detail([full, full, full, full], 40)

        assert list(detail.band("full")) == [
            compand(0.0625),
            compand(0.25),
            compand(0.5625),
        ]

    def test_a_one_sample_peak_survives_at_either_position_in_its_span(self):
        for position in (0, 1, 2, 3, 998, 999):
            band = array("f", [0.0] * 1_000)
            band[position] = 1.0
            detail = reduce_detail([band, band, band, band], 6_667)
            peaks = [i for i, v in enumerate(detail.band("mid")) if v == 255]
            assert peaks == [position // 2], position

    def test_an_odd_length_keeps_its_last_sample(self):
        band = array("f", [0.0, 0.0, 0.0, 0.0, 1.0])
        detail = reduce_detail([band] * 4, 33)

        assert detail.columns == 3
        assert list(detail.band("high")) == [0, 0, 255]

    def test_a_single_sample_is_one_column(self):
        detail = reduce_detail(flat(1), 7)

        assert detail.columns == 1

    def test_bands_stay_in_the_order_full_low_mid_high(self):
        bands = [array("f", [level] * 10) for level in (1.0, 0.25, 0.0625, 0.0)]
        detail = reduce_detail(bands, 66)

        assert list(detail.data[:4]) == [255, compand(0.25), compand(0.0625), 0]

    def test_a_rate_that_does_not_divide_uses_spans_and_loses_no_peak(self):
        band = array("f", [0.0] * 100)
        band[37] = 1.0
        detail = reduce_detail([band] * 4, 1_000, source_rate_hz=100, rate_hz=30)

        assert detail.columns == 30
        assert detail.band("full").count(255) == 1

    def test_the_same_rate_is_a_companded_copy(self):
        band = array("f", [0.0, 0.25, 1.0])
        detail = reduce_detail([band] * 4, 20, source_rate_hz=75, rate_hz=75)

        assert list(detail.band("full")) == [0, compand(0.25), 255]

    def test_the_fast_route_is_compand_exactly(self):
        import random

        generator = random.Random(7)
        ordinary = [generator.random() ** 3 for _ in range(5_000)]
        ordinary += [0.0, 1.0, 0.25, 0.0625, 255 * 255 / 65025]
        odd = [
            [float("nan"), 0.5],
            [float("inf"), 0.5],
            [-0.5, 0.5],
            [2.0, 0.5],
            [0.0, 0.0],
        ]
        for values in (ordinary, *odd):
            band = array("d", values)
            detail = reduce_detail([band] * 4, 100, source_rate_hz=75, rate_hz=75)
            assert list(detail.band("full")) == [compand(v) for v in values]

    @pytest.mark.parametrize("bands", [[], flat(5)[:3]])
    def test_refuses_the_wrong_number_of_bands(self, bands):
        with pytest.raises(ValueError):
            reduce_detail(bands, 10)

    def test_refuses_bands_of_different_lengths(self):
        bands = flat(10)
        bands[2] = array("f", [0.1] * 9)
        with pytest.raises(ValueError):
            reduce_detail(bands, 10)

    def test_refuses_no_samples(self):
        with pytest.raises(ValueError):
            reduce_detail(flat(0), 0)

    def test_refuses_a_rate_of_zero(self):
        with pytest.raises(ValueError):
            reduce_detail(flat(10), 10, rate_hz=0)


class TestTheDetail:
    @pytest.mark.parametrize(
        "args",
        [
            (0, 1, 1, b"\0" * 4),
            (75, 0, 1, b""),
            (75, 1, -1, b"\0" * 4),
            (75, 2, 1, b"\0" * 4),
        ],
    )
    def test_refuses_what_does_not_add_up(self, args):
        with pytest.raises(ValueError):
            WaveformDetail(*args)

    def test_refuses_data_that_is_not_bytes(self):
        with pytest.raises(TypeError):
            WaveformDetail(75, 1, 1, "abcd")  # type: ignore[arg-type]


class TestEncoding:
    def test_round_trips(self):
        detail = reduce_detail(flat(3_000, 0.5), 20_000)

        assert decode_detail(encode_detail(detail)) == detail

    def test_the_header_is_sixteen_bytes_with_a_u32_column_count(self):
        detail = reduce_detail(flat(300), 2_000)
        blob = encode_detail(detail)

        assert struct.unpack_from("<4sBBHII", blob) == (
            DETAIL_MAGIC,
            DETAIL_FORMAT_VERSION,
            4,
            75,
            150,
            2_000,
        )

    def test_a_column_count_beyond_65535_is_stored_and_read_back(self):
        """A 20 minute track: 90,000 columns, past the overview's u16."""
        columns = 90_000
        data = bytes((i * 7) % 256 for i in range(columns * 4))
        detail = WaveformDetail(75, columns, 1_200_000, data)

        back = decode_detail(encode_detail(detail))

        assert back.columns == 90_000
        assert back.data == data

    def test_a_fifteen_minute_envelope_reduces_stores_and_reads_back(self):
        frames = 15 * 60 * SOURCE_RATE_HZ
        band = array("f", ((i * 31) % 97 / 97 for i in range(frames)))
        detail = reduce_detail([band] * 4, 900_000)

        assert detail.columns == 67_500 > 0xFFFF
        assert decode_detail(encode_detail(detail)) == detail

    def test_refuses_a_bad_magic(self):
        blob = bytearray(encode_detail(reduce_detail(flat(100), 700)))
        blob[:4] = b"CPWF"
        with pytest.raises(WaveformFormatError, match="not a CuePoint"):
            decode_detail(bytes(blob))

    def test_refuses_another_version(self):
        blob = bytearray(encode_detail(reduce_detail(flat(100), 700)))
        blob[4] = DETAIL_FORMAT_VERSION + 1
        with pytest.raises(WaveformFormatError, match="version"):
            decode_detail(bytes(blob))

    def test_refuses_another_band_count(self):
        blob = bytearray(encode_detail(reduce_detail(flat(100), 700)))
        blob[5] = 3
        with pytest.raises(WaveformFormatError, match="bands"):
            decode_detail(bytes(blob))

    def test_refuses_a_header_alone(self):
        with pytest.raises(WaveformFormatError):
            decode_detail(b"CPWD")

    def test_refuses_a_column_count_the_body_does_not_match(self):
        blob = bytearray(encode_detail(reduce_detail(flat(100), 700)))
        struct.pack_into("<I", blob, 8, 51)
        with pytest.raises(WaveformFormatError):
            decode_detail(bytes(blob))
        struct.pack_into("<I", blob, 8, 49)
        with pytest.raises(WaveformFormatError):
            decode_detail(bytes(blob))

    def test_refuses_zero_columns(self):
        blob = bytearray(encode_detail(reduce_detail(flat(100), 700)))
        struct.pack_into("<I", blob, 8, 0)
        with pytest.raises(WaveformFormatError):
            decode_detail(bytes(blob))

    def test_refuses_a_cut_body(self):
        blob = encode_detail(reduce_detail(flat(2_000, 0.3), 13_000))
        with pytest.raises(WaveformFormatError):
            decode_detail(blob[:-6])

    def test_refuses_a_corrupt_checksum(self):
        blob = bytearray(encode_detail(reduce_detail(flat(2_000, 0.3), 13_000)))
        blob[-1] ^= 0xFF
        with pytest.raises(WaveformFormatError):
            decode_detail(bytes(blob))

    def test_refuses_bytes_after_the_body(self):
        blob = encode_detail(reduce_detail(flat(100), 700)) + b"x"
        with pytest.raises(WaveformFormatError):
            decode_detail(blob)

    def test_refuses_a_body_that_is_not_zlib(self):
        blob = encode_detail(reduce_detail(flat(100), 700))[:16] + b"not zlib at all"
        with pytest.raises(WaveformFormatError):
            decode_detail(blob)

    def test_the_overview_and_detail_cannot_be_mistaken_for_each_other(self):
        from cuepoint.core.waveform import decode, encode, reduce

        overview = encode(reduce(flat(3_000), 20_000))
        detail = encode_detail(reduce_detail(flat(3_000), 20_000))
        with pytest.raises(WaveformFormatError):
            decode_detail(overview)
        with pytest.raises(WaveformFormatError):
            decode(detail)


#: The SHA-256 of the header and the decompressed body of :func:`pinned_envelope`'s
#: detail, at the current format version. The compressed bytes are not pinned:
#: another zlib may compress the same body differently. If this fails, a rule
#: changed: bump DETAIL_FORMAT_VERSION (and then this value), so stored details
#: of the old rules are made again.
PINNED = {1: "443fc5e9442e3bb617bce1f135249213ba2b014ca3dd3027fc5e42b94c16515c"}


def pinned_envelope():
    frames = 54_000  # six minutes at 150 Hz
    bands = []
    for b in range(4):
        band = array("f")
        for i in range(frames):
            beat = (i % 70) / 70
            shape = ((i * (17 + 6 * b)) % 211) / 210
            band.append(shape * (1 - beat) * (0.2 + 0.2 * b))
        bands.append(band)
    return bands


def test_the_rules_are_pinned_to_the_format_version():
    blob = encode_detail(reduce_detail(pinned_envelope(), 360_000))

    assert DETAIL_FORMAT_VERSION in PINNED, "a new version needs a pinned digest"
    digest = hashlib.sha256(
        blob[:DETAIL_HEADER_BYTES] + zlib.decompress(blob[DETAIL_HEADER_BYTES:])
    )
    assert digest.hexdigest() == PINNED[DETAIL_FORMAT_VERSION]


def test_the_module_exports_what_it_names():
    for name in module.__all__:
        assert hasattr(module, name), name
