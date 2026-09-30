#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure the waveform store at a large library's size (WAVE-02).

Every number WAVE-02's acceptance asks for, taken rather than assumed:

- **The store's size** holding ``--tracks`` waveforms (default 50,000),
  checkpointed, against a budget of 250 MB. The waveforms are synthetic, one per
  track, made at the column level from a model of dance music: sections of
  different loudness, a beat the columns sample at varying phase, and noise in
  every band. The noise makes them compress worse than the music they model, so
  the size is an upper estimate for real libraries. ``--worst-case`` stores
  random bytes instead, which ``zlib`` cannot compress at all: the ceiling.
- **A batch of 200 states** (the Library's window), and **200 pictures at
  width 120** (the Library column), each against a budget of 50 ms.
- **One picture at 1,200 columns** (the player bar), against 20 ms.

Each timing is the median and the p95 of ``REPEATS`` runs over random tracks,
after one warm-up, on a store and a library in temporary folders. Nothing
touches ``~/.cuepoint`` and nothing decodes audio: the decoder is not needed to
measure the store.

Usage::

    python scripts/bench_waveform_store.py
    python scripts/bench_waveform_store.py --tracks 5000 --json report.json
    python scripts/bench_waveform_store.py --worst-case

Exit status 1 when a budget is missed.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import random
import sqlite3
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))

from cuepoint.core.waveform import BAND_COUNT, COLUMNS, Waveform, compand, encode  # noqa: E402
from cuepoint.data.audio_decode import ANALYSIS_VERSION  # noqa: E402
from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus  # noqa: E402
from cuepoint.models.library_track import LibraryTrack  # noqa: E402
from cuepoint.models.waveform import STORED_READY, StoredWaveform  # noqa: E402
from cuepoint.persistence.file_status_repository import FileStatusRepository  # noqa: E402
from cuepoint.persistence.track_repository import TrackRepository  # noqa: E402
from cuepoint.persistence.waveform_store import (  # noqa: E402
    WaveformStore,
    default_waveform_store_path,
)
from cuepoint.services.database_service import DatabaseService  # noqa: E402
from cuepoint.services.migration_runner import MigrationRunner  # noqa: E402
from cuepoint.services.waveform_service import WaveformService  # noqa: E402

DEFAULT_TRACKS = 50_000
BATCH = 200
LIBRARY_WIDTH = 120
REPEATS = 30

SIZE_BUDGET_MB = 250.0
BATCH_BUDGET_MS = 50.0
ONE_BUDGET_MS = 20.0

_NOW = "2026-09-30T12:00:00+00:00"
_SEED = 20260930


def synthetic_waveform(generator: random.Random) -> Waveform:
    """One track's waveform, from a model of a dance track at the column level."""
    minutes = generator.uniform(4.0, 9.0)
    duration_ms = int(minutes * 60_000)
    seconds_per_column = minutes * 60 / COLUMNS
    beat = 60 / generator.choice((120, 122, 124, 126, 128, 130, 174))
    master = generator.uniform(0.35, 1.0)
    # Intro, body, breakdown, body, outro, each its own loudness per band.
    edges = sorted(generator.sample(range(60, COLUMNS - 60), 4))
    sections = list(zip([0, *edges], [*edges, COLUMNS]))
    profiles = [
        [generator.uniform(0.05, 1.0) for _ in range(BAND_COUNT)] for _ in sections
    ]
    data = bytearray(COLUMNS * BAND_COUNT)
    section = 0
    for column in range(COLUMNS):
        while column >= sections[section][1]:
            section += 1
        phase = (column * seconds_per_column % beat) / beat
        pulse = 0.75 + 0.25 * math.cos(2 * math.pi * phase)
        for band in range(BAND_COUNT):
            base = master * profiles[section][band] * (0.9 if band else 1.0)
            value = base * pulse * generator.uniform(0.8, 1.0)
            data[column * BAND_COUNT + band] = compand(value * value)
    return Waveform(COLUMNS, duration_ms, bytes(data))


def random_waveform(generator: random.Random) -> Waveform:
    """Random bytes: nothing for zlib to share, the size's ceiling."""
    return Waveform(COLUMNS, 360_000, generator.randbytes(COLUMNS * BAND_COUNT))


def _path(index: int) -> str:
    # Paths as long as a real collection's, so the index is realistic too.
    return (
        f"/Volumes/Music/Artist {index % 997:03d}/Album {index % 4999:04d}/"
        f"{index:06d} A Track Title (Extended Mix).flac"
    )


def build(workspace: Path, total: int, worst_case: bool) -> Dict[str, Any]:
    """A library of ``total`` present tracks and a store holding each one's waveform."""
    db = DatabaseService(db_path=workspace / "cuepoint.db")
    MigrationRunner(db).migrate()
    tracks = TrackRepository(db)
    started = time.perf_counter()
    for start in range(0, total, 5_000):
        tracks.add_many(
            LibraryTrack(
                rekordbox_track_id=f"bench-{index}",
                title=f"Track {index}",
                artist="Artist",
                file_path=_path(index),
            )
            for index in range(start, min(total, start + 5_000))
        )
    ids = [
        int(row["id"])
        for row in db.connect().execute("SELECT id FROM tracks ORDER BY id")
    ]
    files = FileStatusRepository(db)
    with db.transaction():
        files.record(
            [
                TrackFileStatus(track_id, FILE_PRESENT, _path(n), _NOW, size_bytes=1)
                for n, track_id in enumerate(ids)
            ]
        )

    store = WaveformStore(default_waveform_store_path(db.db_path))
    generator = random.Random(_SEED)
    make = random_waveform if worst_case else synthetic_waveform
    blob_bytes = 0
    connection = store.connect()
    for start in range(0, total, 5_000):
        connection.execute("BEGIN")
        for index in range(start, min(total, start + 5_000)):
            waveform = make(generator)
            blob = encode(waveform)
            blob_bytes += len(blob)
            store.put(
                StoredWaveform(
                    path=_path(index),
                    size_bytes=10_000_000 + index,
                    mtime_ns=1_700_000_000_000_000_000 + index,
                    analysis_version=ANALYSIS_VERSION,
                    state=STORED_READY,
                    analysed_at=_NOW,
                    duration_ms=waveform.duration_ms,
                    data=blob,
                )
            )
        connection.execute("COMMIT")
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    built_seconds = time.perf_counter() - started
    store.close_all()
    size = store.path.stat().st_size
    return {
        "db": db,
        "store": WaveformStore(store.path),
        "ids": ids,
        "store_mb": size / 1_000_000,
        "mean_blob_bytes": blob_bytes / max(1, total),
        "build_seconds": built_seconds,
    }


def _timed(call: Callable[[], Any], repeats: int) -> Dict[str, float]:
    call()  # warm-up: opens connections and the page cache
    samples = []
    for _ in range(repeats):
        started = time.perf_counter()
        call()
        samples.append((time.perf_counter() - started) * 1000)
    samples.sort()
    return {
        "median_ms": statistics.median(samples),
        "p95_ms": samples[min(len(samples) - 1, math.ceil(0.95 * len(samples)) - 1)],
        "max_ms": samples[-1],
    }


def measure(built: Dict[str, Any], repeats: int) -> Dict[str, Any]:
    ids: List[int] = built["ids"]
    files = FileStatusRepository(built["db"])
    service = WaveformService(files, built["store"], decoder=lambda: Path("mpv"))
    generator = random.Random(_SEED + 1)

    def batch() -> List[int]:
        start = generator.randrange(0, max(1, len(ids) - BATCH))
        return ids[start : start + BATCH]

    def states() -> None:
        answered = service.states(batch())
        assert all(state.state == "ready" for state in answered)

    def pictures() -> None:
        answered = service.waveforms(batch(), LIBRARY_WIDTH)
        assert all(
            a.data is not None and len(a.data) == LIBRARY_WIDTH * 4 for a in answered
        )

    def one() -> None:
        answer = service.waveform(generator.choice(ids), COLUMNS)
        assert answer is not None and answer.data is not None

    return {
        "states_200": _timed(states, repeats),
        "pictures_200_at_120": _timed(pictures, repeats),
        "one_at_1200": _timed(one, repeats),
    }


def run(workspace: Path, total: int, worst_case: bool, repeats: int) -> Dict[str, Any]:
    built = build(workspace, total, worst_case)
    try:
        timings = measure(built, repeats)
    finally:
        built["store"].close_all()
        built["db"].close_all()
    return {
        "platform": f"{platform.system()} {platform.machine()}",
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
        "tracks": total,
        "worst_case": worst_case,
        "store_mb": round(built["store_mb"], 1),
        "mean_blob_bytes": round(built["mean_blob_bytes"]),
        "build_seconds": round(built["build_seconds"], 1),
        **{
            name: {key: round(value, 2) for key, value in timing.items()}
            for name, timing in timings.items()
        },
    }


def over_budget(result: Dict[str, Any]) -> List[str]:
    """What missed its budget, in words; empty when everything held.

    The size budget is for real libraries, so a worst-case run reports its size
    but is not failed by it.
    """
    missed = []
    if not result["worst_case"] and result["store_mb"] > SIZE_BUDGET_MB:
        missed.append(f"store {result['store_mb']} MB > {SIZE_BUDGET_MB} MB")
    for name, budget in (
        ("states_200", BATCH_BUDGET_MS),
        ("pictures_200_at_120", BATCH_BUDGET_MS),
        ("one_at_1200", ONE_BUDGET_MS),
    ):
        if result[name]["p95_ms"] > budget:
            missed.append(f"{name} p95 {result[name]['p95_ms']} ms > {budget} ms")
    return missed


def report(result: Dict[str, Any]) -> None:
    print(
        f"{result['tracks']:,} waveforms on {result['platform']}, SQLite"
        f" {result['sqlite']}{' (worst case)' if result['worst_case'] else ''}"
    )
    print(
        f"  store: {result['store_mb']} MB (budget {SIZE_BUDGET_MB:.0f}),"
        f" mean blob {result['mean_blob_bytes']} bytes, built in"
        f" {result['build_seconds']} s"
    )
    for name, budget in (
        ("states_200", BATCH_BUDGET_MS),
        ("pictures_200_at_120", BATCH_BUDGET_MS),
        ("one_at_1200", ONE_BUDGET_MS),
    ):
        timing = result[name]
        print(
            f"  {name}: median {timing['median_ms']} ms, p95 {timing['p95_ms']} ms,"
            f" max {timing['max_ms']} ms (budget {budget:.0f})"
        )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--repeats", type=int, default=REPEATS)
    parser.add_argument(
        "--worst-case", action="store_true", help="Store incompressible waveforms"
    )
    parser.add_argument("--json", type=Path, help="Also write the result here")
    args = parser.parse_args(argv)
    if args.tracks < BATCH:
        parser.error(f"--tracks must be at least {BATCH}")

    with tempfile.TemporaryDirectory(prefix="cuepoint-bench-waveforms-") as folder:
        result = run(Path(folder), args.tracks, args.worst_case, args.repeats)
    report(result)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    missed = over_budget(result)
    for line in missed:
        print(f"OVER BUDGET: {line}")
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main())
