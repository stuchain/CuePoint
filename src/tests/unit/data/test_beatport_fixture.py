#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Beatport answered from files (CLEAN-14).

- **The file is read strictly.** A fixture that silently answered nothing would
  let an end-to-end journey pass without matching anything, so every malformed
  shape is refused by name.
- **Each hook answers from it**: a search, a track page parsed as a live one
  would be, and an image, and each answers nothing for what the file does not
  list.
- **Without the variable, nothing changes**, and ``CUEPOINT_SKIP_BEATPORT``
  still answers every search with nothing.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from cuepoint.data import beatport, beatport_fixture
from cuepoint.data.beatport_fixture import ENV_VAR, BeatportFixtureError, load
from cuepoint.services import artwork_service

JOURNEY = (
    Path(__file__).resolve().parents[2] / "fixtures" / "beatport" / "journey"
) / "fixture.json"

URL_ONE = "https://www.beatport.com/track/tone-one/1001"
URL_TWOS = "https://www.beatport.com/track/tone-twos/2002"
URL_EXTENDED = "https://www.beatport.com/track/tone-twos-extended/2001"
IMAGE = "https://geo-media.beatport.com/image_size/500x500/journey-cover.jpg"


def write(tmp_path: Path, data, name: str = "fixture.json") -> Path:
    path = tmp_path / name
    path.write_text(json.dumps(data) if not isinstance(data, str) else data, "utf-8")
    return path


@pytest.fixture
def journey(monkeypatch):
    monkeypatch.setenv(ENV_VAR, str(JOURNEY))
    return JOURNEY


@pytest.mark.unit
class TestReadingTheFile:
    def test_the_journey_fixture_reads(self):
        fixture = load(JOURNEY)
        assert len(fixture.searches) == 2
        assert set(fixture.pages) == {URL_ONE, URL_TWOS, URL_EXTENDED}
        assert fixture.root == JOURNEY.parent.resolve()

    @pytest.mark.parametrize(
        "data, message",
        [
            ("not json", "cannot read"),
            ([], "JSON object"),
            ({"searches": {}}, "searches must be a list"),
            ({"searches": ["tone"]}, "'contains' text"),
            ({"searches": [{"contains": 3, "urls": []}]}, "'contains' text"),
            ({"searches": [{"contains": "  ", "urls": []}]}, "cannot be blank"),
            ({"searches": [{"contains": "a", "urls": "x"}]}, "list of strings"),
            ({"searches": [{"contains": "a", "urls": [1]}]}, "list of strings"),
            ({"pages": ["x"]}, "pages must map"),
            ({"pages": {"u": 1}}, "pages must map"),
            ({"images": {"u": None}}, "images must map"),
        ],
    )
    def test_a_malformed_file_is_refused_by_name(self, tmp_path, data, message):
        with pytest.raises(BeatportFixtureError, match=message):
            load(write(tmp_path, data))

    def test_a_missing_file_is_refused(self, tmp_path):
        with pytest.raises(BeatportFixtureError, match="cannot read"):
            load(tmp_path / "nope.json")

    def test_an_empty_object_is_a_fixture_that_knows_nothing(self, tmp_path):
        fixture = load(write(tmp_path, {}))
        assert fixture.search("anything", 10) == []
        assert fixture.page(URL_ONE) is None
        assert fixture.image(IMAGE) is None


@pytest.mark.unit
class TestAnswering:
    def test_a_search_matches_ignoring_case(self):
        assert load(JOURNEY).search('"TONE ONE" Artist 1', 10) == [URL_ONE]

    def test_a_search_answers_every_matching_entry_in_order_each_once(self, tmp_path):
        fixture = load(
            write(
                tmp_path,
                {
                    "searches": [
                        {"contains": "tone", "urls": ["a", "b"]},
                        {"contains": "one", "urls": ["b", "c"]},
                        {"contains": "zzz", "urls": ["d"]},
                    ]
                },
            )
        )
        assert fixture.search("Tone One", 10) == ["a", "b", "c"]
        assert fixture.search("Tone One", 2) == ["a", "b"]
        assert fixture.search("Tone One", 0) == []
        assert fixture.search("", 10) == []

    def test_a_listed_page_is_its_file(self):
        html = load(JOURNEY).page(URL_ONE)
        assert html is not None and "<h1>Tone One</h1>" in html

    def test_a_listed_image_is_its_bytes(self):
        data = load(JOURNEY).image(IMAGE)
        assert data is not None and data[:2] == b"\xff\xd8"

    def test_a_page_outside_the_fixture_folder_is_refused(self, tmp_path):
        (tmp_path / "secret.txt").write_text("no", "utf-8")
        inner = tmp_path / "inner"
        inner.mkdir()
        fixture = load(write(inner, {"pages": {"u": "../secret.txt"}}))
        with pytest.raises(BeatportFixtureError, match="outside"):
            fixture.page("u")

    def test_a_listed_file_that_is_not_there_is_refused(self, tmp_path):
        fixture = load(write(tmp_path, {"images": {"u": "gone.jpg"}}))
        with pytest.raises(BeatportFixtureError, match="cannot read"):
            fixture.image("u")


@pytest.mark.unit
class TestTheEnvironment:
    def test_nothing_is_active_without_the_variable(self, monkeypatch):
        monkeypatch.delenv(ENV_VAR, raising=False)
        assert beatport_fixture.active() is None
        monkeypatch.setenv(ENV_VAR, "   ")
        assert beatport_fixture.active() is None

    def test_a_variable_naming_nothing_is_refused(self, monkeypatch, tmp_path):
        monkeypatch.setenv(ENV_VAR, str(tmp_path / "nope.json"))
        with pytest.raises(BeatportFixtureError, match="not there"):
            beatport_fixture.active()

    def test_the_file_is_read_again_when_it_changes(self, monkeypatch, tmp_path):
        path = write(tmp_path, {"searches": [{"contains": "a", "urls": ["one"]}]})
        monkeypatch.setenv(ENV_VAR, str(path))
        assert beatport_fixture.active().search("a", 5) == ["one"]
        assert beatport_fixture.active() is beatport_fixture.active()

        write(tmp_path, {"searches": [{"contains": "a", "urls": ["two"]}]})
        later = time.time() + 5
        os.utime(path, (later, later))
        assert beatport_fixture.active().search("a", 5) == ["two"]


@pytest.mark.unit
class TestTheHooks:
    def test_a_search_answers_from_the_fixture(self, journey, monkeypatch):
        monkeypatch.delenv("CUEPOINT_SKIP_BEATPORT", raising=False)
        assert beatport.track_urls(1, "Tone Two Artist 2", 10) == [
            URL_TWOS,
            URL_EXTENDED,
        ]
        assert beatport.track_urls(1, "Somebody Else", 10) == []

    def test_skipping_beatport_still_wins(self, journey, monkeypatch):
        monkeypatch.setenv("CUEPOINT_SKIP_BEATPORT", "1")
        assert beatport.track_urls(1, "Tone One", 10) == []

    def test_a_page_is_parsed_as_a_live_one_would_be(self, journey):
        assert beatport.parse_track_page(URL_EXTENDED) == (
            "Tones Twos (Extended Mix)",
            "Artist Two",
            "E Minor",
            2019,
            "125",
            "Drumcode",
            "Techno (Peak Time / Driving)",
            "Tone Twos",
            "2019-06-07",
        )

    def test_a_page_names_its_artwork(self, journey):
        beatport.parse_track_page(URL_ONE)
        assert beatport.page_artwork_url(URL_ONE) == (
            "https://geo-media.beatport.com/image_size/1400x1400/journey-cover.jpg"
        )

    def test_a_page_the_fixture_does_not_list_is_gone(self, journey):
        assert beatport.request_html("https://www.beatport.com/track/x/9") is None

    def test_an_image_answers_from_the_fixture(self, journey):
        assert artwork_service.fetch_image(IMAGE) == load(JOURNEY).image(IMAGE)

    def test_an_image_off_beatport_is_still_refused_first(self, journey):
        assert artwork_service.fetch_image("https://example.com/cover.jpg") is None

    def test_nothing_is_fetched_from_the_network(self, journey, monkeypatch):
        def refuse(*_args, **_kwargs):
            raise AssertionError("the network was reached")

        monkeypatch.setattr(beatport.SESSION, "get", refuse)
        monkeypatch.setattr("requests.get", refuse)
        assert beatport.track_urls(1, "Tone One", 10) == [URL_ONE]
        assert beatport.parse_track_page(URL_ONE)[0] == "Tone One"
        assert artwork_service.fetch_image(IMAGE) is not None
