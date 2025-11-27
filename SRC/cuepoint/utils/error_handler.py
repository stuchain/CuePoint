#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Centralized error handling."""

from typing import Any, Callable, Optional

from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.interfaces import ILoggingService


class ErrorHandler:
    """Centralized error handler.

    Provides unified error handling with logging, callbacks, and user notifications.
    """

    def __init__(self, logging_service: ILoggingService):
        """Initialize error handler.

        Args:
            logging_service: Service for logging errors.
        """
        self.logging_service = logging_service
        self.error_callbacks: list[Callable[[Exception], None]] = []

    def register_callback(self, callback: Callable[[Exception], None]) -> None:
        """Register a callback for error notifications.

        Args:
            callback: Function to call when error occurs.
        """
        self.error_callbacks.append(callback)

    def handle_error(
        self, error: Exception, context: Optional[dict] = None, show_user: bool = True
    ) -> None:
        """Handle an error.

        Args:
            error: The exception that occurred.
            context: Optional context dictionary.
            show_user: Whether to show error to user (default: True).
        """
        # Log error
        error_context = context or {}
        if isinstance(error, CuePointException):
            error_context.update(error.context)
            if error.error_code:
                error_context["error_code"] = error.error_code

        # Add error type to context
        error_context["error_type"] = type(error).__name__

        self.logging_service.error(f"Error: {str(error)}", exc_info=error, extra=error_context)

        # Notify callbacks
        for callback in self.error_callbacks:
            try:
                callback(error)
            except Exception as e:
                self.logging_service.error(f"Error in error callback: {e}")

        # Show to user if requested
        if show_user:
            self._show_user_error(error)

    def _show_user_error(self, error: Exception) -> None:
        """Show error to user (implement based on UI framework).

        This is a placeholder that can be extended to show message boxes
        or notifications in the GUI.

        Args:
            error: The exception to show.
        """
        # This would show a message box or notification
        # Implementation depends on UI framework
        # For now, we just log it
        self.logging_service.warning(f"User notification for error: {str(error)}")

    def handle_and_recover(
        self, func: Callable, default_return: Any = None, context: Optional[dict] = None
    ) -> Any:
        """Execute function and handle errors with recovery.

        Args:
            func: Function to execute.
            default_return: Value to return on error.
            context: Optional context dictionary.

        Returns:
            Function result or default_return on error.
        """
        try:
            return func()
        except Exception as e:
            self.handle_error(e, context, show_user=False)
            return default_return
