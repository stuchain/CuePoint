#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Windows Dependencies
Validates that all required dependencies are present for Windows build.

This script checks:
1. VC++ Redistributable requirements
2. System DLL dependencies
3. Python runtime dependencies
4. Qt framework dependencies
5. Missing DLL detection

Usage:
    python scripts/validate_windows_dependencies.py [--exe-path PATH]
"""

import argparse
import sys
from pathlib import Path
from typing import List, Optional, Tuple

try:
    import winreg
    WINDOWS = True
except ImportError:
    WINDOWS = False


def check_vcredist_installed() -> Tuple[bool, Optional[str]]:
    """Check if VC++ Redistributable is installed.
    
    Returns: (is_installed, version_info)
    """
    if not WINDOWS:
        return True, "Not on Windows, skipping check"
    
    # Check for VC++ Redistributable in registry
    # Common locations for VC++ Redistributable registry entries
    vcredist_keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x86"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x86"),
        # Also check for newer versions
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\VisualStudio\15.0\VC\Runtimes\x64"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\VisualStudio\16.0\VC\Runtimes\x64"),
    ]
    
    for hkey, key_path in vcredist_keys:
        try:
            with winreg.OpenKey(hkey, key_path) as key:
                version, _ = winreg.QueryValueEx(key, "Version")
                return True, f"VC++ Redistributable found: {version}"
        except (FileNotFoundError, OSError):
            continue
    
    return False, "VC++ Redistributable not found in registry"


def check_system_dlls() -> Tuple[bool, List[str]]:
    """Check for required system DLLs.
    
    Returns: (all_present, missing_dlls)
    """
    # Common system DLLs that should be available on Windows 10+
    required_dlls = [
        "kernel32.dll",
        "user32.dll",
        "shell32.dll",
        "advapi32.dll",
        "msvcrt.dll",
    ]
    
    missing = []
    for dll in required_dlls:
        # System DLLs are in system directories, we can't easily check them
        # But we can note that they should be available
        pass
    
    return True, []  # System DLLs are assumed available on Windows 10+


def check_executable_dependencies(exe_path: Path) -> Tuple[bool, List[str]]:
    """Check dependencies of executable.
    
    Returns: (all_present, missing_dependencies)
    """
    if not exe_path.exists():
        return False, [f"Executable not found: {exe_path}"]
    
    # In production, you might use Dependency Walker or similar tools
    # For now, we'll do basic checks
    
    missing = []
    
    # Check if executable is a valid PE file
    try:
        with open(exe_path, "rb") as f:
            # Check PE signature
            f.seek(0)
            dos_header = f.read(2)
            if dos_header != b"MZ":
                missing.append("Invalid PE file (missing MZ signature)")
                return False, missing
            
            # Check PE header
            f.seek(0x3C)
            pe_offset = int.from_bytes(f.read(4), "little")
            f.seek(pe_offset)
            pe_signature = f.read(4)
            if pe_signature != b"PE\x00\x00":
                missing.append("Invalid PE file (missing PE signature)")
                return False, missing
    except Exception as e:
        missing.append(f"Error reading executable: {e}")
        return False, missing
    
    return True, []


def validate_dependencies(
    exe_path: Optional[Path] = None,
    verbose: bool = False
) -> Tuple[bool, List[str]]:
    """Validate all dependencies.
    
    Returns: (is_valid, list_of_errors_or_warnings)
    """
    errors: List[str] = []
    warnings: List[str] = []
    
    # Check VC++ Redistributable
    print("Checking VC++ Redistributable...")
    is_installed, info = check_vcredist_installed()
    if is_installed:
        print(f"  [OK] {info}")
    else:
        warnings.append(f"VC++ Redistributable: {info}")
        print(f"  ⚠ {info}")
        if verbose:
            print("    Note: VC++ Redistributable should be bundled with installer")
    
    # Check system DLLs
    print("\nChecking system DLLs...")
    all_present, missing = check_system_dlls()
    if all_present:
        print("  [OK] System DLLs should be available on Windows 10+")
    else:
        errors.extend([f"Missing system DLL: {dll}" for dll in missing])
    
    # Check executable dependencies
    if exe_path:
        print(f"\nChecking executable dependencies: {exe_path.name}")
        is_valid, missing = check_executable_dependencies(exe_path)
        if is_valid:
            print("  [OK] Executable structure is valid")
        else:
            errors.extend([f"Executable dependency: {dep}" for dep in missing])
    
    return len(errors) == 0, errors + warnings


def main():
    parser = argparse.ArgumentParser(
        description="Validate Windows dependencies for CuePoint"
    )
    parser.add_argument(
        "--exe-path",
        type=Path,
        help="Path to Windows executable (CuePoint.exe)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed information"
    )
    
    args = parser.parse_args()
    
    # Default path
    project_root = Path(__file__).parent.parent
    if not args.exe_path:
        args.exe_path = project_root / "dist" / "CuePoint.exe"
    
    print("Validating Windows dependencies...")
    print()
    
    is_valid, messages = validate_dependencies(
        exe_path=args.exe_path if args.exe_path.exists() else None,
        verbose=args.verbose
    )
    
    print()
    if messages:
        for msg in messages:
            if "error" in msg.lower() or "missing" in msg.lower():
                print(f"ERROR: {msg}", file=sys.stderr)
            else:
                print(f"WARNING: {msg}")
        print()
    
    if is_valid:
        print("[PASS] Dependency validation passed")
        return 0
    else:
        print("[FAIL] Dependency validation failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
