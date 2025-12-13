#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
System Requirements Validation

Validates system requirements on startup.
Implements Step 1.5 - Supported Platforms.
"""

import platform
import sys
from typing import List, Optional, Tuple

from cuepoint.utils.platform import get_platform, is_macos, is_windows


class SystemRequirements:
    """System requirements configuration and validation."""

    # Minimum requirements
    MIN_MACOS_VERSION = (10, 15)  # macOS 10.15 (Catalina)
    MIN_WINDOWS_VERSION = (10, 0)  # Windows 10
    MIN_RAM_GB = 4
    MIN_DISK_SPACE_GB = 1
    MIN_PYTHON_VERSION = (3, 9)

    @staticmethod
    def check_all() -> Tuple[bool, List[str]]:
        """Check all system requirements.

        Returns:
            Tuple of (meets_requirements, list_of_errors).
        """
        errors: List[str] = []

        # Check platform
        platform_ok, platform_error = SystemRequirements.check_platform()
        if not platform_ok:
            errors.append(platform_error)

        # Check OS version
        os_ok, os_error = SystemRequirements.check_os_version()
        if not os_ok:
            errors.append(os_error)

        # Check RAM (optional - don't fail if psutil not available)
        ram_ok, ram_error = SystemRequirements.check_ram()
        if not ram_ok and ram_error:
            errors.append(ram_error)

        # Check disk space (optional - don't fail if check fails)
        disk_ok, disk_error = SystemRequirements.check_disk_space()
        if not disk_ok and disk_error:
            errors.append(disk_error)

        # Check Python version (only if running from source)
        if not getattr(sys, "frozen", False):
            python_ok, python_error = SystemRequirements.check_python_version()
            if not python_ok:
                errors.append(python_error)

        return len(errors) == 0, errors

    @staticmethod
    def check_platform() -> Tuple[bool, Optional[str]]:
        """Check if platform is supported.

        Returns:
            Tuple of (is_supported, error_message).
        """
        platform_name = get_platform()
        if platform_name not in ("macos", "windows"):
            return False, f"Unsupported platform: {platform_name}. Only macOS and Windows are supported."
        return True, None

    @staticmethod
    def check_os_version() -> Tuple[bool, Optional[str]]:
        """Check OS version meets minimum.

        Returns:
            Tuple of (meets_requirements, error_message).
        """
        if is_macos():
            try:
                version_str = platform.mac_ver()[0]
                version_parts = [int(x) for x in version_str.split(".")[:2]]
                if tuple(version_parts) < SystemRequirements.MIN_MACOS_VERSION:
                    min_version_str = ".".join(map(str, SystemRequirements.MIN_MACOS_VERSION))
                    return False, (
                        f"macOS {min_version_str}+ required, found {version_str}. "
                        f"Please upgrade to macOS {min_version_str} or later."
                    )
            except (ValueError, IndexError) as e:
                # If version detection fails, warn but don't block
                return True, None  # Don't fail on version parse errors

        elif is_windows():
            try:
                # Windows version check
                version = platform.version()
                # Windows 10/11 should have version 10.0+
                # This is a simplified check - full implementation would parse version string
                # For now, we'll assume Windows 10+ if we're on Windows
                pass
            except Exception:
                # If version detection fails, warn but don't block
                pass

        return True, None

    @staticmethod
    def check_ram() -> Tuple[bool, Optional[str]]:
        """Check RAM meets minimum.

        Returns:
            Tuple of (meets_requirements, error_message).
        """
        try:
            import psutil

            ram_gb = psutil.virtual_memory().total / (1024**3)
            if ram_gb < SystemRequirements.MIN_RAM_GB:
                return False, (
                    f"{SystemRequirements.MIN_RAM_GB}GB RAM required, "
                    f"found {ram_gb:.1f}GB. Please upgrade your system."
                )
            return True, None
        except ImportError:
            # psutil not available - skip check, don't fail
            return True, None
        except Exception as e:
            # Other error - skip check, don't fail
            return True, None

    @staticmethod
    def check_disk_space() -> Tuple[bool, Optional[str]]:
        """Check disk space meets minimum.

        Returns:
            Tuple of (meets_requirements, error_message).
        """
        try:
            import psutil

            # Get root disk usage
            disk = psutil.disk_usage("/")
            free_gb = disk.free / (1024**3)
            if free_gb < SystemRequirements.MIN_DISK_SPACE_GB:
                return False, (
                    f"{SystemRequirements.MIN_DISK_SPACE_GB}GB free disk space required, "
                    f"found {free_gb:.1f}GB. Please free up disk space."
                )
            return True, None
        except ImportError:
            # psutil not available - skip check, don't fail
            return True, None
        except Exception as e:
            # Other error (e.g., permission denied) - skip check, don't fail
            return True, None

    @staticmethod
    def check_python_version() -> Tuple[bool, Optional[str]]:
        """Check Python version meets minimum.

        Returns:
            Tuple of (meets_requirements, error_message).
        """
        version = sys.version_info[:2]
        if version < SystemRequirements.MIN_PYTHON_VERSION:
            min_version_str = ".".join(map(str, SystemRequirements.MIN_PYTHON_VERSION))
            version_str = ".".join(map(str, version))
            return False, (
                f"Python {min_version_str}+ required, found {version_str}. "
                f"Please upgrade Python to {min_version_str} or later."
            )
        return True, None

    @staticmethod
    def get_system_info() -> dict:
        """Get system information for diagnostics.

        Returns:
            Dictionary with system information.
        """
        info = {
            "platform": get_platform(),
            "os_version": platform.version() if is_windows() else platform.mac_ver()[0] if is_macos() else "unknown",
            "architecture": platform.machine(),
            "python_version": sys.version,
        }

        # Add RAM and disk info if psutil is available
        try:
            import psutil

            info["ram_gb"] = psutil.virtual_memory().total / (1024**3)
            info["disk_free_gb"] = psutil.disk_usage("/").free / (1024**3)
        except ImportError:
            info["ram_gb"] = "unknown (psutil not available)"
            info["disk_free_gb"] = "unknown (psutil not available)"
        except Exception:
            info["ram_gb"] = "unknown (error checking)"
            info["disk_free_gb"] = "unknown (error checking)"

        return info
