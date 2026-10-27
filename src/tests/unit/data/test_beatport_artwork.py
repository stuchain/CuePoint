#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Beatport's artwork, read from a recorded track page (CLEAN-09).

The page shape is outside this repository's control, so the parser is tested
against a page recorded from Beatport before it was written, not a guessed one:

- **The recorded page yields its release artwork**, and a page with none yields
  none.
- **Only the page's own track counts**: the charts and recommendations on the
  same page carry other releases' images.
- **Only Beatport's hosts, over HTTPS**, whatever the page says.
- **Scores do not move** (cross-cutting fact 4): every recorded page scores,
  wins and is rejected exactly as it did before the parser learned about artwork.
- **The stored candidate carries the URL**, and nothing about artwork can cost
  a parse.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional
from unittest import mock

import pytest
from bs4 import BeautifulSoup

from cuepoint.data import beatport
from cuepoint.data.beatport import (
    artwork_url_at_size,
    artwork_url_from_page,
    is_beatport_artwork_url,
    is_beatport_media_url,
    page_artwork_url,
    page_preview_url,
    parse_track_page,
    remember_page_artwork,
    remember_page_preview,
    sample_url_from_page,
)
from tests.fixtures import beatport_scoring
from tests.fixtures.beatport_scoring import PAGES, score_recorded_pages

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "beatport"

STROBE = "https://www.beatport.com/track/strobe/1696999"
STANDARD = "https://www.beatport.com/track/test-track/123"
STROBE_ARTWORK = (
    "https://geo-media.beatport.com/image_size/{w}x{h}/"
    "8b2c0d49-7017-4b9d-bcf6-6cc8f66e6bfa.jpg"
)


@pytest.fixture(autouse=True)
def forget_pages():
    with beatport._page_artwork_lock:
        beatport._page_artwork.clear()
        beatport._page_preview.clear()
    yield
    with beatport._page_artwork_lock:
        beatport._page_artwork.clear()
        beatport._page_preview.clear()


def soup_of(name: str) -> BeautifulSoup:
    return BeautifulSoup((FIXTURES / name).read_text(encoding="utf-8"), "lxml")


def page(
    queries: Optional[list] = None, meta: Optional[Dict[str, str]] = None
) -> BeautifulSoup:
    """A page with the given ``__NEXT_DATA__`` queries and ``og:``-style meta."""
    head = "".join(
        f'<meta {attr.split("=")[0]}="{attr.split("=")[1]}" content="{value}"/>'
        for attr, value in (meta or {}).items()
    )
    body = ""
    if queries is not None:
        data = {"props": {"pageProps": {"dehydratedState": {"queries": queries}}}}
        body = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script>'
    return BeautifulSoup(f"<html><head>{head}</head><body>{body}</body></html>", "lxml")


def query(key: str, image: Any) -> Dict[str, Any]:
    return {"queryKey": [key], "state": {"data": {"release": {"image_url": image}}}}


@pytest.mark.unit
class TestTheRecordedPage:
    def test_the_recorded_page_yields_its_release_artwork(self):
        assert (
            artwork_url_from_page(soup_of("track_page_artwork.html")) == STROBE_ARTWORK
        )

    def test_a_page_with_no_image_data_yields_none(self):
        assert artwork_url_from_page(soup_of("track_page_standard.html")) is None

    def test_parsing_the_page_remembers_its_artwork_for_the_matcher(self):
        with mock.patch.object(
            beatport, "request_html", side_effect=beatport_scoring._soup
        ):
            parse_track_page(STROBE)
            parse_track_page(STANDARD)

        assert page_artwork_url(STROBE) == STROBE_ARTWORK
        assert page_artwork_url(STANDARD) is None

    def test_artwork_can_never_cost_a_parse(self):
        with mock.patch.object(
            beatport, "request_html", side_effect=beatport_scoring._soup
        ):
            parsed = parse_track_page(STROBE)
            with mock.patch.object(
                beatport, "artwork_url_from_page", side_effect=RuntimeError("shape")
            ):
                beatport._page_artwork.clear()
                again = parse_track_page(STROBE)

        assert again == parsed
        assert page_artwork_url(STROBE) is None


@pytest.mark.unit
class TestWhichImage:
    def test_the_track_details_query_wins_over_charts_listed_before_it(self):
        found = artwork_url_from_page(
            page(
                [
                    query("track-1-charts", "https://geo-media.beatport.com/chart.jpg"),
                    query("track-details-1", "https://geo-media.beatport.com/own.jpg"),
                ],
                {"property=og:image": "https://geo-media.beatport.com/og.jpg"},
            )
        )

        assert found == "https://geo-media.beatport.com/own.jpg"

    def test_without_track_details_the_page_meta_is_used(self):
        found = artwork_url_from_page(
            page(
                [query("track-1-charts", "https://geo-media.beatport.com/chart.jpg")],
                {"property=og:image": "https://geo-media.beatport.com/og.jpg"},
            )
        )

        assert found == "https://geo-media.beatport.com/og.jpg"

    @pytest.mark.parametrize("attr", ["name=twitter:image", "property=twitter:image"])
    def test_a_twitter_image_is_the_last_resort(self, attr):
        found = artwork_url_from_page(
            page(None, {attr: "https://geo-media.beatport.com/t.jpg"})
        )

        assert found == "https://geo-media.beatport.com/t.jpg"

    @pytest.mark.parametrize(
        "broken",
        [
            '<script id="__NEXT_DATA__">{not json</script>',
            '<script id="__NEXT_DATA__"></script>',
            '<script id="__NEXT_DATA__">{"props": null}</script>',
            '<script id="__NEXT_DATA__">{"props": {"pageProps": {"dehydratedState":'
            ' {"queries": [1, {"queryKey": "track-details"}, {"queryKey":'
            ' ["track-details-1"], "state": {"data": []}}]}}}}</script>',
        ],
    )
    def test_malformed_page_data_falls_back_without_raising(self, broken):
        soup = BeautifulSoup(
            '<html><head><meta property="og:image"'
            ' content="https://geo-media.beatport.com/og.jpg"/></head>'
            f"<body>{broken}</body></html>",
            "lxml",
        )

        assert artwork_url_from_page(soup) == "https://geo-media.beatport.com/og.jpg"

    def test_a_blank_image_is_no_image(self):
        assert artwork_url_from_page(page([query("track-details-1", "  ")])) is None

    @pytest.mark.parametrize(
        "image",
        [
            "http://geo-media.beatport.com/insecure.jpg",
            "https://evil.example/beatport.com.jpg",
            "https://beatport.com.evil.example/x.jpg",
            "https://notbeatport.com/x.jpg",
            "https://beatport.com@evil.example/x.jpg",
            "javascript:alert(1)",
            "file:///C:/Windows/win.ini",
        ],
    )
    def test_an_image_off_beatports_hosts_is_never_taken(self, image):
        assert artwork_url_from_page(page([query("track-details-1", image)])) is None
        assert artwork_url_from_page(page(None, {"property=og:image": image})) is None


@pytest.mark.unit
class TestHostsAndSizes:
    @pytest.mark.parametrize(
        "url",
        [
            "https://beatport.com/a.jpg",
            "https://geo-media.beatport.com/image_size/500x500/a.jpg",
            "https://GEO-MEDIA.Beatport.com/a.jpg",
        ],
    )
    def test_beatports_own_https_hosts_are_allowed(self, url):
        assert is_beatport_artwork_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            None,
            "",
            "   ",
            42,
            "https://",
            "ftp://beatport.com/a.jpg",
            "//beatport.com/a",
        ],
    )
    def test_anything_else_is_not(self, url):
        assert not is_beatport_artwork_url(url)

    def test_a_size_template_is_filled(self):
        assert artwork_url_at_size(STROBE_ARTWORK, 500) == STROBE_ARTWORK.replace(
            "{w}x{h}", "500x500"
        )

    def test_a_size_segment_is_replaced_once(self):
        url = "https://geo-media.beatport.com/image_size/1400x1400/image_size/9x9/a.jpg"

        assert artwork_url_at_size(url, 250) == (
            "https://geo-media.beatport.com/image_size/250x250/image_size/9x9/a.jpg"
        )

    def test_a_url_with_no_size_is_left_as_it_is(self):
        url = "https://geo-media.beatport.com/a.jpg"
        assert artwork_url_at_size(url, 500) == url


@pytest.mark.unit
class TestThePageMemory:
    def test_two_slugs_for_one_track_share_an_answer(self):
        remember_page_artwork(
            "https://www.beatport.com/track/old-slug/77", "https://beatport.com/a.jpg"
        )

        assert page_artwork_url("https://www.beatport.com/track/new-slug/77") == (
            "https://beatport.com/a.jpg"
        )

    def test_a_url_with_no_track_id_is_remembered_by_itself(self):
        remember_page_artwork(
            "https://www.beatport.com/release/x", "https://beatport.com/r.jpg"
        )

        assert (
            page_artwork_url("https://www.beatport.com/release/x")
            == "https://beatport.com/r.jpg"
        )
        assert page_artwork_url("https://www.beatport.com/release/y") is None

    def test_the_memory_is_bounded_and_forgets_the_oldest(self, monkeypatch):
        monkeypatch.setattr(beatport, "_PAGE_ARTWORK_LIMIT", 2)
        for number in (1, 2, 3):
            remember_page_artwork(
                f"https://www.beatport.com/track/t/{number}", f"u{number}"
            )

        assert page_artwork_url("https://www.beatport.com/track/t/1") is None
        assert page_artwork_url("https://www.beatport.com/track/t/3") == "u3"
        assert len(beatport._page_artwork) == 2

    def test_remembering_again_keeps_a_page_fresh(self, monkeypatch):
        monkeypatch.setattr(beatport, "_PAGE_ARTWORK_LIMIT", 2)
        remember_page_artwork("https://www.beatport.com/track/t/1", "u1")
        remember_page_artwork("https://www.beatport.com/track/t/2", "u2")
        remember_page_artwork("https://www.beatport.com/track/t/1", "u1")
        remember_page_artwork("https://www.beatport.com/track/t/3", "u3")

        assert page_artwork_url("https://www.beatport.com/track/t/1") == "u1"
        assert page_artwork_url("https://www.beatport.com/track/t/2") is None


STROBE_SAMPLE = "https://geo-samples.beatport.com/track/7ca684fe-b968-412b-bd7f-334eca8bb84e.LOFI.mp3"
SAMPLE = "https://geo-samples.beatport.com/track/own.LOFI.mp3"


def sample_query(key: str, sample: Any) -> Dict[str, Any]:
    return {"queryKey": [key], "state": {"data": {"sample_url": sample}}}


@pytest.mark.unit
class TestThePreviewSample:
    def test_the_recorded_page_yields_its_own_sample(self):
        assert sample_url_from_page(soup_of("track_page_artwork.html")) == STROBE_SAMPLE

    def test_a_page_with_no_sample_yields_none(self):
        assert sample_url_from_page(soup_of("track_page_standard.html")) is None

    def test_only_the_track_details_query_counts_not_the_recommendations(self):
        found = sample_url_from_page(
            page(
                [
                    sample_query("track-1-recommended", SAMPLE + "?other=1"),
                    sample_query("track-details-1", SAMPLE),
                    sample_query("track-2-more", SAMPLE + "?other=2"),
                ]
            )
        )

        assert found == SAMPLE

    def test_without_track_details_there_is_no_sample(self):
        assert sample_url_from_page(page([sample_query("charts", SAMPLE)])) is None

    @pytest.mark.parametrize(
        "sample",
        [
            "http://geo-samples.beatport.com/a.mp3",
            "https://evil.example/a.mp3",
            "https://beatport.com.evil.example/a.mp3",
            "",
            "   ",
            42,
        ],
    )
    def test_a_sample_off_beatports_media_hosts_is_never_taken(self, sample):
        assert (
            sample_url_from_page(page([sample_query("track-details-1", sample)]))
            is None
        )

    def test_malformed_page_data_yields_none_without_raising(self):
        broken = BeautifulSoup('<script id="__NEXT_DATA__">{not json</script>', "lxml")

        assert sample_url_from_page(broken) is None
        assert sample_url_from_page(page([])) is None

    def test_parsing_the_page_remembers_its_sample_for_the_matcher(self):
        with mock.patch.object(
            beatport, "request_html", side_effect=beatport_scoring._soup
        ):
            parse_track_page(STROBE)
            parse_track_page(STANDARD)

        assert page_preview_url(STROBE) == STROBE_SAMPLE
        assert page_preview_url(STANDARD) is None

    def test_a_sample_can_never_cost_a_parse(self):
        with mock.patch.object(
            beatport, "request_html", side_effect=beatport_scoring._soup
        ):
            parsed = parse_track_page(STROBE)
            with mock.patch.object(
                beatport, "sample_url_from_page", side_effect=RuntimeError("shape")
            ):
                beatport._page_preview.clear()
                again = parse_track_page(STROBE)

        assert again == parsed
        assert page_preview_url(STROBE) is None
        assert page_artwork_url(STROBE) == STROBE_ARTWORK

    def test_two_slugs_for_one_track_share_a_sample(self):
        remember_page_preview("https://www.beatport.com/track/old/77", SAMPLE)

        assert page_preview_url("https://www.beatport.com/track/new/77") == SAMPLE

    def test_the_memory_is_bounded_and_forgets_the_oldest(self, monkeypatch):
        monkeypatch.setattr(beatport, "_PAGE_ARTWORK_LIMIT", 2)
        for number in (1, 2, 3):
            remember_page_preview(
                f"https://www.beatport.com/track/t/{number}", f"u{number}"
            )

        assert page_preview_url("https://www.beatport.com/track/t/1") is None
        assert page_preview_url("https://www.beatport.com/track/t/3") == "u3"


@pytest.mark.unit
class TestOneUrlForTheCheckAndTheFetch:
    @pytest.mark.parametrize(
        "host", ["geo-samples.beatport.com", "geo-media.beatport.com"]
    )
    @pytest.mark.parametrize(
        "tail",
        [
            r"evil.com\@{host}/a.mp3",
            "user@{host}/a.mp3",
            "user:pass@{host}/a.mp3",
            "{host}:8443/a.mp3",
            "{host}:80/a.mp3",
            "{host}/a b.mp3",
            "{host}/a\tb.mp3",
            "{host}/a\nb.mp3",
            "{host}/a\\b.mp3",
            "{host}/a\x00.mp3",
            " {host}/a.mp3 \x07",
        ],
    )
    def test_an_ambiguous_url_is_refused_by_both_checks(self, host, tail):
        url = "https://" + tail.format(host=host)
        if host.startswith("geo-samples"):
            assert not is_beatport_media_url(url)
        else:
            assert not is_beatport_artwork_url(url)

    def test_the_default_https_port_is_fine(self):
        assert is_beatport_media_url("https://geo-samples.beatport.com:443/a.mp3")
        assert is_beatport_artwork_url("https://geo-media.beatport.com:443/a.jpg")

    def test_the_request_url_is_rebuilt_from_the_checked_parts(self):
        from cuepoint.data.beatport import beatport_request_url

        assert (
            beatport_request_url("https://GEO-Media.beatport.com:443/a/b.jpg?x=1#frag")
            == "https://geo-media.beatport.com/a/b.jpg?x=1"
        )
        assert beatport_request_url("https://evil.com/a.jpg") is None
        assert (
            beatport_request_url(r"https://evil.com\@geo-media.beatport.com/a") is None
        )


@pytest.mark.unit
class TestFirstTrackDetailsWithTheField:
    def test_a_later_track_details_query_supplies_a_missing_image(self):
        soup = page(
            [
                {"queryKey": ["track-details-1"], "state": {"data": {"release": {}}}},
                query("track-details-2", "https://geo-media.beatport.com/second.jpg"),
            ]
        )

        assert (
            artwork_url_from_page(soup) == "https://geo-media.beatport.com/second.jpg"
        )

    def test_a_later_track_details_query_supplies_a_missing_sample(self):
        soup = page(
            [
                {"queryKey": ["track-details-1"], "state": {"data": {"name": "x"}}},
                sample_query("track-details-2", SAMPLE),
            ]
        )

        assert sample_url_from_page(soup) == SAMPLE


@pytest.mark.unit
class TestMediaHosts:
    @pytest.mark.parametrize(
        "url",
        [
            "https://geo-samples.beatport.com/track/a.LOFI.mp3",
            "https://GEO-SAMPLES.Beatport.com/track/a.mp3",
        ],
    )
    def test_the_sample_host_beatport_uses_is_allowed(self, url):
        assert is_beatport_media_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            None,
            "",
            42,
            "http://geo-samples.beatport.com/a.mp3",
            "ftp://geo-samples.beatport.com/a.mp3",
            "https://geo-media.beatport.com/a.mp3",
            "https://beatport.com/a.mp3",
            "https://www.beatport.com/a.mp3",
            "https://geo-samples.beatport.com.evil.example/a.mp3",
            "https://evil.example/geo-samples.beatport.com/a.mp3",
            "https://user@geo-samples.beatport.com@evil.example/a.mp3",
        ],
    )
    def test_anything_else_is_not(self, url):
        assert not is_beatport_media_url(url)


@pytest.mark.unit
class TestScoringDoesNotMove:
    def test_every_recorded_page_scores_exactly_as_before_the_parser_change(self):
        # M454 moved only the Strobe page's title, "Strobe Original Mix" ->
        # "Strobe (Original Mix)": the heading's mix span keeps its
        # parentheses. Every score and winner is unchanged.
        baseline = json.loads(
            (FIXTURES / "scoring_baseline.json").read_text(encoding="utf-8")
        )

        assert json.loads(json.dumps(score_recorded_pages())) == baseline

    def test_the_baseline_covers_every_recorded_track_page(self):
        pages = {path.name for path in FIXTURES.glob("track_page_*.html")}

        assert set(PAGES.values()) == pages

    def test_the_stored_candidate_carries_the_artwork(self):
        from cuepoint.core import matcher

        case = beatport_scoring.CASES[0]
        with (
            mock.patch.object(
                beatport, "request_html", side_effect=beatport_scoring._soup
            ),
            mock.patch.object(matcher, "track_urls", return_value=list(PAGES)),
        ):
            _, candidates, _, _ = matcher.best_beatport_match(
                idx=1,
                track_title=case["title"],
                track_artists_for_scoring=case["artists"],
                title_only_mode=case["title_only"],
                queries=case["queries"],
                input_mix=case["mix"],
            )

        by_url = {candidate.url: candidate.artwork_url for candidate in candidates}
        assert by_url[STROBE] == STROBE_ARTWORK
        assert by_url[STANDARD] is None
        previews = {candidate.url: candidate.preview_url for candidate in candidates}
        assert previews[STROBE] == STROBE_SAMPLE
        assert previews[STANDARD] is None


@pytest.mark.unit
def test_no_recorded_page_carries_a_credential():
    # A page recorded from Beatport carries the anonymous session it was served
    # with. It is redacted when recorded, and must stay so.
    import re

    jwt = re.compile(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
    for page_file in FIXTURES.glob("*.html"):
        text = page_file.read_text(encoding="utf-8")
        assert not jwt.search(text), page_file.name
        assert '"access_token":"REDACTED"' in text or "access_token" not in text
