"""Unit tests for platform detection utility."""

import platform
import sys
from unittest.mock import patch

import pytest

from cuepoint.utils.platform import (
    PlatformInfo,
    get_architecture,
    get_os_version,
    get_platform,
    get_platform_info,
    get_platform_string,
    is_64bit,
    is_apple_silicon,
    is_linux,
    is_macos,
    is_windows,
)


class TestPlatformDetection:
    """Test platform detection functions."""

    def test_get_platform(self):
        """Test platform detection."""
        platform_name = get_platform()
        assert platform_name in ("macos", "windows", "linux")

    def test_get_architecture(self):
        """Test architecture detection."""
        arch = get_architecture()
        assert arch in ("x64", "arm64", "x86")

    def test_get_os_version(self):
        """Test OS version detection."""
        version = get_os_version()
        assert isinstance(version, str)
        assert len(version) > 0

    def test_is_macos(self):
        """Test macOS detection."""
        result = is_macos()
        assert isinstance(result, bool)
        # Should match actual platform
        if platform.system() == "Darwin":
            assert result is True
        else:
            assert result is False

    def test_is_windows(self):
        """Test Windows detection."""
        result = is_windows()
        assert isinstance(result, bool)
        # Should match actual platform
        if platform.system() == "Windows":
            assert result is True
        else:
            assert result is False

    def test_is_linux(self):
        """Test Linux detection."""
        result = is_linux()
        assert isinstance(result, bool)
        # Should match actual platform
        if platform.system() == "Linux":
            assert result is True
        else:
            assert result is False

    def test_is_64bit(self):
        """Test 64-bit detection."""
        result = is_64bit()
        assert isinstance(result, bool)
        # Should match sys.maxsize
        expected = sys.maxsize > 2**32
        assert result == expected

    def test_is_apple_silicon(self):
        """Test Apple Silicon detection."""
        result = is_apple_silicon()
        assert isinstance(result, bool)
        # Should be True only on macOS ARM64
        if platform.system() == "Darwin" and platform.machine().lower() in ("arm64", "aarch64"):
            assert result is True
        else:
            assert result is False

    def test_get_platform_string(self):
        """Test platform string formatting."""
        platform_str = get_platform_string()
        assert isinstance(platform_str, str)
        assert len(platform_str) > 0

    def test_get_platform_info_singleton(self):
        """Test that platform info is cached (singleton)."""
        info1 = get_platform_info()
        info2 = get_platform_info()
        assert info1 is info2

    def test_platform_info_to_dict(self):
        """Test platform info dictionary conversion."""
        info = get_platform_info()
        info_dict = info.to_dict()
        assert isinstance(info_dict, dict)
        assert "platform" in info_dict
        assert "architecture" in info_dict
        assert "os_version" in info_dict
        assert "is_64bit" in info_dict
        assert "is_apple_silicon" in info_dict
        assert "python_version" in info_dict

    @patch("platform.system", return_value="Darwin")
    @patch("platform.machine", return_value="arm64")
    def test_apple_silicon_detection(self, mock_machine, mock_system):
        """Test Apple Silicon detection with mocked platform."""
        # Reset singleton
        import cuepoint.utils.platform as platform_module
        platform_module._platform_info = None

        assert is_macos() is True
        assert is_apple_silicon() is True

    @patch("platform.system", return_value="Windows")
    @patch("platform.machine", return_value="AMD64")
    def test_windows_detection(self, mock_machine, mock_system):
        """Test Windows detection with mocked platform."""
        # Reset singleton
        import cuepoint.utils.platform as platform_module
        platform_module._platform_info = None

        assert is_windows() is True
        assert is_apple_silicon() is False
