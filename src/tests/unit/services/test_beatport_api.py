"""Unit tests for BeatportApi (high-level)."""

from datetime import date
from unittest.mock import Mock

import pytest

from cuepoint.incrate.beatport_api_models import ChartDetail, ChartTrack, Genre
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient


class TestBeatportApiListGenres:
    """Test list_genres."""

    def test_list_genres_returns_list(self):
        """list_genres() returns List[Genre] from client.get."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = [
            {"id": 5, "name": "House", "slug": "house"},
            {"id": 12, "name": "Afro House", "slug": "afro-house"},
        ]
        api = BeatportApi(client, cache_service=None)
        result = api.list_genres()
        assert len(result) >= 1
        assert all(isinstance(g, Genre) for g in result)
        assert result[0].name == "House"
        assert result[0].slug == "house"

    def test_list_genres_caches(self):
        """Second call uses cache; client.get called once."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = [{"id": 1, "name": "House", "slug": "house"}]
        cache = Mock()
        cache.get.side_effect = [None, [Genre(1, "House", "house")]]
        api = BeatportApi(client, cache_service=cache)
        api.list_genres()
        api.list_genres()
        assert client.get.call_count == 1


class TestBeatportApiListCharts:
    """Test list_charts."""

    def test_list_charts_filters_by_date(self):
        """list_charts returns only charts with published_date in range."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = [
            {"id": 100, "name": "Jan Chart", "genre_id": 5, "author": {"name": "DJ"}, "published_date": "2025-01-15", "track_count": 10},
            {"id": 101, "name": "Mar Chart", "genre_id": 5, "author": {"name": "DJ"}, "published_date": "2025-03-01", "track_count": 20},
        ]
        api = BeatportApi(client, cache_service=None)
        result = api.list_charts(genre_id=5, from_date=date(2025, 1, 1), to_date=date(2025, 1, 31))
        assert len(result) == 1
        assert result[0].published_date == "2025-01-15"


class TestBeatportApiGetChart:
    """Test get_chart."""

    def test_get_chart_returns_detail(self):
        """get_chart(chart_id) returns ChartDetail with tracks."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = {
            "id": 12345,
            "name": "Top 10 February",
            "author": {"id": 1, "name": "Artist Name"},
            "published_date": "2025-02-15",
            "tracks": [
                {"id": 100, "title": "Track A", "artists": [{"name": "Artist 1"}], "url": "https://beatport.com/track/a/100", "position": 1},
            ],
        }
        api = BeatportApi(client, cache_service=None)
        detail = api.get_chart(12345)
        assert detail is not None
        assert isinstance(detail, ChartDetail)
        assert detail.id == 12345
        assert len(detail.tracks) == 1
        assert detail.tracks[0].title == "Track A"

    def test_get_chart_caches(self):
        """get_chart twice with cache: client.get called once."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = {"id": 1, "name": "C", "author": {"name": "X"}, "published_date": "2025-01-01", "tracks": []}
        cache = Mock()
        cache.get.side_effect = [None, ChartDetail(1, "C", "X", "2025-01-01", [])]
        api = BeatportApi(client, cache_service=cache)
        api.get_chart(1)
        api.get_chart(1)
        assert client.get.call_count == 1


class TestBeatportApiLabelReleases:
    """Test get_label_releases."""

    def test_get_label_releases_filters_date(self):
        """get_label_releases returns only releases with release_date in range."""
        client = Mock(spec=BeatportApiClient)
        releases_payload = [
            {"id": 1, "title": "R1", "release_date": "2025-01-10", "tracks": []},
            {"id": 2, "title": "R2", "release_date": "2025-03-01", "tracks": []},
        ]

        def get_side_effect(path, params=None):
            # Label releases list: return the two releases
            if f"/labels/" in path and "/releases" in path and "/tracks" not in path:
                return releases_payload
            if f"/catalog/labels/" in path and "/releases" in path and "/tracks" not in path:
                return releases_payload
            # Per-release tracks or label tracks fallback: return empty so we don't replace with virtual release
            if "/tracks" in path:
                return []
            return None

        client.get.side_effect = get_side_effect
        api = BeatportApi(client, cache_service=None)
        result = api.get_label_releases(label_id=1, from_date=date(2025, 1, 1), to_date=date(2025, 1, 31))
        assert len(result) == 1
        assert result[0].release_date == "2025-01-10"


class TestBeatportApiSearchLabel:
    """Test search_label_by_name."""

    def test_search_label_by_name_returns_id(self):
        """search_label_by_name returns first match id."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = [{"id": 42, "name": "Defected"}]
        api = BeatportApi(client, cache_service=None)
        out = api.search_label_by_name("Defected")
        assert out == 42

    def test_search_label_by_name_not_found_returns_none(self):
        """search_label_by_name returns None when no match."""
        client = Mock(spec=BeatportApiClient)
        client.get.return_value = []
        api = BeatportApi(client, cache_service=None)
        assert api.search_label_by_name("Nonexistent") is None

    def test_search_label_empty_name_returns_none(self):
        """search_label_by_name with empty name returns None."""
        client = Mock(spec=BeatportApiClient)
        api = BeatportApi(client, cache_service=None)
        assert api.search_label_by_name("") is None
        assert api.search_label_by_name("   ") is None
