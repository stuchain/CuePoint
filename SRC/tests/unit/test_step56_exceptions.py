#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 5.6: Custom Exception Hierarchy

Tests all custom exceptions and their features.
"""

import pytest

from cuepoint.exceptions.cuepoint_exceptions import (
    BeatportAPIError,
    CacheError,
    ConfigurationError,
    CuePointException,
    ExportError,
    ProcessingError,
    ValidationError,
)


class TestCuePointException:
    """Test base CuePointException class."""

    def test_basic_exception(self):
        """Test basic exception creation."""
        exc = CuePointException("Test error")
        assert str(exc) == "Test error"
        assert exc.message == "Test error"
        assert exc.error_code is None
        assert exc.context == {}

    def test_exception_with_error_code(self):
        """Test exception with error code."""
        exc = CuePointException("Test error", error_code="TEST_ERROR")
        assert str(exc) == "[TEST_ERROR] Test error"
        assert exc.error_code == "TEST_ERROR"

    def test_exception_with_context(self):
        """Test exception with context."""
        context = {"key1": "value1", "key2": 42}
        exc = CuePointException("Test error", context=context)
        assert exc.context == context
        assert exc.context["key1"] == "value1"
        assert exc.context["key2"] == 42

    def test_exception_with_all_fields(self):
        """Test exception with all fields."""
        context = {"track": "Test Track"}
        exc = CuePointException(
            "Test error", error_code="TEST_ERROR", context=context
        )
        assert str(exc) == "[TEST_ERROR] Test error"
        assert exc.error_code == "TEST_ERROR"
        assert exc.context == context

    def test_exception_inheritance(self):
        """Test that CuePointException is a proper Exception."""
        exc = CuePointException("Test error")
        assert isinstance(exc, Exception)
        assert isinstance(exc, CuePointException)


class TestProcessingError:
    """Test ProcessingError exception."""

    def test_processing_error_basic(self):
        """Test basic ProcessingError."""
        exc = ProcessingError("Processing failed")
        assert isinstance(exc, CuePointException)
        assert isinstance(exc, ProcessingError)
        assert str(exc) == "Processing failed"

    def test_processing_error_with_context(self):
        """Test ProcessingError with context."""
        context = {"track_id": 123, "playlist": "My Playlist"}
        exc = ProcessingError("Processing failed", context=context)
        assert exc.context == context


class TestBeatportAPIError:
    """Test BeatportAPIError exception."""

    def test_beatport_api_error_basic(self):
        """Test basic BeatportAPIError."""
        exc = BeatportAPIError("API request failed")
        assert isinstance(exc, CuePointException)
        assert isinstance(exc, BeatportAPIError)
        assert exc.status_code is None

    def test_beatport_api_error_with_status_code(self):
        """Test BeatportAPIError with status code."""
        exc = BeatportAPIError("API request failed", status_code=404)
        assert exc.status_code == 404

    def test_beatport_api_error_with_all_fields(self):
        """Test BeatportAPIError with all fields."""
        context = {"url": "https://beatport.com/track/123"}
        exc = BeatportAPIError(
            "API request failed",
            status_code=500,
            error_code="BEATPORT_ERROR",
            context=context,
        )
        assert exc.status_code == 500
        assert exc.error_code == "BEATPORT_ERROR"
        assert exc.context == context


class TestValidationError:
    """Test ValidationError exception."""

    def test_validation_error(self):
        """Test ValidationError."""
        exc = ValidationError("Validation failed")
        assert isinstance(exc, CuePointException)
        assert isinstance(exc, ValidationError)

    def test_validation_error_with_context(self):
        """Test ValidationError with context."""
        context = {"field": "email", "value": "invalid"}
        exc = ValidationError("Invalid email", context=context)
        assert exc.context == context


class TestConfigurationError:
    """Test ConfigurationError exception."""

    def test_configuration_error(self):
        """Test ConfigurationError."""
        exc = ConfigurationError("Configuration invalid")
        assert isinstance(exc, CuePointException)
        assert isinstance(exc, ConfigurationError)


class TestExportError:
    """Test ExportError exception."""

    def test_export_error(self):
        """Test ExportError."""
        exc = ExportError("Export failed")
        assert isinstance(exc, CuePointException)
        assert isinstance(exc, ExportError)

    def test_export_error_with_context(self):
        """Test ExportError with context."""
        context = {"filepath": "/path/to/file.csv", "format": "CSV"}
        exc = ExportError("Export failed", context=context)
        assert exc.context == context


class TestCacheError:
    """Test CacheError exception."""

    def test_cache_error(self):
        """Test CacheError."""
        exc = CacheError("Cache operation failed")
        assert isinstance(exc, CuePointException)
        assert isinstance(exc, CacheError)


class TestExceptionHierarchy:
    """Test exception hierarchy relationships."""

    def test_all_exceptions_inherit_from_cuepoint_exception(self):
        """Test that all custom exceptions inherit from CuePointException."""
        exceptions = [
            ProcessingError("test"),
            BeatportAPIError("test"),
            ValidationError("test"),
            ConfigurationError("test"),
            ExportError("test"),
            CacheError("test"),
        ]

        for exc in exceptions:
            assert isinstance(exc, CuePointException)
            assert isinstance(exc, Exception)

    def test_exception_context_preservation(self):
        """Test that exception context is preserved through inheritance."""
        context = {"key": "value"}
        exc = ProcessingError("test", context=context)
        assert exc.context == context
        assert isinstance(exc, CuePointException)
        assert exc.context == context

