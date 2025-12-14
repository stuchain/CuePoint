#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate app/DMG before notarization submission

This script validates that the app or DMG is ready for notarization:
1. File exists and is readable
2. File is signed
3. Hardened runtime is enabled
4. Timestamp is present
5. File size is reasonable

Usage:
    python scripts/validate_pre_notarization.py [file_path]
"""

import subprocess
import sys
from pathlib import Path


def check_signing(file_path):
    """Check if file is signed
    
    Returns:
        Tuple of (is_signed, error_message)
    """
    try:
        result = subprocess.run(
            ['codesign', '--verify', '--verbose', str(file_path)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return False, f"File is not signed: {result.stderr}"
        
        return True, None
    except Exception as e:
        return False, f"Error checking signature: {e}"


def check_hardened_runtime(file_path):
    """Check if hardened runtime is enabled
    
    Returns:
        Tuple of (is_enabled, error_message)
    """
    try:
        result = subprocess.run(
            ['codesign', '-dvv', str(file_path)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return False, "Could not get signature details"
        
        if 'runtime' not in result.stdout:
            return False, "Hardened runtime is not enabled"
        
        return True, None
    except Exception as e:
        return False, f"Error checking hardened runtime: {e}"


def check_timestamp(file_path):
    """Check if timestamp is present
    
    Returns:
        Tuple of (has_timestamp, error_message)
    """
    try:
        result = subprocess.run(
            ['codesign', '-dvv', str(file_path)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return False, "Could not get signature details"
        
        # Check for timestamp authority
        if 'Timestamp=' in result.stdout or 'Authority=Apple Timestamp' in result.stdout:
            return True, None
        
        return False, "Timestamp not found in signature"
    except Exception as e:
        return False, f"Error checking timestamp: {e}"


def validate_pre_notarization(file_path):
    """Validate file is ready for notarization
    
    Args:
        file_path: Path to app bundle or DMG
        
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    file_path = Path(file_path)
    errors = []
    
    if not file_path.exists():
        return False, [f"File not found: {file_path}"]
    
    if not file_path.is_file() and not file_path.is_dir():
        return False, [f"Invalid file type: {file_path}"]
    
    # Check file size (reasonable limit: 500MB)
    if file_path.is_file():
        size_mb = file_path.stat().st_size / (1024 * 1024)
        if size_mb > 500:
            errors.append(f"File size is very large: {size_mb:.1f}MB (may cause issues)")
    
    # Check signing
    is_signed, error = check_signing(file_path)
    if not is_signed:
        errors.append(error)
    
    # Check hardened runtime (only for app bundles, not DMG)
    if file_path.suffix == '.app' or file_path.is_dir():
        is_enabled, error = check_hardened_runtime(file_path)
        if not is_enabled:
            errors.append(error)
    
    # Check timestamp
    has_timestamp, error = check_timestamp(file_path)
    if not has_timestamp:
        errors.append(error)
    
    return len(errors) == 0, errors


def main():
    """Main function"""
    file_path = sys.argv[1] if len(sys.argv) > 1 else None
    
    if not file_path:
        # Auto-detect
        dist_path = Path('dist')
        
        # Prefer DMG over app
        dmgs = list(dist_path.glob('*.dmg'))
        if dmgs:
            file_path = dmgs[0]
        else:
            apps = list(dist_path.glob('*.app'))
            if apps:
                file_path = apps[0]
        
        if not file_path:
            print("Error: No app or DMG found in dist/", file=sys.stderr)
            sys.exit(1)
    
    valid, errors = validate_pre_notarization(file_path)
    
    if not valid:
        print("Pre-notarization validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    print(f"✓ Pre-notarization validation passed: {file_path}")
    sys.exit(0)


if __name__ == '__main__':
    main()
