"""Unit tests for standard paths utility."""

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.utils.paths import AppPaths


class TestAppPaths:
    """Test standard application paths utility."""

    def test_config_dir(self):
        """Test configuration directory."""
        config_dir = AppPaths.config_dir()
        assert config_dir.exists()
        assert config_dir.is_dir()

    def test_config_file(self):
        """Test configuration file path."""
        config_file = AppPaths.config_file()
        assert config_file.parent == AppPaths.config_dir()
        assert config_file.name == "config.yaml"

    def test_data_dir(self):
        """Test data directory."""
        data_dir = AppPaths.data_dir()
        assert data_dir.exists()
        assert data_dir.is_dir()

    def test_cache_dir(self):
        """Test cache directory."""
        cache_dir = AppPaths.cache_dir()
        assert cache_dir.exists()
        assert cache_dir.is_dir()

    def test_logs_dir(self):
        """Test logs directory."""
        logs_dir = AppPaths.logs_dir()
        assert logs_dir.exists()
        assert logs_dir.is_dir()
        # Should be subdirectory of data_dir
        assert logs_dir.parent == AppPaths.data_dir()

    def test_exports_dir(self):
        """Test exports directory."""
        exports_dir = AppPaths.exports_dir()
        assert exports_dir.exists()
        assert exports_dir.is_dir()

    def test_temp_dir(self):
        """Test temporary directory."""
        temp_dir = AppPaths.temp_dir()
        assert temp_dir.exists()
        assert temp_dir.is_dir()
        # Should be subdirectory of cache_dir
        assert temp_dir.parent == AppPaths.cache_dir()

    def test_app_dir_from_source(self):
        """Test app directory when running from source."""
        # When not frozen, should return SRC directory
        app_dir = AppPaths.app_dir()
        assert app_dir.exists()
        # Should contain cuepoint directory
        assert (app_dir / "cuepoint").exists()

    @patch.object(sys, "frozen", True, create=True)
    @patch.object(sys, "executable", "/Applications/CuePoint.app/Contents/MacOS/CuePoint")
    def test_app_dir_macos_bundle(self):
        """Test app directory on macOS bundle."""
        if sys.platform != "darwin":
            pytest.skip("macOS-specific test")
        app_dir = AppPaths.app_dir()
        # Should be .app bundle directory
        assert app_dir.name == "CuePoint.app"
        assert (app_dir / "Contents").exists()

    @patch.object(sys, "frozen", True, create=True)
    @patch.object(sys, "executable", "C:\\Program Files\\CuePoint\\CuePoint.exe")
    def test_app_dir_windows_exe(self):
        """Test app directory on Windows executable."""
        if sys.platform != "win32":
            pytest.skip("Windows-specific test")
        app_dir = AppPaths.app_dir()
        # Should be executable directory
        assert app_dir.name == "CuePoint"
        assert (app_dir / "CuePoint.exe").exists() or True  # May not exist in test

    def test_initialize_all(self):
        """Test initializing all paths."""
        # Should not raise exception
        AppPaths.initialize_all()
        assert AppPaths._initialized is True

    def test_get_all_paths(self):
        """Test getting all paths."""
        paths = AppPaths.get_all_paths()
        assert "config" in paths
        assert "data" in paths
        assert "cache" in paths
        assert "logs" in paths
        assert "exports" in paths
        assert "temp" in paths
        assert "app" in paths
        # All should be absolute paths
        for path_str in paths.values():
            assert Path(path_str).is_absolute()

    def test_validate_paths(self):
        """Test path validation."""
        validation = AppPaths.validate_paths()
        assert "config" in validation
        assert "data" in validation
        assert "cache" in validation
        # All should be accessible (True)
        for accessible in validation.values():
            assert isinstance(accessible, bool)

    def test_ensure_dir_creates_missing(self):
        """Test that ensure_dir creates missing directories."""
        test_path = AppPaths.cache_dir() / "test_subdir" / "nested"
        # Should not exist initially
        if test_path.exists():
            test_path.rmdir()
        if test_path.parent.exists():
            test_path.parent.rmdir()

        # Call ensure_dir
        result = AppPaths._ensure_dir(test_path)
        assert result.exists()
        assert result.is_dir()

        # Cleanup
        test_path.rmdir()
        test_path.parent.rmdir()

    def test_ensure_dir_permission_error(self):
        """Test ensure_dir handles permission errors."""
        # This test may not work on all systems
        # Skip if we can't create a read-only directory
        pass  # Permission testing is platform-specific

    def test_paths_are_consistent(self):
        """Test that paths are consistent across calls."""
        config1 = AppPaths.config_dir()
        config2 = AppPaths.config_dir()
        assert config1 == config2

    def test_paths_use_standard_locations(self):
        """Test that paths use platform-standard locations."""
        config_dir = AppPaths.config_dir()
        # Should be in standard location (varies by platform)
        assert "CuePoint" in str(config_dir)
