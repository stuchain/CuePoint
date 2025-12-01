"""Unit tests for Beatport service."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError
from cuepoint.services.beatport_service import BeatportService


class TestBeatportService:
    """Test Beatport service."""

    def test_init(self, mock_cache_service, mock_logging_service):
        """Test service initialization."""
        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        assert service.cache_service is mock_cache_service
        assert service.logging_service is mock_logging_service

    def test_search_tracks_cache_hit(
        self,
        mock_cache_service,
        mock_logging_service
    ):
        """Test search_tracks with cache hit."""
        # Setup cache to return results
        cached_urls = ["https://www.beatport.com/track/test/123"]
        mock_cache_service.get.return_value = cached_urls

        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        result = service.search_tracks("test query", max_results=10)

        assert result == cached_urls
        mock_cache_service.get.assert_called_once_with("search:test query:10")
        mock_logging_service.debug.assert_called()
        # Should not call the actual search function
        mock_logging_service.info.assert_not_called()

    @patch('cuepoint.services.beatport_service.beatport_search_hybrid')
    def test_search_tracks_cache_miss(
        self,
        mock_search,
        mock_cache_service,
        mock_logging_service
    ):
        """Test search_tracks with cache miss."""
        # Setup cache to return None (cache miss)
        mock_cache_service.get.return_value = None

        # Setup search to return URLs
        search_urls = ["https://www.beatport.com/track/test/123"]
        mock_search.return_value = search_urls

        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        result = service.search_tracks("test query", max_results=10)

        assert result == search_urls
        mock_cache_service.get.assert_called_once_with("search:test query:10")
        mock_search.assert_called_once_with(
            idx=0, query="test query", max_results=10, prefer_direct=True
        )
        # Should cache the results
        mock_cache_service.set.assert_called_once_with(
            "search:test query:10", search_urls, ttl=3600
        )
        mock_logging_service.info.assert_called()

    @patch('cuepoint.services.beatport_service.beatport_search_hybrid')
    def test_search_tracks_error_handling(
        self,
        mock_search,
        mock_cache_service,
        mock_logging_service
    ):
        """Test search_tracks error handling."""
        # Setup cache to return None
        mock_cache_service.get.return_value = None

        # Setup search to raise exception
        mock_search.side_effect = Exception("Search failed")

        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        with pytest.raises(BeatportAPIError) as exc_info:
            service.search_tracks("test query", max_results=10)

        assert exc_info.value.error_code == "BEATPORT_SEARCH_ERROR"
        assert "test query" in exc_info.value.message
        mock_logging_service.error.assert_called()

    def test_fetch_track_data_cache_hit(
        self,
        mock_cache_service,
        mock_logging_service
    ):
        """Test fetch_track_data with cache hit."""
        # Setup cache to return track data
        cached_data = {
            "url": "https://www.beatport.com/track/test/123",
            "title": "Test Track",
            "artists": "Test Artist"
        }
        mock_cache_service.get.return_value = cached_data

        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        result = service.fetch_track_data("https://www.beatport.com/track/test/123")

        assert result == cached_data
        mock_cache_service.get.assert_called_once_with("track:https://www.beatport.com/track/test/123")

    @patch('cuepoint.services.beatport_service.parse_track_page')
    def test_fetch_track_data_cache_miss(
        self,
        mock_parse,
        mock_cache_service,
        mock_logging_service
    ):
        """Test fetch_track_data with cache miss."""
        # Setup cache to return None
        mock_cache_service.get.return_value = None

        # Setup parse_track_page to return data
        mock_parse.return_value = (
            "Test Track",
            "Test Artist",
            "E Major",
            2023,
            "128",
            "Test Label",
            "House",
            "Test Release",
            "2023-01-01"
        )

        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        url = "https://www.beatport.com/track/test/123"
        result = service.fetch_track_data(url)

        assert result is not None
        assert result["url"] == url
        assert result["title"] == "Test Track"
        assert result["artists"] == "Test Artist"
        assert result["key"] == "E Major"
        assert result["year"] == 2023
        assert result["bpm"] == "128"
        assert result["label"] == "Test Label"
        assert result["genres"] == "House"
        assert result["release_name"] == "Test Release"
        assert result["release_date"] == "2023-01-01"

        # Should cache the result
        mock_cache_service.set.assert_called_once()
        # Verify the call was made with correct arguments
        # call_args is a tuple: (args_tuple, kwargs_dict)
        args, kwargs = mock_cache_service.set.call_args
        assert args[0] == f"track:{url}"
        assert args[1]["title"] == "Test Track"
        assert kwargs["ttl"] == 86400  # 24 hours TTL

    @patch('cuepoint.services.beatport_service.parse_track_page')
    def test_fetch_track_data_error_handling(
        self,
        mock_parse,
        mock_cache_service,
        mock_logging_service
    ):
        """Test fetch_track_data error handling (returns None instead of raising)."""
        # Setup cache to return None
        mock_cache_service.get.return_value = None

        # Setup parse_track_page to raise exception
        mock_parse.side_effect = Exception("Parse failed")

        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        # Should return None instead of raising
        result = service.fetch_track_data("https://www.beatport.com/track/test/123")

        assert result is None
        mock_logging_service.error.assert_called()

    def test_search_tracks_default_max_results(
        self,
        mock_cache_service,
        mock_logging_service
    ):
        """Test search_tracks with default max_results."""
        cached_urls = ["https://www.beatport.com/track/test/123"]
        mock_cache_service.get.return_value = cached_urls

        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )

        result = service.search_tracks("test query")

        # Should use default max_results=50
        mock_cache_service.get.assert_called_once_with("search:test query:50")
        assert result == cached_urls
    
    def test_search_tracks_network_error(
        self,
        mock_cache_service,
        mock_logging_service
    ):
        """Test search_tracks handles network errors."""
        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )
        
        # Mock beatport_search_hybrid to raise network error
        mock_cache_service.get.return_value = None  # No cache
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.side_effect = ConnectionError("Network error")
            
            # Should raise BeatportAPIError on network error
            with pytest.raises(BeatportAPIError):
                service.search_tracks("Test Query")
    
    def test_fetch_track_data_invalid_url(
        self,
        mock_cache_service,
        mock_logging_service
    ):
        """Test fetch_track_data with invalid URL."""
        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )
        
        # Invalid URL - should handle gracefully
        with patch('cuepoint.services.beatport_service.parse_track_page') as mock_parse:
            mock_parse.return_value = None
            
            result = service.fetch_track_data("not-a-valid-url")
            
            # Should return None
            assert result is None
    
    def test_search_tracks_empty_query(
        self,
        mock_cache_service,
        mock_logging_service
    ):
        """Test search_tracks with empty query."""
        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )
        
        # Mock beatport_search_hybrid to return empty list for empty query
        mock_cache_service.get.return_value = None  # No cache
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = []
            
            result = service.search_tracks("")
            
            # Should return empty list
            assert result == []
    
    def test_fetch_track_data_timeout(
        self,
        mock_cache_service,
        mock_logging_service
    ):
        """Test fetch_track_data handles timeout errors."""
        service = BeatportService(
            cache_service=mock_cache_service,
            logging_service=mock_logging_service
        )
        
        # Mock parse_track_page to raise timeout
        with patch('cuepoint.services.beatport_service.parse_track_page') as mock_parse:
            mock_parse.side_effect = TimeoutError("Request timeout")
            
            result = service.fetch_track_data("https://www.beatport.com/track/test/123")
            
            # Should return None on timeout
            assert result is None
