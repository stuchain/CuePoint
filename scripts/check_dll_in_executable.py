#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Check if Python DLL is in the built executable

This script helps diagnose if the DLL is actually bundled in the executable.
Uses PyInstaller's archive viewer to properly inspect the executable.
"""

import sys
import subprocess
import tempfile
import shutil
from pathlib import Path

def find_zip_offset(exe_path):
    """Find the ZIP archive offset in PyInstaller executable."""
    # PyInstaller appends ZIP to end of bootloader
    # Look for ZIP file signature (PK\x03\x04) from the end
    # Also check for PK\x05\x06 (end of central directory) which is more reliable
    with open(exe_path, 'rb') as f:
        data = f.read()
        # Search backwards for ZIP signatures
        # Try multiple signatures
        signatures = [
            (b'PK\x05\x06', 'End of Central Directory'),
            (b'PK\x03\x04', 'Local File Header'),
            (b'PK\x01\x02', 'Central Directory File Header'),
        ]
        
        for sig, name in signatures:
            offset = data.rfind(sig)
            if offset > 0:
                print(f"  Found {name} signature at offset: {offset}")
                # For PK\x05\x06, the archive starts before this
                # For PK\x03\x04, this is the start
                if sig == b'PK\x05\x06':
                    # Read the end of central directory to find archive start
                    # The offset is stored at position 16-19 (4 bytes, little-endian)
                    try:
                        eocd_offset = offset
                        f.seek(eocd_offset + 16)
                        archive_start = int.from_bytes(f.read(4), 'little')
                        return archive_start
                    except:
                        # Fallback: assume archive starts some bytes before EOCD
                        return max(0, offset - 100000)  # Rough estimate
                return offset
        return None

def check_exe_with_pyi_archive_viewer(exe_path):
    """Use PyInstaller's archive viewer to check contents."""
    try:
        # Try to use pyi-archive_viewer
        result = subprocess.run(
            ['pyi-archive_viewer', str(exe_path)],
            input='l\nq\n',  # List files, then quit
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            output = result.stdout + result.stderr
            # Look for python313.dll in the output
            if 'python313.dll' in output.lower():
                print("Found python313.dll in archive viewer output")
                # Extract relevant lines
                lines = output.split('\n')
                for line in lines:
                    if 'python313.dll' in line.lower() or 'python' in line.lower() and '.dll' in line.lower():
                        print(f"  {line.strip()}")
                return True
        return False
    except FileNotFoundError:
        return None  # pyi-archive_viewer not found
    except Exception as e:
        print(f"Error using archive viewer: {e}")
        return None

def check_exe_for_dll(exe_path):
    """Check if python313.dll is in the executable."""
    exe_path = Path(exe_path)
    
    if not exe_path.exists():
        print(f"Error: Executable not found: {exe_path}")
        return False
    
    print(f"Checking executable: {exe_path}")
    print(f"Size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
    print()
    
    # Method 1: Try PyInstaller's archive viewer
    print("Method 1: Using PyInstaller archive viewer...")
    result = check_exe_with_pyi_archive_viewer(exe_path)
    if result is True:
        print()
        print("[OK] python313.dll FOUND in executable!")
        return True
    elif result is False:
        print("[FAIL] python313.dll NOT FOUND in executable!")
        return False
    else:
        print("  pyi-archive_viewer not found, trying alternative method...")
    
    # Method 2: Find ZIP offset and read archive
    print()
    print("Method 2: Searching for ZIP archive in executable...")
    zip_offset = find_zip_offset(exe_path)
    
    if zip_offset:
        print(f"  Found ZIP archive at offset: {zip_offset}")
        try:
            import zipfile
            with open(exe_path, 'rb') as f:
                f.seek(zip_offset)
                with zipfile.ZipFile(f, 'r') as zip_ref:
                    file_list = zip_ref.namelist()
                    
                    # Look for python DLLs
                    python_dlls = [f for f in file_list if 'python' in f.lower() and f.endswith('.dll')]
                    
                    print(f"  Found {len(python_dlls)} Python-related DLLs:")
                    for dll in python_dlls[:10]:  # Show first 10
                        print(f"    - {dll}")
                    if len(python_dlls) > 10:
                        print(f"    ... and {len(python_dlls) - 10} more")
                    
                    # Check specifically for python313.dll
                    python313_dlls = [f for f in file_list if 'python313.dll' in f.lower()]
                    
                    if python313_dlls:
                        print()
                        print("[OK] python313.dll FOUND in executable!")
                        for dll in python313_dlls:
                            print(f"   Location: {dll}")
                        return True
                    else:
                        print()
                        print("[FAIL] python313.dll NOT FOUND in executable!")
                        return False
        except Exception as e:
            print(f"  Error reading ZIP archive: {e}")
            return False
    else:
        print("  Could not find ZIP archive signature")
        print("  This might not be a PyInstaller executable")
        return False


if __name__ == '__main__':
    import platform
    
    # Default executable path
    if len(sys.argv) > 1:
        exe_path = Path(sys.argv[1])
    else:
        project_root = Path(__file__).parent.parent
        exe_name = 'CuePoint.exe' if platform.system() == 'Windows' else 'CuePoint'
        exe_path = project_root / 'dist' / exe_name
    
    print("=" * 80)
    print("Python DLL Checker for PyInstaller Executable")
    print("=" * 80)
    print()
    
    found = check_exe_for_dll(exe_path)
    
    print()
    print("=" * 80)
    if found:
        print("Result: DLL is in executable")
        print()
        print("If you're still getting DLL errors, the issue is with extraction,")
        print("not bundling. Try one-directory mode or check PyInstaller bootloader.")
    else:
        print("Result: DLL is NOT in executable")
        print()
        print("The DLL is not being bundled. Check:")
        print("1. Build logs for DLL inclusion messages")
        print("2. Spec file configuration")
        print("3. PyInstaller version (must be >= 6.10.0)")
    print("=" * 80)
    
    sys.exit(0 if found else 1)
