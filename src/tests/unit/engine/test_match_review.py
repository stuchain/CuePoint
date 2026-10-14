"""The review list's words, as pure functions (the Review tab)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Optional

import pytest

from cuepoint.engine import match_review as review


def state(
    value: str = "accepted",
    decided_by: str = "auto",
    newer: Optional[int] = None,
) -> Any:
    return SimpleNamespace(state=value, decided_by=decided_by, newer_attempt_id=newer)


def attempt(outcome: str) -> Any:
    return SimpleNamespace(outcome=outcome)


@pytest.mark.unit
class TestStatusOf:
    def test_a_proposal_waits_for_a_yes_or_no(self):
        assert review.status_of(state("needs_review"), None) == "to_check"

    def test_a_sure_match_is_matched(self):
        assert review.status_of(state("accepted"), None) == "matched"

    def test_a_decision_of_the_person_is_done(self):
        assert review.status_of(state("accepted", "user"), None) == "done"
        assert review.status_of(state("rejected", "user"), None) == "done"

    def test_a_decision_a_newer_search_disagrees_with_is_not_done(self):
        # Checked before done: it is to be looked at again.
        assert review.status_of(state("accepted", "user", newer=9), None) == "to_check"
        assert review.status_of(state("rejected", "user", newer=9), None) == "to_check"
        assert review.is_disputed(state("accepted", "user", newer=9)) is True
        assert review.is_disputed(state("accepted", "user")) is False

    def test_no_state_and_a_failed_attempt_is_a_failed_search(self):
        assert review.status_of(None, attempt("error")) == "search_failed"
        assert review.status_of(state("no_match"), attempt("error")) == "search_failed"

    def test_no_state_and_a_search_that_ran_is_not_found(self):
        assert review.status_of(None, attempt("no_match")) == "not_found"
        assert review.status_of(state("no_match"), attempt("no_match")) == "not_found"
        assert review.status_of(None, None) == "not_found"


@pytest.mark.unit
class TestDecisionAndCounts:
    def test_what_the_person_decided(self):
        assert review.decision_of(state("accepted", "user")) == "accepted"
        assert review.decision_of(state("rejected", "user")) == "rejected"
        assert review.decision_of(state("accepted", "auto")) is None
        assert review.decision_of(None) is None

    def test_counts_name_every_status(self):
        counts = review.count_by_status(["done", "done", "matched"])
        assert counts == {
            "to_check": 0,
            "not_found": 0,
            "search_failed": 0,
            "matched": 1,
            "done": 2,
        }


@pytest.mark.unit
class TestOrderAndFilters:
    def test_the_decided_go_last_each_in_plan_order(self):
        statuses = ["done", "to_check", "done", "matched", "not_found"]
        assert review.undecided_first(statuses) == [1, 3, 4, 0, 2]

    def test_a_filter_is_a_status_or_one_of_two_other_views(self):
        assert review.matches_filter("all", "done", None, False)
        assert review.matches_filter("to_check", "to_check", None, False)
        assert not review.matches_filter("to_check", "done", "accepted", False)
        assert review.matches_filter("rejected", "done", "rejected", False)
        assert not review.matches_filter("rejected", "done", "accepted", False)
        assert review.matches_filter("disputed", "to_check", "accepted", True)
        assert not review.matches_filter("disputed", "to_check", None, False)


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

    def test_a_failed_search_is_an_error_attempt_only(self):
        assert review.search_failed(attempt("error")) is True
        assert review.search_failed(attempt("matched")) is False
        assert review.search_failed(None) is False


@pytest.mark.unit
class TestCursor:
    def test_a_row_hands_back_its_place_in_the_listing(self):
        assert review.cursor_of("to_check", 3, 40) == "0:3:40"
        assert review.cursor_of("done", 0, 5) == "1:0:5"
        assert review.parse_cursor("1:7:9") == (1, 7, 9)

    def test_the_decided_come_after_every_open_track(self):
        assert review.cursor_key("done", 0, 1) > review.cursor_key("to_check", 99, 99)

    def test_a_tie_in_rank_is_broken_by_the_track(self):
        assert review.cursor_key("to_check", 4, 2) < review.cursor_key("to_check", 4, 3)

    def test_what_is_not_a_cursor_is_none(self):
        for text in ("", "x", "2:1:1", "0:1", "0::3", "0:-1:2", "1:a:3", "0:1:2:3"):
            assert review.parse_cursor(text) is None
