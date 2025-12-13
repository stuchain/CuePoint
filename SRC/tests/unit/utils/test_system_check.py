"""Unit tests for system requirements checker."""

import platform
import sys
from unittest.mock import patch

import pytest

from cuepoint.utils.system_check import SystemRequirements


class TestSystemRequirements:
    """Test system requirements validation."""

    def test_check_platform(self):
        """Test platform check."""
        ok, error = SystemRequirements.check_platform()
        assert isinstance(ok, bool)
        # Should pass on macOS or Windows
        if platform.system() in ("Darwin", "Windows"):
            assert ok is True
            assert error is None

    def test_check_os_version(self):
        """Test OS version check."""
        ok, error = SystemRequirements.check_os_version()
        assert isinstance(ok, bool)
        # Should pass on supported systems
        if platform.system() in ("Darwin", "Windows"):
            assert ok is True

    def test_check_python_version(self):
        """Test Python version check."""
        ok, error = SystemRequirements.check_python_version()
        assert isinstance(ok, bool)
        # Should pass if Python 3.9+
        if sys.version_info >= (3, 9):
            assert ok is True
            assert error is None
        else:
            assert ok is False
            assert error is not None

    def test_check_ram(self):
        """Test RAM check."""
        ok, error = SystemRequirements.check_ram()
        assert isinstance(ok, bool)
        # Should pass if psutil available and RAM sufficient
        # or pass if psutil not available (graceful degradation)

    def test_check_disk_space(self):
        """Test disk space check."""
        ok, error = SystemRequirements.check_disk_space()
        assert isinstance(ok, bool)
        # Should pass if psutil available and disk space sufficient
        # or pass if psutil not available (graceful degradation)

    def test_check_all(self):
        """Test all requirements check."""
        ok, errors = SystemRequirements.check_all()
        assert isinstance(ok, bool)
        assert isinstance(errors, list)
        # Should pass on supported systems with sufficient resources

    def test_get_system_info(self):
        """Test system info retrieval."""
        info = SystemRequirements.get_system_info()
        assert isinstance(info, dict)
        assert "platform" in info
        assert "os_version" in info
        assert "architecture" in info
        assert "python_version" in info

    @patch("cuepoint.utils.system_check.get_platform", return_value="linux")
    def test_unsupported_platform(self, mock_platform):
        """Test unsupported platform detection."""
        ok, error = SystemRequirements.check_platform()
        assert ok is False
        assert error is not None
        assert "Unsupported platform" in error

    @patch("sys.version_info", (3, 8))
    def test_old_python_version(self):
        """Test old Python version detection."""
        ok, error = SystemRequirements.check_python_version()
        assert ok is False
        assert error is not None
        assert "Python" in error
