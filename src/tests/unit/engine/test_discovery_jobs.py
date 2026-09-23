#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Discovery as a job (DISCOVER-05, DEC-091, DEC-098).

Through the engine's real job store and service container over a real
database, with the container's ``BeatportApi`` talking to the in-memory
Beatport of the service tests. Nothing here reads the developer's configured
token or reaches the network; every request passes its genres and days
explicitly, so no configured default is read either.
"""

from __future__ import annotations

import threading
import time
from datetime import date, timedelta
from typing import Any, Callable

import pytest

from cuepoint.engine import discovery_jobs as jobs
from cuepoint.engine import server
from cuepoint.engine.discovery_jobs import (
    JOB_TYPE_DISCOVERY,
    close_interrupted_discovery_runs,
    start_discovery_job,
)
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.models.discovery_run import (
    RUN_CANCELLED,
    RUN_FAILED,
    RUN_SUCCEEDED,
    DiscoveryRun,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services import database_service as database_service_module
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import classify_beatport_error
from cuepoint.services.discovery_service import (
    INTERRUPTED_ERROR,
    STAGE_CHARTS,
    STAGE_LABELS,
    STAGE_RELEASES,
)
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.beatport_world import BeatportWorld
from tests.fixtures.job_settling import wait_until_settled
from tests.unit.services.test_discovery_service import LIBRARY, standard_world

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)
ASK = {"genre_ids": [5, 6], "new_releases_days": 30}


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
def library(library_db):
    resolve("ITrackRepository").add_many(
        [
            LibraryTrack(rekordbox_track_id=f"rb{i}", title=t, artist=a, label=lab)
            for i, (t, a, lab) in enumerate(LIBRARY, start=1)
        ]
    )


@pytest.fixture
def world(library) -> BeatportWorld:
    beatport = standard_world(date.today())
    use_beatport(beatport)
    return beatport


def finished(store: JobStore, job) -> Any:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.id}")
    return store.get(job.id)


def runs() -> Any:
    return resolve("IDiscoveryRepository")


class GatedWorld(BeatportWorld):
    """Holds its first label search until released."""

    def __init__(self, base: BeatportWorld) -> None:
        super().__init__(charts=base.charts, tracks=base.tracks)
        self.waiting = threading.Event()
        self.release = threading.Event()

    def get(self, path, params=None):
        if path.strip("/") == "catalog/search" and not self.waiting.is_set():
            self.waiting.set()
            self.release.wait(30)
        return super().get(path, params)


# ------------------------------------------------------------------ refusal


class TestRefusedBeforeItExists:
    def test_without_a_token(self, store, library):
        use_beatport(BeatportWorld(access_token=""))
        with pytest.raises(BeatportAPIError) as refused:
            start_discovery_job(store, **ASK)
        assert classify_beatport_error(refused.value) == "no_token"
        assert store.list_all() == [] and runs().list_runs() == []

    def test_a_request_it_cannot_use(self, store, world):
        with pytest.raises(ValueError):
            start_discovery_job(store, genre_ids=[5], new_releases_days=0)
        assert store.list_all() == [] and runs().list_runs() == []


# ------------------------------------------------------------------ running


class TestADiscoveryJob:
    def test_it_runs_and_keeps_its_run(self, store, world):
        job = finished(store, start_discovery_job(store, **ASK))
        assert (job.type, job.state) == (JOB_TYPE_DISCOVERY, JobState.SUCCEEDED)
        assert job.result["outcome"] == RUN_SUCCEEDED
        assert job.result["tracks_found"] == 7
        assert "params_json" not in job.result
        run = runs().get_run(job.result["id"])
        assert (run.job_id, run.outcome) == (job.id, RUN_SUCCEEDED)

    def test_its_progress_names_the_stage(self, store, world):
        seen = []
        real = JobStore.report_progress

        def spy(self, job, progress):
            seen.append(progress.status_message)
            real(self, job, progress)

        store.report_progress = spy.__get__(store)  # type: ignore[method-assign]
        finished(store, start_discovery_job(store, **ASK))
        assert [s for i, s in enumerate(seen) if i == 0 or seen[i - 1] != s] == [
            STAGE_CHARTS,
            STAGE_LABELS,
            STAGE_RELEASES,
        ]

    def test_it_records_one_activity_event(self, store, world):
        finished(store, start_discovery_job(store, **ASK))
        rows = (
            resolve("IDatabaseService")
            .connect()
            .execute("SELECT summary FROM activity_events WHERE type = 'discovery.ran'")
        )
        assert [r[0] for r in rows] == [
            "Discovery found 7 tracks in 3 charts and 2 releases"
        ]


class TestWhenItStops:
    def test_a_rejected_token_fails_it_keeping_what_it_found(self, store, world):
        world.failures.append(
            lambda path, params, n: 401 if "label_id" in params else None
        )
        job = finished(store, start_discovery_job(store, **ASK))
        assert job.state == JobState.FAILED
        assert job.error["code"] == "BEATPORT_REJECTED"
        assert job.error["message"].startswith(
            "Discovery stopped because Beatport rejected"
        )
        assert (job.result["outcome"], job.result["error_class"]) == (
            RUN_FAILED,
            "rejected",
        )
        assert job.result["tracks_found"] == 5

    def test_an_error_that_is_not_beatports_fails_it(self, store, world, monkeypatch):
        from cuepoint.services import discovery_service

        monkeypatch.setattr(
            discovery_service,
            "chart_curator",
            lambda *a: (_ for _ in ()).throw(KeyError("bug")),
        )
        job = finished(store, start_discovery_job(store, **ASK))
        assert (job.state, job.error["code"]) == (JobState.FAILED, "DISCOVERY_FAILED")
        assert job.result["outcome"] == RUN_FAILED

    def test_a_run_that_cannot_even_start_fails_the_job(
        self, store, world, monkeypatch
    ):
        repository = type(runs())
        monkeypatch.setattr(
            repository,
            "start_run",
            lambda self, run: (_ for _ in ()).throw(RuntimeError("locked")),
        )
        job = finished(store, start_discovery_job(store, **ASK))
        assert job.state == JobState.FAILED
        assert job.error == {"code": "DISCOVERY_FAILED", "message": "locked"}

    def test_a_cancel_keeps_what_it_found(self, store, library):
        gated = GatedWorld(standard_world(date.today()))
        use_beatport(gated)
        job = start_discovery_job(store, **ASK)
        assert gated.waiting.wait(30)
        store.request_cancel(job.id)
        gated.release.set()
        job = finished(store, job)
        assert job.state == JobState.CANCELLED
        assert job.error["code"] == "JOB_CANCELLED"
        assert (job.result["outcome"], job.result["tracks_found"]) == (RUN_CANCELLED, 5)


class TestWhatWaitsForWhat:
    def test_a_second_discovery_is_refused_while_one_runs(self, store, library):
        gated = GatedWorld(standard_world(date.today()))
        use_beatport(gated)
        start_discovery_job(store, **ASK)
        assert gated.waiting.wait(30)
        try:
            with pytest.raises(JobTypeBusyError):
                start_discovery_job(store, **ASK)
        finally:
            gated.release.set()

    def test_it_starts_beside_a_library_import(self, store, world):
        release = threading.Event()
        store.create_job(
            job_type=JOB_TYPE_LIBRARY_IMPORT,
            runner=lambda _job: release.wait(30),
            exclusive=True,
        )
        try:
            job = finished(store, start_discovery_job(store, **ASK))
        finally:
            release.set()
        assert job.state == JobState.SUCCEEDED


# --------------------------------------------------------------- start-up


class TestRunsACrashLeftOpen:
    def test_they_are_closed_as_failed(self, library_db):
        open_run = runs().start_run(
            DiscoveryRun(started_at="2026-09-23T12:00:00+00:00", params_json="{}")
        )
        assert close_interrupted_discovery_runs() == [open_run.id]
        closed = runs().get_run(open_run.id)
        assert (closed.outcome, closed.error) == (RUN_FAILED, INTERRUPTED_ERROR)
        assert close_interrupted_discovery_runs() == []

    def test_closing_them_never_stops_the_engine(self, monkeypatch):
        def broken():
            raise RuntimeError("no database")

        monkeypatch.setattr(jobs, "_discovery_service", broken)
        assert close_interrupted_discovery_runs() == []

    def test_the_engine_closes_them_as_it_starts(self, monkeypatch):
        closed = []
        monkeypatch.setattr(server, "backup_library_on_launch", lambda: None)
        monkeypatch.setattr(server, "record_activity", lambda *a, **k: None)
        monkeypatch.setattr(
            "cuepoint.engine.credit_index_jobs.start_credit_index_if_stale",
            lambda store: None,
        )
        monkeypatch.setattr(
            jobs, "close_interrupted_discovery_runs", lambda: closed.append(1)
        )

        def stop_here(*_args, **_kwargs):
            raise RuntimeError("stop")

        monkeypatch.setattr(server, "ThreadingHTTPServer", stop_here)
        with pytest.raises(RuntimeError, match="stop"):
            server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))
        assert closed == [1]


class TestNothingStartsItButAPerson:
    def test_no_module_starts_a_run(self):
        """Until DISCOVER-09's ``runs/start`` route, only this module does."""
        from pathlib import Path

        package = Path(jobs.__file__).resolve().parents[1]
        callers = sorted(
            path.relative_to(package).as_posix()
            for path in package.rglob("*.py")
            if "start_discovery_job" in path.read_text(encoding="utf-8")
        )
        assert callers == ["engine/discovery_jobs.py"]


def test_the_default_window_is_the_last_thirty_days(store, world):
    job = finished(store, start_discovery_job(store, **ASK))
    params = runs().get_run(job.result["id"]).params
    today = date.today()
    assert params["charts_to"] == today.isoformat()
    assert params["charts_from"] == (today - timedelta(days=30)).isoformat()
