#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The waveform decoder: its command, its reading of the result, its child (WAVE-01).

Two kinds of test, neither of which needs mpv:

- **Pure.** The filter graph, the argument list, the transport, the log reader,
  the envelope parser and the decision a finished decode reaches, each from
  inputs written here.
- **A stub decoder.** A small Python script stands in for mpv and does what the
  test asks: writes a good envelope, the wrong output format, no log, an error,
  or sleeps. That makes the timeout, the cancel, the kill on shutdown and the
  lowered priority deterministic. It runs on macOS and Linux; Windows cannot
  execute a script by path, and desktop CI covers it there with the real
  binary (``test_audio_decode_binary.py``).

The tests that need a real decoder are in
``src/tests/integration/test_audio_decode_binary.py``.
"""

from __future__ import annotations

import json
import math
import random
import os
import re
import sys
import threading
import time
from array import array
from pathlib import Path
from typing import Dict, List, Optional

import pytest

from cuepoint.data import audio_decode as ad

pytestmark = pytest.mark.unit

_REPO = Path(__file__).resolve().parents[4]
_MANIFEST = _REPO / "scripts" / "player_sidecar_manifest.json"
_PLAYER_LAUNCH = _REPO / "apps" / "desktop-electron" / "electron" / "playerLaunch.ts"

posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="the stub decoder is a script run by path"
)


def _frame_bytes(frames: List[List[float]]) -> bytes:
    flat = array("f", [value for frame in frames for value in frame])
    return flat.tobytes()


def _log(*lines: str) -> str:
    return "".join(f"[   0.010]{line}\n" for line in lines)


GOOD_LOG = _log(
    "[i][cplayer]  (+) Audio --aid=1 (flac 1ch 22050Hz)",
    f"[i][cplayer] {ad.EXPECTED_OUTPUT}",
    "[i][cplayer] Exiting... (End of file)",
)


# ---------------------------------------------------------------------------
# The command
# ---------------------------------------------------------------------------


class TestFilterGraph:
    def test_it_is_built_from_the_named_constants(self):
        graph = ad.filter_graph()
        assert f"aresample={ad.DECODE_RATE_HZ}:ochl=mono:rematrix_maxval=1" in graph
        assert f"lowpass=f={ad.LOW_CROSSOVER_HZ}:p=2" in graph
        assert f"highpass=f={ad.HIGH_CROSSOVER_HZ}:p=2" in graph
        assert f"join=inputs=4:channel_layout={ad.CHANNEL_LAYOUT}" in graph
        assert f"aresample={ad.ENVELOPE_RATE_HZ}," in graph

    def test_it_hands_the_decoder_its_outputs_own_format(self):
        """WAVE-03: mpv must convert nothing after the graph.

        The pinned Windows build remixed the fourth band into the first two
        when it converted FFmpeg's planar samples itself, so the graph ends in
        exactly what the output takes: interleaved float, in the joined layout.
        """
        graph = ad.filter_graph()
        assert graph.endswith(
            f"aresample={ad.ENVELOPE_RATE_HZ},"
            f"aformat=sample_fmts=flt:channel_layouts={ad.CHANNEL_LAYOUT}"
        )
        assert "--audio-format=float" in ad.decoder_arguments(
            "/bin/mpv", "/m/a.flac", output="/dev/stdout", log_file="/tmp/l"
        )
        assert ad.EXPECTED_OUTPUT.endswith(f"{ad.CHANNEL_LAYOUT} 4ch float")

    def test_the_version_names_the_graph_that_fixed_the_bands(self):
        assert ad.ANALYSIS_VERSION == 2

    def test_the_bands_are_joined_in_the_order_they_are_named(self):
        graph = ad.filter_graph()
        joined = re.search(r"((?:\[\w+\])+)join=", graph)
        assert joined is not None
        assert joined.group(1) == "".join(f"[{band}]" for band in ad.BANDS)

    def test_the_layout_is_one_that_keeps_its_order(self):
        """``4.0`` was measured to come out reordered; ``quad`` keeps it."""
        assert ad.CHANNEL_LAYOUT == "quad"

    def test_each_band_edge_is_fourth_order(self):
        graph = ad.filter_graph()
        assert graph.count(f"lowpass=f={ad.LOW_CROSSOVER_HZ}:p=2") == 2
        assert graph.count(f"highpass=f={ad.LOW_CROSSOVER_HZ}:p=2") == 2
        assert graph.count(f"lowpass=f={ad.HIGH_CROSSOVER_HZ}:p=2") == 2
        assert graph.count(f"highpass=f={ad.HIGH_CROSSOVER_HZ}:p=2") == 2

    def test_the_sections_follow_their_constant(self, monkeypatch):
        monkeypatch.setattr(ad, "FILTER_SECTIONS", 3)
        assert ad.filter_graph().count(f"lowpass=f={ad.LOW_CROSSOVER_HZ}:p=2") == 3

    def test_it_squares_rather_than_evaluating_an_expression(self):
        """``amultiply`` was measured at twice the speed of ``aeval=abs()``."""
        graph = ad.filter_graph()
        assert "amultiply" in graph
        assert "aeval" not in graph

    def test_the_expected_output_names_the_rate_layout_and_format(self):
        assert ad.EXPECTED_OUTPUT == "AO: [pcm] 150Hz quad 4ch float"

    def test_the_loudness_meter_heads_the_graph(self):
        """WAVE-08: before the downmix, on the file's own channels and rate."""
        graph = ad.filter_graph()
        assert graph.startswith(ad.LOUDNESS_METER + ",aresample=")
        assert graph.count("ebur128") == 1

    def test_the_meter_measures_the_sample_peak_quietly(self):
        """The true peak cost 2.6 times the analysis's time (DEC-124)."""
        options = ad.LOUDNESS_METER.split("=", 1)[1].split(":")
        assert options == ["peak=sample", "dualmono=true", "framelog=quiet"]

    def test_the_versions(self):
        assert ad.ANALYSIS_VERSION == 2
        assert ad.LOUDNESS_VERSION == 1


_LOGS = _REPO / "src" / "tests" / "fixtures" / "audio" / "ebur128"


def _captured(name: str) -> str:
    """A summary the pinned Windows build wrote, its other lines left out."""
    return (_LOGS / f"ebur128-{name}.txt").read_text(encoding="utf-8")


def _summary(lufs: str = "-8.4", peak: str = "-0.3") -> str:
    return _log(
        "[v][ffmpeg] Parsed_ebur128_0: Summary:",
        "[v][ffmpeg]",
        "[v][ffmpeg]   Integrated loudness:",
        f"[v][ffmpeg]     I:         {lufs} LUFS",
        "[v][ffmpeg]     Threshold: -18.4 LUFS",
        "[v][ffmpeg]",
        "[v][ffmpeg]   Loudness range:",
        "[v][ffmpeg]     LRA:         4.1 LU",
        "[v][ffmpeg]",
        "[v][ffmpeg]   Sample peak:",
        f"[v][ffmpeg]     Peak:       {peak} dBFS",
    )


class TestReadLoudness:
    """WAVE-08: the meter's one summary, read strictly."""

    @pytest.mark.parametrize(
        "name, expected",
        [
            ("value", ad.Loudness(-3.5, -4.3, None)),
            ("too_quiet", ad.Loudness(None, -4.3, ad.LOUDNESS_TOO_QUIET)),
            ("silent", ad.Loudness(None, None, ad.LOUDNESS_SILENT)),
        ],
    )
    def test_each_summary_the_pinned_build_wrote(self, name, expected):
        assert ad.read_loudness(_captured(name)) == expected

    def test_the_captured_logs_carry_no_path(self):
        logs = sorted(_LOGS.glob("*.txt"))
        assert [log.name for log in logs] == [
            "ebur128-silent.txt",
            "ebur128-too_quiet.txt",
            "ebur128-value.txt",
        ]
        for log in logs:
            text = log.read_text(encoding="utf-8")
            assert "/" not in text.replace("AO: [pcm]", "") and "\\" not in text

    def test_a_value(self):
        assert ad.read_loudness(GOOD_LOG + _summary()) == ad.Loudness(-8.4, -0.3, None)

    def test_the_floor_is_too_quiet_and_a_tenth_above_it_is_a_value(self):
        floor = ad.read_loudness(_summary("-70.0", "-30.0"))
        above = ad.read_loudness(_summary("-69.9", "-30.0"))

        assert floor == ad.Loudness(None, -30.0, ad.LOUDNESS_TOO_QUIET)
        assert above == ad.Loudness(-69.9, -30.0, None)

    def test_a_peak_of_minus_infinity_is_silent(self):
        assert ad.read_loudness(_summary("-70.0", "-inf")) == ad.Loudness(
            None, None, ad.LOUDNESS_SILENT
        )

    def test_no_summary_is_not_measured(self):
        assert ad.read_loudness(GOOD_LOG) == ad.NOT_MEASURED
        assert ad.NOT_MEASURED.reason == ad.LOUDNESS_NOT_MEASURED

    def test_a_second_summary_is_refused(self):
        """A graph rebuilt part-way measured part of the file each time."""
        assert ad.read_loudness(_summary() + _summary("-9.0")) == ad.NOT_MEASURED

    @pytest.mark.parametrize(
        "lufs, peak",
        [("-8.4LUFS", "-0.3"), ("nan", "-0.3"), ("-8", "-0.3"), ("-8.4", "+inf")],
    )
    def test_a_malformed_line_is_not_measured(self, lufs, peak):
        text = _summary().replace("-8.4 LUFS", f"{lufs} LUFS")
        text = text.replace("-0.3 dBFS", f"{peak} dBFS")
        assert ad.read_loudness(text) == ad.NOT_MEASURED

    def test_a_summary_with_no_peak_is_not_measured(self):
        text = "".join(
            line + "\n" for line in _summary().splitlines() if "Peak:" not in line
        )
        assert ad.read_loudness(text) == ad.NOT_MEASURED

    def test_the_meters_running_lines_are_not_its_summary(self):
        running = _log(
            "[v][ffmpeg] Parsed_ebur128_0: t: 0.399955   TARGET:-23 LUFS    M: -10.9"
            " S:-120.7     I: -10.9 LUFS       LRA:   0.0 LU  SPK:  -4.3 dBFS"
        )
        assert ad.read_loudness(running) == ad.NOT_MEASURED
        assert ad.read_loudness(running + _summary()) == ad.Loudness(-8.4, -0.3, None)

    def test_the_true_peak_is_not_read_as_the_sample_peak(self):
        text = _summary() + _log(
            "[v][ffmpeg]",
            "[v][ffmpeg]   True peak:",
            "[v][ffmpeg]     Peak:        2.0 dBFS",
        )
        assert ad.read_loudness(text).peak_dbfs == -0.3

    def test_another_modules_lines_inside_the_summary_are_passed_over(self):
        lines = _summary().splitlines()
        lines.insert(5, "[   0.010][v][lavfi] dropping request due to pin disconnect")
        lines.insert(3, "[   0.010][v][ffmpeg/audio] I: -1.0 LUFS")
        assert ad.read_loudness("\n".join(lines)) == ad.Loudness(-8.4, -0.3, None)


class TestLoudnessReading:
    @pytest.mark.parametrize(
        "lufs, peak, reason",
        [
            (None, -0.3, None),
            (-8.4, None, None),
            (-8.4, -0.3, ad.LOUDNESS_TOO_QUIET),
            (None, -0.3, ad.LOUDNESS_SILENT),
            (None, -0.3, ad.LOUDNESS_NOT_MEASURED),
            (None, None, "quiet"),
            (math.inf, -0.3, None),
            (-8.4, math.nan, None),
        ],
    )
    def test_an_impossible_reading_is_refused(self, lufs, peak, reason):
        with pytest.raises(ValueError):
            ad.Loudness(lufs, peak, reason)

    def test_an_envelope_is_not_measured_unless_told(self):
        envelope = ad.parse_envelope(_frame_bytes([[0.0] * 4]))
        assert envelope.loudness == ad.NOT_MEASURED


class TestTransports:
    def test_windows_writes_a_file_and_has_no_pipe(self):
        assert ad.platform_transports("win32") == (ad.TRANSPORT_FILE,)
        assert ad.default_transport("win32") == ad.TRANSPORT_FILE

    @pytest.mark.parametrize("platform", ["linux", "darwin"])
    def test_elsewhere_both_and_a_pipe_by_default(self, platform):
        assert ad.platform_transports(platform) == ad.TRANSPORTS
        assert ad.default_transport(platform) == ad.TRANSPORT_PIPE

    def test_a_transport_the_platform_lacks_is_refused_before_any_file_is_blamed(
        self, monkeypatch, tmp_path
    ):
        """A pipe on Windows failed as ``undecodable``, the file's fault (WAVE-03)."""
        monkeypatch.setattr(ad, "platform_transports", lambda: (ad.TRANSPORT_FILE,))
        decoder = tmp_path / "mpv"
        decoder.write_bytes(b"")
        with pytest.raises(ValueError, match="does not work"):
            ad.decode_envelope(
                tmp_path / "a.flac", decoder, transport=ad.TRANSPORT_PIPE
            )


class TestDecoderArguments:
    def _args(self, source: str = "/music/a.flac") -> List[str]:
        return ad.decoder_arguments(
            "/bin/mpv", source, output="/dev/stdout", log_file="/tmp/x/decode.log"
        )

    def test_the_source_is_last_and_after_the_end_of_options(self):
        args = self._args()
        assert args[-2:] == ["--", "/music/a.flac"]
        assert args.count("--") == 1

    def test_a_name_that_looks_like_an_option_stays_a_file(self):
        args = self._args("/music/--start=90 track.flac")
        assert args[-1] == "/music/--start=90 track.flac"
        assert all(not a.startswith("--start") for a in args[:-2])

    def test_nothing_from_the_path_reaches_the_options(self):
        args = self._args("/music/evil;--ao=null.flac")
        options = args[: args.index("--")]
        assert not any("evil" in a for a in options)

    @pytest.mark.parametrize(
        "flag",
        [
            "--no-config",
            "--load-scripts=no",
            "--ytdl=no",
            "--osc=no",
            "--resume-playback=no",
            "--save-position-on-quit=no",
            "--terminal=no",
            "--ao=pcm",
            "--ao-pcm-waveheader=no",
            "--audio-format=float",
            "--vid=no",
        ],
    )
    def test_it_is_isolated_from_the_users_mpv_and_writes_raw_floats(self, flag):
        assert flag in self._args()

    def test_the_output_and_log_are_the_callers(self):
        args = self._args()
        assert "--ao-pcm-file=/dev/stdout" in args
        assert "--log-file=/tmp/x/decode.log" in args

    def test_every_option_it_passes_is_one_the_manifest_requires(self):
        """The smoke test proves the pinned build has each option CuePoint uses."""
        required = set(json.loads(_MANIFEST.read_text())["required_options"])
        used = {
            a[2:].split("=", 1)[0]
            for a in self._args()[1:]
            if a.startswith("--") and a != "--"
        }
        used.discard("no-config")  # a flag spelled with its own "no-"
        assert used - required == set(), f"not in the manifest: {used - required}"


class TestTransport:
    @pytest.mark.parametrize(
        "platform, transport",
        [("win32", "file"), ("linux", "pipe"), ("darwin", "pipe")],
    )
    def test_each_platform_has_its_own(self, platform, transport):
        assert ad.default_transport(platform) == transport

    def test_an_unknown_transport_is_refused(self, tmp_path):
        decoder = tmp_path / "mpv"
        decoder.write_text("")
        with pytest.raises(ValueError):
            ad.decode_envelope(tmp_path / "a.flac", decoder, transport="socket")


class TestDecodablePath:
    @pytest.mark.parametrize(
        "name",
        [
            "a.mp3",
            "a.M4A",
            "a.flac",
            "a.wav",
            "a.aif",
            "a.AIFF",
            "a.aac",
            "a.wv",
            "a.ape",
        ],
    )
    def test_formats_the_pinned_decoders_cover(self, name):
        assert ad.is_decodable_path(name)

    @pytest.mark.parametrize(
        "name", ["a.m3u", "a.m3u8", "a.pls", "a.cue", "a.txt", "a", "a.flac.part"]
    )
    def test_everything_else_never_reaches_the_decoder(self, name):
        assert not ad.is_decodable_path(name)


class TestDecoderFromEnv:
    def test_absent_blank_and_missing_are_none(self, tmp_path):
        assert ad.decoder_from_env({}) is None
        assert ad.decoder_from_env({ad.DECODER_PATH_ENV: "   "}) is None
        assert ad.decoder_from_env({ad.DECODER_PATH_ENV: str(tmp_path / "no")}) is None

    def test_a_folder_is_not_a_decoder(self, tmp_path):
        assert ad.decoder_from_env({ad.DECODER_PATH_ENV: str(tmp_path)}) is None

    def test_an_existing_file_is_the_decoder(self, tmp_path):
        decoder = tmp_path / "mpv"
        decoder.write_text("")
        assert ad.decoder_from_env({ad.DECODER_PATH_ENV: f" {decoder} "}) == decoder

    def test_it_is_the_variable_electron_sets(self):
        """One name, in two languages; this reads the TypeScript side."""
        source = _PLAYER_LAUNCH.read_text(encoding="utf-8")
        assert f'DECODER_PATH_ENV = "{ad.DECODER_PATH_ENV}"' in source


# ---------------------------------------------------------------------------
# Reading the result
# ---------------------------------------------------------------------------


class TestDecoderLog:
    def test_a_good_log_negotiated_this_pipeline(self):
        log = ad.read_decoder_log(GOOD_LOG)
        assert log.outputs == (ad.EXPECTED_OUTPUT,)
        assert log.negotiated
        assert log.errors == ()
        assert not log.filter_failed

    def test_a_dropped_filter_is_seen_by_its_output(self):
        """mpv drops a graph it cannot configure and plays on unfiltered."""
        log = ad.read_decoder_log(_log("[i][cplayer] AO: [pcm] 44100Hz 4.0 4ch float"))
        assert not log.negotiated

    def test_a_dropped_filter_is_seen_by_its_message(self):
        log = ad.read_decoder_log(
            _log(
                "[e][lavfi] parsing the filter graph failed",
                "[e][cplayer] Audio filter initialized failed!",
            )
        )
        assert log.filter_failed
        assert log.first_error() == "parsing the filter graph failed"

    def test_errors_are_counted_and_the_first_kept(self):
        log = ad.read_decoder_log(
            GOOD_LOG
            + _log(
                "[e][ffmpeg/audio] flac: decode_frame() failed",
                "[e][ad] Error decoding audio.",
                "[w][ffmpeg/demuxer] wav: Cannot check for SPDIF",
            )
        )
        assert len(log.errors) == 2
        assert log.first_error() == "flac: decode_frame() failed"

    def test_no_output_is_not_negotiated_and_no_error_says_so(self):
        log = ad.read_decoder_log("")
        assert not log.negotiated
        assert log.first_error() == "the decoder gave no reason"

    def test_lines_that_are_not_log_lines_are_ignored(self):
        log = ad.read_decoder_log("garbage\n[e] half a line\n" + GOOD_LOG)
        assert log.outputs == (ad.EXPECTED_OUTPUT,)
        assert log.errors == ()


class TestParseEnvelope:
    def test_mean_squares_become_rms_in_band_order(self):
        raw = _frame_bytes([[0.25, 0.04, 0.01, 0.0], [1.0, 0.16, 0.09, 0.0625]])
        envelope = ad.parse_envelope(raw)
        assert envelope.frames == 2
        assert list(envelope.full) == pytest.approx([0.5, 1.0])
        assert list(envelope.low) == pytest.approx([0.2, 0.4])
        assert list(envelope.mid) == pytest.approx([0.1, 0.3])
        assert list(envelope.high) == pytest.approx([0.0, 0.25])

    def test_ringing_below_zero_and_non_numbers_read_as_silence(self):
        raw = _frame_bytes([[-1e-5, math.nan, math.inf, -math.inf]])
        envelope = ad.parse_envelope(raw)
        assert [envelope.band(b)[0] for b in ad.BANDS] == [0.0, 0.0, 0.0, 0.0]

    def test_a_trailing_partial_frame_is_dropped(self):
        raw = _frame_bytes([[0.25, 0.0, 0.0, 0.0]]) + b"\x00" * 7
        assert ad.parse_envelope(raw).frames == 1

    def test_duration_comes_from_the_sample_count(self):
        raw = _frame_bytes([[0.0] * 4] * 465)
        assert ad.parse_envelope(raw).duration_ms == 3100

    def test_the_error_count_is_kept(self):
        envelope = ad.parse_envelope(_frame_bytes([[0.0] * 4]), decode_errors=3)
        assert envelope.decode_errors == 3

    def test_an_unknown_band_is_refused(self):
        with pytest.raises(KeyError):
            ad.parse_envelope(b"").band("sub")

    def test_the_band_at_once_is_the_rule_value_by_value(self):
        """WAVE-03 read the bands without a Python loop; not one bit may change.

        Every awkward value a mean square can be, among ordinary ones: zeros of
        both signs, ringing below zero, both NaNs, the extremes and a denormal.
        """
        rng = random.Random(3)
        awkward = [0.0, -0.0, -1e-9, 1e-12, math.nan, -math.nan, 3.4e38, -3.4e38, 1e-45]
        values = array(
            "f", awkward * 20 + [rng.uniform(-0.01, 2.0) for _ in range(5000)]
        )

        fast = ad._rms_band(values)

        assert fast.tobytes() == array("f", map(ad._rms, values)).tobytes()

    def test_an_infinity_takes_the_rule_value_by_value(self):
        values = array("f", [1.0, math.inf, -math.inf, math.nan, 4.0])

        assert list(ad._rms_band(values)) == [1.0, 0.0, 0.0, 0.0, 2.0]


class TestFailureVocabulary:
    def test_a_file_failure_carries_one_of_three_reasons(self):
        assert ad.FILE_FAILURE_REASONS == ("undecodable", "no_audio", "timeout")
        with pytest.raises(ValueError):
            ad.DecodeFailed(ad.REASON_DECODER_MISSING, "not a file's failure")

    def test_the_decoders_failure_is_its_own(self):
        error = ad.DecoderUnavailable("gone")
        assert error.reason == "decoder_missing"
        assert not isinstance(error, ad.DecodeFailed)


class TestOutcome:
    """What a finished decode means, from its exit code, output and log."""

    def _outcome(
        self, source: Path, returncode=0, raw=b"", log: Optional[str] = GOOD_LOG
    ):
        return ad._outcome(source, returncode, raw, b"", log)

    def test_a_good_decode_is_an_envelope(self, tmp_path):
        raw = _frame_bytes([[0.25, 0.04, 0.01, 0.0]] * 3)
        envelope = self._outcome(tmp_path, raw=raw)
        assert envelope.frames == 3
        assert envelope.decode_errors == 0

    def test_a_partial_decode_is_an_envelope_with_its_errors(self, tmp_path):
        log = GOOD_LOG + _log("[e][ad] Error decoding audio.")
        envelope = self._outcome(tmp_path, raw=_frame_bytes([[0.0] * 4]), log=log)
        assert envelope.decode_errors == 1

    def test_no_log_means_the_decoder_cannot_be_trusted(self, tmp_path):
        with pytest.raises(ad.DecoderUnavailable):
            self._outcome(tmp_path, log=None)

    def test_the_wrong_output_format_is_the_decoders_failure_not_the_files(
        self, tmp_path
    ):
        log = _log("[i][cplayer] AO: [pcm] 44100Hz 4.0 4ch float")
        with pytest.raises(ad.DecoderUnavailable, match="did not run as built"):
            self._outcome(tmp_path, raw=b"\x00" * 64, log=log)

    def test_a_dropped_filter_is_the_decoders_failure(self, tmp_path):
        log = GOOD_LOG + _log("[e][cplayer] Audio filter initialized failed!")
        with pytest.raises(ad.DecoderUnavailable):
            self._outcome(tmp_path, raw=b"\x00" * 64, log=log)

    def test_a_failed_exit_with_an_error_is_undecodable(self, tmp_path):
        log = _log("[e][cplayer] Failed to recognize file format.")
        with pytest.raises(ad.DecodeFailed) as caught:
            self._outcome(tmp_path, returncode=2, log=log)
        assert caught.value.reason == "undecodable"
        assert caught.value.detail == "Failed to recognize file format."

    def test_a_failed_exit_with_no_error_found_no_audio(self, tmp_path):
        """An empty WAV: a track is found, nothing is decoded, nothing complains."""
        log = _log("[i][cplayer]  (+) Audio --aid=1 (pcm_s16le 2ch 44100Hz)")
        with pytest.raises(ad.DecodeFailed) as caught:
            self._outcome(tmp_path, returncode=2, log=log)
        assert caught.value.reason == "no_audio"

    def test_a_failed_exit_for_a_file_that_has_gone_is_not_a_failure(self, tmp_path):
        log = _log("[e][stream] Failed to open /gone.flac.")
        with pytest.raises(ad.FileGone):
            self._outcome(tmp_path / "gone.flac", returncode=2, log=log)

    def test_success_with_nothing_decoded_is_no_audio(self, tmp_path):
        with pytest.raises(ad.DecodeFailed) as caught:
            self._outcome(tmp_path, raw=b"")
        assert caught.value.reason == "no_audio"

    def test_success_with_no_output_opened_is_no_audio(self, tmp_path):
        log = _log("[e][cplayer] No video or audio streams selected.")
        with pytest.raises(ad.DecodeFailed) as caught:
            self._outcome(tmp_path, raw=b"", log=log)
        assert caught.value.reason == "no_audio"

    def test_a_good_decode_carries_its_loudness(self, tmp_path):
        raw = _frame_bytes([[0.25, 0.04, 0.01, 0.0]] * 3)
        envelope = self._outcome(tmp_path, raw=raw, log=GOOD_LOG + _summary())
        assert envelope.loudness == ad.Loudness(-8.4, -0.3, None)

    def test_a_decode_with_no_reading_keeps_its_waveform_and_says_so_once(
        self, tmp_path, monkeypatch, caplog
    ):
        """Loudness never costs a file its picture."""
        monkeypatch.setattr(ad, "_UNREAD_LOGGED", threading.Event())
        raw = _frame_bytes([[0.25, 0.04, 0.01, 0.0]] * 3)
        with caplog.at_level("WARNING", logger=ad.__name__):
            first = self._outcome(tmp_path / "a.flac", raw=raw)
            second = self._outcome(tmp_path / "b.flac", raw=raw)

        assert first.frames == second.frames == 3
        assert first.loudness == second.loudness == ad.NOT_MEASURED
        warnings = [r for r in caplog.records if "no loudness summary" in r.message]
        assert len(warnings) == 1
        assert "a.flac" in warnings[0].getMessage()


# ---------------------------------------------------------------------------
# Before a child exists
# ---------------------------------------------------------------------------


class TestBeforeTheChild:
    @pytest.fixture
    def decoder(self, tmp_path) -> Path:
        path = tmp_path / "mpv"
        path.write_text("")
        return path

    def test_no_decoder_is_the_decoders_failure(self, tmp_path):
        with pytest.raises(ad.DecoderUnavailable):
            ad.decode_envelope(tmp_path / "a.flac", tmp_path / "no-mpv")

    def test_a_relative_path_is_refused(self, decoder):
        with pytest.raises(ad.DecodeFailed, match="absolute"):
            ad.decode_envelope(Path("music/a.flac"), decoder)

    def test_a_missing_file_is_gone_not_failed(self, tmp_path, decoder):
        with pytest.raises(ad.FileGone):
            ad.decode_envelope(tmp_path / "a.flac", decoder)

    def test_a_folder_is_not_a_file(self, tmp_path, decoder):
        folder = tmp_path / "album.flac"
        folder.mkdir()
        with pytest.raises(ad.DecodeFailed, match="not a file"):
            ad.decode_envelope(folder, decoder)

    def test_a_playlist_never_reaches_the_decoder(self, tmp_path, decoder):
        playlist = tmp_path / "set.m3u"
        playlist.write_text("/music/a.flac\n")
        with pytest.raises(ad.DecodeFailed) as caught:
            ad.decode_envelope(playlist, decoder)
        assert caught.value.reason == "undecodable"
        assert ".m3u" in caught.value.detail

    def test_a_cancel_before_the_start_starts_nothing(self, tmp_path, decoder):
        with pytest.raises(ad.DecodeCancelled):
            ad.decode_envelope(tmp_path / "a.flac", decoder, cancel=lambda: True)


class TestSweep:
    def test_old_decode_folders_go_and_everything_else_stays(self, tmp_path):
        old = tmp_path / f"{ad.WORKDIR_PREFIX}old"
        fresh = tmp_path / f"{ad.WORKDIR_PREFIX}fresh"
        other = tmp_path / "someone-else"
        for folder in (old, fresh, other):
            folder.mkdir()
            (folder / "envelope.f32").write_bytes(b"x")
        hour_ago = time.time() - 2 * ad.STALE_WORKDIR_SECONDS
        os.utime(old, (hour_ago, hour_ago))
        os.utime(other, (hour_ago, hour_ago))
        assert ad.sweep_stale_workdirs(tmp_path) == 1
        assert not old.exists()
        assert fresh.exists() and other.exists()

    def test_a_missing_root_sweeps_nothing(self, tmp_path):
        assert ad.sweep_stale_workdirs(tmp_path / "none") == 0


class TestSpawnFlags:
    def test_windows_spawns_below_normal_with_no_window(self):
        assert ad._spawn_flags("win32") == 0x00004000 | 0x08000000

    def test_elsewhere_priority_is_lowered_after_spawn(self):
        assert ad._spawn_flags("linux") == 0
        assert ad._spawn_flags("darwin") == 0


# A stand-in engine: it starts a child as a decode does, puts it in the job,
# says the child's id, and waits to be killed.
_ENGINE = """
import subprocess, sys, time
sys.path.insert(0, sys.argv[1])
from cuepoint.data import audio_decode as ad
child = subprocess.Popen(
    [sys.executable, "-c", "import time; time.sleep(60)"],
    stdin=subprocess.DEVNULL,
    creationflags=ad._spawn_flags(),
)
ad._join_engine_job(child)
print(child.pid, flush=True)
time.sleep(60)
"""


class TestEngineJob:
    def test_there_is_no_job_off_windows(self, monkeypatch):
        monkeypatch.setattr(ad.sys, "platform", "linux")
        assert ad._engine_job() is None

    @pytest.mark.skipif(sys.platform != "win32", reason="a Windows job object")
    def test_a_killed_engine_takes_its_decoders_with_it(self, tmp_path):
        """Regression: decoders were found idle hours after their engine was killed."""
        import subprocess

        from cuepoint.engine.parent_watch import is_alive

        script = tmp_path / "engine.py"
        script.write_text(_ENGINE, encoding="utf-8")
        src = str(_REPO / "src")
        engine = subprocess.Popen(
            [sys.executable, str(script), src], stdout=subprocess.PIPE, text=True
        )
        try:
            assert engine.stdout is not None
            child = int(engine.stdout.readline())
            assert is_alive(child)
            engine.kill()
            engine.wait(10)
            deadline = time.monotonic() + 5
            while is_alive(child) and time.monotonic() < deadline:
                time.sleep(0.05)
            alive = is_alive(child)
            if alive:
                os.kill(child, 9)
            assert not alive, "the decoder outlived the engine that started it"
        finally:
            if engine.poll() is None:
                engine.kill()
            if engine.stdout is not None:
                engine.stdout.close()


# ---------------------------------------------------------------------------
# The child, played by a stub
# ---------------------------------------------------------------------------

_STUB = """
import os, sys, time
from array import array

options = {}
for argument in sys.argv[1:]:
    if argument.startswith("--") and "=" in argument:
        name, value = argument.split("=", 1)
        options[name] = value
mode = os.environ.get("STUB_MODE", "good")
pid_file = os.environ.get("STUB_PID_FILE")
if pid_file:
    with open(pid_file, "w") as handle:
        handle.write(str(os.getpid()))


def log(*lines):
    with open(options["--log-file"], "w") as handle:
        for line in lines:
            handle.write("[   0.010]" + line + "\\n")


def output(frames):
    values = array("f", [0.25, 0.04, 0.01, 0.0] * frames)
    with open(options["--ao-pcm-file"], "wb") as handle:
        handle.write(values.tobytes())


if mode == "sleep":
    time.sleep(60)
elif mode == "nice":
    time.sleep(0.5)
    with open(os.environ["STUB_NICE_FILE"], "w") as handle:
        handle.write(str(os.getpriority(os.PRIO_PROCESS, 0)))
    log("[i][cplayer] " + os.environ["STUB_EXPECTED"])
    output(3)
elif mode == "good":
    log("[i][cplayer] " + os.environ["STUB_EXPECTED"])
    output(int(os.environ.get("STUB_FRAMES", "30")))
elif mode == "wrong-format":
    log("[i][cplayer] AO: [pcm] 44100Hz 4.0 4ch float")
    output(30)
elif mode == "no-log":
    output(30)
elif mode == "error":
    log("[e][cplayer] Failed to recognize file format.")
    sys.exit(2)
"""


@pytest.fixture
def stub(tmp_path, monkeypatch) -> Path:
    """A decoder that does what ``STUB_MODE`` says."""
    path = tmp_path / "stub-mpv"
    path.write_text(f"#!{sys.executable}\n{_STUB}", encoding="utf-8")
    path.chmod(0o755)
    monkeypatch.setenv("STUB_EXPECTED", ad.EXPECTED_OUTPUT)
    return path


@pytest.fixture
def song(tmp_path) -> Path:
    path = tmp_path / "music" / "song.flac"
    path.parent.mkdir()
    path.write_bytes(b"fLaC")
    return path


@pytest.fixture
def workdirs(tmp_path) -> Path:
    path = tmp_path / "work"
    path.mkdir()
    return path


def _is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # A killed child the test did not reap is a zombie: gone for our purposes.
    try:
        with open(f"/proc/{pid}/status", encoding="utf-8") as handle:
            return "zombie" not in handle.read()
    except OSError:
        return True


def _wait_for_file(path: Path, seconds: float = 5.0) -> str:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if path.exists() and path.read_text():
            return path.read_text()
        time.sleep(0.02)
    raise AssertionError(f"{path} never appeared")


@posix_only
class TestStubDecoder:
    @pytest.mark.parametrize("transport", ad.TRANSPORTS)
    def test_a_good_decode_through_either_transport(
        self, stub, song, workdirs, monkeypatch, transport
    ):
        monkeypatch.setenv("STUB_MODE", "good")
        envelope = ad.decode_envelope(
            song, stub, transport=transport, workdir_root=workdirs
        )
        assert envelope.frames == 30
        assert envelope.full[0] == pytest.approx(0.5)
        assert envelope.mid[0] == pytest.approx(0.1)
        assert list(workdirs.iterdir()) == []

    def test_the_wrong_output_format_is_refused(
        self, stub, song, monkeypatch, workdirs
    ):
        monkeypatch.setenv("STUB_MODE", "wrong-format")
        with pytest.raises(ad.DecoderUnavailable):
            ad.decode_envelope(song, stub, workdir_root=workdirs)

    def test_a_decoder_that_writes_no_log_is_refused(
        self, stub, song, monkeypatch, workdirs
    ):
        monkeypatch.setenv("STUB_MODE", "no-log")
        with pytest.raises(ad.DecoderUnavailable, match="no log"):
            ad.decode_envelope(song, stub, workdir_root=workdirs)

    def test_a_decoder_error_is_the_files(self, stub, song, monkeypatch, workdirs):
        monkeypatch.setenv("STUB_MODE", "error")
        with pytest.raises(ad.DecodeFailed) as caught:
            ad.decode_envelope(song, stub, workdir_root=workdirs)
        assert caught.value.reason == "undecodable"

    def test_the_timeout_kills_the_child_and_leaves_nothing(
        self, stub, song, monkeypatch, workdirs, tmp_path
    ):
        pid_file = tmp_path / "pid"
        monkeypatch.setenv("STUB_MODE", "sleep")
        monkeypatch.setenv("STUB_PID_FILE", str(pid_file))
        started = time.monotonic()
        with pytest.raises(ad.DecodeFailed) as caught:
            ad.decode_envelope(song, stub, timeout_seconds=0.5, workdir_root=workdirs)
        assert caught.value.reason == "timeout"
        assert time.monotonic() - started < 10
        assert not _is_running(int(pid_file.read_text()))
        assert list(workdirs.iterdir()) == []
        assert ad.live_children() == 0

    @pytest.mark.parametrize("transport", ad.TRANSPORTS)
    def test_a_cancel_mid_decode_kills_the_child_and_leaves_nothing(
        self, stub, song, monkeypatch, workdirs, tmp_path, transport
    ):
        pid_file = tmp_path / "pid"
        monkeypatch.setenv("STUB_MODE", "sleep")
        monkeypatch.setenv("STUB_PID_FILE", str(pid_file))
        stop = threading.Event()
        threading.Timer(0.5, stop.set).start()
        with pytest.raises(ad.DecodeCancelled):
            ad.decode_envelope(
                song,
                stub,
                cancel=stop.is_set,
                transport=transport,
                workdir_root=workdirs,
            )
        assert not _is_running(int(pid_file.read_text()))
        assert list(workdirs.iterdir()) == []
        assert ad.live_children() == 0

    def test_the_engine_stopping_ends_every_child(
        self, stub, song, monkeypatch, workdirs, tmp_path
    ):
        pid_file = tmp_path / "pid"
        monkeypatch.setenv("STUB_MODE", "sleep")
        monkeypatch.setenv("STUB_PID_FILE", str(pid_file))
        outcome: Dict[str, BaseException] = {}

        def run() -> None:
            try:
                ad.decode_envelope(song, stub, workdir_root=workdirs)
            except BaseException as exc:  # noqa: BLE001 - recorded for the test
                outcome["error"] = exc

        worker = threading.Thread(target=run)
        worker.start()
        pid = int(_wait_for_file(pid_file))
        assert ad.live_children() == 1
        assert ad.terminate_children() == 1
        worker.join(10)
        assert not worker.is_alive()
        assert not _is_running(pid)
        assert ad.live_children() == 0
        # A decode the engine ended is cancelled, never a file's failure or a
        # missing decoder.
        assert isinstance(outcome.get("error"), ad.DecodeCancelled)

    def test_the_child_runs_at_lowered_priority(
        self, stub, song, monkeypatch, workdirs, tmp_path
    ):
        nice_file = tmp_path / "nice"
        monkeypatch.setenv("STUB_MODE", "nice")
        monkeypatch.setenv("STUB_NICE_FILE", str(nice_file))
        ours = os.getpriority(os.PRIO_PROCESS, 0)
        ad.decode_envelope(song, stub, workdir_root=workdirs)
        assert int(nice_file.read_text()) == min(19, ours + ad.NICE_INCREMENT)

    def test_the_first_decode_sweeps_stale_folders(
        self, stub, song, monkeypatch, workdirs
    ):
        stale = workdirs / f"{ad.WORKDIR_PREFIX}left-by-a-killed-engine"
        stale.mkdir()
        long_ago = time.time() - 2 * ad.STALE_WORKDIR_SECONDS
        os.utime(stale, (long_ago, long_ago))
        monkeypatch.setattr(ad, "_SWEPT", threading.Event())
        monkeypatch.setenv("STUB_MODE", "good")
        ad.decode_envelope(song, stub, workdir_root=workdirs)
        assert not stale.exists()

    def test_an_ordinary_exit_ends_every_child(self, stub, song, tmp_path):
        """A process that exits while a decode runs takes its child with it.

        The decode runs on a daemon thread, which an exit abandons; the clean-up
        registered with ``atexit`` is what ends the child.
        """
        import subprocess

        pid_file = tmp_path / "pid"
        program = (
            "import sys, threading, time\n"
            f"sys.path.insert(0, {str(_REPO / 'src')!r})\n"
            "from cuepoint.data import audio_decode as ad\n"
            "threading.Thread(\n"
            f"    target=lambda: ad.decode_envelope({str(song)!r}, {str(stub)!r}),\n"
            "    daemon=True,\n"
            ").start()\n"
            # Exit only once the child has started and said who it is, so the
            # test proves the exit ended a running child, not one never begun.
            "import os\n"
            f"while not os.path.exists({str(pid_file)!r}) or ad.live_children() == 0:\n"
            "    time.sleep(0.02)\n"
            "time.sleep(0.1)\n"
            "sys.exit(0)\n"
        )
        env = dict(os.environ, STUB_MODE="sleep", STUB_PID_FILE=str(pid_file))
        subprocess.run([sys.executable, "-c", program], env=env, timeout=30, check=True)
        pid = int(_wait_for_file(pid_file))
        deadline = time.monotonic() + 5
        while _is_running(pid) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not _is_running(pid)
