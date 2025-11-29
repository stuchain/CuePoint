#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive tests for ProcessorService Step 5.2 implementation.

Tests the process_playlist_from_xml method and DI integration.
"""

import os
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest

from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.result import TrackResult
from cuepoint.services.processor_service import ProcessorService
from cuepoint.ui.gui_interface import ErrorType, ProcessingController, ProcessingError, ProgressInfo


class TestProcessorServiceProcessPlaylistFromXML:
    """Tests for process_playlist_from_xml method."""

    def test_process_playlist_from_xml_success(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test successful processing of playlist from XML."""
        # Create a temporary XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track 1" Artist="Test Artist 1"/>
        <TRACK TrackID="2" Name="Test Track 2" Artist="Test Artist 2"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Type="1" Name="Test Playlist">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            # Setup mocks
            from cuepoint.models.config import SETTINGS

            def config_get(key, default=None):
                return SETTINGS.get(key, default)

            mock_config_service.get.side_effect = config_get

            # Setup matcher to return a match
            from cuepoint.models.beatport_candidate import BeatportCandidate

            mock_matcher_service.find_best_match.return_value = (
                BeatportCandidate(
                    url="https://www.beatport.com/track/test/123",
                    title="Test Track 1",
                    artists="Test Artist 1",
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
                    query_text="Test Track 1 Test Artist 1",
                    candidate_index=1,
                    base_score=90.0,
                    bonus_year=0,
                    bonus_key=0,
                    guard_ok=True,
                    reject_reason="",
                    elapsed_ms=100,
                    is_winner=False,
                ),
                [],
                [],
                1,
            )

            # Create service
            service = ProcessorService(
                beatport_service=mock_beatport_service,
                matcher_service=mock_matcher_service,
                logging_service=mock_logging_service,
                config_service=mock_config_service,
            )

            # Test
            results = service.process_playlist_from_xml(
                xml_path=xml_path,
                playlist_name="Test Playlist",
            )

            # Verify
            assert len(results) == 2
            assert all(isinstance(r, TrackResult) for r in results)
            assert mock_matcher_service.find_best_match.call_count == 2
            mock_logging_service.info.assert_called()

        finally:
            # Cleanup
            os.unlink(xml_path)

    def test_process_playlist_from_xml_file_not_found(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test error handling when XML file is not found."""
        service = ProcessorService(
            beatport_service=mock_beatport_service,
            matcher_service=mock_matcher_service,
            logging_service=mock_logging_service,
            config_service=mock_config_service,
        )

        # Test
        with pytest.raises(ProcessingError) as exc_info:
            service.process_playlist_from_xml(
                xml_path="/nonexistent/file.xml",
                playlist_name="Test Playlist",
            )

        # Verify
        assert exc_info.value.error_type == ErrorType.FILE_NOT_FOUND
        assert "XML file not found" in exc_info.value.message

    def test_process_playlist_from_xml_playlist_not_found(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test error handling when playlist is not found."""
        # Create a temporary XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Type="1" Name="Existing Playlist">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            from cuepoint.models.config import SETTINGS

            def config_get(key, default=None):
                return SETTINGS.get(key, default)

            mock_config_service.get.side_effect = config_get

            service = ProcessorService(
                beatport_service=mock_beatport_service,
                matcher_service=mock_matcher_service,
                logging_service=mock_logging_service,
                config_service=mock_config_service,
            )

            # Test
            with pytest.raises(ProcessingError) as exc_info:
                service.process_playlist_from_xml(
                    xml_path=xml_path,
                    playlist_name="Nonexistent Playlist",
                )

            # Verify
            assert exc_info.value.error_type == ErrorType.PLAYLIST_NOT_FOUND
            assert "not found in XML file" in exc_info.value.message

        finally:
            os.unlink(xml_path)

    def test_process_playlist_from_xml_empty_playlist(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test error handling when playlist is empty."""
        # Create a temporary XML file with empty playlist
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Type="1" Name="Empty Playlist">
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            from cuepoint.models.config import SETTINGS

            def config_get(key, default=None):
                return SETTINGS.get(key, default)

            mock_config_service.get.side_effect = config_get

            service = ProcessorService(
                beatport_service=mock_beatport_service,
                matcher_service=mock_matcher_service,
                logging_service=mock_logging_service,
                config_service=mock_config_service,
            )

            # Test
            with pytest.raises(ProcessingError) as exc_info:
                service.process_playlist_from_xml(
                    xml_path=xml_path,
                    playlist_name="Empty Playlist",
                )

            # Verify
            assert exc_info.value.error_type == ErrorType.VALIDATION_ERROR
            assert "empty" in exc_info.value.message.lower()

        finally:
            os.unlink(xml_path)

    def test_process_playlist_from_xml_with_progress_callback(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test processing with progress callback."""
        # Create a temporary XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track 1" Artist="Test Artist 1"/>
        <TRACK TrackID="2" Name="Test Track 2" Artist="Test Artist 2"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Type="1" Name="Test Playlist">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            from cuepoint.models.config import SETTINGS

            def config_get(key, default=None):
                return SETTINGS.get(key, default)

            mock_config_service.get.side_effect = config_get

            mock_matcher_service.find_best_match.return_value = (None, [], [], 1)

            service = ProcessorService(
                beatport_service=mock_beatport_service,
                matcher_service=mock_matcher_service,
                logging_service=mock_logging_service,
                config_service=mock_config_service,
            )

            # Track progress callbacks
            progress_calls = []

            def progress_callback(progress_info: ProgressInfo):
                progress_calls.append(progress_info)

            # Test
            results = service.process_playlist_from_xml(
                xml_path=xml_path,
                playlist_name="Test Playlist",
                progress_callback=progress_callback,
            )

            # Verify
            assert len(results) == 2
            assert len(progress_calls) == 2  # One for each track
            assert progress_calls[0].completed_tracks == 1
            assert progress_calls[0].total_tracks == 2
            assert progress_calls[1].completed_tracks == 2
            assert progress_calls[1].total_tracks == 2

        finally:
            os.unlink(xml_path)

    def test_process_playlist_from_xml_with_cancellation(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test processing with cancellation."""
        # Create a temporary XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track 1" Artist="Test Artist 1"/>
        <TRACK TrackID="2" Name="Test Track 2" Artist="Test Artist 2"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Type="1" Name="Test Playlist">
                <TRACK Key="1"/>
                <TRACK Key="2"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            from cuepoint.models.config import SETTINGS

            def config_get(key, default=None):
                return SETTINGS.get(key, default)

            mock_config_service.get.side_effect = config_get

            mock_matcher_service.find_best_match.return_value = (None, [], [], 1)

            service = ProcessorService(
                beatport_service=mock_beatport_service,
                matcher_service=mock_matcher_service,
                logging_service=mock_logging_service,
                config_service=mock_config_service,
            )

            # Create controller and cancel after first track
            controller = ProcessingController()
            call_count = [0]

            def progress_callback(progress_info: ProgressInfo):
                call_count[0] += 1
                if call_count[0] == 1:
                    controller.cancel()

            # Test
            results = service.process_playlist_from_xml(
                xml_path=xml_path,
                playlist_name="Test Playlist",
                progress_callback=progress_callback,
                controller=controller,
            )

            # Verify - should only process first track before cancellation
            assert len(results) == 1
            mock_logging_service.info.assert_called()

        finally:
            os.unlink(xml_path)

    def test_process_playlist_from_xml_with_auto_research(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test processing with auto-research enabled."""
        # Create a temporary XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track 1" Artist="Test Artist 1"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Type="1" Name="Test Playlist">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            from cuepoint.models.config import SETTINGS

            def config_get(key, default=None):
                return SETTINGS.get(key, default)

            mock_config_service.get.side_effect = config_get

            # First call returns no match, second call (auto-research) returns match
            from cuepoint.models.beatport_candidate import BeatportCandidate

            no_match = (None, [], [], 1)
            match = (
                BeatportCandidate(
                    url="https://www.beatport.com/track/test/123",
                    title="Test Track 1",
                    artists="Test Artist 1",
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
                    query_text="Test Track 1 Test Artist 1",
                    candidate_index=1,
                    base_score=90.0,
                    bonus_year=0,
                    bonus_key=0,
                    guard_ok=True,
                    reject_reason="",
                    elapsed_ms=100,
                    is_winner=False,
                ),
                [],
                [],
                1,
            )

            mock_matcher_service.find_best_match.side_effect = [no_match, match]

            service = ProcessorService(
                beatport_service=mock_beatport_service,
                matcher_service=mock_matcher_service,
                logging_service=mock_logging_service,
                config_service=mock_config_service,
            )

            # Test
            results = service.process_playlist_from_xml(
                xml_path=xml_path,
                playlist_name="Test Playlist",
                auto_research=True,
            )

            # Verify
            assert len(results) == 1
            # Should have been called twice (initial + auto-research)
            assert mock_matcher_service.find_best_match.call_count == 2
            # Result should now be matched after auto-research
            assert results[0].matched is True

        finally:
            os.unlink(xml_path)

    def test_process_playlist_from_xml_with_custom_settings(
        self,
        mock_beatport_service,
        mock_logging_service,
        mock_config_service,
        mock_matcher_service,
    ):
        """Test processing with custom settings override."""
        # Create a temporary XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Type="1" Name="Test Playlist">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            mock_matcher_service.find_best_match.return_value = (None, [], [], 1)

            service = ProcessorService(
                beatport_service=mock_beatport_service,
                matcher_service=mock_matcher_service,
                logging_service=mock_logging_service,
                config_service=mock_config_service,
            )

            # Test with custom settings
            custom_settings = {"MIN_ACCEPT_SCORE": 80, "MAX_SEARCH_RESULTS": 100}

            results = service.process_playlist_from_xml(
                xml_path=xml_path,
                playlist_name="Test Playlist",
                settings=custom_settings,
            )

            # Verify
            assert len(results) == 1
            # Settings should be used (check via matcher call)
            assert mock_matcher_service.find_best_match.called

        finally:
            os.unlink(xml_path)

