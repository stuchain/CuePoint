#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 5.6: Error Handling & Logging

Tests error handling patterns, custom exceptions, and logging integration.
"""

import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest

from cuepoint.exceptions.cuepoint_exceptions import (
    BeatportAPIError,
    ExportError,
    ProcessingError,
)
from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.cache_service import CacheService
from cuepoint.services.export_service import ExportService
from cuepoint.services.logging_service import LoggingService
from cuepoint.models.result import TrackResult


class TestBeatportServiceErrorHandling:
    """Test error handling in BeatportService."""

    def test_search_tracks_raises_beatport_api_error(self):
        """Test that search_tracks raises BeatportAPIError on failure."""
        cache_service = CacheService()
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = BeatportService(cache_service, logging_service)

        with patch("cuepoint.services.beatport_service.beatport_search_hybrid") as mock_search:
            mock_search.side_effect = Exception("Network error")

            with pytest.raises(BeatportAPIError) as exc_info:
                service.search_tracks("test query")

            assert "Failed to search Beatport" in str(exc_info.value)
            assert exc_info.value.error_code == "BEATPORT_SEARCH_ERROR"
            assert "query" in exc_info.value.context

    def test_fetch_track_data_returns_none_on_error(self):
        """Test that fetch_track_data returns None instead of raising on error."""
        cache_service = CacheService()
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = BeatportService(cache_service, logging_service)

        with patch("cuepoint.services.beatport_service.parse_track_page") as mock_parse:
            mock_parse.side_effect = Exception("Parse error")

            result = service.fetch_track_data("https://www.beatport.com/track/test")

            assert result is None


class TestExportServiceErrorHandling:
    """Test error handling in ExportService."""

    def test_export_to_csv_raises_export_error(self):
        """Test that export_to_csv raises ExportError on failure."""
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = ExportService(logging_service=logging_service)

        # Mock write_csv_files to raise an exception
        with patch("cuepoint.services.export_service.write_csv_files") as mock_write:
            mock_write.side_effect = IOError("Permission denied")

            with pytest.raises(ExportError) as exc_info:
                service.export_to_csv([], "test.csv")

            assert "Failed to export CSV" in str(exc_info.value)
            assert exc_info.value.error_code == "EXPORT_CSV_ERROR"

    def test_export_to_json_raises_export_error(self):
        """Test that export_to_json raises ExportError on failure."""
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = ExportService(logging_service=logging_service)

        # Mock open() to raise an exception
        with patch("builtins.open", side_effect=IOError("Permission denied")):
            with pytest.raises(ExportError) as exc_info:
                service.export_to_json([], "test.json")

            assert "Failed to export JSON" in str(exc_info.value)
            assert exc_info.value.error_code == "EXPORT_JSON_ERROR"

    def test_export_to_excel_raises_export_error_missing_dependency(self):
        """Test that export_to_excel raises ExportError when openpyxl is missing."""
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = ExportService(logging_service=logging_service)

        # Mock the import to fail
        with patch("builtins.__import__", side_effect=ImportError("No module named 'openpyxl'")):
            with pytest.raises(ExportError) as exc_info:
                service.export_to_excel([], "test.xlsx")

            assert "openpyxl" in str(exc_info.value)
            assert exc_info.value.error_code == "EXPORT_EXCEL_MISSING_DEPENDENCY"

    def test_export_to_excel_raises_export_error_on_failure(self):
        """Test that export_to_excel raises ExportError on file write failure."""
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = ExportService(logging_service=logging_service)

        # Check if openpyxl is available - if not, we can't test file write failure
        # In that case, we'll test the missing dependency path instead
        try:
            import openpyxl  # noqa: F401
            openpyxl_available = True
        except ImportError:
            openpyxl_available = False

        if openpyxl_available:
            # Mock openpyxl to be available, then make save() fail
            # Since Workbook is imported inside the function, we need to mock sys.modules
            mock_openpyxl = Mock()
            mock_workbook_class = Mock()
            mock_workbook_instance = Mock()
            mock_workbook_instance.active = Mock()
            mock_workbook_instance.active.title = "Results"
            mock_workbook_instance.save.side_effect = IOError("Permission denied")
            mock_workbook_class.return_value = mock_workbook_instance

            mock_openpyxl.Workbook = mock_workbook_class
            mock_openpyxl.styles = Mock()
            mock_openpyxl.styles.PatternFill = Mock()
            mock_openpyxl.styles.Font = Mock()
            mock_openpyxl.styles.Alignment = Mock()

            # Patch sys.modules to inject mock openpyxl before import
            original_import = __import__

            def mock_import(name, *args, **kwargs):
                if name == "openpyxl":
                    return mock_openpyxl
                return original_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                with pytest.raises(ExportError) as exc_info:
                    service.export_to_excel([], "test.xlsx")

                assert "Failed to export Excel" in str(exc_info.value)
                assert exc_info.value.error_code == "EXPORT_EXCEL_ERROR"
        else:
            # If openpyxl is not installed, test that we get the missing dependency error
            # This test case is already covered by test_export_to_excel_raises_export_error_missing_dependency
            # So we'll just verify the error is raised
            with pytest.raises(ExportError) as exc_info:
                service.export_to_excel([], "test.xlsx")

            assert exc_info.value.error_code == "EXPORT_EXCEL_MISSING_DEPENDENCY"

    def test_export_success_logs_info(self):
        """Test that successful exports log info messages."""
        mock_logging = MagicMock(spec=LoggingService)
        service = ExportService(logging_service=mock_logging)

        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            service.export_to_json([], str(filepath))

            mock_logging.info.assert_called_once()
            call_args = mock_logging.info.call_args
            assert "Exported" in call_args[0][0]
            assert "filepath" in call_args[1]["extra"]


class TestErrorLogging:
    """Test that errors are properly logged."""

    def test_beatport_service_logs_errors(self):
        """Test that BeatportService logs errors before raising."""
        mock_logging = MagicMock(spec=LoggingService)
        cache_service = CacheService()
        service = BeatportService(cache_service, mock_logging)

        with patch("cuepoint.services.beatport_service.beatport_search_hybrid") as mock_search:
            mock_search.side_effect = Exception("Test error")

            with pytest.raises(BeatportAPIError):
                service.search_tracks("test")

            # Verify error was logged
            mock_logging.error.assert_called_once()
            call_args = mock_logging.error.call_args
            assert "Failed to search Beatport" in call_args[0][0]
            assert call_args[1]["exc_info"] is not None
            assert "query" in call_args[1]["extra"]

    def test_export_service_logs_errors(self):
        """Test that ExportService logs errors before raising."""
        mock_logging = MagicMock(spec=LoggingService)
        service = ExportService(logging_service=mock_logging)

        # Mock write_csv_files to raise an exception
        with patch("cuepoint.services.export_service.write_csv_files") as mock_write:
            mock_write.side_effect = IOError("Permission denied")

            with pytest.raises(ExportError):
                service.export_to_csv([], "test.csv")

            # Verify error was logged
            mock_logging.error.assert_called_once()
            call_args = mock_logging.error.call_args
            assert "Failed to export CSV" in call_args[0][0]
            assert call_args[1]["exc_info"] is not None
            assert "filepath" in call_args[1]["extra"]


class TestErrorContext:
    """Test that errors include proper context."""

    def test_beatport_api_error_includes_context(self):
        """Test that BeatportAPIError includes query context."""
        cache_service = CacheService()
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = BeatportService(cache_service, logging_service)

        with patch("cuepoint.services.beatport_service.beatport_search_hybrid") as mock_search:
            mock_search.side_effect = Exception("Test error")

            with pytest.raises(BeatportAPIError) as exc_info:
                service.search_tracks("test query", max_results=10)

            assert exc_info.value.context["query"] == "test query"
            assert exc_info.value.context["max_results"] == 10

    def test_export_error_includes_context(self):
        """Test that ExportError includes filepath context."""
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = ExportService(logging_service=logging_service)

        test_path = "/test/path/results.csv"

        # Mock write_csv_files to raise an exception
        with patch("cuepoint.services.export_service.write_csv_files") as mock_write:
            mock_write.side_effect = IOError("Permission denied")

            with pytest.raises(ExportError) as exc_info:
                service.export_to_csv([], test_path)

            assert exc_info.value.context["filepath"] == test_path
            assert exc_info.value.context["track_count"] == 0

