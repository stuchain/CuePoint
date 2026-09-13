#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A match over library tracks as a background job (CLEAN-03, DEC-065).

The service decides what a match does; these tests are about where it runs and
what a user following it is told:

- **Refusals are refusals.** A selection naming nothing, or only tracks already
  matched, is an error before any job exists.
- **One match at a time**, a refusal naming the job in the way, and the one-way
  conflict with a refresh: a match will not start while a refresh applies, and
  a refresh may start while a match runs, deleting tracks it then skips.
- **Every ending is an answer.** Cancelled, stopped for lack of search results,
  or stopped by a database that will not store — each terminal state carries
  the counts, or the code that says what to do next.
- **Resumption is offered, never assumed**, and happens once per interruption.
- **The acceptance criterion**: a 1,000-track scope over a stubbed matcher runs,
  cancels, resumes and completes with exactly one attempt per track, while the
  engine keeps answering browse requests.
"""

from __future__ import annotations

import json
import socket
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from collections import Counter
from typing import List

import pytest

import cuepoint.engine.jobs as jobs_module
import cuepoint.services.match_service as match_service_module
from cuepoint.engine import server as server_module
from cuepoint.engine.jobs import Job, JobState, JobStore, JobTypeBusyError
from cuepoint.engine.library_refresh import (
    JOB_TYPE_LIBRARY_REFRESH_APPLY,
    LIBRARY_JOB_TYPES,
)
from cuepoint.engine.match_jobs import (
    JOB_TYPE_CLEAN_MATCH,
    offer_interrupted_matches,
    resume_match_job,
    start_match_job,
)
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.job_repository import JobRecord
from cuepoint.persistence.match_job_repository import MatchJobRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.interfaces import (
    IActivityService,
    IConfigService,
    IDatabaseService,
    IJobRepository,
    IMatchService,
    IMigrationRunner,
    IProcessorService,
    ITrackRepository,
)
from cuepoint.services.match_service import EVENT_MATCH_INTERRUPTED, MatchDraft
from cuepoint.utils.di_container import get_container, reset_container

NOW = "2026-09-13T12:00:00+00:00"
TOKEN = "clean-match-token"


# --------------------------------------------------------------------- the stub


def found(idx: int, track: Track) -> TrackResult:
    best = BeatportCandidate(
        url=f"https://www.beatport.com/track/stub/{idx}",
        title=track.title,
        artists=track.artist,
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=97.0,
        title_sim=100,
        artist_sim=100,
        query_index=1,
        query_text="stub",
        candidate_index=1,
        base_score=97.0,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=True,
        release_year=None,
        release_name=None,
    )
    return TrackResult(
        playlist_index=idx,
        title=track.title,
        artist=track.artist,
        matched=True,
        best_match=best,
        candidates=[best],
        match_score=97.0,
    )


def empty(idx: int, track: Track) -> TrackResult:
    return TrackResult(
        playlist_index=idx, title=track.title, artist=track.artist, matched=False
    )


class StubProcessor:
    """``process_track`` with a gate a test can close, and no network."""

    def __init__(self) -> None:
        self.respond = found
        self.delay = 0.0
        self.gate = threading.Event()
        self.gate.set()
        self.calls: List[str] = []
        self._lock = threading.Lock()

    def process_track(self, idx: int, track: Track, settings=None) -> TrackResult:
        with self._lock:
            self.calls.append(str(track.track_id))
        self.gate.wait(20)
        if self.delay:
            time.sleep(self.delay)
        return self.respond(idx, track)

    def asked(self) -> int:
        with self._lock:
            return len(self.calls)


# --------------------------------------------------------------------- fixtures


@pytest.fixture
def container(tmp_path, monkeypatch):
    from cuepoint.services.bootstrap import bootstrap_services

    monkeypatch.setattr(
        database_service_module,
        "default_database_path",
        lambda: tmp_path / "cuepoint.db",
    )
    # The container is bootstrapped here; the job runner must not bootstrap a
    # second one over the stub below.
    monkeypatch.setattr(jobs_module, "_services_bootstrapped", True)
    reset_container()
    bootstrap_services()
    get_container().resolve(IMigrationRunner).migrate()
    yield get_container()
    reset_container()


@pytest.fixture
def processor(container) -> StubProcessor:
    stub = StubProcessor()
    container.register_singleton(IProcessorService, stub)
    container.resolve(IConfigService).set("TRACK_WORKERS", 1)
    return stub


@pytest.fixture
def store() -> JobStore:
    return JobStore()


def add_tracks(container, count: int) -> List[int]:
    tracks = container.resolve(ITrackRepository)
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/music/{i:04d}.mp3",
                title=f"Track {i:04d}",
                artist=f"Artist {i % 7}",
            )
            for i in range(1, count + 1)
        ]
    )
    return tracks.browse_ids(BrowseQuery(sort="title"), limit=50_000)


@pytest.fixture
def ids(container) -> List[int]:
    return add_tracks(container, 20)


def wait_for(predicate, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.005)
    raise AssertionError("timed out waiting")


def finished(job: Job, timeout: float = 60.0) -> Job:
    wait_for(
        lambda: job.state in (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED),
        timeout,
    )
    return job


def attempt_tracks(container) -> Counter:
    rows = (
        container.resolve(IDatabaseService)
        .connect()
        .execute("SELECT track_id FROM match_attempts")
    )
    return Counter(int(row["track_id"]) for row in rows)


def done_tracks(container) -> Counter:
    rows = (
        container.resolve(IDatabaseService)
        .connect()
        .execute("SELECT track_id FROM match_job_tracks WHERE done = 1")
    )
    return Counter(int(row["track_id"]) for row in rows)


# ------------------------------------------------------------------- starting


class TestStarting:
    def test_a_match_runs_as_a_job_and_answers_with_its_counts(
        self, container, store, processor, ids
    ):
        started = start_match_job(store, BatchSelection.of_ids(ids[:10]))

        job = finished(started.job)

        assert started.to_dict() == {
            "job_id": job.id,
            "selected": 10,
            "excluded": 0,
            "planned": 10,
            "resumed_from": None,
        }
        assert (job.type, job.state) == (JOB_TYPE_CLEAN_MATCH, JobState.SUCCEEDED)
        assert job.result["completed"] == job.result["matched"] == 10
        assert job.progress.completed_tracks == job.progress.total_tracks == 10
        assert job.progress.eta_seconds is None
        assert job.progress.status_message.startswith("Beatport match: 10 of 10 tracks")
        assert attempt_tracks(container) == Counter(ids[:10])

    def test_a_query_selection_is_resolved_once_at_the_start(
        self, container, store, processor, ids
    ):
        started = start_match_job(
            store, BatchSelection.matching(BrowseQuery(query="Artist 3"))
        )
        finished(started.job)
        assert started.planned == 3
        assert sum(attempt_tracks(container).values()) == 3

    def test_already_matched_tracks_are_left_out_and_the_count_says_so(
        self, container, store, processor, ids
    ):
        finished(start_match_job(store, BatchSelection.of_ids(ids[:4])).job)

        again = start_match_job(store, BatchSelection.of_ids(ids[:6]))
        finished(again.job)

        assert (again.selected, again.excluded, again.planned) == (6, 4, 2)
        assert again.job.result["excluded"] == 4

    def test_a_rematch_asks_again(self, container, store, processor, ids):
        finished(start_match_job(store, BatchSelection.of_ids(ids[:4])).job)
        again = start_match_job(store, BatchSelection.of_ids(ids[:4]), rematch=True)
        finished(again.job)
        assert again.job.result["rematch"] is True
        assert attempt_tracks(container) == Counter(ids[:4] * 2)

    @pytest.mark.parametrize("selection", [[], [99_999]])
    def test_a_selection_naming_nothing_is_refused_before_any_job(
        self, store, processor, ids, selection
    ):
        with pytest.raises(ValueError, match="names no tracks"):
            start_match_job(store, BatchSelection.of_ids(selection))
        assert store.list_all() == []

    def test_a_selection_of_only_matched_tracks_is_refused_before_any_job(
        self, store, processor, ids
    ):
        finished(start_match_job(store, BatchSelection.of_ids(ids[:2])).job)
        with pytest.raises(ValueError, match="Re-match them"):
            start_match_job(store, BatchSelection.of_ids(ids[:2]))
        assert len(store.list_all()) == 1


class TestOneAtATime:
    def test_a_second_match_job_is_refused_with_the_running_jobs_id(
        self, store, processor, ids
    ):
        processor.gate.clear()
        first = start_match_job(store, BatchSelection.of_ids(ids[:3]))
        try:
            with pytest.raises(JobTypeBusyError) as refused:
                start_match_job(store, BatchSelection.of_ids(ids[3:6]))
            assert refused.value.job_id == first.job.id
            assert refused.value.job_type == JOB_TYPE_CLEAN_MATCH
        finally:
            processor.gate.set()
        finished(first.job)

    def test_a_match_does_not_start_while_a_refresh_applies(
        self, store, processor, ids
    ):
        applying = threading.Event()
        refresh = store.create_job(
            job_type=JOB_TYPE_LIBRARY_REFRESH_APPLY,
            runner=lambda job: applying.wait(20),
            exclusive=True,
            conflicts_with=LIBRARY_JOB_TYPES,
        )
        try:
            with pytest.raises(JobTypeBusyError) as refused:
                start_match_job(store, BatchSelection.of_ids(ids[:3]))
            assert refused.value.job_id == refresh.id
        finally:
            applying.set()
        finished(refresh)

    def test_a_refresh_may_start_while_a_match_runs_and_its_deletions_are_skipped(
        self, container, store, processor, ids
    ):
        processor.gate.clear()
        match = start_match_job(store, BatchSelection.of_ids(ids[:5]))
        wait_for(lambda: processor.asked() == 1)

        def apply_refresh(job: Job) -> None:
            container.resolve(ITrackRepository).delete(ids[3])

        refresh = store.create_job(
            job_type=JOB_TYPE_LIBRARY_REFRESH_APPLY,
            runner=apply_refresh,
            exclusive=True,
            conflicts_with=LIBRARY_JOB_TYPES,
        )
        finished(refresh)
        processor.gate.set()
        job = finished(match.job)

        assert refresh.state == JobState.SUCCEEDED
        assert job.state == JobState.SUCCEEDED
        assert (job.result["skipped"], job.result["matched"]) == (1, 4)


# ------------------------------------------------------------ how a job ends


class TestEndings:
    def test_a_cancelled_match_is_cancelled_and_still_answers(
        self, container, store, processor, ids
    ):
        processor.delay = 0.05
        started = start_match_job(store, BatchSelection.of_ids(ids))
        wait_for(lambda: processor.asked() >= 5)
        store.request_cancel(started.job.id)

        job = finished(started.job)

        assert job.state == JobState.CANCELLED
        assert job.error["code"] == "JOB_CANCELLED"
        assert job.result["cancelled"] is True
        remaining = job.result["remaining"]
        assert remaining > 0
        assert f"cancelled, {remaining} left to resume" in job.error["message"]
        assert attempt_tracks(container) == done_tracks(container)

    def test_empty_searches_fail_the_job_with_a_code_that_says_why(
        self, container, store, processor, monkeypatch, ids
    ):
        monkeypatch.setattr(match_service_module, "SEARCH_OUTAGE_STREAK", 3)
        processor.respond = empty

        job = finished(start_match_job(store, BatchSelection.of_ids(ids)).job)

        assert job.state == JobState.FAILED
        assert job.error["code"] == "MATCH_SEARCH_UNAVAILABLE"
        assert job.result["search_unavailable"] is True
        assert job.result["remaining"] == 20

    def test_a_database_that_will_not_store_fails_the_job_and_keeps_the_plan(
        self, container, store, processor, monkeypatch, ids
    ):
        def broken(self, *args, **kwargs):
            raise sqlite3.OperationalError("attempt to write a readonly database")

        monkeypatch.setattr(MatchRepository, "add_attempt", broken)

        job = finished(start_match_job(store, BatchSelection.of_ids(ids[:4])).job)

        assert job.state == JobState.FAILED
        assert job.error["code"] == "MATCH_STORAGE_FAILED"
        assert "readonly" in job.error["message"]
        assert container.resolve(IMatchService).check_resumable(job.id).remaining == 4

    def test_anything_else_fails_the_job_rather_than_leaving_it_running(
        self, store, processor, monkeypatch, ids
    ):
        def exploding(self, *args, **kwargs):
            raise RuntimeError("the plan could not be written")

        monkeypatch.setattr(MatchJobRepository, "create", exploding)

        job = finished(start_match_job(store, BatchSelection.of_ids(ids[:4])).job)

        assert job.state == JobState.FAILED
        assert job.error == {
            "code": "CLEAN_MATCH_FAILED",
            "message": "the plan could not be written",
        }


# ------------------------------------------------------------------- resuming


class TestResuming:
    def test_a_cancelled_match_resumes_and_matches_nothing_twice(
        self, container, store, processor, ids
    ):
        processor.delay = 0.05
        started = start_match_job(store, BatchSelection.of_ids(ids))
        wait_for(lambda: processor.asked() >= 7)
        store.request_cancel(started.job.id)
        first = finished(started.job)
        processor.delay = 0.0
        left = first.result["remaining"]

        resumed = resume_match_job(store, first.id)
        job = finished(resumed.job)

        assert (resumed.resumed_from, resumed.planned) == (first.id, left)
        assert job.state == JobState.SUCCEEDED
        assert job.result["resumed_from"] == first.id
        assert job.result["completed"] == left
        assert attempt_tracks(container) == Counter(ids)
        assert Counter(processor.calls) == Counter(str(t) for t in ids)
        assert container.resolve(IMatchService).resumable() == []

    def test_an_unknown_job_cannot_be_resumed(self, store, processor):
        with pytest.raises(LookupError):
            resume_match_job(store, "nobody")

    def test_a_finished_job_has_nothing_to_resume(self, store, processor, ids):
        job = finished(start_match_job(store, BatchSelection.of_ids(ids[:2])).job)
        with pytest.raises(ValueError, match="nothing left"):
            resume_match_job(store, job.id)

    def test_a_job_still_finishing_cannot_be_resumed_beside_itself(
        self, store, processor, ids
    ):
        processor.gate.clear()
        started = start_match_job(store, BatchSelection.of_ids(ids[:5]))
        wait_for(lambda: processor.asked() == 1)
        store.request_cancel(started.job.id)
        try:
            with pytest.raises(JobTypeBusyError) as refused:
                resume_match_job(store, started.job.id)
            assert refused.value.job_id == started.job.id
        finally:
            processor.gate.set()
        finished(started.job)


class TestOfferedAfterARestart:
    @pytest.fixture
    def interrupted(self, container, ids):
        """A plan with five tracks waiting whose job record still says running."""
        container.resolve(IMatchService).write_plan(
            "gone", MatchDraft(track_ids=tuple(ids[:5]), selected=5, rematch=False)
        )
        container.resolve(IJobRepository).save(
            JobRecord(
                id="gone",
                type=JOB_TYPE_CLEAN_MATCH,
                state="running",
                demo=False,
                progress=None,
                error=None,
                created_at=NOW,
                updated_at=NOW,
            )
        )
        return "gone"

    def offers(self, container):
        return container.resolve(IActivityService).recent_events(
            event_type=EVENT_MATCH_INTERRUPTED
        )

    def test_an_interrupted_match_is_offered_for_resumption(
        self, container, interrupted
    ):
        assert offer_interrupted_matches() == 1

        (offer,) = self.offers(container)
        assert offer.summary == (
            "A Beatport match stopped when CuePoint closed, with 5 of 5 tracks"
            " left. It can be resumed."
        )
        assert offer.detail == {
            "job_id": "gone",
            "remaining": 5,
            "planned": 5,
            "rematch": False,
        }

    def test_the_engine_offers_it_once_and_resumes_nothing(
        self, container, processor, interrupted
    ):
        assert server_module._resolve_job_repository() is not None
        assert server_module._resolve_job_repository() is not None

        assert len(self.offers(container)) == 1
        record = container.resolve(IJobRepository).get("gone")
        assert (record.state, record.error["code"]) == ("failed", "JOB_INTERRUPTED")
        assert processor.calls == []
        assert container.resolve(IMatchService).check_resumable("gone").remaining == 5

    def test_it_can_then_be_resumed(self, container, store, processor, interrupted):
        server_module._resolve_job_repository()
        job = finished(resume_match_job(store, "gone").job)
        assert job.state == JobState.SUCCEEDED
        assert sum(attempt_tracks(container).values()) == 5


# ---------------------------------------------------------- acceptance criteria


class TestAThousandTracks:
    def test_it_runs_cancels_resumes_and_completes_with_one_attempt_per_track(
        self, container, store, processor
    ):
        ids = add_tracks(container, 1_000)
        container.resolve(IConfigService).set("TRACK_WORKERS", 8)
        processor.delay = 0.002

        started = start_match_job(
            store, BatchSelection.matching(BrowseQuery(sort="title"))
        )
        assert started.planned == 1_000
        wait_for(lambda: processor.asked() >= 300)
        store.request_cancel(started.job.id)
        first = finished(started.job)

        assert first.state == JobState.CANCELLED
        assert 300 <= first.result["completed"] < 1_000
        assert attempt_tracks(container) == done_tracks(container)

        resumed = finished(resume_match_job(store, first.id).job, timeout=120)

        assert resumed.state == JobState.SUCCEEDED
        assert first.result["completed"] + resumed.result["completed"] == 1_000
        assert attempt_tracks(container) == Counter(ids)
        assert done_tracks(container) == Counter(ids)
        assert container.resolve(IMatchService).resumable() == []

    def test_the_engine_answers_browse_requests_while_it_runs(
        self, container, store, processor
    ):
        add_tracks(container, 1_000)
        container.resolve(IConfigService).set("TRACK_WORKERS", 8)
        processor.delay = 0.02

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            port = int(sock.getsockname()[1])
        server, thread = start_engine_thread(
            EngineConfig(host="127.0.0.1", port=port, token=TOKEN), store=store
        )
        try:
            started = start_match_job(
                store, BatchSelection.matching(BrowseQuery(sort="title"))
            )
            wait_for(lambda: processor.asked() >= 8)

            answered_while_running = 0
            slowest = 0.0
            query = urllib.parse.urlencode({"q": "Track 09", "limit": 50})
            url = f"http://127.0.0.1:{port}/api/v1/library/search?{query}"
            while started.job.state == JobState.RUNNING:
                request = urllib.request.Request(
                    url, headers={"Authorization": f"Bearer {TOKEN}"}
                )
                began = time.monotonic()
                with urllib.request.urlopen(request, timeout=5) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                slowest = max(slowest, time.monotonic() - began)
                assert payload["total"] == 100
                if started.job.state == JobState.RUNNING:
                    answered_while_running += 1

            job = finished(started.job, timeout=120)
        finally:
            server.shutdown()
            thread.join(timeout=5)

        assert job.state == JobState.SUCCEEDED
        assert answered_while_running >= 10
        assert slowest < 1.0, f"a browse request took {slowest:.2f} s during a match"
