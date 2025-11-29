#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 5.6: Error Handler

Tests the centralized ErrorHandler class.
"""

from unittest.mock import MagicMock

import pytest

from cuepoint.exceptions.cuepoint_exceptions import (
    BeatportAPIError,
    CuePointException,
    ProcessingError,
    ValidationError,
)
from cuepoint.services.interfaces import ILoggingService
from cuepoint.utils.error_handler import ErrorHandler


class TestErrorHandler:
    """Test ErrorHandler class."""

    def test_init(self):
        """Test ErrorHandler initialization."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)
        assert handler.logging_service == mock_logging
        assert handler.error_callbacks == []

    def test_register_callback(self):
        """Test callback registration."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        def callback(error: Exception) -> None:
            pass

        handler.register_callback(callback)
        assert len(handler.error_callbacks) == 1
        assert handler.error_callbacks[0] == callback

        # Register another callback
        def callback2(error: Exception) -> None:
            pass

        handler.register_callback(callback2)
        assert len(handler.error_callbacks) == 2

    def test_handle_error_basic(self):
        """Test basic error handling."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        error = ValueError("Test error")
        handler.handle_error(error, show_user=False)

        # Verify error was logged
        mock_logging.error.assert_called_once()
        call_args = mock_logging.error.call_args
        assert "Error: Test error" in call_args[0][0]
        assert call_args[1]["exc_info"] == error
        assert "error_type" in call_args[1]["extra"]
        assert call_args[1]["extra"]["error_type"] == "ValueError"

    def test_handle_error_with_context(self):
        """Test error handling with additional context."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        error = ValueError("Test error")
        context = {"key1": "value1", "key2": 42}
        handler.handle_error(error, context=context, show_user=False)

        # Verify context was included
        call_args = mock_logging.error.call_args
        extra = call_args[1]["extra"]
        assert extra["key1"] == "value1"
        assert extra["key2"] == 42
        assert extra["error_type"] == "ValueError"

    def test_handle_error_with_cuepoint_exception(self):
        """Test error handling with CuePointException."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        error = ProcessingError(
            "Processing failed", error_code="PROC_ERROR", context={"track": "Test"}
        )
        handler.handle_error(error, show_user=False)

        # Verify error code and context were included
        call_args = mock_logging.error.call_args
        extra = call_args[1]["extra"]
        assert extra["error_code"] == "PROC_ERROR"
        assert extra["track"] == "Test"
        assert extra["error_type"] == "ProcessingError"

    def test_handle_error_calls_callbacks(self):
        """Test that error callbacks are called."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        callback_called = [False]
        error_received = [None]

        def callback(error: Exception) -> None:
            callback_called[0] = True
            error_received[0] = error

        handler.register_callback(callback)

        error = ValueError("Test error")
        handler.handle_error(error, show_user=False)

        assert callback_called[0]
        assert error_received[0] == error

    def test_handle_error_multiple_callbacks(self):
        """Test that multiple callbacks are called."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        callbacks_called = []

        def callback1(error: Exception) -> None:
            callbacks_called.append(1)

        def callback2(error: Exception) -> None:
            callbacks_called.append(2)

        handler.register_callback(callback1)
        handler.register_callback(callback2)

        error = ValueError("Test error")
        handler.handle_error(error, show_user=False)

        assert len(callbacks_called) == 2
        assert 1 in callbacks_called
        assert 2 in callbacks_called

    def test_handle_error_callback_exception_handled(self):
        """Test that exceptions in callbacks don't break error handling."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        def failing_callback(error: Exception) -> None:
            raise RuntimeError("Callback error")

        handler.register_callback(failing_callback)

        error = ValueError("Test error")
        handler.handle_error(error, show_user=False)

        # Should have logged the callback error
        assert mock_logging.error.call_count >= 2
        # First call for the original error
        # Second call for the callback error

    def test_handle_error_shows_user(self):
        """Test that user notification is shown when requested."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        error = ValueError("Test error")
        handler.handle_error(error, show_user=True)

        # Should have called warning for user notification
        mock_logging.warning.assert_called()
        call_args = mock_logging.warning.call_args
        assert "User notification" in call_args[0][0]

    def test_handle_error_no_user_notification(self):
        """Test that user notification is not shown when not requested."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        error = ValueError("Test error")
        handler.handle_error(error, show_user=False)

        # Should not have called warning
        mock_logging.warning.assert_not_called()

    def test_handle_and_recover_success(self):
        """Test handle_and_recover with successful function."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        def successful_function() -> str:
            return "success"

        result = handler.handle_and_recover(successful_function, default_return="default")

        assert result == "success"
        # Should not have logged any errors
        mock_logging.error.assert_not_called()

    def test_handle_and_recover_failure(self):
        """Test handle_and_recover with failing function."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        def failing_function() -> str:
            raise ValueError("Function failed")

        result = handler.handle_and_recover(failing_function, default_return="default")

        assert result == "default"
        # Should have logged the error
        mock_logging.error.assert_called_once()

    def test_handle_and_recover_with_context(self):
        """Test handle_and_recover with context."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        def failing_function() -> str:
            raise ValueError("Function failed")

        context = {"operation": "test"}
        result = handler.handle_and_recover(
            failing_function, default_return="default", context=context
        )

        assert result == "default"
        # Verify context was included in error log
        call_args = mock_logging.error.call_args
        assert call_args[1]["extra"]["operation"] == "test"

    def test_handle_and_recover_no_user_notification(self):
        """Test that handle_and_recover doesn't show user notifications."""
        mock_logging = MagicMock(spec=ILoggingService)
        handler = ErrorHandler(mock_logging)

        def failing_function() -> str:
            raise ValueError("Function failed")

        handler.handle_and_recover(failing_function, default_return="default")

        # Should not have called warning (user notification)
        mock_logging.warning.assert_not_called()

