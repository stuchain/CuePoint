#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Charts as DISCOVER-05 reads them: ``parse_catalog_chart`` and ``BeatportApi.charts``.

The parser is held to the recorded chart page and chart (DISCOVER-01's spike),
so it reads what Beatport really sends. The listing is held to its two
promises: the window and the genre are applied here as well as asked for, so
the answer is right whether or not Beatport honours them, and it pages to the
cap and no further.
"""

from __future__ import annotations

import copy
import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from cuepoint.incrate.beatport_api_models import CatalogArtist, CatalogChart
from cuepoint.services.beatport_api import MAX_LISTING_PAGES, BeatportApi
from cuepoint.services.beatport_catalog import chart_web_url, parse_catalog_chart

RECORDED = Path(__file__).resolve().parents[2] / "fixtures" / "beatport_v4" / "recorded"


def recorded(name: str) -> Any:
    return json.loads((RECORDED / name).read_text(encoding="utf-8"))


class TestTheParser:
    def test_every_recorded_chart(self):
        page = recorded("charts_page.json")
        for item in page["results"]:
            chart = parse_catalog_chart(item)
            assert chart is not None
            assert chart.id == item["id"] and chart.name == item["name"].strip()
            assert chart.publish_date == item["publish_date"][:10]
            assert chart.genre_ids == tuple(g["id"] for g in item["genres"])
            assert chart.track_count == item["track_count"]
            assert (
                chart.url
                == f"https://www.beatport.com/chart/{item['slug']}/{item['id']}"
            )
            if item.get("artist"):
                assert chart.artist == CatalogArtist(
                    item["artist"]["id"], item["artist"]["name"]
                )
            else:
                assert chart.artist is None
            assert chart.owner_name == (
                (item.get("person") or {}).get("owner_name") or None
            )

    def test_the_recorded_chart_by_id(self):
        data = recorded("chart.json")
        chart = parse_catalog_chart(data)
        assert chart is not None
        assert (chart.id, chart.url) == (
            data["id"],
            chart_web_url(data["id"], data["slug"]),
        )
        assert chart.genre_ids == (90, 6)

    def test_djeffs_chart_is_his_and_owned_by_his_account(self):
        [item] = [
            c
            for c in recorded("charts_page.json")["results"]
            if (c.get("artist") or {}).get("name") == "DJEFF"
        ]
        chart = parse_catalog_chart(item)
        assert chart.artist == CatalogArtist(132419, "DJEFF")
        assert chart.owner_name == "OFFICIALDJEFFMUSIC"

    @pytest.mark.parametrize(
        "change",
        [{"id": None}, {"id": 0}, {"id": "abc"}, {"name": ""}, {"name": None}],
    )
    def test_no_id_or_no_name_is_nothing(self, change):
        item = copy.deepcopy(recorded("chart.json"))
        item.update(change)
        assert parse_catalog_chart(item) is None

    def test_missing_parts_are_none_never_guessed(self):
        chart = parse_catalog_chart({"id": 5, "name": "Bare"})
        assert chart == CatalogChart(
            id=5,
            name="Bare",
            url="https://www.beatport.com/chart/t/5",
            publish_date=None,
            artist=None,
            owner_name=None,
            genre_ids=(),
            track_count=None,
        )

    def test_odd_values_are_refused_one_by_one(self):
        chart = parse_catalog_chart(
            {
                "id": 5,
                "name": " Odd ",
                "slug": "NOT A SLUG",
                "genres": [{"id": 6}, {"id": 6}, {"id": -1}, "x", {"id": "7"}],
                "track_count": True,
                "artist": {"id": 0, "name": "Nobody"},
                "person": {"owner_name": "  "},
            }
        )
        assert chart.name == "Odd"
        assert chart.url.endswith("/chart/t/5")
        assert chart.genre_ids == (6, 7)
        assert (chart.track_count, chart.artist, chart.owner_name) == (None, None, None)

    def test_not_an_object_is_nothing(self):
        assert parse_catalog_chart(["id", 5]) is None


def chart_item(chart_id: int, day: str, genres=(5,), artist=None) -> Dict[str, Any]:
    return {
        "id": chart_id,
        "name": f"Chart {chart_id}",
        "slug": f"chart-{chart_id}",
        "publish_date": f"{day}T10:00:00-06:00",
        "genres": [{"id": g} for g in genres],
        "artist": artist,
        "person": {"owner_name": "someone"},
        "track_count": 10,
    }


class ListingClient:
    """Answers ``catalog/charts/`` with fixed pages, whatever the filters."""

    def __init__(
        self, pages: List[List[Dict[str, Any]]], endless: bool = False
    ) -> None:
        self.pages = pages
        self.endless = endless
        self.asked: List[Dict[str, Any]] = []

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        assert path == "/catalog/charts/"
        params = dict(params or {})
        self.asked.append(params)
        number = params["page"]
        items = self.pages[number - 1] if number <= len(self.pages) else []
        more = self.endless or number < len(self.pages)
        return {"results": items, "next": "next" if more else None}


class TestTheListing:
    SINCE, UNTIL = date(2026, 9, 1), date(2026, 9, 30)

    def test_it_asks_for_the_window_and_the_genre(self):
        client = ListingClient([[chart_item(1, "2026-09-05")]])
        BeatportApi(client).charts(5, self.SINCE, self.UNTIL)
        assert client.asked == [
            {
                "publish_date": "2026-09-01:2026-09-30",
                "per_page": 100,
                "genre_id": 5,
                "page": 1,
            }
        ]

    def test_no_genre_asks_for_every_genre(self):
        client = ListingClient([[chart_item(1, "2026-09-05")]])
        charts = BeatportApi(client).charts(None, self.SINCE, self.UNTIL)
        assert "genre_id" not in client.asked[0] and [c.id for c in charts] == [1]

    def test_the_window_and_genre_are_applied_here_too_newest_first(self):
        client = ListingClient(
            [
                [
                    chart_item(1, "2026-09-05"),
                    chart_item(2, "2026-08-31"),  # before the window
                    chart_item(3, "2026-09-20", genres=(6,)),  # another genre
                    chart_item(4, "2026-09-25", genres=(6, 5)),
                    chart_item(1, "2026-09-05"),  # repeated
                ],
                [
                    chart_item(5, "2026-10-01"),
                    {"id": None},
                    chart_item(6, "2026-09-10", genres=()),
                ],
            ]
        )
        charts = BeatportApi(client).charts(5, self.SINCE, self.UNTIL)
        assert [c.id for c in charts] == [4, 6, 1]

    def test_an_undated_chart_is_kept_as_the_filtered_listing_gave_it(self):
        item = chart_item(1, "2026-09-05")
        item["publish_date"] = None
        charts = BeatportApi(ListingClient([[item]])).charts(5, self.SINCE, self.UNTIL)
        assert [(c.id, c.publish_date) for c in charts] == [(1, None)]

    def test_it_stops_at_the_page_cap(self):
        client = ListingClient(
            [[chart_item(i, "2026-09-05")] for i in range(1, 50)], endless=True
        )
        charts = BeatportApi(client).charts(5, self.SINCE, self.UNTIL)
        assert len(client.asked) == MAX_LISTING_PAGES
        assert len(charts) == MAX_LISTING_PAGES

    def test_an_empty_listing(self):
        assert BeatportApi(ListingClient([[]])).charts(5, self.SINCE, self.UNTIL) == []
