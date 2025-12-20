#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rebuild script with DLL inclusion verification

This script rebuilds the application and verifies that the DLL is included.
"""

import sys
import subprocess
import platform
from pathlib import Path

def main():
    """Rebuild and verify DLL inclusion."""
    project_root = Path(__file__).parent.parent
    
    print("=" * 80)
    print("Rebuilding Application with DLL Verification")
    print("=" * 80)
    print()
    
    # Step 1: Check PyInstaller
    print("Step 1: Checking PyInstaller...")
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'PyInstaller', '--version'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            print(f"  PyInstaller version: {version}")
            
            # Check version
            version_parts = version.split()[0].split('.')
            major, minor = int(version_parts[0]), int(version_parts[1])
            if (major, minor) < (6, 10):
                print(f"  [WARNING] Version {version} is too old. Need >= 6.10.0")
                print("  Upgrading PyInstaller...")
                subprocess.run([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pyinstaller'], check=False)
        else:
            print("  [ERROR] PyInstaller not available")
            print("  Installing PyInstaller...")
            subprocess.run([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pyinstaller'], check=False)
    except Exception as e:
        print(f"  [ERROR] {e}")
        return 1
    
    print()
    
    # Step 2: Build
    print("Step 2: Building application...")
    print("  This may take several minutes...")
    print()
    
    build_script = project_root / 'scripts' / 'build_pyinstaller.py'
    result = subprocess.run(
        [sys.executable, str(build_script)],
        cwd=project_root,
        text=True
    )
    
    if result.returncode != 0:
        print()
        print("[FAIL] Build failed!")
        return 1
    
    print()
    print("[OK] Build completed")
    print()
    
    # Step 3: Check build output for DLL messages
    print("Step 3: Checking build output...")
    print("  Look for these messages in the output above:")
    print("    [PyInstaller] Including Python DLL in binaries: python313.dll")
    print("    [PyInstaller] Final check: python313.dll is in binaries list")
    print()
    
    # Step 4: Verify executable
    print("Step 4: Verifying executable...")
    exe_name = 'CuePoint.exe' if platform.system() == 'Windows' else 'CuePoint'
    exe_path = project_root / 'dist' / exe_name
    
    if exe_path.exists():
        print(f"  [OK] Executable found: {exe_path}")
        print(f"  Size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
        
        # Simple check for DLL name
        python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
        with open(exe_path, 'rb') as f:
            data = f.read()
            if python_dll_name.encode('utf-8') in data:
                print(f"  [OK] Found '{python_dll_name}' reference in executable")
            else:
                print(f"  [WARNING] '{python_dll_name}' reference not found")
                print("  This might indicate the DLL is not bundled")
    else:
        print(f"  [FAIL] Executable not found: {exe_path}")
        return 1
    
    print()
    print("=" * 80)
    print("Next Steps")
    print("=" * 80)
    print("1. Test the executable: dist/CuePoint.exe")
    print("2. If DLL error persists, check the _MEI* temp directory")
    print("3. If DLL is not in temp directory, try one-directory mode")
    print("4. Run diagnostics: python scripts/diagnose_dll_issue.py")
    print()
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
