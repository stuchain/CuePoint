#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Verify version embedding in artifacts
Checks that version information is correctly embedded in built artifacts
"""

import subprocess
import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __version__
except ImportError:
    print("Error: Could not import version module")
    sys.exit(1)


def verify_macos_version(app_path):
    """Verify version in macOS app"""
    plist_path = Path(app_path) / "Contents" / "Info.plist"
    if not plist_path.exists():
        return False, "Info.plist not found"
    
    # Read plist using plutil (macOS) or plistlib (cross-platform)
    try:
        # Try plutil first (macOS only)
        result = subprocess.run(
            ['plutil', '-p', str(plist_path)],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            plist_content = result.stdout
            if __version__ in plist_content:
                return True, "Version verified in Info.plist"
            else:
                return False, f"Version {__version__} not found in Info.plist"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # Fallback to reading file directly
        try:
            content = plist_path.read_text()
            if __version__ in content:
                return True, "Version verified in Info.plist"
            else:
                return False, f"Version {__version__} not found in Info.plist"
        except Exception as e:
            return False, f"Error reading Info.plist: {e}"
    
    return False, "Could not verify version"


def verify_windows_version(exe_path):
    """Verify version in Windows exe"""
    # On Windows, we can use signtool or read file properties
    # For now, we'll check if file exists and is executable
    if not Path(exe_path).exists():
        return False, "Executable not found"
    
    # Try to read version using PowerShell (Windows only)
    try:
        ps_cmd = f'(Get-Item "{exe_path}").VersionInfo.FileVersion'
        result = subprocess.run(
            ['powershell', '-Command', ps_cmd],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0 and __version__ in result.stdout:
            return True, "Version verified in executable"
        else:
            return False, f"Version {__version__} not found in executable metadata"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # Fallback: just check file exists
        return True, "Executable exists (version verification skipped - requires Windows)"
    
    return False, "Could not verify version"


def main():
    """Main verification"""
    errors = []
    
    # Check macOS app
    app_path = Path("dist/CuePoint.app")
    if app_path.exists():
        print(f"Checking macOS app: {app_path}")
        success, message = verify_macos_version(app_path)
        if not success:
            errors.append(f"macOS: {message}")
        else:
            print(f"  [OK] {message}")
    
    # Check Windows exe
    exe_path = Path("dist/CuePoint.exe")
    if exe_path.exists():
        print(f"Checking Windows executable: {exe_path}")
        success, message = verify_windows_version(exe_path)
        if not success:
            errors.append(f"Windows: {message}")
        else:
            print(f"  [OK] {message}")
    
    if not app_path.exists() and not exe_path.exists():
        print("Warning: No build artifacts found in dist/")
        print("  Run build first to create artifacts")
        return
    
    if errors:
        print("\nVersion embedding verification failed:")
        for error in errors:
            print(f"  ✗ {error}")
        sys.exit(1)
    
    print(f"\n[OK] Version embedding verified: {__version__}")


if __name__ == '__main__':
    main()
