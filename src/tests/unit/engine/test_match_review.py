"""The review table's words and ticks, as pure functions (the Review tab)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from cuepoint.engine import match_review as review
from cuepoint.services.match_state import AUTO_ACCEPT_SCORE


def state(value: str = "accepted", decided_by: str = "auto") -> Any:
    return SimpleNamespace(state=value, decided_by=decided_by)


def attempt(outcome: str) -> Any:
    return SimpleNamespace(outcome=outcome)


def candidate(score: float = 99.0, guard_ok: bool = True) -> Any:
    return SimpleNamespace(score=score, guard_ok=guard_ok)


@pytest.mark.unit
def test_the_sure_boundary_is_the_matchers_auto_accept_score():
    assert review.SURE_SCORE == AUTO_ACCEPT_SCORE


@pytest.mark.unit
class TestStatusOf:
    def test_a_proposal_is_to_check(self):
        assert review.status_of(state("needs_review"), None) == "to_check"

    def test_an_accepted_match_is_matched_whoever_accepted_it(self):
        assert review.status_of(state("accepted"), None) == "matched"
        assert review.status_of(state("accepted", "user"), None) == "matched"

    def test_a_refusal_reads_as_the_match_it_refused(self):
        sure = candidate(99.0)
        unsure = candidate(80.0)
        refused = state("rejected", "user")
        assert review.status_of(refused, None, sure) == "matched"
        assert review.status_of(refused, None, unsure) == "to_check"
        assert (
            review.status_of(refused, None, candidate(99.0, guard_ok=False))
            == "to_check"
        )

    def test_a_refusal_with_no_match_behind_it_falls_back_to_the_search(self):
        refused = state("rejected", "user")
        assert review.status_of(refused, attempt("error")) == "search_failed"
        assert review.status_of(refused, attempt("no_match")) == "not_found"

    def test_no_state_and_a_failed_attempt_is_a_failed_search(self):
        assert review.status_of(None, attempt("error")) == "search_failed"
        assert review.status_of(state("no_match"), attempt("error")) == "search_failed"

    def test_no_state_and_a_search_that_ran_is_not_found(self):
        assert review.status_of(None, attempt("no_match")) == "not_found"
        assert review.status_of(state("no_match"), attempt("no_match")) == "not_found"
        assert review.status_of(None, None) == "not_found"

    def test_a_failed_search_is_an_error_attempt_only(self):
        assert review.search_failed(attempt("error")) is True
        assert review.search_failed(attempt("matched")) is False
        assert review.search_failed(None) is False


@pytest.mark.unit
class TestTicks:
    def test_only_a_track_with_a_match_can_be_ticked(self):
        assert review.is_tickable("matched", candidate()) is True
        assert review.is_tickable("to_check", candidate()) is True
        assert review.is_tickable("not_found", None) is False
        assert review.is_tickable("search_failed", None) is False
        assert review.is_tickable("matched", None) is False

    def test_a_sure_match_is_ticked_by_default(self):
        assert review.ticked_of(state("accepted"), "matched", candidate()) is True

    def test_a_proposal_is_ticked_by_default_only_when_its_guards_passed(self):
        proposal = state("needs_review")
        assert review.ticked_of(proposal, "to_check", candidate(80.0)) is True
        assert (
            review.ticked_of(proposal, "to_check", candidate(80.0, guard_ok=False))
            is False
        )

    def test_a_track_with_no_match_is_never_ticked(self):
        assert review.ticked_of(None, "not_found", None) is False
        assert review.ticked_of(state("no_match"), "search_failed", None) is False

    def test_the_persons_own_tick_or_untick_is_final(self):
        assert review.decided_by_user(state("accepted", "user")) is True
        assert review.decided_by_user(state("accepted", "auto")) is False
        assert review.decided_by_user(state("needs_review", "user")) is False
        assert review.decided_by_user(None) is False
        # Unticked beats a sure match; ticked beats a proposal the guards refused.
        assert (
            review.ticked_of(state("rejected", "user"), "matched", candidate()) is False
        )
        assert (
            review.ticked_of(
                state("accepted", "user"), "matched", candidate(80.0, guard_ok=False)
            )
            is True
        )

    def test_counts_name_every_status(self):
        counts = review.count_by_status(["matched", "matched", "to_check"])
        assert counts == {
            "matched": 2,
            "to_check": 1,
            "not_found": 0,
            "search_failed": 0,
        }


@pytest.mark.unit
class TestDiffering:
    def test_names_what_differs_in_the_lists_words_and_order(self):
        differs = {
            "title": False,
            "artists": True,
            "mix": True,
            "remixers": None,
            "label": False,
            "genre": False,
            "key": True,
            "bpm": True,
            "year": None,
        }
        assert review.differing(differs) == ["artist", "remix", "key", "bpm"]

    def test_nothing_differs_without_a_comparison(self):
        assert review.differing(None) == []
        assert review.differing({"title": None}) == []


@pytest.mark.unit
class TestCursor:
    def test_a_row_hands_back_its_place_in_the_listing(self):
        assert review.cursor_of(3, 40) == "3:40"
        assert review.parse_cursor("7:9") == (7, 9)

    def test_a_tie_in_rank_is_broken_by_the_track(self):
        assert review.parse_cursor("4:2") < review.parse_cursor("4:3")
        assert review.parse_cursor("4:99") < review.parse_cursor("5:1")

    def test_what_is_not_a_cursor_is_none(self):
        for text in ("", "x", "0:1:1", "0", "0::3", "-1:2", "1:a", "0:1:2:3"):
            assert review.parse_cursor(text) is None
