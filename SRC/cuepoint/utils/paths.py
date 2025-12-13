#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Standard Application Paths Utility

Provides consistent, platform-agnostic paths for application data using QStandardPaths.
Implements the "Reliability Outcome" from Step 1.4 - predictable storage locations.
"""

import os
import sys
from pathlib import Path
from typing import Dict

from PySide6.QtCore import QStandardPaths

from cuepoint.utils.platform import is_macos, is_windows


class AppPaths:
    """Standard application paths using QStandardPaths.

    Provides consistent paths across platforms:
    - macOS: Uses ~/Library/Application Support, ~/Library/Caches, etc.
    - Windows: Uses %APPDATA%, %LOCALAPPDATA%, etc.
    - Linux: Uses ~/.config, ~/.local/share, etc.

    All paths are created automatically if they don't exist.
    """

    _initialized = False

    @staticmethod
    def _ensure_dir(path: Path) -> Path:
        """Ensure directory exists, create if needed.

        Args:
            path: Directory path to ensure exists.

        Returns:
            Path object (guaranteed to exist).

        Raises:
            PermissionError: If directory cannot be created.
            OSError: If directory creation fails.
        """
        try:
            path.mkdir(parents=True, exist_ok=True)
            return path
        except PermissionError as e:
            raise PermissionError(
                f"Permission denied creating directory {path}. "
                f"Please check permissions or choose a different location."
            ) from e
        except OSError as e:
            raise OSError(f"Failed to create directory {path}: {e}") from e

    @staticmethod
    def config_dir() -> Path:
        """Get configuration directory.

        Platform-specific locations:
        - macOS: ~/Library/Application Support/CuePoint
        - Windows: %APPDATA%/CuePoint
        - Linux: ~/.config/CuePoint

        Returns:
            Path to configuration directory.
        """
        path = Path(
            QStandardPaths.writableLocation(QStandardPaths.AppConfigLocation)
        ) / "CuePoint"
        return AppPaths._ensure_dir(path)

    @staticmethod
    def config_file() -> Path:
        """Get main configuration file path.

        Returns:
            Path to config.yaml file.
        """
        return AppPaths.config_dir() / "config.yaml"

    @staticmethod
    def data_dir() -> Path:
        """Get application data directory.

        Platform-specific locations:
        - macOS: ~/Library/Application Support/CuePoint
        - Windows: %LOCALAPPDATA%/CuePoint
        - Linux: ~/.local/share/CuePoint

        Returns:
            Path to data directory.
        """
        path = Path(
            QStandardPaths.writableLocation(QStandardPaths.AppLocalDataLocation)
        ) / "CuePoint"
        return AppPaths._ensure_dir(path)

    @staticmethod
    def cache_dir() -> Path:
        """Get cache directory.

        Platform-specific locations:
        - macOS: ~/Library/Caches/CuePoint
        - Windows: %LOCALAPPDATA%/CuePoint/cache
        - Linux: ~/.cache/CuePoint

        Returns:
            Path to cache directory.
        """
        path = Path(QStandardPaths.writableLocation(QStandardPaths.CacheLocation)) / "CuePoint"
        return AppPaths._ensure_dir(path)

    @staticmethod
    def logs_dir() -> Path:
        """Get logs directory.

        Returns:
            Path to logs directory (subdirectory of data_dir).
        """
        path = AppPaths.data_dir() / "Logs"
        return AppPaths._ensure_dir(path)

    @staticmethod
    def exports_dir() -> Path:
        """Get default exports directory.

        Uses Downloads folder on first run, user can change in settings.

        Returns:
            Path to exports directory.
        """
        downloads = Path(
            QStandardPaths.writableLocation(QStandardPaths.DownloadLocation)
        )
        exports = downloads / "CuePoint Exports"
        return AppPaths._ensure_dir(exports)

    @staticmethod
    def temp_dir() -> Path:
        """Get temporary files directory.

        Returns:
            Path to temporary files directory (subdirectory of cache_dir).
        """
        path = AppPaths.cache_dir() / "temp"
        return AppPaths._ensure_dir(path)

    @staticmethod
    def app_dir() -> Path:
        """Get application installation directory.

        Returns:
            Path to app directory (bundle on macOS, executable dir on Windows).
        """
        if getattr(sys, "frozen", False):
            # Running as bundled app
            exe_path = Path(sys.executable)
            if is_macos():
                # macOS: executable is in Contents/MacOS, go up to .app
                return exe_path.parent.parent.parent
            else:
                # Windows/Linux: executable directory
                return exe_path.parent
        else:
            # Running from source
            # This file is at: SRC/cuepoint/utils/paths.py
            # App root is: SRC/
            return Path(__file__).parent.parent.parent

    @staticmethod
    def safe_filename(filename: str) -> str:
        """Make filename safe for current platform.

        Removes invalid characters and handles platform-specific restrictions.

        Args:
            filename: Original filename.

        Returns:
            Safe filename for current platform.
        """
        if is_windows():
            # Windows: Remove invalid characters
            invalid_chars = '<>:"|?*\\'
            for char in invalid_chars:
                filename = filename.replace(char, "_")
            # Remove reserved names
            reserved = ["CON", "PRN", "AUX", "NUL"] + [f"COM{i}" for i in range(1, 10)] + [f"LPT{i}" for i in range(1, 10)]
            name, ext = os.path.splitext(filename)
            if name.upper() in reserved:
                filename = f"_{name}{ext}"
        else:
            # macOS/Linux: Remove / and null
            filename = filename.replace("/", "_").replace("\0", "_")

        # Limit length (255 chars total)
        if len(filename) > 255:
            name, ext = os.path.splitext(filename)
            max_name_len = 255 - len(ext)
            filename = name[:max_name_len] + ext

        return filename

    @staticmethod
    def initialize_all() -> None:
        """Initialize all standard paths.

        Creates all directories if they don't exist.
        Should be called at application startup.

        Raises:
            PermissionError: If any directory cannot be created.
            OSError: If directory creation fails.
        """
        if AppPaths._initialized:
            return

        try:
            # Initialize all paths (creates directories)
            AppPaths.config_dir()
            AppPaths.data_dir()
            AppPaths.cache_dir()
            AppPaths.logs_dir()
            AppPaths.exports_dir()
            AppPaths.temp_dir()
            AppPaths._initialized = True
        except Exception as e:
            raise RuntimeError(f"Failed to initialize application paths: {e}") from e

    @staticmethod
    def get_all_paths() -> Dict[str, str]:
        """Get all paths for diagnostics.

        Returns:
            Dictionary mapping path names to absolute paths.
        """
        return {
            "config": str(AppPaths.config_dir()),
            "config_file": str(AppPaths.config_file()),
            "data": str(AppPaths.data_dir()),
            "cache": str(AppPaths.cache_dir()),
            "logs": str(AppPaths.logs_dir()),
            "exports": str(AppPaths.exports_dir()),
            "temp": str(AppPaths.temp_dir()),
            "app": str(AppPaths.app_dir()),
        }

    @staticmethod
    def validate_paths() -> Dict[str, bool]:
        """Validate all paths are accessible.

        Returns:
            Dictionary mapping path names to accessibility status.
        """
        results = {}
        paths = AppPaths.get_all_paths()

        for name, path_str in paths.items():
            path = Path(path_str)
            try:
                # Check if path exists and is accessible
                if path.exists():
                    results[name] = os.access(path, os.R_OK)
                else:
                    # Check if parent is writable (can create)
                    results[name] = os.access(path.parent, os.W_OK)
            except Exception:
                results[name] = False

        return results
