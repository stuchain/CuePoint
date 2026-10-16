#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for what the Statistics page's Plays and Library tabs add (Round 4).

On the plays world of ``test_statistics_plays`` (eleven tracks, four reads): the
genres with the most plays, and in the spreads the scope's total time, average
BPM and most common artists and labels by tracks; and in the spread world the
health count of values not yet in the files. Every rule set a row returns is
also run through ``browse_count``: the number on the row and the Library it
opens are one statement.
"""

from __future__ import annotations

import pytest

from cuepoint.models.filter_rule import RuleSet
from tests.unit.services.test_statistics_plays import build_world, scope_of
from tests.unit.services.test_statistics_spreads import build_spread_world

pytestmark = pytest.mark.unit


@pytest.fixture
def world(tmp_path):
    built = build_world(tmp_path)
    with built.db.transaction() as conn:
        # Alpha 5:00, Bravo 2:00, Delta an unusable zero, Charlie none.
        for rekordbox_id, seconds in ((1, 300), (2, 120), (4, 0)):
            conn.execute(
                "UPDATE tracks SET duration_seconds = ? WHERE id = ?",
                (seconds, built.ids[rekordbox_id]),
            )
    yield built
    built.db.close_all()


def spreads(world, kind: str = "library") -> dict:
    return world.statistics.spreads(scope_of(world, kind)).to_dict()


class TestGenresByPlays:
    def test_two_spellings_are_one_genre_named_by_the_smallest(self, world):
        genres = world.plays()["genres"]

        assert [
            (g["name"], g["genre_key"], g["plays"], g["tracks"]) for g in genres
        ] == [
            # Alpha 20 and Bravo 9; "tech house" is the same genre.
            ("Tech House", "tech house", 29, 2),
            ("House", "house", 8, 1),
        ]

    def test_a_row_opens_exactly_the_tracks_it_counted(self, world):
        for row in world.plays()["genres"]:
            assert world.count(row["rules"]) == row["tracks"]
            assert row["opens_more"] is False

    def test_since_a_read_the_row_says_it_opens_more(self, world):
        answer = world.plays(since_read=world.reads[2])

        assert answer["genres"]
        assert all(row["opens_more"] for row in answer["genres"])

    def test_the_limit_cuts_the_list(self, world):
        assert [g["name"] for g in world.plays(limit=1)["genres"]] == ["Tech House"]

    def test_a_scope_narrows_it(self, world):
        genres = world.plays(scope=scope_of(world, "playlist"))["genres"]

        # Warm holds Alpha and Bravo (and two tracks without plays).
        assert [(g["name"], g["plays"]) for g in genres] == [("Tech House", 29)]


class TestTheMostPlayedTracksShowTheirKeyAndTempo:
    def test_the_key_and_bpm_are_the_ones_the_library_shows(self, world):
        tracks = world.plays()["tracks"]

        assert (tracks[0]["key"], tracks[0]["bpm"]) == ("9A", 128.0)
        assert all(
            (t["key"], t["bpm"]) == (None, None)
            for t in tracks
            if t["title"] != "Alpha"
        )


class TestTheLibraryTotals:
    def test_total_and_average_time_count_only_tracks_with_a_length(self, world):
        report = spreads(world)

        assert report["total_seconds"] == 420
        assert report["average_seconds"] == 210

    def test_average_bpm_is_over_tracks_with_a_tempo(self, world):
        with world.db.transaction() as conn:
            conn.execute("UPDATE tracks SET bpm = 126 WHERE id = ?", (world.ids[2],))

        # Alpha's override is 128, Bravo's imported 126.
        assert spreads(world)["average_bpm"] == 127.0

    def test_with_no_length_and_no_tempo_they_are_null(self, tmp_path):
        built = build_world(tmp_path / "bare")
        try:
            with built.db.transaction() as conn:
                conn.execute("UPDATE track_metadata SET bpm = NULL")
            report = spreads(built)
        finally:
            built.db.close_all()

        assert report["total_seconds"] == 0
        assert report["average_seconds"] is None
        assert report["average_bpm"] is None

    def test_a_scope_narrows_them(self, world):
        report = spreads(world, "playlist")

        # Warm: Alpha, Bravo, Hotel, India.
        assert report["total_seconds"] == 420
        assert report["average_seconds"] == 210
        assert report["total"] == 4


class TestArtistsAndLabelsByTracks:
    def test_artists_count_their_tracks_over_artist_and_remixer(self, world):
        artists = spreads(world)["artists"]

        assert [(a["name"], a["name_key"], a["tracks"]) for a in artists] == [
            # B: Alpha, Bravo, Charlie, Delta (remixer) and echo (twice, once).
            ("B", "b", 5),
            ("D", "d", 2),
            ("E", "e", 2),
            ("F", "f", 2),
            ("A", "a", 1),
            ("C", "c", 1),
        ]

    def test_labels_use_the_override_and_fold_case(self, world):
        labels = spreads(world)["labels"]

        assert [(row["name"], row["label_key"], row["tracks"]) for row in labels] == [
            ("Nightfall", "nightfall", 3),
            ("Other", "other", 2),
            ("Override Rec", "override rec", 1),
        ]

    @pytest.mark.parametrize("kind", ["library", "playlist", "collection"])
    def test_every_row_opens_exactly_its_tracks(self, world, kind):
        report = spreads(world, kind)

        for row in [*report["artists"], *report["labels"]]:
            assert world.count(row["rules"]) == row["tracks"], row["name"]

    def test_a_scope_counts_only_its_own_tracks(self, world):
        report = spreads(world, "playlist")

        assert [(a["name"], a["tracks"]) for a in report["artists"]] == [
            ("B", 2),
            ("F", 2),
            ("A", 1),
        ]
        assert [(row["name"], row["tracks"]) for row in report["labels"]] == [
            ("Nightfall", 2)
        ]


class TestNotSyncedToFiles:
    def test_it_counts_the_tracks_the_save_bar_counts(self, tmp_path):
        built = build_spread_world(tmp_path)
        try:
            answer = built.statistics.health(built.scope("library")).to_dict()
            opened = built.library.browse_count(
                rules=RuleSet.from_dict(answer["not_synced"]["rules"])
            )
        finally:
            built.store.close_all()
            built.db.close_all()

        assert answer["not_synced"]["rules"]["rules"] == [
            {"field": "unsaved_values", "operator": "is", "value": True}
        ]
        assert answer["not_synced"]["count"] == opened
        # Two tracks carry a CuePoint value their file does not hold (e and f).
        assert answer["not_synced"]["count"] == 2
