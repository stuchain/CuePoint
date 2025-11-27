#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for BeatportService."""

import pytest
from unittest.mock import Mock, patch, MagicMock

from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.interfaces import ICacheService, ILoggingService


@pytest.fixture
def mock_cache_service() -> Mock:
    """Create a mock cache service."""
    mock = Mock(spec=ICacheService)
    mock.get.return_value = None
    mock.set.return_value = None
    return mock


@pytest.fixture
def mock_logging_service() -> Mock:
    """Create a mock logging service."""
    mock = Mock(spec=ILoggingService)
    return mock


@pytest.fixture
def beatport_service(mock_cache_service, mock_logging_service) -> BeatportService:
    """Create a BeatportService instance with mocked dependencies."""
    return BeatportService(
        cache_service=mock_cache_service,
        logging_service=mock_logging_service
    )


@pytest.mark.unit
class TestBeatportService:
    """Test BeatportService."""

    def test_init(self, mock_cache_service, mock_logging_service):
        """Test service initialization."""
        service = BeatportService(mock_cache_service, mock_logging_service)
        
        assert service.cache_service == mock_cache_service
        assert service.logging_service == mock_logging_service

    def test_search_tracks_cache_hit(self, beatport_service, mock_cache_service, mock_logging_service):
        """Test search_tracks returns cached results when available."""
        cached_urls = ["https://www.beatport.com/track/test/123"]
        mock_cache_service.get.return_value = cached_urls
        
        result = beatport_service.search_tracks("test query", max_results=10)
        
        assert result == cached_urls
        mock_cache_service.get.assert_called_once_with("search:test query:10")
        mock_logging_service.debug.assert_called_once()
        # Should not call the actual search function
        mock_logging_service.info.assert_not_called()

    @patch('cuepoint.services.beatport_service.beatport_search_hybrid')
    def test_search_tracks_cache_miss(self, mock_search, beatport_service, mock_cache_service, mock_logging_service):
        """Test search_tracks performs search when cache miss."""
        mock_search.return_value = ["https://www.beatport.com/track/test/123"]
        mock_cache_service.get.return_value = None  # Cache miss
        
        result = beatport_service.search_tracks("test query", max_results=10)
        
        assert result == ["https://www.beatport.com/track/test/123"]
        mock_cache_service.get.assert_called_once_with("search:test query:10")
        mock_logging_service.info.assert_called_once()
        mock_search.assert_called_once_with(
            idx=0, query="test query", max_results=10, prefer_direct=True
        )
        mock_cache_service.set.assert_called_once_with(
            "search:test query:10", ["https://www.beatport.com/track/test/123"], ttl=3600
        )

    @patch('cuepoint.services.beatport_service.beatport_search_hybrid')
    def test_search_tracks_empty_results(self, mock_search, beatport_service, mock_cache_service):
        """Test search_tracks handles empty results."""
        mock_search.return_value = []
        mock_cache_service.get.return_value = None
        
        result = beatport_service.search_tracks("nonexistent", max_results=10)
        
        assert result == []
        mock_cache_service.set.assert_called_once_with("search:nonexistent:10", [], ttl=3600)

    def test_fetch_track_data_cache_hit(self, beatport_service, mock_cache_service):
        """Test fetch_track_data returns cached data when available."""
        cached_data = {"title": "Test Track", "artists": "Test Artist"}
        mock_cache_service.get.return_value = cached_data
        
        result = beatport_service.fetch_track_data("https://www.beatport.com/track/test/123")
        
        assert result == cached_data
        mock_cache_service.get.assert_called_once_with("track:https://www.beatport.com/track/test/123")

    @patch('cuepoint.services.beatport_service.parse_track_page')
    def test_fetch_track_data_cache_miss_success(self, mock_parse, beatport_service, mock_cache_service, mock_logging_service):
        """Test fetch_track_data fetches and caches data on cache miss."""
        # parse_track_page returns a tuple, not a dict
        track_tuple = ("Test Track", "Test Artist", "E Major", 2023, "128", "Test Label", "House", "Test Release", "2023-01-01")
        mock_parse.return_value = track_tuple
        mock_cache_service.get.return_value = None  # Cache miss
        
        result = beatport_service.fetch_track_data("https://www.beatport.com/track/test/123")
        
        # fetch_track_data converts tuple to dict
        assert result is not None
        assert isinstance(result, dict)
        assert result["title"] == "Test Track"
        assert result["artists"] == "Test Artist"
        mock_parse.assert_called_once_with("https://www.beatport.com/track/test/123")
        # Verify caching was called with the dict
        mock_cache_service.set.assert_called_once()
        call_args = mock_cache_service.set.call_args
        # Check positional arguments
        assert call_args[0][0] == "track:https://www.beatport.com/track/test/123"
        assert isinstance(call_args[0][1], dict)  # The track data dict
        # Check keyword arguments for TTL
        assert call_args[1]["ttl"] == 86400  # TTL passed as keyword argument

    @patch('cuepoint.services.beatport_service.parse_track_page')
    def test_fetch_track_data_cache_miss_failure(self, mock_parse, beatport_service, mock_cache_service, mock_logging_service):
        """Test fetch_track_data handles parse failure gracefully."""
        mock_parse.return_value = None
        mock_cache_service.get.return_value = None
        
        result = beatport_service.fetch_track_data("https://www.beatport.com/track/invalid/123")
        
        assert result is None
        mock_parse.assert_called_once()
        # Should not cache None results
        mock_cache_service.set.assert_not_called()

    @patch('cuepoint.services.beatport_service.parse_track_page')
    def test_fetch_track_data_exception_handling(self, mock_parse, beatport_service, mock_cache_service, mock_logging_service):
        """Test fetch_track_data handles exceptions gracefully."""
        mock_parse.side_effect = Exception("Network error")
        mock_cache_service.get.return_value = None
        
        result = beatport_service.fetch_track_data("https://www.beatport.com/track/test/123")
        
        assert result is None
        mock_logging_service.error.assert_called_once()

    def test_search_tracks_default_max_results(self, beatport_service, mock_cache_service):
        """Test search_tracks uses default max_results when not specified."""
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = []
            mock_cache_service.get.return_value = None
            
            beatport_service.search_tracks("test")
            
            mock_search.assert_called_once_with(
                idx=0, query="test", max_results=50, prefer_direct=True
            )
            mock_cache_service.set.assert_called_once_with(
                "search:test:50", [], ttl=3600
            )

