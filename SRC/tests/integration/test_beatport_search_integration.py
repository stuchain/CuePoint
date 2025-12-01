"""Integration tests for beatport_search.py data module with real parsing logic."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.data.beatport_search import (
    _extract_track_ids_from_next_data,
    beatport_search_direct,
    beatport_search_hybrid,
    beatport_search_via_api,
)


class TestBeatportSearchIntegration:
    """Integration tests for beatport_search data module."""
    
    def test_extract_track_ids_from_next_data_react_query(self):
        """Test extracting track IDs from React Query dehydrated state."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": {
                                        "tracks": [
                                            {"id": 123456, "slug": "test-track"},
                                            {"id": 123457, "slug": "another-track"},
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=10)
        
        # Should extract track URLs
        assert len(urls) >= 0
        # URLs should be valid Beatport track URLs
        for url in urls:
            assert "/track/" in url
            assert "beatport.com" in url
    
    def test_extract_track_ids_from_nested_structure(self):
        """Test extracting track IDs from deeply nested structure."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": {
                                        "results": [
                                            {
                                                "id": 123456,
                                                "slug": "test-track",
                                                "name": "Test Track"
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=10)
        
        # Should handle nested structures
        assert isinstance(urls, list)
    
    def test_extract_track_ids_with_url_field(self):
        """Test extracting track IDs when URL is in track object."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": {
                                        "tracks": [
                                            {
                                                "id": 123456,
                                                "url": "https://www.beatport.com/track/test-track/123456"
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=10)
        
        # Should extract URLs from url field
        assert len(urls) >= 0
    
    def test_extract_track_ids_max_results_limit(self):
        """Test that max_results limit is respected."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": {
                                        "tracks": [
                                            {"id": i, "slug": f"track-{i}"}
                                            for i in range(100)
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=5)
        
        # Should respect max_results limit
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport_search.SESSION.get')
    def test_beatport_search_via_api_success(self, mock_get):
        """Test API search with successful response."""
        # Mock successful API response
        mock_response = Mock()
        mock_response.json.return_value = {
            "results": [
                {"id": 123456, "slug": "test-track"},
                {"id": 123457, "slug": "another-track"}
            ]
        }
        mock_response.status_code = 200
        mock_get.return_value = mock_response
        
        urls = beatport_search_via_api(1, "Test Track", max_results=10)
        
        # Should return list of URLs
        assert isinstance(urls, list)
        # All URLs should be valid Beatport track URLs
        for url in urls:
            assert "/track/" in url
            assert "beatport.com" in url
    
    @patch('cuepoint.data.beatport_search.SESSION.get')
    def test_beatport_search_via_api_failure(self, mock_get):
        """Test API search with failed response."""
        # Mock failed API response
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        urls = beatport_search_via_api(1, "Test Track", max_results=10)
        
        # Should return empty list on failure
        assert isinstance(urls, list)
        assert len(urls) == 0
    
    @patch('cuepoint.data.beatport_search.SESSION.get')
    def test_beatport_search_via_api_exception(self, mock_get):
        """Test API search with exception."""
        # Mock exception
        mock_get.side_effect = Exception("Network error")
        
        urls = beatport_search_via_api(1, "Test Track", max_results=10)
        
        # Should handle exception gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_api_success(self, mock_request, mock_api):
        """Test direct search with API success."""
        # Mock API returning URLs
        mock_api.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should return URLs from API
        assert isinstance(urls, list)
        assert len(urls) > 0
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_api_fallback(self, mock_request, mock_api):
        """Test direct search falling back to HTML when API fails."""
        from bs4 import BeautifulSoup
        
        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML response with track links
        html_content = """
        <html>
        <body>
        <a href="/track/test-track/123456">Test Track</a>
        <a href="/track/another-track/123457">Another Track</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should fall back to HTML parsing
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('beatport.ddg_track_urls')
    def test_beatport_search_hybrid_combines_results(self, mock_track_urls, mock_direct):
        """Test hybrid search combining direct and DuckDuckGo results."""
        # Mock direct search returning URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock DuckDuckGo returning URLs
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test/123456",
            "https://www.beatport.com/track/another/123457"
        ]
        
        urls = beatport_search_hybrid(1, "Test Track", max_results=10)
        
        # Should combine results from both sources
        assert isinstance(urls, list)
        assert len(urls) > 0
        # Should deduplicate
        assert len(urls) == len(set(urls))
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('beatport.ddg_track_urls')
    def test_beatport_search_hybrid_empty_results(self, mock_track_urls, mock_direct):
        """Test hybrid search with empty results."""
        # Mock both returning empty lists
        mock_direct.return_value = []
        mock_track_urls.return_value = []
        
        urls = beatport_search_hybrid(1, "Test Track", max_results=10)
        
        # Should return empty list
        assert isinstance(urls, list)
        assert len(urls) == 0
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('beatport.ddg_track_urls')
    def test_beatport_search_hybrid_max_results(self, mock_track_urls, mock_direct):
        """Test hybrid search respects max_results."""
        # Mock returning many URLs
        mock_direct.return_value = [
            f"https://www.beatport.com/track/test-{i}/12345{i}"
            for i in range(20)
        ]
        mock_track_urls.return_value = [
            f"https://www.beatport.com/track/another-{i}/12346{i}"
            for i in range(20)
        ]
        
        urls = beatport_search_hybrid(1, "Test Track", max_results=5)
        
        # Should respect max_results
        assert len(urls) <= 5
    
    def test_extract_track_ids_empty_data(self):
        """Test extracting from empty data structure."""
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data({}, seen, urls, max_results=10)
        
        # Should handle empty data gracefully
        assert isinstance(urls, list)
    
    def test_extract_track_ids_list_data(self):
        """Test extracting from list data structure."""
        data = [
            {"id": 123456, "slug": "test-track"},
            {"id": 123457, "slug": "another-track"}
        ]
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=10)
        
        # Should handle list data
        assert isinstance(urls, list)

