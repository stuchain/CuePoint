#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Logging Service Implementation

Structured logging service with file rotation and console output.
Design 7.1, 7.15: 5MB max, 5 backup files.
"""

import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any, Optional

from cuepoint.services.interfaces import ILoggingService
from cuepoint.utils.logger import LogSanitizer, RunContextFilter

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

        # Create formatters (Design 7.20: run_id, version, os in logs)
        file_formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s "
            "run_id=%(run_id)s version=%(version)s os=%(os)s - %(pathname)s:%(lineno)d"
        )
        console_formatter = logging.Formatter("%(levelname)s - %(message)s")

        # File handler with rotation
        if enable_file_logging:
            if log_dir is None:
                log_dir = Path.home() / ".cuepoint" / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)

            file_handler = logging.handlers.RotatingFileHandler(
                log_dir / "cuepoint.log",
                maxBytes=5 * 1024 * 1024,  # Design 7.15: 5 MB
                backupCount=5,
                encoding='utf-8'  # Ensure log files use UTF-8 encoding
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(file_formatter)
            file_handler.addFilter(RunContextFilter())
            self.logger.addHandler(file_handler)

        # Console handler with UTF-8 encoding support
        if enable_console_logging:
            # Wrap stdout in a safe Unicode handler to catch encoding errors at the stream level
            safe_stdout = SafeUnicodeStream(sys.stdout)
            console_handler = logging.StreamHandler(safe_stdout)
            console_handler.setLevel(logging.INFO)
            console_handler.setFormatter(console_formatter)
            self.logger.addHandler(console_handler)

    def debug(self, message: str, *args: Any, **kwargs: Any) -> None:
        """Log debug message.

        Args:
            message: Debug message (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        self._log(logging.DEBUG, message, *args, **kwargs)

    def info(self, message: str, *args: Any, **kwargs: Any) -> None:
        """Log info message.

        Args:
            message: Info message (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        self._log(logging.INFO, message, *args, **kwargs)

    def warning(self, message: str, *args: Any, **kwargs: Any) -> None:
        """Log warning message.

        Args:
            message: Warning message (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        self._log(logging.WARNING, message, *args, **kwargs)

    def error(self, message: str, exc_info=None, *args: Any, **kwargs: Any) -> None:
        """Log error message.

        Args:
            message: Error message to log.
            exc_info: Exception info tuple or exception instance.
            *args: Format args for message interpolation.
            **kwargs: Additional arguments passed to logger.
        """
        self._log(logging.ERROR, message, *args, exc_info=exc_info, **kwargs)

    def critical(self, message: str, *args: Any, **kwargs: Any) -> None:
        """Log critical message.

        Args:
            message: Critical message (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        self._log(logging.CRITICAL, message, *args, **kwargs)

    def _log(self, level: int, message: str, *args: Any, **kwargs: Any) -> None:
        """Internal logging method.

        Args:
            level: Logging level.
            message: Message to log (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        extra = kwargs.pop("extra", {})
        exc_info = kwargs.pop("exc_info", None)

        # Step 8.2: sanitize logs by default (message + structured extra)
        safe_message = LogSanitizer.sanitize_message(str(message))
        safe_extra = LogSanitizer.sanitize_dict(extra)

        self.logger.log(level, safe_message, *args, extra=safe_extra, exc_info=exc_info, **kwargs)

    def get_log_path(self) -> Optional[Path]:
        """Get path to current log file (Design 7.53).

        Returns:
            Path to cuepoint.log, or None if file logging disabled.
        """
        for handler in self.logger.handlers:
            if isinstance(handler, logging.handlers.RotatingFileHandler):
                return Path(handler.baseFilename)
        return None
