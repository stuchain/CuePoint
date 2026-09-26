#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Genres as a Discover run's picker reads them (DISCOVER-09).

``parse_catalog_genre`` and ``BeatportApi.genres``. DISCOVER-01's recording
holds no genre listing, so the listing is read the way every recorded v4
listing is — ``results`` pages, ``next`` null on the last — and the parser
keeps only what it can use. The method reads every page, where inCrate's
``list_genres`` reads the first; that one is left as it is for inCrate, and a
test holds that the two never share a cached answer.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.incrate.beatport_api_models import Genre
from cuepoint.services.beatport_api import MAX_LISTING_PAGES, BeatportApi
from cuepoint.services.beatport_api_client import classify_beatport_error
from cuepoint.services.beatport_catalog import MAX_TEXT_LENGTH, parse_catalog_genre
from tests.fixtures.beatport_world import BeatportWorld

pytestmark = pytest.mark.unit


class MemoryCache:
    """The two methods ``BeatportApi`` asks of its cache."""

    def __init__(self) -> None:
        self.values: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[Any]:
        return self.values.get(key)

    def set(self, key: str, value: Any, ttl: int = 0) -> None:
        self.values[key] = value


class TestTheParser:
    def test_a_genre(self):
        assert parse_catalog_genre(
            {"id": 5, "name": " House ", "slug": "house", "url": "x"}
        ) == Genre(id=5, name="House", slug="house")

    def test_an_id_written_as_digits_is_an_id(self):
        assert parse_catalog_genre({"id": "12", "name": "Deep House"}) == Genre(
            12, "Deep House", ""
        )

    @pytest.mark.parametrize(
        "item",
        [
            {"id": 0, "name": "Zero"},
            {"id": -3, "name": "Negative"},
            {"id": True, "name": "Boolean"},
            {"id": 4.5, "name": "Fraction"},
            {"name": "No id"},
            {"id": 7},
            {"id": 7, "name": "   "},
            {"id": 7, "name": ["House"]},
            "House",
            None,
        ],
    )
    def test_what_it_cannot_use_is_none(self, item):
        assert parse_catalog_genre(item) is None

    @pytest.mark.parametrize("slug", ["Not A Slug", "a--b", "-a", "a/b", 7, None, ""])
    def test_a_slug_that_is_not_one_is_dropped(self, slug):
        genre = parse_catalog_genre({"id": 7, "name": "Seven", "slug": slug})
        assert genre == Genre(7, "Seven", "")

    def test_a_slug_is_read_in_lower_case(self):
        assert parse_catalog_genre(
            {"id": 7, "name": "Seven", "slug": "Deep-House"}
        ) == (Genre(7, "Seven", "deep-house"))

    def test_a_long_name_is_bounded(self):
        genre = parse_catalog_genre({"id": 7, "name": "x" * 5000})
        assert genre is not None and len(genre.name) == MAX_TEXT_LENGTH


class TestTheListing:
    def test_every_page_in_order_each_once(self):
        world = BeatportWorld()
        world.genres = [(i, f"Genre {i}", f"genre-{i}") for i in range(1, 251)]
        world.genres.insert(120, (3, "Genre 3 again", "genre-3"))
        genres = BeatportApi(world).genres()
        assert [g.id for g in genres] == list(range(1, 251))
        assert world.paths("catalog/genres") == ["catalog/genres"] * 3
        assert all(params["per_page"] == 100 for _, params in world.requests)

    def test_it_stops_at_the_page_cap(self):
        world = BeatportWorld()
        world.genres = [
            (i, f"G{i}", "") for i in range(1, 100 * MAX_LISTING_PAGES + 50)
        ]
        genres = BeatportApi(world).genres()
        assert len(genres) == 100 * MAX_LISTING_PAGES
        assert len(world.requests) == MAX_LISTING_PAGES

    def test_what_beatport_wrote_badly_is_left_out(self):
        world = BeatportWorld()
        world.genres = [(0, "Zero", ""), (5, "House", "house"), (6, "", "")]
        assert BeatportApi(world).genres() == [Genre(5, "House", "house")]

    def test_a_refusal_is_raised_with_its_class(self):
        world = BeatportWorld()
        world.failures.append(lambda route, params, n: 401)
        with pytest.raises(BeatportAPIError) as refused:
            BeatportApi(world).genres()
        assert classify_beatport_error(refused.value) == "rejected"

    def test_it_is_kept_for_a_day_under_its_own_key(self):
        world = BeatportWorld()
        cache = MemoryCache()
        api = BeatportApi(world, cache_service=cache)
        first = api.genres()
        assert api.genres() == first
        assert len(world.requests) == 1
        assert list(cache.values) == ["beatport_api:catalog_genres"]

    def test_inCrates_cached_first_page_is_never_read_as_the_whole(self):
        world = BeatportWorld()
        cache = MemoryCache()
        cache.set("beatport_api:genres", [Genre(99, "Only page one", "")])
        assert [g.id for g in BeatportApi(world, cache_service=cache).genres()] == [
            5,
            6,
            12,
        ]

    def test_an_empty_answer_is_not_kept(self):
        world = BeatportWorld()
        world.genres = []
        cache = MemoryCache()
        api = BeatportApi(world, cache_service=cache)
        assert api.genres() == []
        assert cache.values == {}
        world.genres = [(5, "House", "house")]
        assert api.genres() == [Genre(5, "House", "house")]
