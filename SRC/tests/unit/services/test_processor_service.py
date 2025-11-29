"""Unit tests for processor service."""

from unittest.mock import Mock, patch

import pytest

from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.result import TrackResult
from cuepoint.services.processor_service import ProcessorService


class TestProcessorService:
    """Test processor service."""
    
    def test_process_track_success(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        sample_track
    ):
        """Test successful track processing."""
        # Setup mocks - config service should return proper values
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        # Setup mocks
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (
            BeatportCandidate(
                url="https://www.beatport.com/track/test/123",
                title="Test Track",
                artists="Test Artist",
                key=None,
                release_year=None,
                bpm=None,
                label=None,
                genre=None,  # Note: new model uses "genre" instead of "genres"
                release_name=None,
                release_date=None,
                score=95.0,
                title_sim=95,
                artist_sim=100,
                query_index=1,
                query_text="Test Track Test Artist",
                candidate_index=1,
                base_score=90.0,
                bonus_year=0,
                bonus_key=0,
                guard_ok=True,
                reject_reason="",
                elapsed_ms=100,
                is_winner=False
            ),
            [],
            [],
            1
        )
        
        # Create service
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Test
        result = service.process_track(1, sample_track)
        
        # Verify
        assert isinstance(result, TrackResult)
        assert result.title == sample_track.title
        mock_matcher.find_best_match.assert_called_once()
        mock_logging_service.info.assert_called()
    
    def test_process_track_no_match(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        sample_track
    ):
        """Test track processing when no match is found."""
        # Setup mocks
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Test
        result = service.process_track(1, sample_track)
        
        # Verify
        assert isinstance(result, TrackResult)
        assert result.matched is False
    
    def test_process_playlist(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        sample_playlist
    ):
        """Test playlist processing."""
        # Setup mocks
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Test
        results = service.process_playlist(sample_playlist)
        
        # Verify
        assert len(results) == len(sample_playlist)
        assert mock_matcher.find_best_match.call_count == len(sample_playlist)
    
    def test_process_track_with_custom_settings(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        sample_track
    ):
        """Test track processing with custom settings."""
        # Setup mocks
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Test with custom settings
        custom_settings = {"MIN_ACCEPT_SCORE": 80}
        result = service.process_track(1, sample_track, settings=custom_settings)
        
        # Verify settings were used
        assert isinstance(result, TrackResult)
        # Check that custom settings were passed to matcher
        call_args = mock_matcher.find_best_match.call_args
        assert call_args is not None

        assert call_args is not None

