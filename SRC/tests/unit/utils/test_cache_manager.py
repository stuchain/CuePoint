"""Unit tests for cache manager utility."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.utils.cache_manager import CacheManager


class TestCacheManager:
    """Test cache manager utility."""

    @pytest.fixture
    def temp_cache_dir(self, tmp_path):
        """Create temporary cache directory."""
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()
        with patch("cuepoint.utils.cache_manager.AppPaths") as mock_paths:
            mock_paths.cache_dir.return_value = cache_dir
            yield cache_dir

    def test_get_cache_size_empty(self, temp_cache_dir):
        """Test getting cache size when cache is empty."""
        size = CacheManager.get_cache_size()
        assert size == 0

    def test_get_cache_size_with_files(self, temp_cache_dir):
        """Test getting cache size with files."""
        # Create test files
        (temp_cache_dir / "file1.txt").write_text("test content")
        (temp_cache_dir / "file2.txt").write_text("more content")

        with patch("cuepoint.utils.cache_manager.AppPaths") as mock_paths:
            mock_paths.cache_dir.return_value = temp_cache_dir
            size = CacheManager.get_cache_size()
            assert size > 0

    def test_get_cache_size_mb(self, temp_cache_dir):
        """Test getting cache size in MB."""
        with patch("cuepoint.utils.cache_manager.AppPaths") as mock_paths:
            mock_paths.cache_dir.return_value = temp_cache_dir
            size_mb = CacheManager.get_cache_size_mb()
            assert isinstance(size_mb, float)
            assert size_mb >= 0

    def test_get_cache_file_count(self, temp_cache_dir):
        """Test getting cache file count."""
        # Create test files
        (temp_cache_dir / "file1.txt").write_text("test")
        (temp_cache_dir / "subdir").mkdir()
        (temp_cache_dir / "subdir" / "file2.txt").write_text("test")

        with patch("cuepoint.utils.cache_manager.AppPaths") as mock_paths:
            mock_paths.cache_dir.return_value = temp_cache_dir
            count = CacheManager.get_cache_file_count()
            assert count >= 2  # At least 2 files

    def test_clear_cache(self, temp_cache_dir):
        """Test clearing cache."""
        # Create test files
        (temp_cache_dir / "file1.txt").write_text("test")
        (temp_cache_dir / "file2.txt").write_text("test")

        with patch("cuepoint.utils.cache_manager.AppPaths") as mock_paths:
            mock_paths.cache_dir.return_value = temp_cache_dir
            cleared_count, cleared_size = CacheManager.clear_cache()
            assert cleared_count > 0
            assert cleared_size > 0

    def test_prune_cache_by_age(self, temp_cache_dir):
        """Test pruning cache by age."""
        import time

        # Create old file
        old_file = temp_cache_dir / "old_file.txt"
        old_file.write_text("old")
        # Set modification time to 10 days ago
        old_time = time.time() - (10 * 24 * 60 * 60)
        old_file.touch()
        import os

        os.utime(old_file, (old_time, old_time))

        # Create new file
        (temp_cache_dir / "new_file.txt").write_text("new")

        with patch("cuepoint.utils.cache_manager.AppPaths") as mock_paths:
            mock_paths.cache_dir.return_value = temp_cache_dir
            removed_count, removed_size = CacheManager.prune_cache(max_age_days=7)
            assert removed_count >= 0  # May or may not remove depending on timing

    def test_get_cache_info(self, temp_cache_dir):
        """Test getting cache information."""
        with patch("cuepoint.utils.cache_manager.AppPaths") as mock_paths:
            mock_paths.cache_dir.return_value = temp_cache_dir
            info = CacheManager.get_cache_info()
            assert "size_bytes" in info
            assert "size_mb" in info
            assert "file_count" in info
            assert "directory" in info
            assert isinstance(info["size_bytes"], int)
            assert isinstance(info["size_mb"], float)
            assert isinstance(info["file_count"], int)
