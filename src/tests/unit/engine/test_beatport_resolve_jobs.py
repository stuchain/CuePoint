#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Resolving Beatport identities as a job (DISCOVER-04, DEC-095, DEC-098).

Run through the engine's real job store and service container, over a real
database, with the container's ``BeatportApi`` replaced by one whose HTTP
client is the fake Beatport of the service tests. So nothing here reads the
developer's configured token, and nothing reaches the network.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Callable

import pytest

from cuepoint.engine import beatport_resolve_jobs as jobs
from cuepoint.engine.beatport_resolve_jobs import (
    JOB_TYPE_BEATPORT_RESOLVE,
    PROGRESS_MESSAGE,
    resolve_after_matches,
    start_beatport_resolve_job,
)
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.match_jobs import JOB_TYPE_CLEAN_MATCH
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError, DatabaseError
from cuepoint.services import database_service as database_service_module
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import (
    BeatportApiClient,
    classify_beatport_error,
)
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.beatport_library import accept, add_tracks
from tests.fixtures.job_settling import wait_until_settled
from tests.unit.services.test_beatport_resolve_service import FIRST_ID, FakeBeatport

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)


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
    """A sandboxed library database with services bootstrapped over it."""
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
    """Make every ``BeatportApi`` the container builds talk to ``client``."""
    get_container().register_factory(BeatportApi, lambda: BeatportApi(client))


@pytest.fixture
def store(library_db) -> JobStore:
    job_store = JobStore(job_repository_provider=lambda: resolve("IJobRepository"))
    yield job_store
    wait_until_settled(job_store, "every job to finish")


@pytest.fixture
def owned(library_db):
    """250 library tracks, each accepted to its own Beatport track."""
    db = resolve("IDatabaseService")
    with db.transaction() as conn:
        ids = add_tracks(conn, 250)
        for offset, track_id in enumerate(ids):
            accept(conn, track_id, str(FIRST_ID + offset))
    return [FIRST_ID + offset for offset in range(250)]


def finished(store: JobStore, job) -> Any:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.id}")
    return store.get(job.id)


def cached() -> int:
    db = resolve("IDatabaseService")
    return int(
        db.connect().execute("SELECT count(*) FROM beatport_tracks").fetchone()[0]
    )


class GatedBeatport(FakeBeatport):
    """A fake Beatport that holds its second request until released."""

    def __init__(self, ids) -> None:
        super().__init__(ids)
        self.waiting = threading.Event()
        self.release = threading.Event()

    def get(self, path, params=None):
        if len(self.requests) == 1:
            self.waiting.set()
            self.release.wait(30)
        return super().get(path, params)


# ------------------------------------------------------------------ refusal


class TestWithoutAToken:
    def test_it_is_refused_before_a_job_exists(self, store, owned):
        use_beatport(BeatportApiClient("https://api.beatport.com/v4", ""))
        with pytest.raises(BeatportAPIError) as refused:
            start_beatport_resolve_job(store)
        assert classify_beatport_error(refused.value) == "no_token"
        assert store.list_all() == []

    def test_the_real_container_builds_no_client_without_a_token(
        self, store, owned, monkeypatch
    ):
        """The factory bootstrap registers, with nothing configured."""
        monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)

        def no_network(*args, **kwargs):
            raise AssertionError("a test reached for the network")

        monkeypatch.setattr(BeatportApiClient, "_request", no_network)
        config = resolve("IConfigService")
        monkeypatch.setattr(
            config,
            "get",
            lambda key, default=None: None
            if key == "incrate.beatport_access_token"
            else type(config).get(config, key, default),
        )
        with pytest.raises(BeatportAPIError) as refused:
            start_beatport_resolve_job(store)
        assert classify_beatport_error(refused.value) == "no_token"
        assert store.list_all() == []


# ------------------------------------------------------------------- running


class TestAResolveJob:
    def test_it_reads_every_owned_track_and_succeeds(self, store, owned):
        beatport = FakeBeatport(set(owned))
        use_beatport(beatport)
        job = finished(store, start_beatport_resolve_job(store))
        assert job.type == JOB_TYPE_BEATPORT_RESOLVE
        assert job.state == JobState.SUCCEEDED
        assert job.result["resolved"] == 250
        assert job.result["outcome"] == "succeeded"
        assert (cached(), len(beatport.requests)) == (250, 3)

    def test_its_progress_says_what_it_is_doing(self, store, owned):
        use_beatport(FakeBeatport(set(owned)))
        job = finished(store, start_beatport_resolve_job(store))
        assert job.progress.status_message == PROGRESS_MESSAGE
        assert (job.progress.completed_tracks, job.progress.total_tracks) == (250, 250)

    def test_it_records_one_activity_event(self, store, owned):
        use_beatport(FakeBeatport(set(owned)))
        finished(store, start_beatport_resolve_job(store))
        db = resolve("IDatabaseService")
        rows = db.connect().execute(
            "SELECT summary FROM activity_events WHERE type = 'discover.beatport.resolved'"
        )
        assert [r[0] for r in rows] == ["Resolved 250 of 250 Beatport tracks"]

    def test_the_token_is_read_when_the_job_starts(self, store, owned):
        """A client built per job: a token entered after the last job is used."""
        first = FakeBeatport(set(owned))
        use_beatport(first)
        finished(store, start_beatport_resolve_job(store))
        db = resolve("IDatabaseService")
        with db.transaction() as conn:
            conn.execute("UPDATE beatport_tracks SET fetched_at = '2000-01-01'")
        second = FakeBeatport(set(owned))
        use_beatport(second)
        finished(store, start_beatport_resolve_job(store))
        assert (len(first.requests), len(second.requests)) == (3, 3)


class TestWhenItStops:
    def test_a_rejected_token_fails_it_and_keeps_what_it_stored(self, store, owned):
        use_beatport(FakeBeatport(set(owned), fail={2: 401}))
        job = finished(store, start_beatport_resolve_job(store))
        assert job.state == JobState.FAILED
        assert job.error["code"] == "BEATPORT_REJECTED"
        assert job.error["message"].endswith(
            "stopped because Beatport rejected the token"
        )
        assert job.result["error_class"] == "rejected"
        assert (job.result["resolved"], cached()) == (100, 100)

    def test_a_network_that_stays_down_fails_it_as_unavailable(self, store, owned):
        use_beatport(FakeBeatport(set(owned), fail={1: 503, 2: 503, 3: 503}))
        job = finished(store, start_beatport_resolve_job(store))
        assert job.state == JobState.FAILED
        assert job.error["code"] == "BEATPORT_UNAVAILABLE"
        assert job.result["failed"] == 250

    def test_a_cancel_stops_it_between_batches(self, store, owned):
        beatport = GatedBeatport(set(owned))
        use_beatport(beatport)
        job = start_beatport_resolve_job(store)
        assert beatport.waiting.wait(30)
        store.request_cancel(job.id)
        beatport.release.set()
        job = finished(store, job)
        assert job.state == JobState.CANCELLED
        assert job.error["code"] == "JOB_CANCELLED"
        assert job.result["cancelled"] is True
        assert (len(beatport.requests), cached()) == (2, 200)

    def test_an_unexpected_error_fails_it(self, store, owned, monkeypatch):
        use_beatport(FakeBeatport(set(owned)))
        catalog = resolve("IBeatportCatalogRepository")

        def broken(stale_before):
            raise RuntimeError("database gone")

        monkeypatch.setattr(type(catalog), "resolve_plan", lambda self, s: broken(s))
        job = finished(store, start_beatport_resolve_job(store))
        assert job.state == JobState.FAILED
        assert job.error == {
            "code": "BEATPORT_RESOLVE_FAILED",
            "message": "database gone",
        }

    def test_a_cuepoint_error_keeps_its_code(self, store, owned, monkeypatch):
        use_beatport(FakeBeatport(set(owned)))
        catalog = resolve("IBeatportCatalogRepository")

        def broken(self, stale_before):
            raise DatabaseError("locked", error_code="DATABASE_LOCKED")

        monkeypatch.setattr(type(catalog), "resolve_plan", broken)
        job = finished(store, start_beatport_resolve_job(store))
        assert job.error["code"] == "DATABASE_LOCKED"


# ------------------------------------------------------------- what waits


class TestWhatWaitsForWhat:
    def test_a_second_resolve_is_refused_while_one_runs(self, store, owned):
        beatport = GatedBeatport(set(owned))
        use_beatport(beatport)
        start_beatport_resolve_job(store)
        assert beatport.waiting.wait(30)
        with pytest.raises(JobTypeBusyError):
            start_beatport_resolve_job(store)
        beatport.release.set()

    def test_it_starts_beside_a_library_import(self, store, owned):
        release = threading.Event()
        store.create_job(
            job_type=JOB_TYPE_LIBRARY_IMPORT,
            runner=lambda _job: release.wait(30),
            exclusive=True,
        )
        use_beatport(FakeBeatport(set(owned)))
        try:
            job = finished(store, start_beatport_resolve_job(store))
        finally:
            release.set()
        assert job.state == JobState.SUCCEEDED


def resolves(store: JobStore) -> list:
    return [j for j in store.list_all() if j.type == JOB_TYPE_BEATPORT_RESOLVE]


def match_ends(store: JobStore, runner=lambda _job: None) -> None:
    """A Clean match that runs ``runner`` and has ended when this returns."""
    job = store.create_job(job_type=JOB_TYPE_CLEAN_MATCH, runner=runner)
    wait_until(
        lambda: store.get(job.id).state in TERMINAL, f"the match {job.id} to end"
    )


class TestAfterAMatch:
    """DSC-4 (PAGES-08): a finished match with a token looks the tracks up."""

    def test_a_finished_match_with_a_token_starts_one_resolve(self, store, owned):
        use_beatport(FakeBeatport(set(owned)))
        resolve_after_matches(store)
        match_ends(store)
        wait_until(lambda: len(resolves(store)) == 1, "the resolve to start")
        job = finished(store, resolves(store)[0])
        assert job.state == JobState.SUCCEEDED
        assert job.result["resolved"] == 250

    def test_without_a_token_nothing_starts(self, store, owned):
        use_beatport(BeatportApiClient("https://api.beatport.com/v4", ""))
        resolve_after_matches(store)
        match_ends(store)
        wait_until_settled(store, "the match")
        assert resolves(store) == []

    def test_a_match_that_failed_or_was_stopped_starts_none(self, store, owned):
        use_beatport(FakeBeatport(set(owned)))
        resolve_after_matches(store)

        def fails(_job):
            raise RuntimeError("boom")

        match_ends(store, fails)
        wait_until_settled(store, "the failed match")
        assert resolves(store) == []

    def test_nothing_to_read_starts_none(self, store, library_db):
        use_beatport(FakeBeatport(set()))
        resolve_after_matches(store)
        match_ends(store)
        wait_until_settled(store, "the match")
        assert resolves(store) == []

    def test_other_jobs_ending_start_none(self, store, owned):
        use_beatport(FakeBeatport(set(owned)))
        resolve_after_matches(store)
        done = store.create_job(job_type="file_check", runner=lambda _job: None)
        wait_until(lambda: store.get(done.id).state in TERMINAL, "the job to end")
        wait_until_settled(store, "the job")
        assert resolves(store) == []

    def test_never_two_at_once(self, store, owned):
        beatport = GatedBeatport(set(owned))
        use_beatport(beatport)
        resolve_after_matches(store)
        match_ends(store)
        assert beatport.waiting.wait(30)
        # A resolve is running; two more matches end beside it.
        match_ends(store)
        match_ends(store)
        assert len(resolves(store)) == 1
        beatport.release.set()
        wait_until_settled(store, "the resolve")
        assert len(resolves(store)) == 1

    def test_registering_twice_does_not_double_it(self, store, owned):
        use_beatport(FakeBeatport(set(owned)))
        resolve_after_matches(store)
        resolve_after_matches(store)
        match_ends(store)
        wait_until_settled(store, "the resolve")
        assert len(resolves(store)) == 1


class TestNothingStartsItButAPersonOrAMatch:
    def test_no_module_starts_it(self):
        """DEC-095, amended by DSC-4: never at engine start, never by browsing.
        DISCOVER-09's ``resolve/start`` route starts it when asked, and this
        module starts it after a Clean match, which is a person's own work."""
        package = Path(jobs.__file__).resolve().parents[1]
        callers = sorted(
            path.relative_to(package).as_posix()
            for path in package.rglob("*.py")
            if "start_beatport_resolve_job" in path.read_text(encoding="utf-8")
        )
        assert callers == ["engine/beatport_resolve_jobs.py", "engine/discover_api.py"]
