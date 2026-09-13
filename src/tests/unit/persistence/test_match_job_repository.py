#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A match job's plan at the storage layer (CLEAN-03, DEC-065).

What a resume stands on, and the three ways it could go wrong without anyone
noticing until a user had paid for it in Beatport time:

1. **Leaving out the wrong tracks.** A match that is not a re-match skips tracks
   already settled. An error or an empty result is not an answer — it is what
   an outage looks like — so a track with only those must stay in. A user's
   decision keeps a track out unless it is a re-match.
2. **Matching a track twice.** Finishing a row twice is refused, and a resume
   moves the waiting rows rather than copying them, so the job it resumed is
   never offered again.
3. **Asking again what was answered since.** A resume leaves out a track
   answered after its plan was written, and only after: the watermark is an
   attempt id, not a clock.
"""

from __future__ import annotations

from typing import List

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    STATE_NO_MATCH,
    STATE_REJECTED,
    MatchJobTrack,
    MatchPlan,
    TrackMatch,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.job_repository import JobRecord, JobRepository
from cuepoint.persistence.match_job_repository import MatchJobRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-13T12:00:00+00:00"
LATER = "2026-09-13T13:00:00+00:00"
QUESTION = Track(title="A Title", artist="An Artist")


# --------------------------------------------------------------------- helpers


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db):
    return MatchJobRepository(db)


@pytest.fixture
def matches(db):
    return MatchRepository(db)


@pytest.fixture
def ids(db) -> List[int]:
    TrackRepository(db).add_many(
        [
            LibraryTrack(rekordbox_track_id=str(i), title=f"T{i}", artist="A")
            for i in range(1, 9)
        ]
    )
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


def candidate(number: int, score: float = 80.0) -> BeatportCandidate:
    return BeatportCandidate(
        url=f"https://www.beatport.com/track/a-title/{5000 + number}",
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
        query_text="an artist a title",
        candidate_index=number,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=10,
        is_winner=False,
        release_year=None,
        release_name=None,
    )


def matched() -> TrackResult:
    best = candidate(1, 92.0)
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best, candidate(2, 60.0)],
        match_score=92.0,
    )


def judged() -> TrackResult:
    """Candidates scored, none good enough: an answer."""
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=False,
        candidates=[candidate(3, 40.0)],
    )


def empty() -> TrackResult:
    """No candidates at all: what a failed search looks like."""
    return TrackResult(
        playlist_index=1, title="A Title", artist="An Artist", matched=False
    )


def failed() -> TrackResult:
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=False,
        error="Connection reset",
    )


def attempt(matches, track_id: int, result: TrackResult, job_id: str = "earlier"):
    return matches.add_attempt(track_id, job_id, result, QUESTION)


def decide(matches, track_id: int, attempt_id: int, by: str = DECIDED_BY_USER):
    state = STATE_REJECTED if by == DECIDED_BY_USER else STATE_NO_MATCH
    return matches.set_match(
        TrackMatch(
            track_id=track_id,
            state=state,
            decided_by=by,
            attempt_id=attempt_id,
            decided_at=NOW,
        )
    )


def rows(db, job_id: str):
    return [
        (int(r["position"]), int(r["track_id"]), int(r["done"]))
        for r in db.connect().execute(
            "SELECT position, track_id, done FROM match_job_tracks"
            " WHERE job_id = ? ORDER BY position",
            (job_id,),
        )
    ]


def count(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


def job_record(db, job_id: str, state: str, job_type: str = "clean_match") -> None:
    JobRepository(db).save(
        JobRecord(
            id=job_id,
            type=job_type,
            state=state,
            demo=False,
            progress=None,
            error=None,
            created_at=NOW,
            updated_at=NOW,
        )
    )


# ------------------------------------------------------------------ resolving


class TestExisting:
    def test_only_library_tracks_once_each_in_the_order_given(self, repo, ids):
        wanted = [ids[3], 999_999, ids[0], ids[3], ids[1]]
        assert repo.existing(wanted) == [ids[3], ids[0], ids[1]]

    def test_nothing_named_is_nothing(self, repo):
        assert repo.existing([]) == []

    def test_more_ids_than_one_statement_can_carry(self, repo, db):
        TrackRepository(db).add_many(
            [
                LibraryTrack(rekordbox_track_id=f"x{i}", title=f"X{i}", artist="A")
                for i in range(1_234)
            ]
        )
        every = [int(r["id"]) for r in db.connect().execute("SELECT id FROM tracks")]
        assert repo.existing(reversed(every)) == list(reversed(every))


class TestSettled:
    def test_a_track_never_matched_is_not_settled(self, repo, ids):
        assert repo.settled(ids) == set()

    def test_a_match_settles_a_track(self, repo, matches, ids):
        attempt(matches, ids[0], matched())
        assert repo.settled(ids) == {ids[0]}

    def test_candidates_judged_and_refused_settle_a_track(self, repo, matches, ids):
        attempt(matches, ids[0], judged())
        assert repo.settled(ids) == {ids[0]}

    def test_an_error_does_not_settle_a_track(self, repo, matches, ids):
        attempt(matches, ids[0], failed())
        assert repo.settled(ids) == set()

    def test_an_empty_result_does_not_settle_a_track(self, repo, matches, ids):
        # The matcher reports a failed search as an empty result; a track asked
        # during an outage must be asked again, not skipped for good.
        attempt(matches, ids[0], empty())
        attempt(matches, ids[0], failed())
        assert repo.settled(ids) == set()

    def test_one_answer_among_failures_settles_it(self, repo, matches, ids):
        attempt(matches, ids[0], failed())
        attempt(matches, ids[0], judged())
        attempt(matches, ids[0], empty())
        assert repo.settled(ids) == {ids[0]}

    def test_a_users_decision_settles_a_track_even_on_an_error(
        self, repo, matches, ids
    ):
        decide(matches, ids[0], attempt(matches, ids[0], failed()).id)
        assert repo.settled(ids) == {ids[0]}

    def test_an_automatic_state_is_not_a_decision(self, repo, matches, ids):
        decide(matches, ids[0], attempt(matches, ids[0], empty()).id, DECIDED_BY_AUTO)
        assert repo.settled(ids) == set()

    def test_only_the_tracks_asked_about(self, repo, matches, ids):
        attempt(matches, ids[0], matched())
        attempt(matches, ids[1], matched())
        assert repo.settled([ids[1], ids[2]]) == {ids[1]}


# -------------------------------------------------------------------- writing


class TestCreate:
    def test_one_waiting_row_per_track_in_plan_order(self, repo, db, ids):
        repo.create(
            "job", [ids[2], ids[0], ids[1]], rematch=False, selected=5, created_at=NOW
        )
        assert rows(db, "job") == [(0, ids[2], 0), (1, ids[0], 0), (2, ids[1], 0)]

    def test_the_plan_records_what_it_was_asked(self, repo, ids):
        created = repo.create("job", ids[:3], rematch=True, selected=5, created_at=NOW)
        assert created == MatchPlan(
            job_id="job",
            rematch=True,
            selected=5,
            excluded=2,
            attempt_watermark=0,
            created_at=NOW,
        )
        assert repo.get("job") == created

    def test_the_watermark_is_the_newest_attempt(self, repo, matches, ids):
        attempt(matches, ids[0], matched())
        newest = attempt(matches, ids[1], failed())
        created = repo.create(
            "job", ids[2:4], rematch=False, selected=2, created_at=NOW
        )
        assert created.attempt_watermark == newest.id

    @pytest.mark.parametrize(
        "track_ids, selected, message",
        [
            ([], 0, "at least one track"),
            (["dup", "dup"], 2, "each track once"),
            (["one", "two"], 1, "from a selection of 1"),
        ],
    )
    def test_what_it_refuses_writes_nothing(
        self, repo, db, ids, track_ids, selected, message
    ):
        named = [ids[0] if t in ("dup", "one") else ids[1] for t in track_ids]
        with pytest.raises(ValueError, match=message):
            repo.create("job", named, rematch=False, selected=selected, created_at=NOW)
        assert count(db, "match_jobs") == 0
        assert count(db, "match_job_tracks") == 0

    def test_a_job_has_one_plan(self, repo, db, ids):
        repo.create("job", ids[:2], rematch=False, selected=2, created_at=NOW)
        with pytest.raises(ValueError, match="already has a plan"):
            repo.create("job", ids[2:4], rematch=True, selected=2, created_at=LATER)
        assert rows(db, "job") == [(0, ids[0], 0), (1, ids[1], 0)]
        assert repo.get("job").created_at == NOW

    def test_it_joins_a_callers_transaction_and_goes_with_it(self, repo, db, ids):
        with pytest.raises(RuntimeError):
            with db.transaction():
                repo.create("job", ids[:2], rematch=False, selected=2, created_at=NOW)
                raise RuntimeError("the caller's work failed")
        assert repo.get("job") is None
        assert count(db, "match_job_tracks") == 0


class TestFinishing:
    @pytest.fixture
    def planned(self, repo, ids):
        repo.create("job", ids[:4], rematch=False, selected=4, created_at=NOW)
        repo.create("other", ids[:2], rematch=True, selected=2, created_at=NOW)
        return ids

    def test_a_finished_track_is_done(self, repo, db, planned):
        repo.mark_done("job", 2)
        assert rows(db, "job")[2] == (2, planned[2], 1)
        assert repo.progress("job") == (4, 1)

    def test_finishing_a_track_twice_is_refused(self, repo, planned):
        repo.mark_done("job", 0)
        with pytest.raises(ValueError, match="not waiting"):
            repo.mark_done("job", 0)

    @pytest.mark.parametrize("job_id, position", [("job", 4), ("nobody", 0)])
    def test_a_position_the_plan_does_not_have_is_refused(
        self, repo, planned, job_id, position
    ):
        with pytest.raises(ValueError, match="not waiting"):
            repo.mark_done(job_id, position)

    def test_waiting_is_what_is_not_done_in_plan_order(self, repo, planned):
        repo.mark_done("job", 1)
        repo.mark_done("job", 3)
        assert repo.waiting("job") == [
            MatchJobTrack(job_id="job", position=0, track_id=planned[0]),
            MatchJobTrack(job_id="job", position=2, track_id=planned[2]),
        ]

    def test_putting_tracks_back_moves_only_that_jobs_done_rows(
        self, repo, db, planned
    ):
        for position in (0, 1, 2):
            repo.mark_done("job", position)
        repo.mark_done("other", 0)

        assert repo.mark_waiting("job", [0, 2, 3, 2]) == 2

        assert [done for _, _, done in rows(db, "job")] == [0, 1, 0, 0]
        assert [done for _, _, done in rows(db, "other")] == [1, 0]

    def test_progress_of_a_job_with_no_plan_is_nothing(self, repo):
        assert repo.progress("nobody") == (0, 0)


# ------------------------------------------------------------------- resuming


class TestTakeOver:
    @pytest.fixture
    def interrupted(self, repo, ids):
        """Six tracks planned, the first two finished."""
        repo.create("first", ids[:6], rematch=False, selected=8, created_at=NOW)
        repo.mark_done("first", 0)
        repo.mark_done("first", 1)
        return ids

    def test_the_waiting_tracks_move_with_their_positions(self, repo, db, interrupted):
        repo.take_over("first", "second", LATER)
        assert rows(db, "second") == [(p, interrupted[p], 0) for p in range(2, 6)]

    def test_the_original_keeps_what_it_finished_and_nothing_else(
        self, repo, db, interrupted
    ):
        repo.take_over("first", "second", LATER)
        assert rows(db, "first") == [(0, interrupted[0], 1), (1, interrupted[1], 1)]
        assert [r.job_id for r in repo.resumable()] == ["second"]

    def test_the_new_plan_carries_the_originals_options(self, repo, interrupted):
        original = repo.get("first")
        taken = repo.take_over("first", "second", LATER)
        assert taken == MatchPlan(
            job_id="second",
            rematch=original.rematch,
            selected=4,
            excluded=0,
            attempt_watermark=original.attempt_watermark,
            created_at=LATER,
            resumed_from="first",
        )
        assert repo.get("second") == taken

    def test_a_track_answered_since_is_left_out(self, repo, db, matches, interrupted):
        attempt(matches, interrupted[3], matched(), job_id="a-playlist-match")
        attempt(matches, interrupted[4], judged(), job_id="a-playlist-match")

        taken = repo.take_over("first", "second", LATER)

        assert [t for _, t, _ in rows(db, "second")] == [interrupted[2], interrupted[5]]
        assert (taken.selected, taken.excluded, taken.planned) == (4, 2, 2)

    def test_an_error_or_an_empty_result_since_is_not_an_answer(
        self, repo, db, matches, interrupted
    ):
        attempt(matches, interrupted[3], failed())
        attempt(matches, interrupted[4], empty())
        assert repo.take_over("first", "second", LATER).excluded == 0

    def test_a_users_decision_since_leaves_a_track_out(
        self, repo, db, matches, interrupted
    ):
        decide(matches, interrupted[2], attempt(matches, interrupted[2], failed()).id)
        assert repo.take_over("first", "second", LATER).excluded == 1

    def test_a_rematch_asks_again_what_was_answered_before_its_plan(
        self, repo, db, matches, ids
    ):
        before = attempt(matches, ids[0], matched())
        decide(matches, ids[1], attempt(matches, ids[1], judged()).id)
        repo.create("first", ids[:3], rematch=True, selected=3, created_at=NOW)
        assert repo.get("first").attempt_watermark >= before.id

        taken = repo.take_over("first", "second", LATER)

        assert (taken.excluded, taken.planned) == (0, 3)

    def test_a_rematch_still_leaves_out_what_was_answered_since(
        self, repo, matches, ids
    ):
        attempt(matches, ids[0], matched())
        repo.create("first", ids[:3], rematch=True, selected=3, created_at=NOW)
        attempt(matches, ids[0], matched(), job_id="since")

        assert repo.take_over("first", "second", LATER).excluded == 1

    def test_a_resume_of_a_resume_keeps_the_first_watermark(
        self, repo, db, matches, interrupted
    ):
        repo.take_over("first", "second", LATER)
        attempt(matches, interrupted[2], matched(), job_id="since")
        repo.mark_done("second", 5)

        third = repo.take_over("second", "third", LATER)

        assert third.attempt_watermark == repo.get("first").attempt_watermark
        assert third.resumed_from == "second"
        assert [t for _, t, _ in rows(db, "third")] == [interrupted[3], interrupted[4]]

    def test_everything_answered_since_leaves_an_empty_plan(
        self, repo, db, matches, interrupted
    ):
        for track_id in interrupted[2:6]:
            attempt(matches, track_id, matched(), job_id="since")

        taken = repo.take_over("first", "second", LATER)

        assert taken.planned == 0
        assert rows(db, "second") == []
        assert repo.resumable() == []

    def test_an_unknown_job_is_not_found(self, repo):
        with pytest.raises(LookupError, match="No match job"):
            repo.take_over("nobody", "second", LATER)

    def test_a_job_with_nothing_left_is_refused(self, repo, db, interrupted):
        for position in range(2, 6):
            repo.mark_done("first", position)
        with pytest.raises(ValueError, match="nothing left"):
            repo.take_over("first", "second", LATER)
        assert repo.get("second") is None

    def test_taking_over_twice_is_refused_the_second_time(self, repo, interrupted):
        repo.take_over("first", "second", LATER)
        with pytest.raises(ValueError, match="nothing left"):
            repo.take_over("first", "third", LATER)

    def test_a_job_that_already_has_a_plan_cannot_take_over_and_nothing_moves(
        self, repo, db, interrupted
    ):
        repo.create(
            "second", interrupted[6:8], rematch=False, selected=2, created_at=NOW
        )
        before = rows(db, "first")

        with pytest.raises(ValueError, match="already has a plan"):
            repo.take_over("first", "second", LATER)

        assert rows(db, "first") == before
        assert rows(db, "second") == [(0, interrupted[6], 0), (1, interrupted[7], 0)]


class TestResumable:
    def test_jobs_with_tracks_left_newest_first(self, repo, ids):
        repo.create("older", ids[:3], rematch=False, selected=3, created_at=LATER)
        repo.create("newer", ids[3:5], rematch=True, selected=4, created_at=NOW)
        repo.mark_done("older", 0)

        found = repo.resumable()

        # Newest by when the plan was written, not by the clock it recorded.
        assert [(r.job_id, r.remaining, r.plan.planned) for r in found] == [
            ("newer", 2, 2),
            ("older", 2, 3),
        ]

    def test_a_finished_job_is_not_resumable(self, repo, ids):
        repo.create("done", ids[:2], rematch=False, selected=2, created_at=NOW)
        repo.mark_done("done", 0)
        repo.mark_done("done", 1)
        assert repo.resumable() == []


class TestInterrupted:
    def test_only_resumable_jobs_whose_record_still_says_running(self, repo, db, ids):
        for job_id, state in (
            ("was-running", "running"),
            ("was-queued", "queued"),
            ("was-cancelled", "cancelled"),
            ("no-record", None),
        ):
            repo.create(job_id, ids[:2], rematch=False, selected=2, created_at=NOW)
            if state is not None:
                job_record(db, job_id, state)
        repo.create("finished", ids[:1], rematch=False, selected=1, created_at=NOW)
        repo.mark_done("finished", 0)
        job_record(db, "finished", "running")

        found = {r.job_id for r in repo.interrupted("clean_match")}

        assert found == {"was-running", "was-queued"}

    def test_a_job_of_another_type_is_not_a_match_job(self, repo, db, ids):
        repo.create("job", ids[:2], rematch=False, selected=2, created_at=NOW)
        job_record(db, "job", "running", job_type="library_batch")
        assert repo.interrupted("clean_match") == []
