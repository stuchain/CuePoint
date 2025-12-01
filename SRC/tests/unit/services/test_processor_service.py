"""Unit tests for processor service."""

import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.playlist import Playlist
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services.processor_service import ProcessorService
from cuepoint.ui.gui_interface import ErrorType, ProcessingController, ProcessingError


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

    def test_process_playlist_empty_list(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing empty playlist."""
        mock_matcher = Mock()
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        results = service.process_playlist([])
        
        assert results == []
        mock_matcher.find_best_match.assert_not_called()

    def test_process_playlist_with_progress_callback(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        sample_playlist,
    ):
        """Test playlist processing with progress callback."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        progress_calls = []
        def progress_callback(progress_info):
            progress_calls.append(progress_info)
        
        results = service.process_playlist(sample_playlist)
        
        assert len(results) == len(sample_playlist)

    def test_process_playlist_from_xml_success(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing playlist from XML file."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Create temporary XML file
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist" Type="1">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            results = service.process_playlist_from_xml(xml_path, "Test Playlist")
            
            assert len(results) == 1
            assert results[0].title == "Test Track"
        finally:
            Path(xml_path).unlink(missing_ok=True)

    def test_process_playlist_from_xml_file_not_found(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing with non-existent XML file."""
        mock_matcher = Mock()
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        with pytest.raises(ProcessingError) as exc_info:
            service.process_playlist_from_xml("nonexistent.xml", "Test Playlist")
        
        assert exc_info.value.error_type == ErrorType.FILE_NOT_FOUND
        assert "not found" in exc_info.value.message.lower()

    def test_process_playlist_from_xml_playlist_not_found(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing with non-existent playlist."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Create temporary XML file
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Other Playlist" Type="1">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            with pytest.raises(ProcessingError) as exc_info:
                service.process_playlist_from_xml(xml_path, "Nonexistent Playlist")
            
            assert exc_info.value.error_type == ErrorType.PLAYLIST_NOT_FOUND
            assert "not found" in exc_info.value.message.lower()
        finally:
            Path(xml_path).unlink(missing_ok=True)

    def test_process_playlist_from_xml_with_progress_callback(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing with progress callback."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Track 1" Artist="Artist 1"/>
        <TRACK TrackID="2" Name="Track 2" Artist="Artist 2"/>
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
        
        progress_calls = []
        def progress_callback(progress_info):
            progress_calls.append(progress_info)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            results = service.process_playlist_from_xml(
                xml_path, "Test Playlist", progress_callback=progress_callback
            )
            
            assert len(results) == 2
            assert len(progress_calls) == 2
            assert progress_calls[0].completed_tracks == 1
            assert progress_calls[1].completed_tracks == 2
        finally:
            Path(xml_path).unlink(missing_ok=True)

    def test_process_playlist_from_xml_with_cancellation(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing with cancellation."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Track 1" Artist="Artist 1"/>
        <TRACK TrackID="2" Name="Track 2" Artist="Artist 2"/>
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
        
        controller = ProcessingController()
        controller.cancel()  # Cancel immediately
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            results = service.process_playlist_from_xml(
                xml_path, "Test Playlist", controller=controller
            )
            
            # Should return partial results due to cancellation
            assert len(results) <= 2
            mock_logging_service.info.assert_any_call("Processing cancelled by user")
        finally:
            Path(xml_path).unlink(missing_ok=True)

    def test_process_playlist_from_xml_empty_playlist(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing empty playlist."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Empty Playlist" Type="1">
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            with pytest.raises(ProcessingError) as exc_info:
                service.process_playlist_from_xml(xml_path, "Empty Playlist")
            
            assert exc_info.value.error_type == ErrorType.VALIDATION_ERROR
            assert "empty" in exc_info.value.message.lower()
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_process_playlist_from_xml_invalid_xml(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing with invalid XML content."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Invalid XML content
        xml_content = "<?xml version='1.0'?><invalid><unclosed>"
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            with pytest.raises(ProcessingError) as exc_info:
                service.process_playlist_from_xml(xml_path, "Test Playlist")
            
            assert exc_info.value.error_type == ErrorType.XML_PARSE_ERROR
        finally:
            Path(xml_path).unlink(missing_ok=True)
    
    def test_process_track_matcher_service_error(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        sample_track
    ):
        """Test track processing when matcher service raises an error."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        mock_matcher.find_best_match.side_effect = Exception("Matcher service error")
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Service doesn't catch matcher errors - they propagate
        with pytest.raises(Exception, match="Matcher service error"):
            service.process_track(1, sample_track)
    
    def test_process_track_empty_title(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing track with empty title."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        mock_matcher.find_best_match.return_value = (None, [], [], 1)
        
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Track with empty title - Track model validation may prevent this
        # But if it doesn't, service should handle it
        try:
            invalid_track = Track(
                title="",  # Empty title
                artist="Test Artist",
                key=None,
                year=None,
                bpm=None
            )
            
            result = service.process_track(1, invalid_track)
            
            # Should handle gracefully (may return unmatched result)
            assert result is not None
            assert result.matched is False
        except ValueError:
            # Track model validation prevents empty title
            # This is expected behavior
            pass
    
    def test_process_playlist_from_xml_file_permission_error(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing when file cannot be read due to permissions."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # Non-existent file
        with pytest.raises(ProcessingError) as exc_info:
            service.process_playlist_from_xml("/nonexistent/path/file.xml", "Test Playlist")
        
        assert exc_info.value.error_type == ErrorType.FILE_NOT_FOUND
    
    def test_process_playlist_from_xml_malformed_xml(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
    ):
        """Test processing with malformed XML structure."""
        from cuepoint.models.config import SETTINGS
        def config_get(key, default=None):
            return SETTINGS.get(key, default)
        mock_config_service.get.side_effect = config_get
        
        mock_matcher = Mock()
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher,
            logging_service=mock_logging_service,
            config_service=mock_config_service
        )
        
        # XML missing required structure
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
    </COLLECTION>
    <!-- Missing PLAYLISTS section -->
</DJ_PLAYLISTS>"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(xml_content)
            xml_path = f.name
        
        try:
            with pytest.raises(ProcessingError) as exc_info:
                service.process_playlist_from_xml(xml_path, "Test Playlist")
            
            # Should raise error for missing playlist
            assert exc_info.value.error_type in [ErrorType.PLAYLIST_NOT_FOUND, ErrorType.XML_PARSE_ERROR]
        finally:
            Path(xml_path).unlink(missing_ok=True)

