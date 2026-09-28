"""Unit tests for BeatportApi (high-level)."""

from unittest.mock import Mock

from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient


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
