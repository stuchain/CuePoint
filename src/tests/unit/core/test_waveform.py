#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The shape of a waveform and its stored bytes (WAVE-02, DEC-117).

Pure, so these tests are about the ways a picture goes wrong without an error:

1. **A lost peak.** A column that averaged, or a span that skipped a sample at a
   boundary, would flatten the one transient a DJ looks for.
2. **A stretched or shifted track.** A short track that invented detail, or a
   long one that did not reach 1,200 columns, would place every mark wrongly.
3. **A partly drawn waveform.** A blob cut short, from another version, or
   corrupted must be refused whole.
4. **A silent rule change.** :data:`PINNED` holds the bytes of a fixed envelope
   to the current :data:`FORMAT_VERSION`, so an edit to the rules that forgets
   the version fails here, not in every library's stored waveforms.
"""

from __future__ import annotations

import hashlib
import math
import random
import struct
import zlib
from array import array

import pytest

from cuepoint.core import waveform as module
from cuepoint.core.waveform import (
    BAND_COUNT,
    BANDS,
    COLUMNS,
    FORMAT_VERSION,
    HEADER_BYTES,
    LEVELS,
    MAGIC,
    MIN_WIDTH,
    Waveform,
    WaveformFormatError,
    compand,
    decode,
    downsample,
    encode,
    expand,
    reduce,
    spans,
)


def bands_of(frames: int, seed: int = 7):
    """Four bands of ``frames`` random amplitudes, as the decoder types them."""
    generator = random.Random(seed)
    return [array("f", (generator.random() for _ in range(frames))) for _ in range(4)]


def random_waveform(columns: int = COLUMNS, seed: int = 3) -> Waveform:
    generator = random.Random(seed)
    data = bytes(generator.randrange(256) for _ in range(columns * BAND_COUNT))
    return Waveform(columns, 360_000, data)


class TestTheShape:
    def test_the_bands_are_the_decoders(self):
        from cuepoint.data import audio_decode

        assert BANDS == audio_decode.BANDS
        assert BAND_COUNT == 4

    def test_a_synthetic_envelope_reduces_to_the_expected_columns(self):
        # 2,400 samples over 1,200 columns: two samples a column. Band b's
        # value at sample i is known, so every column's maximum is too.
        frames = 2_400
        bands = [[((i * (b + 1)) % 97) / 96 for i in range(frames)] for b in range(4)]

        result = reduce(bands, 16_000)

        assert result.columns == COLUMNS
        assert result.duration_ms == 16_000
        for b, name in enumerate(BANDS):
            expected = bytes(
                compand(max(bands[b][2 * c], bands[b][2 * c + 1]))
                for c in range(COLUMNS)
            )
            assert result.band(name) == expected

    def test_the_column_layout_is_full_low_mid_high(self):
        frames = 1_200
        bands = [[level] * frames for level in (1.0, 0.25, 0.04, 0.0)]

        result = reduce(bands, 8_000)

        assert result.data[:8] == bytes([255, 128, 51, 0, 255, 128, 51, 0])

    def test_the_maximum_rule_holds_across_column_boundaries(self):
        # A single peak placed at every sample in turn is always in exactly one
        # column, the one whose span holds it, and no other column sees it.
        frames = 3_601
        ranges = spans(frames, COLUMNS)
        for position in (0, 1, 2, 3, 1_799, 1_800, 1_801, 3_599, 3_600):
            band = [0.0] * frames
            band[position] = 1.0
            result = reduce([band] * 4, 1)
            full = result.band("full")
            owners = [c for c, (s, e) in enumerate(ranges) if s <= position < e]
            assert len(owners) == 1
            assert [c for c, v in enumerate(full) if v] == owners

    def test_every_sample_is_in_exactly_one_column(self):
        for frames in (1_200, 1_201, 1_799, 2_400, 54_000, 2_160_000):
            ranges = spans(frames, COLUMNS)
            assert ranges[0][0] == 0
            assert ranges[-1][1] == frames
            for (_, end), (start, _) in zip(ranges, ranges[1:]):
                assert end == start

    def test_a_short_track_repeats_rather_than_inventing(self):
        # 300 samples (2 s): each sample is repeated across four columns, and
        # nothing between two samples is made up.
        frames = 300
        band = [i / (frames - 1) for i in range(frames)]

        result = reduce([band] * 4, 2_000)

        full = result.band("full")
        assert len(full) == COLUMNS
        assert full == bytes(
            compand(band[c * frames // COLUMNS]) for c in range(COLUMNS)
        )
        assert set(full) == {compand(value) for value in band}

    def test_a_two_second_and_a_four_hour_track_both_give_1200_columns(self):
        rate = 150
        for seconds in (2, 4 * 3600):
            frames = seconds * rate
            bands = [array("f", bytes(4 * frames)) for _ in range(4)]
            bands[0][frames - 1] = 1.0
            result = reduce(bands, seconds * 1000)
            assert result.columns == COLUMNS
            assert len(result.data) == COLUMNS * 4
            assert result.duration_ms == seconds * 1000
            # The last sample lands in the last column.
            assert result.band("full")[-1] == LEVELS

    def test_there_is_no_normalisation(self):
        quiet = reduce([[0.01] * 1_200] * 4, 1)
        loud = reduce([[0.64] * 1_200] * 4, 1)

        assert set(quiet.data) == {26}
        assert set(loud.data) == {204}

    def test_one_sample_fills_every_column(self):
        result = reduce([[0.25]] * 4, 7)

        assert result.data == bytes([128]) * (COLUMNS * 4)

    @pytest.mark.parametrize(
        "bands, message",
        [
            ([[0.1]] * 3, "4 bands"),
            ([[0.1], [0.1], [0.1], [0.1, 0.2]], "differ"),
            ([[]] * 4, "no samples"),
        ],
    )
    def test_a_malformed_envelope_is_refused(self, bands, message):
        with pytest.raises(ValueError, match=message):
            reduce(bands, 1)


class TestCompanding:
    def test_the_rule(self):
        assert compand(0.0) == 0
        assert compand(1.0) == 255
        assert compand(0.25) == 128
        assert compand(0.707) == round(255 * math.sqrt(0.707))

    @pytest.mark.parametrize("value", [-0.5, float("nan"), float("-inf"), -0.0])
    def test_silence_for_anything_not_a_positive_amplitude(self, value):
        assert compand(value) == 0

    @pytest.mark.parametrize("value", [1.0001, 4.0, float("inf")])
    def test_clamped_above_full_scale(self, value):
        expected = 0 if math.isinf(value) else 255
        assert compand(value) == expected

    def test_every_level_round_trips(self):
        for level in range(LEVELS + 1):
            assert compand(expand(level)) == level

    def test_any_amplitude_round_trips_within_one_step(self):
        generator = random.Random(11)
        for _ in range(20_000):
            value = generator.random()
            level = compand(value)
            assert (
                abs(math.sqrt(expand(level)) - math.sqrt(value)) <= 0.5 / LEVELS + 1e-12
            )
            # And no nearer level exists.
            for other in (level - 1, level + 1):
                if 0 <= other <= LEVELS:
                    assert (
                        abs(other - LEVELS * math.sqrt(value))
                        >= abs(level - LEVELS * math.sqrt(value)) - 1e-9
                    )

    def test_quiet_passages_get_the_resolution(self):
        # Between -40 dB and -20 dB (0.01 to 0.1 amplitude) the square root
        # spends 55 levels; a linear byte would spend 23.
        assert compand(0.1) - compand(0.01) >= 50

    @pytest.mark.parametrize("level", [-1, 256])
    def test_expand_refuses_a_level_out_of_range(self, level):
        with pytest.raises(ValueError):
            expand(level)


class TestDownsampling:
    def test_every_width_from_16_to_1200_never_loses_a_peak(self):
        source = random_waveform()
        for width in range(MIN_WIDTH, COLUMNS + 1):
            result = downsample(source.data, width)
            assert len(result) == width * 4
            ranges = spans(COLUMNS, width)
            for b in range(4):
                values = source.data[b::4]
                out = result[b::4]
                # Each new column is the maximum of what it covers ...
                assert list(out) == [max(values[s:e]) for s, e in ranges]
                # ... so the loudest moment survives at every width.
                assert max(out) == max(values)

    @pytest.mark.parametrize("width", [16, 97, 120, 599, 600, 1_199])
    def test_extremes_side_by_side_never_borrow_from_a_neighbour(self, width):
        # The maximum is taken in 16-bit lanes of one integer; 0 beside 255,
        # and equal values, are where a borrow between lanes would show.
        patterns = [
            bytes([255, 0] * (COLUMNS * 2)),
            bytes([0, 255, 255, 0] * COLUMNS),
            bytes([255]) * (COLUMNS * 4),
            bytes(COLUMNS * 4),
            bytes((i * 37) % 256 for i in range(COLUMNS * 4)),
        ]
        ranges = spans(COLUMNS, width)
        for data in patterns:
            result = downsample(data, width)
            for b in range(4):
                values = data[b::4]
                assert list(result[b::4]) == [max(values[s:e]) for s, e in ranges]

    def test_a_column_is_moved_as_one_four_byte_word(self):
        assert memoryview(bytes(8)).cast(module._WORD).itemsize == 4

    def test_every_source_column_is_covered_by_one_new_column(self):
        for width in (16, 17, 119, 120, 121, 599, 600, 1_199):
            ranges = spans(COLUMNS, width)
            covered = [c for s, e in ranges for c in range(s, e)]
            assert covered == list(range(COLUMNS))

    def test_the_full_width_is_the_data_itself(self):
        source = random_waveform()

        assert downsample(source.data, COLUMNS) == source.data

    def test_a_single_peak_lands_in_the_column_covering_it(self):
        data = bytearray(COLUMNS * 4)
        data[4 * 1_000 + 2] = 200  # column 1000, mid band

        result = downsample(bytes(data), 120)

        assert result[4 * 100 + 2] == 200
        assert sum(1 for value in result if value) == 1

    @pytest.mark.parametrize("width", [0, 15, 1_201, True])
    def test_a_width_out_of_range_is_refused(self, width):
        with pytest.raises(ValueError, match="width"):
            downsample(random_waveform().data, width)

    @pytest.mark.parametrize("data", [b"", b"\x00\x01\x02"])
    def test_data_that_is_not_whole_columns_is_refused(self, data):
        with pytest.raises(ValueError, match="whole columns"):
            downsample(data, 16)


class TestTheEncodedForm:
    def test_encode_and_decode_round_trip(self):
        for columns, seed in ((COLUMNS, 1), (COLUMNS, 2), (16, 3), (1, 4)):
            original = random_waveform(columns, seed)
            assert decode(encode(original)) == original

    def test_the_header(self):
        blob = encode(Waveform(COLUMNS, 367_123, bytes(COLUMNS * 4)))

        assert len(blob) > HEADER_BYTES == 12
        assert blob[:4] == MAGIC == b"CPWF"
        assert blob[4] == FORMAT_VERSION
        assert blob[5] == 4
        assert struct.unpack("<H", blob[6:8]) == (COLUMNS,)
        assert struct.unpack("<I", blob[8:12]) == (367_123,)

    def test_the_body_holds_each_band_in_turn(self):
        original = random_waveform()

        body = zlib.decompress(encode(original)[HEADER_BYTES:])

        assert body == b"".join(original.band(name) for name in BANDS)

    def test_a_long_duration_fits(self):
        original = Waveform(COLUMNS, 4 * 3600 * 1000, bytes(COLUMNS * 4))

        assert decode(encode(original)).duration_ms == 14_400_000

    def test_a_truncated_blob_is_refused(self):
        blob = encode(random_waveform())
        for cut in (0, 4, 11, 12, 13, len(blob) // 2, len(blob) - 1):
            with pytest.raises(WaveformFormatError):
                decode(blob[:cut])

    def test_another_version_is_refused(self):
        blob = bytearray(encode(random_waveform()))
        for version in (0, FORMAT_VERSION + 1, 255):
            blob[4] = version
            with pytest.raises(WaveformFormatError, match="version"):
                decode(bytes(blob))

    def test_a_foreign_header_is_refused(self):
        blob = encode(random_waveform())

        with pytest.raises(WaveformFormatError, match="not a CuePoint"):
            decode(b"RIFF" + blob[4:])
        with pytest.raises(WaveformFormatError, match="bands"):
            decode(blob[:5] + b"\x03" + blob[6:])
        with pytest.raises(WaveformFormatError, match="no columns"):
            decode(blob[:6] + b"\x00\x00" + blob[8:])

    def test_a_header_that_disagrees_with_the_body_is_refused(self):
        blob = encode(random_waveform())
        for columns in (COLUMNS - 1, COLUMNS + 1, 600):
            wrong = blob[:6] + struct.pack("<H", columns) + blob[8:]
            with pytest.raises(WaveformFormatError, match="holds"):
                decode(wrong)

    def test_a_corrupted_body_is_refused_by_its_checksum(self):
        blob = encode(random_waveform())
        refused = 0
        for position in range(HEADER_BYTES + 2, len(blob), 97):
            corrupted = bytearray(blob)
            corrupted[position] ^= 0x5A
            with pytest.raises(WaveformFormatError):
                decode(bytes(corrupted))
            refused += 1
        assert refused > 20

    def test_trailing_bytes_are_refused(self):
        blob = encode(random_waveform())

        with pytest.raises(WaveformFormatError, match="end"):
            decode(blob + b"\x00")

    def test_a_valid_body_with_trailing_zlib_stream_is_refused(self):
        blob = encode(random_waveform())

        with pytest.raises(WaveformFormatError):
            decode(blob + zlib.compress(b"more"))


class TestTheWaveformType:
    @pytest.mark.parametrize(
        "columns, duration, data, error",
        [
            (0, 1, b"", ValueError),
            (65_536, 1, b"", ValueError),
            (True, 1, b"\x00" * 4, ValueError),
            (1, -1, b"\x00" * 4, ValueError),
            (1, 2**32, b"\x00" * 4, ValueError),
            (1, 1, b"\x00" * 3, ValueError),
            (1, 1, "abcd", TypeError),
        ],
    )
    def test_an_impossible_waveform_is_refused(self, columns, duration, data, error):
        with pytest.raises(error):
            Waveform(columns, duration, data)

    def test_bytearray_data_is_frozen_as_bytes(self):
        result = Waveform(1, 1, bytearray(4))

        assert type(result.data) is bytes

    def test_an_unknown_band_is_refused(self):
        with pytest.raises(ValueError):
            random_waveform().band("sub")


#: SHA-256 of the header and the uncompressed body of :func:`pinned_envelope`'s
#: stored form, at the current FORMAT_VERSION. The compressed bytes are not
#: pinned: another build of zlib may compress the same body differently, and
#: that is not a rule change. If this fails, a rule changed: bump
#: FORMAT_VERSION (and then this value), so stored waveforms of the old rules
#: are analysed again.
PINNED = {1: "1873d3328fbc9a1c1e25397d83d5dee98efe1e69e2cd0d4c7d89de65b5ab4d7e"}


def pinned_envelope():
    """A deterministic envelope with peaks, silence and every band distinct."""
    frames = 54_000  # six minutes at 150 Hz
    bands = []
    for b in range(4):
        band = array("f")
        for i in range(frames):
            beat = (i % 70) / 70
            # Arithmetic only, no libm: identical on every platform.
            shape = ((i * (17 + 6 * b)) % 211) / 210
            band.append(shape * (1 - beat) * (0.2 + 0.2 * b))
        bands.append(band)
    return bands


def test_the_rules_are_pinned_to_the_format_version():
    blob = encode(reduce(pinned_envelope(), 360_000))

    assert FORMAT_VERSION in PINNED, "a new FORMAT_VERSION needs a pinned digest"
    digest = hashlib.sha256(blob[:HEADER_BYTES] + zlib.decompress(blob[HEADER_BYTES:]))
    assert digest.hexdigest() == PINNED[FORMAT_VERSION]


def test_the_module_exports_what_it_names():
    for name in module.__all__:
        assert hasattr(module, name), name
