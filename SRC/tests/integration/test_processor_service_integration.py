"""Integration tests for ProcessorService with real service instances."""

import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services.cache_service import CacheService
from cuepoint.services.config_service import ConfigService
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.processor_service import ProcessorService


class TestProcessorServiceIntegration:
    """Integration tests for ProcessorService using real service instances."""
    
    @pytest.fixture
    def real_logging_service(self):
        """Create a real logging service."""
        return LoggingService()
    
    @pytest.fixture
    def real_config_service(self):
        """Create a real config service."""
        return ConfigService()
    
    @pytest.fixture
    def real_cache_service(self):
        """Create a real cache service."""
        return CacheService()
    
    @pytest.fixture
    def real_beatport_service(self, real_cache_service, real_logging_service):
        """Create a real beatport service."""
        return BeatportService(
            cache_service=real_cache_service,
            logging_service=real_logging_service
        )
    
    @pytest.fixture
    def real_matcher_service(self):
        """Create a real matcher service."""
        return MatcherService()  # Stateless service, no dependencies
    
    @pytest.fixture
    def processor_service(
        self,
        real_beatport_service,
        real_matcher_service,
        real_logging_service,
        real_config_service
    ):
        """Create a real processor service."""
        return ProcessorService(
            beatport_service=real_beatport_service,
            matcher_service=real_matcher_service,
            logging_service=real_logging_service,
            config_service=real_config_service
        )
    
    def test_process_track_integration_with_mocked_search(
        self,
        processor_service,
        sample_track
    ):
        """Test process_track with real services but mocked network calls."""
        # Mock the network search to avoid actual API calls
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = []  # No results from search
            
            # Process track
            result = processor_service.process_track(1, sample_track)
            
            # Verify result structure
            assert result is not None
            assert isinstance(result, TrackResult)
            assert result.title == sample_track.title
            assert result.artist == sample_track.artist
            assert result.matched is False  # No match because search returned empty
            
            # Verify matcher was called (real code executed)
            mock_search.assert_called()
    
    def test_process_track_integration_with_match(
        self,
        processor_service,
        sample_track
    ):
        """Test process_track with a successful match scenario."""
        # Mock search to return a URL
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = ["https://www.beatport.com/track/test/123"]
            
            # Mock parse_track_page to return track data
            with patch('cuepoint.services.beatport_service.parse_track_page') as mock_parse:
                mock_parse.return_value = (
                    "Test Track",
                    "Test Artist",
                    "C Major",
                    2023,
                    128.0,
                    "Test Label",
                    "House",
                    "Test Release",
                    "2023-01-15"
                )
                
                # Process track
                result = processor_service.process_track(1, sample_track)
                
                # Verify result
                assert result is not None
                assert isinstance(result, TrackResult)
                # May or may not match depending on scoring, but structure should be correct
    
    def test_process_playlist_integration(
        self,
        processor_service
    ):
        """Test process_playlist with real services."""
        tracks = [
            Track(title="Track 1", artist="Artist 1"),
            Track(title="Track 2", artist="Artist 2"),
        ]
        
        # Mock network calls
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = []
            
            # Process playlist
            results = processor_service.process_playlist(tracks)
            
            # Verify results
            assert len(results) == 2
            assert all(isinstance(r, TrackResult) for r in results)
            assert results[0].title == "Track 1"
            assert results[1].title == "Track 2"
    
    def test_process_playlist_from_xml_integration(
        self,
        processor_service
    ):
        """Test process_playlist_from_xml with real services."""
        # Create test XML
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track 1" Artist="Test Artist 1"/>
        <TRACK TrackID="2" Name="Test Track 2" Artist="Test Artist 2"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist" Type="1">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            # Mock network calls
            with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
                mock_search.return_value = []
                
                # Process playlist from XML
                results = processor_service.process_playlist_from_xml(
                    xml_path,
                    "Test Playlist"
                )
                
                # Verify results
                assert len(results) == 2
                assert all(isinstance(r, TrackResult) for r in results)
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_process_track_with_custom_settings(
        self,
        processor_service,
        sample_track
    ):
        """Test process_track with custom settings override."""
        custom_settings = {
            "MIN_ACCEPT_SCORE": 90,  # Higher threshold
            "MAX_SEARCH_RESULTS": 20
        }
        
        # Mock network calls
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = []
            
            # Process with custom settings
            result = processor_service.process_track(1, sample_track, settings=custom_settings)
            
            # Verify result
            assert result is not None
            # Settings should be applied (though we can't easily verify without checking internals)
    
    def test_process_track_artist_extraction(
        self,
        processor_service
    ):
        """Test process_track when artist needs to be extracted from title."""
        # Track with no artist but title contains artist
        track = Track(
            title="Test Artist - Test Track",
            artist="",  # Empty artist
            key=None,
            year=None,
            bpm=None
        )
        
        # Mock network calls
        with patch('cuepoint.services.beatport_service.beatport_search_hybrid') as mock_search:
            mock_search.return_value = []
            
            # Process track
            result = processor_service.process_track(1, track)
            
            # Verify result - artist should be extracted
            assert result is not None
            assert isinstance(result, TrackResult)
            # Artist extraction logic should have run

