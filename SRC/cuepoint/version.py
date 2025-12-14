#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Version Information for CuePoint

This module serves as the single source of truth for version information.
Version follows Semantic Versioning (SemVer): MAJOR.MINOR.PATCH

Build identifiers (build_number, commit_sha, build_date) are set during
the build process by scripts/set_build_info.py.
"""

import sys
from typing import Any, Dict, Optional

# Version follows Semantic Versioning (SemVer): MAJOR.MINOR.PATCH
__version__ = "1.0.0"

# Build identifier (set by CI or build script)
__build_number__: Optional[str] = "202512131853"  # Will be set during build
__commit_sha__: Optional[str] = "ff6a327fed6a36b037d8c506f2a435834af91d6c"  # Will be set during build
__build_date__: Optional[str] = "2025-12-13T18:53:36.193417"  # Will be set during build


def get_version() -> str:
    """Get version string (MAJOR.MINOR.PATCH).

    Returns:
        Version string in SemVer format.
    """
    return __version__


def get_version_string() -> str:
    """Get full version string with build number if available.

    Returns:
        Version string, optionally with build number appended.
    """
    version = __version__
    if __build_number__:
        version += f".{__build_number__}"
    return version


def get_build_number() -> Optional[str]:
    """Get build number.

    Returns:
        Build number string, or None if not set.
    """
    return __build_number__


def get_commit_sha() -> Optional[str]:
    """Get commit SHA.

    Returns:
        Full commit SHA, or None if not set.
    """
    return __commit_sha__


def get_short_commit_sha() -> Optional[str]:
    """Get short commit SHA (8 characters).

    Returns:
        Short commit SHA (first 8 characters), or None if not set.
    """
    if __commit_sha__:
        return __commit_sha__[:8]
    return None


def get_build_date() -> Optional[str]:
    """Get build date.

    Returns:
        Build date in ISO format, or None if not set.
    """
    return __build_date__


def get_build_info() -> Dict[str, Any]:
    """Get complete build information for diagnostics.

    Returns:
        Dictionary containing all version and build information.
    """
    return {
        "version": __version__,
        "version_string": get_version_string(),
        "build_number": __build_number__,
        "commit_sha": __commit_sha__,
        "short_commit_sha": get_short_commit_sha(),
        "build_date": __build_date__,
        "python_version": sys.version,
        "python_executable": sys.executable,
    }


def is_dev_build() -> bool:
    """Check if this is a development build.

    A development build is one where build identifiers are not set.

    Returns:
        True if this is a development build, False otherwise.
    """
    return __build_number__ is None or __commit_sha__ is None


def get_version_display_string() -> str:
    """Get formatted version string for display.

    Returns:
        Formatted version string suitable for display in UI.
    """
    version_str = f"Version {__version__}"
    if __build_number__:
        version_str += f" (Build {__build_number__})"
    if __commit_sha__:
        version_str += f" - {get_short_commit_sha()}"
    return version_str
