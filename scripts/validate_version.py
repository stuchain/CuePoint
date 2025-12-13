#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Version Format and Consistency

This script validates that:
1. Version follows SemVer format (X.Y.Z)
2. Version is consistent across files (version.py, git tags, etc.)

Usage:
    python scripts/validate_version.py

This script is typically called in CI/CD to ensure version consistency.
"""

import re
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple


def validate_semver(version: str) -> Tuple[bool, Optional[str]]:
    """Validate SemVer format.

    Args:
        version: Version string to validate.

    Returns:
        Tuple of (is_valid, error_message).
    """
    pattern = r"^\d+\.\d+\.\d+$"
    if not re.match(pattern, version):
        return False, f"Version must be SemVer format (X.Y.Z), got: {version}"

    # Check version components are reasonable
    parts = version.split(".")
    major, minor, patch = map(int, parts)

    if major > 100:
        return False, f"Major version seems too high: {major}"
    if minor > 100:
        return False, f"Minor version seems too high: {minor}"
    if patch > 1000:
        return False, f"Patch version seems too high: {patch}"

    return True, None


def get_version_from_file() -> Optional[str]:
    """Get version from version.py.

    Returns:
        Version string, or None if not found.
    """
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    version_file = project_root / "SRC" / "cuepoint" / "version.py"

    if not version_file.exists():
        return None

    content = version_file.read_text()
    match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
    if match:
        return match.group(1)
    return None


def get_version_from_git_tag() -> Optional[str]:
    """Get latest version from git tags.

    Returns:
        Latest version string (without 'v' prefix), or None if no tags found.
    """
    try:
        result = subprocess.run(
            ["git", "tag", "--list", "v*", "--sort=-version:refname"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        tags = result.stdout.strip().split("\n")
        if tags and tags[0]:
            # Remove 'v' prefix
            return tags[0][1:]
        return None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return None


def check_version_consistency() -> Tuple[bool, List[str]]:
    """Check version is consistent across files.

    Returns:
        Tuple of (is_consistent, list_of_errors).
    """
    errors: List[str] = []

    # Get version from version.py
    file_version = get_version_from_file()
    if not file_version:
        errors.append("Could not read version from version.py")
        return False, errors

    # Validate format
    valid, error_msg = validate_semver(file_version)
    if not valid:
        errors.append(f"Invalid version format: {error_msg}")
        return False, errors

    # Check against git tag (if exists)
    git_version = get_version_from_git_tag()
    if git_version and git_version != file_version:
        errors.append(
            f"Version mismatch: version.py has {file_version}, "
            f"latest git tag is v{git_version}"
        )

    # Check pyproject.toml if exists
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    pyproject = project_root / "pyproject.toml"
    if pyproject.exists():
        content = pyproject.read_text()
        match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
        if match:
            toml_version = match.group(1)
            if toml_version != file_version:
                errors.append(
                    f"Version mismatch: version.py has {file_version}, "
                    f"pyproject.toml has {toml_version}"
                )

    return len(errors) == 0, errors


if __name__ == "__main__":
    valid, errors = check_version_consistency()
    if not valid:
        print("Version validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    else:
        version = get_version_from_file()
        print(f"✓ Version validation passed: {version}")
