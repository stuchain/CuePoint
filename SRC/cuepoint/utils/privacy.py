#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Privacy utilities (Step 8.4).

CuePoint v1.0 is privacy-first:
- No telemetry by default
- Local processing only
- User control to clear cache/logs/config
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from cuepoint.utils.paths import AppPaths


@dataclass(frozen=True)
class DataCollectionPoint:
    name: str
    purpose: str
    data_type: str
    storage_location: str
    retention_period: str
    user_control: bool


class PrivacyAuditor:
    """Inventory what CuePoint stores locally (transparency)."""

    @staticmethod
    def audit_data_collection() -> List[DataCollectionPoint]:
        return [
            DataCollectionPoint(
                name="Configuration",
                purpose="Application settings and preferences",
                data_type="User preferences",
                storage_location=str(AppPaths.config_dir()),
                retention_period="Until user changes or resets",
                user_control=True,
            ),
            DataCollectionPoint(
                name="Cache",
                purpose="Performance optimization (cached web responses, derived data)",
                data_type="Cached Beatport/search data",
                storage_location=str(AppPaths.cache_dir()),
                retention_period="Until cleared, expired, or size-limited",
                user_control=True,
            ),
            DataCollectionPoint(
                name="Logs",
                purpose="Debugging and support (sanitized)",
                data_type="Application logs",
                storage_location=str(AppPaths.logs_dir()),
                retention_period="Rotated (limited number of files)",
                user_control=True,
            ),
            DataCollectionPoint(
                name="Exports",
                purpose="User-requested exports",
                data_type="User-exported CSV/Excel/JSON files",
                storage_location="User-specified (default exports directory)",
                retention_period="User-controlled",
                user_control=True,
            ),
        ]


class DataRetentionManager:
    """Enforce basic retention policies (best-effort)."""

    @staticmethod
    def enforce_cache_retention(cache_dir: Optional[Path] = None, max_size_mb: int = 100) -> None:
        cache_dir = cache_dir or AppPaths.cache_dir()
        if not cache_dir.exists():
            return

        max_bytes = max_size_mb * 1024 * 1024
        files = [p for p in cache_dir.rglob("*") if p.is_file()]
        total = sum(p.stat().st_size for p in files)
        if total <= max_bytes:
            return

        # Delete oldest files first
        files_sorted = sorted(files, key=lambda p: p.stat().st_mtime)
        for p in files_sorted:
            if total <= max_bytes:
                break
            try:
                size = p.stat().st_size
                p.unlink()
                total -= size
            except Exception:
                # Best-effort; continue
                pass

    @staticmethod
    def enforce_log_retention(logs_dir: Optional[Path] = None, max_files: int = 5) -> None:
        logs_dir = logs_dir or AppPaths.logs_dir()
        if not logs_dir.exists():
            return

        log_files = sorted(
            [p for p in logs_dir.rglob("*.log") if p.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for old in log_files[max_files:]:
            try:
                old.unlink()
            except Exception:
                pass


class DataDeletionManager:
    """User-controlled data deletion helpers."""

    @staticmethod
    def clear_cache(cache_dir: Optional[Path] = None) -> None:
        cache_dir = cache_dir or AppPaths.cache_dir()
        if cache_dir.exists():
            shutil.rmtree(cache_dir, ignore_errors=True)
        cache_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def clear_logs(logs_dir: Optional[Path] = None) -> None:
        logs_dir = logs_dir or AppPaths.logs_dir()
        if logs_dir.exists():
            # Remove all log files + crash logs (if present)
            for p in logs_dir.rglob("*"):
                try:
                    if p.is_file():
                        p.unlink()
                except Exception:
                    pass
        logs_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def clear_config(config_dir: Optional[Path] = None) -> None:
        config_dir = config_dir or AppPaths.config_dir()
        if config_dir.exists():
            shutil.rmtree(config_dir, ignore_errors=True)
        config_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def clear_all() -> None:
        DataDeletionManager.clear_cache()
        DataDeletionManager.clear_logs()
        DataDeletionManager.clear_config()


