#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A stand-in ``mpv``, for the tests that run the decoder as a child (C19g).

``audio_decode`` spawns the decoder as a child, passes it ``--ao-pcm-file`` and
``--log-file``, and reads what it wrote. :data:`STUB_SOURCE` is a Python script
that takes those arguments and writes a log and an envelope as ``STUB_MODE``
says (``good``, ``error``, ``slow``, ``sleep`` and the rest below), so a test
can decode through the real supervision code, threads and pipes without a real
``mpv``, and the worker-process tests can compare the two computers on the same
bytes.

The script starts with a shebang, so it runs on POSIX only; its users skip on
win32. ``STUB_PID_FILE`` names a file the stub writes its own pid to, for
tests that look for orphans.
"""

from __future__ import annotations

import sys
from pathlib import Path

STUB_SOURCE = """
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
elif mode == "stuck":
    log("[i][cplayer]  (+) Audio --aid=1 (flac 2ch 44100Hz)", "[v][ao] stuck here")
    time.sleep(60)
elif mode == "nice":
    time.sleep(0.5)
    with open(os.environ["STUB_NICE_FILE"], "w") as handle:
        handle.write(str(os.getpriority(os.PRIO_PROCESS, 0)))
    log("[i][cplayer] " + os.environ["STUB_EXPECTED"])
    output(3)
elif mode == "good":
    log("[i][cplayer] " + os.environ["STUB_EXPECTED"], "[i][cplayer] Exiting... (End of file)")
    output(int(os.environ.get("STUB_FRAMES", "30")))
elif mode == "cut-short":
    # The decoder exited before its log was all on disk: the samples are whole,
    # the log stops before the output it opened. STUB_CUT_TIMES runs do so.
    count_file = os.environ["STUB_COUNT_FILE"]
    runs = int(open(count_file).read()) if os.path.exists(count_file) else 0
    with open(count_file, "w") as handle:
        handle.write(str(runs + 1))
    if runs < int(os.environ["STUB_CUT_TIMES"]):
        log("[i][cplayer]  (+) Audio --aid=1 (flac 2ch 44100Hz)")
    else:
        log("[i][cplayer] " + os.environ["STUB_EXPECTED"], "[i][cplayer] Exiting... (End of file)")
    output(30)
elif mode == "summary-lost":
    # A whole log, exit line included, but without the meter's summary, which
    # a build that measures always writes: STUB_CUT_TIMES runs lose it.
    count_file = os.environ["STUB_COUNT_FILE"]
    runs = int(open(count_file).read()) if os.path.exists(count_file) else 0
    with open(count_file, "w") as handle:
        handle.write(str(runs + 1))
    summary = [
        "[v][ffmpeg] Parsed_ebur128_0: Summary:",
        "[v][ffmpeg]   Integrated loudness:",
        "[v][ffmpeg]     I:         -23.0 LUFS",
        "[v][ffmpeg]   Sample peak:",
        "[v][ffmpeg]     Peak:       -23.0 dBFS",
    ]
    if runs < int(os.environ["STUB_CUT_TIMES"]):
        summary = []
    log("[i][cplayer] " + os.environ["STUB_EXPECTED"], *summary, "[i][cplayer] Exiting... (End of file)")
    output(30)
elif mode == "hang-once":
    # mpv's log deadlock (DEC-229): the first run stops for good part-way, with
    # some output written and its log silent; a second run goes through.
    count_file = os.environ["STUB_COUNT_FILE"]
    runs = int(open(count_file).read()) if os.path.exists(count_file) else 0
    with open(count_file, "w") as handle:
        handle.write(str(runs + 1))
    if runs < int(os.environ.get("STUB_HANG_TIMES", "1")):
        log("[i][cplayer] " + os.environ["STUB_EXPECTED"], "[d][lavfi] stuck in mp_msg")
        output(3)
        time.sleep(60)
    log("[i][cplayer] " + os.environ["STUB_EXPECTED"], "[i][cplayer] Exiting... (End of file)")
    output(30)
elif mode == "slow":
    # Healthy but slow: quiet in one channel, never in both, for longer than
    # the stall limit. STUB_SLOW_KIND says whether output or the log grows.
    kind = os.environ["STUB_SLOW_KIND"]
    seconds = float(os.environ["STUB_SLOW_SECONDS"])
    lines = ["[i][cplayer] " + os.environ["STUB_EXPECTED"]]
    log(*lines)
    frame = array("f", [0.25, 0.04, 0.01, 0.0]).tobytes()
    written = 0
    with open(options["--ao-pcm-file"], "wb") as out:
        started = time.monotonic()
        while time.monotonic() - started < seconds:
            if kind == "output":
                out.write(frame)
                out.flush()
                written += 1
            else:
                lines.append("[v][ffmpeg] still decoding")
                log(*lines)
            # Fewer than 30 frames in all, however long it is slow for.
            time.sleep(0.2)
        out.write(frame * (30 - written) if written < 30 else b"")
    log(*lines, "[i][cplayer] Exiting... (End of file)")
elif mode == "wrong-format":
    log("[i][cplayer] AO: [pcm] 44100Hz 4.0 4ch float")
    output(30)
elif mode == "no-log":
    output(30)
elif mode == "error":
    log("[e][cplayer] Failed to recognize file format.")
    sys.exit(2)
"""


def write_stub(path: Path) -> Path:
    """Write the stand-in decoder at ``path``, executable, and return it."""
    path.write_text(f"#!{sys.executable}\n{STUB_SOURCE}", encoding="utf-8")
    path.chmod(0o755)
    return path


__all__ = ("STUB_SOURCE", "write_stub")
