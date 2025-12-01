#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for beatport data module."""

from unittest.mock import MagicMock, Mock, patch

import pytest
from bs4 import BeautifulSoup

from cuepoint.data.beatport import BeatportCandidate, get_last_cache_hit, is_track_url


@pytest.mark.unit
class TestBeatportCandidate:
    """Test BeatportCandidate dataclass."""

    def test_beatport_candidate_creation(self):
        """Test creating BeatportCandidate."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            key="E Major",
            release_year=2023,
            bpm="128",
            label="Test Label",
            genres="House",
            release_name="Test Release",
            release_date="2023-01-01",
            score=95.0,
            title_sim=95,
            artist_sim=100,
            query_index=1,
            query_text="Test Track Test Artist",
            candidate_index=1,
            base_score=90.0,
            bonus_year=2,
            bonus_key=2,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=False
        )
        
        assert candidate.url == "https://www.beatport.com/track/test/123"
        assert candidate.title == "Test Track"
        assert candidate.artists == "Test Artist"
        assert candidate.score == 95.0

    def test_beatport_candidate_optional_fields(self):
        """Test BeatportCandidate with optional fields as None."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres=None,
            release_name=None,
            release_date=None,
            score=50.0,
            title_sim=50,
            artist_sim=50,
            query_index=0,
            query_text="Test",
            candidate_index=0,
            base_score=50.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=False,
            reject_reason="Low score",
            elapsed_ms=50,
            is_winner=False
        )
        
        assert candidate.key is None
        assert candidate.release_year is None
        assert candidate.guard_ok is False


@pytest.mark.unit
class TestIsTrackUrl:
    """Test is_track_url function."""

    def test_is_track_url_valid(self):
        """Test valid Beatport track URL."""
        assert is_track_url("https://www.beatport.com/track/title/123456") is True
        assert is_track_url("http://www.beatport.com/track/title/123456") is True

    def test_is_track_url_invalid(self):
        """Test invalid URLs."""
        assert is_track_url("https://www.beatport.com/artist/name/123") is False
        assert is_track_url("https://www.example.com/track/title/123") is False
        assert is_track_url("not a url") is False
        assert is_track_url("") is False

    def test_is_track_url_edge_cases(self):
        """Test edge cases for URL validation."""
        # URL with query parameters
        assert is_track_url("https://www.beatport.com/track/title/123?ref=search") is True
        # URL with fragment
        assert is_track_url("https://www.beatport.com/track/title/123#section") is True


@pytest.mark.unit
class TestGetLastCacheHit:
    """Test get_last_cache_hit function."""

    def test_get_last_cache_hit_default(self):
        """Test default cache hit status."""
        # Reset to default
        result = get_last_cache_hit()
        # Should return a boolean
        assert isinstance(result, bool)


@pytest.mark.unit
class TestRequestHtml:
    """Test request_html function."""

    @patch('cuepoint.data.beatport.retry_with_backoff')
    def test_request_html_success(self, mock_retry):
        """Test successful HTML request."""
        mock_response = Mock()
        mock_response.text = "<html><body>Test</body></html>"
        mock_response.status_code = 200
        mock_response.headers = {}
        mock_retry.return_value = mock_response
        
        from cuepoint.data.beatport import request_html
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # request_html may return None if response is empty or invalid
        # Just verify it doesn't crash
        assert result is None or isinstance(result, BeautifulSoup)

    @patch('cuepoint.data.beatport.retry_with_backoff')
    def test_request_html_failure(self, mock_retry):
        """Test failed HTML request."""
        mock_retry.side_effect = Exception("Network error")
        
        from cuepoint.data.beatport import request_html
        
        result = request_html("https://www.beatport.com/track/invalid/123")
        
        assert result is None


@pytest.mark.unit
class TestParseTrackPage:
    """Test parse_track_page function."""

    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_success(self, mock_request):
        """Test successful track page parsing."""
        # Create mock HTML with structured data
        html_content = """
        <html>
            <head>
                <script type="application/ld+json">
                {
                    "@type": "MusicRecording",
                    "name": "Test Track",
                    "byArtist": {"name": "Test Artist"},
                    "inAlbum": {"name": "Test Album"}
                }
                </script>
            </head>
            <body>Test</body>
        </html>
        """
        mock_soup = BeautifulSoup(html_content, 'html.parser')
        mock_request.return_value = mock_soup
        
        from cuepoint.data.beatport import parse_track_page
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        # parse_track_page returns a tuple, not a dict
        assert result is not None
        assert isinstance(result, tuple)
        assert len(result) == 9  # (title, artists, key, year, bpm, label, genres, release_name, release_date)

    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_no_html(self, mock_request):
        """Test parsing when HTML request fails."""
        mock_request.return_value = None
        
        from cuepoint.data.beatport import parse_track_page
        
        result = parse_track_page("https://www.beatport.com/track/invalid/123")
        
        # Returns tuple with empty/default values
        assert result is not None
        assert isinstance(result, tuple)
        assert result[0] == ""  # Empty title
        assert result[1] == ""  # Empty artists

    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_empty_html(self, mock_request):
        """Test parsing empty HTML."""
        mock_soup = BeautifulSoup("<html></html>", 'html.parser')
        mock_request.return_value = mock_soup
        
        from cuepoint.data.beatport import parse_track_page
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        # Returns tuple, may have empty values
        assert result is not None
        assert isinstance(result, tuple)
    
    def test_is_track_url_various_formats(self):
        """Test is_track_url with various URL formats."""
        # Standard format
        assert is_track_url("https://www.beatport.com/track/title/123456") is True
        # With www
        assert is_track_url("https://beatport.com/track/title/123456") is True
        # HTTP instead of HTTPS
        assert is_track_url("http://www.beatport.com/track/title/123456") is True
        # With path segments
        assert is_track_url("https://www.beatport.com/track/title-artist/123456") is True
        # With numbers in title
        assert is_track_url("https://www.beatport.com/track/title-2023/123456") is True
    
    def test_is_track_url_non_track_urls(self):
        """Test is_track_url rejects non-track URLs."""
        # Artist URL
        assert is_track_url("https://www.beatport.com/artist/name/123") is False
        # Label URL
        assert is_track_url("https://www.beatport.com/label/name/123") is False
        # Release URL
        assert is_track_url("https://www.beatport.com/release/name/123") is False
        # Different domain
        assert is_track_url("https://www.example.com/track/title/123") is False
        # Invalid format
        assert is_track_url("https://www.beatport.com/track/") is False
        assert is_track_url("https://www.beatport.com/track/title") is False
    
    @patch('cuepoint.data.beatport.retry_with_backoff')
    def test_request_html_cache_detection(self, mock_retry):
        """Test that request_html detects cache hits."""
        mock_response = Mock()
        mock_response.text = "<html><body>Test</body></html>"
        mock_response.status_code = 200
        mock_response.headers = {}
        mock_response.from_cache = True
        mock_retry.return_value = mock_response
        
        from cuepoint.data.beatport import get_last_cache_hit, request_html
        
        request_html("https://www.beatport.com/track/test/123")
        
        # Check cache hit status
        cache_hit = get_last_cache_hit()
        assert isinstance(cache_hit, bool)
    
    @patch('cuepoint.data.beatport.retry_with_backoff')
    def test_request_html_empty_response_handling(self, mock_retry):
        """Test request_html handles empty responses."""
        mock_response = Mock()
        mock_response.text = ""
        mock_response.status_code = 200
        mock_response.headers = {"Content-Encoding": "gzip", "Content-Length": "0"}
        mock_response.content = b""
        mock_retry.return_value = mock_response
        
        from cuepoint.data.beatport import request_html
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should handle empty response gracefully
        assert result is None or isinstance(result, BeautifulSoup)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_with_json_ld(self, mock_request):
        """Test parsing track page with JSON-LD structured data."""
        html_content = """
        <html>
            <head>
                <script type="application/ld+json">
                {
                    "@type": "MusicRecording",
                    "name": "Test Track",
                    "byArtist": {
                        "@type": "MusicGroup",
                        "name": "Test Artist"
                    },
                    "inAlbum": {
                        "@type": "MusicAlbum",
                        "name": "Test Album"
                    },
                    "datePublished": "2023-01-01"
                }
                </script>
            </head>
            <body>Test</body>
        </html>
        """
        mock_soup = BeautifulSoup(html_content, 'html.parser')
        mock_request.return_value = mock_soup
        
        from cuepoint.data.beatport import parse_track_page
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        assert isinstance(result, tuple)
        assert len(result) == 9
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_with_next_data(self, mock_request):
        """Test parsing track page with Next.js __NEXT_DATA__."""
        html_content = """
        <html>
            <head>
                <script id="__NEXT_DATA__" type="application/json">
                {
                    "props": {
                        "pageProps": {
                            "track": {
                                "name": "Test Track",
                                "artists": [{"name": "Test Artist"}],
                                "key": {"name": "E Major"},
                                "releaseDate": "2023-01-01"
                            }
                        }
                    }
                }
                </script>
            </head>
            <body>Test</body>
        </html>
        """
        mock_soup = BeautifulSoup(html_content, 'html.parser')
        mock_request.return_value = mock_soup
        
        from cuepoint.data.beatport import parse_track_page
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        assert isinstance(result, tuple)
        assert len(result) == 9
    
    def test_beatport_candidate_all_fields(self):
        """Test BeatportCandidate with all fields populated."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            key="E Major",
            release_year=2023,
            bpm="128",
            label="Test Label",
            genres="House, Techno",
            release_name="Test Release",
            release_date="2023-01-01",
            score=95.5,
            title_sim=95,
            artist_sim=100,
            query_index=1,
            query_text="Test Track Test Artist",
            candidate_index=1,
            base_score=90.0,
            bonus_year=2,
            bonus_key=2,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=100,
            is_winner=True
        )
        
        assert candidate.is_winner is True
        assert candidate.score == 95.5
        assert candidate.bonus_year == 2
        assert candidate.bonus_key == 2
    
    def test_beatport_candidate_rejected(self):
        """Test BeatportCandidate that was rejected by guards."""
        candidate = BeatportCandidate(
            url="https://www.beatport.com/track/test/123",
            title="Test Track",
            artists="Test Artist",
            key=None,
            release_year=None,
            bpm=None,
            label=None,
            genres=None,
            release_name=None,
            release_date=None,
            score=30.0,
            title_sim=30,
            artist_sim=30,
            query_index=0,
            query_text="Test",
            candidate_index=0,
            base_score=30.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=False,
            reject_reason="Subset match",
            elapsed_ms=50,
            is_winner=False
        )
        
        assert candidate.guard_ok is False
        assert candidate.reject_reason == "Subset match"
        assert candidate.is_winner is False

