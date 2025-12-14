#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Logging Service Implementation

Structured logging service with file rotation and console output.
"""

import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any, Optional

from cuepoint.services.interfaces import ILoggingService
from cuepoint.utils.logger import LogSanitizer

# Disable error output from the logging system itself at module level
# This prevents "--- Logging error ---" messages from appearing
# when UnicodeEncodeError occurs (we handle it in our custom handler)
logging.raiseExceptions = False


class SafeUnicodeStream:
    """Wrapper for streams that safely handles Unicode encoding errors.
    
    This wraps sys.stdout/sys.stderr to catch UnicodeEncodeError and
    replace problematic characters with '?' before they reach the stream.
    """
    
    def __init__(self, stream):
        self.stream = stream
        self.encoding = getattr(stream, 'encoding', None) or 'utf-8'
    
    def write(self, text):
        """Write text, handling Unicode encoding errors."""
        try:
            self.stream.write(text)
        except (UnicodeEncodeError, UnicodeError):
            # Replace problematic characters with '?'
            safe_text = text.encode(self.encoding, errors='replace').decode(self.encoding, errors='replace')
            try:
                self.stream.write(safe_text)
            except (UnicodeEncodeError, UnicodeError):
                # Last resort: ASCII with replacement
                safe_text = text.encode('ascii', errors='replace').decode('ascii')
                self.stream.write(safe_text)
    
    def flush(self):
        """Flush the underlying stream."""
        self.stream.flush()
    
    def __getattr__(self, name):
        """Delegate other attributes to the underlying stream."""
        return getattr(self.stream, name)


class LoggingService(ILoggingService):
    """Structured logging service with file rotation and console output.

    Provides a comprehensive logging interface with:
    - File logging with rotation (10 MB max, 5 backups)
    - Console logging with simplified format
    - Configurable log levels
    - Structured logging with extra context
    """

    def __init__(
        self,
        log_dir: Optional[Path] = None,
        log_level: str = "INFO",
        enable_file_logging: bool = True,
        enable_console_logging: bool = True,
        logger_name: str = "cuepoint",
    ):
        """Initialize logging service.

        Args:
            log_dir: Directory for log files. Defaults to user data dir.
            log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
            enable_file_logging: Whether to log to file.
            enable_console_logging: Whether to log to console.
            logger_name: Name for the logger (default: "cuepoint").
        """
        self.logger = logging.getLogger(logger_name)
        self.logger.setLevel(getattr(logging, log_level.upper()))

        # Remove existing handlers to avoid duplicates
        self.logger.handlers.clear()

        # Prevent propagation to root logger to avoid duplicate handlers
        self.logger.propagate = False
        
        # Also clear root logger handlers to prevent it from trying to log
        # This prevents the root logger from also trying to handle our messages
        # and causing Unicode errors
        root_logger = logging.getLogger()
        if root_logger.handlers:
            # Only remove StreamHandlers that write to stdout/stderr to avoid
            # interfering with other logging setups
            root_logger.handlers = [
                h for h in root_logger.handlers 
                if not isinstance(h, logging.StreamHandler) or h.stream not in (sys.stdout, sys.stderr)
            ]

        # Create formatters
        file_formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(pathname)s:%(lineno)d"
        )
        console_formatter = logging.Formatter("%(levelname)s - %(message)s")

        # File handler with rotation
        if enable_file_logging:
            if log_dir is None:
                log_dir = Path.home() / ".cuepoint" / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)

            file_handler = logging.handlers.RotatingFileHandler(
                log_dir / "cuepoint.log", 
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=5,
                encoding='utf-8'  # Ensure log files use UTF-8 encoding
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(file_formatter)
            self.logger.addHandler(file_handler)

        # Console handler with UTF-8 encoding support
        if enable_console_logging:
            # Wrap stdout in a safe Unicode handler to catch encoding errors at the stream level
            safe_stdout = SafeUnicodeStream(sys.stdout)
            console_handler = logging.StreamHandler(safe_stdout)
            console_handler.setLevel(logging.INFO)
            console_handler.setFormatter(console_formatter)
            self.logger.addHandler(console_handler)

    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug message.

        Args:
            message: Debug message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self._log(logging.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs: Any) -> None:
        """Log info message.

        Args:
            message: Info message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self._log(logging.INFO, message, **kwargs)

    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning message.

        Args:
            message: Warning message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self._log(logging.WARNING, message, **kwargs)

    def error(self, message: str, exc_info=None, **kwargs: Any) -> None:
        """Log error message.

        Args:
            message: Error message to log.
            exc_info: Exception info tuple or exception instance.
            **kwargs: Additional arguments passed to logger.
        """
        self._log(logging.ERROR, message, exc_info=exc_info, **kwargs)

    def critical(self, message: str, **kwargs: Any) -> None:
        """Log critical message.

        Args:
            message: Critical message to log.
            **kwargs: Additional arguments passed to logger.
        """
        self._log(logging.CRITICAL, message, **kwargs)

    def _log(self, level: int, message: str, **kwargs: Any) -> None:
        """Internal logging method.

        Args:
            level: Logging level.
            message: Message to log.
            **kwargs: Additional arguments including 'extra' for structured data.
        """
        extra = kwargs.pop("extra", {})
        exc_info = kwargs.pop("exc_info", None)

        # Step 8.2: sanitize logs by default (message + structured extra)
        safe_message = LogSanitizer.sanitize_message(str(message))
        safe_extra = LogSanitizer.sanitize_dict(extra)

        self.logger.log(level, safe_message, extra=safe_extra, exc_info=exc_info, **kwargs)
