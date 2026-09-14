#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reverting a batch inline or as a job, through the real container (CLEAN-06).

The specification's scale case: a 5,000-change batch reverts as a job under a
new batch id, and reverting that batch restores the original. A revert above
DEC-063's threshold is a ``library_batch`` job, so it takes the batch edit's
place in the status strip and its exclusivity with the import and the refresh.
"""

from __future__ import annotations

import time
from typing import Dict, List

import pytest

from cuepoint.engine import batch_jobs
from cuepoint.engine.batch_jobs import (
    JOB_TYPE_LIBRARY_BATCH,
    apply_or_start,
    revert_or_start,
)
from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import (
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_SET_RATING,
    BatchOperation,
    BatchSelection,
)
from cuepoint.services.interfaces import (
    IActivityService,
    ICollectionService,
    IDatabaseService,
    IMetadataService,
    IMigrationRunner,
    ITrackRepository,
)
from cuepoint.services.revert_service import (
    EVENT_BATCH_REVERTED,
    MEMBERSHIP_REFUSAL,
    BatchRevert,
)
from cuepoint.utils.di_container import get_container, reset_container

TRACKS = 5_000


@pytest.fixture
def library(tmp_path, monkeypatch) -> Dict[str, List[int]]:
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    reset_container()
    bootstrap_services()
    container = get_container()
    container.resolve(IMigrationRunner).migrate()
    tracks = container.resolve(ITrackRepository)
    tracks.add_many(
        [
            LibraryTrack(rekordbox_track_id=str(i), title=f"Track {i:05d}", artist="A")
            for i in range(1, TRACKS + 1)
        ]
    )
    yield {"all": tracks.browse_ids(BrowseQuery(sort="title"), limit=TRACKS)}
    reset_container()


@pytest.fixture
def store() -> JobStore:
    return JobStore()


def finished(job: Job, timeout: float = 120.0) -> Job:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if job.state in (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job did not finish; state={job.state}")


def ratings(track_ids: List[int]) -> set:
    metadata = get_container().resolve(IMetadataService)
    found = metadata.get_many(track_ids)
    return {found[t].rating if t in found else None for t in track_ids}


def written(batch_id: str) -> int:
    connection = get_container().resolve(IDatabaseService).connect()
    return int(
        connection.execute(
            "SELECT count(*) FROM track_history WHERE batch_id = ?", (batch_id,)
        ).fetchone()[0]
    )


class TestAFiveThousandChangeBatch:
    @pytest.fixture
    def rated(self, library, store) -> str:
        _, job = apply_or_start(
            store,
            BatchSelection.matching(BrowseQuery()),
            BatchOperation(OPERATION_SET_RATING, 4),
        )
        assert job is not None
        assert finished(job).state == JobState.SUCCEEDED
        return job.result["batch_id"]

    def test_it_reverts_as_a_job_and_reverting_that_restores_the_original(
        self, library, store, rated
    ):
        assert written(rated) == TRACKS

        result, job = revert_or_start(store, rated)

        assert result is None and job is not None
        assert job.type == JOB_TYPE_LIBRARY_BATCH
        finished(job)
        assert job.state == JobState.SUCCEEDED
        assert job.progress.status_message == "Reverting changes"
        assert (job.progress.completed_tracks, job.progress.total_tracks) == (
            TRACKS,
            TRACKS,
        )
        undone = job.result
        assert (undone["total"], undone["changed"], undone["skipped"]) == (
            TRACKS,
            TRACKS,
            0,
        )
        assert undone["batch_id"] != rated and undone["revert_of"] == rated
        assert written(undone["batch_id"]) == TRACKS
        assert ratings(library["all"]) == {None}

        _, again = revert_or_start(store, undone["batch_id"])
        assert again is not None and finished(again).state == JobState.SUCCEEDED

        assert ratings(library["all"]) == {4}
        feed = get_container().resolve(IActivityService)
        summaries = [
            e.summary for e in feed.recent_events(event_type=EVENT_BATCH_REVERTED)
        ]
        assert len(summaries) == 2
        # The quoted sentence is ORG-07's own, which does not group digits.
        assert summaries[-1] == "Reverted 5,000 changes of “Rated 5000 tracks 4 stars”"

    def test_at_the_threshold_it_reverts_inline(self, library, store, monkeypatch):
        monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 10)
        applied, _ = apply_or_start(
            store,
            BatchSelection.of_ids(library["all"][:10]),
            BatchOperation(OPERATION_SET_RATING, 2),
        )

        result, job = revert_or_start(store, applied.batch_id)

        assert job is None and isinstance(result, BatchRevert)
        assert result.reverted == 10
        assert ratings(library["all"][:10]) == {None}

    def test_a_revert_job_waits_its_turn_behind_another_library_job(
        self, library, store, rated, monkeypatch
    ):
        from cuepoint.engine.jobs import JobTypeBusyError

        monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 10)
        _, first = revert_or_start(store, rated)
        try:
            with pytest.raises(JobTypeBusyError):
                apply_or_start(
                    store,
                    BatchSelection.matching(BrowseQuery()),
                    BatchOperation(OPERATION_SET_RATING, 1),
                )
        finally:
            finished(first)


class TestWhatIsRefusedBeforeAJob:
    def test_a_membership_batch(self, library, store):
        collections = get_container().resolve(ICollectionService)
        node = collections.create_collection("Set")
        applied, _ = apply_or_start(
            store,
            BatchSelection.of_ids(library["all"][:5]),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, node.id),
        )

        with pytest.raises(ValueError) as refused:
            revert_or_start(store, applied.batch_id)

        assert str(refused.value) == MEMBERSHIP_REFUSAL
        # The five-track add ran inline, so any job here is the refusal's.
        assert store.list_all() == []

    def test_an_unknown_batch(self, library, store):
        with pytest.raises(ValueError, match="No such batch"):
            revert_or_start(store, "not-a-batch")


class TestAFailedRevertJob:
    def test_its_error_is_reported_with_the_revert_code(
        self, library, store, monkeypatch
    ):
        monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 1)
        applied, _ = apply_or_start(
            store,
            BatchSelection.of_ids(library["all"][:1]),
            BatchOperation(OPERATION_SET_RATING, 3),
        )
        batch_id = (applied.batch_id if applied else None) or ""
        if not batch_id:
            pytest.skip("the batch ran as a job")
        service = batch_jobs._revert_service()

        def broken(*_args, **_kwargs):
            raise RuntimeError("the disk said no")

        monkeypatch.setattr(service, "revert_batch", broken)
        monkeypatch.setattr(batch_jobs, "_revert_service", lambda: service)
        job = batch_jobs.start_revert_job(store, batch_id)

        finished(job)

        assert job.state == JobState.FAILED
        assert job.error == {
            "code": "LIBRARY_REVERT_FAILED",
            "message": "the disk said no",
        }
