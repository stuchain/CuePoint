#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate macOS DMG file

This script validates that the DMG file:
1. Can be mounted
2. Contains the app bundle
3. Has proper layout
4. Is properly formatted

Usage:
    python scripts/validate_dmg.py [dmg_path]
"""

import subprocess
import sys
import tempfile
from pathlib import Path


def validate_dmg(dmg_path):
    """Validate DMG file
    
    Args:
        dmg_path: Path to DMG file
        
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    dmg = Path(dmg_path)
    errors = []
    warnings = []
    mount_point = None
    
    if not dmg.exists():
        return False, [f"DMG not found: {dmg_path}"], []
    
    if not dmg.is_file():
        return False, [f"DMG is not a file: {dmg_path}"], []
    
    # Try to mount DMG
    try:
        # Create temporary mount point
        with tempfile.TemporaryDirectory() as tmpdir:
            mount_point = Path(tmpdir) / 'dmg_mount'
            mount_point.mkdir()
            
            # Mount DMG
            result = subprocess.run(
                ['hdiutil', 'attach', str(dmg), '-mountpoint', str(mount_point), '-nobrowse', '-quiet'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                errors.append(f"Failed to mount DMG: {result.stderr}")
                return len(errors) == 0, errors, warnings
            
            # Check contents
            app_in_dmg = mount_point / 'CuePoint.app'
            if not app_in_dmg.exists():
                errors.append("CuePoint.app not found in DMG")
            elif not app_in_dmg.is_dir():
                errors.append("CuePoint.app exists but is not a directory")
            
            apps_link = mount_point / 'Applications'
            if not apps_link.exists():
                warnings.append("Applications symlink not found in DMG")
            elif not apps_link.is_symlink():
                warnings.append("Applications exists but is not a symlink")
            
            readme = mount_point / 'README.txt'
            if not readme.exists():
                warnings.append("README.txt not found in DMG (optional but recommended)")
            
            # Unmount
            subprocess.run(
                ['hdiutil', 'detach', str(mount_point), '-quiet'],
                capture_output=True,
                timeout=30
            )
    
    except subprocess.TimeoutExpired:
        errors.append("DMG mounting operation timed out")
    except Exception as e:
        errors.append(f"DMG validation error: {e}")
    
    return len(errors) == 0, errors, warnings


def main():
    """Main function"""
    dmg_path = sys.argv[1] if len(sys.argv) > 1 else None
    
    if not dmg_path:
        # Auto-detect DMG
        dist_path = Path('dist')
        dmgs = list(dist_path.glob('CuePoint-v*.dmg'))
        if not dmgs:
            print("Error: No DMG files found in dist/", file=sys.stderr)
            sys.exit(1)
        dmg_path = str(dmgs[0])
    
    valid, errors, warnings = validate_dmg(dmg_path)
    
    if not valid:
        print("DMG validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    if warnings:
        print("DMG validation warnings:")
        for warning in warnings:
            print(f"  WARNING: {warning}")
    
    print(f"✓ DMG validation passed: {dmg_path}")
    sys.exit(0)


if __name__ == '__main__':
    main()
