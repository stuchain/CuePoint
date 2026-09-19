#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A real Clean match with Beatport answered from files (CLEAN-14).

The end-to-end journey matches a playlist through the whole engine, with only
Beatport stubbed. This is the same match without the desktop around it, on
every build: the real processor, matcher, scoring, guards, storage and state
rules over three library tracks, with every connection off this machine
refused. It pins what the journey relies on — one track accepted, one left for
review with two candidates in a known order, one with nothing found — so a
change to scoring shows up here, by name, before it shows up as a journey that
cannot find its button.
"""

from __future__ import annotations

import socket
import time
from pathlib import Path
from typing import Any, Dict, List

import pytest

from cuepoint.data.beatport_fixture import ENV_VAR
from cuepoint.engine import artwork_jobs
from cuepoint.engine import jobs as jobs_module
from cuepoint.engine.jobs import JobState, JobStore
from cuepoint.engine.match_jobs import start_match_job
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.interfaces import (
    IDatabaseService,
    IMatchRepository,
    IMigrationRunner,
    ITrackRepository,
)
from cuepoint.utils.di_container import get_container, reset_container

FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "beatport"
    / "journey"
    / "fixture.json"
)
LOOPBACK = {"127.0.0.1", "::1", "localhost"}


@pytest.fixture
def offline(monkeypatch):
    """Refuse every connection and lookup that is not to this machine."""
    reached: List[Any] = []
    connect = socket.socket.connect
    lookup = socket.getaddrinfo

    def guarded_connect(self, address):
        host = address[0] if isinstance(address, tuple) else address
        if host not in LOOPBACK:
            reached.append(address)
            raise OSError(f"network refused in this test: {address}")
        return connect(self, address)

    def guarded_lookup(host, *args, **kwargs):
        if host not in LOOPBACK:
            reached.append(host)
            raise OSError(f"network refused in this test: {host}")
        return lookup(host, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket, "getaddrinfo", guarded_lookup)
    return reached


@pytest.fixture
def engine(tmp_path, monkeypatch, offline):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setenv(ENV_VAR, str(FIXTURE))
    monkeypatch.delenv("CUEPOINT_SKIP_BEATPORT", raising=False)
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: tmp_path / "db.sqlite"
    )
    monkeypatch.setattr(jobs_module, "_services_bootstrapped", True)
    reset_container()
    bootstrap_services()
    get_container().resolve(IMigrationRunner).migrate()
    yield get_container()
    get_container().resolve(IDatabaseService).close_all()
    reset_container()


def add_tracks(container) -> Dict[str, int]:
    tracks = container.resolve(ITrackRepository)
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id="1",
                file_path=str(Path("/music/1.mp3")),
                title="Tone One",
                artist="Artist 1",
                key="8A",
                bpm=124.0,
                year=2020,
            ),
            LibraryTrack(
                rekordbox_track_id="2",
                file_path=str(Path("/music/2.mp3")),
                title="Tone Two",
                artist="Artist 2",
                key="8A",
                bpm=124.0,
                year=2020,
            ),
            LibraryTrack(
                rekordbox_track_id="3",
                file_path=str(Path("/music/3.mp3")),
                title="Gone",
                artist="Artist 3",
            ),
        ]
    )
    ids = tracks.browse_ids(BrowseQuery(sort="title"), limit=10)
    return {tracks.get(track_id).title: track_id for track_id in ids}


def run(store: JobStore, ids: List[int]):
    job = start_match_job(store, BatchSelection.of_ids(ids)).job
    deadline = time.monotonic() + 120
    while job.state in (JobState.QUEUED, JobState.RUNNING):
        assert time.monotonic() < deadline, "the match did not finish"
        time.sleep(0.05)
    return job


def candidates(container, track_id: int) -> List[Dict[str, Any]]:
    rows = (
        container.resolve(IDatabaseService)
        .connect()
        .execute(
            "SELECT c.url, c.key, c.bpm, c.score, c.guard_ok, c.is_winner"
            " FROM match_candidates c JOIN match_attempts a ON a.id = c.attempt_id"
            " WHERE a.track_id = ? ORDER BY c.score DESC, c.is_winner DESC",
            (track_id,),
        )
    )
    return [dict(row) for row in rows]


@pytest.mark.integration
def test_the_journey_match_offline(engine, offline):
    ids = add_tracks(engine)
    job = run(JobStore(), list(ids.values()))

    assert job.state is JobState.SUCCEEDED, job.error
    assert job.result["accepted"] == 1
    assert job.result["needs_review"] == 1
    assert job.result["no_match"] == 1
    assert job.result["errors"] == 0
    assert offline == [], "the match reached the network"

    matches = engine.resolve(IMatchRepository).get_matches(ids.values())
    assert matches[ids["Tone One"]].state == "accepted"
    assert matches[ids["Tone One"]].decided_by == "auto"
    assert matches[ids["Tone Two"]].state == "needs_review"
    # A search that found nothing is not evidence of anything, so the track
    # stays "not matched": no stored state at all (CLEAN-04).
    assert ids["Gone"] not in matches

    accepted = candidates(engine, ids["Tone One"])
    assert [row["url"] for row in accepted] == [
        "https://www.beatport.com/track/tone-one/1001"
    ]
    assert accepted[0]["score"] >= 95 and accepted[0]["guard_ok"]

    review = candidates(engine, ids["Tone Two"])
    assert [(row["url"], row["key"], row["bpm"]) for row in review] == [
        ("https://www.beatport.com/track/tone-twos/2002", "D Minor", 128.0),
        ("https://www.beatport.com/track/tone-twos-extended/2001", "E Minor", 125.0),
    ]
    assert all(row["score"] < 95 and row["guard_ok"] for row in review)
    # Strictly apart: on a tie, which one ranks first depends on which page the
    # matcher's workers fetched first, and the journey's "second candidate"
    # would change from run to run.
    assert review[0]["score"] > review[1]["score"]


@pytest.mark.integration
def test_an_accepted_match_shows_its_beatport_artwork_offline(engine, offline):
    ids = add_tracks(engine)
    run(JobStore(), [ids["Tone One"]])

    image = artwork_jobs.track_thumbnail(ids["Tone One"], "row")

    assert image is not None and image[:2] == b"\xff\xd8"
    assert offline == []
