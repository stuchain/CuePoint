#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure Phase 10 at the size it was designed for (PREP-12).

Every Phase 10 measurement in one command, so the numbers the docs record can
be taken again rather than trusted:

- **The migration** (PREP-01). ``m0025_sets`` rebuilds the Collection tables
  that hold user data nothing can re-derive. A version-24 library with 50,000
  tracks, 500 nodes (folders, Collections, Smart Collections and frozen ones),
  100,000 entries with repeats and 400 export records is built, copied, and
  upgraded five times; the median is reported, and every copy is checked to
  have kept every row and to pass the foreign-key check. Budget: one second.
- **A Set at its limit** (PREP-02 to PREP-05, PREP-08). In DISCOVER-08's
  library shape (50,000 tracks: 70% at 120–130 BPM, 15% at 170–175, 15% over
  70–160; 24 keys, 40 genres, 1,200 labels, 1,700 artists, 30% of credits with
  two artists and 20% with a remixer), a 1,000-entry Set in ten chapters with
  targets and ranges, half its entries timed, every file checked and a hundred
  warnings accepted. Its plan, its running order as the route sends it (each
  entry beside the Library's row), and its checks with their wire object.
  Budget for the checks: ``ANALYSIS_BUDGET_SECONDS``.
- **Suggestions** (PREP-04, PREP-11). A gap between two entries in the densest
  tempo band with the whole library as the pool, as the service answers and as
  the route answers with each suggestion's row; the same with 200 suggestions;
  the end of the Set; and a gap nothing bridges. Budget for the dense gap:
  ``DENSE_GAP_BUDGET_SECONDS``.

Reads are the median of seven after a warm-up. Nothing touches ``~/.cuepoint``:
the databases and ``CUEPOINT_HOME`` are temporary, and nothing reaches the
network.

Usage::

    python scripts/bench_sets.py                  # 50,000 tracks
    python scripts/bench_sets.py --tracks 10000   # a quicker pass, scaled
    python scripts/bench_sets.py --json report.json

Exit status 1 when a budget is missed, so a release run can gate on it.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

DEFAULT_TRACKS = 50_000
NOW = "2026-09-29T12:00:00+00:00"

#: PREP-01's library around the rebuilt tables, scaled with the track count.
NODES_SHARE = 500 / 50_000
ENTRIES_SHARE = 100_000 / 50_000
EXPORTS_SHARE = 400 / 50_000

#: DISCOVER-08's recorded shape.
GENRES = 40
LABELS = 1_200
ARTISTS = 1_700

#: A Set at its limit (PREP-02), in ten chapters (PREP-03's measurement).
SET_ENTRIES = 1_000
CHAPTERS = 10
ACKNOWLEDGED = 100

MIGRATION_BUDGET_SECONDS = 1.0
READ_REPEATS = 7
MIGRATION_COPIES = 5


def median_ms(call: Callable[[], Any], runs: int = READ_REPEATS) -> float:
    call()
    times = []
    for _ in range(runs):
        start = time.perf_counter()
        call()
        times.append((time.perf_counter() - start) * 1000)
    return round(statistics.median(times), 1)


# ------------------------------------------------------------- the library


def bpm_of(i: int) -> float:
    """70% at 120–130, 15% at 170–175, 15% spread over 70–160, to two decimals."""
    band = i % 100
    if band < 70:
        return round(120 + (i * 7919 % 1000) / 100, 2)
    if band < 85:
        return round(170 + (i * 31 % 500) / 100, 2)
    return round(70 + (i * 17 % 9000) / 100, 2)


def key_of(i: int) -> str:
    return f"{(i * 5) % 12 + 1}{'A' if (i // 12) % 2 else 'B'}"


def artist_of(i: int) -> str:
    first = f"Artist {i * 13 % ARTISTS}"
    # 30% of credits name two artists.
    return f"{first} & Artist {i * 29 % ARTISTS}" if i % 10 < 3 else first


def remixer_of(i: int) -> Optional[str]:
    return f"Artist {i * 7 % ARTISTS}" if i % 5 == 0 else None


def library_track(i: int):
    from cuepoint.models.library_track import LibraryTrack

    return LibraryTrack(
        rekordbox_track_id=str(i),
        file_path=f"/music/{i:06d}.mp3",
        title=f"Track {i:06d}",
        artist=artist_of(i),
        remixer=remixer_of(i),
        label=f"Label {i * 3 % LABELS}",
        genre=f"Genre {i % GENRES}",
        bpm=bpm_of(i),
        key=key_of(i),
        duration_seconds=180 + i % 300,
    )


# ------------------------------------------------------------- the migration


def _discover(through: Optional[int] = None):
    from cuepoint.migrations import discover_migrations

    found = discover_migrations()
    return [m for m in found if through is None or m.version <= through]


def build_v24(path: Path, total: int) -> Dict[str, int]:
    """A version-24 library the way a user's would be filled, written by SQL.

    Written around today's repositories on purpose: they write today's schema,
    which a version-24 file does not have. The columns come from the file's own
    ``PRAGMA table_info``, as ``tests/fixtures/legacy_rows.py`` does.
    """
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.migration_runner import MigrationRunner

    service = DatabaseService(db_path=path)
    MigrationRunner(service, migrations=_discover(24)).migrate()
    conn = service.connect()
    columns = [
        row["name"]
        for row in conn.execute("PRAGMA table_info(tracks)")
        if row["name"] != "id"
    ]
    nodes = max(10, int(total * NODES_SHARE))
    entries = int(total * ENTRIES_SHARE)
    exports = max(1, int(total * EXPORTS_SHARE))
    with service.transaction() as tx:
        rows = []
        for i in range(1, total + 1):
            data = library_track(i).to_dict()
            rows.append(tuple(data.get(name) for name in columns))
        marks = ", ".join("?" for _ in columns)
        tx.executemany(
            f"INSERT INTO tracks ({', '.join(columns)}) VALUES ({marks})", rows
        )

        folders = nodes // 10
        smart = nodes // 10
        frozen = nodes // 10
        crates: List[int] = []
        folder_ids: List[int] = []
        for n in range(folders):
            folder_ids.append(
                int(
                    tx.execute(
                        "INSERT INTO collections (kind, name, position, depth,"
                        " created_at, updated_at) VALUES ('folder', ?, ?, 0, ?, ?)",
                        (f"Folder {n}", n, NOW, NOW),
                    ).lastrowid
                )
            )
        rules = '{"match": "all", "rules": [{"field": "bpm", "operator": "gte", "value": 120}]}'
        smart_ids: List[int] = []
        for n in range(smart):
            smart_ids.append(
                int(
                    tx.execute(
                        "INSERT INTO collections (kind, name, position, depth,"
                        " rules_json, sort_field, sort_dir, created_at, updated_at)"
                        " VALUES ('smart', ?, ?, 0, ?, 'bpm', 'desc', ?, ?)",
                        (f"Smart {n}", folders + n, rules, NOW, NOW),
                    ).lastrowid
                )
            )
        for n in range(frozen):
            crates.append(
                int(
                    tx.execute(
                        "INSERT INTO collections (kind, name, position, depth,"
                        " rules_json, frozen_from_id, frozen_at, created_at,"
                        " updated_at) VALUES ('collection', ?, ?, 0, ?, ?, ?, ?, ?)",
                        (
                            f"Frozen {n}",
                            folders + smart + n,
                            rules,
                            smart_ids[n % len(smart_ids)],
                            NOW,
                            NOW,
                            NOW,
                        ),
                    ).lastrowid
                )
            )
        for n in range(nodes - folders - smart - frozen):
            parent = folder_ids[n % len(folder_ids)]
            crates.append(
                int(
                    tx.execute(
                        "INSERT INTO collections (parent_id, kind, name, position,"
                        " depth, created_at, updated_at)"
                        " VALUES (?, 'collection', ?, ?, 1, ?, ?)",
                        (parent, f"Crate {n}", n, NOW, NOW),
                    ).lastrowid
                )
            )
        per = max(1, entries // len(crates))
        entry_rows = []
        for c, crate in enumerate(crates):
            for position in range(per):
                # Every tenth entry repeats the one before it (DEC-058).
                track = (
                    c * per + position - (1 if position % 10 == 9 else 0)
                ) % total + 1
                entry_rows.append((crate, track, position, NOW))
        tx.executemany(
            "INSERT INTO collection_tracks (collection_id, track_id, position,"
            " added_at) VALUES (?, ?, ?, ?)",
            entry_rows,
        )
        for n in range(exports):
            export = int(
                tx.execute(
                    "INSERT INTO rekordbox_exports (started_at, finished_at, outcome,"
                    " destination_path, source_path, track_count,"
                    " changed_track_count, fields_json, key_format)"
                    " VALUES (?, ?, 'written', '/out/a.xml', '/in/lib.xml', ?, 2,"
                    " '[\"bpm\"]', 'classic')",
                    (NOW, NOW, total),
                ).lastrowid
            )
            for kind, node, rule in (
                ("collection", crates[n % len(crates)], None),
                ("smart", smart_ids[n % len(smart_ids)], rules),
                ("collection", None, None),
            ):
                tx.execute(
                    "INSERT INTO rekordbox_export_playlists (export_id,"
                    " collection_id, kind, name, path, entry_count, dropped_count,"
                    " rules_json) VALUES (?, ?, ?, 'N', 'CuePoint/N', 3, 0, ?)",
                    (export, node, kind, rule),
                )
    service.close_all()
    return {
        "nodes": nodes,
        "entries": len(entry_rows),
        "exports": exports,
    }


def _fingerprint(path: Path) -> Dict[str, Any]:
    """What an upgrade must keep: every row of the rebuilt tables, and the ids."""
    conn = sqlite3.connect(path)
    try:
        found: Dict[str, Any] = {}
        for table in ("collections", "collection_tracks", "rekordbox_export_playlists"):
            count, total = conn.execute(
                f"SELECT count(*), total(id) FROM {table}"
            ).fetchone()
            found[table] = (count, total)
        found["sequence"] = sorted(
            conn.execute("SELECT name, seq FROM sqlite_sequence").fetchall()
        )
        return found
    finally:
        conn.close()


def measure_migration(workspace: Path, total: int) -> Dict[str, Any]:
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.migration_runner import MigrationRunner

    base = workspace / "v24.db"
    started = time.perf_counter()
    shape = build_v24(base, total)
    built = round(time.perf_counter() - started, 1)
    before = _fingerprint(base)
    times: List[float] = []
    for copy in range(MIGRATION_COPIES):
        target = workspace / f"upgrade-{copy}.db"
        shutil.copyfile(base, target)
        service = DatabaseService(db_path=target)
        runner = MigrationRunner(service, migrations=_discover(25))
        start = time.perf_counter()
        applied = runner.migrate()
        times.append(time.perf_counter() - start)
        assert [m.version for m in applied] == [25], applied
        problems = service.connect().execute("PRAGMA foreign_key_check").fetchall()
        service.close_all()
        after = _fingerprint(target)
        assert not problems, problems
        assert after == before, (before, after)
        target.unlink()
    return {
        **shape,
        "build_seconds": built,
        "median_ms": round(statistics.median(times) * 1000, 1),
        "max_ms": round(max(times) * 1000, 1),
        "database_mb": round(base.stat().st_size / 1_048_576, 1),
    }


# ------------------------------------------------------------- the Set


def run(total: int, workspace: Path) -> Dict[str, Any]:
    migration = measure_migration(workspace, total)

    os.environ["CUEPOINT_HOME"] = str(workspace / "home")
    os.environ["CUEPOINT_SKIP_BEATPORT"] = "1"
    os.environ.pop("CUEPOINT_BEATPORT_FIXTURE", None)

    from cuepoint.services import database_service

    database_path = workspace / "cuepoint.db"
    database_service.default_database_path = lambda: database_path

    from cuepoint.engine import sets_api
    from cuepoint.models.file_status import FILE_PRESENT, TrackFileStatus
    from cuepoint.persistence.track_query import BrowseQuery
    from cuepoint.services import interfaces as I
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.collection_service import SetSource
    from cuepoint.services.set_analysis_service import ANALYSIS_BUDGET_SECONDS
    from cuepoint.services.set_suggestion_service import DENSE_GAP_BUDGET_SECONDS
    from cuepoint.utils.di_container import get_container, reset_container

    reset_container()
    bootstrap_services()
    container = get_container()

    def resolve(interface):
        return container.resolve(interface)

    resolve(I.IMigrationRunner).migrate()
    seeding: Dict[str, float] = {}

    started = time.perf_counter()
    resolve(I.ITrackRepository).add_many(library_track(i) for i in range(1, total + 1))
    seeding["library"] = round(time.perf_counter() - started, 1)

    # --- a Set at its limit ---------------------------------------------------
    started = time.perf_counter()
    dense = [i for i in range(1, total + 1) if (i % 100) < 70]
    other = [i for i in range(1, total + 1) if (i % 100) >= 70]
    chosen: List[int] = []
    for n in range(SET_ENTRIES):
        # Mostly the dense band, with a track from elsewhere every fifth place:
        # jumps and clashes to check and accept, as a real Set has a few of.
        source = other if n % 5 == 4 else dense
        chosen.append(source[(n * 37) % len(source)])
    # The first two entries sit in the densest band: the dense gap.
    chosen[0], chosen[1] = 1, 2
    made = resolve(I.ICollectionService).create_set_from(
        SetSource.selection(chosen), name="Friday"
    )
    set_id = int(made.set.id)
    sets = resolve(I.ISetService)
    entries = [entry.entry_id for entry in sets.plan(set_id).entries]
    step = SET_ENTRIES // CHAPTERS
    for n in range(1, CHAPTERS):
        sets.split_chapter_at(entries[n * step], f"Chapter {n + 1}")
    for n, chapter in enumerate(sets.plan(set_id).chapters):
        sets.update_chapter(
            int(chapter.chapter.id),
            {
                "name": f"Chapter {n + 1}",
                "target_seconds": step * 180,
                "bpm_min": 118.0,
                "bpm_max": 132.0,
            },
        )
    for n, entry_id in enumerate(entries):
        if n % 2 == 0:
            sets.set_entry_times(entry_id, "0:30", "3:00")
    resolve(I.IFileStatusRepository).record(
        [
            TrackFileStatus(
                track_id=track_id,
                status=FILE_PRESENT,
                checked_path=f"/music/{track_id:06d}.mp3",
                checked_at=NOW,
                size_bytes=1000,
            )
            for track_id in sorted(set(chosen))
        ]
    )
    analysis = resolve(I.ISetAnalysisService)
    found = analysis.analyse(set_id).to_dict()
    accepted = 0
    for transition in found["transitions"]:
        for warning in transition["warnings"]:
            if accepted >= ACKNOWLEDGED:
                break
            analysis.acknowledge(
                transition["from_entry_id"], transition["to_entry_id"], warning["kind"]
            )
            accepted += 1
    seeding["set"] = round(time.perf_counter() - started, 1)

    def query(**values) -> Dict[str, List[str]]:
        return {key: [str(value)] for key, value in values.items()}

    suggestions = resolve(I.ISetSuggestionService)
    whole_library = BrowseQuery()
    gap = {"before_entry_id": entries[0], "after_entry_id": entries[1]}
    # A gap nothing bridges: a dense entry followed by one in the 170s.
    far = next(
        n
        for n in range(1, SET_ENTRIES - 1)
        if 120 <= bpm_of(chosen[n]) < 130 and 170 <= bpm_of(chosen[n + 1])
    )

    rows: List[Dict[str, Any]] = []

    def row(label: str, value: float, unit: str, note: str = "", budget=None):
        over = budget is not None and value > budget
        rows.append(
            {
                "label": label,
                "value": value,
                "unit": unit,
                "note": note,
                "budget": budget,
                "over_budget": over,
            }
        )

    row(
        "m0025 on a version-24 library",
        migration["median_ms"],
        "ms",
        f"median of {MIGRATION_COPIES}, max {migration['max_ms']} ms",
        MIGRATION_BUDGET_SECONDS * 1000,
    )
    row("The plan", median_ms(lambda: sets.plan(set_id)), "ms")
    row(
        "The running order, as the route sends it",
        median_ms(lambda: sets_api.entries(query(set_id=set_id))),
        "ms",
        "each entry beside the Library's row",
    )
    row(
        "The checks",
        median_ms(lambda: analysis.analyse(set_id)),
        "ms",
    )
    row(
        "The checks, with their wire object",
        median_ms(lambda: analysis.analyse(set_id).to_dict()),
        "ms",
        f"{accepted} accepted",
        ANALYSIS_BUDGET_SECONDS * 1000,
    )
    dense_answer = suggestions.suggest(set_id, pool=whole_library, limit=50, **gap)
    row(
        "Suggestions at a dense gap, the whole library",
        median_ms(
            lambda: suggestions.suggest(set_id, pool=whole_library, limit=50, **gap)
        ),
        "ms",
        f"{dense_answer.considered:,} scored, 50 suggestions",
        DENSE_GAP_BUDGET_SECONDS * 1000,
    )
    row(
        "The same, as the route sends it",
        median_ms(lambda: sets_api.suggestions(query(set_id=set_id, **gap))),
        "ms",
        "each suggestion beside the Library's row (PREP-11)",
    )
    row(
        "The same, 200 suggestions",
        median_ms(
            lambda: suggestions.suggest(set_id, pool=whole_library, limit=200, **gap)
        ),
        "ms",
    )
    row(
        "After the last entry",
        median_ms(
            lambda: suggestions.suggest(
                set_id, before_entry_id=entries[-1], pool=whole_library, limit=50
            )
        ),
        "ms",
    )
    row(
        "A gap nothing bridges",
        median_ms(
            lambda: suggestions.suggest(
                set_id,
                before_entry_id=entries[far],
                after_entry_id=entries[far + 1],
                pool=whole_library,
                limit=50,
            )
        ),
        "ms",
    )
    return {
        "tracks": total,
        "migration": migration,
        "set_entries": SET_ENTRIES,
        "chapters": CHAPTERS,
        "acknowledged": accepted,
        "seeding_seconds": seeding,
        "rows": rows,
    }


def report(result: Dict[str, Any]) -> None:
    migration = result["migration"]
    print(
        f"\n{result['tracks']:,} tracks. Version-24 library: {migration['nodes']:,} nodes,"
        f" {migration['entries']:,} entries, {migration['exports']:,} export records,"
        f" {migration['database_mb']} MB. A Set of {result['set_entries']:,} entries in"
        f" {result['chapters']} chapters, {result['acknowledged']} warnings accepted.\n"
    )
    print(
        "seeding (s):",
        {"v24 library": migration["build_seconds"], **result["seeding_seconds"]},
    )
    print()
    print("| What | Time | Budget | |")
    print("| --- | --- | --- | --- |")
    for entry in result["rows"]:
        budget = "" if entry["budget"] is None else f"{entry['budget']:g} ms"
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
    parser.add_argument(
        "--keep", action="store_true", help="keep the temporary workspace"
    )
    args = parser.parse_args(argv)
    if args.tracks < 5000:
        parser.error("--tracks must be at least 5000")

    workspace = Path(tempfile.mkdtemp(prefix="cuepoint-bench-sets-"))
    try:
        result = run(args.tracks, workspace)
    finally:
        if not args.keep:
            try:
                from cuepoint.services.interfaces import IDatabaseService
                from cuepoint.utils.di_container import get_container

                get_container().resolve(IDatabaseService).close_all()
            except Exception:  # noqa: BLE001 — cleanup only
                pass
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


__all__: Tuple[str, ...] = (
    "bpm_of",
    "build_v24",
    "key_of",
    "library_track",
    "main",
    "measure_migration",
    "run",
)
