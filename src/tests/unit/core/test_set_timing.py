#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""DEC-107's rule for planned times and running time (PREP-03).

``core/set_timing.py`` has no SQL and no I/O, so it is tested here on its own:

- **Reading a time.** Every accepted form and every refused one, from a table,
  each refusal with the reason in its message.
- **Writing one back.** ``format_time`` is the inverse of ``parse_time`` for
  every number it can return, checked exhaustively below an hour and by a
  property above it.
- **The running time.** Timed entries summed, untimed ones counted and never
  guessed, with the untimed entry at the start, the middle and the end.
- **"Starts at".** Known up to and including the first untimed entry, and
  ``None`` for every entry after it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pytest
from hypothesis import given
from hypothesis import strategies as st

from cuepoint.core.set_timing import (
    MAX_TIME_SECONDS,
    RunningTime,
    TimeFormatError,
    format_time,
    parse_optional_time,
    parse_time,
    planned_seconds,
    running_time,
    starts_at,
)
from cuepoint.models.set_plan import SetEntryPlan


@dataclass(frozen=True)
class Times:
    """The two fields the rule reads, and nothing else."""

    in_seconds: Optional[int] = None
    out_seconds: Optional[int] = None


def timed(out: int, start: Optional[int] = None) -> Times:
    return Times(in_seconds=start, out_seconds=out)


UNTIMED = Times()


# ------------------------------------------------------------------ reading


@pytest.mark.unit
class TestParseTime:
    """``m:ss`` and ``h:mm:ss``, whole seconds, and nothing else."""

    @pytest.mark.parametrize(
        ("text", "seconds"),
        [
            ("0:00", 0),
            ("0:01", 1),
            ("0:59", 59),
            ("1:00", 60),
            ("3:45", 225),
            ("03:45", 225),
            ("003:45", 225),
            ("59:59", 3599),
            ("60:00", 3600),
            ("75:30", 4530),
            ("999:59", 59999),
            ("0:00:00", 0),
            ("0:05:00", 300),
            ("1:00:00", 3600),
            ("1:03:45", 3825),
            ("01:03:45", 3825),
            ("99:59:59", MAX_TIME_SECONDS),
            ("  3:45  ", 225),
            ("\t1:03:45\n", 3825),
        ],
    )
    def test_accepted_forms(self, text, seconds):
        assert parse_time(text) == seconds

    @pytest.mark.parametrize(
        ("text", "reason"),
        [
            ("", "empty"),
            ("   ", "empty"),
            ("90", "not a time"),
            ("3", "not a time"),
            (":45", "not a time"),
            ("3:", "not a time"),
            ("3:5", "not a time"),
            ("3:456", "not a time"),
            ("1000:00", "not a time"),
            ("100:00:00", "not a time"),
            ("1:3:45", "not a time"),
            ("1:03:5", "not a time"),
            ("3:60", "seconds run from 00 to 59"),
            ("3:99", "seconds run from 00 to 59"),
            ("1:03:60", "seconds run from 00 to 59"),
            ("1:60:00", "minutes run from 00 to 59"),
            ("1:99:00", "minutes run from 00 to 59"),
            ("-3:45", "not a time"),
            ("+3:45", "not a time"),
            ("3:45.5", "not a time"),
            ("3.45", "not a time"),
            ("3,45", "not a time"),
            ("3m45s", "not a time"),
            ("3:45 ", None),  # outer whitespace is trimmed: accepted
            ("3 :45", "not a time"),
            ("3: 45", "not a time"),
            ("1:2:3:4", "not a time"),
            ("٣:٤٥", "not a time"),  # Arabic-Indic digits
            ("３:４５", "not a time"),  # full-width digits
            ("abc", "not a time"),
        ],
    )
    def test_refused_forms(self, text, reason):
        if reason is None:
            assert parse_time(text) == 225
            return
        with pytest.raises(TimeFormatError, match=reason):
            parse_time(text)

    def test_the_refusal_shows_both_forms(self):
        with pytest.raises(TimeFormatError) as refused:
            parse_time("90")
        assert "m:ss" in str(refused.value)
        assert "h:mm:ss" in str(refused.value)

    @pytest.mark.parametrize("value", [None, 225, 3.75, b"3:45", ["3:45"]])
    def test_only_text_is_read(self, value):
        with pytest.raises(TimeFormatError, match="text"):
            parse_time(value)

    def test_it_is_a_value_error(self):
        """So every handler that answers a refusal answers this one."""
        assert issubclass(TimeFormatError, ValueError)

    @pytest.mark.parametrize(
        ("text", "seconds"),
        [(None, None), ("", None), ("  ", None), ("3:45", 225), ("0:00", 0)],
    )
    def test_an_optional_time_is_blank_or_a_time(self, text, seconds):
        assert parse_optional_time(text) == seconds

    def test_an_optional_time_still_refuses_what_is_not_blank(self):
        with pytest.raises(TimeFormatError):
            parse_optional_time("soon")


# ------------------------------------------------------------------ writing


@pytest.mark.unit
class TestFormatTime:
    """The shortest form, and the inverse of reading."""

    @pytest.mark.parametrize(
        ("seconds", "text"),
        [
            (0, "0:00"),
            (5, "0:05"),
            (60, "1:00"),
            (225, "3:45"),
            (3599, "59:59"),
            (3600, "1:00:00"),
            (3825, "1:03:45"),
            (MAX_TIME_SECONDS, "99:59:59"),
            (100 * 3600, "100:00:00"),
        ],
    )
    def test_forms(self, seconds, text):
        assert format_time(seconds) == text

    def test_every_time_under_an_hour_and_a_bit_round_trips(self):
        for seconds in range(0, 3 * 3600):
            assert parse_time(format_time(seconds)) == seconds

    @given(st.integers(min_value=0, max_value=MAX_TIME_SECONDS))
    def test_every_time_round_trips(self, seconds):
        assert parse_time(format_time(seconds)) == seconds

    @pytest.mark.parametrize(
        ("typed", "shown"),
        [("0:05:00", "5:00"), ("75:30", "1:15:30"), ("03:45", "3:45")],
    )
    def test_a_typed_time_reads_back_the_shortest_way(self, typed, shown):
        assert format_time(parse_time(typed)) == shown

    @pytest.mark.parametrize("value", [-1, 1.5, 3.0, True, "225", None])
    def test_only_whole_non_negative_seconds(self, value):
        with pytest.raises(ValueError):
            format_time(value)

    def test_the_forms_stop_at_the_longest_time(self):
        """Two-digit hours, and fields under 60, bound what can be read."""
        assert parse_time("99:59:59") == MAX_TIME_SECONDS
        assert parse_time("999:59") < MAX_TIME_SECONDS
        for longer in ("100:00:00", "1000:00"):
            with pytest.raises(TimeFormatError, match="not a time"):
                parse_time(longer)


# --------------------------------------------------------------- one entry


@pytest.mark.unit
class TestPlannedSeconds:
    """``out - (in or 0)`` when timed, and nothing when not (DEC-107)."""

    @pytest.mark.parametrize(
        ("start", "out", "length"),
        [
            (None, 240, 240),
            (0, 240, 240),
            (30, 240, 210),
            (None, None, None),
            (30, None, None),
            (0, None, None),
            (239, 240, 1),
        ],
    )
    def test_cases(self, start, out, length):
        assert planned_seconds(start, out) == length

    @pytest.mark.parametrize(("start", "out"), [(240, 240), (300, 240), (None, 0)])
    def test_out_before_in_is_a_mistake(self, start, out):
        with pytest.raises(ValueError, match="come in before it goes out"):
            planned_seconds(start, out)

    @given(
        st.one_of(st.none(), st.integers(min_value=0, max_value=10_000)),
        st.one_of(st.none(), st.integers(min_value=1, max_value=10_001)),
    )
    def test_the_model_and_the_rule_agree(self, start, out):
        """``SetEntryPlan`` states the rule too; the two must never differ."""
        if start is not None and out is not None and start >= out:
            return
        plan = SetEntryPlan(
            entry_id=1, collection_id=1, chapter_id=1, in_seconds=start, out_seconds=out
        )
        assert plan.planned_seconds == planned_seconds(start, out)
        assert plan.is_timed == (planned_seconds(start, out) is not None)


# -------------------------------------------------------------- many entries


@pytest.mark.unit
class TestRunningTime:
    """Timed entries summed; untimed ones counted as nothing and said."""

    def test_nothing_runs_for_no_time_and_is_complete(self):
        total = running_time([])
        assert total == RunningTime(0, 0, 0)
        assert total.is_complete
        assert total.entries == 0

    def test_all_timed(self):
        total = running_time([timed(240), timed(300, 30), timed(200, 20)])
        assert total == RunningTime(seconds=240 + 270 + 180, timed=3, untimed=0)
        assert total.is_complete

    @pytest.mark.parametrize(
        "plans",
        [
            [UNTIMED, timed(240), timed(300, 30)],
            [timed(240), UNTIMED, timed(300, 30)],
            [timed(240), timed(300, 30), UNTIMED],
        ],
        ids=["untimed first", "untimed in the middle", "untimed last"],
    )
    def test_an_untimed_entry_anywhere_counts_as_nothing(self, plans):
        total = running_time(plans)
        assert total == RunningTime(seconds=510, timed=2, untimed=1)
        assert not total.is_complete
        assert total.entries == 3

    def test_an_in_time_alone_is_still_untimed(self):
        assert running_time([Times(in_seconds=30)]) == RunningTime(0, 0, 1)

    def test_all_untimed(self):
        assert running_time([UNTIMED] * 4) == RunningTime(0, 0, 4)

    def test_runs_add(self):
        first = running_time([timed(240), UNTIMED])
        second = running_time([timed(100)])
        assert first + second == running_time([timed(240), UNTIMED, timed(100)])

    def test_it_reads_the_models_own_rows(self):
        plans = [
            SetEntryPlan(entry_id=1, collection_id=1, chapter_id=1, out_seconds=240),
            SetEntryPlan(entry_id=2, collection_id=1, chapter_id=1),
        ]
        assert running_time(plans) == RunningTime(240, 1, 1)


@pytest.mark.unit
class TestStartsAt:
    """Known up to and including the first untimed entry, then unknown."""

    def test_nothing_starts(self):
        assert starts_at([]) == []

    def test_all_timed(self):
        assert starts_at([timed(240), timed(300, 30), timed(200)]) == [0, 240, 510]

    def test_untimed_first(self):
        """The first entry starts at 0 whatever it is; after it, nothing."""
        assert starts_at([UNTIMED, timed(240), timed(300)]) == [0, None, None]

    def test_untimed_in_the_middle(self):
        """The untimed entry's own start is known; the next one's is not."""
        assert starts_at([timed(240), UNTIMED, timed(300), timed(100)]) == [
            0,
            240,
            None,
            None,
        ]

    def test_untimed_last(self):
        assert starts_at([timed(240), timed(300, 30), UNTIMED]) == [0, 240, 510]

    def test_a_timed_entry_after_an_untimed_one_does_not_restart_the_clock(self):
        assert starts_at([UNTIMED, UNTIMED, timed(60)]) == [0, None, None]

    @given(
        st.lists(
            st.one_of(
                st.just(UNTIMED),
                st.integers(min_value=1, max_value=900).map(timed),
            ),
            max_size=30,
        )
    )
    def test_starts_are_the_running_time_of_what_came_before(self, plans):
        starts = starts_at(plans)
        assert len(starts) == len(plans)
        for index, start in enumerate(starts):
            before = running_time(plans[:index])
            assert start == (before.seconds if before.is_complete else None)
