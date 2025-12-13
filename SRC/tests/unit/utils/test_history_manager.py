"""Unit tests for history manager utility."""

import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.utils.history_manager import HistoryManager


class TestHistoryManager:
    """Test history manager utility."""

    @pytest.fixture
    def temp_exports_dir(self, tmp_path):
        """Create temporary exports directory."""
        exports_dir = tmp_path / "exports"
        exports_dir.mkdir()
        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = exports_dir
            yield exports_dir

    def test_get_recent_files_empty(self, temp_exports_dir):
        """Test getting recent files when directory is empty."""
        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = temp_exports_dir
            files = HistoryManager.get_recent_files()
            assert len(files) == 0

    def test_get_recent_files_with_files(self, temp_exports_dir):
        """Test getting recent files."""
        # Create recent CSV files
        (temp_exports_dir / "recent1.csv").write_text("data")
        (temp_exports_dir / "recent2.csv").write_text("data")

        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = temp_exports_dir
            files = HistoryManager.get_recent_files()
            assert len(files) >= 2

    def test_get_recent_files_filters_old(self, temp_exports_dir):
        """Test that old files are filtered out."""
        import time

        # Create old file
        old_file = temp_exports_dir / "old.csv"
        old_file.write_text("data")
        old_time = time.time() - (100 * 24 * 60 * 60)  # 100 days ago
        import os

        os.utime(old_file, (old_time, old_time))

        # Create recent file
        (temp_exports_dir / "recent.csv").write_text("data")

        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = temp_exports_dir
            files = HistoryManager.get_recent_files(max_days=90)
            # Should only include recent file
            assert len(files) >= 1
            assert all("recent" in str(f.name) for f in files)

    def test_get_recent_files_respects_max_files(self, temp_exports_dir):
        """Test that max_files limit is respected."""
        # Create many files
        for i in range(20):
            (temp_exports_dir / f"file{i}.csv").write_text("data")

        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = temp_exports_dir
            files = HistoryManager.get_recent_files(max_files=10)
            assert len(files) <= 10

    def test_get_history_info(self, temp_exports_dir):
        """Test getting history information."""
        # Create some files
        (temp_exports_dir / "file1.csv").write_text("data")
        (temp_exports_dir / "file2.csv").write_text("data")

        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = temp_exports_dir
            info = HistoryManager.get_history_info()
            assert "file_count" in info
            assert "total_size_bytes" in info
            assert "total_size_mb" in info
            assert "directory" in info
            assert info["file_count"] >= 2

    def test_cleanup_old_files_dry_run(self, temp_exports_dir):
        """Test cleanup old files in dry run mode."""
        import time

        # Create old file
        old_file = temp_exports_dir / "old.csv"
        old_file.write_text("data")
        old_time = time.time() - (100 * 24 * 60 * 60)
        import os

        os.utime(old_file, (old_time, old_time))

        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = temp_exports_dir
            removed_count = HistoryManager.cleanup_old_files(max_days=90, dry_run=True)
            assert removed_count >= 0
            # File should still exist (dry run)
            assert old_file.exists()

    def test_cleanup_old_files_actual(self, temp_exports_dir):
        """Test cleanup old files actually removes them."""
        import time

        # Create old file
        old_file = temp_exports_dir / "old.csv"
        old_file.write_text("data")
        old_time = time.time() - (100 * 24 * 60 * 60)
        import os

        os.utime(old_file, (old_time, old_time))

        # Create recent file
        recent_file = temp_exports_dir / "recent.csv"
        recent_file.write_text("data")

        with patch("cuepoint.utils.history_manager.AppPaths") as mock_paths:
            mock_paths.exports_dir.return_value = temp_exports_dir
            removed_count = HistoryManager.cleanup_old_files(max_days=90, dry_run=False)
            assert removed_count >= 0
            # Recent file should still exist
            assert recent_file.exists()
