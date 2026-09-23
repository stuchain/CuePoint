#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The name index rebuild as a job (DISCOVER-03).

It starts on its own, at engine start, for a library the running rule did not
index — so these tests are mostly about when it must *not* start, and about the
promise that nothing it does can stop the engine starting. The last class runs
a real import job and a real rebuild over a real database, so the write path
and the rebuild are held to the same answer through the engine.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, List

import pytest

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION
from cuepoint.engine import credit_index_jobs as jobs
from cuepoint.engine.credit_index_jobs import (
    JOB_TYPE_CREDIT_INDEX,
    PROGRESS_MESSAGE,
    start_credit_index_if_stale,
    start_credit_index_job,
)
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import start_library_import_job
from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.credit_index_service import CreditIndexResult
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.job_settling import wait_until_settled

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)

COLLECTION = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="3">
    <TRACK TrackID="1" Name="One" Artist="Mara Veil, Óscar Lindqvist"\
 Remixer="Âme" Label="Nightfall Audio" Location="file://localhost/C:/Music/one.mp3"/>
    <TRACK TrackID="2" Name="Two" Artist="Óscar Lindqvist feat. Dub Phizix"\
 Label="NIGHTFALL-AUDIO" Location="file://localhost/C:/Music/two.mp3"/>
    <TRACK TrackID="3" Name="Three" Artist="Above &amp; Beyond"\
 Label="Anjunabeats" Location="file://localhost/C:/Music/three.mp3"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="0"/>
  </PLAYLISTS>
</DJ_PLAYLISTS>
"""


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


@pytest.fixture
def store(library_db) -> JobStore:
    job_store = JobStore(job_repository_provider=lambda: resolve("IJobRepository"))
    yield job_store
    wait_until_settled(job_store, "every job to finish")


def finished(store: JobStore, job) -> Any:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.id}")
    return store.get(job.id)


def blocking_job(store: JobStore, job_type: str) -> threading.Event:
    """A job of ``job_type`` that runs until the returned event is set."""
    release = threading.Event()
    store.create_job(
        job_type=job_type, runner=lambda _job: release.wait(30), exclusive=True
    )
    return release


class FakeService:
    """A rebuild service whose answers a test decides."""

    def __init__(self, current: bool = False, rebuild: Any = None) -> None:
        self.current = current
        self._rebuild = rebuild
        self.rebuilds = 0

    def is_current(self) -> bool:
        return self.current

    def rebuild(self, *, on_progress=None, should_cancel=None) -> CreditIndexResult:
        self.rebuilds += 1
        if self._rebuild is not None:
            return self._rebuild(on_progress, should_cancel)
        return CreditIndexResult(tracks=0, total=0, version=ENTITY_NAMES_VERSION)


@pytest.fixture
def fake(monkeypatch):
    def use(service: FakeService) -> FakeService:
        monkeypatch.setattr(jobs, "_credit_index_service", lambda: service)
        return service

    return use


def titles_by(name: str) -> List[str]:
    query = BrowseQuery(rules=RuleSet(rules=(FilterRule("artist_name", "is", name),)))
    return sorted(t.title for t in resolve("ITrackRepository").browse(query))


# --------------------------------------------------------------- when it runs


@pytest.mark.unit
class TestWhenItStarts:
    def test_a_fresh_library_is_rebuilt_once_and_then_is_current(self, store):
        job = start_credit_index_if_stale(store)
        assert job is not None and job.type == JOB_TYPE_CREDIT_INDEX
        assert finished(store, job).state is JobState.SUCCEEDED
        assert resolve("ICreditIndexService").is_current()
        assert start_credit_index_if_stale(store) is None

    def test_a_current_index_starts_nothing(self, store, fake):
        service = fake(FakeService(current=True))
        assert start_credit_index_if_stale(store) is None
        assert service.rebuilds == 0
        assert store.list_all() == []

    def test_it_waits_for_a_running_library_job_and_says_nothing(self, store, fake):
        fake(FakeService(current=False))
        release = blocking_job(store, LIBRARY_JOB_TYPES[0])
        try:
            assert start_credit_index_if_stale(store) is None
        finally:
            release.set()
        assert all(job.type != JOB_TYPE_CREDIT_INDEX for job in store.list_all())

    @pytest.mark.parametrize("job_type", LIBRARY_JOB_TYPES)
    def test_starting_one_beside_any_library_job_is_refused(
        self, store, fake, job_type
    ):
        fake(FakeService())
        release = blocking_job(store, job_type)
        try:
            with pytest.raises(JobTypeBusyError):
                start_credit_index_job(store)
        finally:
            release.set()

    def test_two_at_once_are_refused(self, store, fake):
        gate = threading.Event()

        def slow(_progress, _cancel):
            gate.wait(30)
            return CreditIndexResult(tracks=0, total=0, version=1)

        fake(FakeService(rebuild=slow))
        start_credit_index_job(store)
        try:
            with pytest.raises(JobTypeBusyError):
                start_credit_index_job(store)
        finally:
            gate.set()

    def test_an_import_may_start_while_it_runs(self, store, fake, tmp_path):
        # Safe by construction: each rebuild chunk reads and writes in one
        # BEGIN IMMEDIATE transaction (see credit_index_jobs).
        gate = threading.Event()

        def slow(_progress, _cancel):
            gate.wait(30)
            return CreditIndexResult(tracks=0, total=0, version=1)

        fake(FakeService(rebuild=slow))
        start_credit_index_job(store)
        source = tmp_path / "collection.xml"
        source.write_text(COLLECTION, encoding="utf-8")
        try:
            imported = start_library_import_job(store, str(source))
        finally:
            gate.set()
        assert finished(store, imported).state is JobState.SUCCEEDED

    def test_a_service_that_cannot_be_resolved_does_not_stop_the_engine(
        self, store, monkeypatch
    ):
        def broken():
            raise RuntimeError("container is gone")

        monkeypatch.setattr(jobs, "_credit_index_service", broken)
        assert start_credit_index_if_stale(store) is None


# ------------------------------------------------------------- how it ends


@pytest.mark.unit
class TestHowItEnds:
    def test_success_carries_the_result(self, store, fake):
        fake(
            FakeService(
                rebuild=lambda p, c: CreditIndexResult(tracks=5, total=5, version=3)
            )
        )
        job = finished(store, start_credit_index_job(store))
        assert job.state is JobState.SUCCEEDED
        assert job.result == {
            "tracks": 5,
            "total": 5,
            "version": 3,
            "cancelled": False,
        }

    def test_a_cancel_is_honoured_and_says_it_finishes_next_time(self, store, fake):
        started = threading.Event()

        def until_cancelled(_progress, should_cancel):
            started.set()
            wait_until(should_cancel, "the cancel")
            return CreditIndexResult(tracks=2, total=9, version=1, cancelled=True)

        fake(FakeService(rebuild=until_cancelled))
        job = start_credit_index_job(store)
        started.wait(10)
        store.request_cancel(job.id)
        ended = finished(store, job)
        assert ended.state is JobState.CANCELLED
        assert "next start" in ended.error["message"]
        assert ended.result["cancelled"] is True

    def test_a_cuepoint_failure_keeps_its_code(self, store, fake):
        def fails(_progress, _cancel):
            raise CuePointException("disk full", error_code="DB_COMMIT_FAILED")

        fake(FakeService(rebuild=fails))
        job = finished(store, start_credit_index_job(store))
        assert job.state is JobState.FAILED
        assert job.error == {"code": "DB_COMMIT_FAILED", "message": "disk full"}

    def test_any_other_failure_is_reported_not_raised(self, store, fake):
        def fails(_progress, _cancel):
            raise ValueError("unexpected")

        fake(FakeService(rebuild=fails))
        job = finished(store, start_credit_index_job(store))
        assert job.state is JobState.FAILED
        assert job.error["code"] == "CREDIT_INDEX_FAILED"

    def test_progress_says_what_it_is_doing_and_how_far(self, store, fake):
        def reports(on_progress, _cancel):
            on_progress(0, 4000)
            on_progress(2000, 4000)
            on_progress(4000, 4000)
            return CreditIndexResult(tracks=4000, total=4000, version=1)

        fake(FakeService(rebuild=reports))
        job = finished(store, start_credit_index_job(store))
        assert job.progress is not None
        assert job.progress.status_message == PROGRESS_MESSAGE
        assert (job.progress.completed_tracks, job.progress.total_tracks) == (
            4000,
            4000,
        )


# ------------------------------------------------- through a real import


@pytest.mark.unit
class TestThroughARealImport:
    @pytest.fixture
    def imported(self, store, tmp_path):
        source = tmp_path / "collection.xml"
        source.write_text(COLLECTION, encoding="utf-8")
        job = start_library_import_job(store, str(source))
        assert finished(store, job).state is JobState.SUCCEEDED
        wait_until_settled(store, "the import's follow-up jobs")

    def test_an_import_credits_every_artist_as_it_writes(self, store, imported):
        assert titles_by("Óscar Lindqvist") == ["One", "Two"]
        assert titles_by("oscar lindqvist") == ["One", "Two"]
        assert titles_by("Dub Phizix") == ["Two"]
        assert titles_by("ame") == ["One"]
        assert titles_by("Above & Beyond") == ["Three"]
        assert titles_by("Above") == []

    def test_a_rebuild_changes_no_answer(self, store, imported):
        names = ("Mara Veil", "Óscar Lindqvist", "Dub Phizix", "Âme")
        before = {name: titles_by(name) for name in names}
        assert finished(store, start_credit_index_job(store)).state is (
            JobState.SUCCEEDED
        )
        assert {name: titles_by(name) for name in names} == before

    def test_the_label_rule_groups_the_imported_spellings(self, store, imported):
        query = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("label_name", "is", "Nightfall Audio"),))
        )
        found = sorted(t.title for t in resolve("ITrackRepository").browse(query))
        assert found == ["One", "Two"]
