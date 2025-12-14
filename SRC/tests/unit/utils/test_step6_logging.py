#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Step 6.2: Logging

Tests CuePointLogger, LogLevelManager, CrashLogger, SafeLogger, and log_timing.
"""

import logging
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.utils.logger import (
    CrashLogger,
    CuePointLogger,
    LogSanitizer,
    LogLevelManager,
    SafeLogger,
    log_timing,
)


class TestCuePointLogger:
    """Test CuePointLogger class."""

    def test_configure(self):
        """Test logger configuration."""
        CuePointLogger._configured = False
        CuePointLogger.configure()
        assert CuePointLogger._configured

    def test_set_level(self):
        """Test setting log level."""
        CuePointLogger.configure()
        CuePointLogger.set_level(logging.DEBUG)
        assert CuePointLogger._log_level == logging.DEBUG

    def test_get_log_file(self):
        """Test getting log file path."""
        CuePointLogger.configure()
        log_file = CuePointLogger.get_log_file()
        assert isinstance(log_file, Path)
        assert log_file.name == "cuepoint.log"


class TestLogLevelManager:
    """Test LogLevelManager class."""

    def test_get_level_name(self):
        """Test getting level name."""
        assert LogLevelManager.get_level_name(logging.DEBUG) == "Debug"
        assert LogLevelManager.get_level_name(logging.INFO) == "Info"
        assert LogLevelManager.get_level_name(logging.WARNING) == "Warning"
        assert LogLevelManager.get_level_name(logging.ERROR) == "Error"
        assert LogLevelManager.get_level_name(logging.CRITICAL) == "Critical"

    def test_set_level_from_string(self):
        """Test setting level from string."""
        CuePointLogger.configure()
        LogLevelManager.set_level_from_string("debug")
        assert logging.getLogger().level == logging.DEBUG

        LogLevelManager.set_level_from_string("info")
        assert logging.getLogger().level == logging.INFO

    def test_get_current_level(self):
        """Test getting current level."""
        CuePointLogger.configure()
        level = LogLevelManager.get_current_level()
        assert isinstance(level, int)


class TestCrashLogger:
    """Test CrashLogger class."""

    def test_create_crash_log(self):
        """Test creating crash log."""
        crash_log = CrashLogger.create_crash_log()
        assert isinstance(crash_log, Path)
        assert "crash-" in crash_log.name
        assert crash_log.suffix == ".log"

    def test_write_crash_info(self):
        """Test writing crash info."""
        with tempfile.TemporaryDirectory() as tmpdir:
            crash_log = Path(tmpdir) / "test-crash.log"
            exception = ValueError("Test error")
            traceback_str = "Traceback (most recent call last):\n  File test.py, line 1\n    raise ValueError('Test error')\nValueError: Test error"
            
            CrashLogger.write_crash_info(crash_log, exception, traceback_str)
            
            assert crash_log.exists()
            content = crash_log.read_text()
            assert "CuePoint Crash Report" in content
            assert "ValueError" in content
            assert "Test error" in content


class TestSafeLogger:
    """Test SafeLogger class."""

    def test_sanitize_message_password(self):
        """Test sanitizing password in message."""
        message = 'password="secret123"'
        sanitized = SafeLogger.sanitize_message(message)
        assert "secret123" not in sanitized
        assert "***REDACTED***" in sanitized

    def test_sanitize_message_token(self):
        """Test sanitizing token in message."""
        message = 'token: "abc123xyz"'
        sanitized = SafeLogger.sanitize_message(message)
        assert "abc123xyz" not in sanitized
        assert "***REDACTED***" in sanitized

    def test_sanitize_message_api_key(self):
        """Test sanitizing API key in message."""
        message = 'api_key="sk-1234567890"'
        sanitized = SafeLogger.sanitize_message(message)
        assert "sk-1234567890" not in sanitized
        assert "***REDACTED***" in sanitized

    def test_sanitize_message_url_query_token(self):
        """Token-like query params in URLs should be redacted."""
        message = "Fetching https://example.com/path?token=abc123&x=1"
        sanitized = SafeLogger.sanitize_message(message)
        assert "abc123" not in sanitized
        assert "token=REDACTED" in sanitized

    def test_sanitize_dict_redacts_sensitive_keys(self):
        """Structured extra dicts should redact sensitive keys."""
        data = {"token": "abc123", "nested": {"api_key": "k", "ok": "value"}}
        sanitized = LogSanitizer.sanitize_dict(data)
        assert sanitized["token"] == "***REDACTED***"
        assert sanitized["nested"]["api_key"] == "***REDACTED***"
        assert sanitized["nested"]["ok"] == "value"

    def test_log_safe(self):
        """Test safe logging."""
        logger = logging.getLogger("test")
        SafeLogger.log_safe(logger, logging.INFO, 'password="secret"')
        # Should not raise exception


class TestLogTiming:
    """Test log_timing context manager."""

    def test_log_timing_success(self, caplog):
        """Test timing successful operation."""
        CuePointLogger.configure()
        logger = logging.getLogger("test")
        
        with log_timing("test_operation", logger):
            pass
        
        assert "Starting test_operation" in caplog.text
        assert "Completed test_operation" in caplog.text

    def test_log_timing_failure(self, caplog):
        """Test timing failed operation."""
        CuePointLogger.configure()
        logger = logging.getLogger("test")
        
        with pytest.raises(ValueError):
            with log_timing("test_operation", logger):
                raise ValueError("Test error")
        
        assert "Starting test_operation" in caplog.text
        assert "Failed test_operation" in caplog.text
