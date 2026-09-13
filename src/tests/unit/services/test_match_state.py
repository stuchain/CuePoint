#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Match states, a user's decisions, and the flag between them (CLEAN-04).

The specification names the risk: the rule is small, and an edge in it — an
error, a dispute — could silently erase review work. So the table is tested row
by row, and the promise DEC-067 makes is tested as a property rather than as an
example: for every sequence of re-matches tried here, a user's decision comes
out exactly as it went in, flag aside.

Everything runs against a real database with real attempts stored through
CLEAN-02's repository; nothing reaches Beatport.
"""

from __future__ import annotations

import itertools
import json
import math
from typing import Callable, Dict, List
from unittest.mock import Mock

import pytest

from cuepoint.core.matcher import _confidence_label
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.config import SETTINGS
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import (
    DECIDED_BY_AUTO,
    DECIDED_BY_USER,
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    STATE_NO_MATCH,
    STATE_REJECTED,
    MatchAttempt,
    TrackMatch,
)
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_state import (
    AUTO_ACCEPT_SCORE,
    FIELD_MATCH_STATE,
    Evidence,
    MatchStateService,
    automatic_state,
    decision_value,
    same_beatport_track,
)
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.processor_service import ProcessorService

NOW = "2026-09-13T12:00:00+00:00"
QUESTION = Track(title="A Title", artist="An Artist")


# --------------------------------------------------------------------- helpers


def candidate(
    beatport_id: str, score: float, guard_ok: bool = True, slug: str = "a-title"
) -> BeatportCandidate:
    url = (
        f"https://www.beatport.com/track/{slug}/{beatport_id}"
        if beatport_id
        else f"https://www.beatport.com/track/{slug}"
    )
    return BeatportCandidate(
        url=url,
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
        candidate_index=1,
        base_score=score,
        bonus_year=0,
        bonus_key=0,
        guard_ok=guard_ok,
        reject_reason="" if guard_ok else "guard_title_sim_floor",
        elapsed_ms=5,
        is_winner=False,
        release_year=None,
        release_name=None,
    )


def won(
    beatport_id: str = "1001",
    score: float = 97.0,
    guard_ok: bool = True,
    slug: str = "a-title",
) -> TrackResult:
    best = candidate(beatport_id, score, guard_ok, slug)
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=True,
        best_match=best,
        candidates=[best, candidate("9009", 40.0)],
        match_score=score,
    )


def judged() -> TrackResult:
    return TrackResult(
        playlist_index=1,
        title="A Title",
        artist="An Artist",
        matched=False,
        candidates=[candidate("3003", 30.0)],
    )


def empty() -> TrackResult:
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


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(rekordbox_track_id=str(i), title=f"T{i}", artist="A")
            for i in range(1, 11)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks) -> List[int]:
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def matches(db) -> MatchRepository:
    return MatchRepository(db)


@pytest.fixture
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def states(matches, tracks, activity, db) -> MatchStateService:
    return MatchStateService(matches, tracks, activity, db)


@pytest.fixture
def store(matches) -> Callable[[int, TrackResult], MatchAttempt]:
    def add(track_id: int, result: TrackResult) -> MatchAttempt:
        return matches.add_attempt(track_id, "job", result, QUESTION)

    return add


@pytest.fixture
def rematch(store, states) -> Callable[[int, TrackResult], object]:
    """Store an attempt and run the rule on it, as a match job does."""

    def run(track_id: int, result: TrackResult):
        return states.apply_attempt(store(track_id, result))

    return run


def candidate_of(matches, attempt: MatchAttempt, beatport_id: str) -> int:
    for stored in matches.candidates_for(int(attempt.id)):
        if stored.beatport_track_id == beatport_id:
            return int(stored.id)
    raise AssertionError(f"no candidate {beatport_id} in attempt {attempt.id}")


def history(db, track_id: int) -> List[Dict]:
    rows = db.connect().execute(
        "SELECT field, old_value_json, new_value_json, source, batch_id"
        " FROM track_history WHERE track_id = ? ORDER BY id",
        (track_id,),
    )
    return [
        {
            "field": row["field"],
            "old": None
            if row["old_value_json"] is None
            else json.loads(row["old_value_json"]),
            "new": None
            if row["new_value_json"] is None
            else json.loads(row["new_value_json"]),
            "source": row["source"],
            "batch_id": row["batch_id"],
        }
        for row in rows
    ]


def count(db, table: str) -> int:
    return int(db.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


def essence(match: TrackMatch) -> tuple:
    """Everything a user decided, which no re-match may change."""
    return (
        match.state,
        match.decided_by,
        match.attempt_id,
        match.candidate_id,
        match.decided_at,
    )


# ------------------------------------------------------------------ the number


class TestTheBoundary:
    def test_it_is_the_matchers_high_confidence_boundary(self):
        assert _confidence_label(AUTO_ACCEPT_SCORE) == "high"
        assert _confidence_label(math.nextafter(AUTO_ACCEPT_SCORE, 0)) != "high"

    @pytest.mark.parametrize("score, label", [(95.0, "high"), (94.99, "medium")])
    def test_the_processors_label_agrees(self, score, label):
        best = candidate("1", score)
        matcher = Mock()
        matcher.find_best_match.return_value = (best, [best], [], 1)
        processor = ProcessorService(
            beatport_service=Mock(),
            matcher_service=matcher,
            logging_service=Mock(),
            config_service=Mock(
                get=lambda key, default=None: SETTINGS.get(key, default)
            ),
        )
        result = processor.process_track(1, QUESTION, {"MIN_ACCEPT_SCORE": 70})
        assert result.confidence == label
        assert (result.confidence == "high") is (score >= AUTO_ACCEPT_SCORE)


# ----------------------------------------------------- the rule, no decision yet


class TestTheRuleWithoutADecision:
    def test_a_winner_at_the_boundary_with_its_guards_is_accepted(
        self, matches, store, states, ids
    ):
        attempt = store(ids[0], won(score=95.0))
        state = states.apply_attempt(attempt)

        assert (state.state, state.decided_by) == (STATE_ACCEPTED, DECIDED_BY_AUTO)
        assert state.attempt_id == attempt.id
        assert state.candidate_id == attempt.best_candidate_id
        assert state.newer_attempt_id is None
        assert matches.get_match(ids[0]) == state

    def test_a_winner_just_below_the_boundary_needs_review(self, store, states, ids):
        attempt = store(ids[0], won(score=94.9))
        state = states.apply_attempt(attempt)
        assert (state.state, state.candidate_id) == (
            STATE_NEEDS_REVIEW,
            attempt.best_candidate_id,
        )

    def test_a_high_winner_that_failed_a_guard_needs_review(self, rematch, ids):
        assert rematch(ids[0], won(score=140.0, guard_ok=False)).state == (
            STATE_NEEDS_REVIEW
        )

    def test_candidates_judged_with_no_winner_is_no_match(self, store, states, ids):
        attempt = store(ids[0], judged())
        state = states.apply_attempt(attempt)
        assert (state.state, state.decided_by, state.candidate_id) == (
            STATE_NO_MATCH,
            DECIDED_BY_AUTO,
            None,
        )
        assert state.attempt_id == attempt.id

    @pytest.mark.parametrize("result", [failed, empty], ids=["error", "empty"])
    def test_a_failure_on_a_track_never_matched_gives_it_no_state(
        self, rematch, matches, ids, result
    ):
        assert rematch(ids[0], result()) is None
        assert matches.get_match(ids[0]) is None

    @pytest.mark.parametrize("result", [failed, empty], ids=["error", "empty"])
    def test_a_failure_after_an_accept_leaves_the_accept_alone(
        self, rematch, matches, ids, result
    ):
        accepted = rematch(ids[0], won())
        assert rematch(ids[0], result()) == accepted
        assert matches.get_match(ids[0]) == accepted

    @pytest.mark.parametrize("result", [failed, empty], ids=["error", "empty"])
    def test_a_failure_after_needs_review_or_no_match_leaves_them_alone(
        self, rematch, ids, result
    ):
        review = rematch(ids[0], won(score=80.0))
        nothing = rematch(ids[1], judged())
        assert rematch(ids[0], result()) == review
        assert rematch(ids[1], result()) == nothing

    def test_an_automatic_accept_is_replaced_by_a_weaker_answer(
        self, store, states, ids
    ):
        states.apply_attempt(store(ids[0], won()))
        newer = store(ids[0], won(beatport_id="2002", score=80.0))

        state = states.apply_attempt(newer)

        assert (state.state, state.decided_by) == (STATE_NEEDS_REVIEW, DECIDED_BY_AUTO)
        assert (state.attempt_id, state.candidate_id) == (
            newer.id,
            newer.best_candidate_id,
        )

    def test_needs_review_becomes_no_match_and_then_accepted(self, rematch, ids):
        assert rematch(ids[0], won(score=80.0)).state == STATE_NEEDS_REVIEW
        assert rematch(ids[0], judged()).state == STATE_NO_MATCH
        assert rematch(ids[0], won()).state == STATE_ACCEPTED

    def test_an_automatic_state_is_never_disputed(self, rematch, ids):
        rematch(ids[0], won(beatport_id="1"))
        assert rematch(ids[0], won(beatport_id="2")).newer_attempt_id is None

    def test_the_rule_records_no_history(self, rematch, db, ids):
        rematch(ids[0], won())
        rematch(ids[0], judged())
        assert history(db, ids[0]) == []

    def test_a_stored_match_with_no_winner_is_refused(self):
        attempt = MatchAttempt(
            id=1,
            track_id=1,
            outcome="matched",
            input_json="{}",
            started_at=NOW,
            finished_at=NOW,
        )
        with pytest.raises(ValueError, match="no winner"):
            automatic_state(Evidence(attempt, None, True), None, None, NOW)

    def test_an_attempt_that_was_never_stored_cannot_decide(self):
        attempt = MatchAttempt(
            track_id=1,
            outcome="no_match",
            input_json="{}",
            started_at=NOW,
            finished_at=NOW,
        )
        with pytest.raises(ValueError, match="stored attempt"):
            automatic_state(Evidence(attempt, None, True), None, None, NOW)


# ------------------------------------------------------------- a decision sticks


class TestAUsersAcceptSticks:
    @pytest.fixture
    def accepted(self, store, states, matches, ids):
        attempt = store(ids[0], won(beatport_id="1001"))
        states.apply_attempt(attempt)
        return states.accept(ids[0], candidate_of(matches, attempt, "1001"))

    def test_an_agreeing_rematch_changes_nothing(self, accepted, rematch, ids):
        assert rematch(ids[0], won(beatport_id="1001", score=150.0)) == accepted

    def test_a_disagreeing_rematch_flags_it_and_changes_nothing_else(
        self, accepted, store, states, ids
    ):
        newer = store(ids[0], won(beatport_id="2002"))
        state = states.apply_attempt(newer)

        assert essence(state) == essence(accepted)
        assert state.newer_attempt_id == newer.id
        assert state.is_disputed

    def test_a_later_agreeing_rematch_clears_the_flag(self, accepted, rematch, ids):
        rematch(ids[0], won(beatport_id="2002"))
        state = rematch(ids[0], won(beatport_id="1001"))
        assert essence(state) == essence(accepted)
        assert state.newer_attempt_id is None

    def test_the_flag_follows_the_newest_disagreement(
        self, accepted, store, states, ids
    ):
        states.apply_attempt(store(ids[0], won(beatport_id="2002")))
        newest = store(ids[0], won(beatport_id="3003"))
        assert states.apply_attempt(newest).newer_attempt_id == newest.id

    @pytest.mark.parametrize("result", [judged, failed, empty])
    def test_an_answer_with_no_winner_leaves_the_flag_as_it_was(
        self, accepted, rematch, ids, result
    ):
        disputed = rematch(ids[0], won(beatport_id="2002"))
        assert rematch(ids[0], result()) == disputed

    def test_the_same_track_under_a_changed_slug_agrees(self, accepted, rematch, ids):
        state = rematch(ids[0], won(beatport_id="1001", slug="a-title-corrected"))
        assert state.newer_attempt_id is None


class TestAUsersRejectSticks:
    @pytest.fixture
    def rejected(self, store, states, ids):
        states.apply_attempt(store(ids[0], won(beatport_id="1001", score=80.0)))
        return states.reject(ids[0])

    def test_the_proposal_it_refused_again_changes_nothing(
        self, rejected, rematch, ids
    ):
        assert rematch(ids[0], won(beatport_id="1001", score=99.0)) == rejected

    def test_a_different_proposal_flags_it(self, rejected, store, states, ids):
        newer = store(ids[0], won(beatport_id="2002"))
        state = states.apply_attempt(newer)
        assert essence(state) == essence(rejected)
        assert state.newer_attempt_id == newer.id

    def test_finding_no_winner_agrees_with_it_and_clears_the_flag(
        self, rejected, rematch, ids
    ):
        rematch(ids[0], won(beatport_id="2002"))
        state = rematch(ids[0], judged())
        assert essence(state) == essence(rejected)
        assert state.newer_attempt_id is None

    @pytest.mark.parametrize("result", [failed, empty])
    def test_a_failure_leaves_the_flag_alone(self, rejected, rematch, ids, result):
        disputed = rematch(ids[0], won(beatport_id="2002"))
        assert rematch(ids[0], result()) == disputed

    def test_a_reject_with_nothing_proposed_is_flagged_by_any_winner(
        self, store, states, ids
    ):
        states.apply_attempt(store(ids[1], judged()))
        states.reject(ids[1])
        newer = store(ids[1], won(beatport_id="4004"))
        assert states.apply_attempt(newer).newer_attempt_id == newer.id


class TestNoRematchChangesADecision:
    """DEC-067 as a property: every sequence of three re-matches, both decisions."""

    KINDS = {
        "same": lambda: won(beatport_id="1001", score=99.0),
        "other": lambda: won(beatport_id="2002", score=99.0),
        "weak": lambda: won(beatport_id="2002", score=60.0),
        "judged": judged,
        "error": failed,
        "empty": empty,
    }

    def test_nothing_but_the_flag_ever_moves(self, db, tracks, store, states, matches):
        sequences = list(itertools.product(sorted(self.KINDS), repeat=3))
        tracks.add_many(
            [
                LibraryTrack(rekordbox_track_id=f"p{i}", title=f"P{i}", artist="A")
                for i in range(len(sequences) * 2)
            ]
        )
        pool = [
            int(row["id"])
            for row in db.connect().execute(
                "SELECT id FROM tracks WHERE rekordbox_track_id LIKE 'p%' ORDER BY id"
            )
        ]
        checked = 0
        for n, sequence in enumerate(sequences):
            first = store(pool[2 * n], won(beatport_id="1001", score=80.0))
            states.apply_attempt(first)
            accepted = states.accept(pool[2 * n], candidate_of(matches, first, "1001"))
            second = store(pool[2 * n + 1], won(beatport_id="1001", score=80.0))
            states.apply_attempt(second)
            rejected = states.reject(pool[2 * n + 1])

            for kind in sequence:
                for track_id, decision in (
                    (pool[2 * n], accepted),
                    (pool[2 * n + 1], rejected),
                ):
                    state = states.apply_attempt(store(track_id, self.KINDS[kind]()))
                    assert essence(state) == essence(decision), (sequence, kind)
                    assert matches.get_match(track_id).decided_by == DECIDED_BY_USER
                    checked += 1
        assert checked == len(sequences) * 3 * 2


# -------------------------------------------------------------------- accepting


class TestAccepting:
    def test_accepting_the_winner_is_a_users_decision_with_history(
        self, store, states, matches, db, ids
    ):
        attempt = store(ids[0], won(score=80.0))
        proposed = states.apply_attempt(attempt)

        state = states.accept(ids[0], int(attempt.best_candidate_id))

        assert (state.state, state.decided_by) == (STATE_ACCEPTED, DECIDED_BY_USER)
        assert history(db, ids[0]) == [
            {
                "field": FIELD_MATCH_STATE,
                "old": decision_value(proposed),
                "new": decision_value(state),
                "source": "cuepoint",
                "batch_id": None,
            }
        ]

    def test_accepting_the_second_candidate_of_an_older_attempt(
        self, store, states, matches, ids
    ):
        older = store(ids[0], won(beatport_id="1001", score=80.0))
        states.apply_attempt(older)
        newer = store(ids[0], won(beatport_id="2002", score=85.0))
        states.apply_attempt(newer)
        runner_up = candidate_of(matches, older, "9009")

        state = states.accept(ids[0], runner_up)

        assert (state.attempt_id, state.candidate_id) == (older.id, runner_up)
        assert matches.get_candidate(runner_up).is_winner is False
        # and it sticks through the next re-match, which disagrees
        after = states.apply_attempt(store(ids[0], won(beatport_id="2002")))
        assert (after.candidate_id, after.state) == (runner_up, STATE_ACCEPTED)
        assert after.is_disputed

    def test_accepting_clears_a_dispute(self, store, states, matches, ids):
        first = store(ids[0], won(beatport_id="1001"))
        states.apply_attempt(first)
        states.accept(ids[0], candidate_of(matches, first, "1001"))
        newer = store(ids[0], won(beatport_id="2002"))
        assert states.apply_attempt(newer).is_disputed

        state = states.accept(ids[0], candidate_of(matches, newer, "2002"))

        assert not state.is_disputed
        assert state.attempt_id == newer.id

    def test_accepting_the_same_candidate_again_writes_nothing(
        self, store, states, db, ids
    ):
        attempt = store(ids[0], won())
        states.apply_attempt(attempt)
        first = states.accept(ids[0], int(attempt.best_candidate_id))

        again = states.accept(ids[0], int(attempt.best_candidate_id))

        assert again == first
        assert len(history(db, ids[0])) == 1

    def test_another_tracks_candidate_is_refused_and_nothing_is_written(
        self, store, states, matches, db, ids
    ):
        mine = store(ids[0], won(score=80.0))
        before = states.apply_attempt(mine)
        theirs = store(ids[1], won(beatport_id="5005"))

        with pytest.raises(ValueError, match="is track"):
            states.accept(ids[0], int(theirs.best_candidate_id))

        assert matches.get_match(ids[0]) == before
        assert history(db, ids[0]) == []

    def test_an_unknown_candidate_or_track_is_refused(self, store, states, ids):
        attempt = store(ids[0], won())
        with pytest.raises(ValueError, match="No candidate"):
            states.accept(ids[0], 987_654)
        with pytest.raises(ValueError, match="No track"):
            states.accept(987_654, int(attempt.best_candidate_id))

    def test_deciding_applies_nothing(self, store, states, rematch, db, ids):
        # DEC-004: accepting — automatically or by hand — writes no metadata.
        attempt = store(ids[0], won())
        states.apply_attempt(attempt)
        states.accept(ids[0], int(attempt.best_candidate_id))
        rematch(ids[1], won())
        states.reject(ids[1])
        states.clear_decision(ids[1])

        assert count(db, "track_metadata") == 0
        fields = {
            row["field"]
            for row in db.connect().execute("SELECT field FROM track_history")
        }
        assert fields == {FIELD_MATCH_STATE}


# -------------------------------------------------------------------- rejecting


class TestRejecting:
    @pytest.mark.parametrize(
        "score", [97.0, 80.0], ids=["auto_accepted", "needs_review"]
    )
    def test_rejecting_a_proposal_names_the_candidate_refused(
        self, store, states, ids, score
    ):
        attempt = store(ids[0], won(score=score))
        states.apply_attempt(attempt)

        state = states.reject(ids[0])

        assert (state.state, state.decided_by) == (STATE_REJECTED, DECIDED_BY_USER)
        assert (state.attempt_id, state.candidate_id) == (
            attempt.id,
            attempt.best_candidate_id,
        )

    def test_rejecting_a_no_match_refuses_nothing_in_particular(
        self, store, states, ids
    ):
        attempt = store(ids[0], judged())
        states.apply_attempt(attempt)
        state = states.reject(ids[0])
        assert (state.attempt_id, state.candidate_id) == (attempt.id, None)

    def test_rejecting_a_candidate_a_user_accepted_refuses_that_one(
        self, store, states, matches, ids
    ):
        attempt = store(ids[0], won(beatport_id="1001"))
        states.apply_attempt(attempt)
        runner_up = candidate_of(matches, attempt, "9009")
        states.accept(ids[0], runner_up)

        assert states.reject(ids[0]).candidate_id == runner_up

    def test_rejecting_a_track_whose_attempts_all_failed_rests_on_the_latest(
        self, store, states, ids
    ):
        store(ids[0], failed())
        latest = store(ids[0], empty())
        state = states.reject(ids[0])
        assert (state.attempt_id, state.candidate_id) == (latest.id, None)

    def test_rejecting_with_no_state_rests_on_the_latest_answer(
        self, store, matches, states, ids
    ):
        answer = store(ids[0], won(score=80.0))
        store(ids[0], failed())
        state = states.reject(ids[0])
        assert (state.attempt_id, state.candidate_id) == (
            answer.id,
            answer.best_candidate_id,
        )

    def test_a_track_never_matched_cannot_be_rejected(self, states, matches, ids):
        with pytest.raises(ValueError, match="never been matched"):
            states.reject(ids[0])
        assert matches.get_match(ids[0]) is None

    def test_rejecting_clears_a_dispute(self, store, states, matches, ids):
        first = store(ids[0], won(beatport_id="1001"))
        states.apply_attempt(first)
        states.accept(ids[0], candidate_of(matches, first, "1001"))
        assert states.apply_attempt(store(ids[0], won(beatport_id="2002"))).is_disputed
        assert not states.reject(ids[0]).is_disputed

    def test_an_unknown_track_is_refused(self, states):
        with pytest.raises(ValueError, match="No track"):
            states.reject(987_654)


# --------------------------------------------------------------------- clearing


class TestClearing:
    def test_clearing_returns_to_what_the_latest_answer_says(
        self, store, states, matches, db, ids
    ):
        first = store(ids[0], won(beatport_id="1001", score=80.0))
        states.apply_attempt(first)
        states.accept(ids[0], candidate_of(matches, first, "9009"))
        latest = store(ids[0], won(beatport_id="2002", score=99.0))
        assert states.apply_attempt(latest).is_disputed

        state = states.clear_decision(ids[0])

        assert (state.state, state.decided_by) == (STATE_ACCEPTED, DECIDED_BY_AUTO)
        assert (state.attempt_id, state.candidate_id) == (
            latest.id,
            latest.best_candidate_id,
        )
        assert not state.is_disputed
        assert history(db, ids[0])[-1]["new"] == decision_value(state)

    def test_it_skips_newer_failures_for_the_latest_answer(self, store, states, ids):
        answer = store(ids[0], judged())
        states.apply_attempt(answer)
        states.reject(ids[0])
        store(ids[0], failed())
        store(ids[0], empty())

        state = states.clear_decision(ids[0])

        assert (state.state, state.attempt_id) == (STATE_NO_MATCH, answer.id)

    def test_with_no_answer_at_all_the_track_is_not_matched_again(
        self, store, states, matches, db, ids
    ):
        store(ids[0], failed())
        rejected = states.reject(ids[0])

        assert states.clear_decision(ids[0]) is None

        assert matches.get_match(ids[0]) is None
        assert history(db, ids[0])[-1]["old"] == decision_value(rejected)
        assert history(db, ids[0])[-1]["new"] is None
        assert count(db, "match_attempts") == 1  # attempts are never deleted

    def test_clearing_what_is_already_automatic_writes_nothing(
        self, rematch, states, db, ids
    ):
        state = rematch(ids[0], won())
        assert states.clear_decision(ids[0]) == state
        assert history(db, ids[0]) == []

    def test_clearing_a_track_with_nothing_writes_nothing(self, states, db, ids):
        assert states.clear_decision(ids[0]) is None
        assert history(db, ids[0]) == []

    def test_after_clearing_a_rematch_may_replace_it(self, rematch, store, states, ids):
        rematch(ids[0], won(score=80.0))
        states.reject(ids[0])
        states.clear_decision(ids[0])
        assert rematch(ids[0], judged()).state == STATE_NO_MATCH

    def test_an_unknown_track_is_refused(self, states):
        with pytest.raises(ValueError, match="No track"):
            states.clear_decision(987_654)


# ------------------------------------------------------------ batch proposals


class TestConfirmingAProposal:
    def test_accept_proposed_confirms_an_automatic_proposal(
        self, rematch, states, matches, ids
    ):
        proposed = rematch(ids[0], won(score=80.0))
        assert states.accept_proposed(ids[0], "batch-1") is True
        confirmed = matches.get_match(ids[0])
        assert (confirmed.state, confirmed.decided_by) == (
            STATE_ACCEPTED,
            DECIDED_BY_USER,
        )
        assert confirmed.candidate_id == proposed.candidate_id
        # Now a user's decision, which a second batch leaves exactly as it is.
        assert states.accept_proposed(ids[0], "batch-2") is False
        assert matches.get_match(ids[0]) == confirmed

    def test_accept_proposed_leaves_what_it_cannot_confirm(
        self, rematch, store, states, matches, db, ids
    ):
        rematch(ids[0], judged())  # nothing proposed
        user = store(ids[1], won(beatport_id="1001"))
        states.apply_attempt(user)
        states.reject(ids[1])  # a user's decision

        assert states.accept_proposed(ids[0], "b") is False
        assert states.accept_proposed(ids[1], "b") is False
        assert states.accept_proposed(ids[2], "b") is False  # never matched
        assert matches.get_match(ids[1]).state == STATE_REJECTED

    def test_reject_proposed_refuses_an_automatic_state_only(
        self, rematch, store, states, matches, ids
    ):
        rematch(ids[0], judged())
        accepted = store(ids[1], won())
        states.apply_attempt(accepted)
        states.accept(ids[1], int(accepted.best_candidate_id))

        assert states.reject_proposed(ids[0], "b") is True
        assert states.reject_proposed(ids[1], "b") is False
        assert states.reject_proposed(ids[2], "b") is False
        assert matches.get_match(ids[1]).state == STATE_ACCEPTED

    def test_a_proposal_decision_carries_its_batch_id(self, rematch, states, db, ids):
        rematch(ids[0], won(score=80.0))
        states.accept_proposed(ids[0], "the-batch")
        assert history(db, ids[0])[-1]["batch_id"] == "the-batch"

    @pytest.mark.parametrize("method", ["accept_proposed", "reject_proposed"])
    def test_a_track_that_is_gone_is_refused(self, states, method):
        with pytest.raises(ValueError, match="No track"):
            getattr(states, method)(987_654, "b")


class TestComparingBeatportTracks:
    def test_by_id_when_both_are_known(self):
        assert same_beatport_track(
            _stored(candidate("7", 1.0, slug="old")),
            _stored(candidate("7", 1.0, slug="new")),
        )
        assert not same_beatport_track(
            _stored(candidate("7", 1.0)), _stored(candidate("8", 1.0))
        )

    def test_by_page_when_an_id_is_unknown(self):
        assert same_beatport_track(
            _stored(candidate("", 1.0, slug="x")), _stored(candidate("", 1.0, slug="x"))
        )
        assert not same_beatport_track(
            _stored(candidate("", 1.0, slug="x")),
            _stored(candidate("7", 1.0, slug="x")),
        )


def _stored(source: BeatportCandidate):
    from cuepoint.models.match_attempt import MatchCandidate
    from cuepoint.services.match_record import beatport_track_id

    return MatchCandidate(
        attempt_id=1,
        rank=0,
        url=source.url,
        score=source.score,
        guard_ok=source.guard_ok,
        is_winner=False,
        beatport_track_id=beatport_track_id(source.url),
    )


class TestTheHistoryValue:
    """The shape CLEAN-06's revert will read back, pinned against literal values.

    Compared with the helper alone, a field the helper stopped writing would
    vanish from both sides of the assertion at once.
    """

    def test_it_is_every_part_of_the_decision_but_the_track_and_the_clock(self):
        match = TrackMatch(
            track_id=4,
            state=STATE_REJECTED,
            decided_by=DECIDED_BY_USER,
            attempt_id=7,
            candidate_id=70,
            newer_attempt_id=9,
            decided_at=NOW,
        )
        assert decision_value(match) == {
            "state": "rejected",
            "decided_by": "user",
            "attempt_id": 7,
            "candidate_id": 70,
            "newer_attempt_id": 9,
        }
        assert decision_value(None) is None

    def test_an_accept_records_the_candidate_it_chose(self, store, states, db, ids):
        attempt = store(ids[0], won(score=80.0))
        states.apply_attempt(attempt)
        states.accept(ids[0], int(attempt.best_candidate_id))

        recorded = history(db, ids[0])[-1]["new"]

        assert recorded == {
            "state": "accepted",
            "decided_by": "user",
            "attempt_id": attempt.id,
            "candidate_id": attempt.best_candidate_id,
            "newer_attempt_id": None,
        }
