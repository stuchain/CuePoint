#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Version comparison utilities for the update system.

Provides semantic versioning comparison functions.
"""

import re
from typing import List, Optional, Tuple


def parse_version(version_string: str) -> Tuple[int, int, int, Optional[str]]:
    """
    Parse a semantic version string into components.
    
    Supports formats:
    - "1.0.0" -> (1, 0, 0, None)
    - "1.0.0-beta.1" -> (1, 0, 0, "beta.1")
    - "1.0.0+build.123" -> (1, 0, 0, None)  # build metadata ignored
    
    Args:
        version_string: Version string in SemVer format
        
    Returns:
        Tuple of (major, minor, patch, prerelease)
        
    Raises:
        ValueError: If version string is invalid
    """
    # Remove build metadata (everything after +)
    version_string = version_string.split('+')[0]
    
    # Match semantic version pattern
    pattern = r'^(\d+)\.(\d+)\.(\d+)(?:-([\w\.-]+))?$'
    match = re.match(pattern, version_string)
    
    if not match:
        raise ValueError(f"Invalid version format: {version_string}")
    
    major = int(match.group(1))
    minor = int(match.group(2))
    patch = int(match.group(3))
    prerelease = match.group(4) if match.group(4) else None
    
    return (major, minor, patch, prerelease)


def compare_versions(version1: str, version2: str) -> int:
    """
    Compare two semantic versions.
    
    Args:
        version1: First version string
        version2: Second version string
        
    Returns:
        -1 if version1 < version2
         0 if version1 == version2
         1 if version1 > version2
         
    Raises:
        ValueError: If either version string is invalid
    """
    v1_major, v1_minor, v1_patch, v1_prerelease = parse_version(version1)
    v2_major, v2_minor, v2_patch, v2_prerelease = parse_version(version2)
    
    # Compare major version
    if v1_major < v2_major:
        return -1
    elif v1_major > v2_major:
        return 1
    
    # Compare minor version
    if v1_minor < v2_minor:
        return -1
    elif v1_minor > v2_minor:
        return 1
    
    # Compare patch version
    if v1_patch < v2_patch:
        return -1
    elif v1_patch > v2_patch:
        return 1
    
    # Compare prerelease versions
    # A version with a prerelease is considered less than the same version without
    if v1_prerelease is None and v2_prerelease is None:
        return 0
    elif v1_prerelease is None:
        return 1  # version1 is stable, version2 is prerelease
    elif v2_prerelease is None:
        return -1  # version1 is prerelease, version2 is stable
    else:
        # Both are prerelease - compare lexicographically
        if v1_prerelease < v2_prerelease:
            return -1
        elif v1_prerelease > v2_prerelease:
            return 1
        else:
            return 0


def is_newer_version(new_version: str, current_version: str) -> bool:
    """
    Check if new_version is newer than current_version.
    
    Args:
        new_version: Version to check
        current_version: Current version
        
    Returns:
        True if new_version is newer, False otherwise
    """
    return compare_versions(new_version, current_version) > 0


def is_stable_version(version: str) -> bool:
    """
    Check if a version is stable (not a prerelease).
    
    Args:
        version: Version string to check
        
    Returns:
        True if version is stable, False if it's a prerelease
    """
    try:
        _, _, _, prerelease = parse_version(version)
        return prerelease is None
    except ValueError:
        return False


def get_version_display_string(version: str) -> str:
    """
    Get a formatted version string for display.
    
    Args:
        version: Version string
        
    Returns:
        Formatted version string (e.g., "Version 1.0.0" or "Version 1.0.0-beta.1")
    """
    try:
        major, minor, patch, prerelease = parse_version(version)
        version_str = f"{major}.{minor}.{patch}"
        if prerelease:
            version_str += f"-{prerelease}"
        return f"Version {version_str}"
    except ValueError:
        return f"Version {version}"
