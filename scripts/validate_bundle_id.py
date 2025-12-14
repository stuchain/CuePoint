#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate bundle identifier consistency

This script validates that the bundle ID is consistent across:
1. Info.plist
2. PyInstaller spec file
3. Code signature (if signed)

Usage:
    python scripts/validate_bundle_id.py [app_path]
"""

import plistlib
import re
import subprocess
import sys
from pathlib import Path

EXPECTED_BUNDLE_ID = 'com.stuchain.cuepoint'


def get_bundle_id_from_info_plist(app_path):
    """Get bundle ID from Info.plist
    
    Args:
        app_path: Path to .app bundle
        
    Returns:
        Bundle ID string or None
    """
    info_plist = Path(app_path) / 'Contents/Info.plist'
    if not info_plist.exists():
        return None
    
    try:
        with open(info_plist, 'rb') as f:
            plist = plistlib.load(f)
        return plist.get('CFBundleIdentifier')
    except Exception:
        return None


def get_bundle_id_from_spec():
    """Get bundle ID from PyInstaller spec file
    
    Returns:
        Bundle ID string or None
    """
    spec_file = Path('build/pyinstaller.spec')
    if not spec_file.exists():
        return None
    
    content = spec_file.read_text()
    match = re.search(r"bundle_identifier\s*=\s*['\"]([^'\"]+)['\"]", content)
    if match:
        return match.group(1)
    
    # Also check info_plist dict
    match = re.search(r"['\"]CFBundleIdentifier['\"]\s*:\s*['\"]([^'\"]+)['\"]", content)
    if match:
        return match.group(1)
    
    return None


def get_bundle_id_from_signature(app_path):
    """Get bundle ID from code signature
    
    Args:
        app_path: Path to .app bundle
        
    Returns:
        Bundle ID string or None
    """
    try:
        result = subprocess.run(
            ['codesign', '-dvv', str(app_path)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return None
        
        # Parse bundle ID from signature
        match = re.search(r'Identifier=([^\s]+)', result.stdout)
        if match:
            return match.group(1)
    except Exception:
        pass
    
    return None


def validate_bundle_id(app_path=None):
    """Validate bundle ID consistency
    
    Args:
        app_path: Optional path to .app bundle
        
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []
    
    # Check Info.plist
    if app_path:
        info_plist_id = get_bundle_id_from_info_plist(app_path)
        if info_plist_id:
            if info_plist_id != EXPECTED_BUNDLE_ID:
                errors.append(
                    f"Bundle ID mismatch in Info.plist: "
                    f"expected {EXPECTED_BUNDLE_ID}, got {info_plist_id}"
                )
        else:
            errors.append("Could not read bundle ID from Info.plist")
    
    # Check spec file
    spec_id = get_bundle_id_from_spec()
    if spec_id:
        if spec_id != EXPECTED_BUNDLE_ID:
            errors.append(
                f"Bundle ID mismatch in pyinstaller.spec: "
                f"expected {EXPECTED_BUNDLE_ID}, got {spec_id}"
            )
    else:
        errors.append("Could not read bundle ID from pyinstaller.spec")
    
    # Check signature (if app is signed)
    if app_path:
        sig_id = get_bundle_id_from_signature(app_path)
        if sig_id:
            if sig_id != EXPECTED_BUNDLE_ID:
                errors.append(
                    f"Bundle ID mismatch in code signature: "
                    f"expected {EXPECTED_BUNDLE_ID}, got {sig_id}"
                )
        # Note: Not an error if not signed (pre-signing validation)
    
    return len(errors) == 0, errors


def main():
    """Main function"""
    app_path = sys.argv[1] if len(sys.argv) > 1 else None
    
    if app_path:
        app_path = Path(app_path)
        if not app_path.exists():
            print(f"Error: App bundle not found: {app_path}", file=sys.stderr)
            sys.exit(1)
    
    valid, errors = validate_bundle_id(app_path)
    
    if not valid:
        print("Bundle ID validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    print(f"✓ Bundle ID validation passed: {EXPECTED_BUNDLE_ID}")
    sys.exit(0)


if __name__ == '__main__':
    main()
