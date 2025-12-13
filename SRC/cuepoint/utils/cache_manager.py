#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Cache Management Utility

Manages application cache with size and age limits.
Implements data retention policies from Step 1.9.
"""

import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict

from cuepoint.utils.paths import AppPaths

logger = logging.getLogger(__name__)


class CacheManager:
    """Manage application cache with size and age limits.

    Provides cache management functionality:
    - Get cache size and file count
    - Clear all cache
    - Prune cache by size and age
    - Get cache information for diagnostics
    """

    DEFAULT_MAX_SIZE_MB = 500
    DEFAULT_MAX_AGE_DAYS = 7

    @staticmethod
    def get_cache_size() -> int:
        """Get total cache size in bytes.

        Returns:
            Total cache size in bytes.
        """
        cache_dir = AppPaths.cache_dir()
        total = 0
        try:
            for file in cache_dir.rglob("*"):
                if file.is_file():
                    total += file.stat().st_size
        except Exception as e:
            logger.warning(f"Error calculating cache size: {e}")
        return total

    @staticmethod
    def get_cache_size_mb() -> float:
        """Get total cache size in MB.

        Returns:
            Total cache size in megabytes.
        """
        return CacheManager.get_cache_size() / (1024 * 1024)

    @staticmethod
    def get_cache_file_count() -> int:
        """Get number of cache files.

        Returns:
            Number of files in cache directory.
        """
        cache_dir = AppPaths.cache_dir()
        try:
            return len(list(cache_dir.rglob("*")))
        except Exception as e:
            logger.warning(f"Error counting cache files: {e}")
            return 0

    @staticmethod
    def clear_cache() -> tuple[int, int]:
        """Clear all cache files.

        Returns:
            Tuple of (cleared_count, cleared_size_bytes).
        """
        cache_dir = AppPaths.cache_dir()
        cleared_count = 0
        cleared_size = 0

        try:
            for item in cache_dir.iterdir():
                try:
                    if item.is_file():
                        size = item.stat().st_size
                        item.unlink()
                        cleared_count += 1
                        cleared_size += size
                    elif item.is_dir():
                        # Calculate size before removal
                        for file in item.rglob("*"):
                            if file.is_file():
                                cleared_size += file.stat().st_size
                        shutil.rmtree(item)
                        cleared_count += 1
                except Exception as e:
                    logger.error(f"Error clearing cache item {item}: {e}")

            logger.info(
                f"Cleared {cleared_count} cache items ({cleared_size / (1024*1024):.1f} MB)"
            )
        except Exception as e:
            logger.error(f"Error clearing cache: {e}")

        return cleared_count, cleared_size

    @staticmethod
    def prune_cache(
        max_size_mb: int = DEFAULT_MAX_SIZE_MB,
        max_age_days: int = DEFAULT_MAX_AGE_DAYS,
    ) -> tuple[int, int]:
        """Prune cache to size and age limits.

        Removes oldest files first until size and age limits are met.

        Args:
            max_size_mb: Maximum cache size in MB.
            max_age_days: Maximum age of cache files in days.

        Returns:
            Tuple of (removed_count, removed_size_bytes).
        """
        cache_dir = AppPaths.cache_dir()
        max_size_bytes = max_size_mb * 1024 * 1024
        max_age = timedelta(days=max_age_days)

        # Get all cache files with metadata
        files = []
        try:
            for file in cache_dir.rglob("*"):
                if file.is_file():
                    stat = file.stat()
                    age = datetime.now() - datetime.fromtimestamp(stat.st_mtime)
                    files.append(
                        {
                            "path": file,
                            "size": stat.st_size,
                            "age": age,
                            "mtime": stat.st_mtime,
                        }
                    )
        except Exception as e:
            logger.error(f"Error scanning cache files: {e}")
            return 0, 0

        # Sort by modification time (oldest first)
        files.sort(key=lambda x: x["mtime"])

        # Calculate current size
        current_size = sum(f["size"] for f in files)

        # Remove old files first
        removed_count = 0
        removed_size = 0

        for file_info in files:
            if current_size <= max_size_bytes and file_info["age"] <= max_age:
                break

            # Remove file
            try:
                file_info["path"].unlink()
                current_size -= file_info["size"]
                removed_count += 1
                removed_size += file_info["size"]
            except Exception as e:
                logger.error(f"Error removing cache file {file_info['path']}: {e}")

        if removed_count > 0:
            logger.info(
                f"Pruned cache: removed {removed_count} files "
                f"({removed_size / (1024*1024):.1f} MB)"
            )

        return removed_count, removed_size

    @staticmethod
    def get_cache_info() -> Dict[str, any]:
        """Get cache information for diagnostics.

        Returns:
            Dictionary with cache information:
            - size_bytes: Total size in bytes
            - size_mb: Total size in MB
            - file_count: Number of files
            - directory: Cache directory path
        """
        return {
            "size_bytes": CacheManager.get_cache_size(),
            "size_mb": CacheManager.get_cache_size_mb(),
            "file_count": CacheManager.get_cache_file_count(),
            "directory": str(AppPaths.cache_dir()),
        }
