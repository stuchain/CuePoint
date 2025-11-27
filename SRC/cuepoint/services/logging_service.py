#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Logging Service Implementation

Structured logging service with file rotation and console output.
"""

import logging
import logging.handlers
from pathlib import Path
from typing import Any, Dict, Optional

from cuepoint.services.interfaces import ILoggingService


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

        # Prevent propagation to root logger
        self.logger.propagate = False

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
                log_dir / "cuepoint.log", maxBytes=10 * 1024 * 1024, backupCount=5  # 10 MB
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(file_formatter)
            self.logger.addHandler(file_handler)

        # Console handler
        if enable_console_logging:
            console_handler = logging.StreamHandler()
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
        self.logger.log(level, message, extra=extra, exc_info=exc_info, **kwargs)
