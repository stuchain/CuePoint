#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for Step 5.6: ProcessorService Error Handling

Tests error handling in ProcessorService.
"""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.cache_service import CacheService
from cuepoint.services.config_service import ConfigService
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.processor_service import ProcessorService
from cuepoint.ui.gui_interface import ErrorType, ProcessingError


class TestProcessorServiceErrorHandling:
    """Test error handling in ProcessorService."""

    def setup_method(self):
        """Set up test fixtures."""
        self.cache_service = CacheService()
        self.logging_service = LoggingService(
            enable_file_logging=False, enable_console_logging=False
        )
        self.config_service = ConfigService()
        self.beatport_service = BeatportService(
            self.cache_service, self.logging_service
        )
        self.matcher_service = MatcherService()
        self.processor_service = ProcessorService(
            beatport_service=self.beatport_service,
            matcher_service=self.matcher_service,
            logging_service=self.logging_service,
            config_service=self.config_service,
        )

    def test_process_playlist_from_xml_file_not_found(self):
        """Test that FILE_NOT_FOUND error is raised for missing XML."""
        with pytest.raises(ProcessingError) as exc_info:
            self.processor_service.process_playlist_from_xml(
                xml_path="/nonexistent/file.xml", playlist_name="Test Playlist"
            )

        # ProcessingError.__str__ returns message; details has the actual info (e.g. "P001: XML file not found.")
        err = exc_info.value
        combined = f"{err.message} {err.details or ''}".lower()
        assert "not found" in combined or err.error_type.name == "FILE_NOT_FOUND"

    def test_process_playlist_from_xml_playlist_not_found(self):
        """Test that PLAYLIST_NOT_FOUND error is raised for missing playlist."""
        # Create a minimal valid XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(
                """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Type="0" Name="ROOT">
            <NODE Type="1" Name="Existing Playlist">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            )
            xml_path = f.name

        try:
            with pytest.raises(ProcessingError) as exc_info:
                self.processor_service.process_playlist_from_xml(
                    xml_path=xml_path, playlist_name="Nonexistent Playlist"
                )

            # Check that error mentions playlist not found (details has "P010: Playlist not found in XML.")
            err = exc_info.value
            combined = f"{err.message} {err.details or ''}".lower()
            assert (
                "not found" in combined or err.error_type.name == "PLAYLIST_NOT_FOUND"
            )
        finally:
            Path(xml_path).unlink()

    def test_process_playlist_from_xml_empty_playlist(self):
        """Test that VALIDATION_ERROR is raised for empty playlist."""
        # Create XML with empty playlist
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(
                """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Type="0" Name="ROOT">
            <NODE Type="1" Name="Empty Playlist">
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            )
            xml_path = f.name

        try:
            with pytest.raises(ProcessingError) as exc_info:
                self.processor_service.process_playlist_from_xml(
                    xml_path=xml_path, playlist_name="Empty Playlist"
                )

            # Check that error mentions empty playlist (details has "P011: Playlist is empty.")
            err = exc_info.value
            combined = f"{err.message} {err.details or ''}".lower()
            assert "empty" in combined or err.error_type.name == "VALIDATION_ERROR"
        finally:
            Path(xml_path).unlink()

    def test_process_playlist_from_xml_raises_processing_error(self):
        """Test that ProcessingError is raised for invalid XML file."""
        mock_logging = MagicMock(spec=LoggingService)
        processor_service = ProcessorService(
            beatport_service=self.beatport_service,
            matcher_service=self.matcher_service,
            logging_service=mock_logging,
            config_service=self.config_service,
        )

        with pytest.raises(ProcessingError) as exc_info:
            processor_service.process_playlist_from_xml(
                xml_path="/nonexistent/file.xml", playlist_name="Test"
            )

        # Verify ProcessingError is raised with correct error type
        err = exc_info.value
        assert err.error_type == ErrorType.FILE_NOT_FOUND
        combined = f"{err.message} {err.details or ''}".lower()
        assert "not found" in combined

    def test_process_playlist_from_m3u_missing_file_raises_file_not_found(self):
        """When M3U file does not exist, process_playlist_from_m3u raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError, match="not found"):
            self.processor_service.process_playlist_from_m3u("/nonexistent/path/list.m3u")

    def test_process_playlist_from_m3u_empty_file_returns_empty_results(self, tmp_path):
        """When M3U file exists but has no track entries, returns ([], None)."""
        m3u = tmp_path / "empty.m3u"
        m3u.write_text("#EXTM3U\n", encoding="utf-8")
        results, warning = self.processor_service.process_playlist_from_m3u(str(m3u))
        assert results == []
        assert warning is None
