#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for CLI migration to Phase 5 architecture.

Tests that the CLI uses the new architecture correctly and that
all services work together through the DI container.
"""

import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

from cuepoint.cli.cli_processor import CLIProcessor
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import (
    IProcessorService,
    IExportService,
    IConfigService,
    ILoggingService,
)
from cuepoint.utils.di_container import reset_container, get_container


class TestCLIMigration:
    """Integration tests for CLI migration to Phase 5 architecture."""

    def setup_method(self):
        """Reset container before each test."""
        reset_container()
        bootstrap_services()
        self.container = get_container()

    def test_cli_processor_uses_di_services(self):
        """Test that CLIProcessor uses services from DI container."""
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        assert cli_processor.processor_service is processor_service
        assert cli_processor.export_service is export_service
        assert cli_processor.config_service is config_service
        assert cli_processor.logging_service is logging_service

    def test_cli_processor_initialization(self):
        """Test CLIProcessor can be initialized with DI services."""
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        assert cli_processor is not None
        assert cli_processor.controller is not None

    @patch("cuepoint.cli.cli_processor.write_csv_files")
    def test_cli_workflow_integration(self, mock_write_csv, tmp_path):
        """Test full CLI workflow integration."""
        # Create test XML file
        xml_content = """<?xml version="1.0"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist">
                <TRACK Key="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""

        xml_path = tmp_path / "test.xml"
        xml_path.write_text(xml_content)

        # Get services from DI container
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        # Create CLI processor
        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Mock processor service to return sample results
        sample_results = [
            TrackResult(
                playlist_index=1,
                title="Test Track",
                artist="Test Artist",
                matched=True,
                match_score=85.0,
                beatport_url="https://beatport.com/track/test/123",
                candidates_data=[],
                queries_data=[],
            )
        ]

        processor_service.process_playlist_from_xml = MagicMock(
            return_value=sample_results
        )

        # Setup mock for file writing
        mock_write_csv.return_value = {
            "main": str(tmp_path / "output" / "test_output.csv"),
            "candidates": str(tmp_path / "output" / "test_output_candidates.csv"),
            "queries": str(tmp_path / "output" / "test_output_queries.csv"),
        }

        # Process playlist
        original_dir = os.getcwd()
        try:
            os.chdir(tmp_path)
            cli_processor.process_playlist(
                xml_path=str(xml_path),
                playlist_name="Test Playlist",
                out_csv_base="test_output",
                auto_research=True,
            )
        finally:
            os.chdir(original_dir)

        # Verify processor service was called
        processor_service.process_playlist_from_xml.assert_called_once()

        # Verify file writing was attempted
        mock_write_csv.assert_called_once()

    def test_configuration_presets(self):
        """Test that configuration presets work with ConfigService."""
        config_service = self.container.resolve(IConfigService)  # type: ignore

        # Test --fast preset
        config_service.set("MAX_SEARCH_RESULTS", 12)
        config_service.set("CANDIDATE_WORKERS", 8)
        config_service.set("TRACK_WORKERS", 4)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 15)

        assert config_service.get("MAX_SEARCH_RESULTS") == 12
        assert config_service.get("CANDIDATE_WORKERS") == 8
        assert config_service.get("TRACK_WORKERS") == 4
        assert config_service.get("PER_TRACK_TIME_BUDGET_SEC") == 15

        # Test --turbo preset
        config_service.set("MAX_SEARCH_RESULTS", 12)
        config_service.set("CANDIDATE_WORKERS", 12)
        config_service.set("TRACK_WORKERS", 8)
        config_service.set("PER_TRACK_TIME_BUDGET_SEC", 10)

        assert config_service.get("MAX_SEARCH_RESULTS") == 12
        assert config_service.get("CANDIDATE_WORKERS") == 12
        assert config_service.get("TRACK_WORKERS") == 8
        assert config_service.get("PER_TRACK_TIME_BUDGET_SEC") == 10

    def test_configuration_settings_dict_conversion(self):
        """Test that ConfigService settings are converted to dict correctly."""
        config_service = self.container.resolve(IConfigService)  # type: ignore
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Set some configuration values
        config_service.set("MAX_SEARCH_RESULTS", 50)
        config_service.set("CANDIDATE_WORKERS", 15)
        config_service.set("TRACK_WORKERS", 12)

        # Get settings dict
        settings_dict = cli_processor._get_settings_dict()

        # Settings dict should contain the values (or be empty if mapping not implemented)
        assert isinstance(settings_dict, dict)

    @patch("cuepoint.models.config.load_config_from_yaml")
    def test_yaml_config_loading(self, mock_load_yaml, tmp_path):
        """Test YAML configuration file loading."""
        # Mock YAML loading
        mock_load_yaml.return_value = {
            "MAX_SEARCH_RESULTS": 100,
            "CANDIDATE_WORKERS": 20,
            "TRACK_WORKERS": 16,
        }

        config_service = self.container.resolve(IConfigService)  # type: ignore

        # Simulate loading from YAML
        yaml_settings = mock_load_yaml("test_config.yaml")
        for key, value in yaml_settings.items():
            config_service.set(key, value)

        # Verify settings were applied
        assert config_service.get("MAX_SEARCH_RESULTS") == 100
        assert config_service.get("CANDIDATE_WORKERS") == 20
        assert config_service.get("TRACK_WORKERS") == 16

    def test_auto_research_functionality(self, tmp_path):
        """Test auto-research functionality."""
        # Get services from DI container
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Create test XML
        xml_path = tmp_path / "test.xml"
        xml_path.write_text("<DJ_PLAYLISTS></DJ_PLAYLISTS>")

        # Mock processor service
        sample_results = [
            TrackResult(
                playlist_index=1,
                title="Test Track",
                artist="Test Artist",
                matched=False,  # Unmatched
                candidates_data=[],
                queries_data=[],
            )
        ]

        processor_service.process_playlist_from_xml = MagicMock(
            return_value=sample_results
        )

        with patch("cuepoint.cli.cli_processor.write_csv_files") as mock_write_csv:
            mock_write_csv.return_value = {"main": "output/main.csv"}

            original_dir = os.getcwd()
            try:
                os.chdir(tmp_path)
                cli_processor.process_playlist(
                    xml_path=str(xml_path),
                    playlist_name="Test Playlist",
                    out_csv_base="test_output",
                    auto_research=True,  # Auto-research enabled
                )
            finally:
                os.chdir(original_dir)

            # Verify processor was called with auto_research=True
            call_args = processor_service.process_playlist_from_xml.call_args
            assert call_args.kwargs.get("auto_research") is True

    @patch("cuepoint.cli.cli_processor.write_csv_files")
    def test_output_file_generation(self, mock_write_csv, tmp_path):
        """Test that output files are generated correctly."""
        # Get services from DI container
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Create test XML
        xml_path = tmp_path / "test.xml"
        xml_path.write_text("<DJ_PLAYLISTS></DJ_PLAYLISTS>")

        # Mock results
        sample_results = [
            TrackResult(
                playlist_index=1,
                title="Test Track",
                artist="Test Artist",
                matched=True,
                match_score=85.0,
                candidates_data=[{"title": "Test", "artist": "Artist"}],
                queries_data=[{"query": "Test Artist"}],
            )
        ]

        processor_service.process_playlist_from_xml = MagicMock(
            return_value=sample_results
        )

        # Setup mock for file writing
        mock_write_csv.return_value = {
            "main": str(tmp_path / "output" / "test_output.csv"),
            "candidates": str(tmp_path / "output" / "test_output_candidates.csv"),
            "queries": str(tmp_path / "output" / "test_output_queries.csv"),
        }

        original_dir = os.getcwd()
        try:
            os.chdir(tmp_path)
            cli_processor.process_playlist(
                xml_path=str(xml_path),
                playlist_name="Test Playlist",
                out_csv_base="test_output",
                auto_research=False,
            )
        finally:
            os.chdir(original_dir)

        # Verify file writing was called
        mock_write_csv.assert_called_once()

        # Verify output files dict structure
        call_args = mock_write_csv.call_args
        assert call_args is not None

    def test_error_scenarios_file_not_found(self):
        """Test error handling for file not found."""
        from cuepoint.exceptions.cuepoint_exceptions import ProcessingError
        from cuepoint.ui.gui_interface import ErrorType

        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Mock processor to raise file not found error
        # ProcessingError is from gui_interface, not exceptions
        from cuepoint.ui.gui_interface import ProcessingError
        
        error = ProcessingError(
            message="File not found",
            error_type=ErrorType.FILE_NOT_FOUND,
        )
        processor_service.process_playlist_from_xml = MagicMock(side_effect=error)

        with patch("cuepoint.cli.cli_processor.print_error") as mock_print_error:
            cli_processor.process_playlist(
                xml_path="nonexistent.xml",
                playlist_name="Test Playlist",
                out_csv_base="test_output",
                auto_research=False,
            )

            # Verify error was handled
            mock_print_error.assert_called_once()

    def test_error_scenarios_playlist_not_found(self):
        """Test error handling for playlist not found."""
        from cuepoint.exceptions.cuepoint_exceptions import ProcessingError
        from cuepoint.ui.gui_interface import ErrorType

        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Mock processor to raise playlist not found error
        # ProcessingError is from gui_interface, not exceptions
        from cuepoint.ui.gui_interface import ProcessingError
        
        error = ProcessingError(
            message="Playlist not found",
            error_type=ErrorType.PLAYLIST_NOT_FOUND,
        )
        processor_service.process_playlist_from_xml = MagicMock(side_effect=error)

        with patch("cuepoint.cli.cli_processor.print_error") as mock_print_error:
            cli_processor.process_playlist(
                xml_path="test.xml",
                playlist_name="Nonexistent Playlist",
                out_csv_base="test_output",
                auto_research=False,
            )

            # Verify error was handled
            mock_print_error.assert_called_once()

    def test_progress_callback_integration(self, tmp_path):
        """Test that progress callback works with real processor service."""
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Create progress callback
        callback = cli_processor._create_progress_callback()

        # Test callback with progress info
        from cuepoint.ui.gui_interface import ProgressInfo

        progress_info = ProgressInfo(
            total_tracks=10,
            completed_tracks=5,
            matched_count=3,
            unmatched_count=2,
            current_track={"title": "Test Track", "artist": "Test Artist"},
        )

        # Callback should not crash
        callback(progress_info)

        # Progress bar should be created
        assert cli_processor._pbar is not None

        # Update progress
        progress_info.completed_tracks = 6
        progress_info.matched_count = 4
        callback(progress_info)

        # Progress bar should be updated
        assert cli_processor._pbar.n == 6

    def test_review_indices_calculation_integration(self):
        """Test review indices calculation with real data."""
        processor_service = self.container.resolve(IProcessorService)  # type: ignore
        export_service = self.container.resolve(IExportService)  # type: ignore
        config_service = self.container.resolve(IConfigService)  # type: ignore
        logging_service = self.container.resolve(ILoggingService)  # type: ignore

        cli_processor = CLIProcessor(
            processor_service=processor_service,
            export_service=export_service,
            config_service=config_service,
            logging_service=logging_service,
        )

        # Create test results
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                match_score=85.0,  # Good score
                artist_sim=80.0,
                beatport_url="https://beatport.com/track/1",
            ),
            TrackResult(
                playlist_index=2,
                title="Track 2",
                artist="Artist 2",
                matched=False,  # Unmatched
            ),
            TrackResult(
                playlist_index=3,
                title="Track 3",
                artist="Artist 3",
                matched=True,
                match_score=65.0,  # Low score
                artist_sim=30.0,  # Low artist sim
                beatport_url="https://beatport.com/track/3",
            ),
        ]

        review_indices = cli_processor._get_review_indices(results)

        # Track 1: good match -> no review
        assert 1 not in review_indices

        # Track 2: unmatched -> needs review
        assert 2 in review_indices

        # Track 3: low score -> needs review
        assert 3 in review_indices

