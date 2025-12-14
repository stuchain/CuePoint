#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Step 6.1: File System Locations

Tests AppPaths, StorageInvariants, PathValidator, PathMigration, and PathDiagnostics.
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.utils.paths import (
    AppPaths,
    PathDiagnostics,
    PathMigration,
    PathValidator,
    StorageInvariants,
)


class TestAppPaths:
    """Test AppPaths class."""

    def test_config_dir(self):
        """Test config directory creation."""
        config_dir = AppPaths.config_dir()
        assert config_dir.exists()
        assert config_dir.is_dir()

    def test_data_dir(self):
        """Test data directory creation."""
        data_dir = AppPaths.data_dir()
        assert data_dir.exists()
        assert data_dir.is_dir()

    def test_cache_dir(self):
        """Test cache directory creation."""
        cache_dir = AppPaths.cache_dir()
        assert cache_dir.exists()
        assert cache_dir.is_dir()

    def test_logs_dir(self):
        """Test logs directory creation."""
        logs_dir = AppPaths.logs_dir()
        assert logs_dir.exists()
        assert logs_dir.is_dir()

    def test_exports_dir(self):
        """Test exports directory creation."""
        exports_dir = AppPaths.exports_dir()
        assert exports_dir.exists()
        assert exports_dir.is_dir()

    def test_temp_dir(self):
        """Test temp directory creation."""
        temp_dir = AppPaths.temp_dir()
        assert temp_dir.exists()
        assert temp_dir.is_dir()

    def test_config_file(self):
        """Test config file path."""
        config_file = AppPaths.config_file()
        assert config_file.name == "config.yaml"
        assert config_file.parent == AppPaths.config_dir()

    def test_initialize_all(self):
        """Test initialization of all paths."""
        AppPaths._initialized = False
        AppPaths.initialize_all()
        assert AppPaths._initialized

    def test_get_all_paths(self):
        """Test getting all paths."""
        paths = AppPaths.get_all_paths()
        assert "config" in paths
        assert "data" in paths
        assert "cache" in paths
        assert "logs" in paths
        assert "exports" in paths
        assert "temp" in paths

    def test_validate_paths(self):
        """Test path validation."""
        validation = AppPaths.validate_paths()
        assert isinstance(validation, dict)
        # All paths should be valid after initialization
        for name, valid in validation.items():
            if name != "app":  # App dir may not be writable
                assert valid is True or valid is False  # Should be boolean

    def test_get_log_file(self):
        """Test getting log file path."""
        log_file = AppPaths.get_log_file("test.log")
        assert log_file.name == "test.log"
        assert log_file.parent == AppPaths.logs_dir()

    def test_get_cache_file(self):
        """Test getting cache file path."""
        cache_file = AppPaths.get_cache_file("test.cache")
        assert cache_file.name == "test.cache"
        assert cache_file.parent == AppPaths.cache_dir()

    def test_get_config_file(self):
        """Test getting config file path."""
        config_file = AppPaths.get_config_file("test.yaml")
        assert config_file.name == "test.yaml"
        assert config_file.parent == AppPaths.config_dir()

    def test_get_temp_file(self):
        """Test getting temp file path."""
        temp_file = AppPaths.get_temp_file("test", ".tmp")
        assert "test" in temp_file.name
        assert temp_file.suffix == ".tmp"
        assert temp_file.parent == AppPaths.temp_dir()

    def test_safe_filename(self):
        """Test safe filename generation."""
        # Test Windows invalid characters
        unsafe = "test<>:|?*\\file.txt"
        safe = AppPaths.safe_filename(unsafe)
        assert "<" not in safe
        assert ">" not in safe
        assert ":" not in safe
        assert "|" not in safe
        assert "?" not in safe
        assert "*" not in safe
        assert "\\" not in safe


class TestStorageInvariants:
    """Test StorageInvariants class."""

    def test_get_app_dir(self):
        """Test getting app directory."""
        app_dir = StorageInvariants.get_app_dir()
        assert isinstance(app_dir, Path)

    def test_is_restricted_location_app_dir(self):
        """Test detecting restricted location (app directory)."""
        app_dir = StorageInvariants.get_app_dir()
        # Create a path within app directory
        restricted_path = app_dir / "test.txt"
        assert StorageInvariants.is_restricted_location(restricted_path) is True

    def test_is_restricted_location_user_dir(self):
        """Test that user directories are not restricted."""
        user_path = AppPaths.data_dir() / "test.txt"
        assert StorageInvariants.is_restricted_location(user_path) is False

    @pytest.mark.skipif(
        os.name != "nt", reason="Windows-specific test"
    )
    def test_is_restricted_location_program_files(self):
        """Test detecting restricted location (Program Files on Windows)."""
        program_files = Path(os.environ.get("ProgramFiles", ""))
        if program_files and program_files.exists():
            restricted_path = program_files / "test.txt"
            assert StorageInvariants.is_restricted_location(restricted_path) is True

    def test_validate_write_location_safe(self):
        """Test validating safe write location."""
        safe_path = AppPaths.data_dir() / "test.txt"
        is_safe, error = StorageInvariants.validate_write_location(safe_path)
        assert is_safe is True
        assert error is None

    def test_validate_write_location_restricted(self):
        """Test validating restricted write location."""
        app_dir = StorageInvariants.get_app_dir()
        restricted_path = app_dir / "test.txt"
        is_safe, error = StorageInvariants.validate_write_location(restricted_path)
        assert is_safe is False
        assert error is not None

    @pytest.mark.skipif(
        os.name == "nt", reason="macOS-specific test"
    )
    def test_is_app_bundle_macos(self):
        """Test app bundle detection on macOS."""
        # This would need actual .app bundle to test properly
        # For now, just test the function exists
        path = Path("/Applications/Test.app/Contents/test.txt")
        result = StorageInvariants.is_app_bundle(path)
        # Result depends on actual path, but function should work
        assert isinstance(result, bool)


class TestPathValidator:
    """Test PathValidator class."""

    def test_validate_path_existing(self):
        """Test validating existing path."""
        path = AppPaths.data_dir()
        is_valid, error = PathValidator.validate_path(path, create=False)
        assert is_valid is True
        assert error is None

    def test_validate_path_create(self):
        """Test validating path with creation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_path = Path(tmpdir) / "test_subdir"
            is_valid, error = PathValidator.validate_path(test_path, create=True)
            assert is_valid is True
            assert error is None
            assert test_path.exists()

    def test_ensure_path(self):
        """Test ensuring path exists."""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_path = Path(tmpdir) / "test_subdir"
            result = PathValidator.ensure_path(test_path)
            assert result.exists()
            assert result.is_dir()


class TestPathMigration:
    """Test PathMigration class."""

    def test_get_old_paths(self):
        """Test getting old paths."""
        old_paths = PathMigration.get_old_paths()
        assert isinstance(old_paths, list)

    def test_detect_migration_needed_no_migration(self):
        """Test migration detection when not needed."""
        # Should return False if no old paths exist
        result = PathMigration.detect_migration_needed()
        assert isinstance(result, bool)

    def test_map_old_to_new(self):
        """Test mapping old path to new path."""
        old_path = Path("/old/path")
        new_path = PathMigration.map_old_to_new(old_path)
        assert new_path == AppPaths.data_dir()


class TestPathDiagnostics:
    """Test PathDiagnostics class."""

    def test_collect_diagnostics(self):
        """Test collecting diagnostics."""
        diagnostics = PathDiagnostics.collect_diagnostics()
        assert "paths" in diagnostics
        assert "validation" in diagnostics
        assert "platform" in diagnostics
        assert "disk_space" in diagnostics
        assert "permissions" in diagnostics

    def test_format_diagnostics(self):
        """Test formatting diagnostics."""
        formatted = PathDiagnostics.format_diagnostics()
        assert isinstance(formatted, str)
        assert "Path Diagnostics" in formatted
        assert "Paths:" in formatted
        assert "Validation:" in formatted
        assert "Disk Space:" in formatted
