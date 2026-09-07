#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A batch edit inline or as a job (ORG-07, DEC-063, DEC-033).

The service decides what a batch *does*; this decides where it runs, and the
three things that can only go wrong here are what these tests are aimed at.

**The threshold is a fork, not a suggestion.** Below it a caller gets counts and
no job exists; above it a caller gets a job and no work has happened yet on its
thread. Both halves are asserted, including the boundary itself, because a
comparison off by one is invisible until a user watches a progress bar for three
tracks.

**A refusal is a refusal.** The selection is resolved before the fork, so a bad
operation or a selection naming nothing comes back as an error rather than as a
job that starts, fails, and has to be explained in a status strip.

**A cancelled job still has an answer.** DEC-063 leaves applied work applied, so
the terminal state is CANCELLED *and* the result carries how far it got — a job
that reported only "cancelled" would leave the user unable to find out what
their library now holds.
"""

from __future__ import annotations

import time

import pytest

from cuepoint.compat.gui_types import ProgressInfo
from cuepoint.engine import batch_jobs
from cuepoint.engine.batch_jobs import (
    JOB_TYPE_LIBRARY_BATCH,
    apply_or_start,
    run_batch_job,
    start_batch_job,
)
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_jobs import JOB_TYPE_LIBRARY_IMPORT
from cuepoint.engine.library_refresh import LIBRARY_JOB_TYPES
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import (
    OPERATION_ADD_TAG,
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_SET_RATING,
    BatchOperation,
    BatchSelection,
)
from cuepoint.utils.di_container import get_container, reset_container

TRACK_COUNT = 40


@pytest.fixture
def library(tmp_path, monkeypatch):
    """A sandboxed library with services bootstrapped over it."""
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()

    from cuepoint.services.interfaces import IMigrationRunner, ITrackRepository

    get_container().resolve(IMigrationRunner).migrate()
    tracks = get_container().resolve(ITrackRepository)
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/music/{i:03d}.mp3",
                title=f"Track {i:03d}",
                artist=f"Artist {i % 4}",
                genre="House" if i % 2 else "Techno",
            )
            for i in range(1, TRACK_COUNT + 1)
        ]
    )
    yield tracks
    reset_container()


@pytest.fixture
def ids(library):
    return library.browse_ids(BrowseQuery(sort="title"))


@pytest.fixture
def store():
    return JobStore()


@pytest.fixture
def low_threshold(monkeypatch):
    """Ten tracks is a job, so the fork can be tested without seeding 1,001."""
    monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 10)


def wait_for_terminal(job: Job, timeout: float = 20.0) -> Job:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if job.state in (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job did not finish; state={job.state}")


def rated(library):
    rows = library._db.connect().execute(
        "SELECT track_id, rating FROM track_metadata WHERE rating IS NOT NULL"
    )
    return {int(row["track_id"]): row["rating"] for row in rows}


@pytest.mark.unit
class TestTheThreshold:
    def test_a_small_selection_applies_inline_and_starts_no_job(
        self, library, store, ids, low_threshold
    ):
        result, job = apply_or_start(
            store,
            BatchSelection.of_ids(ids[:10]),
            BatchOperation(OPERATION_SET_RATING, 3),
        )
        assert job is None
        assert result is not None and result.changed == 10
        assert store.list_all() == []
        assert len(rated(library)) == 10

    def test_a_large_selection_starts_a_job(self, library, store, ids, low_threshold):
        result, job = apply_or_start(
            store,
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_SET_RATING, 3),
        )
        assert result is None
        assert job is not None and job.type == JOB_TYPE_LIBRARY_BATCH
        wait_for_terminal(job)
        assert job.state is JobState.SUCCEEDED
        assert len(rated(library)) == TRACK_COUNT

    def test_the_threshold_itself_is_inline(self, library, store, ids, low_threshold):
        """Ten with a threshold of ten runs inline: the fork is *above* it.

        An off-by-one here is a progress bar for a job that finishes before it
        is drawn, which nothing but this assertion would notice.
        """
        result, job = apply_or_start(
            store,
            BatchSelection.of_ids(ids[:10]),
            BatchOperation(OPERATION_SET_RATING, 3),
        )
        assert (result is None, job is None) == (False, True)

    def test_one_over_the_threshold_is_a_job(self, library, store, ids, low_threshold):
        result, job = apply_or_start(
            store,
            BatchSelection.of_ids(ids[:11]),
            BatchOperation(OPERATION_SET_RATING, 3),
        )
        assert (result is None, job is None) == (True, False)
        wait_for_terminal(job)

    def test_the_shipped_threshold_is_the_measured_one(self):
        """A constant this step fixes, not a setting (DEC-063).

        Pinned so that changing it is a decision with a test to update rather
        than an edit nobody notices.
        """
        from cuepoint.services.batch_service import BATCH_JOB_THRESHOLD

        assert BATCH_JOB_THRESHOLD == 1_000


@pytest.mark.unit
class TestARefusalIsNotAJob:
    def test_an_unknown_operation_never_starts_a_job(self, library, store, ids):
        with pytest.raises(ValueError, match="Unknown batch operation"):
            apply_or_start(
                store, BatchSelection.of_ids(ids), BatchOperation("delete_everything")
            )
        assert store.list_all() == []

    def test_a_selection_naming_nothing_never_starts_a_job(self, library, store):
        with pytest.raises(ValueError, match="names no tracks"):
            apply_or_start(
                store,
                BatchSelection.of_ids([]),
                BatchOperation(OPERATION_SET_RATING, 3),
            )
        assert store.list_all() == []

    def test_a_missing_tag_never_starts_a_job(self, library, store, ids, low_threshold):
        """A tag deleted a moment ago, over a selection big enough for a job.

        The check happens before the fork precisely so this is an error a
        caller can show, rather than a job that appears in the status strip
        and fails a tick later.
        """
        with pytest.raises(ValueError, match="No such tag"):
            apply_or_start(
                store,
                BatchSelection.of_ids(ids),
                BatchOperation(OPERATION_ADD_TAG, 4242),
            )
        assert store.list_all() == []

    def test_a_missing_collection_never_starts_a_job(
        self, library, store, ids, low_threshold
    ):
        with pytest.raises(ValueError, match="No such collection"):
            apply_or_start(
                store,
                BatchSelection.of_ids(ids),
                BatchOperation(OPERATION_ADD_TO_COLLECTION, 4242),
            )
        assert store.list_all() == []


@pytest.mark.unit
class TestAQuerySelection:
    def test_a_query_is_resolved_before_the_job_and_not_again(
        self, library, store, ids, low_threshold
    ):
        """DEC-045 crosses the wire as a description; DEC-063 fixes it once.

        The library grows while the job runs, and the job's answer does not.
        """
        techno = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        )
        result, job = apply_or_start(
            store,
            BatchSelection.matching(techno),
            BatchOperation(OPERATION_SET_RATING, 2),
        )
        assert result is None
        library.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id="late",
                    file_path="/music/late.mp3",
                    title="Arrived late",
                    artist="Latecomer",
                    genre="Techno",
                )
            ]
        )
        wait_for_terminal(job)
        assert job.result["total"] == TRACK_COUNT // 2
        assert job.result["changed"] == TRACK_COUNT // 2


@pytest.mark.unit
class TestTheJob:
    def test_it_reports_what_it_did(self, library, store, ids):
        job = Job(id="batch-1", type=JOB_TYPE_LIBRARY_BATCH)
        run_batch_job(job, store, ids, BatchOperation(OPERATION_SET_RATING, 4))

        assert job.state is JobState.SUCCEEDED
        assert job.result["operation"] == OPERATION_SET_RATING
        assert job.result["total"] == TRACK_COUNT
        assert job.result["changed"] == TRACK_COUNT
        assert job.result["cancelled"] is False
        assert job.error is None

    def test_it_reports_progress_the_status_strip_can_read(
        self, library, store, ids, monkeypatch
    ):
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 10)
        monkeypatch.setattr(batch_jobs, "_PROGRESS_REPORT_INTERVAL_SECONDS", 0.0)
        seen = []
        original = store.report_progress

        def spy(job, progress: ProgressInfo):
            seen.append((progress.completed_tracks, progress.total_tracks))
            original(job, progress)

        monkeypatch.setattr(store, "report_progress", spy)

        job = Job(id="batch-2", type=JOB_TYPE_LIBRARY_BATCH)
        run_batch_job(job, store, ids, BatchOperation(OPERATION_SET_RATING, 4))

        assert seen[0] == (0, TRACK_COUNT)
        assert seen[-1] == (TRACK_COUNT, TRACK_COUNT)
        assert job.progress.status_message == "Rating tracks"

    def test_the_bar_reaches_its_total_however_slow_the_sampler_is(
        self, library, store, ids, monkeypatch
    ):
        """The throttle drops ticks; it may not drop the last one.

        Progress is sampled because a tick takes the store's lock and wakes the
        SSE stream. A sampler with no exception for the final tick leaves the
        bar stopped wherever it last fired, which reads as a job that stalled
        and finished anyway. The interval here is a minute, so *every* tick but
        the first and the last is dropped.
        """
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 10)
        monkeypatch.setattr(batch_jobs, "_PROGRESS_REPORT_INTERVAL_SECONDS", 60.0)
        seen = []
        original = store.report_progress

        def spy(job, progress: ProgressInfo):
            seen.append((progress.completed_tracks, progress.total_tracks))
            original(job, progress)

        monkeypatch.setattr(store, "report_progress", spy)

        job = Job(id="batch-8", type=JOB_TYPE_LIBRARY_BATCH)
        run_batch_job(job, store, ids, BatchOperation(OPERATION_SET_RATING, 4))

        assert seen == [(0, TRACK_COUNT), (TRACK_COUNT, TRACK_COUNT)]
        assert job.progress.completed_tracks == TRACK_COUNT

    def test_the_verb_is_the_operations_own(self, library, store, ids, monkeypatch):
        monkeypatch.setattr(batch_jobs, "_PROGRESS_REPORT_INTERVAL_SECONDS", 0.0)
        from cuepoint.services.interfaces import ITagService

        tag = get_container().resolve(ITagService).create_or_get("Peak time")
        job = Job(id="batch-3", type=JOB_TYPE_LIBRARY_BATCH)
        run_batch_job(job, store, ids, BatchOperation(OPERATION_ADD_TAG, tag.id))
        assert job.progress.status_message == "Tagging tracks"

    def test_a_failure_carries_a_code_a_caller_can_act_on(
        self, library, store, ids, monkeypatch
    ):
        class Broken:
            def apply_batch(self, *args, **kwargs):
                raise CuePointException(
                    message="the library is locked", error_code="DB_LOCKED"
                )

        monkeypatch.setattr(batch_jobs, "_batch_service", lambda: Broken())
        job = Job(id="batch-4", type=JOB_TYPE_LIBRARY_BATCH)
        run_batch_job(job, store, ids, BatchOperation(OPERATION_SET_RATING, 4))

        assert job.state is JobState.FAILED
        assert job.error == {"code": "DB_LOCKED", "message": "the library is locked"}

    def test_an_unexpected_failure_is_still_a_failed_job(
        self, library, store, ids, monkeypatch
    ):
        class Broken:
            def apply_batch(self, *args, **kwargs):
                raise RuntimeError("something nobody predicted")

        monkeypatch.setattr(batch_jobs, "_batch_service", lambda: Broken())
        job = Job(id="batch-5", type=JOB_TYPE_LIBRARY_BATCH)
        run_batch_job(job, store, ids, BatchOperation(OPERATION_SET_RATING, 4))

        assert job.state is JobState.FAILED
        assert job.error["code"] == "LIBRARY_BATCH_FAILED"


@pytest.mark.unit
class TestCancellingTheJob:
    def test_a_cancel_stops_it_and_it_still_says_what_it_did(
        self, library, store, ids, monkeypatch
    ):
        """Cancelled *and* answered.

        The cancel is requested from inside a progress tick, so the run is
        deterministic rather than a race against a background thread — and it
        is the real service doing the work either way.
        """
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 10)
        monkeypatch.setattr(batch_jobs, "_PROGRESS_REPORT_INTERVAL_SECONDS", 0.0)
        job = Job(id="batch-6", type=JOB_TYPE_LIBRARY_BATCH)
        original = store.report_progress

        def cancel_after_two_chunks(reported, progress: ProgressInfo):
            original(reported, progress)
            if progress.completed_tracks >= 20:
                reported.cancel_requested = True

        monkeypatch.setattr(store, "report_progress", cancel_after_two_chunks)
        run_batch_job(job, store, ids, BatchOperation(OPERATION_SET_RATING, 4))

        assert job.state is JobState.CANCELLED
        assert job.error["code"] == "JOB_CANCELLED"
        assert "20 of 40" in job.error["message"]
        assert job.result["changed"] == 20
        assert job.result["cancelled"] is True
        # What it applied is applied (DEC-063).
        assert len(rated(library)) == 20

    def test_a_cancel_before_it_starts_leaves_the_library_alone(
        self, library, store, ids
    ):
        job = Job(id="batch-7", type=JOB_TYPE_LIBRARY_BATCH)
        job.cancel_requested = True
        run_batch_job(job, store, ids, BatchOperation(OPERATION_SET_RATING, 4))

        assert job.state is JobState.CANCELLED
        assert job.result["changed"] == 0
        assert rated(library) == {}


@pytest.mark.unit
class TestOneLibraryOperationAtATime:
    def test_a_batch_is_one_of_the_library_jobs(self):
        assert JOB_TYPE_LIBRARY_BATCH in LIBRARY_JOB_TYPES

    def test_a_second_batch_is_refused_while_one_runs(self, library, store, ids):
        held = store.create_job(
            job_type=JOB_TYPE_LIBRARY_BATCH, runner=lambda job: time.sleep(0.5)
        )
        with pytest.raises(JobTypeBusyError) as refused:
            start_batch_job(store, ids, BatchOperation(OPERATION_SET_RATING, 4))
        assert refused.value.job_id == held.id
        wait_for_terminal(held)

    def test_a_batch_is_refused_while_an_import_runs(self, library, store, ids):
        held = store.create_job(
            job_type=JOB_TYPE_LIBRARY_IMPORT, runner=lambda job: time.sleep(0.5)
        )
        with pytest.raises(JobTypeBusyError) as refused:
            start_batch_job(store, ids, BatchOperation(OPERATION_SET_RATING, 4))
        assert refused.value.job_type == JOB_TYPE_LIBRARY_IMPORT
        wait_for_terminal(held)

    def test_an_import_is_refused_while_a_batch_runs(self, library, store, tmp_path):
        """The exclusion goes both ways, which is the half that is easy to
        forget: a refresh deleting tracks under a running batch turns its
        counts into a report of who won a race."""
        from cuepoint.engine.library_jobs import start_library_import_job

        held = store.create_job(
            job_type=JOB_TYPE_LIBRARY_BATCH, runner=lambda job: time.sleep(0.5)
        )
        with pytest.raises(JobTypeBusyError) as refused:
            start_library_import_job(store, str(tmp_path / "collection.xml"))
        assert refused.value.job_type == JOB_TYPE_LIBRARY_BATCH
        wait_for_terminal(held)

    def test_a_started_job_runs_the_work(self, library, store, ids):
        job = start_batch_job(store, ids, BatchOperation(OPERATION_SET_RATING, 5))
        wait_for_terminal(job)
        assert job.state is JobState.SUCCEEDED
        assert len(rated(library)) == TRACK_COUNT
