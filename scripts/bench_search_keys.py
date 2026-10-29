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
"""

from __future__ import annotations

import argparse
import random
import sys
import tempfile
import time
import unicodedata
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

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
    start = time.perf_counter()
    work()
    elapsed = time.perf_counter() - start
    print(f"{label:<44}{elapsed * 1000:>10.1f} ms")
    return elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tracks", type=int, default=50_000)
    args = parser.parse_args()

    migrations = list(_discovered())
    before_32 = [m for m in migrations if m.version < 32]
    through_32 = [m for m in migrations if m.version <= 32]
    through_33 = [m for m in migrations if m.version <= 33]

    with tempfile.TemporaryDirectory() as folder:
        service = DatabaseService(db_path=Path(folder) / "cuepoint.db")
        try:
            MigrationRunner(service, migrations=before_32).migrate()
            _seed(service, args.tracks)
            print(f"{args.tracks:,} tracks")
            _timed(
                "m0032_path_nfc",
                lambda: MigrationRunner(service, migrations=through_32).migrate(),
            )
            _timed(
                "m0033_search_keys",
                lambda: MigrationRunner(service, migrations=through_33).migrate(),
            )
            repo = TrackRepository(service)
            _timed("search 'ame' (folded, first 50)", lambda: repo.search("ame"))
            _timed("search count 'beyonce'", lambda: repo.search_count("beyonce"))
            _timed(
                "browse page 1 (default order)",
                lambda: repo.browse(BrowseQuery(), limit=100),
            )
            _timed(
                "browse page 400 (default order)",
                lambda: repo.browse(BrowseQuery(), limit=100, offset=39_900),
            )
        finally:
            service.close_all()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
