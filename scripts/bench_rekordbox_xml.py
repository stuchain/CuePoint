#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure reading and writing a very large Rekordbox export (PYTHON-1H).

A user imported a 2.6 GB collection. The readers stream, but the import held
every track's cue points and beat grid until the track pass ended (7.5 GB for
that file), and the export held the source, the output and a copy of it (about
three times the file). This measures what is left, on a file of the size you
choose:

- ``count``: the track count from the first element (a few kilobytes of parse);
- ``import``: into an empty library, marks included;
- ``refresh``: the refresh preview, forced to read the whole file, against the
  library the import left;
- ``export-preview`` and ``export-write``: the plan alone, and the plan plus the
  written file, with a few thousand tracks and one playlist to patch.

Each runs **in its own process**, so a peak is that operation's and not the
largest of the ones before it. Time is wall time; peak RAM is the process's
peak resident size.

Three shapes, the same tracks, differing in the beat grid, which is what makes
a file large:

- ``plain``: one ``TEMPO`` and eight cue points a track;
- ``grid``: 120 ``TEMPO`` markers a track;
- ``dyn``: 750 ``TEMPO`` markers a track, a beat-by-beat dynamic grid. The likely
  shape of a real 2.6 GB export (about 50,000 tracks).

Usage::

    python scripts/bench_rekordbox_xml.py --shape dyn --size-mb 2600
    python scripts/bench_rekordbox_xml.py --xml collection.xml --ops count import
    python scripts/bench_rekordbox_xml.py --shape plain --size-mb 200 --json out.json

It runs by hand, on the Mac and the Windows PC, and not in CI: the files are
gigabytes. Needs about three times the file in free disk (the file, the library
the import writes, and the exported copy). Nothing touches ``~/.cuepoint``.

Exit status 1 when an operation failed.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

OPERATIONS = ("count", "import", "refresh", "export-preview", "export-write")

#: ``TEMPO`` markers per track, by shape.
TEMPOS_PER_TRACK = {"plain": 1, "grid": 120, "dyn": 750}

#: Tracks the export bench patches (every Nth), and the playlist it appends.
EXPORT_EVERY = 25
EXPORT_PLAYLIST_TRACKS = 2000

DATABASE_NAME = "cuepoint.db"


# ----------------------------------------------------------------- generating


def _track(index: int, tempos: int) -> str:
    text = (
        f'    <TRACK TrackID="{index}" Name="Track number {index} (Original Mix)"'
        f' Artist="Some Artist {index % 5000}" Composer="" Album="Album {index % 3000}"'
        f' Grouping="" Genre="Tech House" Kind="MP3 File" Size="{9000000 + index}"'
        f' TotalTime="{300 + index % 200}" DiscNumber="0" TrackNumber="{index % 12}"'
        f' Year="2021" AverageBpm="{124 + index % 8}.00"'
        f' DateAdded="2023-01-0{1 + index % 9}" BitRate="320" SampleRate="44100"'
        f' Comments="Purchased at Beatport" PlayCount="{index % 40}" Rating="0"'
        f' Location="file://localhost/Users/dj/Music/Collection/'
        f'Some%20Artist%20{index % 5000}/Track%20{index}.mp3"'
        f' Remixer="" Tonality="{index % 12 + 1}A" Label="Label {index % 800}"'
        ' Mix="Original Mix">\n'
    )
    for k in range(tempos):
        text += (
            f'      <TEMPO Inizio="{0.025 + k * 0.4688:.3f}"'
            f' Bpm="{124 + index % 8 + (k % 3) * 0.01:.2f}" Metro="4/4"'
            f' Battito="{1 + k % 4}"/>\n'
        )
    for number in range(8):
        text += (
            f'      <POSITION_MARK Name="" Type="0" Start="{number * 15.0 + 0.025:.3f}"'
            f' Num="{number}" Red="40" Green="226" Blue="20"/>\n'
        )
    return text + "    </TRACK>\n"


def generate(path: Path, shape: str, size_mb: float) -> int:
    """Write a collection of about ``size_mb`` megabytes; return its track count."""
    tempos = TEMPOS_PER_TRACK[shape]
    target = int(size_mb * 1024 * 1024)
    count = max(1, target // len(_track(1, tempos).encode("utf-8")))
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(
            '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n'
            '  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>\n'
            f'  <COLLECTION Entries="{count}">\n'
        )
        for index in range(1, count + 1):
            handle.write(_track(index, tempos))
        handle.write(
            '  </COLLECTION>\n  <PLAYLISTS>\n    <NODE Type="0" Name="ROOT" Count="20">\n'
        )
        size = min(count, 2000)
        for number in range(20):
            handle.write(
                f'      <NODE Name="Playlist {number}" Type="1" KeyType="0"'
                f' Entries="{size}">\n'
            )
            for j in range(size):
                handle.write(
                    f'        <TRACK Key="{1 + (number * 997 + j * 31) % count}"/>\n'
                )
            handle.write("      </NODE>\n")
        handle.write("    </NODE>\n  </PLAYLISTS>\n</DJ_PLAYLISTS>\n")
    return count


# ------------------------------------------------------------------ measuring


def peak_rss_mb() -> Optional[int]:
    """This process's peak resident size in megabytes, or None where unknown."""
    try:
        import resource

        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # Bytes on macOS, kilobytes on Linux.
        return int(peak // (1024 * 1024) if sys.platform == "darwin" else peak // 1024)
    except ImportError:
        pass
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        class Counters(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        counters = Counters()
        counters.cb = ctypes.sizeof(Counters)
        process = ctypes.windll.kernel32.GetCurrentProcess()  # type: ignore[attr-defined]
        if ctypes.windll.psapi.GetProcessMemoryInfo(  # type: ignore[attr-defined]
            process, ctypes.byref(counters), counters.cb
        ):
            return int(counters.PeakWorkingSetSize // (1024 * 1024))
    return None


def _services(work: Path) -> Any:
    from cuepoint.persistence.library_source_repository import LibrarySourceRepository
    from cuepoint.persistence.playlist_repository import PlaylistRepository
    from cuepoint.persistence.track_marks_repository import TrackMarksRepository
    from cuepoint.persistence.track_repository import TrackRepository
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.library_import_service import LibraryImportService
    from cuepoint.services.migration_runner import MigrationRunner

    database = DatabaseService(db_path=work / DATABASE_NAME)
    MigrationRunner(database).migrate()
    return LibraryImportService(
        TrackRepository(database),
        PlaylistRepository(database),
        LibrarySourceRepository(database),
        database,
        marks_repository=TrackMarksRepository(database),
    )


def _export_inputs(tracks: int) -> Any:
    from cuepoint.data.rekordbox_export import ExportPlaylist, TrackExportValues

    updates = {
        str(index): TrackExportValues(key="Cm", genre="Techno")
        for index in range(1, tracks + 1, EXPORT_EVERY)
    }
    playlist = ExportPlaylist(
        "Bench",
        tuple(str(i) for i in range(1, min(tracks, EXPORT_PLAYLIST_TRACKS) + 1)),
    )
    return updates, [playlist]


def work(operation: str, xml: Path, work_dir: Path) -> Dict[str, Any]:
    """Run one operation in this process and describe it."""
    extra: Dict[str, Any] = {}
    started = time.perf_counter()
    if operation == "count":
        from cuepoint.data.rekordbox import collection_entry_count

        extra["declared"] = collection_entry_count(str(xml))
    elif operation == "import":
        summary = _services(work_dir).import_rekordbox_xml(str(xml))
        extra["tracks"] = summary.tracks_inserted
        extra["cues"] = summary.marks.cues
        extra["markers"] = summary.marks.markers
        extra["database_mb"] = round((work_dir / DATABASE_NAME).stat().st_size / 2**20)
    elif operation == "refresh":
        diff = _services(work_dir).compute_refresh_diff(str(xml), force=True)
        extra["marks_changed"] = diff.marks_changed
    elif operation in ("export-preview", "export-write"):
        from cuepoint.data.rekordbox_export import (
            patch_collection_xml,
            plan_collection_xml,
        )
        from cuepoint.data.rekordbox import collection_entry_count

        tracks = collection_entry_count(str(xml)) or 0
        updates, playlists = _export_inputs(tracks)
        started = time.perf_counter()
        if operation == "export-preview":
            result = plan_collection_xml(str(xml), updates, playlists)
        else:
            destination = work_dir / "export.xml"
            result = patch_collection_xml(
                str(xml), updates, str(destination), playlists
            )
            extra["written_mb"] = round(destination.stat().st_size / 2**20)
            destination.unlink()
        extra["tracks_changed"] = result.tracks_changed
    else:
        raise SystemExit(f"unknown operation {operation!r}")
    return {
        "operation": operation,
        "seconds": round(time.perf_counter() - started, 1),
        "peak_ram_mb": peak_rss_mb(),
        **extra,
    }


def run_in_own_process(operation: str, xml: Path, work_dir: Path) -> Dict[str, Any]:
    """Run ``operation`` in a fresh interpreter and read back its JSON line."""
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--worker",
        operation,
        "--xml",
        str(xml),
        "--work-dir",
        str(work_dir),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        tail = (completed.stderr or completed.stdout).strip().splitlines()[-3:]
        return {"operation": operation, "failed": True, "error": " | ".join(tail)}
    return dict(json.loads(completed.stdout.strip().splitlines()[-1]))


# ----------------------------------------------------------------------- main


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--shape", choices=sorted(TEMPOS_PER_TRACK), default="dyn")
    parser.add_argument("--size-mb", type=float, default=200.0, help="size to generate")
    parser.add_argument(
        "--xml", type=Path, help="measure this file instead of generating one"
    )
    parser.add_argument(
        "--ops", nargs="+", choices=OPERATIONS, default=list(OPERATIONS)
    )
    parser.add_argument("--work-dir", type=Path, help="where the library and files go")
    parser.add_argument("--json", type=Path, help="also write the results here")
    parser.add_argument(
        "--keep", action="store_true", help="keep the generated file and library"
    )
    parser.add_argument("--worker", choices=OPERATIONS, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    if args.worker:
        print(json.dumps(work(args.worker, args.xml, args.work_dir)), flush=True)
        return 0

    base = Path(tempfile.mkdtemp(prefix="cuepoint-bench-xml-", dir=args.work_dir))
    try:
        xml = args.xml
        if xml is None:
            xml = base / f"{args.shape}-{int(args.size_mb)}.xml"
            started = time.perf_counter()
            tracks = generate(xml, args.shape, args.size_mb)
            print(
                f"generated {xml.stat().st_size / 2**20:.0f} MB, {tracks:,} tracks"
                f" in {time.perf_counter() - started:.0f} s",
                file=sys.stderr,
            )
        rows = []
        for operation in args.ops:
            row = run_in_own_process(operation, xml, base)
            row["file"] = xml.name
            row["file_mb"] = round(xml.stat().st_size / 2**20)
            print(json.dumps(row), flush=True)
            rows.append(row)
        if args.json:
            args.json.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
        return 1 if any(row.get("failed") for row in rows) else 0
    finally:
        if not args.keep:
            shutil.rmtree(base, ignore_errors=True)
        else:
            print(f"kept {base}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
