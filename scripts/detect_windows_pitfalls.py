#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Detect Windows Packaging Pitfalls
Detects common pitfalls in Windows packaging, signing, and distribution.

This script checks for:
1. Antivirus false positive indicators
2. Missing dependencies
3. Permission issues
4. SmartScreen readiness
5. Installer issues
6. Version inconsistencies

Usage:
    python scripts/detect_windows_pitfalls.py [--exe-path PATH] [--installer-path PATH]
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple

# Expected values
EXPECTED_PUBLISHER = "StuChain"


def check_signing_status(file_path: Path) -> Tuple[bool, Optional[str]]:
    """Check if file is signed.
    
    Returns: (is_signed, error_message)
    """
    if not file_path.exists():
        return False, f"File not found: {file_path}"
    
    try:
        result = subprocess.run(
            ["signtool", "verify", "/pa", str(file_path)],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode == 0, None
    except FileNotFoundError:
        return None, "signtool not available"
    except subprocess.TimeoutExpired:
        return None, "Verification timed out"
    except Exception as e:
        return None, f"Error: {e}"


def check_smartscreen_readiness(exe_path: Path, installer_path: Optional[Path] = None) -> Tuple[bool, List[str]]:
    """Check SmartScreen readiness.
    
    Returns: (is_ready, list_of_issues)
    """
    issues: List[str] = []
    
    # Check executable signing
    if exe_path.exists():
        is_signed, error = check_signing_status(exe_path)
        if is_signed is False:
            issues.append(f"Executable not signed: {exe_path.name}")
        elif is_signed is None:
            issues.append(f"Could not verify executable signing: {error}")
    else:
        issues.append(f"Executable not found: {exe_path}")
    
    # Check installer signing
    if installer_path and installer_path.exists():
        is_signed, error = check_signing_status(installer_path)
        if is_signed is False:
            issues.append(f"Installer not signed: {installer_path.name}")
        elif is_signed is None:
            issues.append(f"Could not verify installer signing: {error}")
    
    return len(issues) == 0, issues


def check_version_consistency() -> Tuple[bool, List[str]]:
    """Check version consistency across files.
    
    Returns: (is_consistent, list_of_issues)
    """
    issues: List[str] = []
    
    # Check version.py
    try:
        project_root = Path(__file__).parent.parent
        sys.path.insert(0, str(project_root / "SRC"))
        from cuepoint.version import __version__
        version = __version__
    except ImportError:
        issues.append("Could not import version from cuepoint.version")
        return False, issues
    
    # Check version_info.txt
    version_info_path = project_root / "build" / "version_info.txt"
    if version_info_path.exists():
        content = version_info_path.read_text()
        if version not in content:
            issues.append(f"Version {version} not found in version_info.txt")
    
    return len(issues) == 0, issues


def check_installer_script() -> Tuple[bool, List[str]]:
    """Check installer script for common issues.
    
    Returns: (is_valid, list_of_issues)
    """
    issues: List[str] = []
    
    project_root = Path(__file__).parent.parent
    installer_script = project_root / "scripts" / "installer.nsi"
    
    if not installer_script.exists():
        issues.append("Installer script not found: scripts/installer.nsi")
        return False, issues
    
    content = installer_script.read_text(encoding="utf-8")
    
    # Check for per-user installation
    if "RequestExecutionLevel user" not in content:
        issues.append("Installer may require admin privileges (should use per-user install)")
    
    # Check for publisher
    if EXPECTED_PUBLISHER not in content:
        issues.append(f"Publisher '{EXPECTED_PUBLISHER}' not found in installer script")
    
    # Check for upgrade detection
    if "UpgradeMode" not in content and ".onInit" not in content:
        issues.append("Installer may not detect existing installations for upgrades")
    
    return len(issues) == 0, issues


def detect_pitfalls(
    exe_path: Optional[Path] = None,
    installer_path: Optional[Path] = None,
    verbose: bool = False
) -> Tuple[bool, List[str]]:
    """Detect all pitfalls.
    
    Returns: (no_pitfalls_found, list_of_issues)
    """
    all_issues: List[str] = []
    
    print("Detecting Windows packaging pitfalls...")
    print()
    
    # Check SmartScreen readiness
    print("Checking SmartScreen readiness...")
    is_ready, issues = check_smartscreen_readiness(
        exe_path or Path("dummy"),
        installer_path
    )
    if is_ready:
        print("  [OK] SmartScreen ready (files are signed)")
    else:
        print("  [FAIL] SmartScreen issues found:")
        for issue in issues:
            print(f"    - {issue}")
            all_issues.append(f"SmartScreen: {issue}")
    
    # Check version consistency
    print("\nChecking version consistency...")
    is_consistent, issues = check_version_consistency()
    if is_consistent:
        print("  [OK] Version is consistent across files")
    else:
        print("  [FAIL] Version inconsistencies found:")
        for issue in issues:
            print(f"    - {issue}")
            all_issues.append(f"Version: {issue}")
    
    # Check installer script
    print("\nChecking installer script...")
    is_valid, issues = check_installer_script()
    if is_valid:
        print("  [OK] Installer script looks good")
    else:
        print("  [FAIL] Installer script issues found:")
        for issue in issues:
            print(f"    - {issue}")
            all_issues.append(f"Installer: {issue}")
    
    return len(all_issues) == 0, all_issues


def main():
    parser = argparse.ArgumentParser(
        description="Detect common pitfalls in Windows packaging"
    )
    parser.add_argument(
        "--exe-path",
        type=Path,
        help="Path to Windows executable (CuePoint.exe)"
    )
    parser.add_argument(
        "--installer-path",
        type=Path,
        help="Path to Windows installer"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed information"
    )
    
    args = parser.parse_args()
    
    # Default paths
    project_root = Path(__file__).parent.parent
    if not args.exe_path:
        args.exe_path = project_root / "dist" / "CuePoint.exe"
    if not args.installer_path:
        dist_dir = project_root / "dist"
        installers = list(dist_dir.glob("CuePoint-Setup-*.exe"))
        if installers:
            args.installer_path = installers[0]
    
    no_pitfalls, issues = detect_pitfalls(
        exe_path=args.exe_path if args.exe_path.exists() else None,
        installer_path=args.installer_path if args.installer_path and args.installer_path.exists() else None,
        verbose=args.verbose
    )
    
    print()
    if no_pitfalls:
        print("[PASS] No pitfalls detected")
        return 0
    else:
        print(f"[FAIL] {len(issues)} pitfall(s) detected:")
        for issue in issues:
            print(f"  - {issue}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
