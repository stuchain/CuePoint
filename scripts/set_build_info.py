#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Set Build Information During CI Build

This script updates SRC/cuepoint/version.py with build identifiers:
- Build number (from CI or date-based)
- Commit SHA (from git)
- Build date (current timestamp)

Usage:
    python scripts/set_build_info.py

This script is typically called during CI/CD builds to inject build
information into the version module.
"""

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


def get_commit_sha() -> Optional[str]:
    """Get current git commit SHA.

    Returns:
        Full commit SHA, or None if git is not available or command fails.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        print("Warning: Git command timed out")
        return None
    except subprocess.CalledProcessError as e:
        print(f"Warning: Could not get commit SHA: {e}")
        return None
    except FileNotFoundError:
        print("Warning: Git not found")
        return None


def get_build_number() -> Optional[str]:
    """Get build number from CI or generate.

    Tries CI environment variables first, then falls back to date-based.

    Returns:
        Build number string, or None if unable to determine.
    """
    # Try CI environment variables (GitHub Actions)
    build_num = os.environ.get("GITHUB_RUN_NUMBER")
    if build_num:
        return build_num

    # Try other CI systems
    build_num = os.environ.get("BUILD_NUMBER")
    if build_num:
        return build_num

    # Try CI build ID
    build_id = os.environ.get("GITHUB_RUN_ID")
    if build_id:
        return build_id

    # Fallback: date-based build number
    return datetime.now().strftime("%Y%m%d%H%M")


def get_build_date() -> str:
    """Get build date in ISO format.

    Returns:
        Build date as ISO format string.
    """
    return datetime.now().isoformat()


def update_version_file() -> None:
    """Update version.py with build info.

    Reads version.py, replaces build identifier placeholders with actual
    values, and writes the updated file.

    Raises:
        SystemExit: If version file not found or update fails.
    """
    # Get path to version file
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    version_file = project_root / "SRC" / "cuepoint" / "version.py"

    if not version_file.exists():
        print(f"Error: Version file not found: {version_file}")
        sys.exit(1)

    # Read current content
    content = version_file.read_text()

    # Get build info
    build_number = get_build_number()
    commit_sha = get_commit_sha()
    build_date = get_build_date()

    # Replace placeholders - handle both None and existing values
    import re

    # Pattern to match: __build_number__: Optional[str] = "..." or = None
    build_pattern = r'(__build_number__: Optional\[str\] = )["\']?[^"\']*["\']?'
    commit_pattern = r'(__commit_sha__: Optional\[str\] = )["\']?[^"\']*["\']?'
    date_pattern = r'(__build_date__: Optional\[str\] = )["\']?[^"\']*["\']?'
    
    # Replace build number
    content = re.sub(build_pattern, f'__build_number__: Optional[str] = "{build_number}"', content)
    
    # Replace commit SHA
    if commit_sha:
        content = re.sub(commit_pattern, f'__commit_sha__: Optional[str] = "{commit_sha}"', content)
    else:
        content = re.sub(commit_pattern, '__commit_sha__: Optional[str] = None', content)
    
    # Replace build date
    content = re.sub(date_pattern, f'__build_date__: Optional[str] = "{build_date}"', content)

    # Write updated content
    version_file.write_text(content)

    print("Updated version file:")
    print(f"  Build number: {build_number}")
    if commit_sha:
        print(f"  Commit SHA: {commit_sha}")
    print(f"  Build date: {build_date}")


if __name__ == "__main__":
    update_version_file()
