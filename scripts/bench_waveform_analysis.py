#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure the library's waveform analysis (WAVE-03).

WAVE-03's acceptance, taken on the real job: the engine's own services, job
store and coordinator, the real decoder, and a library imported the way a user's
is. Nothing is a stand-in but the audio.

- **Throughput over fixture copies.** ``--tracks`` tracks (5,000 by default),
  each a copy of one of the shipped fixtures, are added to the library, checked
  present and analysed by one whole-library run. The wall time, the rate and
  every file's outcome are reported.
- **The rate on real-length tracks, extrapolated.** Fixtures are seconds long,
  so their rate says how fast the job moves, not how long a library takes.
  ``--long`` copies of a 6-minute track are analysed by a second run, and the
  rate on them is extrapolated to a 50,000-track library.
- **The engine's responsiveness.** The library holds ``--library`` imported
  tracks besides those. The Library's search is timed while the second run
  analyses, and idle both before and after it; the idle samples are pooled, so
  one noisy minute cannot pass or fail the budget, which is
  ``RESPONSIVENESS_BUDGET`` times idle at p95.
- **Playback** (``--play``). While the second run analyses, the player's
  ``mpv`` plays a three-track queue on the default audio device, and its log is
  read for underruns; the budget is none. Silent tracks, so nothing is heard.
  It needs an audio device, so it is not run by default.

The workers are the job's own default for this machine. Nothing touches
``~/.cuepoint``: the library, ``CUEPOINT_HOME`` and the audio are temporary, and
nothing reaches the network.

Usage::

    python scripts/bench_waveform_analysis.py                    # the bundled mpv
    python scripts/bench_waveform_analysis.py --play             # and playback
    python scripts/bench_waveform_analysis.py --mpv /usr/bin/mpv --json out.json

Exit status 1 when a budget is missed or a file the run should have analysed
was not.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))
sys.path.insert(0, str(_ROOT / "scripts"))

FIXTURES = _ROOT / "src" / "tests" / "fixtures" / "audio"
FIXTURE_NAMES = (
    "tone.wav",
    "tone.flac",
    "tone.aiff",
    "tone.m4a",
    "tone.mp3",
    "bands.flac",
)
DEFAULT_TRACKS = 5_000
DEFAULT_LONG = 48
DEFAULT_LIBRARY = 10_000
EXTRAPOLATE_TO = 50_000
SEARCH_REQUESTS = 400
#: The analysis may cost the engine's search at most this factor at p95.
RESPONSIVENESS_BUDGET = 1.5
#: How long each track of the playback queue plays: short enough that all three,
#: and the two changes between them where an underrun is likeliest, play while
#: the second run analyses.
PLAY_SECONDS = 6
TOKEN = "bench-waveform-analysis"
UNDERRUN_MARKERS = ("underrun detected", "restarting audio after underrun")


def _link_or_copy(source: Path, dest: Path) -> None:
    """A distinct path to the same audio: a hard link, or a copy where none can be made."""
    try:
        os.link(source, dest)
    except OSError:
        shutil.copyfile(source, dest)


def _add_tracks(paths: List[Path], prefix: str) -> List[int]:
    """Add each file as a library track and record it present, as a check would."""
    from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus
    from cuepoint.models.library_track import LibraryTrack, utc_now_iso
    from cuepoint.services.interfaces import IFileStatusRepository, ITrackRepository
    from cuepoint.utils.di_container import get_container

    tracks = get_container().resolve(ITrackRepository)
    files = get_container().resolve(IFileStatusRepository)
    for index, path in enumerate(paths):
        tracks.add(
            LibraryTrack(
                rekordbox_track_id=f"{prefix}-{index}",
                title=f"{prefix} {index}",
                artist="Bench",
                file_path=str(path),
            )
        )
    by_path = {
        str(row["file_path"]): int(row["id"])
        for row in tracks._db.connect().execute(  # noqa: SLF001 — a bench's shortcut
            "SELECT id, file_path FROM tracks WHERE rekordbox_track_id LIKE ?",
            (f"{prefix}-%",),
        )
    }
    now = utc_now_iso()
    statuses = [
        TrackFileStatus(
            by_path[str(path)], FILE_PRESENT, str(path), now, path.stat().st_size
        )
        for path in paths
    ]
    for start in range(0, len(statuses), 500):
        files.record(statuses[start : start + 500])
    return [by_path[str(path)] for path in paths]


def _run_job(store: Any, label: str, during: Optional[Any] = None) -> Dict[str, Any]:
    """Start a whole-library run and wait for it; ``during`` runs meanwhile."""
    from cuepoint.engine.waveform_jobs import coordinator

    started = time.perf_counter()
    job = coordinator(store).start(label)
    if job is None:
        raise RuntimeError("the analysis did not start")
    measured: Dict[str, Any] = {}
    # Beside the job, not before it: the job's time is its own, however long
    # what is measured during it takes.
    beside = threading.Thread(
        target=lambda: measured.update(during(job) if during else {}), daemon=True
    )
    beside.start()
    while job.state.value in ("queued", "running"):
        time.sleep(0.05)
    wall = time.perf_counter() - started
    beside.join()
    result = dict(job.result or {})
    analysed = int(result.get("analysed", 0)) + int(result.get("failed", 0))
    rate = analysed * 3600 / wall if wall > 0 else 0.0
    return {
        "state": job.state.value,
        "wall_s": round(wall, 1),
        "analysed": int(result.get("analysed", 0)),
        "failed": int(result.get("failed", 0)),
        "not_found": int(result.get("not_found", 0)),
        "files_per_hour": round(rate),
        "during": measured or None,
    }


def _get(base: str, path: str) -> None:
    import urllib.request

    request = urllib.request.Request(
        base + path, headers={"Authorization": f"Bearer {TOKEN}"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def _search_ms(base: str, total: int, index: int) -> float:
    offset = (index * 7919) % max(1, total - 50)
    query = (
        f"/api/v1/library/search?mode=browse&limit=50&offset={offset}"
        if index % 2
        else f"/api/v1/library/search?q=Track%20{(index * 104729) % total}&limit=50"
    )
    started = time.perf_counter()
    _get(base, query)
    return (time.perf_counter() - started) * 1000


def _p95(samples: List[float]) -> Optional[float]:
    if not samples:
        return None
    ordered = sorted(samples)
    return round(ordered[max(0, int(len(ordered) * 0.95) - 1)], 1)


def _searches_while(base: str, total: int, job: Any) -> Dict[str, Any]:
    """Search until ``SEARCH_REQUESTS`` samples, counting only those while ``job`` runs."""
    samples: List[float] = []
    index = 0
    while len(samples) < SEARCH_REQUESTS and job.state.value in ("queued", "running"):
        elapsed = _search_ms(base, total, index)
        if job.state.value == "running":
            samples.append(elapsed)
        index += 1
    return {"samples": len(samples), "p95_ms": _p95(samples)}


def _silent_wav(path: Path, seconds: int) -> None:
    import wave

    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(44_100)
        wav.writeframes(bytes(4 * 44_100 * seconds))


def underrun_lines(log: str) -> List[str]:
    """The lines of a player's log that report an underrun."""
    return [
        line.strip()
        for line in log.splitlines()
        if any(marker in line.lower() for marker in UNDERRUN_MARKERS)
    ]


def _play(mpv: Path, workspace: Path) -> Dict[str, Any]:
    """Play a three-track queue on the audio device, as the player would; read its log."""
    queue = []
    for index in range(3):
        track = workspace / f"queue-{index}.wav"
        _silent_wav(track, PLAY_SECONDS)
        queue.append(str(track))
    log = workspace / "player.log"
    completed = subprocess.run(
        [
            str(mpv),
            "--no-config",
            "--no-video",
            "--terminal=no",
            "--msg-level=all=v",
            f"--log-file={log}",
            *queue,
        ],
        capture_output=True,
        timeout=PLAY_SECONDS * 3 + 60,
        check=False,
    )
    text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    underruns = underrun_lines(text)
    audio_out = next(
        (line.strip() for line in text.splitlines() if "AO: [" in line), None
    )
    return {
        "exit_code": completed.returncode,
        "audio_output": audio_out,
        "underruns": len(underruns),
        "underrun_lines": underruns[:5],
    }


def _write_long(mpv: Path, workspace: Path) -> Path:
    from bench_decoder import encode, write_source

    source = workspace / "six.wav"
    write_source(source)
    flac = workspace / "six.flac"
    if not encode(mpv, source, flac, "flac", "flac"):
        raise RuntimeError("the decoder could not write a FLAC to analyse")
    source.unlink()
    return flac


def _decoder_version(mpv: Path) -> str:
    output = subprocess.run(
        [str(mpv), "--version"], capture_output=True, text=True, check=False
    ).stdout.splitlines()
    return " / ".join(
        line.strip() for line in output if line.startswith(("mpv", "FFmpeg"))
    )


def run(
    mpv: Path,
    workspace: Path,
    *,
    tracks: int,
    long_tracks: int,
    library: int,
    play: bool,
) -> Dict[str, Any]:
    os.environ["CUEPOINT_HOME"] = str(workspace / "home")
    os.environ["CUEPOINT_SKIP_BEATPORT"] = "1"
    os.environ["CUEPOINT_DECODER_PATH"] = str(mpv)
    from bench_library import build_service, write_export

    from cuepoint.engine.jobs import JobStore
    from cuepoint.engine.server import (
        EngineConfig,
        fine_timer_resolution,
        start_engine_thread,
    )
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.database_service import default_database_path
    from cuepoint.services.waveform_analysis_service import default_workers
    from cuepoint.utils.di_container import reset_container

    # The engine's own process setting, which ``run_engine`` makes at launch:
    # this engine runs in the bench's process instead.
    fine_timer_resolution()
    xml = write_export(workspace / "library.xml", list(range(1, library + 1)))
    service, _tracks, _playlists = build_service(default_database_path())
    service.import_rekordbox_xml(str(xml))
    reset_container()
    bootstrap_services()

    music = workspace / "music"
    music.mkdir()
    copies = []
    for index in range(tracks):
        name = FIXTURE_NAMES[index % len(FIXTURE_NAMES)]
        dest = music / f"{index:05d}-{name}"
        _link_or_copy(FIXTURES / name, dest)
        copies.append(dest)
    _add_tracks(copies, "copy")

    store = JobStore()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    httpd, _thread = start_engine_thread(
        EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=store
    )
    base = f"http://127.0.0.1:{port}"
    try:
        throughput = _run_job(store, "bench")

        long_source = _write_long(mpv, workspace)
        long_copies = []
        for index in range(long_tracks):
            dest = music / f"six-{index:03d}.flac"
            _link_or_copy(long_source, dest)
            long_copies.append(dest)
        _add_tracks(long_copies, "six")

        for index in range(20):  # warm the page cache and the connection path
            _search_ms(base, library, index)
        idle_samples = [_search_ms(base, library, i) for i in range(SEARCH_REQUESTS)]
        player: Dict[str, Any] = {}

        def during(job: Any) -> Dict[str, Any]:
            playing = None
            if play:

                def play_queue() -> None:
                    player.update(_play(mpv, workspace))
                    player["ended_while_analysing"] = job.state.value == "running"

                playing = threading.Thread(target=play_queue, daemon=True)
                playing.start()
            searched = _searches_while(base, library, job)
            if playing is not None:
                playing.join()
            return searched

        six = _run_job(store, "bench", during=during)
        idle_samples += [_search_ms(base, library, i) for i in range(SEARCH_REQUESTS)]
        idle = _p95(idle_samples)
    finally:
        httpd.shutdown()

    rate = six["files_per_hour"]
    searched = six.pop("during") or {}
    throughput.pop("during", None)
    return {
        "platform": f"{platform.system()} {platform.machine()}, {os.cpu_count()} cores",
        "decoder": _decoder_version(mpv),
        "workers": default_workers(),
        "fixture_copies": {"tracks": tracks, **throughput},
        "six_minute": {"tracks": long_tracks, **six},
        "extrapolated": {
            "tracks": EXTRAPOLATE_TO,
            "hours": round(EXTRAPOLATE_TO / rate, 1) if rate else None,
        },
        "responsiveness": {
            "library": library,
            "idle_p95_ms": idle,
            "running_p95_ms": searched.get("p95_ms"),
            "running_samples": searched.get("samples", 0),
            "ratio": round(searched["p95_ms"] / idle, 2)
            if idle and searched.get("p95_ms")
            else None,
        },
        "playback": player or None,
    }


def report(result: Dict[str, Any]) -> None:
    print(f"{result['platform']} — {result['decoder']}; {result['workers']} worker(s)")
    copies = result["fixture_copies"]
    print(
        f"{copies['tracks']:,} fixture copies: {copies['analysed']:,} analysed, "
        f"{copies['failed']} failed, {copies['not_found']} not found, in "
        f"{copies['wall_s']} s ({copies['files_per_hour']:,} an hour)"
    )
    six = result["six_minute"]
    print(
        f"{six['tracks']} six-minute tracks: {six['wall_s']} s "
        f"({six['files_per_hour']:,} an hour); {result['extrapolated']['tracks']:,} "
        f"tracks would take about {result['extrapolated']['hours']} hours"
    )
    r = result["responsiveness"]
    print(
        f"Search p95 over {r['library']:,} tracks: idle {r['idle_p95_ms']} ms, "
        f"analysing {r['running_p95_ms']} ms ({r['ratio']}x, {r['running_samples']} "
        f"samples)"
    )
    if result["playback"]:
        p = result["playback"]
        print(
            f"Playback: {p['underruns']} underruns ({p['audio_output']}, exit "
            f"{p['exit_code']}; whole queue played during the analysis: "
            f"{p.get('ended_while_analysing')})"
        )


def over_budget(result: Dict[str, Any]) -> List[str]:
    problems = []
    for name in ("fixture_copies", "six_minute"):
        part = result[name]
        if part["state"] != "succeeded":
            problems.append(f"the {name} run ended {part['state']}")
        if part["analysed"] != part["tracks"]:
            problems.append(f"{part['analysed']} of {part['tracks']} {name} analysed")
    ratio = result["responsiveness"]["ratio"]
    if ratio is not None and ratio > RESPONSIVENESS_BUDGET:
        problems.append(f"search p95 is {ratio}x idle while analysing")
    if result["playback"] and result["playback"]["underruns"]:
        problems.append(f"{result['playback']['underruns']} playback underruns")
    if result["playback"] and result["playback"].get("ended_while_analysing") is False:
        problems.append("the queue outlasted the analysis; raise --long to cover it")
    return problems


def _close_databases() -> None:
    """Close the library database and the store, so the workspace can go."""
    from cuepoint.persistence.waveform_store import WaveformStore
    from cuepoint.services.interfaces import IDatabaseService
    from cuepoint.utils.di_container import get_container, reset_container

    try:
        container = get_container()
        container.resolve(WaveformStore).close_all()
        container.resolve(IDatabaseService).close_all()
    except Exception:  # noqa: BLE001 — nothing was opened
        pass
    reset_container()


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
    parser.add_argument("--long", type=int, default=DEFAULT_LONG, dest="long_tracks")
    parser.add_argument("--library", type=int, default=DEFAULT_LIBRARY)
    parser.add_argument(
        "--play", action="store_true", help="Also play a queue on the audio device"
    )
    parser.add_argument("--json", type=Path, help="Also write the result here")
    args = parser.parse_args(argv)

    mpv = _resolve(args.mpv)
    if not mpv.is_file():
        print(f"No decoder at {mpv}", file=sys.stderr)
        return 2
    # A handle an engine thread still holds must not turn a measurement into a
    # failure: Windows refuses to delete an open file.
    with tempfile.TemporaryDirectory(
        prefix="cuepoint-bench-analysis-", ignore_cleanup_errors=True
    ) as tmp:
        try:
            result = run(
                mpv,
                Path(tmp),
                tracks=args.tracks,
                long_tracks=args.long_tracks,
                library=args.library,
                play=args.play,
            )
        finally:
            _close_databases()
    report(result)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    problems = over_budget(result)
    for problem in problems:
        print(f"OVER BUDGET: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
