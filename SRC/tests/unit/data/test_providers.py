#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for search provider abstraction (Step 12)."""

from unittest.mock import patch

import pytest

from cuepoint.data.providers import (
    F001_PROVIDER_MISSING,
    BeatportProvider,
    get_active_provider,
    get_provider,
    list_providers,
    register_provider,
)


@pytest.mark.unit
class TestProviderRegistry:
    """Test provider registry (Design 12.8)."""

    def test_list_providers(self):
        """List returns beatport."""
        providers = list_providers()
        assert "beatport" in providers

    def test_get_provider_beatport(self):
        """Get beatport provider."""
        p = get_provider("beatport")
        assert p is not None
        assert p.name == "beatport"

    def test_get_provider_case_insensitive(self):
        """Provider names are case-insensitive."""
        p = get_provider("BEATPORT")
        assert p is not None
        assert p.name == "beatport"

    def test_get_provider_unknown(self):
        """Unknown provider returns None."""
        assert get_provider("unknown") is None
        assert get_provider("") is None

    def test_get_active_provider_default(self):
        """Default active provider is beatport."""
        p = get_active_provider(None)
        assert p.name == "beatport"

    def test_get_active_provider_explicit(self):
        """Explicit beatport works."""
        p = get_active_provider("beatport")
        assert p.name == "beatport"

    def test_get_active_provider_unknown_raises(self):
        """Unknown provider raises ValueError with F001."""
        with pytest.raises(ValueError) as exc:
            get_active_provider("nonexistent")
        assert F001_PROVIDER_MISSING in str(exc.value)


@pytest.mark.unit
class TestBeatportProviderContract:
    """Provider contract tests (Design 12.11, 12.74)."""

    def test_search_returns_list(self):
        """Search returns list of URLs."""
        provider = BeatportProvider()
        with patch("cuepoint.data.beatport_search.beatport_search_hybrid") as mock:
            mock.return_value = ["https://www.beatport.com/track/a/1"]
            result = provider.search(idx=0, query="Test", max_results=10)
        assert isinstance(result, list)
        assert len(result) == 1
        assert "beatport.com/track/" in result[0]

    def test_search_returns_empty_list_on_failure(self):
        """Search returns empty list when no results."""
        provider = BeatportProvider()
        with patch("cuepoint.data.beatport_search.beatport_search_hybrid") as mock:
            mock.return_value = []
            result = provider.search(idx=0, query="XyzNonexistent", max_results=10)
        assert result == []

    def test_parse_returns_required_fields(self):
        """Parse returns dict with required fields (Design 12.71)."""
        provider = BeatportProvider()
        with patch("cuepoint.data.beatport.parse_track_page") as mock:
            mock.return_value = (
                "Title",
                "Artist",
                "Am",
                2024,
                "128",
                "Label",
                "House",
                "Release",
                "2024-01-01",
            )
            result = provider.parse("https://www.beatport.com/track/t/123")
        assert result is not None
        assert "title" in result
        assert "artists" in result
        assert "key" in result
        assert "bpm" in result
        assert "year" in result
        assert result["title"] == "Title"
        assert result["artists"] == "Artist"

    def test_parse_handles_empty_result(self):
        """Parse handles empty title/artists from parse_track_page."""
        provider = BeatportProvider()
        with patch("cuepoint.data.beatport.parse_track_page") as mock:
            mock.return_value = ("", "", None, None, None, None, None, None, None)
            result = provider.parse("https://www.beatport.com/track/t/123")
        assert result is not None
        assert result["title"] == ""
        assert result["artists"] == ""


@pytest.mark.unit
class TestProviderRegistration:
    """Test register_provider for plugins/tests."""

    def test_register_provider(self):
        """Can register custom provider."""
        class FakeProvider:
            name = "fake"
            def search(self, idx, query, max_results=50):
                return []
            def parse(self, url):
                return {"title": "x", "artists": "y", "key": None, "year": None, "bpm": None, "label": None, "genres": None, "release_name": None, "release_date": None}

        register_provider("fake", FakeProvider())
        try:
            p = get_provider("fake")
            assert p is not None
            assert p.name == "fake"
        finally:
            # Cleanup - remove fake from registry
            from cuepoint.data import providers as mod
            mod._PROVIDERS.pop("fake", None)
