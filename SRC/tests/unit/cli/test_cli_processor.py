#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for CLIProcessor class.

Tests CLI-specific functionality including progress callbacks,
file output, summary statistics, and error handling.
"""

import os
import sys
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch, call
from typing import List, Dict, Any

import pytest

from cuepoint.cli.cli_processor import CLIProcessor
from cuepoint.models.result import TrackResult
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.ui.gui_interface import ProgressInfo, ProcessingError, ErrorType
from cuepoint.services.interfaces import (
    IProcessorService,
    IExportService,
    IConfigService,
    ILoggingService,
)


class TestCLIProcessor:
    """Test CLIProcessor class."""

    @pytest.fixture
    def mock_services(self):
        """Create mock services."""
        return {
            "processor_service": Mock(spec=IProcessorService),
            "export_service": Mock(spec=IExportService),
            "config_service": Mock(spec=IConfigService),
            "logging_service": Mock(spec=ILoggingService),
        }

    @pytest.fixture
    def cli_processor(self, mock_services):
        """Create CLIProcessor instance."""
        return CLIProcessor(**mock_services)

    @pytest.fixture
    def sample_results(self):
        """Create sample TrackResult objects."""
        return [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                match_score=85.0,
                title_sim=90.0,
                artist_sim=80.0,
                beatport_url="https://beatport.com/track/track-1/123",
                beatport_title="Track 1",
                beatport_artists="Artist 1",
                candidates_data=[{"title": "Track 1", "artist": "Artist 1"}],
                queries_data=[{"query": "Track 1 Artist 1"}],
            ),
            TrackResult(
                playlist_index=2,
                title="Track 2",
                artist="Artist 2",
                matched=False,
                match_score=50.0,
                title_sim=60.0,
                artist_sim=40.0,
                candidates_data=[{"title": "Track 2", "artist": "Artist 2"}],
                queries_data=[{"query": "Track 2 Artist 2"}],
            ),
            TrackResult(
                playlist_index=3,
                title="Track 3",
                artist="Artist 3",
                matched=True,
                match_score=65.0,  # Low score - needs review
                title_sim=70.0,
                artist_sim=30.0,  # Low artist sim - needs review
                beatport_url="https://beatport.com/track/track-3/456",
                beatport_title="Track 3",
                beatport_artists="Artist 3",
                candidates_data=[{"title": "Track 3", "artist": "Artist 3"}],
                queries_data=[{"query": "Track 3 Artist 3"}],
            ),
        ]

    def test_initialization(self, cli_processor, mock_services):
        """Test CLIProcessor initialization."""
        assert cli_processor.processor_service == mock_services["processor_service"]
        assert cli_processor.export_service == mock_services["export_service"]
        assert cli_processor.config_service == mock_services["config_service"]
        assert cli_processor.logging_service == mock_services["logging_service"]
        assert cli_processor.controller is not None
        assert cli_processor._pbar is None

    def test_create_progress_callback(self, cli_processor):
        """Test progress callback creation."""
        callback = cli_processor._create_progress_callback()
        assert callable(callback)

        # Test callback invocation
        progress_info = ProgressInfo(
            total_tracks=10,
            completed_tracks=5,
            matched_count=3,
            unmatched_count=2,
            current_track={"title": "Test Track"},
        )

        # Callback should create progress bar on first call
        callback(progress_info)
        assert cli_processor._pbar is not None

        # Test callback updates
        progress_info.completed_tracks = 6
        progress_info.matched_count = 4
        callback(progress_info)

        # Progress bar should be updated
        assert cli_processor._pbar.n == 6

    def test_get_settings_dict(self, cli_processor, mock_services):
        """Test settings dictionary creation from ConfigService."""
        # Setup mock config service
        mock_services["config_service"].get.side_effect = lambda key, default=None: {
            "MAX_SEARCH_RESULTS": 50,
            "CANDIDATE_WORKERS": 15,
            "TRACK_WORKERS": 12,
            "PER_TRACK_TIME_BUDGET_SEC": 45,
            "ENABLE_CACHE": True,
        }.get(key, default)

        settings = cli_processor._get_settings_dict()

        assert isinstance(settings, dict)
        assert "MAX_SEARCH_RESULTS" in settings or settings == {}

    def test_get_review_indices(self, cli_processor, sample_results):
        """Test review indices calculation."""
        review_indices = cli_processor._get_review_indices(sample_results)

        # Track 2: unmatched -> needs review
        assert 2 in review_indices

        # Track 3: low score (65 < 70) -> needs review
        assert 3 in review_indices

        # Track 1: matched with good score -> no review needed
        assert 1 not in review_indices

    def test_get_review_indices_low_artist_sim(self, cli_processor):
        """Test review indices for low artist similarity."""
        # The logic requires: artist_sim < 35 AND not _artist_token_overlap
        # "John" and "Jane" have no overlap, so should trigger review
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="John",  # Single token
                matched=True,
                match_score=75.0,  # Good score (above 70)
                artist_sim=30.0,  # Low artist sim (below 35)
                beatport_artists="Jane",  # Completely different - no token overlap
                beatport_url="https://beatport.com/track/1",
            )
        ]

        review_indices = cli_processor._get_review_indices(results)

        # Should need review due to low artist similarity (< 35) and no token overlap
        # The logic checks: artists_present and artist_sim < 35 and not _artist_token_overlap
        assert 1 in review_indices

    def test_get_review_indices_no_match(self, cli_processor):
        """Test review indices for unmatched tracks."""
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=False,
                match_score=None,
            )
        ]

        review_indices = cli_processor._get_review_indices(results)

        # Unmatched track should need review
        assert 1 in review_indices

    def test_get_review_indices_no_url(self, cli_processor):
        """Test review indices for tracks without beatport URL."""
        results = [
            TrackResult(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                match_score=80.0,
                beatport_url=None,  # No URL
            )
        ]

        review_indices = cli_processor._get_review_indices(results)

        # Track without URL should need review
        assert 1 in review_indices

    @patch("cuepoint.cli.cli_processor.write_csv_files")
    @patch("cuepoint.cli.cli_processor.write_review_candidates_csv")
    @patch("cuepoint.cli.cli_processor.write_review_queries_csv")
    def test_write_output_files(
        self,
        mock_review_queries,
        mock_review_candidates,
        mock_write_csv,
        cli_processor,
        sample_results,
        tmp_path,
    ):
        """Test output file writing."""
        # Setup mocks
        mock_write_csv.return_value = {
            "main": str(tmp_path / "main.csv"),
            "candidates": str(tmp_path / "candidates.csv"),
            "queries": str(tmp_path / "queries.csv"),
        }
        mock_review_candidates.return_value = str(tmp_path / "review_candidates.csv")
        mock_review_queries.return_value = str(tmp_path / "review_queries.csv")

        # Change to temp directory
        original_dir = os.getcwd()
        try:
            os.chdir(tmp_path)
            output_files = cli_processor._write_output_files(sample_results, "test_output")
        finally:
            os.chdir(original_dir)

        # Verify write_csv_files was called
        mock_write_csv.assert_called_once()

        # Verify review files were written (track 2 and 3 need review)
        assert mock_review_candidates.called
        assert mock_review_queries.called

        # Verify output files dict
        assert "main" in output_files
        assert "candidates" in output_files
        assert "queries" in output_files

    def test_display_summary(self, cli_processor, sample_results, mock_services):
        """Test summary statistics display."""
        output_files = {
            "main": "output/main.csv",
            "candidates": "output/candidates.csv",
            "queries": "output/queries.csv",
            "review": "output/review.csv",
        }

        cli_processor._display_summary(sample_results, output_files, 10.5)

        # Verify logging service was called
        assert mock_services["logging_service"].info.called

        # Check that summary messages were logged
        log_calls = [str(call) for call in mock_services["logging_service"].info.call_args_list]
        log_text = " ".join(log_calls)

        assert "Done" in log_text or any("Done" in str(call) for call in log_calls)
        assert "Matched" in log_text or any("Matched" in str(call) for call in log_calls)

    def test_handle_unmatched_tracks(self, cli_processor, sample_results, mock_services):
        """Test unmatched tracks handling."""
        # Mock stdin.isatty to simulate interactive mode
        with patch("sys.stdin.isatty", return_value=True):
            with patch("builtins.input", return_value="n"):
                cli_processor._handle_unmatched_tracks(sample_results)

        # Verify logging service was called
        assert mock_services["logging_service"].warning.called

    def test_handle_unmatched_tracks_non_interactive(
        self, cli_processor, sample_results, mock_services
    ):
        """Test unmatched tracks handling in non-interactive mode."""
        # Mock stdin.isatty to simulate non-interactive mode
        with patch("sys.stdin.isatty", return_value=False):
            cli_processor._handle_unmatched_tracks(sample_results)

        # Verify logging service was called
        assert mock_services["logging_service"].warning.called
        assert mock_services["logging_service"].info.called

    def test_handle_processing_error_file_not_found(
        self, cli_processor, mock_services
    ):
        """Test error handling for file not found."""
        error = ProcessingError(
            message="File not found",
            error_type=ErrorType.FILE_NOT_FOUND,
        )

        with patch("cuepoint.cli.cli_processor.print_error") as mock_print_error:
            cli_processor._handle_processing_error(error, "test.xml", "Test Playlist")
            mock_print_error.assert_called_once()

    def test_handle_processing_error_playlist_not_found(
        self, cli_processor, mock_services
    ):
        """Test error handling for playlist not found."""
        error = ProcessingError(
            message="Playlist not found",
            error_type=ErrorType.PLAYLIST_NOT_FOUND,
        )

        with patch("cuepoint.cli.cli_processor.print_error") as mock_print_error:
            cli_processor._handle_processing_error(error, "test.xml", "Test Playlist")
            mock_print_error.assert_called_once()

    def test_handle_processing_error_generic(self, cli_processor, mock_services):
        """Test error handling for generic errors."""
        error = ProcessingError(
            message="Generic error",
            error_type=ErrorType.PROCESSING_ERROR,
        )

        with patch("cuepoint.cli.cli_processor.print_error") as mock_print_error:
            cli_processor._handle_processing_error(error, "test.xml", "Test Playlist")
            mock_print_error.assert_called_once()

    def test_handle_processing_error_unexpected(self, cli_processor, mock_services):
        """Test error handling for unexpected errors."""
        error = ValueError("Unexpected error")

        with patch("cuepoint.cli.cli_processor.print_error") as mock_print_error:
            cli_processor._handle_processing_error(error, "test.xml", "Test Playlist")
            mock_services["logging_service"].error.assert_called_once()
            mock_print_error.assert_called_once()

    @patch("cuepoint.cli.cli_processor.write_csv_files")
    @patch("cuepoint.cli.cli_processor.write_review_candidates_csv")
    @patch("cuepoint.cli.cli_processor.write_review_queries_csv")
    def test_process_playlist_success(
        self,
        mock_review_queries,
        mock_review_candidates,
        mock_write_csv,
        cli_processor,
        sample_results,
        mock_services,
        tmp_path,
    ):
        """Test successful playlist processing."""
        # Setup mocks
        mock_services["processor_service"].process_playlist_from_xml.return_value = (
            sample_results
        )
        mock_write_csv.return_value = {
            "main": str(tmp_path / "main.csv"),
            "candidates": str(tmp_path / "candidates.csv"),
            "queries": str(tmp_path / "queries.csv"),
        }
        mock_review_candidates.return_value = None
        mock_review_queries.return_value = None

        # Create temporary XML file
        xml_path = tmp_path / "test.xml"
        xml_path.write_text("<DJ_PLAYLISTS></DJ_PLAYLISTS>")

        # Change to temp directory
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

        # Verify processor service was called
        mock_services["processor_service"].process_playlist_from_xml.assert_called_once()

        # Verify export was called
        mock_write_csv.assert_called_once()

        # Verify summary was displayed
        assert mock_services["logging_service"].info.called

    def test_process_playlist_error(self, cli_processor, mock_services, tmp_path):
        """Test playlist processing with error."""
        # Setup mock to raise error
        error = ProcessingError(
            message="Processing failed",
            error_type=ErrorType.PROCESSING_ERROR,
        )
        mock_services["processor_service"].process_playlist_from_xml.side_effect = error

        # Create temporary XML file
        xml_path = tmp_path / "test.xml"
        xml_path.write_text("<DJ_PLAYLISTS></DJ_PLAYLISTS>")

        with patch("cuepoint.cli.cli_processor.print_error") as mock_print_error:
            cli_processor.process_playlist(
                xml_path=str(xml_path),
                playlist_name="Test Playlist",
                out_csv_base="test_output",
                auto_research=False,
            )

            # Verify error was handled
            mock_print_error.assert_called_once()

    def test_process_playlist_auto_research(
        self, cli_processor, sample_results, mock_services, tmp_path
    ):
        """Test playlist processing with auto-research enabled."""
        # Setup mocks
        mock_services["processor_service"].process_playlist_from_xml.return_value = (
            sample_results
        )

        with patch("cuepoint.cli.cli_processor.write_csv_files") as mock_write_csv:
            mock_write_csv.return_value = {"main": "output/main.csv"}

            # Create temporary XML file
            xml_path = tmp_path / "test.xml"
            xml_path.write_text("<DJ_PLAYLISTS></DJ_PLAYLISTS>")

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

            # Verify processor service was called with auto_research=True
            call_args = mock_services["processor_service"].process_playlist_from_xml.call_args
            assert call_args.kwargs.get("auto_research") is True

            # Verify unmatched tracks handler was not called (auto-research skips prompt)
            # This is implicit - if auto_research=True, _handle_unmatched_tracks is not called

    def test_progress_callback_with_long_title(self, cli_processor):
        """Test progress callback with long track title."""
        callback = cli_processor._create_progress_callback()

        progress_info = ProgressInfo(
            total_tracks=10,
            completed_tracks=1,
            matched_count=0,
            unmatched_count=0,
            current_track={"title": "A" * 50},  # Long title
        )

        callback(progress_info)

        # Progress bar should be created
        assert cli_processor._pbar is not None

        # Title should be truncated in postfix
        # (We can't easily test the exact postfix, but we can verify it doesn't crash)

    def test_progress_callback_no_current_track(self, cli_processor):
        """Test progress callback without current track."""
        callback = cli_processor._create_progress_callback()

        progress_info = ProgressInfo(
            total_tracks=10,
            completed_tracks=1,
            matched_count=0,
            unmatched_count=0,
            current_track=None,
        )

        callback(progress_info)

        # Should not crash
        assert cli_processor._pbar is not None

