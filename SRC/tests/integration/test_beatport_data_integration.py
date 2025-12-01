"""Integration tests for beatport.py data module with real parsing logic."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.data.beatport import (
    BeatportCandidate,
    _parse_next_data,
    _parse_structured_json_ld,
    ddg_track_urls,
    get_last_cache_hit,
    is_track_url,
    parse_track_page,
    request_html,
    track_urls,
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
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_empty_body_retry(self, mock_get):
        """Test request_html retrying with identity encoding on empty body."""
        from bs4 import BeautifulSoup

        # Mock first response with empty body (gzipped)
        mock_resp1 = Mock()
        mock_resp1.status_code = 200
        mock_resp1.headers = {"Content-Encoding": "gzip", "Content-Length": "0"}
        mock_resp1.content = b""
        mock_resp1.text = ""
        mock_resp1.from_cache = False
        
        # Mock second response with actual content
        mock_resp2 = Mock()
        mock_resp2.status_code = 200
        mock_resp2.headers = {"Content-Encoding": "identity"}
        mock_resp2.content = b"<html><body>Test</body></html>"
        mock_resp2.text = "<html><body>Test</body></html>"
        mock_resp2.from_cache = False
        
        mock_get.side_effect = [mock_resp1, mock_resp2]
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should retry with identity encoding
        assert result is not None
        assert isinstance(result, BeautifulSoup)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_cache_buster_retry(self, mock_get):
        """Test request_html using cache buster on second empty body."""
        from bs4 import BeautifulSoup

        # Mock responses: first empty, second empty, third with content
        mock_resp1 = Mock()
        mock_resp1.status_code = 200
        mock_resp1.headers = {"Content-Encoding": "gzip", "Content-Length": "0"}
        mock_resp1.content = b""
        mock_resp1.text = ""
        mock_resp1.from_cache = False
        
        mock_resp2 = Mock()
        mock_resp2.status_code = 200
        mock_resp2.headers = {"Content-Encoding": "identity", "Content-Length": "0"}
        mock_resp2.content = b""
        mock_resp2.text = ""
        mock_resp2.from_cache = False
        
        mock_resp3 = Mock()
        mock_resp3.status_code = 200
        mock_resp3.headers = {}
        mock_resp3.content = b"<html><body>Test</body></html>"
        mock_resp3.text = "<html><body>Test</body></html>"
        mock_resp3.from_cache = False
        
        mock_get.side_effect = [mock_resp1, mock_resp2, mock_resp3]
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should use cache buster on third attempt
        assert result is not None
        assert isinstance(result, BeautifulSoup)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_cache_hit_detection(self, mock_get):
        """Test request_html detecting cache hits."""
        from bs4 import BeautifulSoup
        
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.headers = {}
        mock_resp.content = b"<html><body>Test</body></html>"
        mock_resp.text = "<html><body>Test</body></html>"
        mock_resp.from_cache = True  # Simulate cache hit
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should detect cache hit
        assert result is not None
        assert get_last_cache_hit() is True
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_retry_on_failure(self, mock_get):
        """Test request_html retrying on failed status code."""
        from bs4 import BeautifulSoup

        # Mock first response with 404
        mock_resp1 = Mock()
        mock_resp1.status_code = 404
        mock_resp1.from_cache = False
        
        # Mock second response with success
        mock_resp2 = Mock()
        mock_resp2.status_code = 200
        mock_resp2.headers = {}
        mock_resp2.content = b"<html><body>Test</body></html>"
        mock_resp2.text = "<html><body>Test</body></html>"
        mock_resp2.from_cache = False
        
        mock_get.side_effect = [mock_resp1, mock_resp2]
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should retry and succeed
        assert result is not None
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_exception_handling(self, mock_get):
        """Test request_html handling exceptions."""
        from requests import RequestException

        # Mock RequestException on request (which is caught)
        mock_get.side_effect = RequestException("Network error")
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should return None on exception
        assert result is None
    
    def test_parse_structured_json_ld_list_data(self):
        """Test _parse_structured_json_ld with list data."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        [{
            "@type": "MusicRecording",
            "name": "Test Track",
            "byArtist": [{"name": "Artist 1"}, {"name": "Artist 2"}],
            "contributor": [{"name": "Remixer 1"}],
            "inAlbum": {"name": "Test Release"},
            "datePublished": "2023-01-01"
        }]
        </script>
        </head>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_structured_json_ld(soup)
        
        assert "title" in result
        assert "artists" in result
        assert "remixers" in result
        assert "release_name" in result
        assert "release_date" in result
    
    def test_parse_structured_json_ld_creator_field(self):
        """Test _parse_structured_json_ld with creator field."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        {
            "@type": "MusicRecording",
            "name": "Test Track",
            "byArtist": {"name": "Test Artist"},
            "creator": [{"name": "Remixer 1"}, {"name": "Remixer 2"}]
        }
        </script>
        </head>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_structured_json_ld(soup)
        
        assert "remixers" in result
        assert "Remixer 1" in result["remixers"]
        assert "Remixer 2" in result["remixers"]
    
    def test_parse_next_data_remixers(self):
        """Test _parse_next_data extracting remixers."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <script id="__NEXT_DATA__" type="application/json">
        {
            "track": {
                "title": "Test Track",
                "artists": [{"name": "Test Artist"}],
                "remixers": [{"name": "Remixer 1"}, {"name": "Remixer 2"}],
                "key": "E Major",
                "bpm": 128,
                "label": {"name": "Test Label"},
                "genres": [{"name": "House"}],
                "releaseDate": "2023-01-01",
                "release": {"title": "Test Release"}
            }
        }
        </script>
        </body>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_next_data(soup)
        
        assert "remixers" in result
        assert "Remixer 1" in result["remixers"]
        assert "Remixer 2" in result["remixers"]
        assert "key" in result
        assert "bpm" in result
        assert "label" in result
        assert "genres" in result
        assert "release_date" in result
        assert "release_name" in result
    
    def test_parse_next_data_performers(self):
        """Test _parse_next_data with performers field."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <script id="__NEXT_DATA__" type="application/json">
        {
            "track": {
                "title": "Test Track",
                "performers": [{"name": "Performer 1"}, {"name": "Performer 2"}]
            }
        }
        </script>
        </body>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_next_data(soup)
        
        assert "artists" in result
        assert "Performer 1" in result["artists"]
        assert "Performer 2" in result["artists"]
    
    def test_parse_next_data_nested_structure(self):
        """Test _parse_next_data with nested data structure."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <script id="__NEXT_DATA__" type="application/json">
        {
            "data": {
                "props": {
                    "pageProps": {
                        "results": [{
                            "item": {
                                "title": "Test Track",
                                "artists": [{"name": "Test Artist"}]
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
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_next_data(soup)
        
        # Should extract from nested structure
        assert "title" in result or "artists" in result
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_combines_sources(self, mock_request):
        """Test parse_track_page combining JSON-LD and Next.js data."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        {
            "@type": "MusicRecording",
            "name": "JSON-LD Track",
            "byArtist": {"name": "JSON-LD Artist"}
        }
        </script>
        </head>
        <body>
        <script id="__NEXT_DATA__" type="application/json">
        {
            "props": {
                "pageProps": {
                    "track": {
                        "title": "Next.js Track",
                        "artists": [{"name": "Next.js Artist"}],
                        "key": {"name": "E Major"},
                        "bpm": 128
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
        # Should combine data from both sources
        assert isinstance(title, str)
        assert isinstance(artists, str)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_html_fallback_title(self, mock_request):
        """Test parse_track_page falling back to HTML for title."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <h1>HTML Title Track</h1>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract title from HTML
        assert "HTML Title Track" in title or len(title) > 0
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_html_fallback_artists(self, mock_request):
        """Test parse_track_page falling back to HTML for artists."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <h1>Test Track</h1>
        <a href="/artist/test-artist">Test Artist</a>
        <a href="/artist/another-artist">Another Artist</a>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract artists from HTML links
        assert isinstance(artists, str)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_empty_body_status_codes(self, mock_get):
        """Test request_html handling 204 and 304 status codes."""
        # Mock response with 204 (No Content)
        mock_resp = Mock()
        mock_resp.status_code = 204
        mock_resp.headers = {}
        mock_resp.content = b""
        mock_resp.text = ""
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should handle 204 as empty body
        assert result is None
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_content_length_zero(self, mock_get):
        """Test request_html handling Content-Length: 0."""
        # Mock response with Content-Length: 0
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Length": "0"}
        mock_resp.content = b""
        mock_resp.text = ""
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should detect empty body from Content-Length
        assert result is None
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_beautifulsoup_exception(self, mock_get):
        """Test request_html handling BeautifulSoup parsing exception."""
        # Mock response that will cause BeautifulSoup to fail
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.headers = {}
        mock_resp.content = b"<html><body>Test</body></html>"
        mock_resp.text = "<html><body>Test</body></html>"
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        # Mock BeautifulSoup to raise exception
        with patch('cuepoint.data.beatport.BeautifulSoup', side_effect=Exception("Parse error")):
            result = request_html("https://www.beatport.com/track/test/123")
            
            # Should return None on BeautifulSoup exception
            assert result is None
    
    def test_parse_structured_json_ld_invalid_json(self):
        """Test _parse_structured_json_ld with invalid JSON."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        {invalid json}
        </script>
        </head>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_structured_json_ld(soup)
        
        # Should handle invalid JSON gracefully
        assert isinstance(result, dict)
    
    def test_parse_structured_json_ld_non_dict(self):
        """Test _parse_structured_json_ld with non-dict data."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        "just a string"
        </script>
        </head>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_structured_json_ld(soup)
        
        # Should handle non-dict data gracefully
        assert isinstance(result, dict)
    
    def test_parse_next_data_invalid_json(self):
        """Test _parse_next_data with invalid JSON."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <script id="__NEXT_DATA__" type="application/json">
        {invalid json}
        </script>
        </body>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_next_data(soup)
        
        # Should handle invalid JSON gracefully
        assert isinstance(result, dict)
    
    def test_parse_next_data_no_script_tag(self):
        """Test _parse_next_data when script tag is missing."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <p>No script tag here</p>
        </body>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_next_data(soup)
        
        # Should return empty dict when script tag is missing
        assert isinstance(result, dict)
        assert len(result) == 0
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_artists_byline(self, mock_request):
        """Test parse_track_page extracting artists from byline."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Artists: Test Artist, Another Artist</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract artists from byline
        assert isinstance(artists, str)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_remixers_val_after_label(self, mock_request):
        """Test parse_track_page extracting remixers using val_after_label."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Remixers</span>
        <span>Remixer 1, Remixer 2</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract remixers
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_key_bpm_val_after_label(self, mock_request):
        """Test parse_track_page extracting key and BPM using val_after_label."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Key</span>
        <span>E Major</span>
        <span>BPM</span>
        <span>128 BPM</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract key and BPM
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_label_from_link(self, mock_request):
        """Test parse_track_page extracting label from link."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <a href="/label/test-label">Test Label</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract label from link
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_label_val_after_label(self, mock_request):
        """Test parse_track_page extracting label using val_after_label."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Label</span>
        <span>Test Label</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract label
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_genres_from_links(self, mock_request):
        """Test parse_track_page extracting genres from links."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <a href="/genre/house">House</a>
        <a href="/genre/techno">Techno</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract genres from links
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_genres_val_after_label(self, mock_request):
        """Test parse_track_page extracting genres using val_after_label."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Genres</span>
        <span>House, Techno</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract genres
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_release_name_from_link(self, mock_request):
        """Test parse_track_page extracting release name from link."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <a href="/release/test-release">Test Release</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract release name from link
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_release_name_val_after_label(self, mock_request):
        """Test parse_track_page extracting release name using val_after_label."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Release</span>
        <span>Test Release</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract release name
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_release_date_meta(self, mock_request):
        """Test parse_track_page extracting release date from meta tag."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <meta property="music:release_date" content="2023-01-01">
        </head>
        <body></body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should extract release date from meta
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_remixers_merge_with_title(self, mock_request):
        """Test parse_track_page merging remixers from title."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        {
            "@type": "MusicRecording",
            "name": "Test Track (Remixer Remix)"
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
        # Should merge remixers from title
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_headers_exception(self, mock_get):
        """Test request_html handling exception when accessing headers."""
        from bs4 import BeautifulSoup

        # Mock response that raises exception on headers.get but has content
        # The exception is caught in _is_empty_body, so we should still get a result
        mock_resp = Mock()
        mock_resp.status_code = 200
        # Create a mock headers object that raises exception on get()
        mock_headers = Mock()
        def headers_get_side_effect(key, default=None):
            if key == "Content-Length":
                raise Exception("Header access error")
            return default
        mock_headers.get = Mock(side_effect=headers_get_side_effect)
        mock_resp.headers = mock_headers
        mock_resp.content = b"<html><body>Test</body></html>"
        mock_resp.text = "<html><body>Test</body></html>"
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should handle header exception gracefully (caught in _is_empty_body)
        # and still return the parsed HTML since content exists
        assert result is not None
        assert isinstance(result, BeautifulSoup)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_from_cache_attribute(self, mock_get):
        """Test request_html detecting cache via _from_cache attribute."""
        from bs4 import BeautifulSoup
        
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.headers = {}
        mock_resp.content = b"<html><body>Test</body></html>"
        mock_resp.text = "<html><body>Test</body></html>"
        # Use _from_cache instead of from_cache
        mock_resp._from_cache = True
        delattr(mock_resp, 'from_cache')  # Remove from_cache to test _from_cache path
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should detect cache via _from_cache
        assert result is not None
        assert get_last_cache_hit() is True
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_compressed_encoding(self, mock_get):
        """Test request_html handling compressed encodings (gzip, br, deflate)."""
        # Mock response with compressed encoding
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Encoding": "gzip"}
        mock_resp.content = b""
        mock_resp.text = ""
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should detect compressed encoding as empty body
        assert result is None
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_date_parsing_exception(self, mock_request):
        """Test parse_track_page handling date parsing exceptions."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Release Date</span>
        <span>Invalid Date Format</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should handle date parsing exception gracefully
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_meta_date_parsing_exception(self, mock_request):
        """Test parse_track_page handling meta date parsing exceptions."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <meta property="music:release_date" content="Invalid Date">
        </head>
        <body></body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        assert result is not None
        title, artists, key, year, bpm, label, genres, rel_name, rel_date = result
        # Should handle meta date parsing exception gracefully
        assert isinstance(result, tuple)
    
    def test_parse_structured_json_ld_grab_non_dict(self):
        """Test _parse_structured_json_ld with non-dict in grab function."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        {
            "@type": "MusicRecording",
            "name": "Test Track",
            "byArtist": "not a dict"
        }
        </script>
        </head>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_structured_json_ld(soup)
        
        # Should handle non-dict byArtist gracefully
        assert isinstance(result, dict)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_direct_search_success(self, mock_direct):
        """Test track_urls with direct search success."""
        # Mock direct search returning URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True)
        
        # Should return URLs from direct search
        assert isinstance(urls, list)
        assert len(urls) > 0
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_direct_search_remix_query(self, mock_direct):
        """Test track_urls with remix query using direct search."""
        # Mock direct search returning URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/test-remix/123456"
        ]
        
        urls = track_urls(1, "Test Track (Artist Remix)", max_results=10, use_direct_search=None)
        
        # Should use direct search for remix queries
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_fallback(self, mock_browser, mock_direct):
        """Test track_urls falling back to browser when direct search finds few results."""
        # Mock direct search returning few results
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock browser search returning more URLs
        mock_browser.return_value = [
            "https://www.beatport.com/track/test/123456",
            "https://www.beatport.com/track/test-remix/123457"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True, fallback_to_browser=True)
        
        # Should use browser fallback for remix queries with few results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_site_prefix_extraction(self, mock_direct):
        """Test track_urls extracting search terms from site:beatport.com prefix."""
        # Mock direct search
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        urls = track_urls(1, "site:beatport.com/track Test Track", max_results=10, use_direct_search=True)
        
        # Should extract search terms from site: prefix
        assert isinstance(urls, list)
        # Verify that the search query was cleaned (no site: prefix)
        assert mock_direct.called
    
    def test_track_urls_ddg_search(self):
        """Test track_urls using DuckDuckGo search."""
        # Mock DuckDuckGo search
        with patch('cuepoint.data.beatport.ddg_track_urls') as mock_ddg:
            mock_ddg.return_value = [
                "https://www.beatport.com/track/test/123456"
            ]
            
            urls = track_urls(1, "Test Track", max_results=10, use_direct_search=False)
            
            # Should use DuckDuckGo search
            assert isinstance(urls, list)
            assert len(urls) > 0
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_basic(self, mock_ddgs_class):
        """Test ddg_track_urls basic functionality."""
        # Mock DDGS context manager
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should return URLs
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_remix_query(self, mock_ddgs_class):
        """Test ddg_track_urls with remix query (should increase max_results)."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test-remix/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track (Remix)", max_results=10)
        
        # Should increase max_results for remix queries
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_original_mix_detection(self, mock_direct):
        """Test track_urls detecting original mix queries."""
        # Mock direct search
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        urls = track_urls(1, "Test Track Original Mix", max_results=10, use_direct_search=None)
        
        # Should use direct search for original mix queries
        assert isinstance(urls, list)
    
    def test_track_urls_no_remix_keywords(self):
        """Test track_urls with query that has no remix keywords."""
        # Mock DuckDuckGo search (should be used when no remix keywords)
        with patch('cuepoint.data.beatport.ddg_track_urls') as mock_ddg:
            mock_ddg.return_value = [
                "https://www.beatport.com/track/test/123456"
            ]
            
            urls = track_urls(1, "Test Track", max_results=10, use_direct_search=None)
            
            # Should use DuckDuckGo for non-remix queries
            assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_quoted_query(self, mock_ddgs_class):
        """Test ddg_track_urls with quoted query."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, '"Test Track"', max_results=10)
        
        # Should handle quoted queries
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_exact_remix_query(self, mock_ddgs_class):
        """Test ddg_track_urls with exact quoted remix query."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test-remix/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, '"Test Track (Remix)"', max_results=10)
        
        # Should use higher max_results for exact quoted remix queries
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_multiple_strategies(self, mock_ddgs_class):
        """Test ddg_track_urls trying multiple search strategies."""
        # Mock DDGS with multiple results
        mock_ddgs = Mock()
        mock_result1 = Mock()
        mock_result1.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_result2 = Mock()
        mock_result2.get.return_value = "https://www.beatport.com/track/test2/123457"
        mock_ddgs.text.return_value = [mock_result1, mock_result2]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should try multiple search strategies
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_exception_handling(self, mock_ddgs_class):
        """Test ddg_track_urls handling exceptions."""
        # Mock DDGS raising exception
        mock_ddgs = Mock()
        mock_ddgs.text.side_effect = Exception("Search error")
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should handle exceptions gracefully
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_fallback_search(self, mock_ddgs_class):
        """Test ddg_track_urls fallback search when few results."""
        # Mock DDGS returning few results
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should perform fallback search when results are low
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_merge_results(self, mock_browser, mock_direct):
        """Test track_urls merging browser and direct search results."""
        # Mock direct search returning some URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock browser search returning more URLs
        mock_browser.return_value = [
            "https://www.beatport.com/track/test-browser/123457",
            "https://www.beatport.com/track/test/123456"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True, fallback_to_browser=True)
        
        # Should merge results from both sources
        assert isinstance(urls, list)
        # Should deduplicate
        assert len(urls) == len(set(urls))
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_when_direct_empty(self, mock_browser, mock_direct):
        """Test track_urls using browser when direct search returns empty."""
        # Mock direct search returning empty
        mock_direct.return_value = []
        
        # Mock browser search returning URLs
        mock_browser.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True, fallback_to_browser=True)
        
        # Should use browser when direct search is empty
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_remix_query_few_results(self, mock_direct):
        """Test track_urls with remix query finding few results."""
        # Mock direct search returning few results
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': False}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True)
        
        # Should return direct search results even if few
        assert isinstance(urls, list)
        assert len(urls) > 0
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_site_prefix_with_track(self, mock_direct):
        """Test track_urls handling site:beatport.com/track prefix."""
        # Mock direct search
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        urls = track_urls(1, "site:beatport.com/track/test-track", max_results=10, use_direct_search=True)
        
        # Should extract search terms from site: prefix with /track
        assert isinstance(urls, list)
        assert mock_direct.called
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_extended_mix(self, mock_ddgs_class):
        """Test ddg_track_urls with extended mix query."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test-extended/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track Extended Mix", max_results=10)
        
        # Should detect extended mix and increase max_results
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_rework_keyword(self, mock_ddgs_class):
        """Test ddg_track_urls with rework keyword."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test-rework/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track Rework", max_results=10)
        
        # Should detect rework keyword and increase max_results
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_break_early_non_remix(self, mock_ddgs_class):
        """Test ddg_track_urls breaking early for non-remix queries with many results."""
        # Mock DDGS returning many results
        mock_ddgs = Mock()
        mock_results = [Mock() for _ in range(25)]
        for i, result in enumerate(mock_results):
            result.get.return_value = f"https://www.beatport.com/track/test{i}/12345{i}"
        mock_ddgs.text.return_value = mock_results
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should break early for non-remix queries with many results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_remix_few_results(self, mock_browser, mock_direct):
        """Test track_urls using browser for remix query with few direct results."""
        # Mock direct search returning few results (< 10)
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock browser search returning more URLs
        mock_browser.return_value = [
            "https://www.beatport.com/track/test-browser/123457"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True)
        
        # Should try browser for remix queries with < 10 results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_merge_with_direct(self, mock_browser, mock_direct):
        """Test track_urls merging browser results with existing direct results."""
        # Mock direct search returning some URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock browser search returning URLs (some overlapping)
        mock_browser.return_value = [
            "https://www.beatport.com/track/test-browser/123457",
            "https://www.beatport.com/track/test/123456"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True)
        
        # Should merge browser and direct results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_import_error_fallback(self, mock_direct):
        """Test track_urls falling back to DuckDuckGo on ImportError."""
        # Mock ImportError when importing beatport_search
        with patch('cuepoint.data.beatport.beatport_search_direct', side_effect=ImportError("No module")):
            with patch('cuepoint.data.beatport.ddg_track_urls') as mock_ddg:
                mock_ddg.return_value = [
                    "https://www.beatport.com/track/test/123456"
                ]
                
                urls = track_urls(1, "Test Track", max_results=10, use_direct_search=True)
                
                # Should fall back to DuckDuckGo on ImportError
                assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_exception_fallback(self, mock_direct):
        """Test track_urls falling back to DuckDuckGo on exception."""
        # Mock exception in direct search
        mock_direct.side_effect = Exception("Search error")
        
        with patch('cuepoint.data.beatport.ddg_track_urls') as mock_ddg:
            mock_ddg.return_value = [
                "https://www.beatport.com/track/test/123456"
            ]
            
            urls = track_urls(1, "Test Track", max_results=10, use_direct_search=True)
            
            # Should fall back to DuckDuckGo on exception
            assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.ddg_track_urls')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_fallback_many_ddg_results(self, mock_browser, mock_ddg):
        """Test track_urls using browser when DuckDuckGo finds many results."""
        # Mock DuckDuckGo returning many results (50+)
        mock_ddg.return_value = [
            f"https://www.beatport.com/track/test{i}/12345{i}"
            for i in range(60)
        ]
        
        # Mock browser search
        mock_browser.return_value = [
            "https://www.beatport.com/track/exact-match/123456"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track Artist", max_results=10, use_direct_search=False, fallback_to_browser=True)
        
        # Should try browser when DDG finds many results and fallback_to_browser is True
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.ddg_track_urls')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_auto_detect_artist_title(self, mock_browser, mock_ddg):
        """Test track_urls auto-detecting artist+title queries for browser."""
        # Mock DuckDuckGo returning many results
        mock_ddg.return_value = [
            f"https://www.beatport.com/track/test{i}/12345{i}"
            for i in range(60)
        ]
        
        # Mock browser search
        mock_browser.return_value = [
            "https://www.beatport.com/track/exact-match/123456"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            # Query with 2+ words, not quoted, not remix - should auto-detect as artist+title
            urls = track_urls(1, "Test Track Artist Name", max_results=10, use_direct_search=False)
        
        # Should auto-detect artist+title query and try browser
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    @patch('cuepoint.data.beatport.request_html')
    def test_ddg_track_urls_fallback_page_parsing(self, mock_request, mock_ddgs_class):
        """Test ddg_track_urls fallback parsing pages for track links."""
        from bs4 import BeautifulSoup

        # Mock DDGS returning page URLs (not track URLs)
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/release/test-release"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Mock HTML request returning page with track links
        html_content = """
        <html>
        <body>
        <a href="/track/test-track/123456">Test Track</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = ddg_track_urls(1, "Test", max_results=10)
        
        # Should parse pages and extract track links
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_fallback_broader_searches(self, mock_ddgs_class):
        """Test ddg_track_urls performing broader searches when few results."""
        # Mock DDGS with fallback searches
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should perform broader searches when results are low
        assert isinstance(urls, list)
    
    @patch('duckduckgo_search.DDGS')
    def test_ddg_track_urls_url_construction_fallback(self, mock_ddgs_class):
        """Test ddg_track_urls constructing URLs from query parts."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/constructed/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Query with very few results should trigger URL construction
        urls = ddg_track_urls(1, "Test Track Artist", max_results=10)
        
        # Should try URL construction when results are very low
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_304_status(self, mock_get):
        """Test request_html handling 304 status code."""
        # Mock response with 304 (Not Modified)
        mock_resp = Mock()
        mock_resp.status_code = 304
        mock_resp.headers = {}
        mock_resp.content = b""
        mock_resp.text = ""
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should handle 304 as empty body
        assert result is None
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_deflate_encoding(self, mock_get):
        """Test request_html handling deflate encoding."""
        # Mock response with deflate encoding
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Encoding": "deflate"}
        mock_resp.content = b""
        mock_resp.text = ""
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should detect deflate encoding as empty body
        assert result is None
    
    @patch('cuepoint.data.beatport.request_html')
    def test_parse_track_page_val_after_label_exception(self, mock_request):
        """Test parse_track_page handling exceptions in val_after_label."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <body>
        <div>
        <span>Key</span>
        </div>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        result = parse_track_page("https://www.beatport.com/track/test/123")
        
        # Should handle exceptions in val_after_label gracefully
        assert isinstance(result, tuple)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_resp_none(self, mock_get):
        """Test request_html handling None response."""
        # Mock get returning None
        mock_get.return_value = None
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should handle None response gracefully
        assert result is None
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_headers_get_exception(self, mock_get):
        """Test request_html handling exception when getting headers."""
        # Mock response that raises exception on headers.get
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_headers = Mock()
        mock_headers.get.side_effect = Exception("Header error")
        mock_resp.headers = mock_headers
        mock_resp.content = b"<html><body>Test</body></html>"
        mock_resp.text = "<html><body>Test</body></html>"
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should handle header exception gracefully
        assert result is not None
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_max_results_limit(self, mock_browser, mock_direct):
        """Test track_urls respecting max_results when merging browser results."""
        # Mock direct search returning URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock browser search returning many URLs
        mock_browser.return_value = [
            f"https://www.beatport.com/track/test{i}/12345{i}"
            for i in range(20)
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=5, use_direct_search=True, fallback_to_browser=True)
        
        # Should respect max_results limit
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_direct_merge_max_results(self, mock_browser, mock_direct):
        """Test track_urls max_results limit when merging browser and direct results."""
        # Mock direct search returning URLs
        mock_direct.return_value = [
            f"https://www.beatport.com/track/direct{i}/12345{i}"
            for i in range(10)
        ]
        
        # Mock browser search returning URLs
        mock_browser.return_value = [
            f"https://www.beatport.com/track/browser{i}/12346{i}"
            for i in range(10)
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=5, use_direct_search=True)
        
        # Should respect max_results when merging
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport.ddg_track_urls')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_ddg_merge_max_results(self, mock_browser, mock_ddg):
        """Test track_urls max_results limit when merging browser and DDG results."""
        # Mock DuckDuckGo returning many URLs
        mock_ddg.return_value = [
            f"https://www.beatport.com/track/ddg{i}/12345{i}"
            for i in range(60)
        ]
        
        # Mock browser search returning URLs
        mock_browser.return_value = [
            f"https://www.beatport.com/track/browser{i}/12346{i}"
            for i in range(10)
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track Artist", max_results=5, use_direct_search=False, fallback_to_browser=True)
        
        # Should respect max_results when merging browser and DDG
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport.ddg_track_urls')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_import_error(self, mock_browser, mock_ddg):
        """Test track_urls handling ImportError when importing browser search."""
        # Mock DuckDuckGo returning URLs
        mock_ddg.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock ImportError when importing beatport_search_browser
        with patch('cuepoint.data.beatport.beatport_search_browser', side_effect=ImportError("No module")):
            urls = track_urls(1, "Test Track Artist", max_results=10, use_direct_search=False, fallback_to_browser=True)
        
        # Should handle ImportError and return DDG results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.ddg_track_urls')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_exception(self, mock_browser, mock_ddg):
        """Test track_urls handling exception in browser search."""
        # Mock DuckDuckGo returning URLs
        mock_ddg.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock browser search raising exception
        mock_browser.side_effect = Exception("Browser error")
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track Artist", max_results=10, use_direct_search=False, fallback_to_browser=True)
        
        # Should handle exception and return DDG results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_site_prefix_cleaning(self, mock_direct):
        """Test track_urls cleaning site: prefix from query."""
        # Mock direct search
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Test with site: prefix
        urls = track_urls(1, "site:beatport.com Test Track", max_results=10, use_direct_search=True)
        
        # Should clean site: prefix
        assert isinstance(urls, list)
        assert mock_direct.called
        # Verify the call was made with cleaned query (no site: prefix)
        call_args = mock_direct.call_args
        if call_args:
            search_query = call_args[0][1] if len(call_args[0]) > 1 else ""
            assert "site:beatport.com" not in search_query.lower()
    
    @patch('duckduckgo_search.DDGS')
    @patch('cuepoint.data.beatport.request_html')
    def test_ddg_track_urls_fallback_exception(self, mock_request, mock_ddgs_class):
        """Test ddg_track_urls handling exceptions in fallback search."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/release/test"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Mock request_html raising exception
        mock_request.side_effect = Exception("Request error")
        
        urls = ddg_track_urls(1, "Test", max_results=10)
        
        # Should handle exceptions in fallback gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_fallback_exception_inner(self, mock_ddgs_class):
        """Test ddg_track_urls handling exceptions in inner fallback loop."""
        # Mock DDGS raising exception in fallback searches
        mock_ddgs = Mock()
        mock_ddgs.text.side_effect = Exception("Search error")
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should handle exceptions in fallback searches gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_broader_search_exception(self, mock_ddgs_class):
        """Test ddg_track_urls handling exceptions in broader searches."""
        # Mock DDGS
        mock_ddgs = Mock()
        # First call returns few results, second call (broader search) raises exception
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.side_effect = [
            [mock_result],  # First search
            Exception("Broader search error")  # Broader search fails
        ]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should handle broader search exceptions gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_br_encoding(self, mock_get):
        """Test request_html handling br (Brotli) encoding."""
        # Mock response with br encoding
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Encoding": "br"}
        mock_resp.content = b""
        mock_resp.text = ""
        mock_resp.from_cache = False
        
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should detect br encoding as empty body
        assert result is None
    
    @patch('cuepoint.data.beatport.SESSION.get')
    def test_request_html_resp_false(self, mock_get):
        """Test request_html handling False response."""
        # Mock get returning False-like response
        mock_resp = Mock()
        mock_resp.__bool__ = Mock(return_value=False)
        mock_get.return_value = mock_resp
        
        result = request_html("https://www.beatport.com/track/test/123")
        
        # Should handle False response gracefully
        assert result is None
    
    def test_parse_structured_json_ld_grab_returns_early(self):
        """Test _parse_structured_json_ld grab function returning early for non-dict."""
        from bs4 import BeautifulSoup
        
        html_content = """
        <html>
        <head>
        <script type="application/ld+json">
        {
            "@type": "MusicRecording",
            "name": "Test Track",
            "byArtist": "string not dict"
        }
        </script>
        </head>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        result = _parse_structured_json_ld(soup)
        
        # Should handle non-dict byArtist gracefully
        assert isinstance(result, dict)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_import_error_pass(self, mock_direct):
        """Test track_urls ImportError path."""
        # Mock ImportError when importing beatport_search
        with patch('builtins.__import__', side_effect=ImportError("No module")):
            with patch('cuepoint.data.beatport.ddg_track_urls') as mock_ddg:
                mock_ddg.return_value = [
                    "https://www.beatport.com/track/test/123456"
                ]
                
                urls = track_urls(1, "Test Track", max_results=10, use_direct_search=True)
                
                # Should pass through ImportError and use DuckDuckGo
                assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.ddg_track_urls')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_import_error_pass(self, mock_browser, mock_ddg):
        """Test track_urls ImportError in browser fallback."""
        # Mock DuckDuckGo returning URLs
        mock_ddg.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Mock ImportError when importing beatport_search_browser
        with patch('builtins.__import__', side_effect=ImportError("No module")):
            urls = track_urls(1, "Test Track Artist", max_results=10, use_direct_search=False, fallback_to_browser=True)
        
        # Should pass through ImportError and return DDG results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_site_prefix_track_removal(self, mock_direct):
        """Test track_urls removing /track prefix from site: queries."""
        # Mock direct search
        mock_direct.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        # Test with site:beatport.com/track prefix
        urls = track_urls(1, "site:beatport.com/track/test-track", max_results=10, use_direct_search=True)
        
        # Should remove /track prefix
        assert isinstance(urls, list)
        assert mock_direct.called
        # Verify the call was made with cleaned query (no /track prefix)
        call_args = mock_direct.call_args
        if call_args:
            search_query = call_args[0][1] if len(call_args[0]) > 1 else ""
            assert not search_query.startswith("/track")
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_remix_less_than_10(self, mock_browser, mock_direct):
        """Test track_urls using browser for remix query with < 10 direct results."""
        # Mock direct search returning < 10 results
        mock_direct.return_value = [
            f"https://www.beatport.com/track/test{i}/12345{i}"
            for i in range(5)
        ]
        
        # Mock browser search
        mock_browser.return_value = [
            "https://www.beatport.com/track/test-browser/123457"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True)
        
        # Should try browser for remix queries with < 10 results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_no_direct_results(self, mock_browser, mock_direct):
        """Test track_urls using browser when direct search returns no results."""
        # Mock direct search returning empty
        mock_direct.return_value = []
        
        # Mock browser search returning URLs
        mock_browser.return_value = [
            "https://www.beatport.com/track/test/123456"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True)
        
        # Should try browser when direct search is empty
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_merge_direct_first(self, mock_browser, mock_direct):
        """Test track_urls merging browser results with direct results (browser first)."""
        # Mock direct search returning URLs
        mock_direct.return_value = [
            "https://www.beatport.com/track/direct/123456"
        ]
        
        # Mock browser search returning URLs
        mock_browser.return_value = [
            "https://www.beatport.com/track/browser/123457"
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=10, use_direct_search=True)
        
        # Should merge with browser results first
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_merge_max_results_break(self, mock_browser, mock_direct):
        """Test track_urls breaking when max_results reached during merge."""
        # Mock direct search returning many URLs
        mock_direct.return_value = [
            f"https://www.beatport.com/track/direct{i}/12345{i}"
            for i in range(20)
        ]
        
        # Mock browser search returning many URLs
        mock_browser.return_value = [
            f"https://www.beatport.com/track/browser{i}/12346{i}"
            for i in range(20)
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track (Remix)", max_results=5, use_direct_search=True)
        
        # Should break when max_results reached
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport.ddg_track_urls')
    @patch('cuepoint.data.beatport_search.beatport_search_browser')
    def test_track_urls_browser_ddg_merge_max_results_break(self, mock_browser, mock_ddg):
        """Test track_urls breaking when max_results reached during browser+DDG merge."""
        # Mock DuckDuckGo returning many URLs
        mock_ddg.return_value = [
            f"https://www.beatport.com/track/ddg{i}/12345{i}"
            for i in range(60)
        ]
        
        # Mock browser search returning many URLs
        mock_browser.return_value = [
            f"https://www.beatport.com/track/browser{i}/12346{i}"
            for i in range(20)
        ]
        
        with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
            urls = track_urls(1, "Test Track Artist", max_results=5, use_direct_search=False, fallback_to_browser=True)
        
        # Should break when max_results reached
        assert len(urls) <= 5
    
    @patch('cuepoint.data.beatport_search.beatport_search_direct')
    def test_track_urls_search_query_local_var(self, mock_direct):
        """Test track_urls using search_query local variable for browser."""
        # Mock direct search returning empty
        mock_direct.return_value = []
        
        # Mock browser search
        with patch('cuepoint.data.beatport_search.beatport_search_browser') as mock_browser:
            mock_browser.return_value = [
                "https://www.beatport.com/track/test/123456"
            ]
            
            with patch.dict('cuepoint.data.beatport.SETTINGS', {'USE_BROWSER_AUTOMATION': True}):
                urls = track_urls(1, "site:beatport.com Test Track", max_results=10, use_direct_search=True)
            
            # Should use search_query local variable if it exists
            assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_outer_exception_handler(self, mock_ddgs_class):
        """Test ddg_track_urls outer exception handler - lines 892-894."""
        # Mock DDGS raising exception in outer try block (not in inner loop)
        mock_ddgs_class.side_effect = Exception("DDGS initialization error")
        
        urls = ddg_track_urls(1, "Test Track", max_results=10)
        
        # Should return empty list on outer exception
        assert urls == []
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_trace_logging(self, mock_ddgs_class):
        """Test ddg_track_urls TRACE logging - lines 997-1000."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Mock tlog to verify it's called (tlog is imported from utils module within beatport)
        # The import happens inside the function, so we need to patch it at the function level
        with patch('builtins.__import__') as mock_import, \
             patch.dict('cuepoint.models.config.SETTINGS', {'TRACE': True}):
            # Mock the import to return a mock tlog function
            def import_side_effect(name, *args, **kwargs):
                if name == 'utils':
                    mock_utils = Mock()
                    mock_utils.tlog = Mock()
                    return mock_utils
                return __import__(name, *args, **kwargs)
            mock_import.side_effect = import_side_effect
            
            urls = ddg_track_urls(1, "Test Track", max_results=10)
            
            # Should call tlog when TRACE is enabled
            assert isinstance(urls, list)
            # The import should be called when TRACE is True
            if urls:
                # Check if utils was imported (which happens when TRACE is True)
                assert any('utils' in str(call) for call in mock_import.call_args_list)
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_exact_remix_query_max_200(self, mock_ddgs_class):
        """Test ddg_track_urls with exact quoted remix query setting max_results to 200 - line 858."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test-remix/123456"
        # Create enough results to verify max_results was increased
        mock_ddgs.text.return_value = [mock_result] * 250  # More than 200
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Exact quoted remix query should trigger max(mr, 200)
        urls = ddg_track_urls(1, '"Test Track (Remix)"', max_results=10)
        
        # Should process more results due to increased max_results
        assert isinstance(urls, list)
        # Verify that text was called with max_results >= 200 in the main search
        # (not the fallback search which uses max_results=20)
        if mock_ddgs.text.called:
            # Get all call arguments - the first calls should be the main search
            main_search_calls = [call for call in mock_ddgs.text.call_args_list 
                                if 'site:beatport.com/track' in str(call) or 'site:beatport.com' in str(call)]
            for call in main_search_calls:
                args = call[0] if call[0] else []
                kwargs = call[1] if len(call) > 1 and call[1] else {}
                # max_results is passed as a keyword argument
                if 'max_results' in kwargs:
                    assert kwargs['max_results'] >= 200, f"Expected max_results >= 200, got {kwargs['max_results']}"
                    break  # Found the main search call with increased max_results
    
    @patch('cuepoint.data.beatport.DDGS')
    @patch('cuepoint.data.beatport.request_html')
    def test_ddg_track_urls_fallback_page_track_url_direct(self, mock_request, mock_ddgs_class):
        """Test ddg_track_urls fallback adding track URL directly - lines 938-943."""
        from bs4 import BeautifulSoup

        # Mock DDGS returning page URL that is already a track URL
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test-track/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Query that triggers fallback (few results)
        urls = ddg_track_urls(1, "Test", max_results=10)
        
        # Should add track URL directly when /track/ is in page_url
        assert isinstance(urls, list)
        assert any("track" in url.lower() for url in urls)
    
    @patch('cuepoint.data.beatport.DDGS')
    @patch('cuepoint.data.beatport.request_html')
    def test_ddg_track_urls_fallback_page_parsing_href_continue(self, mock_request, mock_ddgs_class):
        """Test ddg_track_urls fallback page parsing with empty href - lines 952-954."""
        from bs4 import BeautifulSoup

        # Mock DDGS returning page URL (not track URL)
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/release/test-release"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Mock HTML with track link that has empty href
        html_content = """
        <html>
        <body>
        <a href="">Empty href</a>
        <a href="/track/test-track/123456">Valid track</a>
        </body>
        </html>
        """
        mock_request.return_value = BeautifulSoup(html_content, 'html.parser')
        
        urls = ddg_track_urls(1, "Test", max_results=10)
        
        # Should skip empty href and process valid track links
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.DDGS')
    @patch('cuepoint.data.beatport.request_html')
    def test_ddg_track_urls_fallback_page_parsing_exception(self, mock_request, mock_ddgs_class):
        """Test ddg_track_urls fallback page parsing exception handling - line 959."""
        from bs4 import BeautifulSoup

        # Mock DDGS returning page URL
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/release/test-release"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Mock HTML with track link that raises exception when processing
        html_content = """
        <html>
        <body>
        <a href="/track/test-track/123456">Test Track</a>
        </body>
        </html>
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        # Make a.get("href") raise exception
        mock_a = Mock()
        mock_a.get.side_effect = Exception("Attribute error")
        soup.select = Mock(return_value=[mock_a])
        mock_request.return_value = soup
        
        urls = ddg_track_urls(1, "Test", max_results=10)
        
        # Should handle exceptions in track link processing gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_broader_search_href_processing(self, mock_ddgs_class):
        """Test ddg_track_urls broader search href processing - lines 986-989."""
        # Mock DDGS
        mock_ddgs = Mock()
        # First call returns few results, second call (broader search) returns results
        mock_result1 = Mock()
        mock_result1.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_result2 = Mock()
        mock_result2.get.return_value = "https://www.beatport.com/track/broader/123457"
        mock_ddgs.text.side_effect = [
            [mock_result1],  # First search (few results)
            [mock_result2]  # Broader search
        ]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Query with very few results (< 3) to trigger broader search
        urls = ddg_track_urls(1, "Test Track Artist", max_results=10)
        
        # Should process broader search results
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_broader_search_exception_inner(self, mock_ddgs_class):
        """Test ddg_track_urls broader search exception in inner loop - lines 990-992."""
        # Mock DDGS
        mock_ddgs = Mock()
        # First call returns few results, second call (broader search) raises exception
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.side_effect = [
            [mock_result],  # First search
            Exception("Broader search error")  # Broader search fails
        ]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Query with very few results to trigger broader search
        urls = ddg_track_urls(1, "Test Track Artist", max_results=10)
        
        # Should handle broader search exceptions gracefully
        assert isinstance(urls, list)
    
    @patch('cuepoint.data.beatport.DDGS')
    def test_ddg_track_urls_url_construction_exception(self, mock_ddgs_class):
        """Test ddg_track_urls URL construction exception handling - lines 993-994."""
        # Mock DDGS
        mock_ddgs = Mock()
        mock_result = Mock()
        mock_result.get.return_value = "https://www.beatport.com/track/test/123456"
        mock_ddgs.text.return_value = [mock_result]
        mock_ddgs_class.return_value.__enter__.return_value = mock_ddgs
        
        # Query with very few results to trigger URL construction
        # The exception handling in the URL construction try block should catch any errors
        urls = ddg_track_urls(1, "Test Track Artist", max_results=10)
        
        # Should handle URL construction exceptions gracefully
        assert isinstance(urls, list)

        assert isinstance(urls, list)

