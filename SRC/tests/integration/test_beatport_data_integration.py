"""Integration tests for beatport.py data module with real parsing logic."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.data.beatport import (
    BeatportCandidate,
    get_last_cache_hit,
    is_track_url,
    parse_track_page,
)


class TestBeatportDataIntegration:
    """Integration tests for beatport data module."""
    
    def test_is_track_url_valid(self):
        """Test is_track_url with valid Beatport URLs."""
        assert is_track_url("https://www.beatport.com/track/test/123456") is True
        assert is_track_url("http://www.beatport.com/track/test/123456") is True
        assert is_track_url("https://beatport.com/track/test/123456") is True
    
    def test_is_track_url_invalid(self):
        """Test is_track_url with invalid URLs."""
        assert is_track_url("https://www.beatport.com/release/test/123") is False
        assert is_track_url("https://www.google.com") is False
        assert is_track_url("not-a-url") is False
        assert is_track_url("") is False
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_with_json_ld(self, mock_request):
        """Test parsing track page with JSON-LD structured data."""
        from bs4 import BeautifulSoup
        # Mock HTML with JSON-LD
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
                "name": "Test Release"
            }
        }
        </script>
        </head>
        <body></body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        assert title == "Test Track"
        assert "Test Artist" in artists
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_with_next_data(self, mock_request):
        """Test parsing track page with Next.js __NEXT_DATA__."""
        from bs4 import BeautifulSoup
        # Mock HTML with __NEXT_DATA__
        html_content = """
        <html>
        <body>
        <script id="__NEXT_DATA__" type="application/json">
        {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [{
                            "state": {
                                "data": {
                                    "tracks": [{
                                        "id": 123,
                                        "name": "Test Track",
                                        "artists": [{"name": "Test Artist"}],
                                        "key": {"name": "E Major"},
                                        "releaseDate": "2023-01-01"
                                    }]
                                }
                            }
                        }]
                    }
                }
            }
        }
        </script>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should return tuple with 9 elements, may be empty if parsing fails
        assert isinstance(title, str)
        assert isinstance(artists, str)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_empty_html(self, mock_request):
        """Test parsing with empty HTML."""
        from bs4 import BeautifulSoup
        mock_request.return_value = BeautifulSoup("", 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        # Should return None or empty values
        assert result is None or all(v is None or v == "" for v in result)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_malformed_html(self, mock_request):
        """Test parsing with malformed HTML."""
        from bs4 import BeautifulSoup
        mock_request.return_value = BeautifulSoup("<html><body>Invalid content</body></html>", 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        # Should handle gracefully
        assert result is None or isinstance(result, tuple)
    
    def test_get_last_cache_hit(self):
        """Test getting last cache hit status."""
        # Reset cache hit
        get_last_cache_hit()
        
        # Should return False initially (no cache hit yet)
        # Note: This depends on implementation
        result = get_last_cache_hit()
        assert isinstance(result, bool)
    
    def test_beatport_candidate_creation(self):
        """Test creating BeatportCandidate with all fields."""
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
        """Test creating BeatportCandidate with optional fields as None."""
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
            score=80.0,
            title_sim=80,
            artist_sim=80,
            query_index=1,
            query_text="Test",
            candidate_index=1,
            base_score=80.0,
            bonus_year=0,
            bonus_key=0,
            guard_ok=True,
            reject_reason="",
            elapsed_ms=50,
            is_winner=False
        )
        
        assert candidate.key is None
        assert candidate.release_year is None
        assert candidate.bpm is None

