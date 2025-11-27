#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for LoggingService."""

import logging
import pytest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from tempfile import TemporaryDirectory

from cuepoint.services.logging_service import LoggingService


@pytest.mark.unit
class TestLoggingService:
    """Test LoggingService."""

    def test_init_defaults(self):
        """Test service initialization with defaults."""
        service = LoggingService()
        
        assert service.logger is not None
        assert service.logger.name == "cuepoint"
        assert service.logger.level == logging.INFO

    def test_init_custom_log_dir(self):
        """Test service initialization with custom log directory."""
        with TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir) / "custom_logs"
            service = LoggingService(log_dir=log_dir, enable_file_logging=True)
            
            assert service.logger is not None
            assert log_dir.exists()
            
            # Close handlers to allow cleanup on Windows
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)

    def test_init_custom_log_level(self):
        """Test service initialization with custom log level."""
        service = LoggingService(log_level="DEBUG")
        
        assert service.logger.level == logging.DEBUG

    def test_init_disable_file_logging(self):
        """Test service initialization with file logging disabled."""
        service = LoggingService(enable_file_logging=False)
        
        assert service.logger is not None
        # Should still have console handler
        assert len(service.logger.handlers) > 0

    def test_init_disable_console_logging(self):
        """Test service initialization with console logging disabled."""
        service = LoggingService(enable_console_logging=False, enable_file_logging=False)
        
        assert service.logger is not None
        # May have no handlers if both are disabled
        # (though file logging might still create directory)

    def test_debug(self):
        """Test debug logging."""
        service = LoggingService(enable_file_logging=False)
        
        # Should not raise exception
        service.debug("Test debug message")
        service.debug("Test with extra", extra={"key": "value"})

    def test_info(self):
        """Test info logging."""
        service = LoggingService(enable_file_logging=False)
        
        service.info("Test info message")
        service.info("Test with extra", extra={"key": "value"})

    def test_warning(self):
        """Test warning logging."""
        service = LoggingService(enable_file_logging=False)
        
        service.warning("Test warning message")
        service.warning("Test with extra", extra={"key": "value"})

    def test_error(self):
        """Test error logging."""
        service = LoggingService(enable_file_logging=False)
        
        service.error("Test error message")
        service.error("Test with extra", extra={"key": "value"})

    def test_critical(self):
        """Test critical logging."""
        service = LoggingService(enable_file_logging=False)
        
        service.critical("Test critical message")
        service.critical("Test with extra", extra={"key": "value"})

    def test_log_with_exception(self):
        """Test logging with exception info."""
        service = LoggingService(enable_file_logging=False)
        
        try:
            raise ValueError("Test exception")
        except ValueError:
            service.error("Test error with exception", exc_info=True)

    def test_custom_logger_name(self):
        """Test service with custom logger name."""
        service = LoggingService(logger_name="custom_logger")
        
        assert service.logger.name == "custom_logger"

    def test_logger_no_propagation(self):
        """Test that logger does not propagate to root."""
        service = LoggingService(enable_file_logging=False)
        
        assert service.logger.propagate is False

    def test_file_handler_rotation(self):
        """Test that file handler is configured for rotation."""
        with TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir)
            service = LoggingService(log_dir=log_dir, enable_file_logging=True)
            
            # Check that a RotatingFileHandler exists
            file_handlers = [
                h for h in service.logger.handlers
                if isinstance(h, logging.handlers.RotatingFileHandler)
            ]
            assert len(file_handlers) > 0
            
            handler = file_handlers[0]
            assert handler.maxBytes == 10 * 1024 * 1024  # 10 MB
            assert handler.backupCount == 5
            
            # Close handlers to allow cleanup on Windows
            for handler in service.logger.handlers[:]:
                handler.close()
                service.logger.removeHandler(handler)

    def test_multiple_instances_separate_loggers(self):
        """Test that multiple instances create separate loggers."""
        service1 = LoggingService(logger_name="logger1", enable_file_logging=False)
        service2 = LoggingService(logger_name="logger2", enable_file_logging=False)
        
        assert service1.logger is not service2.logger
        assert service1.logger.name == "logger1"
        assert service2.logger.name == "logger2"

