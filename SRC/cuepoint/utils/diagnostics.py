#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Diagnostic Information Collection Utility

Collects comprehensive diagnostic information for support bundles.
Implements diagnostics from Step 1.9.
"""

import os
import platform
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from PySide6.QtCore import QSettings

from cuepoint.utils.cache_manager import CacheManager
from cuepoint.utils.history_manager import HistoryManager
from cuepoint.utils.paths import AppPaths
from cuepoint.utils.platform import PlatformInfo
from cuepoint.version import get_build_info

try:
    import psutil
except ImportError:
    psutil = None


class DiagnosticCollector:
    """Collect comprehensive diagnostic information.

    Provides diagnostic collection functionality:
    - Collect all diagnostic information
    - Collect application information
    - Collect system information
    - Collect configuration information
    - Collect storage information
    - Collect log information
    - Collect error information
    - Collect cache and history information
    """

    @staticmethod
    def collect_all() -> Dict[str, Any]:
        """Collect all diagnostic information.

        Returns:
            Dictionary with all diagnostic information.
        """
        return {
            "timestamp": datetime.now().isoformat(),
            "application": DiagnosticCollector.collect_app_info(),
            "system": DiagnosticCollector.collect_system_info(),
            "configuration": DiagnosticCollector.collect_config_info(),
            "storage": DiagnosticCollector.collect_storage_info(),
            "logs": DiagnosticCollector.collect_log_info(),
            "errors": DiagnosticCollector.collect_error_info(),
            "cache": DiagnosticCollector.collect_cache_info(),
            "history": DiagnosticCollector.collect_history_info(),
        }

    @staticmethod
    def collect_app_info() -> Dict[str, Any]:
        """Collect application information.

        Returns:
            Dictionary with application information.
        """
        build_info = get_build_info()
        return {
            "version": build_info["version"],
            "version_string": build_info.get("version_string"),
            "build_number": build_info.get("build_number"),
            "commit_sha": build_info.get("commit_sha"),
            "short_commit_sha": build_info.get("short_commit_sha"),
            "build_date": build_info.get("build_date"),
            "install_path": str(AppPaths.app_dir()),
            "python_version": sys.version,
            "python_executable": sys.executable,
            "is_frozen": getattr(sys, "frozen", False),
        }

    @staticmethod
    def collect_system_info() -> Dict[str, Any]:
        """Collect system information.

        Returns:
            Dictionary with system information.
        """
        platform_info = PlatformInfo()
        system_info = {
            "platform": platform_info.platform,
            "architecture": platform_info.architecture,
            "os_version": platform_info.os_version,
            "is_64bit": platform_info.is_64bit,
            "is_apple_silicon": platform_info.is_apple_silicon,
        }

        # Add psutil information if available
        if psutil:
            try:
                system_info["cpu_count"] = psutil.cpu_count()
                memory = psutil.virtual_memory()
                system_info["memory"] = {
                    "total_gb": memory.total / (1024**3),
                    "available_gb": memory.available / (1024**3),
                    "percent": memory.percent,
                }
                disk = psutil.disk_usage("/")
                system_info["disk"] = {
                    "total_gb": disk.total / (1024**3),
                    "free_gb": disk.free / (1024**3),
                    "percent": disk.percent,
                }
            except Exception:
                pass  # psutil may fail on some systems

        return system_info

    @staticmethod
    def collect_config_info() -> Dict[str, Any]:
        """Collect configuration information (non-sensitive).

        Returns:
            Dictionary with configuration information.
        """
        settings = QSettings()
        config_file = AppPaths.config_file()

        config = {}

        # Read settings (non-sensitive only)
        config["settings"] = {
            "output_directory": str(settings.value("output_directory", "")),
            "cache_enabled": settings.value("cache_enabled", True, type=bool),
            "auto_update_check": settings.value("auto_update_check", True, type=bool),
        }

        # Read config file if exists
        if config_file.exists():
            try:
                import yaml

                with open(config_file, "r", encoding="utf-8") as f:
                    file_config = yaml.safe_load(f)
                    # Remove sensitive information
                    if isinstance(file_config, dict):
                        file_config.pop("api_keys", None)
                        file_config.pop("secrets", None)
                        file_config.pop("password", None)
                    config["file"] = file_config
            except ImportError:
                config["file_error"] = "yaml module not available"
            except Exception as e:
                config["file_error"] = str(e)

        return config

    @staticmethod
    def collect_storage_info() -> Dict[str, Any]:
        """Collect storage location information.

        Returns:
            Dictionary with storage information.
        """
        paths = AppPaths.get_all_paths()

        # Check path accessibility
        path_status = {}
        for name, path_str in paths.items():
            path = Path(path_str)
            try:
                size_mb = 0
                if path.exists():
                    size_mb = (
                        sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
                        / (1024 * 1024)
                    )

                path_status[name] = {
                    "path": path_str,
                    "exists": path.exists(),
                    "writable": os.access(path if path.exists() else path.parent, os.W_OK),
                    "size_mb": size_mb,
                }
            except Exception as e:
                path_status[name] = {
                    "path": path_str,
                    "exists": False,
                    "writable": False,
                    "error": str(e),
                }

        return {
            "paths": paths,
            "status": path_status,
        }

    @staticmethod
    def collect_log_info() -> Dict[str, Any]:
        """Collect log file information.

        Returns:
            Dictionary with log information.
        """
        logs_dir = AppPaths.logs_dir()
        log_files = list(logs_dir.glob("*.log*"))

        total_size = sum(f.stat().st_size for f in log_files) / (1024 * 1024) if log_files else 0

        return {
            "log_directory": str(logs_dir),
            "log_files": [f.name for f in log_files],
            "latest_log": log_files[-1].name if log_files else None,
            "log_count": len(log_files),
            "total_size_mb": total_size,
            "recent_logs": DiagnosticCollector._get_recent_log_lines(200),
        }

    @staticmethod
    def _get_recent_log_lines(count: int = 200) -> List[str]:
        """Get recent log lines.

        Args:
            count: Number of lines to return.

        Returns:
            List of recent log lines.
        """
        log_file = AppPaths.logs_dir() / "cuepoint.log"
        if not log_file.exists():
            return []

        try:
            lines = log_file.read_text(encoding="utf-8").splitlines()
            return lines[-count:] if len(lines) > count else lines
        except Exception as e:
            return [f"Error reading logs: {e}"]

    @staticmethod
    def collect_error_info() -> List[Dict[str, Any]]:
        """Collect recent error information.

        Returns:
            List of error information dictionaries.
        """
        errors = []

        # Read crash logs
        crash_logs = list(AppPaths.logs_dir().glob("crash-*.log"))
        for crash_log in sorted(crash_logs, key=lambda p: p.stat().st_mtime, reverse=True)[:5]:
            try:
                errors.append(
                    {
                        "type": "crash",
                        "file": crash_log.name,
                        "timestamp": datetime.fromtimestamp(crash_log.stat().st_mtime).isoformat(),
                        "preview": crash_log.read_text(encoding="utf-8")[:500],
                    }
                )
            except Exception:
                pass

        return errors

    @staticmethod
    def collect_cache_info() -> Dict[str, Any]:
        """Collect cache information.

        Returns:
            Dictionary with cache information.
        """
        return CacheManager.get_cache_info()

    @staticmethod
    def collect_history_info() -> Dict[str, Any]:
        """Collect history information.

        Returns:
            Dictionary with history information.
        """
        return HistoryManager.get_history_info()
