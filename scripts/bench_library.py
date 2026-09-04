#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure the library at the size it was designed for (LIBRARY-12).

Phase 3 was built against 50,000 tracks: the parser streams and clears elements
rather than building a tree, the upsert resolves identity against one snapshot
rather than a query per track, and the diff reads the collection once. Every one
of those choices costs something in clarity, and the only honest way to keep
them is to run the number.

What it measures, in order, against a generated export:

1. **Import** — the whole thing, from an empty database.
2. **Re-import** — the same file again. Must change nothing (every track updated,
   none inserted) and must not duplicate.
3. **Unchanged diff** — a refresh preview against the file it was imported from.
   This is the common case, and the one that must not feel like a fresh import.
4. **Edited diff** — a preview against a file with tracks added, changed and
   removed.
5. **Apply** — the refresh, including the deletions.

Memory is reported as `tracemalloc`'s peak, which is the number the streaming
design exists to hold down: it says how much Python allocated at once, so a
parser that quietly built the whole collection in memory would show up here even
on a machine with room to spare. RSS is reported too when ``psutil`` is
installed, because peak allocation is not the same as what the OS sees.

Nothing here touches ``~/.cuepoint``: the database is a temporary file and the
services are constructed with an explicit path, so no config is ever read.

Usage::

    python scripts/bench_library.py                     # 50,000 tracks
    python scripts/bench_library.py --tracks 5000        # a quicker pass
    python scripts/bench_library.py --json report.json   # machine-readable
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
import tracemalloc
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cuepoint.persistence.library_source_repository import (  # noqa: E402
    LibrarySourceRepository,
)
from cuepoint.persistence.playlist_repository import PlaylistRepository  # noqa: E402
from cuepoint.persistence.track_repository import TrackRepository  # noqa: E402
from cuepoint.services.database_service import DatabaseService  # noqa: E402
from cuepoint.services.library_import_service import (  # noqa: E402
    LibraryImportService,
)
from cuepoint.services.library_service import LibraryService  # noqa: E402
from cuepoint.services.migration_runner import MigrationRunner  # noqa: E402

#: Default size. The number Phase 3 was designed against, so the default is the
#: claim rather than something convenient.
DEFAULT_TRACKS = 50_000

#: Playlists to mirror, and how many tracks each holds. A real 3,880-track
#: export had 206 playlists and 13,870 entries — roughly 3.5 entries per track —
#: so these keep the mirror proportionate rather than trivial.
DEFAULT_PLAYLISTS = 250
ENTRIES_PER_PLAYLIST = 700

TRACK_ATTRS = (
    'Genre="House" Album="Album {i}" Label="Label {j}" Tonality="8A" '
    'AverageBpm="{bpm}.00" Year="2024" TotalTime="{total}" BitRate="320" '
    'Rating="{rating}" PlayCount="{plays}" DateAdded="2024-01-01" '
    'Comments="generated"'
)


def _mb(value: int) -> float:
    return round(value / (1024 * 1024), 1)


def rss_mb() -> Optional[float]:
    """Resident set size, if ``psutil`` is here to say."""
    try:
        import psutil
    except ImportError:
        return None
    return round(psutil.Process().memory_info().rss / (1024 * 1024), 1)


@dataclass
class Phase:
    """One measured step."""

    name: str
    seconds: float
    peak_mb: float
    rss_mb: Optional[float] = None
    detail: Dict[str, Any] = field(default_factory=dict)

    @property
    def per_1k(self) -> float:
        """Seconds per thousand tracks, for comparing sizes."""
        total = self.detail.get("tracks")
        if not total:
            return 0.0
        return round(self.seconds / (total / 1000), 3)


class Measured:
    """Time and peak-allocation around a block."""

    def __init__(self, name: str, phases: List[Phase]) -> None:
        self.name = name
        self.phases = phases
        self.detail: Dict[str, Any] = {}

    def __enter__(self) -> "Measured":
        tracemalloc.start()
        self._started = time.perf_counter()
        return self

    def __exit__(self, *exc: Any) -> None:
        seconds = time.perf_counter() - self._started
        _current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        self.phases.append(
            Phase(
                name=self.name,
                seconds=round(seconds, 2),
                peak_mb=_mb(peak),
                rss_mb=rss_mb(),
                detail=self.detail,
            )
        )


def write_export(
    path: Path,
    track_ids: List[int],
    playlists: int = DEFAULT_PLAYLISTS,
    title: str = "Track",
) -> Path:
    """Stream a Rekordbox-shaped export to disk.

    Written a line at a time rather than joined in memory: a 50,000-track export
    is ~20 MB of XML, and building it as one string would make the generator the
    most memory-hungry thing in this script.
    """
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        handle.write('<DJ_PLAYLISTS Version="1.0.0">\n')
        handle.write(f'  <COLLECTION Entries="{len(track_ids)}">\n')
        for i in track_ids:
            attrs = TRACK_ATTRS.format(
                i=i % 500,
                j=i % 120,
                bpm=118 + (i % 22),
                total=180 + (i % 300),
                rating=(i % 6) * 51,
                plays=i % 40,
            )
            handle.write(
                f'    <TRACK TrackID="{i}" Name="{title} {i}" '
                f'Artist="Artist {i % 900}" {attrs} '
                f'Location="file://localhost/music/{i // 1000}/{i}.mp3"/>\n'
            )
        handle.write("  </COLLECTION>\n")

        handle.write('  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="1">\n')
        handle.write(f'    <NODE Name="Sets" Type="0" Count="{playlists}">\n')
        for p in range(playlists):
            members = [
                track_ids[(p * 37 + k) % len(track_ids)]
                for k in range(min(ENTRIES_PER_PLAYLIST, len(track_ids)))
            ]
            handle.write(
                f'      <NODE Name="set {p:04d}" Type="1" Entries="{len(members)}">\n'
            )
            for member in members:
                handle.write(f'        <TRACK Key="{member}"/>\n')
            handle.write("      </NODE>\n")
        handle.write("    </NODE>\n")
        handle.write("  </NODE></PLAYLISTS>\n")
        handle.write("</DJ_PLAYLISTS>\n")
    return path


def build_service(db_path: Path) -> LibraryImportService:
    """Wire the real services against a scratch database."""
    database = DatabaseService(db_path=db_path)
    MigrationRunner(database).migrate()
    tracks = TrackRepository(database)
    return LibraryImportService(
        tracks,
        PlaylistRepository(database),
        LibrarySourceRepository(database),
        database,
        library_service=LibraryService(track_repository=tracks),
    )


def run(tracks: int, playlists: int, workspace: Path) -> Dict[str, Any]:
    """Run every phase and return the report."""
    phases: List[Phase] = []
    ids = list(range(1, tracks + 1))

    base = workspace / "collection.xml"
    with Measured("generate", phases) as m:
        write_export(base, ids, playlists)
        m.detail = {"tracks": tracks, "bytes": base.stat().st_size}

    service = build_service(workspace / "library.db")

    with Measured("import", phases) as m:
        summary = service.import_rekordbox_xml(str(base))
        m.detail = {
            "tracks": summary.track_count,
            "inserted": summary.tracks_inserted,
            "playlists": summary.playlists.playlists,
            "entries": summary.playlists.entries,
        }

    with Measured("re-import (idempotent)", phases) as m:
        again = service.import_rekordbox_xml(str(base))
        m.detail = {
            "tracks": again.track_count,
            "inserted": again.tracks_inserted,
            "updated": again.tracks_updated,
        }

    with Measured("diff, nothing changed", phases) as m:
        unchanged = service.compute_refresh_diff(str(base))
        m.detail = {
            "tracks": tracks,
            "is_empty": unchanged.is_empty,
            "read_the_file": unchanged.contents_compared,
        }

    # The same question with the shortcut refused, so the report says what a
    # full comparison of an unchanged collection actually costs rather than
    # only what the shortcut saves.
    with Measured("diff, nothing changed (forced)", phases) as m:
        forced = service.compute_refresh_diff(str(base), force=True)
        m.detail = {
            "tracks": tracks,
            "is_empty": forced.is_empty,
            "read_the_file": forced.contents_compared,
        }

    # An edit a real user would make: some gone, some renamed, some new.
    edited = workspace / "collection-edited.xml"
    removed = max(1, tracks // 100)
    added = max(1, tracks // 200)
    kept = ids[removed:]
    fresh = list(range(10_000_000, 10_000_000 + added))
    with Measured("generate edited", phases) as m:
        write_export(edited, kept + fresh, playlists)
        m.detail = {"tracks": len(kept) + added, "bytes": edited.stat().st_size}

    with Measured("diff, edited", phases) as m:
        diff = service.compute_refresh_diff(str(edited))
        m.detail = {
            "tracks": tracks,
            "added": diff.added.count,
            "changed": diff.changed.count,
            "removed": diff.removed.count,
        }

    with Measured("apply refresh", phases) as m:
        applied = service.apply_refresh(diff)
        m.detail = {
            "tracks": applied.track_count,
            "inserted": applied.tracks_inserted,
            "deleted": applied.tracks_deleted,
        }

    problems = []
    if phases[2].detail["inserted"] != 0:
        problems.append("re-importing the same file inserted rows")
    if phases[2].detail["tracks"] != tracks:
        problems.append("re-importing the same file changed the track count")
    by_name = {p.name: p for p in phases}
    if not by_name["diff, nothing changed"].detail["is_empty"]:
        problems.append("an unchanged file produced a non-empty diff")
    if by_name["diff, nothing changed"].detail["read_the_file"]:
        problems.append("an unchanged file was read rather than short-circuited")
    if not by_name["diff, nothing changed (forced)"].detail["read_the_file"]:
        problems.append("force did not read the file")
    if not by_name["diff, nothing changed (forced)"].detail["is_empty"]:
        problems.append("reading an unchanged file in full found a difference")
    edited_diff = by_name["diff, edited"].detail
    if edited_diff["removed"] != removed or edited_diff["added"] != added:
        problems.append("the diff did not match the edit that was made")
    if by_name["apply refresh"].detail["deleted"] != removed:
        problems.append("the apply did not delete what the preview promised")

    # Closed first, and the journal counted: an open SQLite connection can be
    # holding most of the database in a -wal file that stat() would not see, and
    # a size read before the checkpoint reports almost nothing.
    service._db.close_all()
    db_bytes = sum(
        candidate.stat().st_size
        for candidate in workspace.glob("library.db*")
        if candidate.is_file()
    )
    return {
        "tracks": tracks,
        "playlists": playlists,
        "database_mb": _mb(db_bytes),
        "phases": [asdict(p) for p in phases],
        "problems": problems,
    }


def report(result: Dict[str, Any]) -> None:
    """Print the table that goes in the docs."""
    print(
        f"\n{result['tracks']:,} tracks, {result['playlists']} playlists — "
        f"database {result['database_mb']} MB\n"
    )
    print(f"{'phase':<24}{'seconds':>9}{'s / 1k':>9}{'peak MB':>10}{'RSS MB':>9}")
    print("-" * 61)
    for phase in result["phases"]:
        per_1k = ""
        if phase["detail"].get("tracks"):
            per_1k = f"{phase['seconds'] / (phase['detail']['tracks'] / 1000):.3f}"
        rss = "" if phase["rss_mb"] is None else f"{phase['rss_mb']:.1f}"
        print(
            f"{phase['name']:<24}{phase['seconds']:>9.2f}{per_1k:>9}"
            f"{phase['peak_mb']:>10.1f}{rss:>9}"
        )
    print()
    for phase in result["phases"]:
        if phase["detail"]:
            print(f"  {phase['name']}: {phase['detail']}")
    if result["problems"]:
        print("\nPROBLEMS:")
        for problem in result["problems"]:
            print(f"  - {problem}")
    else:
        print("\nEvery phase produced the result it promised.")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--playlists", type=int, default=DEFAULT_PLAYLISTS)
    parser.add_argument("--json", type=Path, default=None, help="write the report")
    parser.add_argument(
        "--keep", action="store_true", help="leave the generated files in place"
    )
    args = parser.parse_args(argv)
    # The report has an em dash in it and Windows consoles default to cp1252.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    workspace = Path(tempfile.mkdtemp(prefix="cuepoint-bench-"))
    print(f"workspace: {workspace}")
    try:
        result = run(args.tracks, args.playlists, workspace)
        report(result)
        if args.json:
            args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
            print(f"\nwrote {args.json}")
        return 1 if result["problems"] else 0
    finally:
        if args.keep:
            print(f"kept {workspace}")
        else:
            shutil.rmtree(workspace, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
