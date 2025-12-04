#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Custom exceptions for CuePoint application."""

from typing import Any, Dict, Optional


class CuePointException(Exception):
    """Base exception for all CuePoint errors."""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        """Initialize exception.

        Args:
            message: Human-readable error message.
            error_code: Optional error code for programmatic handling.
            context: Optional dictionary with additional context.
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.context = context or {}

    def __str__(self) -> str:
        """Return formatted error message."""
        if self.error_code:
            return f"[{self.error_code}] {self.message}"
        return self.message


class ProcessingError(CuePointException):
    """Error during track processing."""

    pass


class BeatportAPIError(CuePointException):
    """Error from Beatport API."""

    def __init__(self, message: str, status_code: Optional[int] = None, **kwargs):
        """Initialize API error.

        Args:
            message: Error message.
            status_code: HTTP status code if applicable.
        """
        super().__init__(message, **kwargs)
        self.status_code = status_code


class ValidationError(CuePointException):
    """Error in data validation."""

    pass


class ConfigurationError(CuePointException):
    """Error in configuration."""

    pass


class ExportError(CuePointException):
    """Error during export operations."""

    pass


class CacheError(CuePointException):
    """Error in cache operations."""

    pass










