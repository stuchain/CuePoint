#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure Clean at the size Phase 7 was designed for (CLEAN-14).

The library ``bench_library.py`` measures, with everything Clean adds to it:

- 50,000 tracks, each on a real (empty) file except 2,000 that are missing;
- 30,000 match attempts at the candidate breadth CLEAN-02 measured against
  live Beatport — 40 candidates each, 1.2 million candidate rows;
- 8,000 user decisions, half accepting a track's second candidate;
- 10,000 overrides, applied and typed;
- 1,500 duplicate groups, found by the scan this measures;
- artwork state for every track.

Then, in order: the review queue's browse, each Health count and the whole
report, sorting by effective BPM and key (and by match score, which CLEAN-13
left for this pass), the file check, the duplicate scan, applying Beatport
values to 5,000 tracks and reverting that, and the database's size.

Browses and counts are the median of five after a warm-up. The file check, the
scan, the apply and the revert change what they measure, so each runs once.
Nothing reaches Beatport — nothing here matches — and nothing touches
``~/.cuepoint``: the database, the files and ``CUEPOINT_HOME`` are temporary.

Usage::

    python scripts/bench_clean.py                  # 50,000 tracks
    python scripts/bench_clean.py --tracks 5000    # a quicker pass, scaled
    python scripts/bench_clean.py --json report.json
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

#: Everything below scales with the library, in the proportions the step names.
DEFAULT_TRACKS = 50_000
ATTEMPTS_SHARE = 30_000 / 50_000
DECISIONS_SHARE = 8_000 / 50_000
OVERRIDES_SHARE = 10_000 / 50_000
MISSING_SHARE = 2_000 / 50_000
DUPLICATE_GROUPS_SHARE = 1_500 / 50_000
BATCH_SHARE = 5_000 / 50_000

#: CLEAN-02's live measurement: 40.3 candidates per attempt.
CANDIDATES_PER_ATTEMPT = 40

NOW = "2026-09-17T12:00:00+00:00"


def median_ms(call: Callable[[], Any], runs: int = 5) -> float:
    call()
    times = []
    for _ in range(runs):
        start = time.perf_counter()
        call()
        times.append((time.perf_counter() - start) * 1000)
    return round(statistics.median(times), 1)


def once_s(call: Callable[[], Any]) -> tuple:
    start = time.perf_counter()
    value = call()
    return round(time.perf_counter() - start, 2), value


def _mb(size: int) -> float:
    return round(size / (1024 * 1024), 1)


def run(total: int, workspace: Path) -> Dict[str, Any]:
    os.environ["CUEPOINT_HOME"] = str(workspace / "home")
    os.environ["CUEPOINT_SKIP_BEATPORT"] = "1"
    os.environ.pop("CUEPOINT_BEATPORT_FIXTURE", None)

    from cuepoint.services import database_service

    database_path = workspace / "cuepoint.db"
    database_service.default_database_path = lambda: database_path

    from cuepoint.models.beatport_candidate import BeatportCandidate
    from cuepoint.models.filter_rule import FilterRule, RuleSet
    from cuepoint.models.library_track import LibraryTrack
    from cuepoint.models.result import TrackResult
    from cuepoint.models.track import Track
    from cuepoint.persistence.activity_repository import (
        SOURCE_BEATPORT,
        SOURCE_CUEPOINT,
    )
    from cuepoint.persistence.artwork_repository import EmbeddedRecord
    from cuepoint.persistence.track_query import BrowseQuery
    from cuepoint.services import interfaces as I
    from cuepoint.services.batch_service import (
        OPERATION_APPLY_MATCH,
        BatchOperation,
        BatchSelection,
    )
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.health_service import HEALTH_RULES
    from cuepoint.utils.di_container import get_container, reset_container

    reset_container()
    bootstrap_services()
    container = get_container()

    def resolve(interface):
        return container.resolve(interface)

    resolve(I.IMigrationRunner).migrate()
    db = resolve(I.IDatabaseService)
    seeding: Dict[str, float] = {}

    attempts = int(total * ATTEMPTS_SHARE)
    decisions = int(total * DECISIONS_SHARE)
    overrides = int(total * OVERRIDES_SHARE)
    missing = int(total * MISSING_SHARE)
    pairs = int(total * DUPLICATE_GROUPS_SHARE)
    batch_size = int(total * BATCH_SHARE)

    # ---------------------------------------------------------------- files
    music = workspace / "music"
    paths: List[Path] = []
    started = time.perf_counter()
    for n in range(total):
        folder = music / f"{n // 1000:03d}"
        if n % 1000 == 0:
            folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{n:06d}.mp3"
        paths.append(path)
        # The last tracks' files are the missing ones.
        if n < total - missing:
            path.touch()
    seeding["files"] = time.perf_counter() - started

    # --------------------------------------------------------------- tracks
    started = time.perf_counter()
    tracks = resolve(I.ITrackRepository)
    tracks.add_many(
        LibraryTrack(
            rekordbox_track_id=str(n),
            file_path=str(paths[n]),
            # The first ``pairs`` pairs share an artist, a title and a length.
            title=f"Pair {n // 2}" if n < 2 * pairs else f"Song {n}",
            artist=f"Pair Artist {n // 2}" if n < 2 * pairs else f"Artist {n % 3000}",
            duration_seconds=300 + (n // 2 if n < 2 * pairs else n) % 200,
            key=None if n % 25 == 0 else "8A",
            bpm=None if n % 30 == 0 else 120.0 + n % 12,
            genre=None if n % 20 == 0 else "House",
            label="Label",
            year=2020,
        )
        for n in range(total)
    )
    ids = sorted(track.id for track in tracks.list_all())
    seeding["tracks"] = time.perf_counter() - started

    # ------------------------------------------------------------- attempts
    matches = resolve(I.IMatchRepository)
    states = resolve(I.IMatchStateService)

    def candidate(track_id: int, index: int, score: float) -> BeatportCandidate:
        return BeatportCandidate(
            url=f"https://www.beatport.com/track/song/{track_id * 100 + index}",
            title=f"Song {track_id}",
            artists="Artist",
            label="Beatport Label",
            release_date="2021-03-01",
            bpm=124.0 + index % 3,
            key=("A Minor", "E Minor", "D Minor")[index % 3],
            genre="Techno",
            score=score - index,
            title_sim=90,
            artist_sim=90,
            query_index=1 + index % 10,
            query_text="Song Artist",
            candidate_index=index,
            base_score=score - index,
            bonus_year=0,
            bonus_key=0,
            guard_ok=index % 4 != 3,
            reject_reason="" if index % 4 != 3 else "title_guard",
            elapsed_ms=1,
            is_winner=index == 0,
            release_year=2021,
            release_name="Release",
        )

    started = time.perf_counter()
    stored: Dict[int, int] = {}
    chunk = 500
    for start in range(0, attempts, chunk):
        with db.transaction():
            for i in range(start, min(start + chunk, attempts)):
                track_id = ids[i]
                # A third accepted automatically, the rest left for review.
                score = 97.0 if i % 3 == 0 else 80.0 + i % 14
                found = [
                    candidate(track_id, k, score) for k in range(CANDIDATES_PER_ATTEMPT)
                ]
                result = TrackResult(
                    playlist_index=i,
                    title=f"Song {track_id}",
                    artist="Artist",
                    matched=True,
                    best_match=found[0],
                    candidates=found,
                    match_score=score,
                )
                attempt = matches.add_attempt(
                    track_id, "bench", result, Track(title="Song", artist="Artist")
                )
                states.apply_attempt(attempt)
                stored[track_id] = attempt.id
    seeding["attempts"] = time.perf_counter() - started

    # ------------------------------------------------------------ decisions
    started = time.perf_counter()
    decided = [ids[i] for i in range(attempts) if i % 3 != 0][:decisions]
    for start in range(0, len(decided), chunk):
        with db.transaction():
            for offset, track_id in enumerate(decided[start : start + chunk]):
                if (start + offset) % 2 == 0:
                    second = matches.candidates_for(stored[track_id])[1]
                    states.accept(track_id, second.id)
                else:
                    states.reject(track_id)
    seeding["decisions"] = time.perf_counter() - started

    # ------------------------------------------------------------ overrides
    started = time.perf_counter()
    metadata = resolve(I.IMetadataService)
    overridden = ids[-overrides:]
    # Worked out once, as every batch does: asked per call, the library's key
    # notation is a count over every track (14 ms at 50,000).
    notation = metadata.key_notation()
    for start in range(0, len(overridden), chunk):
        with db.transaction():
            for offset, track_id in enumerate(overridden[start : start + chunk]):
                n = start + offset
                if n % 2:
                    metadata.set_override(
                        track_id, "bpm", 118 + n % 20, source=SOURCE_BEATPORT
                    )
                else:
                    metadata.set_override(
                        track_id,
                        "key",
                        "11B",
                        source=SOURCE_CUEPOINT,
                        notation=notation,
                    )
    seeding["overrides"] = time.perf_counter() - started

    # -------------------------------------------------------------- artwork
    started = time.perf_counter()
    artwork = resolve(I.IArtworkRepository)
    for start in range(0, total, 5000):
        with db.transaction():
            artwork.record_embedded(
                [
                    EmbeddedRecord(
                        ids[n],
                        "present" if n % 10 == 0 else "none",
                        f"{n:064x}" if n % 10 == 0 else None,
                        NOW,
                        str(paths[n]),
                    )
                    for n in range(start, min(start + 5000, total))
                ]
            )
    seeding["artwork"] = time.perf_counter() - started

    # --------------------------------------------------------- measurements
    library = resolve(I.ILibraryService)
    repo_tracks = resolve(I.ITrackRepository)
    rows: List[Dict[str, Any]] = []

    def row(label: str, value: float, unit: str, note: str = "") -> None:
        rows.append({"label": label, "value": value, "unit": unit, "note": note})

    # The file check and the duplicate scan go first: they are what make the
    # missing files and the groups the counts below count.
    seconds, checked = once_s(lambda: resolve(I.IFileCheckService).check(ids))
    row("File check, whole library", seconds, "s", checked.summary_line())
    seconds, scanned = once_s(lambda: resolve(I.IDuplicateService).scan())
    row("Duplicate scan, every signal", seconds, "s", scanned.summary_line())

    review = RuleSet(rules=(FilterRule("match_state", "is", "needs_review"),))

    def browse(rules=None, sort="artist", offset=0):
        return lambda: library.browse_tracks(
            rules=rules, sort=sort, limit=100, offset=offset
        )

    review_total = library.browse_tracks(rules=review, limit=1).total
    row(
        "Review queue: open it",
        median_ms(browse(review)),
        "ms",
        f"{review_total} tracks",
    )
    row(
        "Review queue: scroll to the end",
        median_ms(browse(review, offset=max(0, review_total - 100))),
        "ms",
    )
    row(
        "Review queue: sort by score",
        median_ms(browse(review, sort="match_score")),
        "ms",
    )

    health = resolve(I.IHealthService)
    report = health.report()
    row("Health: the whole report", median_ms(health.report), "ms")
    for count in report.counts:
        rule = next(r for r in HEALTH_RULES if r.id == count.rule.id)
        row(
            f"Health: {rule.label.lower()}",
            median_ms(
                lambda rule=rule: repo_tracks.browse_count(
                    BrowseQuery(rules=rule.rules)
                )
            ),
            "ms",
            f"{count.count} tracks",
        )

    for sort in ("bpm", "key", "match_score", "match_state", "file_status", "artist"):
        row(f"Library: sort by {sort}", median_ms(browse(sort=sort)), "ms")
    row(
        "Library: sort by BPM, scrolled to the end",
        median_ms(browse(sort="bpm", offset=total - 100)),
        "ms",
    )

    accepted = [
        track_id
        for track_id, match in resolve(I.IMatchRepository).get_matches(ids).items()
        if match.state == "accepted"
    ][:batch_size]
    batches = resolve(I.IBatchService)
    seconds, applied = once_s(
        lambda: batches.apply_batch(
            BatchSelection.of_ids(accepted),
            BatchOperation(
                OPERATION_APPLY_MATCH, ["key", "bpm", "genre", "label", "year"]
            ),
        )
    )
    row(
        f"Apply Beatport values to {len(accepted):,} tracks",
        seconds,
        "s",
        f"{applied.changed} changed, {applied.unchanged} unchanged",
    )
    seconds, reverted = once_s(
        lambda: resolve(I.IRevertService).revert_batch(applied.batch_id)
    )
    row(
        "Revert that",
        seconds,
        "s",
        f"{reverted.reverted} changes reverted, {reverted.skipped} refused",
    )

    connection = db.connect()
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    size = database_path.stat().st_size
    candidate_rows = connection.execute(
        "SELECT COUNT(*) FROM match_candidates"
    ).fetchone()[0]
    db.close_all()
    vacuumed_copy = workspace / "vacuumed.db"
    import sqlite3

    source = sqlite3.connect(str(database_path))
    try:
        source.execute(f"VACUUM INTO '{vacuumed_copy}'")
    finally:
        source.close()
    row("Database size", _mb(size), "MB", f"{candidate_rows:,} candidate rows")
    row("Database size after VACUUM", _mb(vacuumed_copy.stat().st_size), "MB")

    return {
        "tracks": total,
        "attempts": attempts,
        "candidates_per_attempt": CANDIDATES_PER_ATTEMPT,
        "decisions": decisions,
        "overrides": overrides,
        "missing": missing,
        "duplicate_pairs": pairs,
        "batch": len(accepted),
        "seeding_seconds": {k: round(v, 1) for k, v in seeding.items()},
        "rows": rows,
    }


def report(result: Dict[str, Any]) -> None:
    print(
        f"\n{result['tracks']:,} tracks, {result['attempts']:,} attempts x "
        f"{result['candidates_per_attempt']} candidates, {result['decisions']:,} decisions, "
        f"{result['overrides']:,} overrides, {result['missing']:,} missing files, "
        f"{result['duplicate_pairs']:,} duplicate pairs\n"
    )
    print("seeding (s):", result["seeding_seconds"])
    print()
    print("| What | Time | |")
    print("| --- | --- | --- |")
    for entry in result["rows"]:
        print(
            f"| {entry['label']} | {entry['value']} {entry['unit']} | {entry['note']} |"
        )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--tracks", type=int, default=DEFAULT_TRACKS)
    parser.add_argument("--json", type=Path, default=None, help="write the report")
    parser.add_argument(
        "--keep", action="store_true", help="keep the temporary workspace"
    )
    args = parser.parse_args(argv)
    if args.tracks < 1000:
        parser.error("--tracks must be at least 1000")

    workspace = Path(tempfile.mkdtemp(prefix="cuepoint-bench-clean-"))
    try:
        result = run(args.tracks, workspace)
    finally:
        if not args.keep:
            try:
                from cuepoint.utils.di_container import get_container
                from cuepoint.services.interfaces import IDatabaseService

                get_container().resolve(IDatabaseService).close_all()
            except Exception:  # noqa: BLE001 — cleanup only
                pass
            shutil.rmtree(workspace, ignore_errors=True)
    report(result)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
