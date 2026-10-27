"""Beatport genre strings read as a list (M95)."""

from __future__ import annotations

import pytest

from cuepoint.core.genres import primary_genre, split_genres
from cuepoint.engine.library_api import track_to_dict
from cuepoint.models.library_track import LibraryTrack


def test_a_joined_string_becomes_each_genre_once():
    raw = "Indie Dance, House, Indie Dance|Dark Disco"
    assert split_genres(raw) == ["Indie Dance", "House", "Dark Disco"]
    assert primary_genre(raw) == "Indie Dance"


def test_repeats_ignore_case_and_spacing_and_keep_the_first_spelling():
    assert split_genres("Tech House,  tech   house ; TECH HOUSE") == ["Tech House"]


@pytest.mark.parametrize("name", ["Drum & Bass", "Hard Dance / Hardcore"])
def test_ampersand_and_slash_do_not_split_a_genre(name):
    assert split_genres(name) == [name]


@pytest.mark.parametrize("raw", [None, "", "  ", ", |;"])
def test_nothing_named_is_no_genre(raw):
    assert split_genres(raw) == []
    assert primary_genre(raw) is None


def test_the_track_payload_keeps_the_raw_genre_and_adds_the_primary():
    track = LibraryTrack(
        rekordbox_track_id="1",
        file_path="/music/1.mp3",
        title="T",
        artist="A",
        genre="Indie Dance, House, Indie Dance|Dark Disco",
    )
    payload = track_to_dict(track)
    assert payload["genre"] == "Indie Dance, House, Indie Dance|Dark Disco"
    assert payload["effective_genre"] == payload["genre"]
    assert payload["genres"] == ["Indie Dance", "House", "Dark Disco"]
    assert payload["genre_primary"] == "Indie Dance"


def test_a_track_without_a_genre_has_none():
    track = LibraryTrack(
        rekordbox_track_id="2", file_path="/music/2.mp3", title="T", artist="A"
    )
    payload = track_to_dict(track)
    assert payload["genres"] == []
    assert payload["genre_primary"] is None
