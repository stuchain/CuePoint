#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Platform Detection and Utilities

Provides platform detection, architecture detection, and platform-specific utilities.
Implements Step 1.5 - Supported Platforms.
"""

import platform
import sys
from typing import Any, Dict, Literal, Optional

Platform = Literal["macos", "windows", "linux"]
Architecture = Literal["x64", "arm64", "x86"]


class PlatformInfo:
    """Platform information container.

    Singleton class that caches platform information for performance.
    """

    def __init__(self):
        """Initialize platform information."""
        self.platform = self._detect_platform()
        self.architecture = self._detect_architecture()
        self.os_version = self._detect_os_version()
        self.is_64bit = sys.maxsize > 2**32
        self.is_apple_silicon = self._is_apple_silicon()

    def _detect_platform(self) -> Platform:
        """Detect current platform.

        Returns:
            Platform name: "macos", "windows", or "linux".

        Raises:
            RuntimeError: If platform is unsupported.
        """
        system = platform.system().lower()
        if system == "darwin":
            return "macos"
        elif system == "windows":
            return "windows"
        elif system == "linux":
            return "linux"
        else:
            raise RuntimeError(f"Unsupported platform: {system}")

    def _detect_architecture(self) -> Architecture:
        """Detect CPU architecture.

        Returns:
            Architecture: "x64", "arm64", or "x86".
        """
        machine = platform.machine().lower()
        if machine in ("x86_64", "amd64"):
            return "x64"
        elif machine in ("arm64", "aarch64"):
            return "arm64"
        elif machine in ("i386", "i686"):
            return "x86"
        else:
            # Default to x64 for unknown architectures
            return "x64"

    def _detect_os_version(self) -> str:
        """Get OS version string.

        Returns:
            OS version string (platform-specific format).
        """
        if self.platform == "macos":
            return platform.mac_ver()[0]
        elif self.platform == "windows":
            return platform.version()
        elif self.platform == "linux":
            return platform.release()
        return "unknown"

    def _is_apple_silicon(self) -> bool:
        """Check if running on Apple Silicon.

        Returns:
            True if running on Apple Silicon (macOS ARM64).
        """
        return self.platform == "macos" and self.architecture == "arm64"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for diagnostics.

        Returns:
            Dictionary with platform information.
        """
        return {
            "platform": self.platform,
            "architecture": self.architecture,
            "os_version": self.os_version,
            "is_64bit": self.is_64bit,
            "is_apple_silicon": self.is_apple_silicon,
            "python_version": sys.version,
            "python_executable": sys.executable,
        }


# Global platform info instance (singleton)
_platform_info: Optional[PlatformInfo] = None


def get_platform_info() -> PlatformInfo:
    """Get platform information (singleton).

    Returns:
        PlatformInfo instance (cached after first call).
    """
    global _platform_info
    if _platform_info is None:
        _platform_info = PlatformInfo()
    return _platform_info


def get_platform() -> Platform:
    """Get current platform.

    Returns:
        Platform name: "macos", "windows", or "linux".
    """
    return get_platform_info().platform


def get_architecture() -> Architecture:
    """Get current architecture.

    Returns:
        Architecture: "x64", "arm64", or "x86".
    """
    return get_platform_info().architecture


def get_os_version() -> str:
    """Get OS version string.

    Returns:
        OS version string.
    """
    return get_platform_info().os_version


def is_macos() -> bool:
    """Check if running on macOS.

    Returns:
        True if running on macOS.
    """
    return get_platform() == "macos"


def is_windows() -> bool:
    """Check if running on Windows.

    Returns:
        True if running on Windows.
    """
    return get_platform() == "windows"


def is_linux() -> bool:
    """Check if running on Linux.

    Returns:
        True if running on Linux.
    """
    return get_platform() == "linux"


def is_apple_silicon() -> bool:
    """Check if running on Apple Silicon.

    Returns:
        True if running on Apple Silicon (macOS ARM64).
    """
    return get_platform_info().is_apple_silicon


def is_64bit() -> bool:
    """Check if running 64-bit.

    Returns:
        True if running 64-bit Python.
    """
    return get_platform_info().is_64bit


def get_platform_string() -> str:
    """Get platform string for display.

    Returns:
        Human-readable platform string.
    """
    info = get_platform_info()
    if info.is_apple_silicon:
        return f"macOS {info.os_version} (Apple Silicon)"
    return f"{info.platform.title()} {info.os_version} ({info.architecture})"
