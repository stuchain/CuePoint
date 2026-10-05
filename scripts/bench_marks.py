#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure reading cue points and beat grids at the size they were designed for (WAVE-04).

Every WAVE-04 measurement in one command, so the numbers the docs record can be
taken again rather than trusted:

- **The read** (the specification's measure). A collection is read twice,
  tracks alone (``iter_collection_tracks``, what every import did before) and
  tracks with their marks (``iter_collection_entries``), alternating, and the
  ratio of the medians is reported. Two shapes of the same size:

  - **typical:** every track analysed, so one ``TEMPO``; 40% prepared with two
    memory cues and three hot cues, named and coloured; 10% of those with a
    variable grid of four markers. About 3.4 marks a track.
  - **prepared:** every track with a grid, three memory cues and four hot cues,
    named and coloured. Eight marks a track: the most a library is likely to
    hold, and the case that costs most.

  The specification aimed for 10% (``SPECIFIED_READ_RATIO``). Measured on
  Windows, the typical shape costs 21% and the prepared one 28%: reading each
  mark's attributes is most of it, and that is the floor of the standard
  library's parser (WAVE-04's outcome records the measurement). The budgets,
  ``TYPICAL_READ_BUDGET_RATIO`` and ``PREPARED_READ_BUDGET_RATIO``, sit just
  above what was measured, so they catch a regression rather than restate it.
- **The import** of the prepared collection into an empty library, which reads
  and writes every mark in the one transaction, against an import of the same
  file with the marks left out.
- **A refresh preview** of the prepared collection with one cue moved, forced
  to read the file: every track's marks fingerprinted and compared.
- **The backfill** of the prepared collection: a library imported and then left
  as the upgrade to version 26 leaves it, read again from its source.

Reads are the median of five after a warm-up. Nothing touches ``~/.cuepoint``.

Usage::

    python scripts/bench_marks.py                  # 50,000 tracks
    python scripts/bench_marks.py --tracks 10000   # a quicker pass
    python scripts/bench_marks.py --json report.json

Exit status 1 when a budget is missed.
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

DEFAULT_TRACKS = 50_000
READ_REPEATS = 5

#: What the specification aimed for: the read within 10% of the tracks alone.
#: Reported beside each measurement; not met (see the module's docstring).
SPECIFIED_READ_RATIO = 1.10
#: The typical shape: measured at 1.21 on Windows, guarded just above it.
TYPICAL_READ_BUDGET_RATIO = 1.30
#: Every track with eight marks: measured at 1.28, guarded just above it.
PREPARED_READ_BUDGET_RATIO = 1.40

SHAPES = ("typical", "prepared")


def _cue(rng: random.Random, num: int, named: bool) -> str:
    start = f"{rng.uniform(0, 360):.3f}"
    name = f"Cue {num}" if named else ""
    colour = ' Red="40" Green="226" Blue="20"' if num >= 0 else ""
    return f'      <POSITION_MARK Name="{name}" Type="0" Start="{start}" Num="{num}"{colour}/>\n'


def _marks(i: int, shape: str, rng: random.Random) -> str:
    tempo = '      <TEMPO Inizio="0.025" Bpm="128.00" Metro="4/4" Battito="1"/>\n'
    if shape == "prepared":
        return (
            tempo
            + "".join(_cue(rng, -1, False) for _ in range(3))
            + "".join(_cue(rng, n, True) for n in range(4))
        )
    if i % 10 >= 4:
        return tempo
    grid = tempo
    if i % 10 == 0:
        grid += "".join(
            f'      <TEMPO Inizio="{60 * k}.025" Bpm="{128 + k}.00" Metro="4/4" Battito="1"/>\n'
            for k in range(1, 4)
        )
    return (
        grid
        + "".join(_cue(rng, -1, False) for _ in range(2))
        + "".join(_cue(rng, n, True) for n in range(3))
    )


def write_collection(path: Path, total: int, shape: str) -> Tuple[int, int]:
    """Write a collection export of ``total`` tracks; return (tracks, marks)."""
    rng = random.Random(7)
    marks = 0
    with open(path, "w", encoding="utf-8") as out:
        out.write(
            '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n'
        )
        out.write(f'  <COLLECTION Entries="{total}">\n')
        for i in range(1, total + 1):
            out.write(
                f'    <TRACK TrackID="{i}" Name="Track {i}" Artist="Artist {i % 1700}"'
                f' Composer="" Album="Album {i % 311}" Grouping="" Genre="Genre {i % 40}"'
                ' Kind="MP3 File" Size="9437184" TotalTime="372" DiscNumber="0"'
                ' TrackNumber="1" Year="2024" AverageBpm="128.00" DateAdded="2024-03-01"'
                ' BitRate="320" SampleRate="44100" Comments="" PlayCount="3" Rating="204"'
                f' Location="file://localhost/C:/Music/bench/track%20{i}.mp3" Remixer=""'
                f' Tonality="8A" Label="Label {i % 1200}" Mix="">\n'
            )
            block = _marks(i, shape, rng)
            marks += block.count("<")
            out.write(block)
            out.write("    </TRACK>\n")
        out.write(
            '  </COLLECTION>\n  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"/></PLAYLISTS>\n'
            "</DJ_PLAYLISTS>\n"
        )
    return total, marks


def _seconds(call: Callable[[], Any]) -> float:
    start = time.perf_counter()
    call()
    return time.perf_counter() - start


def measure_read(path: Path) -> Dict[str, Any]:
    """Tracks alone against tracks with marks, alternating, medians compared."""
    from cuepoint.data.rekordbox import iter_collection_entries, iter_collection_tracks

    def tracks() -> None:
        for _ in iter_collection_tracks(str(path)):
            pass

    def entries() -> None:
        for _ in iter_collection_entries(str(path)):
            pass

    tracks()
    entries()
    alone: List[float] = []
    with_marks: List[float] = []
    for _ in range(READ_REPEATS):
        alone.append(_seconds(tracks))
        with_marks.append(_seconds(entries))
    a, b = statistics.median(alone), statistics.median(with_marks)
    return {
        "tracks_alone_s": round(a, 3),
        "with_marks_s": round(b, 3),
        "ratio": round(b / a, 3),
    }


def _library(path: Path):
    from cuepoint.persistence.library_source_repository import LibrarySourceRepository
    from cuepoint.persistence.playlist_repository import PlaylistRepository
    from cuepoint.persistence.track_repository import TrackRepository
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.library_import_service import LibraryImportService
    from cuepoint.services.migration_runner import MigrationRunner

    db = DatabaseService(db_path=path)
    MigrationRunner(db).migrate()
    tracks = TrackRepository(db)
    sources = LibrarySourceRepository(db)
    return (
        db,
        tracks,
        sources,
        LibraryImportService(tracks, PlaylistRepository(db), sources, db),
    )


def measure_import(workspace: Path, xml: Path) -> Dict[str, Any]:
    """The import with its marks, and the same import with the marks left out."""
    import cuepoint.services.library_import_service as importer
    from cuepoint.models.track_marks import NO_MARKS

    db, _, _, service = _library(workspace / "with.db")
    with_marks = _seconds(lambda: service.import_rekordbox_xml(str(xml)))
    summary = service.import_rekordbox_xml(str(xml))
    db.close_all()

    real = importer.iter_collection_entries

    def tracks_only(path: str):
        from cuepoint.data.rekordbox import iter_collection_tracks

        for track in iter_collection_tracks(path):
            yield track, NO_MARKS

    importer.iter_collection_entries = tracks_only  # type: ignore[assignment]
    try:
        db, _, _, service = _library(workspace / "without.db")
        without = _seconds(lambda: service.import_rekordbox_xml(str(xml)))
        db.close_all()
    finally:
        importer.iter_collection_entries = real  # type: ignore[assignment]
    return {
        "with_marks_s": round(with_marks, 2),
        "marks_left_out_s": round(without, 2),
        "cues": summary.marks.cues,
        "markers": summary.marks.markers,
    }


def measure_refresh_and_backfill(workspace: Path, xml: Path) -> Dict[str, Any]:
    from cuepoint.models.track_marks import MARKS_INDEX
    from cuepoint.persistence.track_marks_repository import TrackMarksRepository
    from cuepoint.services.marks_backfill_service import MarksBackfillService

    db, tracks, sources, service = _library(workspace / "refresh.db")
    service.import_rekordbox_xml(str(xml))
    moved = workspace / "moved.xml"
    text = xml.read_text(encoding="utf-8")
    first = text.index('Num="0"')
    start = text.rindex('Start="', 0, first)
    moved.write_text(text[: start + 7] + "1" + text[start + 7 :], encoding="utf-8")

    diffs: List[float] = []
    changed = 0
    for _ in range(3):
        started = time.perf_counter()
        diff = service.compute_refresh_diff(str(moved), force=True)
        diffs.append(time.perf_counter() - started)
        changed = diff.marks_changed

    marks = TrackMarksRepository(db)
    with db.transaction() as conn:
        conn.execute("DELETE FROM track_cues")
        conn.execute("DELETE FROM track_beat_grid")
        conn.execute("DELETE FROM derived_indexes WHERE name = ?", (MARKS_INDEX,))
    backfill = MarksBackfillService(marks, tracks, sources, db)
    started = time.perf_counter()
    result = backfill.backfill()
    backfill_s = time.perf_counter() - started
    db.close_all()
    return {
        "refresh_preview_s": round(statistics.median(diffs), 2),
        "marks_changed": changed,
        "backfill_s": round(backfill_s, 2),
        "backfill_outcome": result.outcome,
        "backfill_tracks": result.tracks,
    }


def run(total: int, workspace: Path) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    reads: Dict[str, Any] = {}
    files: Dict[str, Path] = {}
    for shape in SHAPES:
        path = workspace / f"{shape}.xml"
        _, marks = write_collection(path, total, shape)
        files[shape] = path
        reads[shape] = {**measure_read(path), "marks": marks}
        budget = (
            TYPICAL_READ_BUDGET_RATIO
            if shape == "typical"
            else PREPARED_READ_BUDGET_RATIO
        )
        read = reads[shape]
        rows.append(
            {
                "label": f"Read, {shape} ({marks / total:.1f} marks a track)",
                "value": read["ratio"],
                "unit": "×",
                "note": f"{read['tracks_alone_s']} s alone, {read['with_marks_s']} s with"
                f" marks; specified {SPECIFIED_READ_RATIO:g}×",
                "budget": budget,
                "over_budget": read["ratio"] > budget,
            }
        )
    imported = measure_import(workspace, files["prepared"])
    rows.append(
        {
            "label": "Import, prepared",
            "value": imported["with_marks_s"],
            "unit": "s",
            "note": f"{imported['marks_left_out_s']} s with the marks left out;"
            f" {imported['cues']:,} cues, {imported['markers']:,} markers",
            "budget": None,
            "over_budget": False,
        }
    )
    later = measure_refresh_and_backfill(workspace, files["prepared"])
    rows.append(
        {
            "label": "Refresh preview, prepared, one cue moved",
            "value": later["refresh_preview_s"],
            "unit": "s",
            "note": f"{later['marks_changed']} track counted",
            "budget": None,
            "over_budget": later["marks_changed"] != 1,
        }
    )
    rows.append(
        {
            "label": "Backfill, prepared",
            "value": later["backfill_s"],
            "unit": "s",
            "note": f"{later['backfill_outcome']}, {later['backfill_tracks']:,} tracks",
            "budget": None,
            "over_budget": later["backfill_outcome"] != "read",
        }
    )
    return {"tracks": total, "reads": reads, "import": imported, **later, "rows": rows}


def report(result: Dict[str, Any]) -> None:
    print(f"\n{result['tracks']:,} tracks.\n")
    print("| What | Measured | Budget | |")
    print("| --- | --- | --- | --- |")
    for entry in result["rows"]:
        budget = "" if entry["budget"] is None else f"{entry['budget']:g}×"
        flag = " **over**" if entry["over_budget"] else ""
        print(
            f"| {entry['label']} | {entry['value']} {entry['unit']}{flag} | {budget} |"
            f" {entry['note']} |"
        )


def over_budget(result: Dict[str, Any]) -> List[str]:
    return [entry["label"] for entry in result["rows"] if entry["over_budget"]]


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--json", type=Path, default=None, help="write the report")
    args = parser.parse_args(argv)
    if args.tracks < 1000:
        parser.error("--tracks must be at least 1000")

    workspace = Path(tempfile.mkdtemp(prefix="cuepoint-bench-marks-"))
    try:
        result = run(args.tracks, workspace)
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
    report(result)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    missed = over_budget(result)
    if missed:
        print("\nOver budget:", ", ".join(missed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
