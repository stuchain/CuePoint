"""Unit tests for diagnostic collector utility."""

from unittest.mock import MagicMock, patch

import pytest

from cuepoint.utils.diagnostics import DiagnosticCollector


class TestDiagnosticCollector:
    """Test diagnostic collector utility."""

    @patch("cuepoint.utils.diagnostics.get_build_info")
    @patch("cuepoint.utils.diagnostics.AppPaths")
    @patch("cuepoint.utils.diagnostics.PlatformInfo")
    def test_collect_all(self, mock_platform, mock_paths, mock_build_info):
        """Test collecting all diagnostic information."""
        # Mock dependencies
        mock_build_info.return_value = {
            "version": "1.0.0",
            "version_string": "1.0.0",
            "build_number": "123",
            "commit_sha": "abc123",
        }
        mock_platform.return_value.platform = "macos"
        mock_platform.return_value.architecture = "arm64"
        mock_platform.return_value.os_version = "13.0"
        mock_platform.return_value.is_64bit = True
        mock_platform.return_value.is_apple_silicon = True
        mock_paths.app_dir.return_value = "/app"
        mock_paths.get_all_paths.return_value = {"config": "/config"}
        mock_paths.logs_dir.return_value.glob.return_value = []
        mock_paths.config_file.return_value.exists.return_value = False

        diagnostics = DiagnosticCollector.collect_all()

        assert "timestamp" in diagnostics
        assert "application" in diagnostics
        assert "system" in diagnostics
        assert "configuration" in diagnostics
        assert "storage" in diagnostics
        assert "logs" in diagnostics
        assert "errors" in diagnostics
        assert "cache" in diagnostics
        assert "history" in diagnostics

    @patch("cuepoint.utils.diagnostics.get_build_info")
    @patch("cuepoint.utils.diagnostics.AppPaths")
    def test_collect_app_info(self, mock_paths, mock_build_info):
        """Test collecting application information."""
        mock_build_info.return_value = {
            "version": "1.0.0",
            "version_string": "1.0.0",
            "build_number": "123",
        }
        mock_paths.app_dir.return_value = "/app"

        app_info = DiagnosticCollector.collect_app_info()

        assert "version" in app_info
        assert "install_path" in app_info
        assert "python_version" in app_info
        assert app_info["version"] == "1.0.0"

    @patch("cuepoint.utils.diagnostics.PlatformInfo")
    def test_collect_system_info(self, mock_platform):
        """Test collecting system information."""
        mock_platform.return_value.platform = "macos"
        mock_platform.return_value.architecture = "arm64"
        mock_platform.return_value.os_version = "13.0"
        mock_platform.return_value.is_64bit = True
        mock_platform.return_value.is_apple_silicon = True

        system_info = DiagnosticCollector.collect_system_info()

        assert "platform" in system_info
        assert "architecture" in system_info
        assert "os_version" in system_info
        assert system_info["platform"] == "macos"

    @patch("cuepoint.utils.diagnostics.QSettings")
    @patch("cuepoint.utils.diagnostics.AppPaths")
    def test_collect_config_info(self, mock_paths, mock_settings):
        """Test collecting configuration information."""
        mock_settings.return_value.value.return_value = ""
        mock_paths.config_file.return_value.exists.return_value = False

        config_info = DiagnosticCollector.collect_config_info()

        assert "settings" in config_info

    @patch("cuepoint.utils.diagnostics.AppPaths")
    def test_collect_storage_info(self, mock_paths):
        """Test collecting storage information."""
        mock_paths.get_all_paths.return_value = {
            "config": "/config",
            "data": "/data",
        }

        storage_info = DiagnosticCollector.collect_storage_info()

        assert "paths" in storage_info
        assert "status" in storage_info

    @patch("cuepoint.utils.diagnostics.AppPaths")
    def test_collect_log_info(self, mock_paths):
        """Test collecting log information."""
        mock_log_dir = MagicMock()
        mock_log_dir.glob.return_value = []
        mock_paths.logs_dir.return_value = mock_log_dir

        log_info = DiagnosticCollector.collect_log_info()

        assert "log_directory" in log_info
        assert "log_files" in log_info
        assert "log_count" in log_info

    @patch("cuepoint.utils.diagnostics.AppPaths")
    def test_collect_error_info(self, mock_paths):
        """Test collecting error information."""
        mock_log_dir = MagicMock()
        mock_log_dir.glob.return_value = []
        mock_paths.logs_dir.return_value = mock_log_dir

        error_info = DiagnosticCollector.collect_error_info()

        assert isinstance(error_info, list)

    @patch("cuepoint.utils.diagnostics.CacheManager")
    def test_collect_cache_info(self, mock_cache):
        """Test collecting cache information."""
        mock_cache.get_cache_info.return_value = {
            "size_bytes": 1000,
            "size_mb": 0.001,
            "file_count": 5,
        }

        cache_info = DiagnosticCollector.collect_cache_info()

        assert "size_bytes" in cache_info

    @patch("cuepoint.utils.diagnostics.HistoryManager")
    def test_collect_history_info(self, mock_history):
        """Test collecting history information."""
        mock_history.get_history_info.return_value = {
            "file_count": 10,
            "total_size_bytes": 5000,
        }

        history_info = DiagnosticCollector.collect_history_info()

        assert "file_count" in history_info
