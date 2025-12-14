#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Standard Application Paths Utility

Provides consistent, platform-agnostic paths for application data using QStandardPaths.
Implements the "Reliability Outcome" from Step 1.4 - predictable storage locations.
Implements Step 6.1 - File System Locations.
"""

import os
import platform
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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

    @staticmethod
    def get_log_file(name: str = "cuepoint.log") -> Path:
        """Get path to log file.

        Args:
            name: Log file name.

        Returns:
            Path to log file.
        """
        return AppPaths.logs_dir() / name

    @staticmethod
    def get_cache_file(name: str) -> Path:
        """Get path to cache file.

        Args:
            name: Cache file name.

        Returns:
            Path to cache file.
        """
        return AppPaths.cache_dir() / name

    @staticmethod
    def get_config_file(name: str) -> Path:
        """Get path to config file.

        Args:
            name: Config file name.

        Returns:
            Path to config file.
        """
        return AppPaths.config_dir() / name

    @staticmethod
    def get_temp_file(prefix: str = "tmp", suffix: str = "") -> Path:
        """Get path to temporary file.

        Args:
            prefix: File prefix.
            suffix: File suffix.

        Returns:
            Path to temporary file.
        """
        import tempfile
        return Path(tempfile.mktemp(
            prefix=prefix,
            suffix=suffix,
            dir=str(AppPaths.temp_dir())
        ))


class StorageInvariants:
    """Enforce storage invariants to prevent writing to restricted locations.
    
    Implements Step 6.1.3 - Storage Invariants.
    """

    @staticmethod
    def get_app_dir() -> Path:
        """Get application installation directory.
        
        Returns:
            Path to app directory (bundle on macOS, executable dir on Windows).
        """
        return AppPaths.app_dir()

    @staticmethod
    def is_restricted_location(path: Path) -> bool:
        """Check if path is in a restricted location.
        
        Args:
            path: Path to check.
            
        Returns:
            True if path is in a restricted location.
        """
        app_dir = StorageInvariants.get_app_dir()
        path_abs = path.resolve()
        app_dir_abs = app_dir.resolve()

        # Check if path is within app directory
        try:
            path_abs.relative_to(app_dir_abs)
            # Path is within app directory - restricted!
            return True
        except ValueError:
            # Path is not within app directory - OK
            pass

        # Check for other restricted locations
        if is_windows():
            # Check Program Files
            program_files = Path(os.environ.get("ProgramFiles", ""))
            if program_files and program_files.exists():
                try:
                    path_abs.relative_to(program_files.resolve())
                    return True
                except ValueError:
                    pass

            # Check Program Files (x86)
            program_files_x86 = Path(os.environ.get("ProgramFiles(x86)", ""))
            if program_files_x86 and program_files_x86.exists():
                try:
                    path_abs.relative_to(program_files_x86.resolve())
                    return True
                except ValueError:
                    pass

        return False

    @staticmethod
    def is_app_bundle(path: Path) -> bool:
        """Check if path is within an app bundle (macOS).
        
        Args:
            path: Path to check.
            
        Returns:
            True if path is within an app bundle.
        """
        if not is_macos():
            return False

        # Check if any parent is .app
        current = path.resolve()
        while current != current.parent:
            if current.suffix == ".app":
                return True
            current = current.parent

        return False

    @staticmethod
    def validate_write_location(path: Path) -> Tuple[bool, Optional[str]]:
        """Validate that a path is safe to write to.
        
        Args:
            path: Path to validate.
            
        Returns:
            Tuple of (is_safe, error_message).
        """
        if StorageInvariants.is_restricted_location(path):
            return False, f"Cannot write to restricted location: {path}"

        # Check parent is writable
        parent = path.parent
        if not os.access(parent, os.W_OK):
            return False, f"Parent directory is not writable: {parent}"

        return True, None


class PathValidator:
    """Path validation utilities.
    
    Implements Step 6.1.1.3 - Path Validation and Creation.
    """

    @staticmethod
    def validate_path(path: Path, create: bool = True) -> Tuple[bool, Optional[str]]:
        """Validate a path exists and is writable.
        
        Args:
            path: Path to validate.
            create: If True, create directory if missing.
            
        Returns:
            Tuple of (is_valid, error_message).
        """
        try:
            # Create if needed
            if create:
                path.mkdir(parents=True, exist_ok=True)

            # Check exists
            if not path.exists():
                return False, f"Path does not exist: {path}"

            # Check is directory
            if not path.is_dir():
                return False, f"Path is not a directory: {path}"

            # Check writable
            if not os.access(path, os.W_OK):
                return False, f"Path is not writable: {path}"

            return True, None

        except PermissionError as e:
            return False, f"Permission denied: {e}"
        except OSError as e:
            return False, f"OS error: {e}"

    @staticmethod
    def ensure_path(path: Path) -> Path:
        """Ensure path exists, creating if necessary.
        
        Args:
            path: Path to ensure exists.
            
        Returns:
            Path object (guaranteed to exist).
            
        Raises:
            PermissionError: If cannot create.
            OSError: If creation fails.
        """
        path.mkdir(parents=True, exist_ok=True)

        # Validate after creation
        is_valid, error = PathValidator.validate_path(path, create=False)
        if not is_valid:
            raise OSError(f"Failed to create or validate path: {error}")

        return path


class PathMigration:
    """Handle path migrations when app structure changes.
    
    Implements Step 6.1.4 - Path Migration Support.
    """

    @staticmethod
    def detect_migration_needed() -> bool:
        """Detect if path migration is needed.
        
        Returns:
            True if migration is needed.
        """
        # Check for old path structure
        old_paths = PathMigration.get_old_paths()

        for old_path in old_paths:
            if old_path.exists():
                # Check if new path doesn't have data
                new_path = PathMigration.map_old_to_new(old_path)
                if not new_path.exists() or not any(new_path.iterdir()):
                    return True

        return False

    @staticmethod
    def get_old_paths() -> List[Path]:
        """Get list of old path locations.
        
        Returns:
            List of old path locations that may need migration.
        """
        old_paths = []

        # Check for old structure (example - adjust based on actual old structure)
        if is_macos():
            old_data = Path.home() / "Library" / "Application Support" / "CuePoint" / "data"
            if old_data.exists():
                old_paths.append(old_data)

        if is_windows():
            # Check for old Windows paths if any
            old_appdata = Path(os.environ.get("APPDATA", "")) / "CuePoint" / "data"
            if old_appdata.exists():
                old_paths.append(old_appdata)

        return old_paths

    @staticmethod
    def map_old_to_new(old_path: Path) -> Path:
        """Map old path to new path structure.
        
        Args:
            old_path: Old path location.
            
        Returns:
            New path location.
        """
        # Implementation depends on specific migration
        # For now, map to data_dir
        return AppPaths.data_dir()

    @staticmethod
    def migrate_paths() -> Tuple[bool, Optional[str]]:
        """Migrate paths from old structure to new.
        
        Returns:
            Tuple of (success, error_message).
        """
        try:
            old_paths = PathMigration.get_old_paths()

            for old_path in old_paths:
                if not old_path.exists():
                    continue

                new_path = PathMigration.map_old_to_new(old_path)

                # Create new path
                new_path.mkdir(parents=True, exist_ok=True)

                # Copy files
                for item in old_path.iterdir():
                    dest = new_path / item.name
                    if item.is_dir():
                        shutil.copytree(item, dest, dirs_exist_ok=True)
                    else:
                        shutil.copy2(item, dest)

                # Backup old path (rename with .old suffix)
                backup_path = old_path.with_suffix(old_path.suffix + ".old")
                if backup_path.exists():
                    # If backup already exists, add timestamp
                    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                    backup_path = old_path.with_suffix(old_path.suffix + f".old-{timestamp}")
                old_path.rename(backup_path)

            return True, None

        except Exception as e:
            return False, str(e)


class PathDiagnostics:
    """Collect path diagnostics for support and debugging.
    
    Implements Step 6.1.5 - Path Diagnostics.
    """

    @staticmethod
    def collect_diagnostics() -> Dict[str, Any]:
        """Collect comprehensive path diagnostics.
        
        Returns:
            Dictionary with path information.
        """
        diagnostics = {
            "paths": AppPaths.get_all_paths(),
            "validation": AppPaths.validate_paths(),
            "platform": {
                "system": platform.system(),
                "home": str(Path.home()),
            },
            "disk_space": {},
            "permissions": {},
        }

        # Add disk space information
        for name, path_str in AppPaths.get_all_paths().items():
            path = Path(path_str)
            try:
                stat = shutil.disk_usage(path)
                diagnostics["disk_space"][name] = {
                    "total": stat.total,
                    "used": stat.used,
                    "free": stat.free,
                    "free_gb": stat.free / (1024**3),
                }
            except Exception:
                diagnostics["disk_space"][name] = "unknown"

        # Add permission information
        for name, path_str in AppPaths.get_all_paths().items():
            path = Path(path_str)
            diagnostics["permissions"][name] = {
                "exists": path.exists(),
                "readable": os.access(path, os.R_OK) if path.exists() else False,
                "writable": os.access(path, os.W_OK) if path.exists() else False,
            }

        return diagnostics

    @staticmethod
    def format_diagnostics() -> str:
        """Format diagnostics as human-readable string.
        
        Returns:
            Formatted diagnostic string.
        """
        diag = PathDiagnostics.collect_diagnostics()

        lines = ["Path Diagnostics", "=" * 60]

        lines.append("\nPaths:")
        for name, path in diag["paths"].items():
            lines.append(f"  {name}: {path}")

        lines.append("\nValidation:")
        for name, valid in diag["validation"].items():
            status = "✓" if valid else "✗"
            lines.append(f"  {name}: {status}")

        lines.append("\nDisk Space:")
        for name, space in diag["disk_space"].items():
            if isinstance(space, dict):
                free_gb = space.get("free_gb", 0)
                lines.append(f"  {name}: {free_gb:.2f} GB free")

        return "\n".join(lines)
