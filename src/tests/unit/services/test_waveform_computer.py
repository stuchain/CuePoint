#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The in-process waveform computer (C19g).

With the decode replaced by a stand-in that answers each test's outcome, these
prove:

- **Every outcome of WAVE-01's vocabulary is a result,** never a raise.
- **A ready result carries exactly the bytes the codecs make** from the
  envelope, and only the pictures asked for.
- **Loudness and the decoder's error count are carried through.**
"""

from __future__ import annotations

from array import array
from pathlib import Path

import pytest

from cuepoint.core.waveform import encode, reduce
from cuepoint.core.waveform_detail import encode_detail, reduce_detail
from cuepoint.data.audio_decode import (
    REASON_DECODER_MISSING,
    REASON_NO_AUDIO,
    REASON_UNDECODABLE,
    DecodeCancelled,
    DecodeFailed,
    DecoderUnavailable,
    Envelope,
    FileGone,
    Loudness,
)
from cuepoint.services.waveform_computer import (
    COMPUTED_CANCELLED,
    COMPUTED_FAILED,
    COMPUTED_FILE_GONE,
    COMPUTED_READY,
    COMPUTED_UNAVAILABLE,
    Computed,
    InProcessComputer,
)

DECODER = Path("/opt/cuepoint/mpv")


def envelope(frames: int = 3_000, errors: int = 0, loudness=None) -> Envelope:
    bands = [
        array("f", [0.25 * (1 + (i % 7) / 7) / (b + 1) for i in range(frames)])
        for b in range(4)
    ]
    extra = {} if loudness is None else {"loudness": loudness}
    return Envelope(150, *bands, decode_errors=errors, **extra)


def computer_of(answer) -> InProcessComputer:
    def decode(source, decoder, cancel):
        if isinstance(answer, BaseException):
            raise answer
        return answer

    return InProcessComputer(decode)


def compute(answer, *, overview=True, detail=True) -> Computed:
    return computer_of(answer).compute(
        "/music/a.flac", DECODER, overview=overview, detail=detail
    )


@pytest.mark.unit
class TestOutcomes:
    def test_a_file_gone(self):
        assert compute(FileGone("/music/a.flac")) == Computed(COMPUTED_FILE_GONE)

    def test_a_cancel(self):
        assert compute(DecodeCancelled()) == Computed(COMPUTED_CANCELLED)

    def test_a_decoder_that_cannot_analyse(self):
        assert compute(DecoderUnavailable("x")) == Computed(
            COMPUTED_UNAVAILABLE, REASON_DECODER_MISSING
        )

    def test_a_failed_file_carries_its_reason(self):
        assert compute(DecodeFailed(REASON_UNDECODABLE, "x")) == Computed(
            COMPUTED_FAILED, REASON_UNDECODABLE
        )

    def test_no_frames_is_no_audio(self):
        assert compute(envelope(frames=0)) == Computed(COMPUTED_FAILED, REASON_NO_AUDIO)

    def test_the_decoder_and_cancel_reach_the_decode(self):
        seen = []

        def decode(source, decoder, cancel):
            seen.append((source, decoder, cancel))
            return envelope()

        def cancel():
            return False

        InProcessComputer(decode).compute(
            "/music/a.flac", DECODER, overview=True, detail=False, cancel=cancel
        )

        assert seen == [("/music/a.flac", DECODER, cancel)]


@pytest.mark.unit
class TestReady:
    def test_the_bytes_are_what_the_codecs_make(self):
        made = envelope()
        bands = [made.full, made.low, made.mid, made.high]
        waveform = reduce(bands, made.duration_ms)

        computed = compute(made)

        assert computed.outcome == COMPUTED_READY
        assert computed.reason is None
        assert computed.overview == encode(waveform)
        assert computed.duration_ms == waveform.duration_ms == 20_000
        assert computed.detail == encode_detail(reduce_detail(bands, 20_000))

    def test_no_overview_asked_gives_none(self):
        computed = compute(envelope(), overview=False)

        assert computed.overview is None and computed.duration_ms is None
        assert computed.detail is not None

    def test_no_detail_asked_gives_none(self):
        computed = compute(envelope(), detail=False)

        assert computed.detail is None
        assert computed.overview is not None

    def test_neither_asked_is_still_ready(self):
        computed = compute(envelope(), overview=False, detail=False)

        assert computed.outcome == COMPUTED_READY
        assert computed.overview is None and computed.detail is None

    def test_loudness_and_errors_are_carried(self):
        reading = Loudness(-14.0, -1.0, None)

        computed = compute(envelope(errors=3, loudness=reading))

        assert computed.loudness == reading
        assert computed.decode_errors == 3


@pytest.mark.unit
def test_an_unknown_outcome_is_refused():
    with pytest.raises(ValueError):
        Computed("exploded")


def test_a_failed_computation_says_why():
    with pytest.raises(ValueError):
        Computed(COMPUTED_FAILED)
