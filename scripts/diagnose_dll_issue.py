#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Comprehensive DLL Issue Diagnostic Tool

This script helps diagnose the Python 3.13 DLL issue by:
1. Checking if DLL exists in Python installation
2. Checking PyInstaller version
3. Checking spec file configuration
4. Attempting to extract and check executable contents
5. Providing recommendations
"""

import sys
import subprocess
import platform
from pathlib import Path

def check_python_dll():
    """Check if Python DLL exists in installation."""
    print("=" * 80)
    print("Step 1: Checking Python Installation")
    print("=" * 80)
    
    if platform.system() != 'Windows':
        print("Skipping (Windows-only check)")
        return None
    
    python_dir = Path(sys.executable).parent
    python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
    python_dll_path = python_dir / python_dll_name
    
    print(f"Python executable: {sys.executable}")
    print(f"Python version: {sys.version_info.major}.{sys.version_info.minor}")
    print(f"Python directory: {python_dir}")
    print(f"Expected DLL: {python_dll_name}")
    print(f"DLL path: {python_dll_path}")
    
    if python_dll_path.exists():
        size = python_dll_path.stat().st_size / (1024 * 1024)
        print(f"[OK] DLL found! Size: {size:.2f} MB")
        return python_dll_path
    else:
        print(f"[FAIL] DLL NOT FOUND at {python_dll_path}")
        return None

def check_pyinstaller_version():
    """Check PyInstaller version."""
    print()
    print("=" * 80)
    print("Step 2: Checking PyInstaller Version")
    print("=" * 80)
    
    try:
        result = subprocess.run(
            ['pyinstaller', '--version'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            version_str = result.stdout.strip().split()[0]
            version_parts = version_str.split('.')
            major = int(version_parts[0])
            minor = int(version_parts[1])
            
            print(f"PyInstaller version: {version_str}")
            
            if (major, minor) >= (6, 10):
                print("[OK] Version is >= 6.10.0 (supports Python 3.13)")
                return True
            else:
                print(f"[FAIL] Version {version_str} is too old. Need >= 6.10.0")
                return False
        else:
            print("[FAIL] Could not get PyInstaller version")
            return False
    except FileNotFoundError:
        print("[FAIL] PyInstaller not found in PATH")
        return False
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False

def check_spec_file():
    """Check spec file configuration."""
    print()
    print("=" * 80)
    print("Step 3: Checking Spec File Configuration")
    print("=" * 80)
    
    project_root = Path(__file__).parent.parent
    spec_file = project_root / 'build' / 'pyinstaller.spec'
    
    if not spec_file.exists():
        print(f"[FAIL] Spec file not found: {spec_file}")
        return False
    
    print(f"Spec file: {spec_file}")
    
    content = spec_file.read_text(encoding='utf-8')
    
    checks = [
        ("Python DLL detection code", 'python{sys.version_info.major}{sys.version_info.minor}.dll' in content),
        ("Binaries list", 'binaries' in content.lower()),
        ("Post-analysis check", 'dll_found' in content.lower() or 'a.binaries' in content),
        ("Data file inclusion", 'additional_datas' in content or 'Also adding as data file' in content),
        ("Runtime hooks", 'runtime_hooks' in content.lower()),
    ]
    
    all_ok = True
    for check_name, passed in checks:
        status = "[OK]" if passed else "[FAIL]"
        print(f"{status} {check_name}")
        if not passed:
            all_ok = False
    
    return all_ok

def check_executable_simple(exe_path):
    """Simple check - search for DLL name in binary."""
    print()
    print("=" * 80)
    print("Step 4: Checking Executable (Simple Binary Search)")
    print("=" * 80)
    
    exe_path = Path(exe_path)
    if not exe_path.exists():
        print(f"[FAIL] Executable not found: {exe_path}")
        return False
    
    print(f"Executable: {exe_path}")
    print(f"Size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
    
    # Simple search for DLL name in binary
    python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
    dll_name_bytes = python_dll_name.encode('utf-8')
    
    try:
        with open(exe_path, 'rb') as f:
            data = f.read()
            if dll_name_bytes in data:
                print(f"[OK] Found '{python_dll_name}' string in executable binary")
                print("     (This suggests DLL might be referenced, but doesn't confirm it's extracted)")
                return True
            else:
                print(f"[FAIL] '{python_dll_name}' string NOT found in executable")
                print("     (This suggests DLL is not being bundled)")
                return False
    except Exception as e:
        print(f"[FAIL] Error reading executable: {e}")
        return False

def main():
    """Run all diagnostics."""
    print("=" * 80)
    print("Python 3.13 DLL Issue Diagnostic Tool")
    print("=" * 80)
    print()
    
    results = {}
    
    # Step 1: Check Python DLL
    dll_path = check_python_dll()
    results['python_dll'] = dll_path is not None
    
    # Step 2: Check PyInstaller version
    results['pyinstaller_version'] = check_pyinstaller_version()
    
    # Step 3: Check spec file
    results['spec_file'] = check_spec_file()
    
    # Step 4: Check executable if it exists
    project_root = Path(__file__).parent.parent
    exe_name = 'CuePoint.exe' if platform.system() == 'Windows' else 'CuePoint'
    exe_path = project_root / 'dist' / exe_name
    
    if exe_path.exists():
        results['executable'] = check_executable_simple(exe_path)
    else:
        print()
        print("=" * 80)
        print("Step 4: Executable Not Found")
        print("=" * 80)
        print(f"Executable not found at: {exe_path}")
        print("Rebuild the application first: python scripts/build_pyinstaller.py")
        results['executable'] = None
    
    # Summary and recommendations
    print()
    print("=" * 80)
    print("Diagnostic Summary")
    print("=" * 80)
    
    print(f"Python DLL in installation: {'[OK]' if results['python_dll'] else '[FAIL]'}")
    print(f"PyInstaller version: {'[OK]' if results['pyinstaller_version'] else '[FAIL]'}")
    print(f"Spec file configuration: {'[OK]' if results['spec_file'] else '[FAIL]'}")
    if results['executable'] is not None:
        print(f"Executable check: {'[OK]' if results['executable'] else '[FAIL]'}")
    else:
        print("Executable check: [SKIP] (not built yet)")
    
    print()
    print("=" * 80)
    print("Recommendations")
    print("=" * 80)
    
    if not results['python_dll']:
        print("1. [CRITICAL] Python DLL not found in installation!")
        print("   Reinstall Python 3.13 or check installation")
    
    if not results['pyinstaller_version']:
        print("2. [CRITICAL] PyInstaller version is too old!")
        print("   Run: pip install --upgrade pyinstaller")
    
    if not results['spec_file']:
        print("3. [CRITICAL] Spec file configuration is incomplete!")
        print("   Check build/pyinstaller.spec")
    
    if results['executable'] is False:
        print("4. [CRITICAL] DLL not found in executable!")
        print("   The DLL is not being bundled.")
        print("   Action: Rebuild and check build logs for DLL inclusion messages")
        print("   Command: python scripts/build_pyinstaller.py")
    
    if all(results.values()) and results['executable'] is not False:
        print("All checks passed!")
        print()
        print("If you're still getting DLL errors:")
        print("1. The DLL might be bundled but not extracted (bootloader bug)")
        print("2. Try one-directory mode: Change noarchive=False to noarchive=True in spec file")
        print("3. Check the _MEI* temp directory when error occurs")
    
    print()
    print("=" * 80)

if __name__ == '__main__':
    main()
