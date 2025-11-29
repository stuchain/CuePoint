#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for Step 5.6: Error Handling & Logging

Tests error handling across service interactions.
"""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError, ExportError
from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.cache_service import CacheService
from cuepoint.services.export_service import ExportService
from cuepoint.services.interfaces import IExportService
from cuepoint.services.logging_service import LoggingService
from cuepoint.utils.di_container import get_container


class TestServiceErrorHandlingIntegration:
    """Test error handling across service interactions."""

    def test_export_service_with_di_logging(self):
        """Test that ExportService works with DI-provided logging."""
        bootstrap_services()
        container = get_container()

        export_service = container.resolve(IExportService)  # type: ignore[type-abstract]

        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            # Should not raise - empty list is valid
            export_service.export_to_json([], str(filepath))

            assert filepath.exists()

    def test_error_propagation_through_services(self):
        """Test that errors propagate correctly through service chain."""
        cache_service = CacheService()
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        beatport_service = BeatportService(cache_service, logging_service)

        with patch("cuepoint.services.beatport_service.beatport_search_hybrid") as mock_search:
            mock_search.side_effect = Exception("Network timeout")

            # Error should be caught, logged, and re-raised as BeatportAPIError
            with pytest.raises(BeatportAPIError) as exc_info:
                beatport_service.search_tracks("test query")

            # Verify error has proper context
            assert exc_info.value.error_code == "BEATPORT_SEARCH_ERROR"
            assert "query" in exc_info.value.context

    def test_export_error_recovery(self):
        """Test that export errors can be caught and handled."""
        logging_service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        service = ExportService(logging_service=logging_service)

        # Mock write_csv_files to raise an exception
        with patch("cuepoint.services.export_service.write_csv_files") as mock_write:
            mock_write.side_effect = IOError("Permission denied")

            # Error should be raised
            with pytest.raises(ExportError) as exc_info:
                service.export_to_csv([], "test.csv")

            # Verify error details
            assert exc_info.value.error_code == "EXPORT_CSV_ERROR"
            assert "filepath" in exc_info.value.context

            # But we can catch it and handle gracefully
            try:
                service.export_to_csv([], "test2.csv")
            except ExportError as e:
                assert e.error_code == "EXPORT_CSV_ERROR"
                assert "filepath" in e.context


class TestLoggingIntegration:
    """Test logging integration across services."""

    def test_services_log_operations(self):
        """Test that services log their operations."""
        mock_logging = MagicMock(spec=LoggingService)
        cache_service = CacheService()
        service = BeatportService(cache_service, mock_logging)

        # Mock successful search
        with patch("cuepoint.services.beatport_service.beatport_search_hybrid") as mock_search:
            mock_search.return_value = ["url1", "url2"]

            service.search_tracks("test query")

            # Verify info was logged
            mock_logging.info.assert_called()
            call_args = mock_logging.info.call_args
            assert "Searching Beatport" in call_args[0][0]

    def test_errors_are_logged_before_raising(self):
        """Test that errors are logged before exceptions are raised."""
        mock_logging = MagicMock(spec=LoggingService)
        cache_service = CacheService()
        service = BeatportService(cache_service, mock_logging)

        with patch("cuepoint.services.beatport_service.beatport_search_hybrid") as mock_search:
            mock_search.side_effect = Exception("Test error")

            with pytest.raises(BeatportAPIError):
                service.search_tracks("test")

            # Verify error was logged before exception was raised
            assert mock_logging.error.called
            call_args = mock_logging.error.call_args
            assert call_args[1]["exc_info"] is not None

