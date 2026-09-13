#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A match job's plan and a resumable job, as types (CLEAN-03, ``m0013``).

Each refusal here is a value its table would also refuse, or one a resume would
misread: a plan leaving out more tracks than it was handed, a job resuming
itself, a "resumable" job with nothing left.
"""

from __future__ import annotations

import pytest

from cuepoint.models.match_attempt import MatchPlan, ResumableMatch

NOW = "2026-09-13T12:00:00+00:00"


def plan(**fields) -> MatchPlan:
    values: dict = dict(
        job_id="job-1",
        rematch=False,
        selected=50,
        excluded=10,
        attempt_watermark=812,
        created_at=NOW,
    )
    values.update(fields)
    return MatchPlan(**values)


class TestMatchPlan:
    def test_a_plan_holds_what_was_selected_less_what_was_left_out(self):
        assert plan().planned == 40
        assert plan(excluded=0).planned == 50
        assert plan(selected=3, excluded=3).planned == 0

    def test_a_flag_from_a_row_is_a_bool(self):
        assert plan(rematch=1).rematch is True
        assert plan(rematch=0).rematch is False

    def test_it_round_trips_through_its_row(self):
        original = plan(rematch=True, resumed_from="job-0")
        row = original.to_dict()
        assert row["rematch"] == 1
        assert MatchPlan.from_row(row) == original

    def test_a_fresh_plan_resumes_nothing(self):
        assert plan().resumed_from is None

    @pytest.mark.parametrize(
        "fields, message",
        [
            ({"job_id": ""}, "job_id"),
            ({"job_id": "  "}, "job_id"),
            ({"rematch": 2}, "rematch"),
            ({"rematch": "yes"}, "rematch"),
            ({"selected": -1}, "selected"),
            ({"excluded": -1}, "excluded"),
            ({"selected": 5, "excluded": 6}, "cannot leave out 6 of 5"),
            ({"attempt_watermark": -1}, "attempt_watermark"),
            ({"created_at": ""}, "created_at"),
            ({"resumed_from": ""}, "resumed_from"),
            ({"resumed_from": "job-1"}, "cannot resume itself"),
            ({"selected": True}, "selected"),
        ],
    )
    def test_what_it_refuses(self, fields, message):
        with pytest.raises(ValueError, match=message):
            plan(**fields)


class TestResumableMatch:
    def test_it_names_its_job(self):
        assert ResumableMatch(plan=plan(), remaining=1).job_id == "job-1"

    @pytest.mark.parametrize("remaining", [1, 20, 40])
    def test_between_one_and_everything_planned_is_left(self, remaining):
        assert ResumableMatch(plan=plan(), remaining=remaining).remaining == remaining

    @pytest.mark.parametrize("remaining", [0, 41])
    def test_nothing_left_or_more_than_planned_is_refused(self, remaining):
        with pytest.raises(ValueError, match="between 1 and 40"):
            ResumableMatch(plan=plan(), remaining=remaining)

    @pytest.mark.parametrize("remaining", [-1, True, 2.5])
    def test_a_count_that_is_not_a_count_is_refused(self, remaining):
        with pytest.raises(ValueError):
            ResumableMatch(plan=plan(), remaining=remaining)
