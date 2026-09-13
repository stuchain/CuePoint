#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Batch match decisions through DEC-063's path (CLEAN-04).

``accept_match`` and ``reject_match`` joined ORG-07's vocabulary rather than
starting a second one, so they get ORG-07's guarantees: a query selection above
the threshold runs as a job, every decision in it carries one batch id, and one
activity event says what happened. And DEC-067's: a batch confirms or refuses
what the matcher proposed, and leaves a user's own decisions exactly as they
are.
"""

from __future__ import annotations

import time
from typing import Dict, List

import pytest

from cuepoint.engine import batch_jobs
from cuepoint.engine.batch_jobs import apply_or_start
from cuepoint.engine.jobs import Job, JobState, JobStore
from cuepoint.engine.organization_api import apply_batch
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    DECIDED_BY_USER,
    STATE_ACCEPTED,
    STATE_REJECTED,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services import database_service as database_service_module
from cuepoint.services.batch_service import (
    EVENT_BATCH_APPLIED,
    OPERATION_ACCEPT_MATCH,
    OPERATION_REJECT_MATCH,
    BatchOperation,
    BatchSelection,
)
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    IMatchRepository,
    IMatchStateService,
    IMigrationRunner,
    ITrackRepository,
)
from cuepoint.utils.di_container import get_container, reset_container

QUESTION = Track(title="A Title", artist="An Artist")


def won(number: int, score: float = 80.0) -> TrackResult:
    best = BeatportCandidate(
        url=f"https://www.beatport.com/track/a-title/{number}",
        title="A Title",
        artists="An Artist",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=score,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=False,
        release_year=None,
        release_name=None,
    )
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best],
        match_score=score,
    )


@pytest.fixture
def library(tmp_path, monkeypatch) -> Dict[str, List[int]]:
    """Forty tracks: thirty need review, five a user rejected, five never matched."""
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
            LibraryTrack(rekordbox_track_id=str(i), title=f"Track {i:02d}", artist="A")
            for i in range(1, 41)
        ]
    )
    ids = tracks.browse_ids(BrowseQuery(sort="title"))
    matches = container.resolve(IMatchRepository)
    states = container.resolve(IMatchStateService)
    for n, track_id in enumerate(ids[:35]):
        states.apply_attempt(matches.add_attempt(track_id, "job", won(n), QUESTION))
    for track_id in ids[30:35]:
        states.reject(track_id)
    yield {"review": ids[:30], "rejected": ids[30:35], "never": ids[35:], "all": ids}
    reset_container()


@pytest.fixture
def store() -> JobStore:
    return JobStore()


@pytest.fixture
def low_threshold(monkeypatch):
    monkeypatch.setattr(batch_jobs, "BATCH_JOB_THRESHOLD", 10)


def finished(job: Job, timeout: float = 30.0) -> Job:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if job.state in (JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job did not finish; state={job.state}")


def needing_review() -> BatchSelection:
    return BatchSelection.matching(
        BrowseQuery(
            rules=RuleSet(rules=(FilterRule("match_state", "is", "needs_review"),))
        )
    )


def decision_batch_ids(track_ids: List[int]) -> set:
    connection = get_container().resolve(IDatabaseService).connect()
    placeholders = ", ".join("?" for _ in track_ids)
    return {
        row["batch_id"]
        for row in connection.execute(
            "SELECT batch_id FROM track_history WHERE field = 'match_state'"
            f" AND track_id IN ({placeholders})",
            tuple(track_ids),
        )
    }


class TestAcceptingAQueryAboveTheThreshold:
    def test_it_runs_as_a_job_with_one_batch_id(self, library, store, low_threshold):
        result, job = apply_or_start(
            store, needing_review(), BatchOperation(OPERATION_ACCEPT_MATCH)
        )

        assert result is None and job is not None
        finished(job)
        assert job.state == JobState.SUCCEEDED
        assert (job.result["total"], job.result["changed"]) == (30, 30)
        assert decision_batch_ids(library["review"]) == {job.result["batch_id"]}
        assert job.progress.status_message == "Accepting matches"

        matches = get_container().resolve(IMatchRepository)
        decided = matches.get_matches(library["review"]).values()
        assert {(m.state, m.decided_by) for m in decided} == {
            (STATE_ACCEPTED, DECIDED_BY_USER)
        }
        tracks = get_container().resolve(ITrackRepository)
        assert tracks.browse_count(needing_review().query) == 0

        (event,) = (
            get_container()
            .resolve(IActivityService)
            .recent_events(event_type=EVENT_BATCH_APPLIED)
        )
        assert event.summary == "Accepted the Beatport match for 30 tracks"

    def test_no_metadata_is_written(self, library, store, low_threshold):
        _, job = apply_or_start(
            store, needing_review(), BatchOperation(OPERATION_ACCEPT_MATCH)
        )
        finished(job)
        connection = get_container().resolve(IDatabaseService).connect()
        assert (
            connection.execute("SELECT count(*) FROM track_metadata").fetchone()[0] == 0
        )


class TestAUsersDecisionsSurviveABatch:
    def test_rejecting_everything_leaves_the_users_rejects_and_the_unmatched(
        self, library, store
    ):
        matches = get_container().resolve(IMatchRepository)
        before = matches.get_matches(library["rejected"])

        result, job = apply_or_start(
            store,
            BatchSelection.of_ids(library["all"]),
            BatchOperation(OPERATION_REJECT_MATCH),
        )

        assert job is None
        assert (result.changed, result.unchanged, result.failed) == (30, 10, 0)
        assert matches.get_matches(library["rejected"]) == before
        assert matches.get_matches(library["never"]) == {}
        assert all(
            m.state == STATE_REJECTED
            for m in matches.get_matches(library["review"]).values()
        )

    def test_accepting_does_not_turn_a_users_reject_into_an_accept(
        self, library, store
    ):
        matches = get_container().resolve(IMatchRepository)
        result, _ = apply_or_start(
            store,
            BatchSelection.of_ids(library["rejected"]),
            BatchOperation(OPERATION_ACCEPT_MATCH),
        )
        assert (result.changed, result.unchanged) == (0, 5)
        assert {m.state for m in matches.get_matches(library["rejected"]).values()} == {
            STATE_REJECTED
        }


class TestRefusalsAndFailures:
    @pytest.mark.parametrize("kind", [OPERATION_ACCEPT_MATCH, OPERATION_REJECT_MATCH])
    def test_a_value_is_refused_before_any_job(self, library, store, kind):
        with pytest.raises(ValueError, match="takes no value"):
            apply_or_start(store, needing_review(), BatchOperation(kind, 12))
        assert store.list_all() == []

    def test_a_track_deleted_before_it_is_decided_is_counted_as_failed(
        self, library, store
    ):
        tracks = get_container().resolve(ITrackRepository)
        gone = library["review"][0]
        tracks.delete(gone)

        result, _ = apply_or_start(
            store,
            BatchSelection.of_ids([gone, *library["review"][1:4]]),
            BatchOperation(OPERATION_ACCEPT_MATCH),
        )

        assert (result.changed, result.failed) == (3, 1)


class TestTheRoute:
    def test_the_existing_batch_route_takes_a_match_decision(self, library, store):
        status, payload = apply_batch(
            {
                "selection": {"track_ids": library["review"][:3]},
                "operation": {"kind": OPERATION_ACCEPT_MATCH},
            },
            job_store=store,
        )
        assert status == 200
        assert payload["applied"]["operation"] == OPERATION_ACCEPT_MATCH
        assert payload["applied"]["changed"] == 3


class TestTheMatchJobDecidesAsItStores:
    def test_a_match_run_through_the_container_applies_the_state_rule(self, library):
        from cuepoint.services.interfaces import (
            IConfigService,
            IMatchService,
            IProcessorService,
        )

        class Stub:
            def process_track(self, idx, track, settings=None):
                return won(50_000 + idx, score=97.0)

        container = get_container()
        container.register_singleton(IProcessorService, Stub())
        container.resolve(IConfigService).set("TRACK_WORKERS", 1)
        service = container.resolve(IMatchService)

        service.write_plan(
            "wired", service.prepare(BatchSelection.of_ids(library["never"]))
        )
        result = service.run("wired")

        assert result.states_known is True
        assert (result.accepted, result.needs_review) == (5, 0)
        decided = container.resolve(IMatchRepository).get_matches(library["never"])
        assert len(decided) == 5
        assert {m.state for m in decided.values()} == {STATE_ACCEPTED}
