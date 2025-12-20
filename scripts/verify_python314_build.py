#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verify Python 3.14 Build Configuration

This script checks if the build environment is correctly configured for Python 3.14
and that python314.dll can be found and bundled.
"""

import sys
from pathlib import Path

def check_python_version():
    """Check Python version."""
    print("=" * 70)
    print("Python Version Check")
    print("=" * 70)
    version = f"{sys.version_info.major}.{sys.version_info.minor}"
    print(f"Current Python version: {version}")
    
    if sys.version_info[:2] != (3, 14):
        print(f"[WARNING] Expected Python 3.14, but found {version}")
        print("  The build will use the current Python version's DLL")
        return False
    else:
        print("[OK] Python 3.14 detected")
        return True

def find_python_dll():
    """Find python314.dll."""
    print("\n" + "=" * 70)
    print("Python DLL Check")
    print("=" * 70)
    
    python_version_major = sys.version_info.major
    python_version_minor = sys.version_info.minor
    python_dll_name = f'python{python_version_major}{python_version_minor:02d}.dll'
    
    print(f"Looking for: {python_dll_name}")
    
    # Try multiple locations
    locations = []
    
    # 1. Base prefix (base Python installation)
    if hasattr(sys, 'base_prefix'):
        locations.append(Path(sys.base_prefix))
        if sys.prefix != sys.base_prefix:
            print(f"  In virtual environment")
            print(f"  Base Python: {sys.base_prefix}")
    
    # 2. Executable directory
    if hasattr(sys, 'executable'):
        locations.append(Path(sys.executable).parent)
    
    # 3. Common installation paths
    locations.extend([
        Path('C:/Python314'),
        Path('C:/Python313'),
        Path('C:/Program Files/Python314'),
        Path('C:/Program Files/Python313'),
        Path.home() / 'AppData' / 'Local' / 'Programs' / 'Python' / 'Python314',
        Path.home() / 'AppData' / 'Local' / 'Programs' / 'Python' / 'Python313',
    ])
    
    found_locations = []
    for location in locations:
        if not location.exists():
            continue
        
        # Check main directory
        dll_path = location / python_dll_name
        if dll_path.exists():
            found_locations.append(dll_path)
            print(f"[OK] Found at: {dll_path}")
            continue
        
        # Check DLLs subdirectory
        dll_path = location / 'DLLs' / python_dll_name
        if dll_path.exists():
            found_locations.append(dll_path)
            print(f"[OK] Found at: {dll_path}")
    
    if not found_locations:
        print(f"[FAIL] {python_dll_name} not found in any location!")
        print("\nPossible solutions:")
        print("1. Install Python 3.14")
        print("2. Check if DLL exists in Python installation directory")
        print("3. Reinstall Python 3.14 if DLL is missing")
        return False
    
    print(f"\n[OK] Found {len(found_locations)} location(s) with {python_dll_name}")
    return True

def check_pyinstaller():
    """Check PyInstaller version."""
    print("\n" + "=" * 70)
    print("PyInstaller Check")
    print("=" * 70)
    
    try:
        import PyInstaller
        version = PyInstaller.__version__
        print(f"PyInstaller version: {version}")
        
        # Parse version
        parts = version.split('.')
        major = int(parts[0])
        minor = int(parts[1])
        
        if (major, minor) >= (6, 10):
            print("[OK] PyInstaller version supports Python 3.13/3.14")
            return True
        else:
            print(f"[WARNING] PyInstaller {version} may not fully support Python 3.14")
            print("  Recommended: pip install --upgrade pyinstaller")
            return False
    except ImportError:
        print("[FAIL] PyInstaller not installed")
        print("  Install with: pip install pyinstaller")
        return False

def main():
    """Main function."""
    print("Python 3.14 Build Verification")
    print("=" * 70)
    print()
    
    results = {
        'python_version': check_python_version(),
        'python_dll': find_python_dll(),
        'pyinstaller': check_pyinstaller(),
    }
    
    print("\n" + "=" * 70)
    print("Summary")
    print("=" * 70)
    
    all_ok = all(results.values())
    
    if all_ok:
        print("[OK] All checks passed! Ready to build.")
        print("\nNext steps:")
        print("1. Run: python scripts/build_pyinstaller.py")
        print("2. Check build logs for DLL inclusion messages")
        print("3. Test the executable")
    else:
        print("[WARNING] Some checks failed. Review the issues above.")
        print("\nFix the issues before building.")
    
    print("=" * 70)
    
    return 0 if all_ok else 1

if __name__ == '__main__':
    sys.exit(main())
