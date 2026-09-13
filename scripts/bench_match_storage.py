#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Measure what storing match attempts costs before a job stores 50,000 (CLEAN-02).

DEC-066 keeps every attempt with every candidate it scored, and estimated a
million candidate rows at 50,000 tracks on about twenty candidates per track.
The matcher's own limits allow far more than twenty — forty queries, up to
twenty-five results each — so this runs the real matcher, through
``ProcessorService.process_track``, against a stubbed Beatport at three
breadths that bracket what a search can hand it:

``found-early``
    Every query returns a page of results with the track itself on top, so the
    matcher exits early as soon as its minimum query count allows.
``same-page``
    Every query returns the same page, and nothing on it matches: all queries
    run, and de-duplication leaves one page of candidates.
``all-distinct``
    Every query returns a page nobody has seen, and nothing matches: the
    ceiling the matcher's caps allow.

Each attempt is then stored through ``MatchRepository`` in a temporary
database, twice — once whole and once without its candidates — and the
difference in used pages after ``VACUUM`` is the cost of the candidates,
indexes included. ``dbstat`` would be more direct, but the ``sqlite3`` module
Python ships on Windows is built without it.

Nothing is fetched: the search and the page parser are stubbed, and every
socket is patched to fail, so a run that reaches the network stops rather than
measuring it. Nothing touches ``~/.cuepoint``.

Usage::

    python scripts/bench_match_storage.py
    python scripts/bench_match_storage.py --library 50000 --json report.json
"""

from __future__ import annotations

import argparse
import contextlib
import io
import itertools
import json
import random
import socket
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Iterator, List, Tuple
from unittest.mock import Mock, patch

_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from cuepoint.models.config import SETTINGS  # noqa: E402
from cuepoint.models.library_track import LibraryTrack  # noqa: E402
from cuepoint.models.result import TrackResult  # noqa: E402
from cuepoint.models.track import Track  # noqa: E402
from cuepoint.persistence.match_repository import MatchRepository  # noqa: E402
from cuepoint.persistence.track_repository import TrackRepository  # noqa: E402
from cuepoint.services.database_service import DatabaseService  # noqa: E402
from cuepoint.services.matcher_service import MatcherService  # noqa: E402
from cuepoint.services.migration_runner import MigrationRunner  # noqa: E402
from cuepoint.services.processor_service import ProcessorService  # noqa: E402

#: DEC-066's premise: about twenty candidates per track.
DEC_066_CANDIDATES_PER_TRACK = 20

#: Title shapes the query generator treats differently: plain, several
#: artists, featuring, remix, extended, original, radio edit, VIP, long.
SAMPLE: Tuple[Tuple[str, str], ...] = (
    ("Never Sleep Again", "Tim Green"),
    ("Cola (Original Mix)", "CamelPhat, Elderbrook"),
    ("Losing It (Extended Mix)", "FISHER"),
    ("Tighter (CamelPhat Remix)", "Tom Staar, Jalja"),
    ("Hypercolour (feat. Someone)", "Case & Point"),
    ("Pump the Brakes (Radio Edit)", "Dom Dolla"),
    ("Tell Me Why (VIP Mix)", "Supermode"),
    ("The Sound of the Underground Is Calling Tonight", "Various Artist Collective"),
    ("Innerbloom", "RÜFÜS DU SOL"),
    ("Opus (Four Tet Remix)", "Eric Prydz"),
    ("Your Mind", "Adam Beyer, Bart Skils"),
    ("Rej (Original Mix)", "Âme"),
)

SCENARIOS = ("found-early", "same-page", "all-distinct")

_WORDS = (
    "Midnight Echo Pressure Horizon Circuit Velvet Signal Drift Motion Shelter "
    "Gravity Neon Voices Rhythm Fever Island Ritual Mirage Pulse Ember"
).split()
_LABELS = ("Defected Records", "Drumcode", "Anjunadeep", "Toolroom", "Afterlife")
_GENRES = ("Tech House", "Melodic House & Techno", "Techno (Peak Time / Driving)")


@dataclass
class Breadth:
    scenario: str
    title: str
    queries_run: int
    candidates: int


@dataclass
class Report:
    tracks_sampled: int
    breadth: List[Breadth]
    candidates_per_track: Dict[str, float]
    bytes_per_candidate: float
    bytes_per_attempt: float
    library: int
    extrapolated_rows: Dict[str, int]
    extrapolated_mb: Dict[str, float]


class _Beatport:
    """A search and a page parser that answer from memory, deterministically."""

    def __init__(self, scenario: str, track: Track, seed: int) -> None:
        self.scenario = scenario
        self.track = track
        self.random = random.Random(seed)
        self.ids = itertools.count(10_000_000 + seed * 100_000)
        self.page = [self._url() for _ in range(25)]
        self.found = self._url("found")
        self.pages: Dict[str, Tuple[Any, ...]] = {}

    def _url(self, slug: str = "") -> str:
        number = next(self.ids)
        slug = slug or "-".join(self.random.sample(_WORDS, 3)).lower()
        return f"https://www.beatport.com/track/{slug}/{number}"

    def search(self, idx: int, query: str, max_results: int) -> List[str]:
        if self.scenario == "all-distinct":
            return [self._url() for _ in range(max_results)]
        urls = self.page[:max_results]
        if self.scenario == "found-early":
            urls = [self.found] + urls[: max_results - 1]
        return urls

    def parse(self, url: str) -> Tuple[Any, ...]:
        if url not in self.pages:
            if url == self.found:
                title = f"{self.track.title} (Original Mix)"
                artists = self.track.artist
            else:
                title = " ".join(self.random.sample(_WORDS, 3)) + " (Extended Mix)"
                artists = ", ".join(self.random.sample(_WORDS, 2))
            self.pages[url] = (
                title,
                artists,
                self.random.choice(("A min", "F# maj", "Eb min")),
                self.random.choice((2019, 2021, 2024)),
                str(self.random.choice((122, 124, 126, 128))),
                self.random.choice(_LABELS),
                self.random.choice(_GENRES),
                " ".join(self.random.sample(_WORDS, 2)) + " EP",
                "2024-05-17",
            )
        return self.pages[url]


@contextlib.contextmanager
def _offline() -> Iterator[None]:
    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError("the benchmark reached the network")

    with (
        patch.object(socket.socket, "connect", refuse),
        patch.object(socket, "create_connection", refuse),
    ):
        yield


def _processor() -> ProcessorService:
    config = Mock()
    config.get.side_effect = lambda key, default=None: SETTINGS.get(key, default)
    return ProcessorService(
        beatport_service=Mock(),
        matcher_service=MatcherService(),
        logging_service=Mock(),
        config_service=config,
    )


def run_matcher() -> List[Tuple[str, Track, TrackResult]]:
    processor = _processor()
    runs = []
    for scenario in SCENARIOS:
        for seed, (title, artist) in enumerate(SAMPLE):
            track = Track(title=title, artist=artist)
            beatport = _Beatport(scenario, track, seed)
            with (
                patch("cuepoint.core.matcher.track_urls", side_effect=beatport.search),
                patch(
                    "cuepoint.core.matcher.parse_track_page", side_effect=beatport.parse
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                result = processor.process_track(seed + 1, track)
            runs.append((scenario, track, result))
    return runs


def _used_bytes(db: DatabaseService) -> int:
    connection = db.connect()
    connection.execute("VACUUM")
    pages = connection.execute("PRAGMA page_count").fetchone()[0]
    free = connection.execute("PRAGMA freelist_count").fetchone()[0]
    size = connection.execute("PRAGMA page_size").fetchone()[0]
    return int((pages - free) * size)


def _stored_bytes(runs: List[Tuple[str, Track, TrackResult]], whole: bool) -> int:
    with tempfile.TemporaryDirectory() as tmp:
        db = DatabaseService(db_path=Path(tmp) / "bench.db")
        MigrationRunner(db).migrate()
        tracks = TrackRepository(db)
        ids = []
        for number, (_, track, _) in enumerate(runs, start=1):
            stored = tracks.add(
                LibraryTrack(
                    rekordbox_track_id=str(number),
                    file_path=f"/music/{number}.mp3",
                    title=track.title,
                    artist=track.artist,
                )
            )
            ids.append(int(stored.id or 0))
        before = _used_bytes(db)

        repository = MatchRepository(db)
        with db.transaction():
            for track_id, (_, track, result) in zip(ids, runs):
                if not whole:
                    result = TrackResult(
                        playlist_index=result.playlist_index,
                        title=result.title,
                        artist=result.artist,
                        matched=False,
                        processing_time=result.processing_time,
                        queries_data=result.queries_data,
                    )
                repository.add_attempt(track_id, "bench", result, track)
        after = _used_bytes(db)
        db.close_all()
        return after - before


def measure(library: int) -> Report:
    with _offline():
        runs = run_matcher()
        whole = _stored_bytes(runs, whole=True)
        bare = _stored_bytes(runs, whole=False)

    breadth = [
        Breadth(
            scenario=scenario,
            title=track.title,
            queries_run=len(result.queries_data),
            candidates=len(result.candidates),
        )
        for scenario, track, result in runs
    ]
    total_candidates = sum(b.candidates for b in breadth)
    per_candidate = (whole - bare) / total_candidates
    per_attempt = bare / len(runs)

    per_track = {
        scenario: sum(b.candidates for b in breadth if b.scenario == scenario)
        / sum(1 for b in breadth if b.scenario == scenario)
        for scenario in SCENARIOS
    }
    per_track["dec-066"] = float(DEC_066_CANDIDATES_PER_TRACK)
    rows = {name: int(round(value * library)) for name, value in per_track.items()}
    megabytes = {
        name: round((rows[name] * per_candidate + library * per_attempt) / 1e6, 1)
        for name in per_track
    }
    return Report(
        tracks_sampled=len(SAMPLE),
        breadth=breadth,
        candidates_per_track={k: round(v, 1) for k, v in per_track.items()},
        bytes_per_candidate=round(per_candidate, 1),
        bytes_per_attempt=round(per_attempt, 1),
        library=library,
        extrapolated_rows=rows,
        extrapolated_mb=megabytes,
    )


def _print(report: Report) -> None:
    print(f"Sampled {report.tracks_sampled} title shapes per scenario.\n")
    print(f"{'scenario':<14}{'title':<50}{'queries':>8}{'candidates':>12}")
    for b in report.breadth:
        print(f"{b.scenario:<14}{b.title[:48]:<50}{b.queries_run:>8}{b.candidates:>12}")
    print(f"\nbytes per candidate (indexes included): {report.bytes_per_candidate}")
    print(f"bytes per attempt without candidates:    {report.bytes_per_attempt}")
    print(f"\nAt {report.library:,} tracks, one attempt each:")
    print(f"{'breadth':<14}{'per track':>10}{'rows':>14}{'MB':>10}")
    for name, per_track in report.candidates_per_track.items():
        print(
            f"{name:<14}{per_track:>10}{report.extrapolated_rows[name]:>14,}"
            f"{report.extrapolated_mb[name]:>10}"
        )


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--library", type=int, default=50_000)
    parser.add_argument("--json", type=Path, help="also write the report here")
    args = parser.parse_args(argv)

    report = measure(args.library)
    _print(report)
    if args.json:
        args.json.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
