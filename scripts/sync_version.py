#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Sync Version from Git Tag to version.py

This script can:
1. Extract version from latest git tag and update version.py
2. Extract version from a specific git tag and update version.py
3. Validate that version.py matches a git tag

Usage:
    # Sync from latest git tag
    python scripts/sync_version.py
    
    # Sync from specific tag
    python scripts/sync_version.py --tag v1.0.1
    
    # Just validate (don't update)
    python scripts/sync_version.py --validate-only
"""

import argparse
import re
import subprocess
import sys
import io
from pathlib import Path
from typing import Optional


def get_version_from_git_tag(tag: Optional[str] = None) -> Optional[str]:
    """Get version from git tag.
    
    Args:
        tag: Specific tag to use, or None for latest tag
        
    Returns:
        Version string (without 'v' prefix), or None if not found.
        Extracts just the SemVer part (X.Y.Z) from tags like "v1.0.1-test-unsigned47"
    """
    try:
        if tag:
            # Get specific tag
            result = subprocess.run(
                ["git", "tag", "--list", tag],
                capture_output=True,
                text=True,
                check=True,
                timeout=10,
            )
            if not result.stdout.strip():
                print(f"Error: Tag {tag} not found")
                return None
            tag_name = tag
        else:
            # Get latest tag
            result = subprocess.run(
                ["git", "tag", "--list", "v*", "--sort=-version:refname"],
                capture_output=True,
                text=True,
                check=True,
                timeout=10,
            )
            tags = result.stdout.strip().split("\n")
            if not tags or not tags[0]:
                print("Error: No version tags found (tags starting with 'v')")
                return None
            tag_name = tags[0]
        
        # Remove 'v' prefix
        version_part = tag_name[1:] if tag_name.startswith('v') else tag_name
        
        # Return the full version including prerelease suffixes (e.g., "1.0.0-test2", "1.0.1-test-unsigned47")
        # This preserves the complete version string from the Git tag
        return version_part
        
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
        print(f"Error getting version from git tag: {e}")
        return None


def get_version_from_file() -> Optional[str]:
    """Get version from version.py.
    
    Returns:
        Version string, or None if not found.
    """
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    version_file = project_root / "SRC" / "cuepoint" / "version.py"
    
    if not version_file.exists():
        print(f"Error: Version file not found: {version_file}")
        return None
    
    content = version_file.read_text(encoding="utf-8")
    match = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', content)
    if match:
        return match.group(1)
    return None


def update_version_file(new_version: str) -> bool:
    """Update version in version.py.
    
    Args:
        new_version: New version string to set
        
    Returns:
        True if successful, False otherwise
    """
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    version_file = project_root / "SRC" / "cuepoint" / "version.py"
    
    if not version_file.exists():
        print(f"Error: Version file not found: {version_file}")
        return False
    
    # Read current content
    content = version_file.read_text(encoding="utf-8")
    
    # Replace version
    pattern = r'(__version__\s*=\s*["\'])([^"\']+)(["\'])'
    replacement = f'\\g<1>{new_version}\\g<3>'
    new_content = re.sub(pattern, replacement, content)
    
    if new_content == content:
        print(f"Warning: Version string not found in {version_file}")
        return False
    
    # Write updated content
    version_file.write_text(new_content, encoding="utf-8")
    print(f"Updated {version_file} with version {new_version}")
    return True


def configure_output_encoding() -> None:
    """Ensure stdout/stderr can handle Unicode in tags."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            try:
                wrapped = io.TextIOWrapper(
                    stream.buffer,
                    encoding="utf-8",
                    errors="replace",
                    line_buffering=True,
                )
                setattr(sys, stream_name, wrapped)
            except (AttributeError, ValueError):
                continue


def validate_semver(version: str) -> bool:
    """Validate SemVer format (including prerelease suffixes).
    
    Args:
        version: Version string to validate
        
    Returns:
        True if valid SemVer format (with optional prerelease suffix)
    """
    # Match base version (X.Y.Z) with optional prerelease suffix (e.g., -test2, -beta.1)
    pattern = r"^\d+\.\d+\.\d+(-[\w\.-]+)?$"
    return bool(re.match(pattern, version))


def main():
    configure_output_encoding()
    parser = argparse.ArgumentParser(
        description="Sync version from git tag to version.py"
    )
    parser.add_argument(
        "--tag",
        type=str,
        help="Specific git tag to use (e.g., v1.0.1). If not provided, uses latest tag."
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate version consistency, don't update"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force update even if versions match"
    )
    
    args = parser.parse_args()
    
    # Get version from git tag
    git_version = get_version_from_git_tag(args.tag)
    if not git_version:
        print("Error: Could not get version from git tag")
        sys.exit(1)
    
    if not validate_semver(git_version):
        print(f"Error: Invalid SemVer format from git tag: {git_version}")
        sys.exit(1)
    
    # Get version from file
    file_version = get_version_from_file()
    if not file_version:
        print("Error: Could not get version from version.py")
        sys.exit(1)
    
    if not validate_semver(file_version):
        print(f"Error: Invalid SemVer format in version.py: {file_version}")
        sys.exit(1)
    
    # Check if they match
    if git_version == file_version:
        print(f"[OK] Versions match: {file_version}")
        if args.validate_only:
            sys.exit(0)
        if not args.force:
            print("Versions already match. Use --force to update anyway.")
            sys.exit(0)
    
    # Show what will happen
    if args.validate_only:
        print(f"Version mismatch:")
        print(f"  version.py: {file_version}")
        print(f"  git tag:    {git_version}")
        sys.exit(1)
    
    # Update version.py
    print(f"Updating version.py:")
    print(f"  From: {file_version}")
    print(f"  To:   {git_version}")
    
    if update_version_file(git_version):
        print(f"[OK] Version synced successfully")
        sys.exit(0)
    else:
        print(f"[ERROR] Failed to update version.py")
        sys.exit(1)


if __name__ == "__main__":
    main()
