#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The Similar Tracks rule (DISCOVER-08, DEC-096), component by component.

Pure: no database. The wheel is checked against the Camelot table the library
reader already trusts (``data.rekordbox``), every key pair and every reason is
enumerated rather than sampled, and :func:`rank` is held to "sort everything
:func:`score` answers" over generated libraries.
"""

from __future__ import annotations

import ast
import itertools
import math
import random
from pathlib import Path
from typing import List, Tuple

import pytest

from cuepoint.core import similarity
from cuepoint.core.similarity import (
    ARTIST_POINTS,
    COMPONENTS,
    GENRE_POINTS,
    KEY_ADJACENT,
    KEY_POINTS,
    KEY_RELATIVE,
    KEY_SAME,
    LABEL_POINTS,
    MAX_SCORE,
    REASONS,
    TEMPO_CLOSE,
    TEMPO_DOUBLE,
    TEMPO_HALF,
    TEMPO_POINTS_MAX,
    TEMPO_POINTS_MIN,
    TEMPO_SAME,
    TEMPO_WINDOW_PERCENT,
    MusicalKey,
    Traits,
    compatible_keys,
    key_relation,
    rank,
    score,
    tempo_ranges,
    unused_components,
)
from cuepoint.data.rekordbox import _CAMELOT_TO_CLASSIC
from cuepoint.services.override_values import parse_key

pytestmark = pytest.mark.unit

CODES = [f"{number}{letter}" for number in range(1, 13) for letter in "AB"]


def key(code: str) -> MusicalKey:
    parsed = parse_key(code)
    assert parsed is not None, code
    return MusicalKey(*parsed)


def reasons(seed: Traits, candidate: Traits) -> List[Tuple[str, str, float]]:
    found = score(seed, candidate)
    assert found is not None
    return [(r.component, r.detail, r.points) for r in found.reasons]


# ---------------------------------------------------------------- the wheel


class TestTheWheel:
    @pytest.mark.parametrize("code", CODES)
    def test_every_key_sits_where_the_librarys_table_puts_it(self, code):
        classic = parse_key(_CAMELOT_TO_CLASSIC[code])
        assert classic is not None
        found = MusicalKey(*classic)
        assert f"{found.camelot[0]}{found.camelot[1]}" == code
        assert MusicalKey.from_camelot(*found.camelot) == found

    def test_the_wheel_names_24_different_keys(self):
        assert len({key(code) for code in CODES}) == 24

    @pytest.mark.parametrize(
        "seed, candidate, relation",
        [
            ("8A", "8A", KEY_SAME),
            ("8A", "9A", KEY_ADJACENT),
            ("8A", "7A", KEY_ADJACENT),
            ("8B", "9B", KEY_ADJACENT),
            # The wheel wraps: 12 and 1 are neighbours, in both modes.
            ("12A", "1A", KEY_ADJACENT),
            ("1A", "12A", KEY_ADJACENT),
            ("12B", "1B", KEY_ADJACENT),
            ("1B", "12B", KEY_ADJACENT),
            # The relative major and minor: the same number, the other letter.
            ("8A", "8B", KEY_RELATIVE),
            ("8B", "8A", KEY_RELATIVE),
            ("12A", "12B", KEY_RELATIVE),
            ("1B", "1A", KEY_RELATIVE),
            # A step and a mode switch at once is neither.
            ("8A", "9B", None),
            ("8A", "7B", None),
            ("12A", "1B", None),
            ("8A", "10A", None),
            ("8A", "2A", None),
            ("1A", "11A", None),
        ],
    )
    def test_how_two_keys_relate(self, seed, candidate, relation):
        assert key_relation(key(seed), key(candidate)) == relation

    def test_a_key_is_the_same_key_in_every_notation(self):
        assert key_relation(key("8A"), MusicalKey(*parse_key("Am"))) == KEY_SAME
        assert key_relation(key("8A"), MusicalKey(*parse_key("A minor"))) == KEY_SAME
        assert key_relation(key("1A"), MusicalKey(*parse_key("G#m"))) == KEY_SAME
        assert key_relation(key("1A"), MusicalKey(*parse_key("Abm"))) == KEY_SAME

    def test_the_relation_is_symmetric(self):
        for a, b in itertools.product(CODES, CODES):
            assert key_relation(key(a), key(b)) == key_relation(key(b), key(a))

    @pytest.mark.parametrize("code", CODES)
    def test_compatible_keys_are_exactly_the_related_ones(self, code):
        related = {
            other for other in CODES if key_relation(key(code), key(other)) is not None
        }
        found = compatible_keys(key(code))
        assert found[0] == key(code)
        assert len(found) == 4 == len(set(found))
        assert {f"{k.camelot[0]}{k.camelot[1]}" for k in found} == related

    @pytest.mark.parametrize(
        "pitch, minor",
        [(-1, True), (12, False), (True, True), ("1", True), (1.0, False), (1, 1)],
    )
    def test_a_key_that_is_not_one_is_refused(self, pitch, minor):
        with pytest.raises(ValueError):
            MusicalKey(pitch, minor)

    @pytest.mark.parametrize("number, letter", [(0, "A"), (13, "B"), (8, "C")])
    def test_a_camelot_code_that_is_not_one_is_refused(self, number, letter):
        with pytest.raises(ValueError):
            MusicalKey.from_camelot(number, letter)


# -------------------------------------------------------------------- tempo


def tempo(seed_bpm: float, candidate_bpm: float):
    found = score(Traits(bpm=seed_bpm), Traits(bpm=candidate_bpm))
    if found is None:
        return None
    [reason] = found.reasons
    assert reason.component == "tempo"
    return reason.detail, reason.points


class TestTempo:
    def test_the_same_tempo_scores_the_most(self):
        assert tempo(128.0, 128.0) == (TEMPO_SAME, TEMPO_POINTS_MAX)

    def test_closeness_is_scored_down_to_the_windows_edge(self):
        # 3 % away is half way to a 6 % window's edge: half way between the
        # edge's points and the most.
        assert tempo(100.0, 103.0) == (TEMPO_CLOSE, 20.0)
        assert tempo(100.0, 97.0) == (TEMPO_CLOSE, 20.0)
        assert tempo(100.0, 106.0) == (TEMPO_CLOSE, TEMPO_POINTS_MIN)
        assert tempo(100.0, 94.0) == (TEMPO_CLOSE, TEMPO_POINTS_MIN)

    def test_closer_scores_more(self):
        points = [tempo(124.0, 124.0 + step / 10)[1] for step in range(0, 70, 5)]
        assert points == sorted(points, reverse=True)

    def test_a_hundredth_apart_is_close_not_the_same(self):
        assert tempo(128.0, 128.01)[0] == TEMPO_CLOSE

    def test_outside_the_window_is_not_a_suggestion(self):
        assert tempo(100.0, 106.5) is None
        assert tempo(100.0, 93.5) is None
        assert tempo(128.0, 90.0) is None

    def test_half_and_double_time_are_close_and_say_so(self):
        assert tempo(128.0, 64.0) == (TEMPO_HALF, TEMPO_POINTS_MAX)
        assert tempo(64.0, 128.0) == (TEMPO_DOUBLE, TEMPO_POINTS_MAX)
        assert tempo(174.0, 87.0) == (TEMPO_HALF, TEMPO_POINTS_MAX)
        # Scored by closeness as heard: 65 is 130 in double time, 1.56 % from 128.
        detail, points = tempo(128.0, 65.0)
        assert detail == TEMPO_HALF
        assert points == round(10 + 20 * (1 - (2 / 128) / 0.06), 1)
        assert tempo(100.0, 53.5) is None
        assert tempo(100.0, 213.0) is None

    def test_the_windows_are_what_tempo_ranges_says(self):
        rnd = random.Random(96)
        for _ in range(3000):
            seed = round(rnd.uniform(60, 200), 2)
            candidate = round(rnd.uniform(25, 300), 2)
            inside = any(low <= candidate <= high for low, high in tempo_ranges(seed))
            found = tempo(seed, candidate)
            # The ranges' edges are products of floats; away from them, the
            # ranges and the rule agree exactly.
            near_edge = any(
                min(abs(candidate - low), abs(candidate - high)) < 1e-6
                for low, high in tempo_ranges(seed)
            )
            if not near_edge:
                assert (found is not None) == inside, (seed, candidate)

    def test_the_window_is_the_named_percentage(self):
        low, high = tempo_ranges(100.0)[0]
        assert math.isclose(low, 100 - TEMPO_WINDOW_PERCENT)
        assert math.isclose(high, 100 + TEMPO_WINDOW_PERCENT)


# -------------------------------------------------------------- the rule


EVERYTHING = Traits(
    bpm=128.0,
    key=key("8A"),
    genre_key="tech house",
    label_key="innervisions",
    artist_keys=frozenset({"ame", "dixon"}),
)


class TestTheRule:
    @pytest.mark.parametrize(
        "candidate, expected, total",
        [
            (
                EVERYTHING,
                [
                    ("tempo", TEMPO_SAME, 30.0),
                    ("key", KEY_SAME, 25.0),
                    ("genre", "same", 20.0),
                    ("label", "same", 10.0),
                    ("artist", "shared", 15.0),
                ],
                100.0,
            ),
            (
                Traits(bpm=131.84, key=key("9A"), genre_key="tech house"),
                [
                    ("tempo", TEMPO_CLOSE, 20.0),
                    ("key", KEY_ADJACENT, 20.0),
                    ("genre", "same", 20.0),
                ],
                60.0,
            ),
            (
                Traits(bpm=64.0, key=key("8B"), artist_keys=frozenset({"dixon", "x"})),
                [
                    ("tempo", TEMPO_HALF, 30.0),
                    ("key", KEY_RELATIVE, 20.0),
                    ("artist", "shared", 15.0),
                ],
                65.0,
            ),
            (
                Traits(bpm=256.0, key=key("3B"), label_key="innervisions"),
                [("tempo", TEMPO_DOUBLE, 30.0), ("label", "same", 10.0)],
                40.0,
            ),
            (Traits(bpm=128.0), [("tempo", TEMPO_SAME, 30.0)], 30.0),
        ],
    )
    def test_a_table_of_candidates(self, candidate, expected, total):
        found = score(EVERYTHING, candidate)
        assert found is not None
        assert [(r.component, r.detail, r.points) for r in found.reasons] == expected
        assert found.score == total

    def test_the_most_a_candidate_can_score(self):
        assert MAX_SCORE == 100.0
        assert score(EVERYTHING, EVERYTHING).score == MAX_SCORE

    def test_a_reason_carries_the_two_values(self):
        found = score(EVERYTHING, Traits(bpm=126.0, key=key("7A")))
        tempo_reason, key_reason = found.reasons
        assert (tempo_reason.seed_value, tempo_reason.candidate_value) == (128.0, 126.0)
        assert (key_reason.seed_value, key_reason.candidate_value) == (
            key("8A"),
            key("7A"),
        )

    def test_the_shared_artists_are_named_in_key_order(self):
        found = score(
            EVERYTHING, Traits(bpm=128.0, artist_keys=frozenset({"dixon", "ame"}))
        )
        assert found.reasons[-1].seed_value == ("ame", "dixon")

    def test_the_tempo_window_is_a_gate(self):
        # Everything else in common, and not a suggestion: the seed has a BPM,
        # and this track is not near it.
        outside = Traits(
            bpm=90.0,
            key=EVERYTHING.key,
            genre_key=EVERYTHING.genre_key,
            label_key=EVERYTHING.label_key,
            artist_keys=EVERYTHING.artist_keys,
        )
        assert score(EVERYTHING, outside) is None
        no_bpm = Traits(
            key=EVERYTHING.key,
            genre_key=EVERYTHING.genre_key,
            artist_keys=EVERYTHING.artist_keys,
        )
        assert score(EVERYTHING, no_bpm) is None

    def test_a_seed_without_a_bpm_scores_what_it_has(self):
        seed = Traits(key=key("8A"), genre_key="techno")
        assert reasons(seed, Traits(bpm=128.0, key=key("8A"))) == [
            ("key", KEY_SAME, KEY_POINTS[KEY_SAME])
        ]
        assert reasons(seed, Traits(genre_key="techno")) == [
            ("genre", "same", GENRE_POINTS)
        ]
        assert score(seed, Traits(bpm=128.0, key=key("2A"), genre_key="house")) is None

    def test_a_seed_with_no_bpm_and_no_key_still_finds_by_name(self):
        seed = Traits(label_key="l", artist_keys=frozenset({"a"}))
        assert reasons(seed, Traits(label_key="l", artist_keys=frozenset({"a"}))) == [
            ("label", "same", LABEL_POINTS),
            ("artist", "shared", ARTIST_POINTS),
        ]
        assert unused_components(seed) == ("tempo", "key", "genre")

    def test_nothing_in_common_is_not_a_suggestion(self):
        assert score(Traits(genre_key="a"), Traits(genre_key="b")) is None
        assert score(Traits(), Traits()) is None
        assert score(Traits(), EVERYTHING) is None

    def test_a_missing_value_matches_nothing(self):
        # Two tracks without a genre do not share one.
        seed = Traits(key=key("8A"))
        assert reasons(seed, Traits(key=key("8A"))) == [("key", KEY_SAME, 25.0)]

    def test_what_a_seed_could_not_use(self):
        assert unused_components(EVERYTHING) == ()
        assert unused_components(Traits()) == COMPONENTS
        assert unused_components(Traits(bpm=120.0, genre_key="g")) == (
            "key",
            "label",
            "artist",
        )


# -------------------------------------------------------------- the traits


class TestTraits:
    def test_no_value_is_read_one_way(self):
        traits = Traits(bpm=0, genre_key="", label_key="", artist_keys={"", "a"})
        assert traits.bpm is None
        assert traits.genre_key is None and traits.label_key is None
        assert traits.artist_keys == frozenset({"a"})

    def test_a_whole_bpm_is_a_float(self):
        assert Traits(bpm=128).bpm == 128.0
        assert isinstance(Traits(bpm=128).bpm, float)

    def test_artists_given_as_a_list_become_a_set(self):
        assert Traits(artist_keys=["a", "b", "a"]).artist_keys == frozenset({"a", "b"})

    @pytest.mark.parametrize("bpm", [-1, float("nan"), float("inf"), True, "128"])
    def test_a_bpm_that_is_not_a_tempo_is_refused(self, bpm):
        with pytest.raises(ValueError):
            Traits(bpm=bpm)

    def test_a_key_must_be_a_key(self):
        with pytest.raises(ValueError):
            Traits(key=(9, True))


# ----------------------------------------------------------------- ranking


def library(rnd: random.Random, size: int) -> List[Tuple[int, Traits]]:
    genres = ["house", "techno", "tech house", None]
    labels = ["a", "b", "c", None]
    artists = ["x", "y", "z", "w"]
    tracks = []
    for track_id in rnd.sample(range(1, size * 10), size):
        tracks.append(
            (
                track_id,
                Traits(
                    bpm=rnd.choice(
                        [None, 64.0, 120.0, 122.5, 124.0, 126.0, 128.0, 256.0]
                    ),
                    key=rnd.choice([None, *(key(code) for code in CODES)]),
                    genre_key=rnd.choice(genres),
                    label_key=rnd.choice(labels),
                    artist_keys=frozenset(rnd.sample(artists, rnd.randrange(3))),
                ),
            )
        )
    return tracks


class TestRanking:
    def test_rank_is_every_score_sorted_by_score_then_id(self):
        rnd = random.Random(8)
        for _ in range(40):
            tracks = library(rnd, 300)
            seed = rnd.choice(tracks)[1]
            limit = rnd.choice([1, 5, 50, 1000])
            expected = sorted(
                (
                    (track_id, found)
                    for track_id, traits in tracks
                    for found in (score(seed, traits),)
                    if found is not None
                ),
                key=lambda pair: (-pair[1].score, pair[0]),
            )[:limit]
            ranked = rank(seed, tracks, limit)
            assert [(s.track_id, s.similarity) for s in ranked] == expected

    def test_the_same_library_in_any_order_gives_the_same_list(self):
        rnd = random.Random(9)
        tracks = library(rnd, 400)
        seed = Traits(bpm=124.0, key=key("8A"), genre_key="house")
        first = rank(seed, tracks, 30)
        for _ in range(5):
            rnd.shuffle(tracks)
            assert rank(seed, tracks, 30) == first

    def test_ties_break_by_id(self):
        same = Traits(bpm=128.0)
        ranked = rank(same, [(30, same), (4, same), (17, same)], 10)
        assert [s.track_id for s in ranked] == [4, 17, 30]
        assert {s.score for s in ranked} == {TEMPO_POINTS_MAX}

    def test_a_higher_score_comes_first_whatever_its_id(self):
        seed = Traits(bpm=128.0, genre_key="g")
        ranked = rank(seed, [(1, Traits(bpm=128.0)), (2, seed)], 10)
        assert [s.track_id for s in ranked] == [2, 1]

    def test_excluded_tracks_are_never_suggested(self):
        same = Traits(bpm=128.0)
        ranked = rank(same, [(1, same), (2, same), (3, same)], 10, exclude=[1, 3])
        assert [s.track_id for s in ranked] == [2]

    def test_the_limit_is_the_most_returned(self):
        same = Traits(bpm=128.0)
        assert len(rank(same, [(n, same) for n in range(1, 20)], 5)) == 5

    @pytest.mark.parametrize("limit", [0, -1, True, 2.0, "5"])
    def test_a_limit_that_is_not_one_is_refused(self, limit):
        with pytest.raises(ValueError):
            rank(Traits(), [], limit)

    def test_a_score_is_the_sum_of_its_reasons(self):
        rnd = random.Random(10)
        tracks = library(rnd, 500)
        for _, seed in tracks[:30]:
            for suggestion in rank(seed, tracks, 1000):
                points = sum(r.points for r in suggestion.similarity.reasons)
                assert suggestion.score == round(points, 1)
                components = [r.component for r in suggestion.similarity.reasons]
                assert components == sorted(components, key=COMPONENTS.index)


# ---------------------------------------------------------------- reasons


class TestTheReasons:
    def test_every_reason_the_rule_gives_is_listed_and_every_listed_one_is_given(
        self,
    ):
        seen = set()
        rnd = random.Random(11)
        tracks = library(rnd, 400)
        for _, seed in tracks[:80]:
            for suggestion in rank(seed, tracks, 1000):
                seen.update(
                    (r.component, r.detail) for r in suggestion.similarity.reasons
                )
        # "The same tempo" needs two equal BPMs, which the generator gives.
        assert seen == set(REASONS)

    def test_the_catalogue_names_each_reason_once_in_component_order(self):
        assert len(set(REASONS)) == len(REASONS)
        assert [c for c, _ in REASONS] == sorted(
            (c for c, _ in REASONS), key=COMPONENTS.index
        )

    def test_the_weights_are_what_the_step_records(self):
        # DISCOVER-08's outcome names these numbers; a change is a decision to
        # record there, not a tweak.
        assert (TEMPO_WINDOW_PERCENT, TEMPO_POINTS_MAX, TEMPO_POINTS_MIN) == (
            6.0,
            30.0,
            10.0,
        )
        assert KEY_POINTS == {KEY_SAME: 25.0, KEY_ADJACENT: 20.0, KEY_RELATIVE: 20.0}
        assert (GENRE_POINTS, LABEL_POINTS, ARTIST_POINTS) == (20.0, 10.0, 15.0)


def test_the_rule_imports_nothing_from_cuepoint():
    tree = ast.parse(Path(similarity.__file__).read_text(encoding="utf-8"))
    imported = [
        node.module if isinstance(node, ast.ImportFrom) else alias.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names
    ]
    assert not [name for name in imported if name and name.startswith("cuepoint")]
