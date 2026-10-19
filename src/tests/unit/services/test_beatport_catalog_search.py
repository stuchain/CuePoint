"""Clean's Beatport search through the signed-in catalog API (mocked HTTP)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, List, Optional
from unittest.mock import Mock

import pytest
import requests

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.core.matcher import best_beatport_match
from cuepoint.data import beatport, beatport_search, catalog_search, search_health
from cuepoint.models.config import SETTINGS
from cuepoint.models.track import Track
from cuepoint.services.beatport_catalog import parse_catalog_track
from cuepoint.services.beatport_catalog_search import (
    BeatportCatalogSearch,
    track_details,
)
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.processor_service import ProcessorService

pytestmark = pytest.mark.unit

TOKEN = "dummy-token-not-a-real-credential"


def track_object(
    track_id=101, name="Glue", mix="Original Mix", artists=("Bicep",), **extra
) -> dict:
    """A ``catalog/search`` track, in the shape ``catalog/tracks`` items have."""
    obj = {
        "id": track_id,
        "name": name,
        "mix_name": mix,
        "slug": name.lower().replace(" ", "-"),
        "artists": [{"id": 900 + i, "name": a} for i, a in enumerate(artists)],
        "remixers": [],
        "bpm": 130,
        "key": {"camelot_number": 8, "camelot_letter": "A", "name": "A Minor"},
        "genre": {"id": 5, "name": "Melodic House & Techno"},
        "new_release_date": "2017-09-01",
        "release": {
            "id": 77,
            "name": "Bicep",
            "label": {"id": 12, "name": "Ninja Tune"},
        },
    }
    obj.update(extra)
    return obj


def reply(status: int, body: Any, headers: Optional[dict] = None):
    response = requests.Response()
    response.status_code = status
    response._content = json.dumps(body).encode()
    response.headers.update(headers or {})
    return response


class FakeSession:
    """Answers each API request from a queue and records it (never the headers)."""

    def __init__(self, *answers: Any):
        self.answers = list(answers)
        self.requests: List[tuple] = []
        self.headers: dict = {}

    def request(self, method, url, **kwargs):
        self.requests.append((method, url, kwargs.get("params")))
        answer = self.answers.pop(0) if self.answers else reply(200, {"tracks": []})
        if isinstance(answer, Exception):
            raise answer
        return answer

    def get(self, url, **kwargs):
        """The website path: always the Cloudflare refusal."""
        self.requests.append(("GET", url, None))
        return reply(403, {})


@pytest.fixture
def signed_in(monkeypatch):
    monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", TOKEN)
    monkeypatch.delenv("CUEPOINT_SKIP_BEATPORT", raising=False)
    SETTINGS["DDG_PREFLIGHT_ENABLED"] = False
    SETTINGS["USE_BROWSER_AUTOMATION"] = False


def provider_for(*answers) -> tuple[BeatportCatalogSearch, FakeSession]:
    session = FakeSession(*answers)
    session.slept = []
    provider = BeatportCatalogSearch(None, session=session, sleep=session.slept.append)
    return provider, session


class TestSearch:
    def test_a_found_track_carries_what_its_page_would_give(self, signed_in):
        provider, session = provider_for(reply(200, {"tracks": [track_object()]}))

        hits = provider.search("Glue Bicep", 25)

        assert len(hits) == 1
        assert hits[0].url == "https://www.beatport.com/track/glue/101"
        assert hits[0].details == (
            "Glue (Original Mix)",
            "Bicep",
            "Am",
            2017,
            "130",
            "Ninja Tune",
            "Melodic House & Techno",
            "Bicep",
            "2017-09-01",
        )
        _method, url, params = session.requests[0]
        assert url.endswith("/catalog/search/")
        assert params["q"] == "Glue Bicep" and params["type"] == "tracks"

    def test_remixers_join_the_artists_once(self, signed_in):
        obj = track_object(
            name="Tighter",
            mix="CamelPhat Remix",
            artists=("HOSH", "Jalja"),
            remixers=[{"id": 5, "name": "CamelPhat"}, {"id": 900, "name": "HOSH"}],
        )
        details = track_details(parse_catalog_track(obj))
        assert details[0] == "Tighter (CamelPhat Remix)"
        assert details[1] == "HOSH, Jalja, CamelPhat"

    @pytest.mark.parametrize(
        "body",
        [
            {"tracks": {"results": [track_object()], "count": 1}},
            {"results": [dict(track_object(), type="track")]},
        ],
    )
    def test_other_answer_shapes_are_read(self, signed_in, body):
        provider, _ = provider_for(reply(200, body))
        assert [h.url for h in provider.search("Glue", 10)] == [
            "https://www.beatport.com/track/glue/101"
        ]

    def test_a_search_with_nothing_is_an_empty_answer_not_an_error(self, signed_in):
        provider, session = provider_for(reply(200, {"tracks": []}))
        assert provider.search("Nothing Here", 10) == []
        assert len(session.requests) == 1

    def test_an_answer_with_no_tracks_part_asks_the_tracks_endpoint(self, signed_in):
        provider, session = provider_for(
            reply(200, {"artists": []}), reply(200, {"results": [track_object()]})
        )
        assert len(provider.search("Glue", 10)) == 1
        assert [r[1].rsplit("/v4", 1)[1] for r in session.requests] == [
            "/catalog/search/",
            "/catalog/tracks/",
        ]

    def test_a_404_asks_the_tracks_endpoint_too(self, signed_in):
        provider, _ = provider_for(
            reply(404, {}), reply(200, {"results": [track_object()]})
        )
        assert len(provider.search("Glue", 10)) == 1

    def test_the_same_track_twice_is_one_hit_and_the_limit_holds(self, signed_in):
        tracks = [track_object(1), track_object(1), track_object(2), track_object(3)]
        provider, _ = provider_for(reply(200, {"tracks": tracks}))
        assert len(provider.search("Glue", 2)) == 2

    def test_with_no_sign_in_it_is_not_available(self, monkeypatch):
        monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
        provider, session = provider_for()
        assert provider.available() is False
        assert session.requests == []


class TestFailures:
    @pytest.mark.parametrize("status", [401, 403])
    def test_a_refused_sign_in_is_signed_out(self, signed_in, status):
        provider, _ = provider_for(reply(status, {}))
        with pytest.raises(catalog_search.CatalogSearchError) as caught:
            provider.search("Glue", 10)
        assert caught.value.kind == search_health.KIND_SIGNED_OUT
        assert TOKEN not in str(caught.value)

    def test_a_rate_limit_is_reported_with_its_wait(self, signed_in):
        provider, session = provider_for(*[reply(429, {}, {"Retry-After": "120"})] * 2)
        with pytest.raises(catalog_search.CatalogSearchError) as caught:
            provider.search("Glue", 10)
        assert caught.value.kind == search_health.KIND_RATE_LIMITED
        assert caught.value.retry_after == 120
        assert caught.value.cooldown == 30  # the bounded wait, not Beatport's 120
        # Waited out once (at most 30 s), then failed because it persisted.
        assert len(session.requests) == 2
        assert session.slept == [pytest.approx(30.0, abs=0.1)]

    def test_a_rate_limit_that_lifts_does_not_fail_the_search(self, signed_in):
        provider, session = provider_for(
            reply(429, {}, {"Retry-After": "5"}),
            reply(200, {"tracks": [track_object()]}),
        )
        assert len(provider.search("Glue", 10)) == 1
        assert session.slept == [5.0]

    def test_a_timeout_fails_once_without_retrying(self, signed_in):
        provider, session = provider_for(requests.ReadTimeout("slow"))
        with pytest.raises(catalog_search.CatalogSearchError) as caught:
            provider.search("Glue", 10)
        assert caught.value.kind == search_health.KIND_TIMEOUT
        assert len(session.requests) == 1

    def test_a_server_error_is_unavailable(self, signed_in, monkeypatch):
        monkeypatch.setattr("time.sleep", lambda seconds: None)
        provider, _ = provider_for(*[reply(503, {})] * 5)
        with pytest.raises(catalog_search.CatalogSearchError) as caught:
            provider.search("Glue", 10)
        assert caught.value.kind == search_health.KIND_UNAVAILABLE

    def test_a_new_sign_in_clears_the_refusal(self, signed_in, monkeypatch):
        provider, _ = provider_for(reply(401, {}))
        with pytest.raises(catalog_search.CatalogSearchError):
            provider.search("Glue", 10)
        search_health.mark_down(
            search_health.BACKEND_BEATPORT_API, search_health.KIND_SIGNED_OUT
        )
        monkeypatch.setenv("BEATPORT_ACCESS_TOKEN", TOKEN + "-renewed")
        assert provider.available() is True
        assert search_health.is_down(search_health.BACKEND_BEATPORT_API) is False


def _process(title="Glue", artist="Bicep"):
    processor = ProcessorService(
        beatport_service=Mock(),
        matcher_service=MatcherService(),
        logging_service=Mock(),
        config_service=Mock(),
    )
    return processor.process_track(
        1, Track(track_id="1", title=title, artist=artist), {"MIN_ACCEPT_SCORE": 70}
    )


@pytest.fixture
def no_website(monkeypatch):
    """Fail the test if the website or DuckDuckGo is asked anything."""

    class Boom:
        headers: dict = {}

        def get(self, *args, **kwargs):
            raise AssertionError("the website was asked")

    monkeypatch.setattr(beatport, "SESSION", Boom())
    monkeypatch.setattr(beatport_search, "SESSION", Boom())
    monkeypatch.setattr(
        beatport, "ddg_track_urls", lambda *a, **k: pytest.fail("DDG was asked")
    )


class TestInTheMatcher:
    def test_a_playlist_track_matches_from_the_api_alone(self, signed_in, no_website):
        provider, _ = provider_for(reply(200, {"tracks": [track_object()]}))
        catalog_search.set_provider(provider)

        result = _process()

        assert result.matched is True
        assert result.error is None
        assert result.beatport_url == "https://www.beatport.com/track/glue/101"
        assert result.beatport_label == "Ninja Tune"
        assert result.beatport_year == "2017"
        assert result.match_score >= 70

    def test_several_tracks_of_a_playlist_all_match(self, signed_in, no_website):
        tracks = [
            ("Glue", "Bicep", 101),
            ("Westworld", "Chiapet", 202),
            ("Tonal", "Jepe", 303),
        ]

        class Answers(FakeSession):
            def request(self, method, url, **kwargs):
                query = kwargs["params"]["q"]
                for title, artist, track_id in tracks:
                    if title in query:
                        found = track_object(track_id, title, "Original Mix", (artist,))
                        return reply(200, {"tracks": [found]})
                return reply(200, {"tracks": []})

        catalog_search.set_provider(BeatportCatalogSearch(None, session=Answers()))

        results = [_process(title, artist) for title, artist, _ in tracks]

        assert [r.matched for r in results] == [True, True, True]

    def test_scores_equal_those_of_the_same_details_read_from_a_page(
        self, signed_in, monkeypatch
    ):
        obj = track_object()
        details = track_details(parse_catalog_track(obj))
        url = "https://www.beatport.com/track/glue/101"

        provider, _ = provider_for(reply(200, {"tracks": [obj]}))
        catalog_search.set_provider(provider)
        via_api = best_beatport_match(1, "Glue", "Bicep", False, ["Glue Bicep"])

        catalog_search.set_provider(None)
        catalog_search.clear_prefetched()
        monkeypatch.setattr(beatport, "ddg_track_urls", lambda *a, **k: [url])
        monkeypatch.setattr("cuepoint.core.matcher.parse_track_page", lambda u: details)
        SETTINGS["USE_DIRECT_SEARCH_FOR_REMIXES"] = False
        SETTINGS["PREFER_DIRECT_SEARCH"] = False
        via_page = best_beatport_match(1, "Glue", "Bicep", False, ["Glue Bicep"])

        a, b = via_api[0], via_page[0]
        assert a is not None and b is not None
        assert (a.score, a.title_sim, a.artist_sim, a.guard_ok, a.reject_reason) == (
            b.score,
            b.title_sim,
            b.artist_sim,
            b.guard_ok,
            b.reject_reason,
        )

    def test_a_track_beatport_does_not_have_is_still_no_match(
        self, signed_in, no_website
    ):
        catalog_search.set_provider(provider_for()[0])

        result = _process("Nothing Like It", "Nobody")

        assert result.matched is False
        assert result.error is None

    @pytest.mark.parametrize(
        "answer, kind",
        [
            (reply(401, {}), "signed_out"),
            ((reply(429, {}, {"Retry-After": "120"}),) * 2, "rate_limited"),
            (reply(403, {}, {"cf-mitigated": "challenge"}), "blocked"),
            (requests.ConnectionError("down"), "network"),
            (requests.ReadTimeout("slow"), "timeout"),
        ],
    )
    def test_a_failed_api_search_is_a_failed_search(
        self, signed_in, no_website, answer, kind
    ):
        answers = answer if isinstance(answer, tuple) else (answer,)
        provider, _ = provider_for(*answers)
        catalog_search.set_provider(provider)

        result = _process()

        assert search_health.failure_kind(result.error) == kind
        assert TOKEN not in (result.error or "")

    def test_after_a_refusal_the_next_track_does_not_ask_again(
        self, signed_in, no_website
    ):
        provider, session = provider_for(reply(401, {}))
        catalog_search.set_provider(provider)
        _process()
        asked = len(session.requests)

        second = _process("Westworld", "Chiapet")

        assert len(session.requests) == asked
        assert search_health.failure_kind(second.error) == "signed_out"

    def test_with_no_sign_in_the_website_path_runs(self, monkeypatch):
        monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
        monkeypatch.delenv("CUEPOINT_SKIP_BEATPORT", raising=False)
        SETTINGS["DDG_PREFLIGHT_ENABLED"] = False
        SETTINGS["USE_BROWSER_AUTOMATION"] = False
        provider, api = provider_for()
        catalog_search.set_provider(provider)
        web = FakeSession()
        monkeypatch.setattr(beatport, "SESSION", web)
        monkeypatch.setattr(beatport_search, "SESSION", web)

        class EmptyDdgs:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def text(self, *args, **kwargs):
                return []

        monkeypatch.setattr(beatport, "DDGS", EmptyDdgs)

        result = _process()

        assert api.requests == []
        assert web.requests  # the website was asked instead
        assert search_health.failure_kind(result.error) == "blocked"


class TestFailureHandling:
    def test_a_403_html_page_is_blocked_not_signed_out(self, signed_in):
        html = requests.Response()
        html.status_code = 403
        html._content = b"<!DOCTYPE html><title>Just a moment...</title>"
        provider, _ = provider_for(html)
        with pytest.raises(catalog_search.CatalogSearchError) as caught:
            provider.search("Glue", 10)
        assert caught.value.kind == search_health.KIND_BLOCKED

    def test_a_lost_connection_is_a_network_failure_with_a_cooldown(self, signed_in):
        provider, session = provider_for(requests.ConnectionError("down"))
        with pytest.raises(catalog_search.CatalogSearchError) as caught:
            provider.search("Glue", 10)
        assert caught.value.kind == search_health.KIND_NETWORK
        assert caught.value.cooldown == 30
        assert len(session.requests) == 1

    def test_a_timeout_pauses_searching_for_the_next_tracks(self, signed_in):
        provider, session = provider_for(requests.ReadTimeout("slow"))
        catalog_search.set_provider(provider)
        with search_health.collect() as log:
            assert beatport.track_urls(1, "Glue Bicep", 10) == []
            asked = len(session.requests)
            assert beatport.track_urls(1, "Westworld Chiapet", 10) == []
        assert len(session.requests) == asked
        assert log.worst_kind() == search_health.KIND_TIMEOUT

    def test_three_server_errors_in_a_row_pause_searching(self, signed_in, monkeypatch):
        monkeypatch.setattr("time.sleep", lambda seconds: None)
        provider, _ = provider_for(*[reply(503, {})] * 20)
        catalog_search.set_provider(provider)
        for _ in range(3):
            beatport.track_urls(1, "Glue", 10)
        assert search_health.is_down(search_health.BACKEND_BEATPORT_API) is True

    def test_a_plain_400_is_no_results_not_a_failure(self, signed_in):
        provider, session = provider_for(reply(400, {}), reply(400, {}))
        assert provider.search("Glue", 10) == []
        assert len(session.requests) == 2  # the search, then the tracks fallback

    def test_tracks_that_cannot_be_read_are_a_failed_search(self, signed_in):
        provider, _ = provider_for(reply(200, {"tracks": [{"name": "no id"}]}))
        with pytest.raises(catalog_search.CatalogSearchError) as caught:
            provider.search("Glue", 10)
        assert caught.value.kind == search_health.KIND_UNAVAILABLE
        assert "unreadable" in caught.value.detail

    def test_an_unexpected_provider_error_is_a_failed_search(self, signed_in):
        class Broken:
            def available(self):
                return True

            def search(self, query, max_results):
                raise KeyError("surprise")

        catalog_search.set_provider(Broken())
        with search_health.collect() as log:
            assert beatport.track_urls(1, "Glue", 10) == []
        assert log.worst_kind() == search_health.KIND_UNAVAILABLE
        assert "KeyError" in log.describe()


FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def _search_answer() -> dict:
    path = FIXTURES / "beatport_v4" / "search_tracks.json"
    return json.loads(path.read_text("utf-8"))


class TestConstructedShapes:
    def test_the_constructed_search_answer_is_read(self, signed_in):
        provider, _ = provider_for(reply(200, _search_answer()))

        hits = provider.search("Lantern Signal", 25)

        assert [h.url for h in hits] == [
            "https://www.beatport.com/track/lantern-signal/19000001",
            "https://www.beatport.com/track/lantern-signal/19000002",
        ]
        assert hits[0].details[0] == "Lantern Signal (Dub Phizix Jr Remix)"
        assert hits[0].details[1] == "Mara Veil, \u00d3scar Lindqvist, Dub Phizix Jr"
        assert hits[0].details[3] == 2026

    def test_previews_and_artwork_are_remembered_so_nothing_is_scraped(self, signed_in):
        provider, _ = provider_for(reply(200, _search_answer()))
        catalog_search.set_provider(provider)

        urls = beatport.track_urls(1, "Lantern Signal", 10)

        assert beatport.page_preview_url(urls[0]) == (
            "https://geo-samples.beatport.com/track/19000001.LOFI.mp3"
        )
        assert beatport.page_artwork_url(urls[0]) == (
            "https://geo-media.beatport.com/image_size/1400x1400/4500001.jpg"
        )

    def test_the_api_and_a_page_for_one_track_agree_and_score_alike(self, monkeypatch):
        from bs4 import BeautifulSoup

        from cuepoint.core.matcher import score_components

        via_api = track_details(parse_catalog_track(_search_answer()["tracks"][0]))
        html = (FIXTURES / "beatport_v4" / "search_track_page.html").read_text("utf-8")
        monkeypatch.setattr(
            beatport, "request_html", lambda url: BeautifulSoup(html, "lxml")
        )
        via_page = beatport.parse_track_page(
            "https://www.beatport.com/track/x/19000001"
        )

        assert via_api[0] == via_page[0] == "Lantern Signal (Dub Phizix Jr Remix)"
        assert via_api[1] == via_page[1]
        assert via_api[3] == via_page[3] == 2026
        title, artists = "Lantern Signal (Dub Phizix Jr Remix)", "Mara Veil"
        assert score_components(title, artists, via_api[0], via_api[1]) == (
            score_components(title, artists, via_page[0], via_page[1])
        )


class TestRenewalGap:
    def test_a_search_survives_the_token_expiring_between_two_tokens(self, monkeypatch):
        import threading

        from cuepoint.services import beatport_token

        monkeypatch.delenv("BEATPORT_ACCESS_TOKEN", raising=False)
        monkeypatch.delenv("CUEPOINT_SKIP_BEATPORT", raising=False)
        beatport_token.set_session_token("old-session", time.time() + 5)
        seen: list = []

        class Session(FakeSession):
            def request(self, method, url, **kwargs):
                seen.append(kwargs["headers"]["Authorization"])
                return super().request(method, url, **kwargs)

        session = Session(reply(401, {}), reply(200, {"tracks": [track_object()]}))
        provider = BeatportCatalogSearch(None, session=session, sleep=lambda s: None)
        timer = threading.Timer(
            0.1, beatport_token.set_session_token, args=("new-session",)
        )
        timer.start()
        try:
            hits = provider.search("Glue", 10)
        finally:
            timer.join()
            beatport_token.set_session_token(None)
        assert len(hits) == 1
        assert seen == ["Bearer old-session", "Bearer new-session"]

    def test_the_refusal_is_recorded_for_the_token_the_request_sent(self, signed_in):
        provider, _ = provider_for()
        error = BeatportAPIError("x", status_code=401, error_code="BEATPORT_API_AUTH")
        error.token_used = "sent-token"
        provider._as_search_error(error, "start-token")
        assert provider._refused_token == provider._digest("sent-token")
