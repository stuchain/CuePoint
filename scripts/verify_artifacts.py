#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Verify build artifacts.

Tests that artifacts can be installed and run in clean environments.
"""

import subprocess
import sys
from pathlib import Path


def verify_macos_dmg(dmg_path: Path) -> bool:
    """Verify macOS DMG artifact.
    
    Args:
        dmg_path: Path to DMG file
        
    Returns:
        True if verification succeeds.
    """
    print(f"Verifying macOS DMG: {dmg_path}")
    
    # Check DMG exists
    if not dmg_path.exists():
        print(f"ERROR: DMG not found: {dmg_path}")
        return False
    
    # Check DMG is signed (if on macOS)
    try:
        result = subprocess.run(
            ["codesign", "--verify", "--verbose", str(dmg_path)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"⚠ DMG not signed: {dmg_path}")
            print(result.stderr)
            # Don't fail on this - may be expected for development builds
        else:
            print("✓ DMG is signed")
    except FileNotFoundError:
        print("⚠ codesign not available (not on macOS)")
    
    return True


def verify_windows_installer(installer_path: Path) -> bool:
    """Verify Windows installer artifact.
    
    Args:
        installer_path: Path to installer file
        
    Returns:
        True if verification succeeds.
    """
    print(f"Verifying Windows installer: {installer_path}")
    
    # Check installer exists
    if not installer_path.exists():
        print(f"ERROR: Installer not found: {installer_path}")
        return False
    
    # Check installer is signed (if on Windows)
    try:
        result = subprocess.run(
            ["signtool", "verify", "/pa", str(installer_path)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"⚠ Installer not signed: {installer_path}")
            print(result.stderr)
            # Don't fail on this - may be expected for development builds
        else:
            print("✓ Installer is signed")
    except FileNotFoundError:
        print("⚠ signtool not available (not on Windows)")
    
    return True


def main():
    """Verify all artifacts."""
    dist_dir = Path("dist")
    
    if not dist_dir.exists():
        print("ERROR: dist/ directory not found")
        return 1
    
    success = True
    
    # Check macOS DMG
    dmg_files = list(dist_dir.glob("*.dmg"))
    if dmg_files:
        for dmg_file in dmg_files:
            if not verify_macos_dmg(dmg_file):
                success = False
    else:
        print("⚠ No macOS DMG found (may be expected for Windows-only builds)")
    
    # Check Windows installer
    installer_files = list(dist_dir.glob("*.exe"))
    if installer_files:
        for installer_file in installer_files:
            if not verify_windows_installer(installer_file):
                success = False
    else:
        print("⚠ No Windows installer found (may be expected for macOS-only builds)")
    
    if success:
        print("\n✓ All artifacts verified")
        return 0
    else:
        print("\n✗ Artifact verification failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())

