#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What an override may hold, and how a Beatport value becomes one (CLEAN-05).

The engine refuses what the UI must never build (DEC-060, DEC-069), so each rule
is tested at its edge and one step past it. Two properties matter beyond the
edges:

- **One key is one value.** Every notation of a key, and every enharmonic
  spelling, is stored identically, so a facet never counts one key twice.
- **A library's notation is kept.** A Camelot library's overrides are Camelot,
  so the plain ``key`` field — the effective value — holds one notation.
"""

from __future__ import annotations

import math
from datetime import datetime

import pytest

from cuepoint.data.rekordbox import _CAMELOT_TO_CLASSIC
from cuepoint.models.match_attempt import MatchCandidate
from cuepoint.models.track_metadata import OVERRIDE_FIELDS
from cuepoint.services.override_values import (
    EARLIEST_YEAR,
    MAX_TEXT_LENGTH,
    NOTATION_CAMELOT,
    NOTATION_CLASSIC,
    candidate_value,
    format_key,
    key_notation_of,
    latest_year,
    normalize_bpm,
    normalize_key,
    normalize_override,
    normalize_text,
    normalize_year,
    notation_from_counts,
    require_field,
)


class TestKeys:
    @pytest.mark.parametrize(
        "typed, classic, camelot",
        [
            ("Am", "Am", "8A"),
            ("A min", "Am", "8A"),
            ("A minor", "Am", "8A"),
            ("Amin", "Am", "8A"),
            ("8A", "Am", "8A"),
            ("8a", "Am", "8A"),
            ("  8 A ", "Am", "8A"),
            ("C", "C", "8B"),
            ("Cmaj", "C", "8B"),
            ("C Major", "C", "8B"),
            ("G#m", "Abm", "1A"),
            ("A♭m", "Abm", "1A"),
            ("Abm", "Abm", "1A"),
            ("F#", "F#", "2B"),
            ("G♭", "F#", "2B"),
            ("C#", "Db", "3B"),
            ("D#m", "Ebm", "2A"),
            ("Cb", "B", "1B"),
            ("E#", "F", "7B"),
            ("12B", "E", "12B"),
            ("10A", "Bm", "10A"),
            ("bm", "Bm", "10A"),
        ],
    )
    def test_every_notation_of_a_key_is_one_value(self, typed, classic, camelot):
        assert normalize_key(typed, NOTATION_CLASSIC) == classic
        assert normalize_key(typed, NOTATION_CAMELOT) == camelot

    @pytest.mark.parametrize("code, classic", sorted(_CAMELOT_TO_CLASSIC.items()))
    def test_all_twenty_four_keys_round_trip(self, code, classic):
        assert normalize_key(code, NOTATION_CLASSIC) == classic
        assert normalize_key(classic, NOTATION_CAMELOT) == code

    @pytest.mark.parametrize("typed", ["H", "Am7", "13A", "0A", "8C", "A dorian", "#m"])
    def test_what_is_not_a_key_is_refused_with_the_value_named(self, typed):
        with pytest.raises(ValueError, match=r"key .* is not a key"):
            normalize_key(typed, NOTATION_CLASSIC)

    @pytest.mark.parametrize("blank", ["", "   "])
    def test_a_blank_key_is_refused_rather_than_read_as_a_clear(self, blank):
        with pytest.raises(ValueError, match="blank"):
            normalize_key(blank, NOTATION_CLASSIC)

    def test_a_key_that_is_not_text_is_refused(self):
        with pytest.raises(ValueError, match="key must be text"):
            normalize_key(8, NOTATION_CLASSIC)

    def test_none_clears(self):
        assert normalize_key(None, NOTATION_CAMELOT) is None

    def test_an_unknown_notation_is_refused(self):
        with pytest.raises(ValueError, match="notation"):
            format_key(9, True, "open key")


class TestTheLibrarysNotation:
    @pytest.mark.parametrize(
        "keys, expected",
        [
            (["8A", "9B", "Am"], NOTATION_CAMELOT),
            (["Am", "F#", "8A"], NOTATION_CLASSIC),
            (["8A", "Am"], NOTATION_CLASSIC),
            ([], NOTATION_CLASSIC),
            ([None, "", "  "], NOTATION_CLASSIC),
            (["12a", " 1B ", None, ""], NOTATION_CAMELOT),
        ],
    )
    def test_most_keys_decide_and_classic_wins_a_tie(self, keys, expected):
        assert key_notation_of(keys) == expected

    @pytest.mark.parametrize(
        "camelot, other, expected",
        [
            (2, 1, NOTATION_CAMELOT),
            (1, 1, NOTATION_CLASSIC),
            (0, 0, NOTATION_CLASSIC),
            (0, 5, NOTATION_CLASSIC),
        ],
    )
    def test_the_counted_form_is_the_same_rule(self, camelot, other, expected):
        assert notation_from_counts(camelot, other) == expected


class TestBpm:
    @pytest.mark.parametrize("bpm", [20, 20.0, 128.5, 128.25, 300])
    def test_within_the_range_at_two_decimals(self, bpm):
        assert normalize_bpm(bpm) == float(bpm)
        assert isinstance(normalize_bpm(bpm), float)

    @pytest.mark.parametrize("bpm", [19.99, 300.01, 0, -128])
    def test_outside_the_range_is_refused(self, bpm):
        with pytest.raises(ValueError, match="bpm must be between 20 and 300"):
            normalize_bpm(bpm)

    def test_a_third_decimal_is_refused(self):
        with pytest.raises(ValueError, match="at most 2 decimals"):
            normalize_bpm(128.125)

    @pytest.mark.parametrize("bpm", ["128", True, [128]])
    def test_what_is_not_a_number_is_refused(self, bpm):
        with pytest.raises(ValueError, match="bpm must be a number"):
            normalize_bpm(bpm)

    @pytest.mark.parametrize("bpm", [math.nan, math.inf])
    def test_a_number_that_is_not_finite_is_refused(self, bpm):
        with pytest.raises(ValueError, match="bpm"):
            normalize_bpm(bpm)

    def test_none_clears(self):
        assert normalize_bpm(None) is None


class TestYear:
    def test_the_range_is_1900_to_next_year(self):
        assert latest_year() == datetime.now().year + 1
        assert normalize_year(EARLIEST_YEAR) == EARLIEST_YEAR
        assert normalize_year(latest_year()) == latest_year()
        for outside in (EARLIEST_YEAR - 1, latest_year() + 1):
            with pytest.raises(ValueError, match="year must be between"):
                normalize_year(outside)

    def test_a_whole_float_is_a_whole_number(self):
        assert normalize_year(2009.0) == 2009
        assert isinstance(normalize_year(2009.0), int)

    @pytest.mark.parametrize("year", [2009.5, "2009", True, math.nan])
    def test_what_is_not_a_whole_number_is_refused(self, year):
        with pytest.raises(ValueError, match="year must be a whole number"):
            normalize_year(year)

    def test_none_clears(self):
        assert normalize_year(None) is None


class TestText:
    def test_trimmed(self):
        assert normalize_text("  Tech House  ", "genre") == "Tech House"

    def test_two_hundred_characters_and_not_one_more(self):
        assert normalize_text("x" * MAX_TEXT_LENGTH, "label") == "x" * MAX_TEXT_LENGTH
        with pytest.raises(ValueError, match="label may be at most 200"):
            normalize_text("x" * (MAX_TEXT_LENGTH + 1), "label")

    def test_the_length_is_counted_after_trimming(self):
        padded = "  " + "x" * MAX_TEXT_LENGTH + "  "
        assert normalize_text(padded, "genre") == "x" * MAX_TEXT_LENGTH

    @pytest.mark.parametrize("blank", ["", " \t "])
    def test_blank_is_refused(self, blank):
        with pytest.raises(ValueError, match="genre cannot be blank"):
            normalize_text(blank, "genre")

    def test_what_is_not_text_is_refused(self):
        with pytest.raises(ValueError, match="label must be text"):
            normalize_text(12, "label")

    def test_none_clears(self):
        assert normalize_text(None, "genre") is None


class TestTheField:
    @pytest.mark.parametrize("field", OVERRIDE_FIELDS)
    def test_the_five_can_be_overridden(self, field):
        assert require_field(field) == field

    @pytest.mark.parametrize(
        "field", ["title", "artist", "remixer", "album", "rating", 3]
    )
    def test_nothing_else_can_and_the_message_names_the_five(self, field):
        with pytest.raises(ValueError, match="key, bpm, genre, label, year"):
            require_field(field)

    def test_a_value_is_validated_by_its_field(self):
        assert normalize_override("key", "8A", NOTATION_CLASSIC) == "Am"
        assert normalize_override("bpm", 124, NOTATION_CLASSIC) == 124.0
        assert normalize_override("year", 2001, NOTATION_CLASSIC) == 2001
        assert normalize_override("label", " L ", NOTATION_CLASSIC) == "L"
        with pytest.raises(ValueError, match="genre"):
            normalize_override("genre", "", NOTATION_CLASSIC)


def candidate(**fields) -> MatchCandidate:
    values: dict = dict(
        attempt_id=1,
        rank=0,
        url="https://www.beatport.com/track/x/1",
        score=97.0,
        guard_ok=True,
        is_winner=True,
        key="A min",
        bpm=128.0,
        genre="Tech House",
        label="A Label",
        release_year=2020,
    )
    values.update(fields)
    return MatchCandidate(**values)


class TestACandidatesValue:
    def test_each_field_as_it_would_be_stored(self):
        chosen = candidate()
        assert candidate_value(chosen, "key", NOTATION_CAMELOT) == "8A"
        assert candidate_value(chosen, "key", NOTATION_CLASSIC) == "Am"
        assert candidate_value(chosen, "bpm", NOTATION_CLASSIC) == 128.0
        assert candidate_value(chosen, "genre", NOTATION_CLASSIC) == "Tech House"
        assert candidate_value(chosen, "label", NOTATION_CLASSIC) == "A Label"
        assert candidate_value(chosen, "year", NOTATION_CLASSIC) == 2020

    def test_a_beatport_bpm_is_rounded_to_what_an_override_holds(self):
        assert candidate_value(candidate(bpm=127.998), "bpm", NOTATION_CLASSIC) == 128.0

    @pytest.mark.parametrize(
        "field, value",
        [
            ("key", None),
            ("key", "not a key"),
            ("bpm", None),
            ("bpm", 500.0),
            ("genre", "   "),
            ("label", None),
            ("label", "x" * 201),
            ("year", None),
            ("year", 1850),
        ],
    )
    def test_what_could_not_be_stored_is_no_value(self, field, value):
        column = "release_year" if field == "year" else field
        assert (
            candidate_value(candidate(**{column: value}), field, NOTATION_CLASSIC)
            is None
        )

    def test_a_field_that_cannot_be_overridden_is_refused(self):
        with pytest.raises(ValueError):
            candidate_value(candidate(), "title", NOTATION_CLASSIC)
