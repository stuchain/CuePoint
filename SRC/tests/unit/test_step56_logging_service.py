#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 5.6: Logging Service

Tests the LoggingService implementation.
"""

import logging
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from cuepoint.services.logging_service import LoggingService


class TestLoggingService:
    """Test LoggingService class."""

    def teardown_method(self):
        """Close all handlers after each test to prevent Windows file locking."""
        # Get all loggers and close their handlers
        import logging
        for logger_name in logging.Logger.manager.loggerDict:
            logger = logging.getLogger(logger_name)
            for handler in logger.handlers[:]:
                handler.close()
                logger.removeHandler(handler)

    def test_init_default(self):
        """Test LoggingService initialization with defaults."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        assert service.logger.name == "cuepoint"
        assert service.logger.level == logging.INFO

    def test_init_custom_log_level(self):
        """Test LoggingService with custom log level."""
        service = LoggingService(
            log_level="DEBUG", enable_file_logging=False, enable_console_logging=False
        )
        assert service.logger.level == logging.DEBUG

        service = LoggingService(
            log_level="WARNING", enable_file_logging=False, enable_console_logging=False
        )
        assert service.logger.level == logging.WARNING

    def test_init_custom_log_dir(self):
        """Test LoggingService with custom log directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir) / "custom_logs"
            service = LoggingService(
                log_dir=log_dir, enable_console_logging=False, enable_file_logging=True
            )
            # Service should create the directory
            assert log_dir.exists()
            # Close handlers before cleanup
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)

    def test_debug(self):
        """Test debug logging."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        # Should not raise
        service.debug("Debug message")

    def test_info(self):
        """Test info logging."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        # Should not raise
        service.info("Info message")

    def test_warning(self):
        """Test warning logging."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        # Should not raise
        service.warning("Warning message")

    def test_error(self):
        """Test error logging."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        # Should not raise
        service.error("Error message")

    def test_error_with_exc_info(self):
        """Test error logging with exception info."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)

        try:
            raise ValueError("Test exception")
        except ValueError as e:
            # Should not raise
            service.error("Error message", exc_info=e)

    def test_critical(self):
        """Test critical logging."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        # Should not raise
        service.critical("Critical message")

    def test_logging_with_extra(self):
        """Test logging with extra context."""
        service = LoggingService(enable_file_logging=False, enable_console_logging=False)
        # Should not raise
        service.info("Message", extra={"key": "value", "number": 42})

    def test_file_logging_creates_file(self):
        """Test that file logging creates log file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir)
            service = LoggingService(
                log_dir=log_dir, enable_file_logging=True, enable_console_logging=False
            )

            service.info("Test message")

            log_file = log_dir / "cuepoint.log"
            assert log_file.exists()
            assert log_file.stat().st_size > 0
            # Close handlers before cleanup
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)

    def test_file_logging_writes_messages(self):
        """Test that file logging writes messages."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir)
            service = LoggingService(
                log_dir=log_dir, enable_file_logging=True, enable_console_logging=False
            )

            service.info("Test message 1")
            service.warning("Test message 2")
            service.error("Test message 3")

            log_file = log_dir / "cuepoint.log"
            # Close handlers before reading (ensures all data is flushed)
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)
            
            content = log_file.read_text()
            assert "Test message 1" in content
            assert "Test message 2" in content
            assert "Test message 3" in content

    def test_console_logging(self):
        """Test that console logging works."""
        service = LoggingService(
            enable_file_logging=False, enable_console_logging=True, log_level="INFO"
        )
        # Should not raise - will output to console
        service.info("Console message")

    def test_log_levels_filtering(self):
        """Test that log levels filter messages correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir)
            service = LoggingService(
                log_dir=log_dir,
                log_level="WARNING",
                enable_file_logging=True,
                enable_console_logging=False,
            )

            service.debug("Debug message")  # Should not be logged
            service.info("Info message")  # Should not be logged
            service.warning("Warning message")  # Should be logged
            service.error("Error message")  # Should be logged

            # Close handlers before reading
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)

            log_file = log_dir / "cuepoint.log"
            content = log_file.read_text()
            assert "Debug message" not in content
            assert "Info message" not in content
            assert "Warning message" in content
            assert "Error message" in content

    def test_logging_with_exception_info(self):
        """Test logging with exception info."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir)
            service = LoggingService(
                log_dir=log_dir, enable_file_logging=True, enable_console_logging=False
            )

            try:
                raise ValueError("Test exception")
            except ValueError as e:
                service.error("Error occurred", exc_info=e)

            # Close handlers before reading
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)

            log_file = log_dir / "cuepoint.log"
            content = log_file.read_text()
            assert "Error occurred" in content
            assert "ValueError" in content
            assert "Test exception" in content

    def test_logging_extra_context(self):
        """Test logging with extra context."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir)
            service = LoggingService(
                log_dir=log_dir, enable_file_logging=True, enable_console_logging=False
            )

            service.info(
                "Operation completed",
                extra={"operation": "test", "duration": 1.5, "items": 10},
            )

            # Close handlers before reading
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)

            log_file = log_dir / "cuepoint.log"
            content = log_file.read_text()
            assert "Operation completed" in content

    def test_no_duplicate_handlers(self):
        """Test that handlers are not duplicated on multiple initializations."""
        service1 = LoggingService(enable_file_logging=False, enable_console_logging=False)
        handler_count1 = len(service1.logger.handlers)

        # Create another service with same logger name
        service2 = LoggingService(
            logger_name="cuepoint", enable_file_logging=False, enable_console_logging=False
        )
        # Handlers should be cleared, so count should be same or less
        assert len(service2.logger.handlers) <= handler_count1

