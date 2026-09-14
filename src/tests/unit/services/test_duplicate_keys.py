#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The text signal's key (CLEAN-08, DEC-074).

The risk the specification names is false groups, so most of these are
near-misses that must *not* share a key: an Extended and an Original, two
remixers, Part 1 and Part 2, three seconds apart. The rest are the spellings
that must: a plain title and its Original Mix, a remix in brackets and after a
dash, artists listed in another order.
"""

from __future__ import annotations

import pytest

from cuepoint.services.duplicate_keys import (
    DURATION_TOLERANCE_SECONDS,
    artist_key,
    duration_clusters,
    text_groups,
    text_key,
    title_parts,
)


class TestTitleParts:
    @pytest.mark.parametrize(
        "title, parts",
        [
            ("Track", ("track", "")),
            ("Track (Original Mix)", ("track", "")),
            ("Track (Original)", ("track", "")),
            ("Track (Extended Mix)", ("track", "extended mix")),
            ("Track - Extended Mix", ("track", "extended mix")),
            ("Track (CamelPhat Remix)", ("track", "camelphat remix")),
            ("Track - CamelPhat Remix", ("track", "camelphat remix")),
            ("Track – CamelPhat Remix", ("track", "camelphat remix")),
            ("Track (Radio Edit)", ("track", "radio edit")),
            ("Track [VIP]", ("track", "vip")),
            ("Track (Part 2)", ("track", "part 2")),
            ("Track (Original Mix) [Remastered]", ("track", "remastered")),
            ("Track feat. Someone (Dub Mix)", ("track", "dub mix")),
            ("Track (feat. Someone)", ("track", "")),
            ("Track [ft. Someone]", ("track", "")),
            ("Artist - Title", ("artist title", "")),
            ("Artist - Title - Extended Mix", ("artist title", "extended mix")),
            ("Burn For You (Ivory Re-fire)", ("burn for you", "ivory re fire")),
            ("Café (Remix)", ("cafe", "remix")),
            ("Rock &amp; Roll", ("rock & roll", "")),
            ("The Feature", ("the feature", "")),
            ("", ("", "")),
        ],
    )
    def test_a_title_splits_into_a_base_and_its_mix(self, title, parts):
        assert title_parts(title) == parts

    def test_none_is_an_empty_title(self):
        assert title_parts(None) == ("", "")

    def test_mix_phrases_are_sorted_and_counted_once(self):
        assert title_parts("Track (Remastered) [VIP] (vip)") == (
            "track",
            "remastered+vip",
        )


class TestArtists:
    def test_order_separators_and_featuring_do_not_matter(self):
        assert artist_key("B, A & C feat. D") == artist_key("A & B, C feat. D")
        assert artist_key("A x B") == artist_key("B / A")

    def test_an_absent_artist_is_empty(self):
        assert artist_key(None) == artist_key("") == ""


class TestTheKey:
    @pytest.mark.parametrize(
        "first, second",
        [
            (("A", "Track"), ("A", "Track (Original Mix)")),
            (("A", "Track (CamelPhat Remix)"), ("A", "Track - CamelPhat Remix")),
            (("A & B", "Track"), ("B, A", "Track")),
            (("A", "TRACK"), ("a", "track")),
        ],
    )
    def test_spellings_of_one_recording_share_a_key(self, first, second):
        assert text_key(*first) == text_key(*second) is not None

    @pytest.mark.parametrize(
        "first, second",
        [
            (("A", "Track (Extended Mix)"), ("A", "Track (Original Mix)")),
            (("A", "Track (CamelPhat Remix)"), ("A", "Track (Other Remix)")),
            (("A", "Track - CamelPhat Remix"), ("A", "Track - Other Remix")),
            (("A", "Track (Part 1)"), ("A", "Track (Part 2)")),
            (("A", "Track (Bootleg)"), ("A", "Track")),
            (("A", "Track"), ("B", "Track")),
            (("A", "Track Extended Mix"), ("A", "Track")),
        ],
    )
    def test_different_recordings_do_not(self, first, second):
        assert text_key(*first) != text_key(*second)

    @pytest.mark.parametrize(
        "artist, title", [("", "Track"), (None, "Track"), ("A", ""), ("A", "(Remix)")]
    )
    def test_not_enough_to_say_is_no_key(self, artist, title):
        assert text_key(artist, title) is None


class TestLengths:
    def test_within_the_tolerance_of_the_shortest_is_one_cluster(self):
        assert DURATION_TOLERANCE_SECONDS == 2
        assert duration_clusters([(1, 300), (2, 302), (3, 301)]) == [(300, (1, 2, 3))]

    def test_three_seconds_apart_is_two(self):
        assert duration_clusters([(1, 300), (2, 303)]) == [(300, (1,)), (303, (2,))]

    def test_measured_from_the_shortest_not_chained(self):
        # 300, 302 and 304 would all be one group if each were compared with
        # its neighbour.
        assert duration_clusters([(1, 300), (2, 302), (3, 304)]) == [
            (300, (1, 2)),
            (304, (3,)),
        ]

    def test_ids_come_back_sorted_whatever_order_they_arrived_in(self):
        assert duration_clusters([(9, 300), (4, 300), (7, 301)]) == [(300, (4, 7, 9))]


class TestTextGroups:
    def test_groups_of_two_or_more_keyed_by_text_and_shortest_length(self):
        rows = [
            (1, "A", "Track", 300),
            (2, "A", "Track (Original Mix)", 302),
            (3, "A", "Track", 420),
            (4, "A", "Track", 421),
            (5, "A", "Track (Extended Mix)", 300),
        ]
        groups = text_groups(rows)
        assert groups == {
            f"{text_key('A', 'Track')}|300": (1, 2),
            f"{text_key('A', 'Track')}|420": (3, 4),
        }

    @pytest.mark.parametrize("duration", [None, 0, -5])
    def test_a_track_with_no_length_is_not_grouped_by_text(self, duration):
        rows = [(1, "A", "Track", 300), (2, "A", "Track", duration)]
        assert text_groups(rows) == {}

    def test_tracks_that_all_have_no_length_are_not_a_group(self):
        rows = [(1, "A", "Track", 0), (2, "A", "Track", 0)]
        assert text_groups(rows) == {}

    def test_a_track_with_no_key_is_left_out(self):
        rows = [(1, "", "Track", 300), (2, "", "Track", 300)]
        assert text_groups(rows) == {}

    def test_a_near_miss_by_three_seconds_is_not_a_group(self):
        assert text_groups([(1, "A", "Track", 300), (2, "A", "Track", 303)]) == {}
