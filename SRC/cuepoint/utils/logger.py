#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CuePoint Logging System

Implements Step 6.2 - Logging with:
- Rotating file logs (5MB, 5 backups)
- Console logs only in dev builds
- Crash log separation
- Log level management
- Sensitive information filtering
- Timing information logging
"""

import logging
import logging.handlers
import os
import platform
import re
import sys
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from cuepoint.utils.paths import AppPaths

try:
    from cuepoint.version import get_build_info, get_version
except ImportError:
    # Fallback if version module not available
    def get_version():
        return "1.0.0"
    
    def get_build_info():
        return {"version": "1.0.0"}


def is_dev_build() -> bool:
    """Check if running in development build.
    
    Returns:
        True if development build, False otherwise.
    """
    # Check if running from source (not frozen)
    return not getattr(sys, "frozen", False)


class CuePointLogger:
    """Centralized logging configuration for CuePoint.
    
    Implements Step 6.2.1 - Logging Architecture.
    """
    
    _configured = False
    _log_level = logging.INFO
    
    @staticmethod
    def configure(
        level: Optional[int] = None,
        enable_console: Optional[bool] = None,
        log_file: Optional[Path] = None
    ) -> None:
        """Configure logging system.
        
        Args:
            level: Log level (default: INFO, DEBUG in dev builds).
            enable_console: Enable console logging (default: dev builds only).
            log_file: Log file path (default: logs_dir/cuepoint.log).
        """
        if CuePointLogger._configured:
            return
        
        # Determine log level
        if level is None:
            level = logging.DEBUG if is_dev_build() else logging.INFO
        
        CuePointLogger._log_level = level
        
        # Determine console logging
        if enable_console is None:
            enable_console = is_dev_build()
        
        # Determine log file
        if log_file is None:
            log_file = AppPaths.logs_dir() / "cuepoint.log"
        
        # Get root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(level)
        
        # Clear existing handlers
        root_logger.handlers.clear()
        
        # Create formatters
        file_formatter = logging.Formatter(
            '%(asctime)s [%(levelname)-8s] %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        console_formatter = logging.Formatter(
            '[%(levelname)-8s] %(name)s: %(message)s'
        )
        
        # File handler with rotation (Step 6.2.1.3)
        file_handler = CuePointLogger._create_rotating_handler(
            log_file,
            file_formatter,
            level
        )
        root_logger.addHandler(file_handler)
        
        # Console handler (dev builds only)
        if enable_console:
            console_handler = logging.StreamHandler()
            console_handler.setLevel(level)
            console_handler.setFormatter(console_formatter)
            root_logger.addHandler(console_handler)
        
        # Log startup information (Step 6.2.2.1)
        logger = logging.getLogger(__name__)
        logger.info("=" * 60)
        logger.info("CuePoint Starting")
        logger.info("=" * 60)
        
        build_info = get_build_info()
        logger.info(f"Version: {build_info.get('version', 'unknown')}")
        if build_info.get('build_number'):
            logger.info(f"Build: {build_info['build_number']}")
        if build_info.get('commit_sha'):
            logger.info(f"Commit: {build_info.get('short_commit_sha', build_info['commit_sha'][:7])}")
        
        logger.info(f"Platform: {platform.system()} {platform.release()}")
        logger.info(f"Python: {platform.python_version()}")
        
        CuePointLogger._configured = True
    
    @staticmethod
    def _create_rotating_handler(
        log_file: Path,
        formatter: logging.Formatter,
        level: int
    ) -> logging.handlers.RotatingFileHandler:
        """Create rotating file handler.
        
        Args:
            log_file: Path to log file.
            formatter: Log formatter.
            level: Log level.
            
        Returns:
            Configured RotatingFileHandler.
        """
        # Ensure log directory exists
        log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Create rotating handler
        # Rotate at 5MB, keep 5 backup files (Step 6.2.1.3)
        handler = logging.handlers.RotatingFileHandler(
            str(log_file),
            maxBytes=5 * 1024 * 1024,  # 5MB
            backupCount=5,
            encoding='utf-8'
        )
        
        handler.setLevel(level)
        handler.setFormatter(formatter)
        
        return handler
    
    @staticmethod
    def set_level(level: int) -> None:
        """Change log level at runtime.
        
        Args:
            level: New log level (logging.DEBUG, INFO, WARNING, ERROR, CRITICAL).
        """
        CuePointLogger._log_level = level
        root_logger = logging.getLogger()
        root_logger.setLevel(level)
        
        # Update all handlers
        for handler in root_logger.handlers:
            handler.setLevel(level)
    
    @staticmethod
    def get_log_file() -> Path:
        """Get current log file path.
        
        Returns:
            Path to current log file.
        """
        for handler in logging.getLogger().handlers:
            if isinstance(handler, logging.handlers.RotatingFileHandler):
                return Path(handler.baseFilename)
        return AppPaths.logs_dir() / "cuepoint.log"


class LogLevelManager:
    """Manage log levels and filtering.
    
    Implements Step 6.2.1.2 - Log Level Management.
    """
    
    # Log level names for UI
    LEVEL_NAMES = {
        logging.DEBUG: "Debug",
        logging.INFO: "Info",
        logging.WARNING: "Warning",
        logging.ERROR: "Error",
        logging.CRITICAL: "Critical",
    }
    
    @staticmethod
    def get_level_name(level: int) -> str:
        """Get human-readable level name.
        
        Args:
            level: Log level constant.
            
        Returns:
            Human-readable level name.
        """
        return LogLevelManager.LEVEL_NAMES.get(level, "Unknown")
    
    @staticmethod
    def set_level_from_string(level_name: str) -> None:
        """Set log level from string name.
        
        Args:
            level_name: "debug", "info", "warning", "error", "critical".
        """
        level_map = {
            "debug": logging.DEBUG,
            "info": logging.INFO,
            "warning": logging.WARNING,
            "error": logging.ERROR,
            "critical": logging.CRITICAL,
        }
        
        level = level_map.get(level_name.lower(), logging.INFO)
        CuePointLogger.set_level(level)
    
    @staticmethod
    def get_current_level() -> int:
        """Get current log level.
        
        Returns:
            Current log level.
        """
        return logging.getLogger().level


class CrashLogger:
    """Handle crash-specific logging.
    
    Implements Step 6.2.1.4 - Crash Log Separation.
    """
    
    @staticmethod
    def create_crash_log() -> Path:
        """Create a new crash log file.
        
        Returns:
            Path to crash log file.
        """
        crash_dir = AppPaths.logs_dir() / "crashes"
        crash_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        crash_log = crash_dir / f"crash-{timestamp}.log"
        
        return crash_log
    
    @staticmethod
    def write_crash_info(crash_log: Path, exception: Exception, traceback_str: str) -> None:
        """Write crash information to crash log.
        
        Args:
            crash_log: Path to crash log file.
            exception: Exception that caused crash.
            traceback_str: Full traceback string.
        """
        with open(crash_log, 'w', encoding='utf-8') as f:
            f.write("=" * 60 + "\n")
            f.write("CuePoint Crash Report\n")
            f.write("=" * 60 + "\n")
            f.write(f"Timestamp: {datetime.now().isoformat()}\n")
            f.write(f"Exception: {type(exception).__name__}\n")
            f.write(f"Message: {str(exception)}\n")
            f.write("\n")
            f.write("Traceback:\n")
            f.write(traceback_str)
            f.write("\n")
            
            # Add recent log entries (Step 6.3.1)
            f.write("\n" + "=" * 60 + "\n")
            f.write("Recent Log Entries (last 200 lines)\n")
            f.write("=" * 60 + "\n")
            
            recent_logs = CrashLogger._get_recent_logs(200)
            f.write(recent_logs)
    
    @staticmethod
    def _get_recent_logs(lines: int = 200) -> str:
        """Get recent log entries from main log file.
        
        Args:
            lines: Number of lines to retrieve.
            
        Returns:
            Recent log entries as string.
        """
        log_file = CuePointLogger.get_log_file()
        
        if not log_file.exists():
            return "No log file found.\n"
        
        try:
            # Read last N lines
            with open(log_file, 'r', encoding='utf-8') as f:
                all_lines = f.readlines()
                recent = all_lines[-lines:] if len(all_lines) > lines else all_lines
                return "".join(recent)
        except Exception as e:
            return f"Error reading log file: {e}\n"


class SafeLogger:
    """Logger with sensitive information filtering.
    
    Implements Step 6.2.2.1 - Logging Content Guidelines.
    """
    
    # Patterns to redact - (pattern, replacement) tuples
    SENSITIVE_PATTERNS = [
        (r'(password["\']?\s*[:=]\s*["\']?)([^"\']+)', r'\1***REDACTED***'),
        (r'(token["\']?\s*[:=]\s*["\']?)([^"\']+)', r'\1***REDACTED***'),
        (r'(api[_-]?key["\']?\s*[:=]\s*["\']?)([^"\']+)', r'\1***REDACTED***'),
        (r'(secret["\']?\s*[:=]\s*["\']?)([^"\']+)', r'\1***REDACTED***'),
        (r'(authorization["\']?\s*[:=]\s*["\']?)([^"\']+)', r'\1***REDACTED***'),
    ]
    
    @staticmethod
    def sanitize_message(message: str) -> str:
        """Remove sensitive information from log message.
        
        Args:
            message: Original message.
            
        Returns:
            Sanitized message.
        """
        return LogSanitizer.sanitize_message(message)
    
    @staticmethod
    def log_safe(logger: logging.Logger, level: int, message: str, *args, **kwargs):
        """Log message with sensitive information filtering.
        
        Args:
            logger: Logger instance.
            level: Log level.
            message: Message to log.
            *args, **kwargs: Additional arguments.
        """
        sanitized = SafeLogger.sanitize_message(str(message))
        logger.log(level, sanitized, *args, **kwargs)


class LogSanitizer:
    """Sanitize sensitive information from logs.

    Step 8.2 hardening:
    - Redact tokens/secrets in free-form messages
    - Redact sensitive query parameters in URLs
    - Sanitize user file paths (avoid leaking home directories)
    - Sanitize structured `extra={}` dicts passed to logging
    """

    # Keys we treat as sensitive anywhere (message, query params, dict keys)
    SENSITIVE_KEYS = {
        "token",
        "api_key",
        "apikey",
        "auth",
        "authorization",
        "password",
        "secret",
        "credential",
        "credentials",
        "access_token",
        "refresh_token",
    }

    # Loose patterns to catch query-param style leaks inside free-form strings
    # e.g. "...token=abc123&..." or "...apikey: abc..."
    _TOKEN_PATTERNS = [
        r"(?i)\b(token|api[_-]?key|apikey|auth|authorization|password|secret|access_token|refresh_token)\s*=\s*([^&\s]+)",
        r"(?i)\b(token|api[_-]?key|apikey|auth|authorization|password|secret|access_token|refresh_token)\s*:\s*([^\s]+)",
    ]

    @staticmethod
    def sanitize_url(url: str) -> str:
        """Sanitize URL by redacting sensitive query parameters.

        If parsing fails, falls back to removing everything after '?'.
        """
        try:
            parsed = urlparse(url)
            # If it doesn't look like a URL, just run message sanitization
            if not parsed.scheme or not parsed.netloc:
                return LogSanitizer.sanitize_message(url)

            query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
            sanitized_pairs = []
            for k, v in query_pairs:
                if k.lower() in LogSanitizer.SENSITIVE_KEYS:
                    # Use an unambiguous value that won't be percent-encoded into noise.
                    sanitized_pairs.append((k, "REDACTED"))
                else:
                    sanitized_pairs.append((k, v))

            sanitized_query = urlencode(sanitized_pairs, doseq=True)
            return urlunparse(
                (parsed.scheme, parsed.netloc, parsed.path, parsed.params, sanitized_query, parsed.fragment)
            )
        except Exception:
            # Conservative fallback: keep base, drop query/fragment
            base = url.split("?", 1)[0]
            return base + "?***REDACTED***" if "?" in url else base

    @staticmethod
    def sanitize_path(path: str, max_length: int = 100) -> str:
        """Sanitize file path by removing user-specific home directory and truncating."""
        try:
            # Normalize home path redaction (works across platforms)
            home = str(Path.home())
            sanitized = path
            if sanitized.startswith(home):
                sanitized = sanitized.replace(home, "~", 1)

            # Also redact Windows user profile explicitly if home resolution differs
            user_profile = os.environ.get("USERPROFILE")
            if user_profile and sanitized.startswith(user_profile):
                sanitized = sanitized.replace(user_profile, "~", 1)

            if len(sanitized) > max_length:
                try:
                    basename = Path(sanitized).name
                    return "..." + basename
                except Exception:
                    return "..." + sanitized[-(max_length - 3) :]

            return sanitized
        except Exception:
            return "***REDACTED_PATH***"

    @staticmethod
    def sanitize_message(message: str) -> str:
        """Sanitize a free-form message string.

        Applies:
        - legacy SafeLogger patterns (password/token/api-key/etc.)
        - query-param style redaction
        - best-effort URL query parameter redaction for embedded URLs
        """
        sanitized = str(message)

        # Apply the legacy patterns (covers quoted key/value patterns)
        for pattern, replacement in SafeLogger.SENSITIVE_PATTERNS:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)

        # Apply query-param style patterns
        for pat in LogSanitizer._TOKEN_PATTERNS:
            sanitized = re.sub(pat, lambda m: f"{m.group(1)}=***REDACTED***", sanitized)

        # Best-effort: sanitize URLs inside the message
        # (simple URL matcher; keep it conservative)
        url_pattern = r"(https?://[^\s]+)"
        for url_match in re.findall(url_pattern, sanitized):
            sanitized = sanitized.replace(url_match, LogSanitizer.sanitize_url(url_match))

        return sanitized

    @staticmethod
    def sanitize_dict(data: Any) -> Any:
        """Recursively sanitize structured data for logging."""
        if isinstance(data, dict):
            out: dict = {}
            for k, v in data.items():
                key_str = str(k)
                if key_str.lower() in LogSanitizer.SENSITIVE_KEYS or any(
                    sk in key_str.lower() for sk in LogSanitizer.SENSITIVE_KEYS
                ):
                    out[key_str] = "***REDACTED***"
                else:
                    out[key_str] = LogSanitizer.sanitize_dict(v)
            return out

        if isinstance(data, (list, tuple)):
            return [LogSanitizer.sanitize_dict(v) for v in data]

        if isinstance(data, Path):
            return LogSanitizer.sanitize_path(str(data))

        if isinstance(data, str):
            # If it's a URL, sanitize URL; otherwise sanitize message
            if data.startswith("http://") or data.startswith("https://"):
                return LogSanitizer.sanitize_url(data)
            return LogSanitizer.sanitize_message(data)

        return data


@contextmanager
def log_timing(operation_name: str, logger: Optional[logging.Logger] = None):
    """Context manager to log operation timing.
    
    Implements Step 6.2.2.3 - Timing Information Logging.
    
    Usage:
        with log_timing("process_file"):
            # operation code
    
    Args:
        operation_name: Name of operation.
        logger: Logger instance (default: root logger).
    """
    if logger is None:
        logger = logging.getLogger()
    
    start_time = time.time()
    logger.info(f"Starting {operation_name}")
    
    try:
        yield
        duration = time.time() - start_time
        logger.info(f"Completed {operation_name} in {duration:.2f}s")
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"Failed {operation_name} after {duration:.2f}s: {e}")
        raise
