#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure the waveform decoder (WAVE-01, ADR-009).

Every number ADR-009 records, taken again rather than trusted:

- **Per format.** A 6-minute track (a tone with noise, so every band has
  signal) is written as WAV with the standard library and encoded by the
  decoder into every format it can write here: FLAC, AIFF, ALAC, AAC and MP3
  (the last two only where the build has the encoder). Each is analysed three
  times through :func:`cuepoint.data.audio_decode.decode_envelope`; the median
  is reported.
- **The design not chosen.** The same files decoded to the full-rate
  four-band stream and reduced in this process, as the engine would have to:
  wall time, and the CPU it costs the engine's own process.
- **The child's peak memory**, where the platform reports it.
- **The engine's responsiveness.** An engine over a library of ``--tracks``
  tracks is started in this process. The p95 of the Library's search is
  measured idle, with four analyses running (the design chosen), and with
  four of the alternative running. Budget: the chosen design keeps the p95
  within ``RESPONSIVENESS_BUDGET`` of idle.

Nothing touches ``~/.cuepoint``: the library, ``CUEPOINT_HOME`` and the audio
are temporary, and nothing reaches the network.

Usage::

    python scripts/bench_decoder.py                       # the bundled mpv
    python scripts/bench_decoder.py --mpv /usr/bin/mpv    # a named one
    python scripts/bench_decoder.py --json report.json

Exit status 1 when a budget is missed.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import random
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import wave
from array import array
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))
sys.path.insert(0, str(_ROOT / "scripts"))

from cuepoint.data import audio_decode as ad  # noqa: E402

TRACK_SECONDS = 360
SAMPLE_RATE = 44_100
REPEATS = 3
DEFAULT_TRACKS = 10_000
SEARCH_REQUESTS = 200
CONCURRENT_ANALYSES = 4
#: The chosen design may cost the engine's search at most this factor at p95.
RESPONSIVENESS_BUDGET = 1.5
TOKEN = "bench-decoder"

#: What the decoder encodes each format with, where the build has the encoder.
FORMATS = (
    ("wav", None, None),
    ("flac", "flac", "flac"),
    ("aiff", "pcm_s16be", "aiff"),
    ("m4a", "alac", "ipod"),
    ("aac.m4a", "aac", "ipod"),
    ("mp3", "libmp3lame", "mp3"),
)


def write_source(path: Path) -> None:
    """Six minutes of stereo: a 441 Hz tone with noise, one second repeated."""
    rng = random.Random(1)
    second = array("h")
    for i in range(SAMPLE_RATE):
        value = int(
            6000 * math.sin(2 * math.pi * 441 * i / SAMPLE_RATE)
            + rng.randint(-3000, 3000)
        )
        second.extend((value, value))
    chunk = second.tobytes()
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        for _ in range(TRACK_SECONDS):
            wav.writeframes(chunk)


def encode(mpv: Path, source: Path, dest: Path, codec: str, container: str) -> bool:
    subprocess.run(
        [
            str(mpv),
            "--no-config",
            "--terminal=no",
            "--vid=no",
            f"--o={dest}",
            f"--oac={codec}",
            f"--of={container}",
            str(source),
        ],
        capture_output=True,
        timeout=600,
        check=False,
    )
    return dest.exists() and dest.stat().st_size > 0


def _median(call: Callable[[], Any], repeats: int = REPEATS) -> float:
    samples = []
    for _ in range(repeats):
        started = time.perf_counter()
        call()
        samples.append(time.perf_counter() - started)
    return statistics.median(samples)


def _unreduced_graph() -> str:
    """The chosen graph up to the join: full-rate bands, nothing reduced."""
    graph = ad.filter_graph()
    return graph[: graph.index(",asplit=2[x][y]")]


def engine_side(mpv: Path, source: Path) -> Dict[str, float]:
    """The design not chosen: full-rate bands through a pipe, reduced here."""
    started = time.perf_counter()
    cpu_started = time.process_time()
    child = subprocess.run(
        [
            str(mpv),
            "--no-config",
            "--terminal=no",
            "--vid=no",
            "--ao=pcm",
            "--ao-pcm-waveheader=no",
            "--audio-format=float",
            "--ao-pcm-file=/dev/stdout",
            f"--af=lavfi=[{_unreduced_graph()}]",
            "--",
            str(source),
        ],
        capture_output=True,
        check=False,
    )
    samples: "array[float]" = array("f")
    samples.frombytes(child.stdout[: len(child.stdout) - len(child.stdout) % 16])
    window = ad.DECODE_RATE_HZ // ad.ENVELOPE_RATE_HZ
    for channel in range(4):
        values = samples[channel::4]
        [
            max(max(values[i : i + window]), -min(values[i : i + window]))
            for i in range(0, len(values), window)
        ]
    return {
        "wall_s": round(time.perf_counter() - started, 2),
        "engine_cpu_s": round(time.process_time() - cpu_started, 2),
        "stream_mb": round(len(child.stdout) / 1e6, 1),
    }


#: Spawns one decoder and reports its peak resident memory. Run in a fresh,
#: small interpreter: on Linux a child's ``ru_maxrss`` survives ``exec`` and
#: starts at its parent's size, so measured from this script, which holds the
#: alternative design's 127 MB streams, every child would read as this script.
_PEAK_HELPER = """
import json, os, subprocess, sys
arguments = json.loads(sys.argv[1])
child = subprocess.Popen(arguments, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
_pid, _status, usage = os.wait4(child.pid, 0)
print(usage.ru_maxrss)
"""


def decoder_peak_rss_mb(mpv: Path, source: Path) -> Optional[float]:
    """The decoder child's own peak resident memory, where the platform says."""
    if not hasattr(os, "wait4"):
        return None
    with tempfile.TemporaryDirectory(prefix=ad.WORKDIR_PREFIX) as work:
        arguments = ad.decoder_arguments(
            mpv,
            source,
            output=str(Path(work) / "envelope.f32"),
            log_file=Path(work) / "decode.log",
        )
        answer = subprocess.run(
            [sys.executable, "-c", _PEAK_HELPER, json.dumps(arguments)],
            capture_output=True,
            text=True,
            check=True,
        )
    peak = int(answer.stdout.strip())
    # Kilobytes on Linux, bytes on macOS.
    return round(peak / (1024 * 1024 if sys.platform == "darwin" else 1024), 1)


def measure_formats(mpv: Path, workspace: Path) -> List[Dict[str, Any]]:
    source = workspace / "six.wav"
    write_source(source)
    rows: List[Dict[str, Any]] = []
    for suffix, codec, container in FORMATS:
        path = workspace / f"six.{suffix}"
        if codec is not None and not encode(mpv, source, path, codec, container):
            rows.append(
                {"format": suffix, "skipped": f"no {codec} encoder in this build"}
            )
            continue
        if codec is None:
            path = source
        envelope = ad.decode_envelope(path, mpv)
        chosen = _median(lambda: ad.decode_envelope(path, mpv))
        rows.append(
            {
                "format": suffix,
                "envelope_samples": envelope.frames,
                "chosen_s": round(chosen, 2),
                "peak_rss_mb": decoder_peak_rss_mb(mpv, path),
                "alternative": engine_side(mpv, path),
            }
        )
    return rows


def _get(base: str, path: str) -> None:
    request = urllib.request.Request(
        base + path, headers={"Authorization": f"Bearer {TOKEN}"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def _p95_ms(base: str, total: int) -> float:
    rng = random.Random(7)
    samples = []
    for i in range(SEARCH_REQUESTS):
        offset = rng.randrange(0, max(1, total - 50))
        query = (
            f"/api/v1/library/search?mode=browse&limit=50&offset={offset}"
            if i % 2
            else f"/api/v1/library/search?q=Track%20{rng.randrange(total)}&limit=50"
        )
        started = time.perf_counter()
        _get(base, query)
        samples.append((time.perf_counter() - started) * 1000)
    samples.sort()
    return round(samples[int(len(samples) * 0.95) - 1], 1)


def _running(work: Callable[[], Any]) -> Callable[[], None]:
    """Start ``CONCURRENT_ANALYSES`` threads repeating ``work``; return a stop."""
    stop = threading.Event()

    def loop() -> None:
        while not stop.is_set():
            work()

    threads = [
        threading.Thread(target=loop, daemon=True) for _ in range(CONCURRENT_ANALYSES)
    ]
    for thread in threads:
        thread.start()

    def finish() -> None:
        stop.set()
        for thread in threads:
            thread.join()

    return finish


def measure_responsiveness(mpv: Path, workspace: Path, total: int) -> Dict[str, Any]:
    os.environ["CUEPOINT_HOME"] = str(workspace / "home")
    os.environ["CUEPOINT_SKIP_BEATPORT"] = "1"
    from bench_library import build_service, write_export

    from cuepoint.engine.server import EngineConfig, start_engine_thread
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.database_service import default_database_path
    from cuepoint.utils.di_container import reset_container

    xml = write_export(workspace / "library.xml", list(range(1, total + 1)))
    service, _tracks, _playlists = build_service(default_database_path())
    service.import_rekordbox_xml(str(xml))

    reset_container()
    bootstrap_services()
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    httpd, _thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN)
    )
    base = f"http://127.0.0.1:{port}"
    source = workspace / "six.flac"
    try:
        _p95_ms(base, total)  # warm the page cache and the connection path
        idle = _p95_ms(base, total)
        stop = _running(lambda: ad.decode_envelope(source, mpv))
        chosen = _p95_ms(base, total)
        stop()
        stop = _running(lambda: engine_side(mpv, source))
        alternative = _p95_ms(base, total)
        stop()
    finally:
        httpd.shutdown()
    return {
        "tracks": total,
        "requests": SEARCH_REQUESTS,
        "concurrent_analyses": CONCURRENT_ANALYSES,
        "idle_p95_ms": idle,
        "chosen_p95_ms": chosen,
        "alternative_p95_ms": alternative,
        "chosen_ratio": round(chosen / idle, 2) if idle else None,
        "alternative_ratio": round(alternative / idle, 2) if idle else None,
    }


def _decoder_version(mpv: Path) -> str:
    output = subprocess.run(
        [str(mpv), "--version"], capture_output=True, text=True, check=False
    ).stdout.splitlines()
    return " / ".join(
        line.strip() for line in output if line.startswith(("mpv", "FFmpeg"))
    )


def run(mpv: Path, workspace: Path, total: int) -> Dict[str, Any]:
    formats = measure_formats(mpv, workspace)
    responsiveness = measure_responsiveness(mpv, workspace, total)
    return {
        "platform": f"{platform.system()} {platform.machine()}, {os.cpu_count()} cores",
        "decoder": _decoder_version(mpv),
        "track_seconds": TRACK_SECONDS,
        "formats": formats,
        "responsiveness": responsiveness,
    }


def report(result: Dict[str, Any]) -> None:
    print(f"{result['platform']} — {result['decoder']}")
    print(f"A {result['track_seconds'] // 60}-minute track, median of {REPEATS}:")
    for row in result["formats"]:
        if "skipped" in row:
            print(f"  {row['format']:8s} skipped: {row['skipped']}")
            continue
        alt = row["alternative"]
        print(
            f"  {row['format']:8s} chosen {row['chosen_s']:5.2f} s, "
            f"{row['peak_rss_mb']} MB   "
            f"alternative {alt['wall_s']:5.2f} s, {alt['engine_cpu_s']:.2f} s of the "
            f"engine's CPU, {alt['stream_mb']} MB piped"
        )
    r = result["responsiveness"]
    print(
        f"Search p95 over {r['tracks']:,} tracks: idle {r['idle_p95_ms']} ms; "
        f"{r['concurrent_analyses']} analyses running: chosen {r['chosen_p95_ms']} ms "
        f"({r['chosen_ratio']}x), alternative {r['alternative_p95_ms']} ms "
        f"({r['alternative_ratio']}x)"
    )


def over_budget(result: Dict[str, Any]) -> List[str]:
    ratio = result["responsiveness"]["chosen_ratio"]
    if ratio is not None and ratio > RESPONSIVENESS_BUDGET:
        return [f"search p95 is {ratio}x idle with analyses running"]
    return []


def _resolve(named: Optional[str]) -> Path:
    for candidate in (named, os.environ.get("CUEPOINT_MPV_PATH")):
        if candidate:
            return Path(candidate)
    import fetch_player_sidecar as fps

    manifest = fps.load_manifest()
    target = manifest.target(fps.host_target_key())
    return Path(fps.binary_path_for(target, fps.DEFAULT_DEST))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--mpv", help="The decoder (default: CUEPOINT_MPV_PATH, then the bundled one)"
    )
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--json", type=Path, help="Also write the result here")
    args = parser.parse_args(argv)

    mpv = _resolve(args.mpv)
    if not mpv.is_file():
        print(f"No mpv at {mpv}", file=sys.stderr)
        return 2
    workspace = Path(tempfile.mkdtemp(prefix="cuepoint-bench-decoder-"))
    try:
        result = run(mpv, workspace, args.tracks)
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
    report(result)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    missed = over_budget(result)
    for line in missed:
        print(f"OVER BUDGET: {line}", file=sys.stderr)
    return 1 if missed else 0


if __name__ == "__main__":
    raise SystemExit(main())
