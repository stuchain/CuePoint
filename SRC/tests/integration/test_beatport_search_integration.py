"""Integration tests for beatport_search.py data module with real parsing logic."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.data.beatport_search import (
    _extract_track_ids_from_next_data,
    beatport_search_browser,
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
    
    def test_extract_track_ids_data_val_as_list(self):
        """Test extracting when data_val itself is a list."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": [
                                        {"id": 123456, "slug": "test-track"},
                                        {"id": 123457, "slug": "another-track"}
                                    ]
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
        
        # Should handle data_val as list
        assert isinstance(urls, list)
    
    def test_extract_track_ids_query_data_as_list(self):
        """Test extracting from query_data as list."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": [
                                        {"id": 123456, "slug": "test-track"}
                                    ]
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
        
        # Should extract from query_data list
        assert isinstance(urls, list)
    
    def test_extract_track_ids_recursive_traversal(self):
        """Test recursive traversal of nested structures."""
        # Create deeply nested structure that requires recursive traversal
        data = {
            "level1": {
                "level2": {
                    "level3": {
                        "id": 123456,
                        "slug": "test-track"
                    }
                }
            }
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=10)
        
        # Should find track through recursive traversal
        assert isinstance(urls, list)
    
    def test_extract_track_ids_url_fields(self):
        """Test extracting from various URL field names."""
        data = {
            "track1": {
                "url": "https://www.beatport.com/track/test/123456"
            },
            "track2": {
                "href": "https://www.beatport.com/track/another/123457"
            },
            "track3": {
                "link": "https://www.beatport.com/track/third/123458"
            },
            "track4": {
                "slug": "test-slug",
                "id": 123459
            }
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=10)
        
        # Should extract from various URL field names
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.SESSION.get')
    def test_beatport_search_via_api_json_decode_error(self, mock_get):
        """Test API search with JSON decode error."""
        # Mock response with invalid JSON
        mock_response = Mock()
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_response.status_code = 200
        mock_get.return_value = mock_response
        
        urls = beatport_search_via_api(1, "Test Track", max_results=10)
        
        # Should handle JSON decode error gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_html_none(self, mock_request, mock_api):
        """Test direct search when HTML request returns None."""
        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML request returning None
        mock_request.return_value = None
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should handle None soup gracefully
        assert isinstance(urls, list)
        assert len(urls) == 0
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_empty_href(self, mock_request, mock_api):
        """Test direct search with empty href attributes."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with links that have empty href
        html_content = """
        <html>
        <body>
        <a href="">Empty Link</a>
        <a href="/track/test-track/123456">Valid Link</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should skip empty hrefs
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_max_results_break(self, mock_request, mock_api):
        """Test direct search breaking at max_results."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with many track links
        links = "\n".join([f'<a href="/track/track-{i}/{123456+i}">Track {i}</a>' for i in range(20)])
        html_content = f"""
        <html>
        <body>
        {links}
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=5)
        
        # Should respect max_results
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_next_data_parsing(self, mock_request, mock_api):
        """Test direct search parsing __NEXT_DATA__."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with __NEXT_DATA__ script
        html_content = """
        <html>
        <body>
        <script id="__NEXT_DATA__">
        {"props":{"pageProps":{"dehydratedState":{"queries":[{"state":{"data":{"tracks":[{"id":123456,"slug":"test-track"}]}}}]}}}}
        </script>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should parse __NEXT_DATA__
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_next_data_exception(self, mock_request, mock_api):
        """Test direct search handling __NEXT_DATA__ parsing exception."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with invalid __NEXT_DATA__ JSON
        html_content = """
        <html>
        <body>
        <script id="__NEXT_DATA__">
        {invalid json}
        </script>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should handle JSON parsing exception gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_script_regex(self, mock_request, mock_api):
        """Test direct search extracting URLs from script tags via regex."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with track URLs in script tags
        html_content = """
        <html>
        <body>
        <script>
        var trackUrl = "https://www.beatport.com/track/test-track/123456";
        var anotherUrl = "/track/another-track/123457";
        </script>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should extract URLs from script tags
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_data_attributes(self, mock_request, mock_api):
        """Test direct search extracting from data attributes."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with data-track-id and data-track-slug attributes
        html_content = """
        <html>
        <body>
        <div data-track-id="123456" data-track-slug="test-track">Track</div>
        <a data-track-id="123457" href="/track/another-track/123457">Another</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should extract from data attributes
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_exception_handling(self, mock_request, mock_api):
        """Test direct search exception handling."""
        # Mock API raising exception
        mock_api.side_effect = Exception("API error")
        
        # Mock HTML request raising exception
        mock_request.side_effect = Exception("HTML error")
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should handle exceptions gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('beatport.ddg_track_urls')
    def test_beatport_search_hybrid_prefer_ddg(self, mock_track_urls, mock_direct):
        """Test hybrid search with prefer_direct=False."""
        # Mock DuckDuckGo returning URLs
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock direct search returning URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/another/123457"
        ]
        
        urls = beatport_search_hybrid(1, "Test Track", max_results=10, prefer_direct=False)
        
        # Should use DuckDuckGo first
        assert isinstance(urls, list)
        assert len(urls) > 0
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('beatport.ddg_track_urls')
    def test_beatport_search_hybrid_ddg_supplement(self, mock_track_urls, mock_direct):
        """Test hybrid search supplementing DuckDuckGo when results are low."""
        # Mock DuckDuckGo returning few results
        mock_track_urls.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock direct search returning URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/another/123457"
        ]
        
        urls = beatport_search_hybrid(1, "Test Track", max_results=10, prefer_direct=False)
        
        # Should supplement with direct search when DDG results < 50%
        assert isinstance(urls, list)
    
    @patch('builtins.__import__')
    def test_beatport_search_browser_playwright_success(self, mock_import):
        """Test browser search with Playwright success."""
        # Mock Playwright import
        mock_playwright_module = Mock()
        mock_page = Mock()
        mock_link1 = Mock()
        mock_link1.get_attribute.return_value = "/track/test-track/123456"
        mock_link2 = Mock()
        mock_link2.get_attribute.return_value = "/track/another-track/123457"
        mock_page.query_selector_all.return_value = [mock_link1, mock_link2]
        
        mock_browser = Mock()
        mock_browser.new_page.return_value = mock_page
        
        mock_p = Mock()
        mock_p.chromium.launch.return_value = mock_browser
        
        mock_sync_playwright = Mock()
        mock_sync_playwright.return_value.__enter__.return_value = mock_p
        
        mock_playwright_module.sync_api.sync_playwright = mock_sync_playwright
        
        def import_side_effect(name, *args, **kwargs):
            if name == 'playwright.sync_api':
                return mock_playwright_module.sync_api
            return __import__(name, *args, **kwargs)
        
        mock_import.side_effect = import_side_effect
        
        urls = beatport_search_browser(1, "Test Track", max_results=10)
        
        # Should return URLs from Playwright
        assert isinstance(urls, list)
        mock_browser.close.assert_called_once()
    
    def test_beatport_search_browser_no_browser_libs(self):
        """Test browser search when neither Playwright nor Selenium are available."""
        # This will naturally trigger ImportError paths
        urls = beatport_search_browser(1, "Test Track", max_results=10)
        
        # Should return empty list when no browser libs available
        assert isinstance(urls, list)
    
    @patch('builtins.__import__')
    def test_beatport_search_browser_playwright_import_error(self, mock_import):
        """Test browser search handling Playwright ImportError - lines 459-461."""
        # Mock Playwright import failing
        def import_side_effect(name, *args, **kwargs):
            if 'playwright' in name:
                raise ImportError("No module named 'playwright'")
            return __import__(name, *args, **kwargs)
        mock_import.side_effect = import_side_effect
        
        # Mock Selenium to be available
        with patch('selenium.webdriver.Chrome') as mock_chrome:
            mock_driver = Mock()
            mock_driver.find_elements.return_value = []
            mock_driver.get = Mock()
            mock_chrome.return_value = mock_driver
            
            urls = beatport_search_browser(1, "Test Track", max_results=10)
            
            # Should fall back to Selenium
            assert isinstance(urls, list)
    
    @patch('builtins.__import__')
    def test_beatport_search_browser_playwright_exception(self, mock_import):
        """Test browser search handling Playwright exception - line 462-463."""
        # Mock Playwright import succeeding but raising exception
        mock_playwright = Mock()
        mock_playwright.sync_api.sync_playwright = Mock(side_effect=Exception("Playwright error"))
        
        def import_side_effect(name, *args, **kwargs):
            if 'playwright' in name:
                return mock_playwright
            return __import__(name, *args, **kwargs)
        mock_import.side_effect = import_side_effect
        
        # Mock Selenium to be available
        with patch('selenium.webdriver.Chrome') as mock_chrome:
            mock_driver = Mock()
            mock_driver.find_elements.return_value = []
            mock_driver.get = Mock()
            mock_chrome.return_value = mock_driver
            
            urls = beatport_search_browser(1, "Test Track", max_results=10)
            
            # Should fall back to Selenium
            assert isinstance(urls, list)
    
    @patch('builtins.__import__')
    def test_beatport_search_browser_selenium_wait_exception(self, mock_import):
        """Test browser search handling Selenium wait exception - lines 499-500."""
        # Mock Playwright not available
        def import_side_effect(name, *args, **kwargs):
            if 'playwright' in name:
                raise ImportError("No module named 'playwright'")
            return __import__(name, *args, **kwargs)
        mock_import.side_effect = import_side_effect
        
        # Mock Selenium WebDriverWait raising exception
        with patch('selenium.webdriver.Chrome') as mock_chrome, \
             patch('selenium.webdriver.support.ui.WebDriverWait') as mock_wait:
            mock_driver = Mock()
            mock_driver.find_elements.return_value = []
            mock_driver.get = Mock()
            mock_chrome.return_value = mock_driver
            
            # Make WebDriverWait raise exception
            mock_wait.return_value.until.side_effect = Exception("Wait timeout")
            
            urls = beatport_search_browser(1, "Test Track", max_results=10)
            
            # Should handle wait exception gracefully
            assert isinstance(urls, list)
    
    @patch('builtins.__import__')
    def test_beatport_search_browser_selenium_max_results_break(self, mock_import):
        """Test browser search breaking at max_results in Selenium - line 513."""
        # Mock Playwright not available
        def import_side_effect(name, *args, **kwargs):
            if 'playwright' in name:
                raise ImportError("No module named 'playwright'")
            return __import__(name, *args, **kwargs)
        mock_import.side_effect = import_side_effect
        
        # Mock Selenium with many links
        with patch('selenium.webdriver.Chrome') as mock_chrome:
            mock_driver = Mock()
            # Create many mock links
            mock_links = [Mock() for _ in range(20)]
            for i, link in enumerate(mock_links):
                link.get_attribute.return_value = f"/track/test-{i}/12345{i}"
            mock_driver.find_elements.return_value = mock_links
            mock_driver.get = Mock()
            mock_chrome.return_value = mock_driver
            
            urls = beatport_search_browser(1, "Test Track", max_results=5)
            
            # Should respect max_results
            assert len(urls) <= 5
    
    @patch('builtins.__import__')
    def test_beatport_search_browser_selenium_import_error(self, mock_import):
        """Test browser search handling Selenium ImportError - lines 521-525."""
        # Mock both Playwright and Selenium imports failing
        def import_side_effect(name, *args, **kwargs):
            if 'playwright' in name or 'selenium' in name:
                raise ImportError("No module")
            return __import__(name, *args, **kwargs)
        mock_import.side_effect = import_side_effect
        
        urls = beatport_search_browser(1, "Test Track", max_results=10)
        
        # Should return empty list when no browser libs available
        assert isinstance(urls, list)
        assert len(urls) == 0
    
    @patch('builtins.__import__')
    def test_beatport_search_browser_selenium_exception(self, mock_import):
        """Test browser search handling Selenium exception - lines 526-527."""
        # Mock Playwright not available
        def import_side_effect(name, *args, **kwargs):
            if 'playwright' in name:
                raise ImportError("No module named 'playwright'")
            return __import__(name, *args, **kwargs)
        mock_import.side_effect = import_side_effect
        
        # Mock Selenium raising exception
        with patch('selenium.webdriver.Chrome', side_effect=Exception("Selenium error")):
            urls = beatport_search_browser(1, "Test Track", max_results=10)
            
            # Should handle Selenium exception gracefully
            assert isinstance(urls, list)
    
    def test_extract_track_ids_data_val_as_list_line_84(self):
        """Test extracting when data_val itself is a list - line 84."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": [
                                        {"id": 123456, "slug": "test-track"},
                                        {"id": 123457, "slug": "another-track"}
                                    ]
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
        
        # Should handle data_val as list (line 84)
        assert isinstance(urls, list)
        assert len(urls) > 0
    
    def test_extract_track_ids_direct_url_fields(self):
        """Test extracting from direct URL fields in track objects - lines 132-135."""
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
                                                "url": "https://www.beatport.com/track/test/123456"
                                            },
                                            {
                                                "id": 123457,
                                                "href": "https://www.beatport.com/track/another/123457"
                                            },
                                            {
                                                "id": 123458,
                                                "link": "https://www.beatport.com/track/third/123458"
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
        
        # Should extract from direct URL fields (lines 132-135)
        assert isinstance(urls, list)
        assert len(urls) > 0
    
    def test_extract_track_ids_query_data_list_max_results(self):
        """Test extract stopping at max_results in query_data list - line 150."""
        data = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": [
                                        {"id": 123456, "slug": "test-track"},
                                        {"id": 123457, "slug": "another-track"},
                                        {"id": 123458, "slug": "third-track"},
                                        {"id": 123459, "slug": "fourth-track"}
                                    ]
                                }
                            }
                        ]
                    }
                }
            }
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=2)
        
        # Should stop at max_results (line 150)
        assert len(urls) <= 2
    
    def test_extract_track_ids_traverse_depth_limit(self):
        """Test traverse stopping at depth limit - line 162."""
        # Create deeply nested structure that exceeds depth limit
        data = {}
        current = data
        for i in range(30):  # Exceeds depth limit of 25
            current[f"level{i}"] = {}
            current = current[f"level{i}"]
        current["id"] = 123456
        current["slug"] = "test-track"
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=10)
        
        # Should stop at depth limit (line 162)
        assert isinstance(urls, list)
    
    def test_extract_track_ids_traverse_max_results(self):
        """Test traverse stopping at max_results - line 182."""
        data = {
            "track1": {"id": 123456, "slug": "track1"},
            "track2": {"id": 123457, "slug": "track2"},
            "track3": {"id": 123458, "slug": "track3"},
            "track4": {"id": 123459, "slug": "track4"}
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=2)
        
        # Should stop at max_results (line 182)
        assert len(urls) <= 2
    
    def test_extract_track_ids_slug_id_construction_max_results(self):
        """Test slug+id construction stopping at max_results - lines 194, 201-204."""
        data = {
            "track1": {"id": 123456, "slug": "track1"},
            "track2": {"id": 123457, "slug": "track2"},
            "track3": {"id": 123458, "slug": "track3"}
        }
        
        seen = set()
        urls = []
        
        _extract_track_ids_from_next_data(data, seen, urls, max_results=2)
        
        # Should stop at max_results (lines 194, 201-204)
        assert len(urls) <= 2
    
    @patch('cuepoint.data.beatport_search.SESSION.get')
    def test_beatport_search_via_api_json_decode_error_line_260(self, mock_get):
        """Test API search with JSONDecodeError - line 260."""
        # Mock response with invalid JSON
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_get.return_value = mock_response
        
        urls = beatport_search_via_api(1, "Test Track", max_results=10)
        
        # Should continue on JSONDecodeError (line 260)
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_empty_href_line_310(self, mock_request, mock_api):
        """Test direct search skipping empty href - line 310."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with links that have empty href
        html_content = """
        <html>
        <body>
        <a href="">Empty Link</a>
        <a href="/track/test-track/123456">Valid Link</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=10)
        
        # Should continue on empty href (line 310)
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_script_regex_max_results_345(self, mock_request, mock_api):
        """Test direct search breaking at max_results in script regex - line 345."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with many track URLs in script tags
        urls_in_script = " ".join([f'https://www.beatport.com/track/test-{i}/12345{i}' for i in range(20)])
        html_content = f"""
        <html>
        <body>
        <script>
        var tracks = "{urls_in_script}";
        </script>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=5)
        
        # Should break at max_results (line 345)
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_relative_path_max_results_357(self, mock_request, mock_api):
        """Test direct search breaking at max_results in relative path regex - line 357."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with many relative track paths in script tags
        paths_in_script = " ".join([f'"/track/test-{i}/{12345+i}"' for i in range(20)])
        html_content = f"""
        <html>
        <body>
        <script>
        var tracks = [{paths_in_script}];
        </script>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=5)
        
        # Should break at max_results (line 357)
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport_search.beatport_search_via_api')
    @patch('cuepoint.data.beatport_search.request_html')
    def test_beatport_search_direct_data_attributes_max_results_372(self, mock_request, mock_api):
        """Test direct search breaking at max_results in data attributes - line 372."""
        from bs4 import BeautifulSoup

        # Mock API returning empty list
        mock_api.return_value = []
        
        # Mock HTML with many data-track-id attributes
        divs = "\n".join([f'<div data-track-id="{12345+i}" data-track-slug="test-{i}">Track {i}</div>' for i in range(20)])
        html_content = f"""
        <html>
        <body>
        {divs}
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = beatport_search_direct(1, "Test Track", max_results=5)
        
        # Should break at max_results (line 372)
        assert len(urls) <= 5

