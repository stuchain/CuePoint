#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Time the two migrations that rebuild or copy the most rows, at 50,000 tracks (HARDEN-07).

``m0025_sets`` rebuilds the Collection tables that hold what a user filed, and
``m0027_play_history`` copies every known play count into a baseline read. Both
run inside the launch's upgrade, so how long they take is how long the first
start after the update waits. (``m0032`` and ``m0033`` are timed by
``bench_search_keys.py``.)

A version-24 library is built the way ``bench_sets.py`` builds one (50,000
tracks, 500 Collections and folders, 100,000 entries), given a recorded import
and a play count on most tracks, and copied; each copy is migrated by the real
runner, 24 to 25 and then 26 to 27, and the times are the medians.

Nothing here touches ``~/.cuepoint``: the databases are temporary files.

Usage::

    python scripts/bench_migrations.py                    # 50,000 tracks
    python scripts/bench_migrations.py --tracks 2000      # a quicker pass
    python scripts/bench_migrations.py --json out.json    # and write the report

Exit status 1 when a budget (``scripts/budgets.json``) is missed.
"""

from __future__ import annotations

import argparse
import shutil
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import budget_check  # noqa: E402

DEFAULT_TRACKS = 50_000
COPIES = 3


def build(path: Path, total: int) -> None:
    """A version-24 library with a recorded import and play counts (m0027 reads both)."""
    import bench_sets

    bench_sets.build_v24(path, total)
    import sqlite3

    connection = sqlite3.connect(str(path))
    try:
        with connection:
            connection.execute("UPDATE tracks SET play_count = id % 40")
            connection.execute(
                "INSERT INTO library_source (xml_path, xml_modified_at,"
                " xml_size_bytes, imported_at, track_count, playlist_count)"
                " VALUES ('/in/lib.xml', ?, 1000, ?, ?, 0)",
                (bench_sets.NOW, bench_sets.NOW, total),
            )
    finally:
        connection.close()


def _migrate(target: Path, through: int, after: int) -> float:
    """Seconds to apply the migrations above ``after`` up to ``through``."""
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.migration_runner import MigrationRunner

    import bench_sets

    service = DatabaseService(db_path=target)
    try:
        runner = MigrationRunner(service, migrations=bench_sets._discover(through))
        started = time.perf_counter()
        applied = runner.migrate()
        elapsed = time.perf_counter() - started
        assert [m.version for m in applied][-1] == through, applied
        assert not service.connect().execute("PRAGMA foreign_key_check").fetchall()
    finally:
        service.close_all()
    return elapsed


def run(total: int, workspace: Path) -> Dict[str, Any]:
    """Time m0025 and m0027 over copies of one version-24 library."""
    base = workspace / "v24.db"
    started = time.perf_counter()
    build(base, total)
    built = round(time.perf_counter() - started, 1)

    m25: List[float] = []
    m27: List[float] = []
    for copy in range(COPIES):
        target = workspace / f"upgrade-{copy}.db"
        shutil.copyfile(base, target)
        m25.append(_migrate(target, 25, 24))
        _migrate(target, 26, 25)
        m27.append(_migrate(target, 27, 26))
        target.unlink()
    measured = {
        "m0025_s": round(statistics.median(m25), 3),
        "m0027_s": round(statistics.median(m27), 3),
    }
    return {
        "tracks": total,
        "copies": COPIES,
        "build_seconds": built,
        "database_mb": round(base.stat().st_size / 1_048_576, 1),
        "measured": measured,
        "budget": budget_check.evaluate("migrations", measured, size=total),
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--json", type=Path, default=None, help="write the report")
    args = parser.parse_args(argv)

    with tempfile.TemporaryDirectory(prefix="cuepoint-bench-migrations-") as folder:
        result = run(args.tracks, Path(folder))
    print(f"{result['tracks']:,} tracks, database {result['database_mb']} MB")
    print("\n".join(budget_check.report_lines(result["budget"])))
    if args.json:
        budget_check.write_json(args.json, result)
    for problem in result["budget"]["problems"]:
        print(f"OVER BUDGET: {problem}", file=sys.stderr)
    return 1 if result["budget"]["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
