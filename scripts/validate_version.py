#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Version Format and Consistency

This script validates that:
1. Version is in DEC-145's scheme: ``X.Y.Z`` or ``X.Y.Z-test.N`` (DIST-01)
2. Version is consistent across files (version.py, git tags, etc.)
3. With ``--tag``, a release tag is ``v`` plus the version in version.py

Usage:
    python scripts/validate_version.py
    python scripts/validate_version.py --tag v1.0.0-test.1

This script is typically called in CI/CD to ensure version consistency.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple


def extract_base_version(version: str) -> str:
    """Extract base version (X.Y.Z) from version string.
    
    Args:
        version: Version string (may include prerelease suffix or build metadata)
        
    Returns:
        Base version string (X.Y.Z)
    """
    # Remove build metadata (everything after +)
    if '+' in version:
        version = version.split('+')[0]
    # Remove prerelease suffix (everything after -)
    if '-' in version:
        version = version.split('-')[0]
    return version


#: ``X.Y.Z`` or ``X.Y.Z-test.N``: no leading zeros (except a lone "0"), ``N`` at least 1 (DEC-145).
_NUMBER = r"(?:0|[1-9]\d*)"
_SCHEME_RE = re.compile(
    rf"^{_NUMBER}\.{_NUMBER}\.{_NUMBER}(?:-test\.[1-9]\d*)?$"
)


def validate_scheme(version: str) -> Tuple[bool, Optional[str]]:
    """Validate a version against DEC-145's scheme: ``X.Y.Z`` or ``X.Y.Z-test.N``.

    Args:
        version: Version string to validate.

    Returns:
        Tuple of (is_valid, error_message).
    """
    if not _SCHEME_RE.fullmatch(version):
        return False, (
            f"Version must be X.Y.Z or X.Y.Z-test.N (numbers without leading zeros, N >= 1), "
            f"got: {version!r}"
        )
    return True, None


def validate_semver(version: str) -> Tuple[bool, Optional[str]]:
    """Validate the version format; the scheme is DEC-145's (see ``validate_scheme``)."""
    return validate_scheme(version)


def check_tag(tag: str) -> List[str]:
    """Every way ``tag`` is not ``v`` plus the version in version.py; empty when it is."""
    file_version = get_version_from_file()
    if not file_version:
        return ["Could not read version from version.py"]
    valid, error_msg = validate_scheme(file_version)
    if not valid:
        return [f"Invalid version format: {error_msg}"]
    if tag != f"v{file_version}":
        return [f"Tag {tag!r} does not match version.py: expected 'v{file_version}'"]
    return []


def get_version_from_file() -> Optional[str]:
    """Get version from version.py.

    Returns:
        Version string, or None if not found.
    """
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    version_file = project_root / "src" / "cuepoint" / "version.py"

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
        Handles pre-release tags by extracting just the version part (e.g., v1.0.0-test -> 1.0.0).
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
            tag = tags[0]
            # Remove 'v' prefix
            version_part = tag[1:]
            # Extract just the version part (X.Y.Z) from tags like "v1.0.0-test-unsigned1"
            # Match SemVer pattern (X.Y.Z) at the start
            match = re.match(r"^(\d+\.\d+\.\d+)", version_part)
            if match:
                return match.group(1)
            # Fallback: return the whole tag without 'v' if no match
            return version_part
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

    # Extract base version for comparison
    file_base_version = extract_base_version(file_version)

    # Validate format
    valid, error_msg = validate_scheme(file_version)
    if not valid:
        errors.append(f"Invalid version format: {error_msg}")
        return False, errors

    # Check against git tag (if exists)
    # Compare base versions since git tag might have different prerelease suffix
    git_version = get_version_from_git_tag()
    if git_version:
        git_base_version = extract_base_version(git_version)
        if git_base_version != file_base_version:
            errors.append(
                f"Version mismatch: version.py has {file_version} (base: {file_base_version}), "
                f"latest git tag is v{git_version} (base: {git_base_version})"
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


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "--tag",
        help="a release tag to check against version.py (skips the latest-git-tag comparison)",
    )
    args = parser.parse_args(argv)

    if args.tag is not None:
        errors = check_tag(args.tag)
        if errors:
            print("Version validation failed:")
            for error in errors:
                print(f"  ERROR: {error}")
            return 1
        print(f"[OK] Tag {args.tag} matches version.py: {get_version_from_file()}")
        return 0

    valid, errors = check_version_consistency()
    if not valid:
        print("Version validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        return 1
    print(f"[OK] Version validation passed: {get_version_from_file()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
