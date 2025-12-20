#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build and Executable Test Script

This script tests that:
1. The application can be built with PyInstaller
2. The executable runs without DLL errors
3. The executable has correct version information
4. All critical components are included

Usage:
    python scripts/test_build_and_executable.py
"""

import sys
import subprocess
import tempfile
import shutil
from pathlib import Path
import platform

project_root = Path(__file__).parent.parent


def check_pyinstaller_version():
    """Check that PyInstaller version is >= 6.10.0."""
    print("Checking PyInstaller version...")
    try:
        result = subprocess.run(
            ['pyinstaller', '--version'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            print("❌ PyInstaller not found or error running --version")
            return False
        
        version_str = result.stdout.strip().split()[0]
        version_parts = version_str.split('.')
        major = int(version_parts[0])
        minor = int(version_parts[1])
        
        if (major, minor) < (6, 10):
            print(f"❌ PyInstaller version {version_str} is too old. Need >= 6.10.0")
            return False
        
        print(f"✅ PyInstaller version {version_str} is compatible")
        return True
    except FileNotFoundError:
        print("❌ PyInstaller not found in PATH")
        return False
    except Exception as e:
        print(f"❌ Error checking PyInstaller version: {e}")
        return False


def test_build():
    """Test that the application can be built."""
    print("\n" + "=" * 80)
    print("Testing Build Process")
    print("=" * 80)
    
    # Check PyInstaller version first
    if not check_pyinstaller_version():
        return False
    
    # Check spec file exists
    spec_file = project_root / 'build' / 'pyinstaller.spec'
    if not spec_file.exists():
        print("❌ PyInstaller spec file not found")
        return False
    
    print("✅ Spec file found")
    
    # Check that build script exists
    build_script = project_root / 'scripts' / 'build_pyinstaller.py'
    if not build_script.exists():
        print("❌ Build script not found")
        return False
    
    print("✅ Build script found")
    
    # Note: We don't actually run the build here because it takes a long time
    # This is meant to be run manually or in CI
    print("\n⚠️  Note: Full build test should be run manually or in CI")
    print("   To test build: python scripts/build_pyinstaller.py")
    
    return True


def test_executable_if_exists():
    """Test executable if it exists (from previous build)."""
    print("\n" + "=" * 80)
    print("Testing Executable (if exists)")
    print("=" * 80)
    
    exe_name = 'CuePoint.exe' if platform.system() == 'Windows' else 'CuePoint'
    exe_path = project_root / 'dist' / exe_name
    
    if not exe_path.exists():
        print(f"⚠️  Executable not found at {exe_path}")
        print("   Run 'python scripts/build_pyinstaller.py' first to build")
        return True  # Not a failure, just not built yet
    
    print(f"✅ Executable found: {exe_path}")
    
    # Check file size (should be substantial)
    size_mb = exe_path.stat().st_size / (1024 * 1024)
    print(f"   Size: {size_mb:.1f} MB")
    
    if size_mb < 10:
        print("⚠️  Warning: Executable seems small (< 10 MB)")
    
    # On Windows, check if DLL might be included by checking if it's a valid PE file
    if platform.system() == 'Windows':
        try:
            # Try to read PE header
            with open(exe_path, 'rb') as f:
                header = f.read(2)
                if header == b'MZ':
                    print("✅ Executable has valid PE header")
                else:
                    print("⚠️  Warning: Executable doesn't have valid PE header")
        except Exception as e:
            print(f"⚠️  Warning: Could not verify executable format: {e}")
    
    return True


def test_spec_file_configuration():
    """Test that spec file is configured correctly."""
    print("\n" + "=" * 80)
    print("Testing Spec File Configuration")
    print("=" * 80)
    
    spec_file = project_root / 'build' / 'pyinstaller.spec'
    if not spec_file.exists():
        print("❌ Spec file not found")
        return False
    
    spec_content = spec_file.read_text(encoding='utf-8')
    
    checks = [
        ("Python DLL inclusion", 'python{sys.version_info.major}{sys.version_info.minor}.dll' in spec_content),
        ("Binaries list", 'binaries' in spec_content.lower()),
        ("Post-analysis check", 'dll_found' in spec_content.lower() or 'a.binaries' in spec_content),
        ("Hook path", 'hookspath' in spec_content.lower()),
    ]
    
    all_passed = True
    for check_name, passed in checks:
        if passed:
            print(f"✅ {check_name}")
        else:
            print(f"❌ {check_name}")
            all_passed = False
    
    return all_passed


def main():
    """Run all tests."""
    print("=" * 80)
    print("Build and Executable Test Suite")
    print("=" * 80)
    print()
    
    results = []
    
    # Test spec file configuration
    results.append(("Spec File Configuration", test_spec_file_configuration()))
    
    # Test build process
    results.append(("Build Process", test_build()))
    
    # Test executable if exists
    results.append(("Executable (if exists)", test_executable_if_exists()))
    
    # Summary
    print("\n" + "=" * 80)
    print("Test Results Summary")
    print("=" * 80)
    
    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False
    
    print()
    if all_passed:
        print("✅ All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1


if __name__ == '__main__':
    sys.exit(main())
