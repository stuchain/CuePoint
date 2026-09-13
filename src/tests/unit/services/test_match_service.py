#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Matching a library scope, resumably (CLEAN-03, DEC-065).

Beatport is never reached: ``process_track`` is a stub that answers by title,
and everything else — the database, the batch resolver, the attempt store, the
activity feed — is the real thing, bootstrapped over a temporary library.

The step's risk is stated in the specification as a wrong transaction boundary
costing a user an afternoon of Beatport time. The tests are aimed at exactly
the ways that happens:

- **A plan that covers the wrong tracks** — a duplicate matched twice, a query
  and an id selection disagreeing, a settled track asked again, or a track that
  only *failed* last time left out for good.
- **Progress that is not what is stored.** Every test that stops a job checks
  that stored attempts and done rows agree, and that a resume matches nothing
  twice.
- **An outage recorded as an answer.** Empty searches stop the job and put the
  tracks back, so a resume asks them again.
- **A write that half-happens.** An attempt, its plan row and its state commit
  together; a lock is waited out; a database that refuses stops the job.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections import Counter
from typing import Callable, List, Optional

import pytest

import cuepoint.services.match_service as match_service_module
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.config import SETTINGS
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    OUTCOME_MATCHED,
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    STATE_NO_MATCH,
    STATE_REJECTED,
    MatchAttempt,
    TrackMatch,
)
from cuepoint.models.rekordbox_playlist import KIND_PLAYLIST, RekordboxPlaylist
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import BatchSelection
from cuepoint.services.interfaces import (
    IActivityService,
    IBatchService,
    ICollectionService,
    IConfigService,
    IDatabaseService,
    IMatchJobRepository,
    IMatchRepository,
    IMatchService,
    IMigrationRunner,
    IPlaylistRepository,
    IProcessorService,
    ITrackRepository,
)
from cuepoint.services.match_service import (
    EVENT_MATCH_FINISHED,
    MatchDraft,
    MatchJobResult,
    MatchService,
    MatchStorageError,
    describe,
    describe_interrupted,
)
from cuepoint.utils.di_container import get_container, reset_container

NOW = "2026-09-13T12:00:00+00:00"
TRACK_COUNT = 50


# --------------------------------------------------------------------- the stub


def candidate(number: int, score: float) -> BeatportCandidate:
    return BeatportCandidate(
        url=f"https://www.beatport.com/track/stub/{10_000 + number}",
        title=f"Stub {number}",
        artists="Stub Artist",
        label="Stub Label",
        release_date="2024-01-01",
        bpm="128",
        key="A min",
        genre="House",
        score=score,
        title_sim=88.5,
        artist_sim=100,
        query_index=1,
        query_text="stub",
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=5,
        is_winner=False,
        release_year=2024,
        release_name="Stub EP",
    )


def found(idx: int, track: Track) -> TrackResult:
    best = candidate(idx, 96.0)
    return TrackResult(
        playlist_index=idx,
        title=track.title,
        artist=track.artist,
        matched=True,
        best_match=best,
        candidates=[best, candidate(idx + 5_000, 50.0)],
        match_score=96.0,
        processing_time=0.01,
    )


def judged(idx: int, track: Track) -> TrackResult:
    return TrackResult(
        playlist_index=idx,
        title=track.title,
        artist=track.artist,
        matched=False,
        candidates=[candidate(idx, 30.0)],
        processing_time=0.01,
    )


def empty(idx: int, track: Track) -> TrackResult:
    return TrackResult(
        playlist_index=idx,
        title=track.title,
        artist=track.artist,
        matched=False,
        processing_time=0.01,
    )


class StubProcessor:
    """``process_track`` without a network: answers with ``respond``."""

    def __init__(self) -> None:
        self.respond: Callable[[int, Track], TrackResult] = found
        self.calls: List[tuple] = []
        self._lock = threading.Lock()

    def process_track(self, idx: int, track: Track, settings=None) -> TrackResult:
        with self._lock:
            self.calls.append((idx, track, settings))
        return self.respond(idx, track)

    @property
    def asked(self) -> List[str]:
        with self._lock:
            return [track.track_id for _, track, _ in self.calls]


# --------------------------------------------------------------------- fixtures


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


@pytest.fixture
def processor(container) -> StubProcessor:
    stub = StubProcessor()
    container.register_singleton(IProcessorService, stub)
    return stub


@pytest.fixture
def workers(container) -> Callable[[int], None]:
    def set_workers(count: int) -> None:
        container.resolve(IConfigService).set("TRACK_WORKERS", count)

    set_workers(1)
    return set_workers


@pytest.fixture
def service(container, processor, workers) -> MatchService:
    return container.resolve(IMatchService)


@pytest.fixture
def ids(container) -> List[int]:
    tracks = container.resolve(ITrackRepository)
    tracks.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/music/{i:03d}.mp3",
                title=f"Track {i:03d}",
                artist=f"Artist {i % 5}",
                key="Am",
                year=2020,
                genre="House" if i % 2 else "Techno",
            )
            for i in range(1, TRACK_COUNT + 1)
        ]
    )
    return tracks.browse_ids(BrowseQuery(sort="title"))


def db(container):
    return container.resolve(IDatabaseService).connect()


def attempts(container) -> List[dict]:
    return [
        dict(row)
        for row in db(container).execute(
            "SELECT id, track_id, job_id, outcome, input_json FROM match_attempts"
            " ORDER BY id"
        )
    ]


def plan_rows(container, job_id: str) -> List[tuple]:
    return [
        (int(r["position"]), int(r["track_id"]), int(r["done"]))
        for r in db(container).execute(
            "SELECT position, track_id, done FROM match_job_tracks"
            " WHERE job_id = ? ORDER BY position",
            (job_id,),
        )
    ]


def run(service, selection, job_id="job-1", rematch=False, **options):
    draft = service.prepare(selection, rematch)
    service.write_plan(job_id, draft)
    return service.run(job_id, **options)


def assert_stored_matches_done(container, job_ids) -> None:
    """Every done row has exactly one attempt from its job, and no other does."""
    done = Counter()
    for job_id in job_ids:
        for _, track_id, is_done in plan_rows(container, job_id):
            if is_done:
                done[(job_id, track_id)] += 1
    stored = Counter((a["job_id"], a["track_id"]) for a in attempts(container))
    assert stored == done


def with_rule(container, rule) -> MatchService:
    return MatchService(
        processor_service=container.resolve(IProcessorService),
        config_service=container.resolve(IConfigService),
        track_repository=container.resolve(ITrackRepository),
        match_repository=container.resolve(IMatchRepository),
        match_job_repository=container.resolve(IMatchJobRepository),
        batch_service=container.resolve(IBatchService),
        activity_service=container.resolve(IActivityService),
        database_service=container.resolve(IDatabaseService),
        state_rule=rule,
    )


def events(container) -> list:
    return container.resolve(IActivityService).recent_events(
        event_type=EVENT_MATCH_FINISHED
    )


# ------------------------------------------------------------------- the plan


class TestThePlan:
    def test_a_fifty_track_scope_stores_fifty_attempts_in_plan_order(
        self, container, service, ids
    ):
        result = run(service, BatchSelection.of_ids(ids))

        stored = attempts(container)
        assert [a["track_id"] for a in stored] == ids
        assert {a["job_id"] for a in stored} == {"job-1"}
        assert plan_rows(container, "job-1") == [(p, t, 1) for p, t in enumerate(ids)]
        assert (result.planned, result.completed, result.matched) == (50, 50, 50)

    def test_many_workers_store_one_attempt_per_track(
        self, container, service, workers, processor, ids
    ):
        workers(8)
        run(service, BatchSelection.of_ids(ids))

        assert Counter(a["track_id"] for a in attempts(container)) == Counter(ids)
        assert sorted(int(t) for t in processor.asked) == sorted(ids)
        assert_stored_matches_done(container, ["job-1"])

    def test_an_id_selection_and_the_equivalent_query_plan_the_same(
        self, container, service, ids
    ):
        query = BrowseQuery(sort="title", query="Artist 3")
        matching = container.resolve(ITrackRepository).browse_ids(query)

        by_query = service.prepare(BatchSelection.matching(query))
        by_ids = service.prepare(BatchSelection.of_ids(matching))

        assert by_query == by_ids
        assert list(by_query.track_ids) == matching
        assert by_query.planned == 10

    def test_a_query_selection_less_the_tracks_taken_back_out(self, service, ids):
        draft = service.prepare(
            BatchSelection.matching(BrowseQuery(sort="title"), exclude=ids[:5])
        )
        assert list(draft.track_ids) == ids[5:]

    def test_a_collection_holding_a_track_twice_matches_it_once(
        self, container, service, processor, ids
    ):
        collections = container.resolve(ICollectionService)
        crate = collections.create_collection("Twice")
        collections.add_tracks(int(crate.id), ids[:3])
        collections.insert_track(int(crate.id), ids[1], 0)
        assert len(collections.entries(int(crate.id))) == 4

        result = run(
            service, BatchSelection.matching(BrowseQuery(collection_id=int(crate.id)))
        )

        assert result.planned == 3
        assert sorted(int(t) for t in processor.asked) == sorted(ids[:3])

    def test_a_rekordbox_playlist_holding_a_track_twice_matches_it_once(
        self, container, service, processor, ids
    ):
        playlists = container.resolve(IPlaylistRepository)
        playlists.replace_tree(
            [
                RekordboxPlaylist(
                    name="set",
                    kind=KIND_PLAYLIST,
                    depth=0,
                    position=0,
                    rekordbox_path="set",
                    track_refs=["1", "2", "1", "3", "2"],
                )
            ]
        )
        playlist_id = int(playlists.list_all()[0].id)

        result = run(
            service, BatchSelection.matching(BrowseQuery(playlist_id=playlist_id))
        )

        assert result.planned == 3
        assert Counter(processor.asked) == Counter(str(t) for t in ids[:3])

    def test_an_id_selection_naming_a_track_twice_matches_it_once(
        self, service, processor, ids
    ):
        run(service, BatchSelection.of_ids([ids[0], ids[1], ids[0]]))
        assert Counter(processor.asked) == Counter([str(ids[0]), str(ids[1])])

    def test_ids_no_longer_in_the_library_are_not_covered(self, service, ids):
        draft = service.prepare(BatchSelection.of_ids([ids[0], 987_654, ids[1]]))
        assert (draft.track_ids, draft.selected) == ((ids[0], ids[1]), 2)

    @pytest.mark.parametrize("selection", [[], [987_654]])
    def test_a_selection_naming_no_library_track_is_refused(
        self, container, service, selection
    ):
        with pytest.raises(ValueError, match="names no tracks"):
            service.prepare(BatchSelection.of_ids(selection))
        assert (
            db(container).execute("SELECT count(*) FROM match_jobs").fetchone()[0] == 0
        )


class TestWhatIsLeftOut:
    @pytest.fixture
    def history(self, container, ids):
        """Track 0 decided, 1 matched, 2 judged, 3 only failed, 4 only empty."""
        matches = container.resolve(IMatchRepository)
        question = Track(title="q", artist="a")

        def store(track_id, result):
            return matches.add_attempt(track_id, "earlier", result, question)

        decided = store(ids[0], TrackResult(1, "q", "a", False, error="timeout"))
        matches.set_match(
            TrackMatch(
                track_id=ids[0],
                state=STATE_REJECTED,
                decided_by=DECIDED_BY_USER,
                attempt_id=decided.id,
                decided_at=NOW,
            )
        )
        store(ids[1], found(1, question))
        store(ids[2], judged(2, question))
        store(ids[3], TrackResult(1, "q", "a", False, error="Connection reset"))
        failed_again = store(ids[4], empty(4, question))
        matches.set_match(
            TrackMatch(
                track_id=ids[4],
                state=STATE_NO_MATCH,
                decided_by=DECIDED_BY_AUTO,
                attempt_id=failed_again.id,
                decided_at=NOW,
            )
        )
        return ids

    def test_decided_and_answered_tracks_are_skipped_and_the_count_says_so(
        self, service, processor, history
    ):
        draft = service.prepare(BatchSelection.of_ids(history[:10]))

        assert list(draft.track_ids) == history[3:10]
        assert (draft.selected, draft.excluded, draft.planned) == (10, 3, 7)
        result = run(service, BatchSelection.of_ids(history[:10]))
        assert (result.selected, result.excluded, result.planned) == (10, 3, 7)
        assert "(3 already matched, left out)" in describe(result)

    def test_a_track_that_only_failed_or_came_back_empty_is_asked_again(
        self, service, history
    ):
        draft = service.prepare(BatchSelection.of_ids(history[3:5]))
        assert list(draft.track_ids) == history[3:5]

    def test_a_rematch_leaves_nothing_out(self, service, history):
        draft = service.prepare(BatchSelection.of_ids(history[:10]), rematch=True)
        assert (draft.planned, draft.excluded, draft.rematch) == (10, 0, True)

    def test_a_selection_of_only_settled_tracks_is_refused(self, service, history):
        with pytest.raises(ValueError, match="already matched or decided"):
            service.prepare(BatchSelection.of_ids(history[:3]))


# -------------------------------------------------------------------- running


class TestRunning:
    def test_each_outcome_is_stored_and_counted(
        self, container, service, processor, ids
    ):
        def respond(idx, track):
            number = int(track.track_id)
            if number == ids[0]:
                raise ConnectionError("Beatport hung up")
            if number == ids[1]:
                return judged(idx, track)
            return found(idx, track)

        processor.respond = respond
        result = run(service, BatchSelection.of_ids(ids[:4]))

        outcomes = {a["track_id"]: a["outcome"] for a in attempts(container)}
        assert outcomes == {
            ids[0]: "error",
            ids[1]: "no_match",
            ids[2]: "matched",
            ids[3]: "matched",
        }
        assert (result.matched, result.no_match, result.errors) == (2, 1, 1)
        error = container.resolve(IMatchRepository).latest_attempt(ids[0])
        assert error.error == "Beatport hung up"

    def test_what_the_matcher_returns_that_is_not_a_result_is_an_error(
        self, container, service, processor, ids
    ):
        processor.respond = lambda idx, track: None
        result = run(service, BatchSelection.of_ids(ids[:1]))
        assert result.errors == 1
        stored = container.resolve(IMatchRepository).latest_attempt(ids[0])
        assert stored.outcome == "error"
        assert "process_track returned NoneType, not a TrackResult" == stored.error

    def test_the_matcher_is_asked_about_the_imported_values(
        self, container, service, processor, ids
    ):
        with container.resolve(IDatabaseService).transaction() as conn:
            conn.execute(
                "INSERT INTO track_metadata (track_id, key, year, created_at, updated_at)"
                " VALUES (?, 'F#m', 1999, ?, ?)",
                (ids[0], NOW, NOW),
            )

        run(service, BatchSelection.of_ids(ids[:1]))

        asked = processor.calls[0][1]
        assert (asked.key, asked.year, asked.track_id) == ("Am", 2020, str(ids[0]))
        stored = json.loads(attempts(container)[0]["input_json"])
        assert (stored["key"], stored["year"]) == ("Am", 2020)

    def test_it_uses_the_settings_the_xml_path_builds(
        self, container, service, processor, ids
    ):
        config = container.resolve(IConfigService)
        config.set("MIN_ACCEPT_SCORE", 81)

        run(service, BatchSelection.of_ids(ids[:2]))

        expected = {key: config.get(key, SETTINGS.get(key)) for key in SETTINGS}
        assert all(settings == expected for _, _, settings in processor.calls)
        assert processor.calls[0][2]["MIN_ACCEPT_SCORE"] == 81

    @pytest.mark.parametrize(
        "configured, cap, expected",
        [(12, None, 8), (12, 3, 3), (2, None, 2), (0, None, 1), (-4, None, 1)],
    )
    def test_as_many_workers_as_the_xml_path_would_use(
        self, container, service, configured, cap, expected
    ):
        if cap is not None:
            container.resolve(IConfigService).set("performance.max_workers", cap)
        assert service.track_workers({"TRACK_WORKERS": configured}) == expected

    def test_an_unreadable_worker_count_falls_back_to_the_configured_one(
        self, service, workers
    ):
        # The XML path's fallback is the configured value, not a constant.
        workers(5)
        assert service.track_workers({"TRACK_WORKERS": "many"}) == 5

    def test_with_nothing_readable_at_all_one_worker(self, service, monkeypatch):
        monkeypatch.setitem(SETTINGS, "TRACK_WORKERS", "several")
        assert service.track_workers({"TRACK_WORKERS": None}) == 1

    def test_progress_is_reported_from_nothing_to_everything(self, service, ids):
        seen: List[MatchJobResult] = []
        run(service, BatchSelection.of_ids(ids[:5]), on_progress=seen.append)

        completed = [r.completed for r in seen]
        assert completed[0] == 0
        assert completed == sorted(completed)
        assert seen[-1].completed == seen[-1].planned == 5

    def test_one_activity_event_per_run_with_its_counts(self, container, service, ids):
        result = run(service, BatchSelection.of_ids(ids[:6]))

        recorded = events(container)
        assert len(recorded) == 1
        assert recorded[0].summary == describe(result)
        assert recorded[0].detail["completed"] == 6
        assert recorded[0].detail["matched"] == 6
        assert recorded[0].detail["failed"] is False


class TestTracksThatCannotBeAsked:
    def test_a_track_deleted_before_its_turn_is_counted_as_skipped(
        self, container, service, processor, ids
    ):
        tracks = container.resolve(ITrackRepository)

        def respond(idx, track):
            if int(track.track_id) == ids[0]:
                tracks.delete(ids[3])
            return found(idx, track)

        processor.respond = respond
        result = run(service, BatchSelection.of_ids(ids[:6]))

        assert (result.skipped, result.matched, result.completed) == (1, 5, 6)
        assert ids[3] not in {a["track_id"] for a in attempts(container)}
        assert all(done for _, _, done in plan_rows(container, "job-1"))

    def test_a_track_deleted_while_it_is_being_matched_is_counted_as_skipped(
        self, container, service, processor, ids
    ):
        tracks = container.resolve(ITrackRepository)

        def respond(idx, track):
            if int(track.track_id) == ids[2]:
                tracks.delete(ids[2])
            return found(idx, track)

        processor.respond = respond
        result = run(service, BatchSelection.of_ids(ids[:4]))

        assert (result.skipped, result.matched, result.unstored) == (1, 3, 0)
        assert all(done for _, _, done in plan_rows(container, "job-1"))
        assert ids[2] not in {a["track_id"] for a in attempts(container)}
        assert sorted(a["track_id"] for a in attempts(container)) == sorted(
            [ids[0], ids[1], ids[3]]
        )

    def test_a_track_with_no_title_is_skipped_without_asking(
        self, container, service, processor, ids
    ):
        untitled = container.resolve(ITrackRepository).add(
            LibraryTrack(rekordbox_track_id="blank", title="  ", artist="Someone")
        )

        result = run(service, BatchSelection.of_ids([untitled.id, ids[0]]))

        assert result.skipped == 1
        assert processor.asked == [str(ids[0])]


# ------------------------------------------------------------ stopping, resuming


class TestCancelAndResume:
    def test_cancel_at_track_twenty_leaves_twenty_attempts_and_thirty_waiting(
        self, container, service, processor, ids
    ):
        result = run(
            service,
            BatchSelection.of_ids(ids),
            should_cancel=lambda: len(processor.calls) >= 20,
        )

        assert result.cancelled
        assert (result.completed, result.remaining) == (20, 30)
        assert len(attempts(container)) == 20
        assert [done for _, _, done in plan_rows(container, "job-1")] == [1] * 20 + [
            0
        ] * 30
        assert_stored_matches_done(container, ["job-1"])
        assert "cancelled, 30 left to resume" in describe(result)

    def test_resume_finishes_the_thirty_and_matches_nothing_twice(
        self, container, service, processor, ids
    ):
        run(
            service,
            BatchSelection.of_ids(ids),
            should_cancel=lambda: len(processor.calls) >= 20,
        )

        waiting = service.check_resumable("job-1")
        plan = service.take_over("job-1", "job-2")
        result = service.run("job-2")

        assert waiting.remaining == 30
        assert (plan.planned, plan.resumed_from) == (30, "job-1")
        assert (result.completed, result.remaining, result.resumed_from) == (
            30,
            0,
            "job-1",
        )
        assert Counter(a["track_id"] for a in attempts(container)) == Counter(ids)
        assert Counter(processor.asked) == Counter(str(t) for t in ids)
        assert_stored_matches_done(container, ["job-1", "job-2"])
        assert service.resumable() == []

    def test_with_many_workers_the_tracks_in_flight_finish_and_are_stored(
        self, container, service, workers, processor, ids
    ):
        workers(6)
        release = threading.Event()

        def respond(idx, track):
            release.wait(5)
            return found(idx, track)

        processor.respond = respond
        cancelled = threading.Event()

        def should_cancel() -> bool:
            if len(processor.calls) >= 6 and not cancelled.is_set():
                cancelled.set()
                release.set()
            return cancelled.is_set()

        result = run(service, BatchSelection.of_ids(ids), should_cancel=should_cancel)

        assert result.cancelled
        assert result.completed == len(attempts(container)) >= 6
        assert_stored_matches_done(container, ["job-1"])

        service.take_over("job-1", "job-2")
        service.run("job-2")
        assert Counter(a["track_id"] for a in attempts(container)) == Counter(ids)
        assert_stored_matches_done(container, ["job-1", "job-2"])

    def test_a_job_that_is_not_there_cannot_be_resumed_or_run(self, service):
        with pytest.raises(LookupError):
            service.check_resumable("nobody")
        with pytest.raises(LookupError):
            service.run("nobody")

    def test_a_finished_job_has_nothing_to_resume(self, service, ids):
        run(service, BatchSelection.of_ids(ids[:2]))
        with pytest.raises(ValueError, match="nothing left"):
            service.check_resumable("job-1")


class TestWhenSearchesStopAnswering:
    @pytest.fixture(autouse=True)
    def short_streak(self, monkeypatch):
        monkeypatch.setattr(match_service_module, "SEARCH_OUTAGE_STREAK", 5)

    def test_a_run_of_empty_results_stops_the_job_and_puts_them_back(
        self, container, service, processor, ids
    ):
        processor.respond = empty

        result = run(service, BatchSelection.of_ids(ids))

        assert result.search_unavailable and not result.cancelled
        assert len(attempts(container)) == 5  # every attempt is kept
        assert (result.completed, result.remaining) == (0, 50)
        assert service.check_resumable("job-1").remaining == 50
        assert "Beatport returned nothing for 5 tracks in a row" in describe(result)

    def test_resuming_once_search_answers_again_asks_those_tracks_again(
        self, container, service, processor, ids
    ):
        processor.respond = empty
        run(service, BatchSelection.of_ids(ids[:20]))

        processor.respond = found
        service.take_over("job-1", "job-2")
        result = service.run("job-2")

        assert (result.planned, result.matched) == (20, 20)
        latest = container.resolve(IMatchRepository)
        assert all(
            latest.latest_attempt(t).outcome == OUTCOME_MATCHED for t in ids[:20]
        )

    def test_the_tracks_before_the_streak_stay_done(
        self, container, service, processor, ids
    ):
        processor.respond = lambda idx, track: (
            found(idx, track) if int(track.track_id) in ids[:3] else empty(idx, track)
        )

        result = run(service, BatchSelection.of_ids(ids[:20]))

        assert result.search_unavailable
        assert [done for _, _, done in plan_rows(container, "job-1")][:8] == [
            1,
            1,
            1,
            0,
            0,
            0,
            0,
            0,
        ]
        assert result.completed == 3

    def test_an_answer_breaks_the_streak(self, service, processor, ids):
        processor.respond = lambda idx, track: (
            found(idx, track) if idx % 4 == 0 else empty(idx, track)
        )
        result = run(service, BatchSelection.of_ids(ids))
        assert not result.search_unavailable
        assert result.completed == 50

    def test_an_error_neither_breaks_nor_extends_the_streak(
        self, service, processor, ids
    ):
        def respond(idx, track):
            if idx in (2, 4):
                raise TimeoutError("slow")
            return empty(idx, track)

        processor.respond = respond
        result = run(service, BatchSelection.of_ids(ids))
        assert result.search_unavailable
        assert result.errors == 2
        assert result.no_match == 5

    def test_with_many_workers_empty_results_still_in_flight_go_back_too(
        self, container, service, workers, processor, ids
    ):
        workers(4)
        processor.respond = empty

        result = run(service, BatchSelection.of_ids(ids))

        assert result.search_unavailable
        assert result.remaining == 50
        assert len(attempts(container)) >= 5


# ------------------------------------------------------------------ the writes


class TestOneTransactionPerTrack:
    def test_the_state_rule_runs_inside_the_attempts_transaction(
        self, container, service, ids
    ):
        matches = container.resolve(IMatchRepository)

        def rule(attempt: MatchAttempt) -> Optional[TrackMatch]:
            state = (
                STATE_ACCEPTED
                if attempt.outcome == OUTCOME_MATCHED
                else STATE_NEEDS_REVIEW
            )
            return matches.set_match(
                TrackMatch(
                    track_id=attempt.track_id,
                    state=state,
                    decided_by=DECIDED_BY_AUTO,
                    attempt_id=int(attempt.id),
                    candidate_id=attempt.best_candidate_id,
                    decided_at=NOW,
                )
            )

        ruled = with_rule(container, rule)
        container.resolve(IProcessorService).respond = lambda idx, track: (
            found(idx, track) if idx % 2 else judged(idx, track)
        )

        result = run(ruled, BatchSelection.of_ids(ids[:6]))

        assert (result.accepted, result.needs_review, result.states_known) == (
            3,
            3,
            True,
        )
        assert len(matches.get_matches(ids[:6])) == 6
        assert "3 accepted, 3 need review" in describe(result)

    def test_a_rule_that_fails_takes_the_attempt_and_the_done_flag_with_it(
        self, container, ids
    ):
        matches = container.resolve(IMatchRepository)

        def rule(attempt: MatchAttempt) -> Optional[TrackMatch]:
            matches.set_match(
                TrackMatch(
                    track_id=attempt.track_id,
                    state=STATE_ACCEPTED,
                    decided_by=DECIDED_BY_AUTO,
                    attempt_id=int(attempt.id),
                    candidate_id=attempt.best_candidate_id,
                    decided_at=NOW,
                )
            )
            if attempt.track_id == ids[1]:
                raise ValueError("a rule that could not decide")
            return None

        container.register_singleton(IProcessorService, StubProcessor())
        container.resolve(IConfigService).set("TRACK_WORKERS", 1)
        result = run(with_rule(container, rule), BatchSelection.of_ids(ids[:3]))

        assert (result.completed, result.unstored) == (2, 1)
        assert ids[1] not in {a["track_id"] for a in attempts(container)}
        assert matches.get_match(ids[1]) is None
        assert plan_rows(container, "job-1")[1] == (1, ids[1], 0)
        assert_stored_matches_done(container, ["job-1"])

    def test_a_locked_database_is_waited_out_and_nothing_is_stored_twice(
        self, container, service, monkeypatch, ids
    ):
        real = service._matches.add_attempt
        refused = {"times": 0}

        def locked_twice(*args, **kwargs):
            if refused["times"] < 2:
                refused["times"] += 1
                raise sqlite3.OperationalError("database is locked")
            return real(*args, **kwargs)

        monkeypatch.setattr(service._matches, "add_attempt", locked_twice)
        result = run(service, BatchSelection.of_ids(ids[:3]))

        assert refused["times"] == 2
        assert result.completed == 3
        assert Counter(a["track_id"] for a in attempts(container)) == Counter(ids[:3])

    def test_a_lock_that_never_clears_stops_the_job(
        self, container, service, monkeypatch, ids
    ):
        monkeypatch.setattr(match_service_module, "LOCK_RETRY_SECONDS", 0.2)

        def locked(*args, **kwargs):
            raise sqlite3.OperationalError("database is locked")

        monkeypatch.setattr(service._matches, "add_attempt", locked)
        with pytest.raises(MatchStorageError, match="stayed locked"):
            run(service, BatchSelection.of_ids(ids[:3]))
        assert service.check_resumable("job-1").remaining == 3

    def test_a_database_that_refuses_stops_the_job_and_says_so(
        self, container, service, monkeypatch, ids
    ):
        def broken(*args, **kwargs):
            raise sqlite3.OperationalError("disk I/O error")

        monkeypatch.setattr(service._matches, "add_attempt", broken)
        with pytest.raises(MatchStorageError, match="disk I/O error"):
            run(service, BatchSelection.of_ids(ids[:10]))

        assert attempts(container) == []
        assert service.check_resumable("job-1").remaining == 10
        recorded = events(container)
        assert len(recorded) == 1 and recorded[0].detail["failed"] is True
        assert recorded[0].summary.endswith("stopped by an error")


# -------------------------------------------------------------------- wording


def result(**fields) -> MatchJobResult:
    values: dict = dict(job_id="j", planned=50, selected=60, excluded=10, completed=20)
    values.update(fields)
    return MatchJobResult(**values)


class TestWording:
    def test_before_states_exist_it_says_found_and_not_found(self):
        assert describe(result(matched=15, no_match=4, errors=1)) == (
            "Beatport match: 20 of 50 tracks, 15 found, 4 not found, 1 error"
            " (10 already matched, left out)"
        )

    def test_with_a_state_rule_it_says_accepted_and_need_review(self):
        text = describe(
            result(states_known=True, accepted=12, needs_review=6, errors=2)
        )
        assert text.startswith(
            "Beatport match: 20 of 50 tracks, 12 accepted, 6 need review, 2 errors"
        )

    def test_skips_and_unsaved_results_are_named(self):
        text = describe(result(excluded=0, skipped=2, unstored=1))
        assert text.endswith("0 errors, 2 skipped, 1 not saved")

    def test_a_cancel_still_finishing_says_so(self):
        text = describe(result(cancelled=True, in_progress=3))
        assert text.endswith("cancelled, 30 left to resume (finishing 3 in progress)")

    def test_no_percentage_and_no_time_estimate(self):
        text = describe(result())
        assert "%" not in text and "remaining" not in text

    def test_an_interrupted_job_is_offered_not_resumed(self, container, ids):
        from cuepoint.models.match_attempt import MatchPlan, ResumableMatch

        plan = MatchPlan(
            job_id="j",
            rematch=False,
            selected=50,
            excluded=0,
            attempt_watermark=0,
            created_at=NOW,
        )
        assert describe_interrupted(ResumableMatch(plan=plan, remaining=30)) == (
            "A Beatport match stopped when CuePoint closed, with 30 of 50 tracks"
            " left. It can be resumed."
        )

    def test_a_result_cannot_finish_more_than_it_planned(self):
        with pytest.raises(ValueError, match="cannot have finished 51 of 50"):
            result(completed=51)

    def test_the_payload_names_what_is_left(self):
        assert result().to_dict()["remaining"] == 30

    def test_a_draft_counts_what_it_left_out(self):
        draft = MatchDraft(track_ids=(1, 2), selected=5, rematch=False)
        assert (draft.planned, draft.excluded) == (2, 3)
