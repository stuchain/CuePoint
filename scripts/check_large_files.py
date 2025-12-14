#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Check for large files in repository
Detects files exceeding size limits and prevents accidental commits
"""

import os
import sys
from pathlib import Path

# Maximum file size (50MB)
MAX_FILE_SIZE = 50 * 1024 * 1024

# Directories to exclude
EXCLUDE_DIRS = {
    '.git',
    '.venv',
    'venv',
    'env',
    'ENV',
    'node_modules',
    '.mypy_cache',
    '.pytest_cache',
    '__pycache__',
    'dist',
    'build',
    '.playwright',
    'playwright-report',
    'test-results',
    '.pytest_cache',
    'htmlcov',
    '.coverage',
}

# File patterns to exclude
EXCLUDE_PATTERNS = {
    '.pyc',
    '.pyo',
    '.egg',
    '.whl',
    '.cache',
    '.log',
}


def format_size(size_bytes):
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def should_exclude(path):
    """Check if path should be excluded from checking"""
    # Check directory exclusions
    parts = Path(path).parts
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    
    # Check file pattern exclusions
    if any(path.endswith(pattern) for pattern in EXCLUDE_PATTERNS):
        return True
    
    return False


def check_large_files(root_dir='.'):
    """Check for large files in repository"""
    large_files = []
    total_size = 0
    
    root_path = Path(root_dir).resolve()
    
    for root, dirs, files in os.walk(root_path):
        # Filter out excluded directories
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        for file in files:
            file_path = Path(root) / file
            
            # Skip excluded paths
            if should_exclude(str(file_path)):
                continue
            
            try:
                size = file_path.stat().st_size
                total_size += size
                
                if size > MAX_FILE_SIZE:
                    rel_path = file_path.relative_to(root_path)
                    large_files.append((rel_path, size))
            except (OSError, PermissionError) as e:
                print(f"Warning: Could not check {file_path}: {e}", file=sys.stderr)
                continue
    
    return large_files, total_size


def main():
    """Main function"""
    large_files, total_size = check_large_files()
    
    if large_files:
        print(f"ERROR: Found {len(large_files)} file(s) exceeding {format_size(MAX_FILE_SIZE)}:")
        print()
        for file_path, size in sorted(large_files, key=lambda x: x[1], reverse=True):
            print(f"  {file_path}: {format_size(size)}")
        print()
        print("Large files should not be committed to git.")
        print("Consider using Git LFS for large files, or exclude them in .gitignore")
        sys.exit(1)
    
    print(f"[OK] No large files detected (total repository size: {format_size(total_size)})")


if __name__ == '__main__':
    main()
