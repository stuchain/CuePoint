#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Check file sizes in repository.

Fails if any tracked file exceeds size limit.
"""

import subprocess
import sys
from pathlib import Path

MAX_FILE_SIZE_MB = 50  # Maximum file size in MB
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


def get_tracked_files():
    """Get list of tracked files in git repository."""
    result = subprocess.run(
        ["git", "ls-files"],
        capture_output=True,
        text=True,
        check=True
    )
    return result.stdout.strip().split("\n")


def check_file_sizes():
    """Check file sizes and report violations."""
    tracked_files = get_tracked_files()
    violations = []
    
    for file_path_str in tracked_files:
        if not file_path_str:
            continue
        
        file_path = Path(file_path_str)
        if not file_path.exists():
            continue
        
        file_size = file_path.stat().st_size
        
        if file_size > MAX_FILE_SIZE_BYTES:
            size_mb = file_size / (1024 * 1024)
            violations.append((file_path, size_mb))
    
    if violations:
        print("ERROR: Files exceed size limit:")
        print(f"  Maximum size: {MAX_FILE_SIZE_MB} MB")
        print()
        for file_path, size_mb in violations:
            print(f"  {file_path}: {size_mb:.1f} MB")
        print()
        print("Large files should not be committed to the repository.")
        print("Consider using Git LFS or storing files elsewhere.")
        return False
    
    print(f"✓ All files under {MAX_FILE_SIZE_MB} MB limit")
    return True


if __name__ == "__main__":
    success = check_file_sizes()
    sys.exit(0 if success else 1)

