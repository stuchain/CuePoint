#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""DEC-096's rule applied at a gap (PREP-04, DEC-105).

``core.similarity.fit`` scores a candidate against the track before a gap and
the track after it. These tests hold:

- **One side is Similar Tracks.** A fit against one neighbour is exactly
  ``score`` against it, for every pair of traits generated.
- **The gate on each side.** A candidate outside the tempo window of either
  side with a BPM is not a fit, half and double time counted against each.
- **The mean**, of the sides' scores as shown, rounded as a score is.
- **A side with nothing to offer** counts as 0, and a candidate with no reason
  on any side is not a fit.
- **The order**: ``rank_fits`` is every ``fit`` sorted by score, then id.
- **The windows**: ``fit_tempo_ranges`` is exactly the set of tempos that pass
  both gates, checked against the rule itself; ``tempo_gap`` says how far
  apart two neighbours are.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from cuepoint.core.similarity import (
    TEMPO_DOUBLE,
    TEMPO_HALF,
    TEMPO_WINDOW_PERCENT,
    Fit,
    MusicalKey,
    Traits,
    fit,
    fit_tempo_ranges,
    rank_fits,
    score,
    tempo_gap,
    tempo_ranges,
)

pytestmark = pytest.mark.unit


def key(code: str) -> MusicalKey:
    return MusicalKey.from_camelot(int(code[:-1]), code[-1])


def t(
    bpm: Optional[float] = None,
    k: Optional[str] = None,
    genre: Optional[str] = None,
    label: Optional[str] = None,
    artists: Tuple[str, ...] = (),
) -> Traits:
    return Traits(
        bpm=bpm,
        key=key(k) if k else None,
        genre_key=genre,
        label_key=label,
        artist_keys=frozenset(artists),
    )


traits_strategy = st.builds(
    t,
    bpm=st.one_of(
        st.none(),
        st.sampled_from(
            [60.0, 62.0, 64.0, 120.0, 124.0, 126.0, 128.0, 131.0, 140.0, 256.0]
        ),
    ),
    k=st.one_of(
        st.none(), st.sampled_from(["8A", "9A", "7A", "8B", "12A", "1A", "3B"])
    ),
    genre=st.one_of(st.none(), st.sampled_from(["house", "techno"])),
    label=st.one_of(st.none(), st.sampled_from(["nite", "iv"])),
    artists=st.lists(st.sampled_from(["ame", "dixon", "bob"]), max_size=2).map(tuple),
)


# ------------------------------------------------------------------ one side


class TestOneSideIsSimilarTracks:
    @settings(max_examples=400)
    @given(traits_strategy, traits_strategy)
    def test_before_only_is_score(self, neighbour, candidate):
        expected = score(neighbour, candidate)
        found = fit(neighbour, None, candidate)
        if expected is None:
            assert found is None
        else:
            assert found == Fit(expected.score, expected, None)

    @settings(max_examples=400)
    @given(traits_strategy, traits_strategy)
    def test_after_only_is_score(self, neighbour, candidate):
        expected = score(neighbour, candidate)
        found = fit(None, neighbour, candidate)
        if expected is None:
            assert found is None
        else:
            assert found == Fit(expected.score, None, expected)

    def test_no_side_is_refused(self):
        with pytest.raises(ValueError, match="at least one neighbour"):
            fit(None, None, t(124.0))
        with pytest.raises(ValueError, match="at least one neighbour"):
            rank_fits(None, None, [(1, t(124.0))], 5)


# --------------------------------------------------------------- two sides


class TestBothSides:
    def test_the_score_is_the_mean_of_the_sides_as_shown(self):
        before, after = t(124.0, "8A", "house"), t(126.0, "9A", "house")
        candidate = t(125.0, "8A", "house")
        found = fit(before, after, candidate)
        assert (
            found is not None and found.before is not None and found.after is not None
        )
        assert found.before == score(before, candidate)
        assert found.after == score(after, candidate)
        assert found.score == round((found.before.score + found.after.score) / 2, 1)

    def test_the_gate_holds_on_each_side(self):
        before, after = t(120.0), t(130.0)
        inside_both = t(125.0)
        only_before = t(115.0)  # within 6% of 120, not of 130
        only_after = t(136.0)  # within 6% of 130, not of 120
        assert fit(before, after, inside_both) is not None
        assert fit(before, after, only_before) is None
        assert fit(before, after, only_after) is None
        assert fit(before, None, only_before) is not None
        assert fit(None, after, only_after) is not None

    def test_a_candidate_without_a_bpm_never_fits_a_side_with_one(self):
        same = dict(k="8A", genre="house", label="iv", artists=("ame",))
        assert fit(t(124.0, **same), t(**same), t(**same)) is None
        assert fit(t(**same), t(124.0, **same), t(**same)) is None

    @pytest.mark.parametrize(
        ("before_bpm", "after_bpm", "candidate_bpm", "before_detail", "after_detail"),
        [
            (128.0, 64.0, 64.0, TEMPO_HALF, "same"),
            (128.0, 64.0, 128.0, "same", TEMPO_DOUBLE),
            (64.0, 128.0, 64.0, "same", TEMPO_HALF),
            (64.0, 128.0, 128.0, TEMPO_DOUBLE, "same"),
            (126.0, 124.0, 62.5, TEMPO_HALF, TEMPO_HALF),
            (62.0, 63.0, 125.0, TEMPO_DOUBLE, TEMPO_DOUBLE),
        ],
    )
    def test_half_and_double_time_against_each_side(
        self, before_bpm, after_bpm, candidate_bpm, before_detail, after_detail
    ):
        found = fit(t(before_bpm), t(after_bpm), t(candidate_bpm))
        assert (
            found is not None and found.before is not None and found.after is not None
        )
        assert found.before.reasons[0].detail == before_detail
        assert found.after.reasons[0].detail == after_detail

    def test_a_side_with_nothing_to_offer_counts_as_nothing(self):
        before = t(k="8A")  # no BPM, so no gate: only a key to share
        after = t(genre="house")
        candidate = t(k="8A", genre="techno")
        found = fit(before, after, candidate)
        assert (
            found is not None and found.after is not None and found.before is not None
        )
        assert found.after.score == 0.0 and found.after.reasons == ()
        assert found.score == round(found.before.score / 2, 1)

    def test_no_reason_on_either_side_is_not_a_fit(self):
        assert fit(t(k="8A"), t(genre="house"), t(k="3B", genre="techno")) is None
        assert fit(t(), t(), t(124.0, "8A", "house")) is None

    @settings(max_examples=500)
    @given(traits_strategy, traits_strategy, traits_strategy)
    def test_a_fit_is_the_rule_applied_to_each_side(self, before, after, candidate):
        """Stated independently: gated on both, some reason, the mean."""
        sides = [score(before, candidate), score(after, candidate)]
        gated = any(
            side.bpm is not None
            and (candidate.bpm is None or score(t(side.bpm), t(candidate.bpm)) is None)
            for side in (before, after)
        )
        found = fit(before, after, candidate)
        if gated or all(s is None for s in sides):
            assert found is None
            return
        assert found is not None
        shown = [s.score if s is not None else 0.0 for s in sides]
        assert found.score == round(sum(shown) / 2, 1)


# ----------------------------------------------------------------- ranking


class TestRankFits:
    def candidates(self) -> List[Tuple[int, Traits]]:
        return [
            (7, t(125.0, "8A", "house")),
            (3, t(125.0, "8A", "house")),  # ties with 7: 3 first
            (5, t(124.0, "3B")),
            (9, t(140.0, "8A", "house")),  # outside both windows
            (2, t(None, "8A", "house")),  # no BPM
            (4, t(126.0, "9A")),
        ]

    def test_by_score_then_track_id(self):
        before, after = t(124.0, "8A", "house"), t(126.0, "9A", "house")
        ranked = rank_fits(before, after, self.candidates(), 10)
        assert [s.track_id for s in ranked][:2] == [3, 7]
        scores = [s.score for s in ranked]
        assert scores == sorted(scores, reverse=True)
        assert 9 not in [s.track_id for s in ranked]
        assert 2 not in [s.track_id for s in ranked]

    def test_each_is_exactly_its_fit(self):
        before, after = t(124.0, "8A", "house"), t(126.0, "9A", "house")
        for suggestion in rank_fits(before, after, self.candidates(), 10):
            traits = dict(self.candidates())[suggestion.track_id]
            assert suggestion.fit == fit(before, after, traits)

    def test_the_same_input_gives_the_same_list(self):
        before, after = t(124.0, "8A"), t(126.0, "9A")
        first = rank_fits(before, after, self.candidates(), 10)
        assert rank_fits(before, after, list(reversed(self.candidates())), 10) == first

    def test_limit_and_exclude(self):
        before, after = t(124.0, "8A", "house"), t(126.0, "9A", "house")
        assert len(rank_fits(before, after, self.candidates(), 2)) == 2
        kept = rank_fits(before, after, self.candidates(), 10, exclude=[3, 5])
        assert {s.track_id for s in kept}.isdisjoint({3, 5})

    @pytest.mark.parametrize("limit", [0, -1, 1.5, True, "5"])
    def test_a_limit_that_is_not_one(self, limit):
        with pytest.raises(ValueError, match="limit"):
            rank_fits(t(124.0), None, [], limit)

    @settings(max_examples=150)
    @given(
        traits_strategy,
        traits_strategy,
        st.lists(traits_strategy, max_size=25),
        st.integers(min_value=1, max_value=30),
    )
    def test_it_is_every_fit_sorted(self, before, after, pool, limit):
        candidates = list(enumerate(pool, start=1))
        expected = sorted(
            (
                (found.score, track_id)
                for track_id, traits in candidates
                if (found := fit(before, after, traits)) is not None
            ),
            key=lambda pair: (-pair[0], pair[1]),
        )[:limit]
        ranked = rank_fits(before, after, candidates, limit)
        assert [(s.score, s.track_id) for s in ranked] == expected


# ----------------------------------------------------------------- windows


def passes(side_bpm: float, candidate_bpm: float) -> bool:
    """The rule's own tempo gate, asked through ``score``."""
    return score(t(side_bpm), t(candidate_bpm)) is not None


def inside(ranges, bpm: float, slack: float) -> bool:
    return any(low - slack <= bpm <= high + slack for low, high in ranges)


class TestFitTempoRanges:
    def test_one_side_is_its_own_windows(self):
        assert fit_tempo_ranges(124.0, None) == tempo_ranges(124.0)
        assert fit_tempo_ranges(None, 124.0) == tempo_ranges(124.0)

    def test_no_side_restricts_nothing(self):
        assert fit_tempo_ranges(None, None) == ()

    def test_close_neighbours_overlap_in_every_window(self):
        ranges = fit_tempo_ranges(124.0, 126.0)
        assert len(ranges) == 3
        assert ranges == tuple(sorted(ranges))
        low, high = ranges[1]
        assert low == pytest.approx(126.0 * 0.94) and high == pytest.approx(
            124.0 * 1.06
        )

    def test_neighbours_too_far_apart_leave_nothing(self):
        assert fit_tempo_ranges(120.0, 140.0) == ()

    def test_half_time_neighbours_still_bridge(self):
        assert fit_tempo_ranges(128.0, 64.0) != ()

    @settings(max_examples=600)
    @given(
        st.floats(min_value=40.0, max_value=300.0),
        st.floats(min_value=40.0, max_value=300.0),
        st.floats(min_value=15.0, max_value=700.0),
    )
    def test_they_are_exactly_the_tempos_that_pass_both_gates(
        self, before, after, candidate
    ):
        ranges = fit_tempo_ranges(before, after)
        both = passes(before, candidate) and passes(after, candidate)
        if both:
            assert inside(ranges, candidate, 1e-6), "a tempo the rule keeps was lost"
        if inside(ranges, candidate, -1e-6):
            assert both, "a tempo the rule refuses was let through"


class TestTempoGap:
    @pytest.mark.parametrize(
        ("before", "after", "gap"),
        [
            (128.0, 128.0, 0.0),
            (128.0, 64.0, 0.0),
            (64.0, 128.0, 0.0),
            (120.0, 140.0, 16.7),
            (140.0, 120.0, 14.3),
            (120.0, 90.0, 25.0),  # 90 is closer to 120 than 180 or 45
            (100.0, 106.0, 6.0),
        ],
    )
    def test_cases(self, before, after, gap):
        assert tempo_gap(before, after) == gap

    @pytest.mark.parametrize("bad", [0, -1.0, float("nan"), float("inf"), None, True])
    def test_only_tempos(self, bad):
        with pytest.raises(ValueError, match="tempo"):
            tempo_gap(bad, 120.0)
        with pytest.raises(ValueError, match="tempo"):
            tempo_gap(120.0, bad)

    @settings(max_examples=300)
    @given(
        st.floats(min_value=40.0, max_value=300.0),
        st.floats(min_value=40.0, max_value=300.0),
    )
    def test_nothing_bridges_only_a_gap_wider_than_one_window(self, before, after):
        """No window overlap means the two are more than a window apart."""
        if fit_tempo_ranges(before, after) == ():
            assert tempo_gap(before, after) > TEMPO_WINDOW_PERCENT


class TestTheTempoMemo:
    """Remembering tempo pairs changes no answer (PREP-04's speed-up)."""

    def test_answers_are_the_same_cold_and_warm(self):
        from cuepoint.core import similarity

        pairs = [
            (seed, candidate)
            for seed in (60.0, 64.0, 120.0, 124.0, 128.0, 131.5)
            for candidate in (30.0, 62.0, 64.0, 118.0, 124.0, 125.25, 128.0, 256.0)
        ]
        similarity._tempo.cache_clear()
        cold = [similarity._tempo(a, b) for a, b in pairs]
        warm = [similarity._tempo(a, b) for a, b in pairs]
        assert warm == cold
        assert similarity._tempo.cache_info().hits >= len(pairs)
        assert similarity._tempo.cache_info().maxsize == similarity.TEMPO_MEMO_SIZE

    def test_a_remembered_reason_still_carries_the_tempos_compared(self):
        first = score(t(124.0), t(125.0))
        again = score(t(124.0), t(125.0))
        assert first == again and first is not None
        tempo = first.reasons[0]
        assert (tempo.seed_value, tempo.candidate_value) == (124.0, 125.0)
        assert isinstance(tempo.seed_value, float)
