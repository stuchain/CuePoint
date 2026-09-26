#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Pushing to a Beatport playlist as a job (DISCOVER-06, DEC-099, DEC-098).

Through the engine's real job store and service container over a real
database, with the container's ``BeatportApi`` talking to the in-memory
Beatport of the discovery tests. Nothing here reads the developer's configured
token or reaches the network; every push names its playlist, so no configured
default is read either.
"""

from __future__ import annotations

import threading
import time
from datetime import date
from typing import Any, Callable

import pytest

from cuepoint.engine import beatport_playlist_jobs as jobs
from cuepoint.engine.beatport_playlist_jobs import (
    JOB_TYPE_BEATPORT_PLAYLIST,
    PLAYLIST_FAILED,
    start_beatport_playlist_job,
)
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services import database_service as database_service_module
from cuepoint.services.beatport_api import PLAYLIST_WEB_BASE, BeatportApi
from cuepoint.services.beatport_api_client import classify_beatport_error
from cuepoint.services.beatport_playlist_service import (
    EVENT_PLAYLIST_PUSHED,
    OUTCOME_CANCELLED,
    OUTCOME_FAILED,
    OUTCOME_SUCCEEDED,
    STAGE_ADDING,
    STAGE_CREATING,
)
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.beatport_library import accept, add_tracks
from tests.fixtures.beatport_world import BeatportWorld
from tests.fixtures.job_settling import wait_until_settled

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)
TRACKS = [501, 502, 503]


def wait_until(predicate: Callable[[], bool], message: str, timeout=30.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError(f"timed out waiting for {message}")


def resolve(name: str) -> Any:
    from cuepoint.services import interfaces

    return get_container().resolve(getattr(interfaces, name))


@pytest.fixture
def library_db(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    resolve("IMigrationRunner").migrate()
    yield
    resolve("IDatabaseService").close_all()
    reset_container()


def use_beatport(client: Any) -> None:
    get_container().register_factory(BeatportApi, lambda: BeatportApi(client))


@pytest.fixture
def store(library_db) -> JobStore:
    job_store = JobStore(job_repository_provider=lambda: resolve("IJobRepository"))
    yield job_store
    wait_until_settled(job_store, "every job to finish")


@pytest.fixture
def world(library_db) -> BeatportWorld:
    beatport = BeatportWorld()
    for track_id in TRACKS:
        beatport.add_track(track_id, date(2026, 9, 1), (7, "Label"), (70, "Release"))
    use_beatport(beatport)
    return beatport


def finished(store: JobStore, job) -> Any:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.id}")
    return store.get(job.id)


def own(*beatport_ids: int) -> None:
    with resolve("IDatabaseService").transaction() as conn:
        for track_id, beatport_id in zip(
            add_tracks(conn, len(beatport_ids)), beatport_ids
        ):
            accept(conn, track_id, str(beatport_id))


def push_events() -> list:
    rows = (
        resolve("IDatabaseService")
        .connect()
        .execute(
            "SELECT summary FROM activity_events WHERE type = ?",
            (EVENT_PLAYLIST_PUSHED,),
        )
    )
    return [r[0] for r in rows]


class GatedWorld(BeatportWorld):
    """Holds its first track add until released."""

    def __init__(self, base: BeatportWorld) -> None:
        super().__init__(tracks=base.tracks)
        self.waiting = threading.Event()
        self.release = threading.Event()

    def post(self, path, json=None):
        if path.strip("/").endswith("/tracks") and not self.waiting.is_set():
            self.waiting.set()
            self.release.wait(30)
        return super().post(path, json)


# ------------------------------------------------------------------ refusal


class TestRefusedBeforeItExists:
    def test_without_a_token(self, store, library_db):
        world = BeatportWorld(access_token="")
        use_beatport(world)
        with pytest.raises(BeatportAPIError) as refused:
            start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        assert classify_beatport_error(refused.value) == "no_token"
        assert store.list_all() == [] and world.requests == []

    @pytest.mark.parametrize(
        "ask",
        [
            {"track_ids": []},
            {"track_ids": [0]},
            {"track_ids": TRACKS, "name": "x" * 201},
            {"track_ids": TRACKS, "include_owned": "yes"},
        ],
    )
    def test_a_push_it_cannot_use(self, store, world, ask):
        with pytest.raises(ValueError):
            start_beatport_playlist_job(store, **ask)
        assert store.list_all() == [] and world.requests == []

    def test_every_track_owned(self, store, world):
        own(*TRACKS)
        with pytest.raises(ValueError, match="already owns all 3 tracks"):
            start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        assert store.list_all() == [] and world.playlists == {}


# ------------------------------------------------------------------ running


class TestAPushJob:
    def test_it_adds_every_track_and_returns_the_real_url(self, store, world):
        job = finished(
            store, start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        )
        assert (job.type, job.state) == (JOB_TYPE_BEATPORT_PLAYLIST, JobState.SUCCEEDED)
        assert job.result["outcome"] == OUTCOME_SUCCEEDED
        assert (job.result["added"], job.result["failed"]) == (3, 0)
        assert job.result["playlist_url"] == f"{PLAYLIST_WEB_BASE}/700001"
        assert "placeholder" not in job.result["playlist_url"]
        assert world.playlists == {700001: {"name": "Crate", "tracks": TRACKS}}
        assert push_events() == ["Added 3 of 3 tracks to the Beatport playlist “Crate”"]

    def test_owned_tracks_are_skipped_unless_asked_for(self, store, world):
        own(502)
        job = finished(
            store, start_beatport_playlist_job(store, track_ids=TRACKS, name="A")
        )
        assert (job.result["skipped_owned"], job.result["added"]) == (1, 2)
        job = finished(
            store,
            start_beatport_playlist_job(
                store, track_ids=TRACKS, name="B", include_owned=True
            ),
        )
        assert (job.result["skipped_owned"], job.result["added"]) == (0, 3)
        assert [p["tracks"] for p in world.playlists.values()] == [
            [501, 503],
            TRACKS,
        ]

    def test_a_track_that_fails_is_reported_and_the_job_succeeds(self, store, world):
        world.tracks.pop(502)
        job = finished(
            store, start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        )
        assert job.state == JobState.SUCCEEDED
        assert (job.result["added"], job.result["failed_track_ids"]) == (2, [502])

    def test_its_progress_names_the_stage(self, store, world):
        seen = []
        real = JobStore.report_progress

        def spy(self, job, progress):
            seen.append(progress.status_message)
            real(self, job, progress)

        store.report_progress = spy.__get__(store)  # type: ignore[method-assign]
        finished(store, start_beatport_playlist_job(store, track_ids=TRACKS, name="C"))
        assert [s for i, s in enumerate(seen) if i == 0 or seen[i - 1] != s] == [
            STAGE_CREATING,
            STAGE_ADDING,
        ]


class TestWhenItStops:
    def test_a_403_on_create_fails_it_as_forbidden(self, store, world):
        world.failures.append(
            lambda path, params, n: 403 if path == "my/playlists" else None
        )
        job = finished(
            store, start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        )
        assert job.state == JobState.FAILED
        assert job.error["code"] == "BEATPORT_FORBIDDEN"
        assert "playlist scope" in job.error["message"]
        assert job.result["outcome"] == OUTCOME_FAILED
        assert job.result["playlist_url"] is None
        assert world.playlists == {}

    def test_a_rejected_token_mid_way_keeps_what_was_added(self, store, world):
        world.failures.append(
            lambda path, params, n: 401 if params.get("track_id") == 502 else None
        )
        job = finished(
            store, start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        )
        assert (job.state, job.error["code"]) == (JobState.FAILED, "BEATPORT_REJECTED")
        assert (job.result["added"], job.result["not_attempted"]) == (1, 1)
        assert job.result["playlist_url"] == f"{PLAYLIST_WEB_BASE}/700001"
        assert world.playlists[700001]["tracks"] == [501]

    def test_no_playlist_id_fails_it_with_its_own_code(self, store, world, monkeypatch):
        monkeypatch.setattr(BeatportApi, "create_playlist", lambda self, name: None)
        job = finished(
            store, start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        )
        assert (job.state, job.error["code"]) == (JobState.FAILED, PLAYLIST_FAILED)

    def test_an_error_that_is_not_beatports_fails_it(self, store, world, monkeypatch):
        def broken(self, plan, **kwargs):
            raise RuntimeError("a bug")

        from cuepoint.services.beatport_playlist_service import BeatportPlaylistService

        monkeypatch.setattr(BeatportPlaylistService, "push", broken)
        job = finished(
            store, start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        )
        assert (job.state, job.error) == (
            JobState.FAILED,
            {"code": PLAYLIST_FAILED, "message": "a bug"},
        )

    def test_a_cancel_keeps_what_was_added(self, store, world):
        gated = GatedWorld(world)
        use_beatport(gated)
        job = start_beatport_playlist_job(store, track_ids=TRACKS, name="Crate")
        wait_until(gated.waiting.is_set, "the first track add")
        store.request_cancel(job.id)
        gated.release.set()
        job = finished(store, job)
        assert job.state == JobState.CANCELLED
        assert job.result["outcome"] == OUTCOME_CANCELLED
        assert job.result["added"] == 1
        assert gated.playlists[700001]["tracks"] == [501]
        assert push_events()[0].endswith("; cancelled")


class TestWhatWaitsForWhat:
    def test_a_second_push_is_refused_while_one_runs(self, store, world):
        gated = GatedWorld(world)
        use_beatport(gated)
        first = start_beatport_playlist_job(store, track_ids=TRACKS, name="A")
        wait_until(gated.waiting.is_set, "the first track add")
        try:
            with pytest.raises(JobTypeBusyError):
                start_beatport_playlist_job(store, track_ids=TRACKS, name="B")
        finally:
            gated.release.set()
        assert finished(store, first).state == JobState.SUCCEEDED


class TestNothingPushesButAPerson:
    def test_no_module_starts_a_push(self):
        """DISCOVER-09's ``playlist/start`` route is its one caller."""
        from pathlib import Path

        package = Path(jobs.__file__).resolve().parents[1]
        callers = sorted(
            path.relative_to(package).as_posix()
            for path in package.rglob("*.py")
            if "start_beatport_playlist_job" in path.read_text(encoding="utf-8")
        )
        assert callers == ["engine/beatport_playlist_jobs.py", "engine/discover_api.py"]


class TestTheContainer:
    def test_it_builds_the_wantlist_with_the_beatport_client_of_the_moment(self, world):
        wantlist = resolve("IWantlistService")
        change = wantlist.add([501])
        assert change.changed == (501,) and change.read_from_beatport == 1
        assert resolve("IWantlistService").get(501).beatport_track_id == 501
        assert [p for p, _ in world.requests] == ["catalog/tracks/501"]
