#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A track beside a candidate, field by field (CLEAN-12).

The Clean page marks where a track and a candidate differ. A mark that fires
for the same key in two notations, or for a genre Beatport qualifies in
brackets, is noise over the differences a person has to see; a mark that stays
quiet for a different key is a wrong decision waiting to be accepted. Both
directions are tested, and so is the third answer: nothing to compare.
"""

from __future__ import annotations

from typing import Any

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import MatchCandidate
from cuepoint.services.match_comparison import (
    COMPARED_FIELDS,
    compared_track,
    differences,
    mix_of,
)


def track(**fields: Any) -> LibraryTrack:
    values: dict = {
        "rekordbox_track_id": "1",
        "file_path": "/music/a.mp3",
        "title": "A Title",
        "artist": "An Artist",
    }
    values.update(fields)
    return LibraryTrack(**values)


def candidate(**fields: Any) -> MatchCandidate:
    values: dict = {
        "attempt_id": 1,
        "rank": 0,
        "url": "https://www.beatport.com/track/a-title/1",
        "score": 90.0,
        "guard_ok": True,
        "is_winner": True,
        "title": "A Title",
        "artists": "An Artist",
    }
    values.update(fields)
    return MatchCandidate(**values)


def differs(field: str, track_fields: dict, candidate_fields: dict) -> Any:
    return differences(track(**track_fields), candidate(**candidate_fields))[field]


@pytest.mark.unit
class TestTheVersionATitleNames:
    @pytest.mark.parametrize(
        "title, mix",
        [
            (None, None),
            ("", None),
            ("A Title", None),
            ("Never Sleep Again (CamelPhat Remix)", "CamelPhat Remix"),
            ("A Title [Extended Mix]", "Extended Mix"),
            ("A Title (feat. Someone)", None),
            ("A Title (2019)", None),
            ("A Title (Dub) [VIP]", "Dub / VIP"),
            ("A Title (Dub) (dub)", "Dub"),
            ("A Title - Original Mix", "Original Mix"),
            ("A Title (feat. Someone) (Radio  Edit)", "Radio Edit"),
        ],
    )
    def test_as_written(self, title, mix):
        assert mix_of(title) == mix


@pytest.mark.unit
class TestEachFieldIsComparedAsItsOwnKindOfValue:
    def test_every_field_is_answered_in_order(self):
        assert tuple(differences(track(), candidate())) == COMPARED_FIELDS

    @pytest.mark.parametrize(
        "ours, theirs, expected",
        [
            ("A Title", "a title", False),
            ("Déjà Vu (CamelPhat Remix)", "Deja Vu", False),
            ("A Title", "Another Title", True),
            ("", "A Title", None),
        ],
    )
    def test_title_is_the_words_without_the_brackets(self, ours, theirs, expected):
        assert differs("title", {"title": ours}, {"title": theirs}) is expected

    @pytest.mark.parametrize(
        "ours, theirs, expected",
        [
            ("An Artist & Guest", "Guest, An Artist", False),
            ("An Artist feat. Guest", "An Artist, Guest", False),
            ("An Artist", "An Artist, Guest", True),
            ("An Artist", None, None),
        ],
    )
    def test_artists_are_a_set_of_names(self, ours, theirs, expected):
        assert differs("artists", {"artist": ours}, {"artists": theirs}) is expected

    @pytest.mark.parametrize(
        "ours, theirs, expected",
        [
            ("A Title", "A Title (Original Mix)", False),
            ("A Title (Extended Mix)", "A Title (Extended Mix)", False),
            ("A Title", "A Title (Extended Mix)", True),
            ("A Title (Radio Edit)", "A Title (Extended Mix)", True),
            ("A Title (Extended Mix)", None, None),
        ],
    )
    def test_mix_is_the_kind_of_version(self, ours, theirs, expected):
        assert differs("mix", {"title": ours}, {"title": theirs}) is expected

    @pytest.mark.parametrize(
        "ours, theirs, expected",
        [
            ("CamelPhat & Elderbrook", "Elderbrook, CamelPhat", False),
            ("CamelPhat", "Elderbrook", True),
            (None, "CamelPhat", None),
        ],
    )
    def test_remixers_are_a_set_of_names(self, ours, theirs, expected):
        assert differs("remixers", {"remixer": ours}, {"remixers": theirs}) is expected

    @pytest.mark.parametrize(
        "field, ours, theirs, expected",
        [
            ("genre", "Techno", "Techno (Peak Time / Driving)", False),
            ("genre", "house", "House", False),
            ("genre", "Techno", "House", True),
            ("genre", "Techno", "", None),
            ("label", "Drumcode", "DRUMCODE", False),
            ("label", "Drumcode", "Afterlife", True),
            ("label", "   ", "Afterlife", None),
        ],
    )
    def test_label_and_genre_are_normalized_text(self, field, ours, theirs, expected):
        assert differs(field, {field: ours}, {field: theirs}) is expected

    @pytest.mark.parametrize(
        "ours, theirs, expected",
        [
            ("8A", "A Minor", False),
            ("Am", "A min", False),
            ("G#m", "Abm", False),
            ("12B", "E Major", False),
            ("8A", "9A", True),
            ("Am", "A Major", True),
            ("not a key", "NOT A KEY", False),
            ("not a key", "Am", True),
            (None, "Am", None),
        ],
    )
    def test_key_is_the_same_key_in_any_notation(self, ours, theirs, expected):
        assert differs("key", {"key": ours}, {"key": theirs}) is expected

    @pytest.mark.parametrize(
        "ours, theirs, expected",
        [
            (127.98, 128.0, False),
            (127.5, 128.0, False),
            # Half up, not to even: 126.5 is 127 to a DJ, and round() says 126.
            (126.5, 127.0, False),
            (127.49, 128.0, True),
            (126.0, 128.0, True),
            (None, 128.0, None),
            (128.0, None, None),
        ],
    )
    def test_bpm_is_the_same_whole_number(self, ours, theirs, expected):
        assert differs("bpm", {"bpm": ours}, {"bpm": theirs}) is expected

    @pytest.mark.parametrize(
        "ours, theirs, expected",
        [
            (2020, 2020, False),
            (2019, 2020, True),
            (None, 2020, None),
            (2020, None, None),
        ],
    )
    def test_year_is_the_release_year(self, ours, theirs, expected):
        assert differs("year", {"year": ours}, {"release_year": theirs}) is expected


@pytest.mark.unit
class TestTheTrackSide:
    def test_is_what_rekordbox_imported_with_the_version_its_title_names(self):
        assert compared_track(
            track(
                title="A Title (Extended Mix)",
                remixer="Someone",
                album="An Album",
                label="A Label",
                genre="Techno",
                key="8A",
                bpm=128.0,
                year=2021,
            )
        ) == {
            "title": "A Title (Extended Mix)",
            "artist": "An Artist",
            "mix": "Extended Mix",
            "remixer": "Someone",
            "album": "An Album",
            "label": "A Label",
            "genre": "Techno",
            "key": "8A",
            "bpm": 128.0,
            "year": 2021,
        }
