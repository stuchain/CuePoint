#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading a pre-WAVE-04 library's marks as a job, at engine start (WAVE-04).

It starts on its own, so most of this is about when it must *not* start, and
about the promise that nothing it does can stop the engine starting. The last
class runs it for real through the engine's container: a library imported and
then left as an upgrade leaves it, read back by the job, and the engine's
start doing it without being asked.
"""

from __future__ import annotations

import shutil
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional

import pytest

from cuepoint.engine import marks_backfill_jobs as jobs
from cuepoint.engine import server
from cuepoint.engine.jobs import JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES
from cuepoint.engine.marks_backfill_jobs import (
    JOB_TYPE_MARKS_BACKFILL,
    PROGRESS_MESSAGE,
    start_marks_backfill_if_needed,
    start_marks_backfill_job,
)
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.models.track_marks import MARKS_INDEX
from cuepoint.services import database_service as database_service_module
from cuepoint.services.marks_backfill_service import (
    OUTCOME_CANCELLED,
    OUTCOME_READ,
    MarksBackfillResult,
)
from cuepoint.utils.di_container import get_container, reset_container
from tests.fixtures.job_settling import wait_until_settled

pytestmark = pytest.mark.unit

TERMINAL = (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED)
FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "rekordbox" / "marks.xml"


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


@pytest.fixture
def store(library_db) -> JobStore:
    job_store = JobStore(job_repository_provider=lambda: resolve("IJobRepository"))
    yield job_store
    wait_until_settled(job_store, "every job to finish")


def finished(store: JobStore, job) -> Any:
    wait_until(lambda: store.get(job.id).state in TERMINAL, f"job {job.id}")
    return store.get(job.id)


def blocking_job(store: JobStore, job_type: str) -> threading.Event:
    release = threading.Event()
    store.create_job(
        job_type=job_type, runner=lambda _job: release.wait(30), exclusive=True
    )
    return release


class FakeService:
    def __init__(
        self, needed: bool = True, backfill: Optional[Callable] = None
    ) -> None:
        self._needed = needed
        self._backfill = backfill
        self.runs = 0

    def needed(self) -> bool:
        return self._needed

    def backfill(self, on_progress=None, should_cancel=None) -> MarksBackfillResult:
        self.runs += 1
        if self._backfill is not None:
            return self._backfill(on_progress, should_cancel)
        return MarksBackfillResult(OUTCOME_READ, tracks=2, cues=3, markers=1)


@pytest.fixture
def fake(monkeypatch):
    def use(service: Any) -> Any:
        monkeypatch.setattr(jobs, "_backfill_service", lambda: service)
        return service

    return use


class TestWhenItStarts:
    def test_it_starts_when_the_marks_are_unread_and_the_source_matches(
        self, store, fake
    ):
        service = fake(FakeService(needed=True))
        job = start_marks_backfill_if_needed(store)
        assert job is not None and job.type == JOB_TYPE_MARKS_BACKFILL
        assert finished(store, job).state is JobState.SUCCEEDED
        assert service.runs == 1

    def test_nothing_starts_when_it_is_not_needed(self, store, fake):
        service = fake(FakeService(needed=False))
        assert start_marks_backfill_if_needed(store) is None
        assert service.runs == 0
        assert store.list_all() == []

    @pytest.mark.parametrize("job_type", LIBRARY_JOB_TYPES)
    def test_it_waits_for_the_next_start_beside_any_library_job(
        self, store, fake, job_type
    ):
        fake(FakeService())
        release = blocking_job(store, job_type)
        try:
            assert start_marks_backfill_if_needed(store) is None
            with pytest.raises(JobTypeBusyError):
                start_marks_backfill_job(store)
        finally:
            release.set()

    def test_two_at_once_are_refused(self, store, fake):
        gate = threading.Event()

        def slow(_progress, _cancel):
            gate.wait(30)
            return MarksBackfillResult(OUTCOME_READ)

        fake(FakeService(backfill=slow))
        start_marks_backfill_job(store)
        try:
            with pytest.raises(JobTypeBusyError):
                start_marks_backfill_job(store)
        finally:
            gate.set()

    def test_a_service_that_cannot_answer_never_stops_the_engine(
        self, store, monkeypatch
    ):
        def broken():
            raise RuntimeError("no database")

        monkeypatch.setattr(jobs, "_backfill_service", broken)
        assert start_marks_backfill_if_needed(store) is None


class TestHowItEnds:
    def test_success_carries_the_result(self, store, fake):
        fake(FakeService())
        job = finished(store, start_marks_backfill_job(store))
        assert job.state is JobState.SUCCEEDED
        assert job.result["outcome"] == OUTCOME_READ
        assert job.result["cues"] == 3

    def test_progress_is_reported_in_the_strip_s_words(self, store, fake):
        def reports(on_progress, _cancel):
            on_progress(2, 5)
            on_progress(5, 5)
            return MarksBackfillResult(OUTCOME_READ, tracks=5)

        fake(FakeService(backfill=reports))
        job = finished(store, start_marks_backfill_job(store))
        assert job.progress.status_message == PROGRESS_MESSAGE
        assert (job.progress.completed_tracks, job.progress.total_tracks) == (5, 5)

    def test_a_cancel_reaches_the_service_and_ends_cancelled(self, store, fake):
        started = threading.Event()

        def until_cancelled(_progress, should_cancel):
            started.set()
            wait_until(should_cancel, "the cancel")
            return MarksBackfillResult(OUTCOME_CANCELLED, tracks=1)

        fake(FakeService(backfill=until_cancelled))
        job = start_marks_backfill_job(store)
        started.wait(10)
        store.request_cancel(job.id)
        ended = finished(store, job)
        assert ended.state is JobState.CANCELLED
        assert ended.error["code"] == "JOB_CANCELLED"
        assert ended.result["outcome"] == OUTCOME_CANCELLED

    def test_a_cuepoint_error_keeps_its_code(self, store, fake):
        def fails(_progress, _cancel):
            raise CuePointException(
                "the file is unreadable", error_code="LIBRARY_XML_BAD"
            )

        fake(FakeService(backfill=fails))
        job = finished(store, start_marks_backfill_job(store))
        assert job.state is JobState.FAILED
        assert job.error == {
            "code": "LIBRARY_XML_BAD",
            "message": "the file is unreadable",
        }

    def test_anything_else_fails_with_its_own_code(self, store, fake):
        def fails(_progress, _cancel):
            raise ValueError("bad xml")

        fake(FakeService(backfill=fails))
        job = finished(store, start_marks_backfill_job(store))
        assert job.state is JobState.FAILED
        assert job.error["code"] == "MARKS_BACKFILL_FAILED"


class TestForReal:
    @pytest.fixture
    def upgraded(self, store, tmp_path):
        """A library imported, then left as the upgrade to version 26 leaves it."""
        source = tmp_path / "collection.xml"
        shutil.copyfile(FIXTURE, source)
        resolve("ILibraryImportService").import_rekordbox_xml(str(source))
        db = resolve("IDatabaseService")
        with db.transaction() as conn:
            conn.execute("DELETE FROM track_cues")
            conn.execute("DELETE FROM track_beat_grid")
            conn.execute("DELETE FROM derived_indexes WHERE name = ?", (MARKS_INDEX,))
        return source

    def test_the_job_reads_them_and_then_is_never_needed_again(self, store, upgraded):
        job = start_marks_backfill_if_needed(store)
        assert job is not None
        ended = finished(store, job)
        assert ended.state is JobState.SUCCEEDED
        assert ended.result["outcome"] == OUTCOME_READ
        marks = resolve("ITrackMarksRepository")
        assert marks.is_read() is True
        assert marks.counts() == (11, 6)
        assert start_marks_backfill_if_needed(store) is None

    def test_the_engine_starts_it_without_being_asked(
        self, store, upgraded, monkeypatch
    ):
        monkeypatch.setattr(server, "backup_library_on_launch", lambda: None)
        monkeypatch.setattr(server, "record_activity", lambda *a, **k: None)
        monkeypatch.setattr(server, "_JOB_STORE", store)

        def stop_here(*_args, **_kwargs):
            raise RuntimeError("stop")

        monkeypatch.setattr(server, "ThreadingHTTPServer", stop_here)
        with pytest.raises(RuntimeError, match="stop"):
            server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))
        (job,) = [j for j in store.list_all() if j.type == JOB_TYPE_MARKS_BACKFILL]
        assert finished(store, job).state is JobState.SUCCEEDED
        assert resolve("ITrackMarksRepository").counts() == (11, 6)
