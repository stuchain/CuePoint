#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
History File Management Utility

Manages past search history files with retention policies.
Implements data retention from Step 1.9.
"""

import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List

from cuepoint.utils.paths import AppPaths

logger = logging.getLogger(__name__)


class HistoryManager:
    """Manage past search history files.

    Provides history management functionality:
    - Get recent history files
    - Get history information
    - Clean up old history files (user-controlled)
    """

    DEFAULT_MAX_FILES = 50
    DEFAULT_MAX_AGE_DAYS = 90

    @staticmethod
    def get_recent_files(
        max_files: int = DEFAULT_MAX_FILES,
        max_days: int = DEFAULT_MAX_AGE_DAYS,
    ) -> List[Path]:
        """Get recent CSV export files.

        Args:
            max_files: Maximum number of files to return.
            max_days: Maximum age of files in days.

        Returns:
            List of Path objects for recent files (newest first).
        """
        exports_dir = AppPaths.exports_dir()
        cutoff_date = datetime.now() - timedelta(days=max_days)

        files = []
        try:
            for file in exports_dir.glob("*.csv"):
                try:
                    mtime = datetime.fromtimestamp(file.stat().st_mtime)
                    if mtime > cutoff_date:
                        files.append(
                            {
                                "path": file,
                                "mtime": mtime,
                                "size": file.stat().st_size,
                            }
                        )
                except Exception as e:
                    logger.warning(f"Error reading file {file}: {e}")

            # Sort by modification time (newest first)
            files.sort(key=lambda x: x["mtime"], reverse=True)

            # Return up to max_files
            return [f["path"] for f in files[:max_files]]
        except Exception as e:
            logger.error(f"Error getting recent files: {e}")
            return []

    @staticmethod
    def get_history_info() -> Dict[str, any]:
        """Get history information.

        Returns:
            Dictionary with history information:
            - file_count: Number of recent files
            - total_size_bytes: Total size in bytes
            - total_size_mb: Total size in MB
            - directory: Exports directory path
        """
        recent_files = HistoryManager.get_recent_files()
        total_size = sum(f.stat().st_size for f in recent_files)

        return {
            "file_count": len(recent_files),
            "total_size_bytes": total_size,
            "total_size_mb": total_size / (1024 * 1024),
            "directory": str(AppPaths.exports_dir()),
        }

    @staticmethod
    def cleanup_old_files(max_days: int = DEFAULT_MAX_AGE_DAYS, dry_run: bool = False) -> int:
        """Clean up old history files (user-controlled).

        Args:
            max_days: Maximum age of files in days.
            dry_run: If True, don't actually delete files.

        Returns:
            Number of files that would be/were removed.
        """
        exports_dir = AppPaths.exports_dir()
        cutoff_date = datetime.now() - timedelta(days=max_days)

        removed_count = 0
        try:
            for file in exports_dir.glob("*.csv"):
                try:
                    mtime = datetime.fromtimestamp(file.stat().st_mtime)
                    if mtime < cutoff_date:
                        if not dry_run:
                            file.unlink()
                        removed_count += 1
                except Exception as e:
                    logger.error(f"Error cleaning up file {file}: {e}")

            if removed_count > 0:
                action = "Would remove" if dry_run else "Removed"
                logger.info(f"{action} {removed_count} old history files")
        except Exception as e:
            logger.error(f"Error cleaning up old files: {e}")

        return removed_count
