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
- **The v4 API answers from it too** (DISCOVER-10): the first entry matching a
  request's method, path and listed parameters, a 404 for anything else, and
  never the network — through the real client, so a refusal in the file is
  classified as Beatport's own would be.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from cuepoint.data import beatport, beatport_fixture
from cuepoint.data.beatport_fixture import (
    ENV_VAR,
    UNLISTED_STATUS,
    BeatportFixtureError,
    load,
)
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services import artwork_service
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import (
    BeatportApiClient,
    classify_beatport_error,
)

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
            ({"api": {}}, "api must be a list"),
            ({"api": ["catalog/genres"]}, "is an object"),
            ({"api": [{"path": "a", "query": {}}]}, "does not take query"),
            ({"api": [{"path": "a", "method": "PUT"}]}, "GET or POST"),
            ({"api": [{"path": "a", "method": 1}]}, "GET or POST"),
            ({"api": [{"body": {}}]}, "needs a 'path'"),
            ({"api": [{"path": " / "}]}, "needs a 'path'"),
            ({"api": [{"path": "a", "json": {}}]}, "matches on 'params'"),
            ({"api": [{"path": "a", "method": "POST", "params": {}}]}, "on 'json'"),
            ({"api": [{"path": "a", "params": []}]}, "plain values"),
            ({"api": [{"path": "a", "params": {"x": [1]}}]}, "plain values"),
            ({"api": [{"path": "a", "status": "200"}]}, "whole number"),
            ({"api": [{"path": "a", "status": True}]}, "whole number"),
            ({"api": [{"path": "a", "status": 999}]}, "HTTP status"),
            ({"api": [{"path": "a", "headers": {"Retry-After": 5}}]}, "names to text"),
            ({"api": [{"path": "a", "delay_ms": "5"}]}, "delay_ms is a whole"),
            ({"api": [{"path": "a", "delay_ms": 30_001}]}, "delay_ms is 0 to 30000"),
            ({"api": [{"path": "a", "delay_ms": -1}]}, "delay_ms is 0 to 30000"),
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
        assert fixture.api_answer("GET", "catalog/genres/").status == UNLISTED_STATUS


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


#: A small catalog: genres, one chart listing that ignores its dates, a chart's
#: tracks, a refused playlist and a rate limit.
API = {
    "api": [
        {
            "path": "/catalog/genres/",
            "body": {"results": [{"id": 5, "name": "House", "slug": "house"}]},
        },
        {
            "path": "catalog/charts",
            "params": {"genre_id": 5, "page": 1},
            "body": {"results": [{"id": 501, "name": "Peak"}], "next": None},
        },
        {
            "path": "catalog/charts",
            "params": {"genre_id": 5},
            "body": {"results": [], "next": None},
        },
        {"path": "catalog/charts", "params": {"genre_id": 6}, "status": 401},
        {
            "path": "catalog/charts",
            "params": {"genre_id": 7},
            "status": 429,
            "headers": {"Retry-After": "120"},
        },
        {"path": "catalog/tracks", "params": {"public": True}, "body": {"n": 1}},
        {
            "method": "post",
            "path": "my/playlists/",
            "json": {"name": "Friday"},
            "body": {"id": 9001, "name": "Friday"},
        },
        {"method": "POST", "path": "my/playlists", "status": 403},
    ]
}


@pytest.fixture
def api(monkeypatch, tmp_path):
    path = write(tmp_path, API)
    monkeypatch.setenv(ENV_VAR, str(path))
    return load(path)


def client(token: str = "e2e-token") -> BeatportApiClient:
    return BeatportApiClient(
        "https://api.beatport.com/v4", token, sleep=lambda _seconds: None
    )


@pytest.mark.unit
class TestTheApiEntries:
    def test_the_first_entry_matching_method_path_and_params_answers(self, api):
        first = api.api_answer("GET", "catalog/charts/", {"genre_id": 5, "page": 1})
        assert first.status == 200
        assert first.body["results"] == [{"id": 501, "name": "Peak"}]
        # The same path on a later page falls to the next entry.
        later = api.api_answer("GET", "catalog/charts", {"genre_id": "5", "page": 2})
        assert later.body == {"results": [], "next": None}

    def test_parameters_an_entry_does_not_list_are_not_compared(self, api):
        answer = api.api_answer(
            "GET",
            "catalog/charts",
            {"genre_id": 5, "page": 1, "publish_date": "2026-01-01:2026-01-31"},
        )
        assert answer.body["results"][0]["id"] == 501

    def test_a_listed_parameter_the_request_lacks_does_not_match(self, api):
        assert api.api_answer("GET", "catalog/charts", {}).status == UNLISTED_STATUS

    def test_values_are_compared_as_a_query_string_carries_them(self, api):
        for sent in (True, "true"):
            answer = api.api_answer("GET", "catalog/tracks", {"public": sent})
            assert answer.body == {"n": 1}
        capital = api.api_answer("GET", "catalog/tracks", {"public": "True"})
        assert capital.status == UNLISTED_STATUS

    def test_a_post_matches_on_its_body_and_its_method_ignoring_case(self, api):
        made = api.api_answer("POST", "my/playlists", body={"name": "Friday"})
        assert made.body == {"id": 9001, "name": "Friday"}
        other = api.api_answer("POST", "/my/playlists/", body={"name": "Other"})
        assert other.status == 403
        # A GET to the same path is not the POST's answer.
        assert api.api_answer("GET", "my/playlists").status == UNLISTED_STATUS

    def test_an_answer_carries_its_headers_and_a_json_body(self, api):
        answer = api.api_answer("GET", "catalog/charts", {"genre_id": 7})
        assert answer.headers == {"Retry-After": "120"}
        assert answer.content() == b"null"

    def test_anything_unlisted_is_a_404(self, api):
        assert api.api_answer("GET", "catalog/labels/3").status == UNLISTED_STATUS


@pytest.mark.unit
class TestTheClientAnswersFromTheFile:
    def test_a_listing_is_read_and_paged_as_a_live_one_would_be(self, api):
        genres = BeatportApi(client()).genres()
        assert [(g.id, g.name, g.slug) for g in genres] == [(5, "House", "house")]

    def test_an_unlisted_path_is_what_a_404_is_to_the_client(self, api):
        assert client().get("catalog/labels/3/") is None

    def test_a_refusal_in_the_file_is_classified_as_beatport_would_be(self, api):
        with pytest.raises(BeatportAPIError) as rejected:
            client().get("catalog/charts/", {"genre_id": 6})
        assert classify_beatport_error(rejected.value) == "rejected"

        with pytest.raises(BeatportAPIError) as limited:
            client().get("catalog/charts/", {"genre_id": 7})
        assert classify_beatport_error(limited.value) == "rate_limited"
        # Longer than the client waits out, so reported with Beatport's figure.
        assert limited.value.retry_after == 120.0

        with pytest.raises(BeatportAPIError) as forbidden:
            client().post("my/playlists/", {"name": "Other"})
        assert classify_beatport_error(forbidden.value) == "forbidden"

    def test_a_post_answers_its_body(self, api):
        assert client().post("my/playlists/", {"name": "Friday"}) == {
            "id": 9001,
            "name": "Friday",
        }

    def test_an_answer_held_back_arrives_after_its_delay(self, tmp_path, monkeypatch):
        path = write(
            tmp_path,
            {
                "api": [
                    {"path": "catalog/genres", "delay_ms": 150, "body": {"results": []}}
                ]
            },
        )
        monkeypatch.setenv(ENV_VAR, str(path))
        began = time.monotonic()
        assert client().get("catalog/genres/") == {"results": []}
        assert time.monotonic() - began >= 0.14

    def test_no_token_is_still_refused_before_the_file_is_asked(self, api):
        with pytest.raises(BeatportAPIError) as refused:
            client(token="").get("catalog/genres/")
        assert classify_beatport_error(refused.value) == "no_token"

    def test_nothing_reaches_the_network(self, api, monkeypatch):
        def refuse(*_args, **_kwargs):
            raise AssertionError("the network was reached")

        monkeypatch.setattr("requests.Session.request", refuse)
        assert BeatportApi(client()).genres()
        assert client().get("catalog/anything/") is None

    def test_without_the_variable_the_client_asks_the_network(self, monkeypatch):
        monkeypatch.delenv(ENV_VAR, raising=False)
        asked = []

        class Session:
            def request(self, method, url, **kwargs):
                asked.append((method, url))
                raise AssertionError("stop here")

        live = BeatportApiClient("https://api.beatport.com/v4", "t", session=Session())
        with pytest.raises(AssertionError, match="stop here"):
            live.get("catalog/genres/")
        assert asked == [("GET", "https://api.beatport.com/v4/catalog/genres/")]
