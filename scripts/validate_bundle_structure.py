#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate macOS app bundle structure

This script validates that the app bundle has the correct structure
with all required directories and files.

Usage:
    python scripts/validate_bundle_structure.py [app_path]
"""

import sys
from pathlib import Path


def validate_bundle_structure(app_path):
    """Validate app bundle structure
    
    Args:
        app_path: Path to .app bundle
        
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    app = Path(app_path)
    errors = []
    warnings = []
    
    if not app.exists():
        return False, [f"App bundle not found: {app_path}"]
    
    if not app.is_dir():
        return False, [f"App bundle is not a directory: {app_path}"]
    
    # Check required directories
    required_dirs = [
        'Contents',
        'Contents/MacOS',
        'Contents/Resources',
    ]
    
    for dir_path in required_dirs:
        full_path = app / dir_path
        if not full_path.exists():
            errors.append(f"Missing required directory: {dir_path}")
        elif not full_path.is_dir():
            errors.append(f"Expected directory but found file: {dir_path}")
    
    # Check required files
    required_files = [
        'Contents/Info.plist',
        'Contents/MacOS/CuePoint',
    ]
    
    for file_path in required_files:
        full_path = app / file_path
        if not full_path.exists():
            errors.append(f"Missing required file: {file_path}")
        elif not full_path.is_file():
            errors.append(f"Expected file but found directory: {file_path}")
    
    # Check executable permissions
    exe_path = app / 'Contents/MacOS/CuePoint'
    if exe_path.exists():
        stat = exe_path.stat()
        if not (stat.st_mode & 0o111):  # Check execute bit
            errors.append("Executable does not have execute permission")
    
    # Check for optional but recommended directories
    optional_dirs = [
        'Contents/Frameworks',
    ]
    
    for dir_path in optional_dirs:
        full_path = app / dir_path
        if full_path.exists() and not full_path.is_dir():
            warnings.append(f"Optional directory exists but is not a directory: {dir_path}")
    
    return len(errors) == 0, errors, warnings


def main():
    """Main function"""
    app_path = sys.argv[1] if len(sys.argv) > 1 else 'dist/CuePoint.app'
    
    valid, errors, warnings = validate_bundle_structure(app_path)
    
    if not valid:
        print("Bundle structure validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    if warnings:
        print("Bundle structure validation warnings:")
        for warning in warnings:
            print(f"  WARNING: {warning}")
    
    print("✓ Bundle structure validation passed")
    sys.exit(0)


if __name__ == '__main__':
    main()
