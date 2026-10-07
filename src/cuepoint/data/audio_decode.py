#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Decoding an audio file into a four-band loudness envelope (WAVE-01).

CuePoint draws waveforms from the audio itself (DEC-113), through the one
decoder it ships: the player's ``mpv`` (DEC-049). Electron main knows where that
binary is and passes it to the engine as ``CUEPOINT_DECODER_PATH`` (DEC-123).
This module is the only place that runs it for analysis. ADR-009 records the
design and the measurements behind it.

The pipeline
------------
One ``mpv`` child per file. FFmpeg's filters, inside it, do all the heavy work:

0. Measure the file's loudness (``LOUDNESS_METER``, WAVE-08), on its own
   channels at its own rate, as BS.1770 specifies. The meter passes the audio
   through untouched: the waveforms it feeds are the same, byte for byte, as
   without it. Its one summary, at the end of the log, is read by
   :func:`read_loudness`.
1. Downmix to mono at unit gain, and resample to ``DECODE_RATE_HZ``. The
   downmix is normalised (``rematrix_maxval=1``): FFmpeg's default adds 3 dB to
   a correlated stereo signal, which would push a full-scale track over 1.0.
2. Split into four streams: the full band, and the low, mid and high bands at
   ``LOW_CROSSOVER_HZ`` and ``HIGH_CROSSOVER_HZ``. Each band edge is fourth
   order, two cascaded two-pole sections.
3. Join them as one ``quad`` stream. ``quad``'s channels are written in the
   order they are joined; a ``4.0`` layout was measured to come out reordered.
4. Square every sample, by multiplying the stream by itself.
5. Resample to ``ENVELOPE_RATE_HZ``. The resampler's low-pass averages the
   squares, so each output sample is a mean square.
6. Hand ``mpv`` interleaved float ``quad``: exactly what its output takes, so
   ``mpv`` converts nothing. The pinned Windows build (mpv 0.41, FFmpeg 8)
   remixed the fourth band into the first two when it converted FFmpeg's planar
   samples itself, as a centre channel is downmixed: the high band read silent
   and its tone appeared, 3 dB down, in the full and low bands (WAVE-03).

The engine takes the square root, so the envelope is RMS amplitude: a
full-scale sine reads 0.707. Squaring was measured at twice the speed of an
``aeval`` absolute value. Reducing a full-rate stream in the engine instead
cost more wall time, more than a second of the engine's own CPU per track, and
127 MB through the pipe. ADR-009 has the numbers.

Four things ``mpv`` does that this module is built around
---------------------------------------------------------
- **Encode mode pads.** ``--o`` pads the output with silence to a frame
  boundary, so a waveform would run long and every mark would land late. This
  uses ``--ao=pcm``, which writes exactly the decoded length, as fast as it can.
- **Info messages go to standard output.** With samples on standard output,
  any message would corrupt them. ``--terminal=no`` silences the terminal, and
  ``--log-file`` keeps what the decode said in a file beside it.
- **A filter graph that fails is dropped, and playback continues.** ``mpv``
  exits 0 and writes the unfiltered audio, which would read as a waveform of
  nonsense. So the log must show the output format this pipeline negotiates
  (:data:`EXPECTED_OUTPUT`), or the decoder is declared unable to analyse.
- **``--no-config`` does not stop everything a user's ``mpv`` does.** A saved
  ``watch_later`` position would start a file part-way through, so resuming and
  saving are turned off, as are scripts, ``youtube-dl`` and the on-screen
  controller.

How samples leave the child
---------------------------
On macOS and Linux, through a pipe: ``--ao-pcm-file=/dev/stdout``. Nothing
touches the disk, and a child whose engine has died fails its next write. On
Windows, which has no such path, through a small file in a private temporary
folder, removed as soon as it is read. ``--ao-pcm-file=-`` is not standard
output: it writes a file named ``-``.

The child process
-----------------
Lowered priority: nice +10 on macOS and Linux, ``BELOW_NORMAL_PRIORITY_CLASS``
on Windows. A wall-clock cap of ``FILE_TIMEOUT_SECONDS``, after which it is
killed and the file recorded as ``timeout``. A caller's cancel kills it too.
Every live child is registered, so the engine can end them all when it stops
(:func:`terminate_children`). On Windows each child also joins a job that ends
it when the engine ends in any way, killed included (:func:`_engine_job`).

What a caller is told
---------------------
An :class:`Envelope`, or one of four exceptions:

- :class:`FileGone`: the file is not there now. Not a failure: a disconnected
  drive is not a broken file (WAVE-03 skips it).
- :class:`DecodeFailed`: this file could not be analysed, with a reason from
  :data:`FILE_FAILURE_REASONS`.
- :class:`DecoderUnavailable`: the decoder cannot analyse anything, so the whole
  analysis is unavailable (``decoder_missing``), not the file.
- :class:`DecodeCancelled`: the caller asked it to stop, or the engine is
  stopping (:func:`terminate_children`).

A file that decodes part-way, as a truncated download does, is an envelope of
what decoded, with the decoder's error count on it. Rejecting it would also
reject the many real files with one damaged frame.
"""

from __future__ import annotations

import atexit
import logging
import math
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
from array import array
from dataclasses import dataclass
from itertools import repeat
from pathlib import Path
from typing import (
    IO,
    Callable,
    List,
    Mapping,
    Optional,
    Set,
    Tuple,
    Union,
)

_logger = logging.getLogger(__name__)

#: Changes whenever a change here changes what an envelope holds. WAVE-02
#: stores it with every waveform, and a stored one of another version is
#: analysed again.
#:
#: 2 (WAVE-03): the graph ends in the output's own format. A build that remixed
#: the bands on its own conversion (the pinned Windows one) stored waveforms
#: with no high band, and none of them may count again. Elsewhere the values
#: are the same, and the cost is one re-analysis of an unreleased store.
ANALYSIS_VERSION = 2

#: Changes whenever a change here changes what a loudness reading means
#: (WAVE-08). Stored with every reading; one of another version is measured
#: again, and the waveform drawn meanwhile is kept.
LOUDNESS_VERSION = 1

#: The loudness meter at the head of the graph (WAVE-08, DEC-124): FFmpeg's
#: EBU R128 meter, which passes the audio through untouched. The sample peak,
#: not the true peak, which cost 2.6 times the analysis's own time where this
#: costs 1.45. A mono file is measured as it is played, on both sides
#: (``dualmono``), so it reads as loud as the same music in stereo. Its log of
#: each 100 ms is silenced; its one summary, at the end, is what is read.
LOUDNESS_METER = "ebur128=peak=sample:dualmono=true:framelog=quiet"

#: What the meter reports when no 400 ms block passed its absolute gate: not a
#: reading, but silence, or a file shorter than one block.
LOUDNESS_FLOOR_LUFS = -70.0

#: Why a decode has no loudness value: below the meter's floor.
LOUDNESS_TOO_QUIET = "too_quiet"
#: Why a decode has neither a value nor a peak: not one sample above zero.
LOUDNESS_SILENT = "silent"
#: Why a decode has no reading at all: the log held no summary to read.
LOUDNESS_NOT_MEASURED = "not_measured"

LOUDNESS_REASONS: Tuple[str, ...] = (
    LOUDNESS_TOO_QUIET,
    LOUDNESS_SILENT,
    LOUDNESS_NOT_MEASURED,
)

#: The rate the audio is decoded to before it is split.
DECODE_RATE_HZ = 22_050
#: Envelope samples per second.
ENVELOPE_RATE_HZ = 150
#: The low band is below this; the mid band starts here.
LOW_CROSSOVER_HZ = 200
#: The mid band ends here; the high band is above it.
HIGH_CROSSOVER_HZ = 2_000
#: Two-pole sections per band edge: two is fourth order.
FILTER_SECTIONS = 2

#: The envelope's channels, in the order the child writes them.
BANDS: Tuple[str, ...] = ("full", "low", "mid", "high")
#: The layout the bands are joined in. Its order is the order written.
CHANNEL_LAYOUT = "quad"

#: What the decoder's log says when this pipeline's output was negotiated. Any
#: other output format means the filter graph did not run as built.
EXPECTED_OUTPUT = (
    f"AO: [pcm] {ENVELOPE_RATE_HZ}Hz {CHANNEL_LAYOUT} {len(BANDS)}ch float"
)

#: The environment variable Electron main names the decoder in.
DECODER_PATH_ENV = "CUEPOINT_DECODER_PATH"

#: How long one file may take before its child is killed.
FILE_TIMEOUT_SECONDS = 300.0

#: How much the child's priority is lowered on macOS and Linux.
NICE_INCREMENT = 10

#: File extensions whose formats the pinned build's decoders cover (the
#: manifest's ``required_decoders``). Anything else is never handed to the
#: decoder, which would, for example, expand a playlist file.
AUDIO_EXTENSIONS = frozenset(
    {".mp3", ".m4a", ".aac", ".mp4", ".flac", ".wav", ".aif", ".aiff", ".wv", ".ape"}
)

#: A file's failure: the decoder ran and could not read it.
REASON_UNDECODABLE = "undecodable"
#: A file's failure: no audio stream, or nothing decoded.
REASON_NO_AUDIO = "no_audio"
#: A file's failure: it took longer than ``FILE_TIMEOUT_SECONDS``.
REASON_TIMEOUT = "timeout"
#: The decoder's failure, never a file's: there is no decoder that can analyse.
REASON_DECODER_MISSING = "decoder_missing"

#: What a file can be recorded as failing with.
FILE_FAILURE_REASONS: Tuple[str, ...] = (
    REASON_UNDECODABLE,
    REASON_NO_AUDIO,
    REASON_TIMEOUT,
)

#: How samples leave the child.
TRANSPORT_PIPE = "pipe"
TRANSPORT_FILE = "file"
TRANSPORTS: Tuple[str, ...] = (TRANSPORT_PIPE, TRANSPORT_FILE)

#: The prefix of each decode's private temporary folder.
WORKDIR_PREFIX = "cuepoint-decode-"
#: A folder older than this, left by an engine that was killed, is removed.
STALE_WORKDIR_SECONDS = 3600.0

#: How many times a file is decoded when its log keeps coming back cut short.
LOG_ATTEMPTS = 3

#: How often the watchdog looks for a cancel.
_POLL_SECONDS = 0.05
#: Bytes per envelope frame: four 32-bit floats.
_FRAME_BYTES = 4 * len(BANDS)

_ENVELOPE_FILE = "envelope.f32"
_LOG_FILE = "decode.log"

# `[   0.055][i][cplayer] AO: [pcm] 150Hz quad 4ch float`
_LOG_LINE = re.compile(
    r"^\[\s*[\d.]+\]\[(?P<level>[a-z])\]\[(?P<module>[^\]]+)\]\s?(?P<text>.*)$"
)
# What the decoder says when a filter it was given did not run.
_FILTER_FAILED = (
    "Audio filter initialized failed",
    "Disabling filter",
    "parsing the filter graph failed",
)


class DecodeError(Exception):
    """Something kept a file from becoming an envelope."""


class FileGone(DecodeError):
    """The file is not at its path now. Not a failure of the file."""


class DecodeCancelled(DecodeError):
    """The caller asked the decode to stop."""


class DecodeFailed(DecodeError):
    """This file could not be analysed.

    Attributes:
        reason: One of :data:`FILE_FAILURE_REASONS`.
        detail: What the decoder said, for the log and the Inspector's title.
    """

    def __init__(self, reason: str, detail: str) -> None:
        if reason not in FILE_FAILURE_REASONS:
            raise ValueError(f"Not a file failure reason: {reason!r}")
        super().__init__(f"{reason}: {detail}")
        self.reason = reason
        self.detail = detail


class DecoderUnavailable(DecodeError):
    """The decoder cannot analyse any file: missing, not runnable, or wrong build."""

    reason = REASON_DECODER_MISSING

    def __init__(self, detail: str) -> None:
        super().__init__(f"{REASON_DECODER_MISSING}: {detail}")
        self.detail = detail


@dataclass(frozen=True)
class Loudness:
    """A file's integrated loudness and sample peak, or why it has none (WAVE-08).

    To 0.1, as the meter reports them. Either a value with its peak and no
    reason, or a reason:

    - :data:`LOUDNESS_TOO_QUIET`: no value, and the peak when there was one;
    - :data:`LOUDNESS_SILENT`: neither;
    - :data:`LOUDNESS_NOT_MEASURED`: neither, because nothing was read.

    Attributes:
        integrated_lufs: The whole file's loudness, in LUFS.
        peak_dbfs: The highest sample, in dBFS.
        reason: Why there is no value.
    """

    integrated_lufs: Optional[float] = None
    peak_dbfs: Optional[float] = None
    reason: Optional[str] = LOUDNESS_NOT_MEASURED

    def __post_init__(self) -> None:
        """Hold the combinations above."""
        for name in ("integrated_lufs", "peak_dbfs"):
            value = getattr(self, name)
            if value is not None and not (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
            ):
                raise ValueError(f"{name} must be a finite number, not {value!r}")
        if self.reason is not None and self.reason not in LOUDNESS_REASONS:
            raise ValueError(f"Not a loudness reason: {self.reason!r}")
        if (self.reason is None) != (self.integrated_lufs is not None):
            raise ValueError("A loudness has a value or a reason, never both")
        if self.reason is None and self.peak_dbfs is None:
            raise ValueError("A loudness value has its peak")
        if self.reason in (LOUDNESS_SILENT, LOUDNESS_NOT_MEASURED) and (
            self.peak_dbfs is not None
        ):
            raise ValueError(f"A {self.reason} loudness has no peak")


#: A decode whose loudness was not read.
NOT_MEASURED = Loudness()


@dataclass(frozen=True)
class Envelope:
    """A file's loudness over time, in four bands.

    Each band holds RMS amplitude, linear, at ``rate_hz`` samples a second; a
    full-scale sine reads 0.707. All four bands have the same length.

    Attributes:
        rate_hz: Samples a second.
        full: The whole signal.
        low: Below ``LOW_CROSSOVER_HZ``.
        mid: Between the crossovers.
        high: Above ``HIGH_CROSSOVER_HZ``.
        decode_errors: Errors the decoder logged. Non-zero for a file that
            decoded part-way or has damaged frames.
        loudness: The whole file's loudness, measured in the same pass
            (WAVE-08).
    """

    rate_hz: int
    full: "array[float]"
    low: "array[float]"
    mid: "array[float]"
    high: "array[float]"
    decode_errors: int = 0
    loudness: Loudness = NOT_MEASURED

    @property
    def frames(self) -> int:
        """Samples per band."""
        return len(self.full)

    @property
    def duration_ms(self) -> int:
        """The decoded length, from the envelope's own sample count."""
        return round(self.frames * 1000 / self.rate_hz)

    def band(self, name: str) -> "array[float]":
        """One band by its name in :data:`BANDS`."""
        if name not in BANDS:
            raise KeyError(name)
        values: "array[float]" = getattr(self, name)
        return values


# ---------------------------------------------------------------------------
# Building the command. Pure.
# ---------------------------------------------------------------------------


def _edge(kind: str, frequency: int) -> str:
    """One band edge: ``FILTER_SECTIONS`` two-pole filters in a row."""
    return ",".join(f"{kind}=f={frequency}:p=2" for _ in range(FILTER_SECTIONS))


def filter_graph() -> str:
    """The FFmpeg filter graph, built from the constants above."""
    low = _edge("lowpass", LOW_CROSSOVER_HZ)
    mid = ",".join(
        (_edge("highpass", LOW_CROSSOVER_HZ), _edge("lowpass", HIGH_CROSSOVER_HZ))
    )
    high = _edge("highpass", HIGH_CROSSOVER_HZ)
    return (
        f"{LOUDNESS_METER},"
        f"aresample={DECODE_RATE_HZ}:ochl=mono:rematrix_maxval=1,"
        "aformat=sample_fmts=flt:channel_layouts=mono,"
        "asplit=4[full][l][m][h];"
        f"[l]{low}[low];"
        f"[m]{mid}[mid];"
        f"[h]{high}[high];"
        f"[full][low][mid][high]join=inputs=4:channel_layout={CHANNEL_LAYOUT},"
        "asplit=2[x][y];[x][y]amultiply,"
        f"aresample={ENVELOPE_RATE_HZ},"
        f"aformat=sample_fmts=flt:channel_layouts={CHANNEL_LAYOUT}"
    )


def decoder_arguments(
    decoder: Union[str, Path],
    source: Union[str, Path],
    *,
    output: str,
    log_file: Union[str, Path],
) -> List[str]:
    """The decoder's full argument list for one file.

    The source is last, after ``--``, so a file whose name begins with ``-`` is
    never read as an option. Nothing in the list comes from the file's name but
    that last argument.
    """
    return [
        str(decoder),
        # Isolated from the user's own mpv: no config, scripts, saved positions,
        # online lookups or controller.
        "--no-config",
        "--load-scripts=no",
        "--ytdl=no",
        "--osc=no",
        "--resume-playback=no",
        "--save-position-on-quit=no",
        "--input-default-bindings=no",
        "--input-terminal=no",
        # Audio only, no picture from cover art.
        "--vid=no",
        "--sid=no",
        "--audio-display=no",
        # Samples out, messages to a file.
        "--terminal=no",
        f"--log-file={log_file}",
        "--ao=pcm",
        "--ao-pcm-waveheader=no",
        f"--ao-pcm-file={output}",
        "--audio-format=float",
        f"--af=lavfi=[{filter_graph()}]",
        "--",
        str(source),
    ]


def default_transport(platform: str = sys.platform) -> str:
    """How samples leave the child on this platform."""
    return TRANSPORT_FILE if platform == "win32" else TRANSPORT_PIPE


def platform_transports(platform: str = sys.platform) -> Tuple[str, ...]:
    """Every transport this platform can use: Windows has no ``/dev/stdout``."""
    return (TRANSPORT_FILE,) if platform == "win32" else TRANSPORTS


def is_decodable_path(path: Union[str, Path]) -> bool:
    """True when the file's extension is a format the decoder is pinned for."""
    return Path(path).suffix.lower() in AUDIO_EXTENSIONS


def decoder_from_env(environ: Optional[Mapping[str, str]] = None) -> Optional[Path]:
    """The decoder Electron named, or ``None`` when there is none to use.

    ``None`` is an ordinary answer: a Linux build bundles no ``mpv``, and the CLI
    and a hand-started engine are given none.
    """
    raw = (os.environ if environ is None else environ).get(DECODER_PATH_ENV, "")
    raw = raw.strip()
    if not raw:
        return None
    path = Path(raw)
    return path if path.is_file() else None


# ---------------------------------------------------------------------------
# Reading what came back. Pure.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DecoderLog:
    """What a decode's log says, reduced to what the outcome depends on."""

    outputs: Tuple[str, ...]
    errors: Tuple[str, ...]
    filter_failed: bool
    #: The decoder's last line, ``Exiting... (reason)``, is there.
    complete: bool = False

    @property
    def negotiated(self) -> bool:
        """True when every output the decoder opened is this pipeline's."""
        return bool(self.outputs) and all(o == EXPECTED_OUTPUT for o in self.outputs)

    def first_error(self) -> str:
        """The decoder's first error, or a plain sentence when it gave none."""
        return self.errors[0] if self.errors else "the decoder gave no reason"


def read_decoder_log(text: str) -> DecoderLog:
    """Reduce a decoder log to its outputs, its errors and any dropped filter."""
    outputs: List[str] = []
    errors: List[str] = []
    filter_failed = False
    complete = False
    for line in text.splitlines():
        match = _LOG_LINE.match(line)
        if match is None:
            continue
        message = match.group("text").strip()
        if message.startswith("AO: ["):
            outputs.append(message)
        if match.group("level") in ("e", "f"):
            errors.append(message)
        if any(marker in message for marker in _FILTER_FAILED):
            filter_failed = True
        if match.group("module") == "cplayer" and message.startswith("Exiting..."):
            complete = True
    return DecoderLog(tuple(outputs), tuple(errors), filter_failed, complete)


# The meter's summary, as FFmpeg 8 writes it on mpv's `ffmpeg` log:
#
#   Parsed_ebur128_0: Summary:
#
#     Integrated loudness:
#       I:         -6.5 LUFS
#       Threshold: -16.5 LUFS
#     ...
#     Sample peak:
#       Peak:       -4.3 dBFS
_SUMMARY = re.compile(r"^Parsed_ebur128_\d+: Summary:$")
_INTEGRATED = re.compile(r"^I:\s+(?P<value>-?\d+\.\d) LUFS$")
_PEAK = re.compile(r"^Peak:\s+(?P<value>-inf|-?\d+\.\d) dBFS$")
_SECTIONS = {
    "Integrated loudness:": "integrated",
    "Loudness range:": "range",
    "Sample peak:": "peak",
    "True peak:": "true_peak",
}

_UNREAD_LOGGED = threading.Event()


def read_loudness(text: str) -> Loudness:
    """The loudness a decode's log reports, read strictly (WAVE-08).

    FFmpeg's wording is not an interface, so anything but exactly one summary
    holding exactly one integrated value and one sample peak is
    :data:`NOT_MEASURED`: no summary (a build whose meter did not run), two (a
    graph that was rebuilt part-way, each measuring part of the file), or a
    line in either place that does not read as a number. The release check
    (``fetch_player_sidecar.py --check-analysis``) fails a pinned build whose
    wording changes before it ships.
    """
    summaries = 0
    section: Optional[str] = None
    integrated: List[str] = []
    peaks: List[str] = []
    malformed = False
    for line in text.splitlines():
        match = _LOG_LINE.match(line)
        if match is None or match.group("module") != "ffmpeg":
            continue
        message = match.group("text").strip()
        if _SUMMARY.match(message):
            summaries += 1
            section = None
            continue
        if not summaries or not message:
            continue
        if message in _SECTIONS:
            section = _SECTIONS[message]
        elif section == "integrated" and message.startswith("I:"):
            found = _INTEGRATED.match(message)
            malformed = malformed or found is None
            if found is not None:
                integrated.append(found.group("value"))
        elif section == "peak" and message.startswith("Peak:"):
            found = _PEAK.match(message)
            malformed = malformed or found is None
            if found is not None:
                peaks.append(found.group("value"))
    if summaries != 1 or malformed or len(integrated) != 1 or len(peaks) != 1:
        return NOT_MEASURED
    lufs = float(integrated[0])
    peak = float(peaks[0])
    if peak == -math.inf:
        return Loudness(reason=LOUDNESS_SILENT)
    if lufs <= LOUDNESS_FLOOR_LUFS:
        return Loudness(peak_dbfs=peak, reason=LOUDNESS_TOO_QUIET)
    return Loudness(integrated_lufs=lufs, peak_dbfs=peak, reason=None)


def _rms(mean_square: float) -> float:
    """RMS from a mean square. The resampler's ringing can dip below zero."""
    if not math.isfinite(mean_square) or mean_square <= 0.0:
        return 0.0
    return math.sqrt(mean_square)


def _rms_band(mean_squares: "array[float]") -> "array[float]":
    """:func:`_rms` over a whole band, without a Python loop (WAVE-03).

    A six-minute track is 216,000 values. Read one at a time, the parse held the
    engine's interpreter lock for some 60 ms a track, and with the library
    analysis running that tripled the Library search's p95: every query that
    released the lock to SQLite waited to have it back. Here the work is C's:
    ``max(0.0, v)`` is 0.0 for a negative, a zero and a NaN alike, since every
    comparison with a NaN is false, and ``sqrt`` follows. An infinity, which no
    decoder has been seen to write, takes the per-value rule, so the answer is
    :func:`_rms`'s exactly.
    """
    if any(map(math.isinf, mean_squares)):
        return array("f", map(_rms, mean_squares))
    return array("f", map(math.sqrt, map(max, repeat(0.0), mean_squares)))


def parse_envelope(
    raw: bytes,
    *,
    rate_hz: int = ENVELOPE_RATE_HZ,
    decode_errors: int = 0,
    loudness: Loudness = NOT_MEASURED,
) -> Envelope:
    """Turn the child's interleaved mean squares into an :class:`Envelope`.

    Native-endian 32-bit floats, one frame of four per envelope sample. A
    trailing partial frame, which only a killed child could leave, is dropped.
    """
    usable = len(raw) - (len(raw) % _FRAME_BYTES)
    samples: "array[float]" = array("f")
    samples.frombytes(raw[:usable])
    channels = len(BANDS)
    bands = [_rms_band(samples[i::channels]) for i in range(channels)]
    return Envelope(
        rate_hz=rate_hz,
        full=bands[0],
        low=bands[1],
        mid=bands[2],
        high=bands[3],
        decode_errors=decode_errors,
        loudness=loudness,
    )


# ---------------------------------------------------------------------------
# The child processes.
# ---------------------------------------------------------------------------

_LIVE: Set["subprocess.Popen[bytes]"] = set()
# Children `terminate_children` ended, so their decode reads as cancelled.
_ENDED: Set["subprocess.Popen[bytes]"] = set()
_LIVE_LOCK = threading.Lock()
_SWEPT = threading.Event()
# Set once this decoder has written a whole log: only then is a log without its
# last line known to be cut short, rather than a build that never writes one.
_COMPLETE_SEEN = threading.Event()


def live_children() -> int:
    """How many decoder children are running now."""
    with _LIVE_LOCK:
        return len(_LIVE)


def terminate_children() -> int:
    """Kill every decoder child still running, and say how many there were.

    Called as the engine stops, whether it was asked to or its app has gone, so
    no decode outlives the engine that started it.
    """
    with _LIVE_LOCK:
        children = list(_LIVE)
        _ENDED.update(children)
    for child in children:
        try:
            child.kill()
        except OSError:
            pass
    return len(children)


atexit.register(terminate_children)


def _spawn_flags(platform: str = sys.platform) -> int:
    """Windows creation flags: below-normal priority, and no console window."""
    if platform != "win32":
        return 0
    below_normal = getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0x00004000)
    no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return int(below_normal) | int(no_window)


#: ``JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE``: the job's processes end with its last handle.
_KILL_ON_JOB_CLOSE = 0x2000
#: ``JobObjectExtendedLimitInformation``.
_EXTENDED_LIMIT_INFORMATION = 9

_JOB_LOCK = threading.Lock()
_JOB: List[Optional[int]] = []


def _engine_job() -> Optional[int]:
    """Windows: the job every decoder child joins, ended with the engine.

    ``terminate_children`` ends the children when the engine stops, or is
    stopped because its app has gone. Neither runs when the engine itself is
    killed: by a tree kill that listed the processes before a child started,
    by End Task, by a crash. Such children were found hours later, idle, after
    end-to-end runs. A job made to kill on close is the operating system's own
    guarantee: its one handle is the engine's, and when the engine ends in any
    way the handle closes and every child in the job ends with it.

    Made once, on the first decode. ``None`` off Windows, or when the job could
    not be made; the decode goes ahead either way, as it did before.
    """
    if sys.platform != "win32":
        return None
    with _JOB_LOCK:
        if _JOB:
            return _JOB[0]
        _JOB.append(_make_kill_on_close_job())
        return _JOB[0]


def _last_windows_error() -> int:
    """``ctypes.get_last_error()``, looked up like ``WinDLL`` below.

    It exists only on Windows, and the type check runs everywhere: named
    directly, mypy on Linux and macOS reports the module has no such attribute.
    """
    import ctypes

    return int(getattr(ctypes, "get_last_error")())


def _make_kill_on_close_job() -> Optional[int]:
    import ctypes
    from ctypes import wintypes

    class _BasicLimits(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class _IoCounters(ctypes.Structure):
        _fields_ = [
            (name, ctypes.c_uint64)
            for name in (
                "ReadOperationCount",
                "WriteOperationCount",
                "OtherOperationCount",
                "ReadTransferCount",
                "WriteTransferCount",
                "OtherTransferCount",
            )
        ]

    class _ExtendedLimits(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", _BasicLimits),
            ("IoInfo", _IoCounters),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    # Looked up rather than named: ``WinDLL`` exists only on Windows, and the
    # type check runs everywhere.
    kernel32 = getattr(ctypes, "WinDLL")("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    kernel32.SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        ctypes.c_void_p,
        wintypes.DWORD,
    ]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        _logger.warning(
            "[waveforms] no job for the decoders (error %s); they end with the "
            "engine only when it stops itself",
            _last_windows_error(),
        )
        return None
    limits = _ExtendedLimits()
    limits.BasicLimitInformation.LimitFlags = _KILL_ON_JOB_CLOSE
    if not kernel32.SetInformationJobObject(
        job,
        _EXTENDED_LIMIT_INFORMATION,
        ctypes.byref(limits),
        ctypes.sizeof(limits),
    ):
        _logger.warning(
            "[waveforms] the decoders' job could not be set to end them (error %s)",
            _last_windows_error(),
        )
        kernel32.CloseHandle(job)
        return None
    return int(job)


def _join_engine_job(child: "subprocess.Popen[bytes]") -> None:
    """Put a decoder child in :func:`_engine_job`, so it cannot outlive the engine."""
    job = _engine_job()
    if job is None:
        return
    import ctypes
    from ctypes import wintypes

    kernel32 = getattr(ctypes, "WinDLL")("kernel32", use_last_error=True)
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    handle = getattr(child, "_handle", None)
    if handle is None or not kernel32.AssignProcessToJobObject(job, int(handle)):
        # Gone already, or refused by a job the engine runs in that allows no
        # nesting: the decode still runs, and the engine's own stop still ends it.
        _logger.debug(
            "[waveforms] a decoder child was not put in the engine's job (error %s)",
            _last_windows_error(),
        )


def _lower_priority(pid: int) -> None:
    """Lower a child's priority on macOS and Linux; Windows did it at spawn."""
    if sys.platform == "win32":
        return
    try:
        current = os.getpriority(os.PRIO_PROCESS, pid)
        os.setpriority(os.PRIO_PROCESS, pid, min(19, current + NICE_INCREMENT))
    except OSError:
        # Gone already, or not ours to change: priority is a courtesy.
        pass


def sweep_stale_workdirs(
    root: Optional[Path] = None,
    *,
    older_than_seconds: float = STALE_WORKDIR_SECONDS,
    now: Optional[float] = None,
) -> int:
    """Remove decode folders an engine left when it was killed. Say how many."""
    base = Path(root) if root is not None else Path(tempfile.gettempdir())
    cutoff = (time.time() if now is None else now) - older_than_seconds
    removed = 0
    try:
        candidates = list(base.glob(f"{WORKDIR_PREFIX}*"))
    except OSError:
        return 0
    for folder in candidates:
        try:
            if folder.is_dir() and folder.stat().st_mtime < cutoff:
                shutil.rmtree(folder, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    return removed


def _check_source(source: Path) -> None:
    """Refuse what must never reach the decoder, before a child exists."""
    if not source.is_absolute():
        raise DecodeFailed(REASON_UNDECODABLE, "not an absolute path")
    try:
        status = source.stat()
    except FileNotFoundError as exc:
        raise FileGone(str(source)) from exc
    except NotADirectoryError as exc:
        raise FileGone(str(source)) from exc
    except OSError as exc:
        raise DecodeFailed(REASON_UNDECODABLE, f"could not be opened: {exc}") from exc
    if not stat.S_ISREG(status.st_mode):
        raise DecodeFailed(REASON_UNDECODABLE, "not a file")
    if not is_decodable_path(source):
        raise DecodeFailed(
            REASON_UNDECODABLE,
            f"{source.suffix or 'no extension'!r} is not an audio format CuePoint decodes",
        )


def _read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _watch(
    child: "subprocess.Popen[bytes]",
    finished: threading.Event,
    stopped: List[str],
    cancel: Optional[Callable[[], bool]],
    timeout_seconds: float,
) -> None:
    """Kill the child on a cancel or at its deadline, and say which."""
    deadline = time.monotonic() + timeout_seconds
    while not finished.is_set():
        why: Optional[str] = None
        if cancel is not None and cancel():
            why = "cancelled"
        elif time.monotonic() >= deadline:
            why = REASON_TIMEOUT
        if why is not None:
            stopped.append(why)
            try:
                child.kill()
            except OSError:
                pass
            return
        finished.wait(_POLL_SECONDS)


def decode_envelope(
    source: Union[str, Path],
    decoder: Union[str, Path],
    *,
    cancel: Optional[Callable[[], bool]] = None,
    timeout_seconds: float = FILE_TIMEOUT_SECONDS,
    transport: Optional[str] = None,
    workdir_root: Optional[Path] = None,
) -> Envelope:
    """Decode one file into its :class:`Envelope`.

    Args:
        source: The file, as an absolute local path.
        decoder: The ``mpv`` executable.
        cancel: Polled while the child runs; when it answers True the child is
            killed and :class:`DecodeCancelled` raised.
        timeout_seconds: The wall-clock cap.
        transport: ``pipe`` or ``file``; the platform's default when omitted.
        workdir_root: Where the private temporary folder is made.

    Raises:
        FileGone: The file is not there now.
        DecodeFailed: The file could not be analysed.
        DecoderUnavailable: The decoder cannot analyse anything.
        DecodeCancelled: ``cancel`` answered True.
    """
    source_path = Path(source)
    decoder_path = Path(decoder)
    mode = transport or default_transport()
    if mode not in TRANSPORTS:
        raise ValueError(f"Unknown transport: {mode!r}")
    if mode not in platform_transports():
        # Asked for by a caller, never chosen here. Run, it would fail as the
        # file's fault, and a file would be stored as undecodable for it.
        raise ValueError(f"The {mode} transport does not work on {sys.platform}")
    if cancel is not None and cancel():
        raise DecodeCancelled(str(source_path))
    if not decoder_path.is_file():
        raise DecoderUnavailable(f"no decoder at {str(decoder_path)!r}")
    _check_source(source_path)

    if not _SWEPT.is_set():
        _SWEPT.set()
        sweep_stale_workdirs(workdir_root)

    # The decoder can exit before its log is all on disk, most often on a busy
    # machine: the log then stops short of the output it opened, or of the
    # loudness summary, and a good file would read as having no audio. Such a
    # decode is run again; the last attempt is judged on what it left.
    attempt = 1
    while True:
        workdir = Path(tempfile.mkdtemp(prefix=WORKDIR_PREFIX, dir=workdir_root))
        try:
            returncode, raw, err, log_text = _decode_in(
                workdir, source_path, decoder_path, mode, cancel, timeout_seconds
            )
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
        if log_text is not None and read_decoder_log(log_text).complete:
            _COMPLETE_SEEN.set()
        elif (
            log_text is not None and _COMPLETE_SEEN.is_set() and attempt < LOG_ATTEMPTS
        ):
            _logger.info(
                "[waveforms] the decoder's log for %s was cut short; decoding again",
                source_path.name,
            )
            attempt += 1
            continue
        return _outcome(source_path, returncode, raw, err, log_text)


def _decode_in(
    workdir: Path,
    source: Path,
    decoder: Path,
    mode: str,
    cancel: Optional[Callable[[], bool]],
    timeout_seconds: float,
) -> Tuple[int, bytes, bytes, Optional[str]]:
    """Run the decoder once: its exit code, output, stderr and log."""
    log_path = workdir / _LOG_FILE
    envelope_path = workdir / _ENVELOPE_FILE
    output = "/dev/stdout" if mode == TRANSPORT_PIPE else str(envelope_path)
    arguments = decoder_arguments(decoder, source, output=output, log_file=log_path)
    stdout: Union[int, IO[bytes]] = (
        subprocess.PIPE if mode == TRANSPORT_PIPE else subprocess.DEVNULL
    )
    try:
        child = subprocess.Popen(
            arguments,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=subprocess.PIPE,
            close_fds=True,
            creationflags=_spawn_flags(),
        )
    except OSError as exc:
        raise DecoderUnavailable(f"could not run {decoder!r}: {exc}") from exc

    with _LIVE_LOCK:
        _LIVE.add(child)
    finished = threading.Event()
    stopped: List[str] = []
    watchdog = threading.Thread(
        target=_watch,
        args=(child, finished, stopped, cancel, timeout_seconds),
        name="cuepoint-decode-watch",
        daemon=True,
    )
    try:
        _join_engine_job(child)
        _lower_priority(child.pid)
        watchdog.start()
        raw, err = child.communicate()
    finally:
        finished.set()
        if watchdog.is_alive():
            watchdog.join()
        with _LIVE_LOCK:
            _LIVE.discard(child)
            ended = child in _ENDED
            _ENDED.discard(child)

    if ended:
        # The engine is stopping; this decode was not the file's to fail.
        raise DecodeCancelled(str(source))
    if stopped:
        if stopped[0] == REASON_TIMEOUT:
            raise DecodeFailed(
                REASON_TIMEOUT, f"took longer than {timeout_seconds:g} seconds"
            )
        raise DecodeCancelled(str(source))

    if mode == TRANSPORT_FILE:
        try:
            raw = envelope_path.read_bytes()
        except FileNotFoundError:
            raw = b""
        except OSError as exc:
            raise DecoderUnavailable(
                f"could not read the decoder's output: {exc}"
            ) from exc

    return child.returncode, raw or b"", err or b"", _read_text(log_path)


def _outcome(
    source: Path,
    returncode: int,
    raw: bytes,
    err: bytes,
    log_text: Optional[str],
) -> Envelope:
    """Decide what one finished decode means."""
    if log_text is None:
        said = err.decode("utf-8", errors="replace").strip()
        raise DecoderUnavailable(
            "the decoder wrote no log" + (f": {said[:200]!r}" if said else "")
        )
    log = read_decoder_log(log_text)
    if log.filter_failed or (log.outputs and not log.negotiated):
        found = ", ".join(log.outputs) or "none"
        raise DecoderUnavailable(
            f"the analysis filters did not run as built (output {found}; "
            f"expected {EXPECTED_OUTPUT})"
        )
    if returncode != 0:
        if not source.exists():
            raise FileGone(str(source))
        if not log.errors:
            # A failed load that logged no error found nothing to decode: a
            # valid container with no samples, such as an empty WAV.
            raise DecodeFailed(REASON_NO_AUDIO, "the file holds no audio to decode")
        raise DecodeFailed(REASON_UNDECODABLE, log.first_error())
    if not log.outputs or len(raw) < _FRAME_BYTES:
        raise DecodeFailed(REASON_NO_AUDIO, "no audio was decoded")
    loudness = read_loudness(log_text)
    if loudness.reason == LOUDNESS_NOT_MEASURED and not _UNREAD_LOGGED.is_set():
        # Once an engine: a build whose meter says nothing says it for every
        # file. The waveform is kept; loudness never costs a file its picture.
        _UNREAD_LOGGED.set()
        _logger.warning(
            "[waveforms] the decoder's log held no loudness summary to read"
            " (first seen on %s); loudness is not measured",
            source.name,
        )
    return parse_envelope(raw, decode_errors=len(log.errors), loudness=loudness)


__all__ = [
    "ANALYSIS_VERSION",
    "AUDIO_EXTENSIONS",
    "BANDS",
    "CHANNEL_LAYOUT",
    "DECODER_PATH_ENV",
    "DECODE_RATE_HZ",
    "ENVELOPE_RATE_HZ",
    "EXPECTED_OUTPUT",
    "FILE_FAILURE_REASONS",
    "FILE_TIMEOUT_SECONDS",
    "HIGH_CROSSOVER_HZ",
    "LOUDNESS_FLOOR_LUFS",
    "LOUDNESS_METER",
    "LOUDNESS_NOT_MEASURED",
    "LOUDNESS_REASONS",
    "LOUDNESS_SILENT",
    "LOUDNESS_TOO_QUIET",
    "LOUDNESS_VERSION",
    "LOW_CROSSOVER_HZ",
    "NOT_MEASURED",
    "REASON_DECODER_MISSING",
    "REASON_NO_AUDIO",
    "REASON_TIMEOUT",
    "REASON_UNDECODABLE",
    "TRANSPORTS",
    "TRANSPORT_FILE",
    "TRANSPORT_PIPE",
    "DecodeCancelled",
    "DecodeError",
    "DecodeFailed",
    "DecoderLog",
    "DecoderUnavailable",
    "Envelope",
    "FileGone",
    "Loudness",
    "decode_envelope",
    "decoder_arguments",
    "decoder_from_env",
    "default_transport",
    "filter_graph",
    "is_decodable_path",
    "live_children",
    "parse_envelope",
    "platform_transports",
    "read_decoder_log",
    "read_loudness",
    "sweep_stale_workdirs",
    "terminate_children",
]
