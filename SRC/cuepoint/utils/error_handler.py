#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Centralized Error Handling

Provides unified error handling with user-friendly messages.
Implements the "Reliability Outcome" from Step 1.4 - graceful error handling.
"""

from pathlib import Path
from typing import Any, Callable, Dict, Optional

from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.interfaces import ILoggingService
from cuepoint.utils.paths import AppPaths


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

    @staticmethod
    def format_user_friendly_error(
        error: Exception, context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Format error message for user display.

        Provides user-friendly error messages with actionable suggestions.
        Implements the "No-Surprises UX" principle from product statement.

        Args:
            error: The exception that occurred.
            context: Optional context dictionary with additional information.

        Returns:
            Dictionary with:
            - title: Error title
            - message: User-friendly message
            - suggestions: List of actionable suggestions
            - technical_details: Technical error details
            - log_location: Path to logs directory
        """
        context = context or {}
        error_type = type(error)

        # Error message templates
        error_templates: Dict[type, Dict[str, Any]] = {
            FileNotFoundError: {
                "title": "File Not Found",
                "message": "The file could not be found.",
                "suggestions": [
                    "Check that the file path is correct",
                    "Verify the file hasn't been moved or deleted",
                    "Try selecting the file again",
                ],
            },
            PermissionError: {
                "title": "Permission Denied",
                "message": "You don't have permission to access this file or location.",
                "suggestions": [
                    "Check file permissions",
                    "Try selecting a different location",
                    "On Windows, try running as administrator if needed",
                ],
            },
            OSError: {
                "title": "File System Error",
                "message": "An error occurred accessing the file system.",
                "suggestions": [
                    "Check that the disk is not full",
                    "Verify the file is not in use by another program",
                    "Try selecting a different location",
                ],
            },
            ValueError: {
                "title": "Invalid Input",
                "message": "The provided input is invalid.",
                "suggestions": [
                    "Check the input format",
                    "Verify all required fields are filled",
                    "Try again with corrected input",
                ],
            },
        }

        # Get error info
        if error_type in error_templates:
            error_info = error_templates[error_type].copy()
        else:
            error_info = {
                "title": "Error",
                "message": "An unexpected error occurred.",
                "suggestions": [
                    "Try the operation again",
                    "Check the logs for more details",
                    "Contact support if the problem persists",
                ],
            }

        # Add context-specific information
        if "file_path" in context:
            file_path = context["file_path"]
            if isinstance(file_path, (str, Path)):
                error_info["message"] += f"\n\nFile: {file_path}"

        # Add technical details
        technical_details = str(error)
        if isinstance(error, CuePointException) and error.error_code:
            technical_details = f"[{error.error_code}] {technical_details}"

        # Build comprehensive error message
        comprehensive_message = error_info["message"]
        
        # Add "What happened" section
        comprehensive_message += "\n\nWhat happened:"
        comprehensive_message += f"\n• {error_type.__name__}: {str(error)}"
        
        # Add "What you can do" section
        comprehensive_message += "\n\nWhat you can do:"
        for suggestion in error_info["suggestions"]:
            comprehensive_message += f"\n• {suggestion}"
        
        # Add log location
        comprehensive_message += f"\n\nLogs location: {AppPaths.logs_dir()}"
        comprehensive_message += "\n(Check logs for detailed technical information)"

        return {
            "title": error_info["title"],
            "message": comprehensive_message,
            "suggestions": error_info["suggestions"],
            "technical_details": technical_details,
            "log_location": str(AppPaths.logs_dir()),
        }

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























