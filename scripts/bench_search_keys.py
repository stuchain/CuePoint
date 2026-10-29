#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Time the two HARDEN-06 migrations on a library of 50,000 tracks.

``m0032_path_nfc`` rewrites the stored path keys and ``m0033_search_keys`` fills
the folded search and sort keys and rebuilds the browse index. Both run inside
the launch's upgrade, so how long they take is how long the first start after
the update waits.

It builds a library at the version before ``m0032`` (the real migrations, then
tracks inserted in bulk with accented, decomposed and non-Latin names, and a
label override on every tenth), then applies each migration through the real
runner and reports its time. Also times a search and the default browse page
before and after, so the keys are shown to cost nothing at read time.

Nothing here touches ``~/.cuepoint``: the database is a temporary file.

Usage::

    python scripts/bench_search_keys.py                  # 50,000 tracks
    python scripts/bench_search_keys.py --tracks 5000     # a quicker pass
    python scripts/bench_search_keys.py --json out.json   # and write the report

Exit status 1 when a budget (``scripts/budgets.json``) is missed (HARDEN-07).
"""

from __future__ import annotations

import argparse
import random
import sys
import tempfile
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import budget_check  # noqa: E402

from cuepoint.persistence.track_query import BrowseQuery  # noqa: E402
from cuepoint.persistence.track_repository import TrackRepository  # noqa: E402
from cuepoint.services.database_service import DatabaseService  # noqa: E402
from cuepoint.services.migration_runner import MigrationRunner, _discovered  # noqa: E402

_ARTISTS = [
    "Âme",
    "Beyoncé",
    "Björk",
    "Daft Punk",
    "Σίσυφος",
    "YMO",
    "東京事変",
    "Nina Kraviz",
    "Éric Prydz",
    "deadmau5",
]
_TITLES = ["Rej", "Déjà Vu", "Straße", "Opus", "Strobe", "夜に駆ける", "Halo", "Ånd"]
_LABELS = ["Innervisions", "Éditions Mego", "mau5trap", "Ölçü", None]


def _seed(service: DatabaseService, count: int) -> None:
    rng = random.Random(7)
    rows: List[tuple] = []
    for index in range(count):
        artist = rng.choice(_ARTISTS)
        title = f"{rng.choice(_TITLES)} {index}"
        path = f"/Music/{artist}/{title}.mp3"
        if index % 3 == 0:
            path = unicodedata.normalize("NFD", path)
        old_key = path.replace("\\", "/").casefold()
        rows.append(
            (
                str(index + 1),
                path,
                old_key,
                title,
                artist,
                rng.choice(["Rej EP", "Café del Mar", None]),
                rng.choice(_LABELS),
                "2026-01-01T00:00:00+00:00",
                "2026-01-01T00:00:00+00:00",
            )
        )
    with service.transaction() as conn:
        conn.executemany(
            "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
            " title, artist, album, label, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.executemany(
            "INSERT INTO track_metadata (track_id, label, created_at, updated_at)"
            " VALUES (?, ?, ?, ?)",
            [
                (i, "Étiquette Spéciale", "2026-01-01", "2026-01-01")
                for i in range(1, count + 1, 10)
            ],
        )


def _timed(label: str, work) -> float:
    """Run ``work``, print its time and return it in milliseconds."""
    start = time.perf_counter()
    work()
    elapsed = (time.perf_counter() - start) * 1000
    print(f"{label:<44}{elapsed:>10.1f} ms")
    return elapsed


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tracks", type=int, default=50_000)
    parser.add_argument("--json", type=Path, default=None, help="write the report")
    args = parser.parse_args(argv)

    migrations = list(_discovered())
    before_32 = [m for m in migrations if m.version < 32]
    through_32 = [m for m in migrations if m.version <= 32]
    through_33 = [m for m in migrations if m.version <= 33]

    measured: Dict[str, float] = {}
    with tempfile.TemporaryDirectory() as folder:
        service = DatabaseService(db_path=Path(folder) / "cuepoint.db")
        try:
            MigrationRunner(service, migrations=before_32).migrate()
            _seed(service, args.tracks)
            print(f"{args.tracks:,} tracks")
            measured["m0032_s"] = (
                _timed(
                    "m0032_path_nfc",
                    lambda: MigrationRunner(service, migrations=through_32).migrate(),
                )
                / 1000
            )
            measured["m0033_s"] = (
                _timed(
                    "m0033_search_keys",
                    lambda: MigrationRunner(service, migrations=through_33).migrate(),
                )
                / 1000
            )
            repo = TrackRepository(service)
            measured["search_ms"] = _timed(
                "search 'ame' (folded, first 50)", lambda: repo.search("ame")
            )
            measured["search_count_ms"] = _timed(
                "search count 'beyonce'", lambda: repo.search_count("beyonce")
            )
            measured["browse_first_page_ms"] = _timed(
                "browse page 1 (default order)",
                lambda: repo.browse(BrowseQuery(), limit=100),
            )
            measured["browse_deep_page_ms"] = _timed(
                "browse page 400 (default order)",
                lambda: repo.browse(
                    BrowseQuery(), limit=100, offset=max(0, args.tracks - 100)
                ),
            )
        finally:
            service.close_all()

    measured = {name: round(value, 3) for name, value in measured.items()}
    result: Dict[str, Any] = {
        "tracks": args.tracks,
        "measured": measured,
        "budget": budget_check.evaluate("search_keys", measured, size=args.tracks),
    }
    print("\n".join(budget_check.report_lines(result["budget"])))
    if args.json:
        budget_check.write_json(args.json, result)
    for problem in result["budget"]["problems"]:
        print(f"OVER BUDGET: {problem}", file=sys.stderr)
    return 1 if result["budget"]["problems"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
