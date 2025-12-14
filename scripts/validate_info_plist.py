#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Info.plist file

This script validates that Info.plist:
1. Is valid XML
2. Contains all required keys
3. Has correct value types
4. Is consistent with version.py

Usage:
    python scripts/validate_info_plist.py [app_path]
"""

import plistlib
import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __build_number__, __version__
except ImportError:
    __version__ = None
    __build_number__ = None


REQUIRED_KEYS = [
    'CFBundleIdentifier',
    'CFBundleName',
    'CFBundleDisplayName',
    'CFBundleExecutable',
    'CFBundlePackageType',
    'CFBundleShortVersionString',
    'CFBundleVersion',
    'LSMinimumSystemVersion',
]


def validate_info_plist(app_path):
    """Validate Info.plist
    
    Args:
        app_path: Path to .app bundle
        
    Returns:
        Tuple of (is_valid, list_of_errors, list_of_warnings)
    """
    app = Path(app_path)
    info_plist = app / 'Contents/Info.plist'
    
    errors = []
    warnings = []
    
    if not info_plist.exists():
        return False, [f"Info.plist not found: {info_plist}"], []
    
    # Try to parse as XML
    try:
        with open(info_plist, 'rb') as f:
            plist = plistlib.load(f)
    except Exception as e:
        return False, [f"Invalid Info.plist format: {e}"], []
    
    # Check required keys
    for key in REQUIRED_KEYS:
        if key not in plist:
            errors.append(f"Missing required key: {key}")
    
    # Validate bundle identifier
    if 'CFBundleIdentifier' in plist:
        bundle_id = plist['CFBundleIdentifier']
        if bundle_id != 'com.stuchain.cuepoint':
            errors.append(
                f"Invalid bundle identifier: {bundle_id} "
                f"(expected com.stuchain.cuepoint)"
            )
    
    # Validate executable name
    if 'CFBundleExecutable' in plist:
        executable = plist['CFBundleExecutable']
        if executable != 'CuePoint':
            errors.append(
                f"Invalid executable name: {executable} "
                f"(expected CuePoint)"
            )
        
        # Check executable exists
        exe_path = app / 'Contents/MacOS' / executable
        if not exe_path.exists():
            errors.append(f"Executable not found: {exe_path}")
    
    # Validate version consistency
    if __version__ and 'CFBundleShortVersionString' in plist:
        plist_version = plist['CFBundleShortVersionString']
        if plist_version != __version__:
            errors.append(
                f"Version mismatch: Info.plist has {plist_version}, "
                f"version.py has {__version__}"
            )
    
    if __build_number__ and 'CFBundleVersion' in plist:
        plist_build = plist['CFBundleVersion']
        if plist_build != __build_number__:
            warnings.append(
                f"Build number mismatch: Info.plist has {plist_build}, "
                f"version.py has {__build_number__}"
            )
    
    # Validate minimum system version
    if 'LSMinimumSystemVersion' in plist:
        min_version = plist['LSMinimumSystemVersion']
        try:
            # Check format (should be like "10.15")
            parts = min_version.split('.')
            if len(parts) < 2:
                warnings.append(f"Unusual minimum system version format: {min_version}")
        except Exception:
            warnings.append(f"Could not parse minimum system version: {min_version}")
    
    return len(errors) == 0, errors, warnings


def main():
    """Main function"""
    app_path = sys.argv[1] if len(sys.argv) > 1 else 'dist/CuePoint.app'
    
    valid, errors, warnings = validate_info_plist(app_path)
    
    if not valid:
        print("Info.plist validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    if warnings:
        print("Info.plist validation warnings:")
        for warning in warnings:
            print(f"  WARNING: {warning}")
    
    print("✓ Info.plist validation passed")
    sys.exit(0)


if __name__ == '__main__':
    main()
