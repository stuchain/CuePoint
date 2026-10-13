#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The wire format between the engine and its analysis worker (C19g).

Pure: lines in, objects out. What matters is that a :class:`Computed` survives
the trip byte for byte, whatever its outcome, and that anything else on the
wire is refused with ``ValueError`` rather than reaching the store.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cuepoint.data.audio_decode import (
    ANALYSIS_VERSION,
    LOUDNESS_NOT_MEASURED,
    LOUDNESS_SILENT,
    LOUDNESS_TOO_QUIET,
    LOUDNESS_VERSION,
    NOT_MEASURED,
    REASON_DECODER_MISSING,
    REASON_NO_AUDIO,
    REASON_UNDECODABLE,
    Loudness,
)
from cuepoint.core.waveform_detail import DETAIL_FORMAT_VERSION
from cuepoint.services import analysis_protocol as wire
from cuepoint.services.waveform_computer import (
    COMPUTED_CANCELLED,
    COMPUTED_FAILED,
    COMPUTED_FILE_GONE,
    COMPUTED_READY,
    COMPUTED_UNAVAILABLE,
    Computed,
)

pytestmark = pytest.mark.unit

VALUE = Loudness(-8.4, -0.3, None)

COMPUTEDS = {
    "ready with both": Computed(
        COMPUTED_READY,
        overview=b"CPWF\x00\x01\xff\xfe" * 40,
        duration_ms=215_000,
        loudness=VALUE,
        detail=bytes(range(256)) * 9,
        decode_errors=2,
    ),
    "ready, overview only": Computed(
        COMPUTED_READY, overview=b"\x00\x01", duration_ms=1, loudness=VALUE
    ),
    "ready, detail only": Computed(
        COMPUTED_READY, loudness=VALUE, detail=b"\x01\x02\x03"
    ),
    "failed": Computed(COMPUTED_FAILED, REASON_UNDECODABLE),
    "failed, no audio": Computed(COMPUTED_FAILED, REASON_NO_AUDIO),
    "file gone": Computed(COMPUTED_FILE_GONE),
    "cancelled": Computed(COMPUTED_CANCELLED),
    "unavailable": Computed(COMPUTED_UNAVAILABLE, REASON_DECODER_MISSING),
}

LOUDNESSES = {
    "a value": VALUE,
    "too quiet, with its peak": Loudness(None, -41.2, LOUDNESS_TOO_QUIET),
    "too quiet, no peak": Loudness(None, None, LOUDNESS_TOO_QUIET),
    "silent": Loudness(None, None, LOUDNESS_SILENT),
    "not measured": Loudness(None, None, LOUDNESS_NOT_MEASURED),
}


def _wire(line: bytes) -> dict:
    assert line.endswith(b"\n")
    assert line.count(b"\n") == 1
    line.decode("ascii")  # json.dumps(ensure_ascii=True): no byte above 0x7f
    return json.loads(line)


class TestHello:
    def test_it_names_every_version_that_decides_the_bytes(self):
        assert wire.hello() == {
            "hello": wire.PROTOCOL_VERSION,
            "analysis_version": ANALYSIS_VERSION,
            "loudness_version": LOUDNESS_VERSION,
            "detail_version": DETAIL_FORMAT_VERSION,
        }

    def test_it_matches_itself_after_the_wire(self):
        assert wire.hello_matches(json.loads(json.dumps(wire.hello())))

    @pytest.mark.parametrize(
        "field",
        ["hello", "analysis_version", "loudness_version", "detail_version"],
    )
    def test_a_different_version_is_a_different_worker(self, field):
        other = {**wire.hello(), field: wire.hello()[field] + 1}
        assert not wire.hello_matches(other)

    @pytest.mark.parametrize(
        "obj", [{}, {"hello": 1}, [], "hello", None, {"id": 1, "outcome": "ready"}]
    )
    def test_anything_else_is_no_hello(self, obj):
        assert not wire.hello_matches(obj)


class TestRequest:
    def test_it_round_trips(self):
        line = wire.request_line(7, "/music/a.flac", Path("/opt/mpv"), True, False)
        request = wire.parse_request(_wire(line))
        assert request == wire.Request(7, "/music/a.flac", "/opt/mpv", True, False)

    def test_a_path_with_spaces_and_beyond_ascii_comes_back_whole(self):
        path = "/Music/Björk – Jóga (Live) 日本語 \U0001f3b5.flac"
        line = wire.request_line(1, path, Path("/opt/m pv"), False, True)
        request = wire.parse_request(_wire(line))
        assert request.path == path
        assert request.decoder == "/opt/m pv"

    def test_a_cancel_is_its_own_line(self):
        assert wire.parse_cancel(_wire(wire.cancel_line(9))) == 9
        assert wire.parse_cancel(_wire(wire.request_line(9, "/a", "/m", 1, 0))) is None

    @pytest.mark.parametrize(
        "obj",
        [
            [],
            "x",
            None,
            {},
            {"id": 1},
            {
                "id": "1",
                "path": "/a",
                "decoder": "/m",
                "overview": True,
                "detail": True,
            },
            {
                "id": True,
                "path": "/a",
                "decoder": "/m",
                "overview": True,
                "detail": True,
            },
            {"id": 1, "path": 3, "decoder": "/m", "overview": True, "detail": True},
            {"id": 1, "path": "/a", "decoder": None, "overview": True, "detail": True},
            {"id": 1, "path": "/a", "decoder": "/m", "overview": "yes", "detail": True},
            {"id": 1, "path": "/a", "decoder": "/m", "overview": True},
        ],
    )
    def test_junk_is_refused(self, obj):
        with pytest.raises(ValueError):
            wire.parse_request(obj)

    @pytest.mark.parametrize(
        "obj", [{"cancel": "1"}, {"cancel": True}, {"cancel": 1.5}]
    )
    def test_a_cancel_of_nothing_is_refused(self, obj):
        with pytest.raises(ValueError):
            wire.parse_cancel(obj)


class TestResult:
    @pytest.mark.parametrize("name", list(COMPUTEDS))
    def test_every_outcome_survives_the_trip(self, name):
        computed = COMPUTEDS[name]
        obj = _wire(wire.result_line(41, computed))
        assert wire.line_id(obj) == 41
        assert wire.parse_result(obj) == computed

    @pytest.mark.parametrize("name", list(LOUDNESSES))
    def test_every_loudness_survives_the_trip(self, name):
        computed = Computed(
            COMPUTED_READY, overview=b"\x01", duration_ms=5, loudness=LOUDNESSES[name]
        )
        back = wire.parse_result(_wire(wire.result_line(1, computed)))
        assert back.loudness == LOUDNESSES[name]

    def test_a_failure_not_measured_keeps_the_default_loudness(self):
        back = wire.parse_result(_wire(wire.result_line(1, COMPUTEDS["file gone"])))
        assert back.loudness == NOT_MEASURED

    def test_bytes_travel_as_base64_and_none_as_null(self):
        obj = _wire(wire.result_line(3, COMPUTEDS["ready, overview only"]))
        assert obj["overview"] == "AAE="
        assert obj["detail"] is None
        assert obj["decode_errors"] == 0

    @pytest.mark.parametrize(
        "change",
        [
            {"outcome": "exploded"},
            {"outcome": 3},
            {"overview": "***not base64***"},
            {"overview": 5},
            {"duration_ms": "long"},
            {"duration_ms": True},
            {"detail": []},
            {"decode_errors": -1},
            {"decode_errors": "none"},
            {"loudness": None},
            {"loudness": {"integrated_lufs": "loud", "peak_dbfs": 0.0, "reason": None}},
            # Loudness's own invariants: a value and a reason, never both.
            {
                "loudness": {
                    "integrated_lufs": -8.0,
                    "peak_dbfs": -1.0,
                    "reason": "silent",
                }
            },
            {
                "loudness": {
                    "integrated_lufs": None,
                    "peak_dbfs": None,
                    "reason": "weird",
                }
            },
            # Computed's: a failure says why.
            {"outcome": "failed", "reason": None},
        ],
    )
    def test_junk_is_refused(self, change):
        good = _wire(wire.result_line(1, COMPUTEDS["ready with both"]))
        with pytest.raises(ValueError):
            wire.parse_result({**good, **change})

    @pytest.mark.parametrize("missing", ["outcome", "loudness", "overview", "detail"])
    def test_a_missing_field_is_refused(self, missing):
        good = _wire(wire.result_line(1, COMPUTEDS["ready with both"]))
        del good[missing]
        with pytest.raises(ValueError):
            wire.parse_result(good)

    @pytest.mark.parametrize("obj", [[], "x", None, 3])
    def test_a_line_that_is_no_object_is_refused(self, obj):
        with pytest.raises(ValueError):
            wire.parse_result(obj)
        with pytest.raises(ValueError):
            wire.line_id(obj)

    @pytest.mark.parametrize("obj", [{}, {"id": "1"}, {"id": True}, {"id": None}])
    def test_an_answer_without_a_real_id_is_refused(self, obj):
        with pytest.raises(ValueError):
            wire.line_id(obj)


class TestError:
    def test_it_carries_the_id_and_the_message(self):
        obj = _wire(wire.error_line(5, "ValueError: boom é"))
        assert obj == {"id": 5, "error": "ValueError: boom é"}
        assert wire.line_id(obj) == 5
        assert wire.parse_error(obj) == "ValueError: boom é"

    def test_a_result_is_not_an_error(self):
        assert (
            wire.parse_error(_wire(wire.result_line(1, COMPUTEDS["cancelled"]))) is None
        )

    def test_a_non_string_error_is_refused(self):
        with pytest.raises(ValueError):
            wire.parse_error({"id": 1, "error": 5})


class TestReadingLines:
    def test_a_line_is_one_object(self):
        assert wire.loads(b'{"a": 1}\n') == {"a": 1}

    @pytest.mark.parametrize(
        "raw", [b"", b"\n", b"not json\n", b"\xff\xfe\n", b"[1]\n", b"3\n"]
    )
    def test_junk_is_refused(self, raw):
        with pytest.raises(ValueError):
            wire.loads(raw)
