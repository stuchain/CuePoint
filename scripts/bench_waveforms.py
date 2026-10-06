#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure Phase 11 at a large library's size, twice (WAVE-07).

Every measurement the phase's acceptance asks for, in one command, so the
numbers the docs record can be taken again rather than trusted. Each is the
code the app runs, over a library and a waveform store built in a temporary
folder; nothing touches ``~/.cuepoint`` and nothing decodes audio.

- **The store's size** holding one waveform and its loudness for each of
  ``--tracks`` tracks, against 260 MB at 50,000 (WAVE-02's 250 for the
  waveforms, and 10 for WAVE-08's loudness table): 5.2 KB a track, so a
  smaller run is held to the same rate. The waveforms are ``bench_waveform_store``'s synthetic
  ones, which compress worse than music.
- **200 pictures at width 120** (the Library column's batch) and **200
  states**, against WAVE-02's 50 ms at p95.
- **One picture at 1,200 columns** (the player bar), against WAVE-02's 20 ms.
- **One picture at 1,200 with its marks** (the Inspector's read: the picture
  and the track's cues and grid, as the route reads them), against the same
  20 ms. Every track carries eight marks, the most a library is likely to.
- **The work list**: the analysis's refill of 200 files in its order, and its
  count, over a library whose every file is analysed. WAVE-03 recorded 285 ms
  and 264 ms at 50,000 without a budget; WAVE-07 sets one of 500 ms each.
  The status route counts at most every 5 seconds, so 500 ms is a tenth of
  its interval, and a refill comes once per 200 files analysed.
- **The marks read** from the XML, tracks with their marks against tracks
  alone, both of ``bench_marks``'s shapes, against WAVE-04's ratios (1.30×
  typical, 1.40× prepared).

The whole measurement runs ``--runs`` times (two by default), each over a
store and library built afresh, and every run is reported. Timings are the
median and p95 of ``--repeats`` runs after a warm-up.

Usage::

    python scripts/bench_waveforms.py                  # 50,000 tracks, twice
    python scripts/bench_waveforms.py --tracks 5000 --runs 1
    python scripts/bench_waveforms.py --json report.json

Exit status 1 when any run misses a budget.
"""

from __future__ import annotations

import argparse
import json
import platform
import random
import shutil
import sqlite3
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

_SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPTS.parent / "src"))
# The two benches this composes live beside it; neither is a package.
sys.path.insert(0, str(_SCRIPTS))

import bench_marks  # noqa: E402
import bench_waveform_store  # noqa: E402

from cuepoint.core.waveform import COLUMNS  # noqa: E402
from cuepoint.models.track_marks import CueValues, GridValues  # noqa: E402
from cuepoint.persistence.track_marks_repository import TrackMarksRepository  # noqa: E402
from cuepoint.persistence.waveform_work_repository import (  # noqa: E402
    WaveformWorkRepository,
)
from cuepoint.services.waveform_analysis_service import (  # noqa: E402
    REFILL,
    WaveformAnalysisService,
)
from cuepoint.services.waveform_service import WaveformService  # noqa: E402

DEFAULT_TRACKS = 50_000
DEFAULT_RUNS = 2
REPEATS = 30
#: Each work-list query reads the whole library; fewer repeats keep a run short.
WORK_REPEATS = 10

#: The store's budget at 50,000 tracks (WAVE-02's, and WAVE-08's table), as a rate.
SIZE_BUDGET_KB_PER_TRACK = bench_waveform_store.SIZE_BUDGET_MB * 1000 / 50_000
BATCH_BUDGET_MS = bench_waveform_store.BATCH_BUDGET_MS
ONE_BUDGET_MS = bench_waveform_store.ONE_BUDGET_MS
#: Set by WAVE-07; see the module's docstring.
WORK_LIST_BUDGET_MS = 500.0
TYPICAL_READ_BUDGET_RATIO = bench_marks.TYPICAL_READ_BUDGET_RATIO
PREPARED_READ_BUDGET_RATIO = bench_marks.PREPARED_READ_BUDGET_RATIO

_READ_AT = "2026-10-05T12:00:00+00:00"


def prepared_marks(index: int) -> tuple[List[CueValues], List[GridValues]]:
    """Eight marks: three memory cues, four coloured hot cues and a grid marker."""
    base = 30_000 + (index % 97) * 1_000
    cues: List[CueValues] = [
        ("cue", None, base + n * 45_000, None, None, None) for n in range(3)
    ]
    cues += [
        ("cue", n, base + 15_000 + n * 60_000, None, f"Cue {n}", "#28e214")
        for n in range(4)
    ]
    grid: List[GridValues] = [(25, 128.0, "4/4", 1)]
    return cues, grid


def _row(
    label: str,
    value: float,
    unit: str,
    budget: Optional[float],
    note: str,
    *,
    over: Optional[bool] = None,
) -> Dict[str, Any]:
    return {
        "label": label,
        "value": round(value, 2),
        "unit": unit,
        "budget": budget,
        "over_budget": bool(over)
        if over is not None
        else (budget is not None and value > budget),
        "note": note,
    }


def _timing_row(label: str, timing: Dict[str, float], budget: float) -> Dict[str, Any]:
    return _row(
        label,
        timing["p95_ms"],
        "ms p95",
        budget,
        f"median {timing['median_ms']:.2f} ms, max {timing['max_ms']:.2f} ms",
    )


def _write_marks(built: Dict[str, Any]) -> TrackMarksRepository:
    marks = TrackMarksRepository(built["db"])
    with built["db"].transaction():
        marks.replace_many(
            (track_id, *prepared_marks(n)) for n, track_id in enumerate(built["ids"])
        )
        marks.mark_read(_READ_AT)
    return marks


def _check_at_stored_sizes(built: Dict[str, Any]) -> None:
    """Record each file at the size its stored waveform was made from.

    ``bench_waveform_store`` records every file at one byte, since a picture is
    read whatever its size. The work list counts a stored row only at the size
    the last check found (WAVE-03), so here the check agrees with the store:
    the library a finished analysis leaves.
    """
    with built["db"].transaction() as conn:
        conn.executemany(
            "UPDATE track_files SET size_bytes = ? WHERE track_id = ?",
            [(10_000_000 + n, track_id) for n, track_id in enumerate(built["ids"])],
        )


def measure_store(
    workspace: Path, total: int, repeats: int, work_repeats: int
) -> List[Dict[str, Any]]:
    """The store, its reads and the work list, over one store built afresh."""
    built = bench_waveform_store.build(workspace, total, worst_case=False)
    try:
        marks = _write_marks(built)
        _check_at_stored_sizes(built)
        timings = bench_waveform_store.measure(built, repeats)
        files = bench_waveform_store.FileStatusRepository(built["db"])
        service = WaveformService(files, built["store"], decoder=lambda: Path("mpv"))
        ids: List[int] = built["ids"]
        generator = random.Random(bench_waveform_store._SEED + 2)

        def inspector() -> None:
            track_id = generator.choice(ids)
            answer = service.waveforms([track_id], COLUMNS)
            found = marks.get_many([track_id])
            assert answer and answer[0].data is not None
            assert len(found[track_id].cues) == 7 and len(found[track_id].grid) == 1

        with_marks = bench_waveform_store._timed(inspector, repeats)

        analysis = WaveformAnalysisService(
            WaveformWorkRepository(built["db"]), built["store"], service
        )

        def refill() -> None:
            plan = analysis.plan()
            assert plan.present == total and plan.analysed == total
            assert len(plan.verify) == min(REFILL, total)

        def count() -> None:
            plan = analysis.plan(limit=0, ordered=False)
            assert plan.analysed == total and plan.pending_total == 0

        refilled = bench_waveform_store._timed(refill, work_repeats)
        counted = bench_waveform_store._timed(count, work_repeats)
    finally:
        built["store"].close_all()
        built["db"].close_all()

    size_budget_mb = SIZE_BUDGET_KB_PER_TRACK * total / 1000
    return [
        _row(
            f"The store, {total:,} waveforms",
            built["store_mb"],
            "MB",
            size_budget_mb,
            f"mean picture {built['mean_blob_bytes']:,.0f} bytes; built in"
            f" {built['build_seconds']:.1f} s",
        ),
        _timing_row("200 states", timings["states_200"], BATCH_BUDGET_MS),
        _timing_row(
            "200 pictures at width 120", timings["pictures_200_at_120"], BATCH_BUDGET_MS
        ),
        _timing_row("One picture at 1,200", timings["one_at_1200"], ONE_BUDGET_MS),
        _timing_row("One picture at 1,200 with its marks", with_marks, ONE_BUDGET_MS),
        _timing_row(
            f"The work list, a refill of {REFILL}", refilled, WORK_LIST_BUDGET_MS
        ),
        _timing_row("The work list, a count", counted, WORK_LIST_BUDGET_MS),
    ]


def measure_reads(workspace: Path, total: int) -> List[Dict[str, Any]]:
    """The marks read from the XML, both shapes, against WAVE-04's ratios."""
    rows = []
    for shape in bench_marks.SHAPES:
        path = workspace / f"{shape}.xml"
        _, marks = bench_marks.write_collection(path, total, shape)
        read = bench_marks.measure_read(path)
        budget = (
            TYPICAL_READ_BUDGET_RATIO
            if shape == "typical"
            else PREPARED_READ_BUDGET_RATIO
        )
        rows.append(
            _row(
                f"The marks read, {shape} ({marks / total:.1f} marks a track)",
                read["ratio"],
                "×",
                budget,
                f"{read['with_marks_s']} s with marks, {read['tracks_alone_s']} s"
                " tracks alone",
            )
        )
    return rows


def run(
    total: int,
    workspace: Path,
    *,
    runs: int = DEFAULT_RUNS,
    repeats: int = REPEATS,
    work_repeats: int = WORK_REPEATS,
) -> Dict[str, Any]:
    """Every measurement, ``runs`` times, each in a folder of its own."""
    measured: List[Dict[str, Any]] = []
    for number in range(1, runs + 1):
        folder = workspace / f"run-{number}"
        folder.mkdir(parents=True)
        started = time.perf_counter()
        rows = measure_store(folder / "store", total, repeats, work_repeats)
        rows += measure_reads(folder, total)
        measured.append(
            {
                "run": number,
                "seconds": round(time.perf_counter() - started, 1),
                "rows": rows,
            }
        )
    return {
        "platform": f"{platform.system()} {platform.machine()}",
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
        "tracks": total,
        "runs": measured,
    }


def over_budget(result: Dict[str, Any]) -> List[str]:
    """Each missed budget as "run N: label"; empty when every run held."""
    return [
        f"run {run['run']}: {row['label']}"
        for run in result["runs"]
        for row in run["rows"]
        if row["over_budget"]
    ]


def _budget_text(row: Dict[str, Any]) -> str:
    if row["budget"] is None:
        return ""
    if row["unit"] == "×":
        return f"{row['budget']:g}×"
    unit = "MB" if row["unit"] == "MB" else "ms"
    return f"{row['budget']:g} {unit}"


def report(result: Dict[str, Any]) -> None:
    runs: Sequence[Dict[str, Any]] = result["runs"]
    print(
        f"\n{result['tracks']:,} tracks on {result['platform']}, Python"
        f" {result['python']}, SQLite {result['sqlite']}; {len(runs)} run(s).\n"
    )
    header = " | ".join(f"Run {run['run']}" for run in runs)
    print(f"| Measure | {header} | Budget |")
    print("| --- | " + " | ".join("---" for _ in runs) + " | --- |")
    for index, first in enumerate(runs[0]["rows"]):
        cells = []
        for run in runs:
            row = run["rows"][index]
            flag = " **over**" if row["over_budget"] else ""
            cells.append(f"{row['value']} {row['unit']}{flag}")
        print(f"| {first['label']} | {' | '.join(cells)} | {_budget_text(first)} |")
    for run in runs:
        print(f"\nRun {run['run']} ({run['seconds']} s):")
        for row in run["rows"]:
            print(f"  {row['label']}: {row['note']}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS)
    parser.add_argument("--repeats", type=int, default=REPEATS)
    parser.add_argument("--json", type=Path, help="Also write the result here")
    args = parser.parse_args(argv)
    # The report prints "×"; a Windows console's code page cannot always.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if args.tracks < 1000:
        parser.error("--tracks must be at least 1000")
    if args.runs < 1 or args.repeats < 1:
        parser.error("--runs and --repeats must be at least 1")

    workspace = Path(tempfile.mkdtemp(prefix="cuepoint-bench-phase11-"))
    try:
        result = run(args.tracks, workspace, runs=args.runs, repeats=args.repeats)
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
    report(result)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    missed = over_budget(result)
    for line in missed:
        print(f"OVER BUDGET: {line}")
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main())
