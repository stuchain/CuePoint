#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate update system compatibility

This script validates that the app bundle is compatible with the update system:
1. Bundle ID is stable and correct
2. Version format is correct
3. Bundle structure supports updates

Usage:
    python scripts/validate_update_compatibility.py [app_path]
"""

import plistlib
import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __version__
except ImportError:
    __version__ = None


EXPECTED_BUNDLE_ID = 'com.stuchain.cuepoint'


def validate_update_compatibility(app_path):
    """Validate update compatibility
    
    Args:
        app_path: Path to .app bundle
        
    Returns:
        Tuple of (is_valid, list_of_errors, list_of_warnings)
    """
    app = Path(app_path)
    errors = []
    warnings = []
    
    if not app.exists():
        return False, [f"App bundle not found: {app_path}"], []
    
    # Check Info.plist
    info_plist = app / 'Contents/Info.plist'
    if not info_plist.exists():
        return False, ["Info.plist not found"], []
    
    try:
        with open(info_plist, 'rb') as f:
            plist = plistlib.load(f)
    except Exception as e:
        return False, [f"Could not read Info.plist: {e}"], []
    
    # Validate bundle ID (must be stable for updates)
    bundle_id = plist.get('CFBundleIdentifier')
    if bundle_id != EXPECTED_BUNDLE_ID:
        errors.append(
            f"Bundle ID mismatch: expected {EXPECTED_BUNDLE_ID}, got {bundle_id}. "
            f"Bundle ID must be stable for updates to work."
        )
    else:
        print(f"✓ Bundle ID is correct: {bundle_id}")
    
    # Validate version format (SemVer required for updates)
    version = plist.get('CFBundleShortVersionString')
    if version:
        # Check SemVer format (X.Y.Z)
        parts = version.split('.')
        if len(parts) != 3:
            errors.append(
                f"Version format invalid: {version}. "
                f"Must be SemVer format (X.Y.Z) for updates to work."
            )
        else:
            try:
                major, minor, patch = map(int, parts)
                print(f"✓ Version format is valid: {version}")
            except ValueError:
                errors.append(
                    f"Version format invalid: {version}. "
                    f"Version components must be numeric."
                )
    else:
        errors.append("Version not found in Info.plist")
    
    # Validate build number (should be present)
    build_number = plist.get('CFBundleVersion')
    if not build_number:
        warnings.append("Build number not found (recommended for updates)")
    else:
        print(f"✓ Build number present: {build_number}")
    
    # Check executable exists
    executable = plist.get('CFBundleExecutable', 'CuePoint')
    exe_path = app / 'Contents/MacOS' / executable
    if not exe_path.exists():
        errors.append(f"Executable not found: {exe_path}")
    else:
        print(f"✓ Executable found: {executable}")
    
    # Check bundle structure (must be proper app bundle)
    required_dirs = ['Contents', 'Contents/MacOS', 'Contents/Resources']
    for dir_path in required_dirs:
        if not (app / dir_path).exists():
            errors.append(f"Required directory missing: {dir_path}")
    
    return len(errors) == 0, errors, warnings


def main():
    """Main function"""
    app_path = sys.argv[1] if len(sys.argv) > 1 else 'dist/CuePoint.app'
    
    valid, errors, warnings = validate_update_compatibility(app_path)
    
    if warnings:
        print("\nWarnings:")
        for warning in warnings:
            print(f"  WARNING: {warning}")
    
    if not valid:
        print("\nUpdate compatibility validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    print("\n✓ Update compatibility validation passed")
    print("  The app bundle is compatible with the update system")
    sys.exit(0)


if __name__ == '__main__':
    main()
