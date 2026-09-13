#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Clean and the CLI match an export identically (CLEAN-03, DEC-065).

DEC-065 changes what matching is given — library tracks instead of a parsed XML
file — and promises nothing else changes. This is that promise as a test: one
Rekordbox export is matched by the CLI's path (``process_playlist_from_xml``)
and, after importing it, by Clean's (``MatchService.run``), through the same
real ``ProcessorService``. Only the matcher's search is stubbed, and it answers
deterministically from what it was asked, so any difference in the question
shows up as a difference in the answer.

Four things are compared:

- **What the matcher was asked** — title, artist, title-only mode, the queries
  and the mix flags, track by track.
- **What came back** — every ``TrackResult`` field but the clock
  (``processing_time``) and the path's spelling (the CLI resolves a Location
  against the filesystem, the library stores it as exported; both name the
  same file).
- **The settings** ``process_track`` was handed.
- **How many tracks were matched at once.**

The export includes the shapes the CLI treats specially: an artist missing but
recoverable from an "Artist - Title" title, an artist missing outright, and a
remix, whose mix flags change the queries.
"""

from __future__ import annotations

import dataclasses
import zlib
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import Mock, patch
from urllib.parse import quote

import pytest

import cuepoint.services.match_service as match_service_module
import cuepoint.services.processor_service as processor_service_module
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.result import TrackResult
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.interfaces import (
    IConfigService,
    ILibraryImportService,
    IMatchService,
    IMigrationRunner,
    IProcessorService,
    ITrackRepository,
)
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.processor_service import ProcessorService
from cuepoint.utils.di_container import get_container, reset_container

#: (TrackID, Name, Artist, Tonality, AverageBpm, Year)
EXPORT = (
    ("11", "Strobe (Original Mix)", "deadmau5", "Ebm", "128.00", "2009"),
    ("12", "Eric Prydz - Opus", "", "Am", "126.00", "2015"),
    ("13", "Untitled Sketch", "", "", "0.00", "0"),
    ("14", "Opus (Four Tet Remix)", "Eric Prydz", "Am", "124.00", "2016"),
    ("15", "Rej", "Ame", "F#m", "122.50", "2005"),
)


def write_export(folder: Path) -> Path:
    tracks = []
    for track_id, name, artist, key, bpm, year in EXPORT:
        location = "file://localhost/" + quote((folder / f"{track_id}.mp3").as_posix())
        tracks.append(
            f'<TRACK TrackID="{track_id}" Name="{name}" Artist="{artist}"'
            f' Tonality="{key}" AverageBpm="{bpm}" Year="{year}" TotalTime="400"'
            f' Location="{location}"/>'
        )
    refs = "".join(f'<TRACK Key="{row[0]}"/>' for row in EXPORT)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="rekordbox" Version="6.8.0"/>'
        f'<COLLECTION Entries="{len(EXPORT)}">{"".join(tracks)}</COLLECTION>'
        '<PLAYLISTS><NODE Type="0" Name="ROOT">'
        f'<NODE Name="Set" Type="1" KeyType="0" Entries="{len(EXPORT)}">{refs}</NODE>'
        "</NODE></PLAYLISTS></DJ_PLAYLISTS>"
    )
    path = folder / "export.xml"
    path.write_text(xml, encoding="utf-8")
    return path


class StubSearch:
    """``find_best_match`` answering only from its arguments."""

    def __init__(self) -> None:
        self.asked: List[Dict[str, Any]] = []

    def __call__(self, **kwargs: Any):
        self.asked.append(
            {
                "title": kwargs["track_title"],
                "artist": kwargs["track_artists_for_scoring"],
                "title_only": kwargs["title_only_mode"],
                "queries": list(kwargs["queries"]),
                "mix": kwargs["input_mix"],
                "generic": kwargs["input_generic_phrases"],
            }
        )
        seed = zlib.crc32(
            f"{kwargs['track_title']}|{kwargs['track_artists_for_scoring']}".encode()
        )
        best = BeatportCandidate(
            url=f"https://www.beatport.com/track/stub/{seed}",
            title=kwargs["track_title"],
            artists=kwargs["track_artists_for_scoring"] or "Unknown",
            label="Stub",
            release_date="2020-02-02",
            bpm="128",
            key="A min",
            genre="House",
            score=80.0 + seed % 20,
            title_sim=90,
            artist_sim=80,
            query_index=1,
            query_text=kwargs["queries"][0] if kwargs["queries"] else "",
            candidate_index=1,
            base_score=80.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=3,
            is_winner=True,
            release_year=2020,
            release_name="Stub EP",
        )
        return best, [best], [(1, best.query_text, 1, 3)], 1


class Recording:
    """Wraps ``process_track`` to keep what each call was given and returned."""

    def __init__(self, processor: ProcessorService) -> None:
        self._real = processor.process_track
        self.results: List[TrackResult] = []
        self.settings: List[Dict[str, Any]] = []

    def __call__(self, idx, track, settings=None):
        result = self._real(idx, track, settings)
        self.results.append(result)
        self.settings.append(dict(settings or {}))
        return result


def recording_pool(module, sizes: List[int]):
    real = module.ThreadPoolExecutor

    class Pool(real):  # type: ignore[misc, valid-type]
        def __init__(self, max_workers=None, *args, **kwargs):
            sizes.append(max_workers)
            super().__init__(max_workers, *args, **kwargs)

    return patch.object(module, "ThreadPoolExecutor", Pool)


def comparable(result: TrackResult) -> Dict[str, Any]:
    values = {
        f.name: getattr(result, f.name)
        for f in dataclasses.fields(result)
        if f.name not in ("processing_time", "file_path")
    }
    return values


@pytest.fixture
def container(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    get_container().resolve(IMigrationRunner).migrate()
    yield get_container()
    reset_container()


@pytest.mark.integration
@pytest.mark.parametrize("workers", [1, 3])
def test_clean_and_the_cli_match_the_same_export_identically(
    container, tmp_path, workers
):
    export = write_export(tmp_path)
    config = container.resolve(IConfigService)
    config.set("MIN_ACCEPT_SCORE", 85)
    # Set rather than inherited: the XML path matches sequentially at one worker
    # and through a pool above it, and both shapes are compared.
    config.set("TRACK_WORKERS", workers)

    # --- the CLI's path -------------------------------------------------------
    cli_search = StubSearch()
    cli_processor = ProcessorService(
        beatport_service=Mock(),
        matcher_service=MatcherService(),
        logging_service=LoggingService(),
        config_service=config,
    )
    cli_processor.matcher_service.find_best_match = cli_search  # type: ignore[method-assign]
    cli_calls = Recording(cli_processor)
    cli_processor.process_track = cli_calls  # type: ignore[method-assign]
    cli_pools: List[int] = []
    with recording_pool(processor_service_module, cli_pools):
        cli_results = cli_processor.process_playlist_from_xml(str(export), "Set")

    # --- Clean's path ---------------------------------------------------------
    container.resolve(ILibraryImportService).import_rekordbox_xml(str(export))
    clean_search = StubSearch()
    clean_processor = ProcessorService(
        beatport_service=Mock(),
        matcher_service=MatcherService(),
        logging_service=LoggingService(),
        config_service=config,
    )
    clean_processor.matcher_service.find_best_match = clean_search  # type: ignore[method-assign]
    clean_calls = Recording(clean_processor)
    clean_processor.process_track = clean_calls  # type: ignore[method-assign]
    container.register_singleton(IProcessorService, clean_processor)

    tracks = container.resolve(ITrackRepository)
    in_export_order = [int(tracks.find_by_rekordbox_id(row[0]).id) for row in EXPORT]
    service = container.resolve(IMatchService)
    clean_pools: List[int] = []
    with recording_pool(match_service_module, clean_pools):
        draft = service.prepare(BatchSelection.of_ids(in_export_order))
        service.write_plan("clean", draft)
        outcome = service.run("clean")

    # --- the same questions ---------------------------------------------------
    assert outcome.completed == len(EXPORT) == len(cli_results)
    by_title = lambda asked: sorted(asked, key=lambda a: (a["title"], a["artist"]))  # noqa: E731
    assert by_title(clean_search.asked) == by_title(cli_search.asked)
    assert len(cli_search.asked) == len(EXPORT)
    assert {a["artist"] for a in cli_search.asked} >= {"Eric Prydz", "Unknown Artist"}

    # --- the same answers -----------------------------------------------------
    cli_by_index = {r.playlist_index: r for r in cli_results}
    clean_by_index = {r.playlist_index: r for r in clean_calls.results}
    assert sorted(cli_by_index) == sorted(clean_by_index) == [1, 2, 3, 4, 5]
    for index, cli_result in cli_by_index.items():
        clean_result = clean_by_index[index]
        assert comparable(clean_result) == comparable(cli_result), index
        assert (
            Path(clean_result.file_path).resolve()
            == Path(cli_result.file_path).resolve()
        )
    assert any(r.matched for r in cli_results)
    assert not all(r.matched for r in cli_results)

    # --- the same settings, and as many at once --------------------------------
    assert clean_calls.settings and cli_calls.settings
    assert all(
        s == cli_calls.settings[0] for s in cli_calls.settings + clean_calls.settings
    )
    assert cli_calls.settings[0]["MIN_ACCEPT_SCORE"] == 85
    assert cli_calls.settings[0]["TRACK_WORKERS"] == workers
    if workers == 1:
        # One at a time either way: the XML path loops without a pool, and a
        # match job's writer hands a pool of one a track at a time.
        assert (cli_pools, clean_pools) == ([], [1])
    else:
        assert clean_pools == cli_pools[:1] == [workers]
