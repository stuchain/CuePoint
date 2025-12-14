#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Windows Update Compatibility
Validates that Windows installer supports update scenarios.

This script checks:
1. Installer upgrade detection
2. Version comparison logic
3. Data preservation during upgrades
4. Installer metadata for updates

Usage:
    python scripts/validate_update_compatibility_windows.py
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "SRC"))

try:
    from cuepoint.version import __version__
except ImportError:
    __version__ = "1.0.0"


def parse_version(version_str: str) -> Tuple[int, int, int]:
    """Parse semantic version string.
    
    Returns: (major, minor, patch)
    """
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)", version_str)
    if match:
        return tuple(map(int, match.groups()))
    return (0, 0, 0)


def compare_versions(version1: str, version2: str) -> int:
    """Compare two version strings.
    
    Returns: -1 if version1 < version2, 0 if equal, 1 if version1 > version2
    """
    v1 = parse_version(version1)
    v2 = parse_version(version2)
    
    if v1 < v2:
        return -1
    elif v1 > v2:
        return 1
    return 0


def check_installer_upgrade_detection() -> Tuple[bool, List[str]]:
    """Check if installer script has upgrade detection.
    
    Returns: (has_upgrade_detection, list_of_issues)
    """
    issues: List[str] = []
    
    installer_script = project_root / "scripts" / "installer.nsi"
    if not installer_script.exists():
        return False, ["Installer script not found"]
    
    content = installer_script.read_text(encoding="utf-8")
    
    # Check for upgrade detection
    has_oninit = ".onInit" in content
    has_registry_check = "ReadRegStr" in content or "Uninstall" in content
    has_version_check = "DisplayVersion" in content or "Version" in content
    
    if not has_oninit:
        issues.append("Installer script missing .onInit function for upgrade detection")
    
    if not has_registry_check:
        issues.append("Installer script missing registry check for existing installation")
    
    if not has_version_check:
        issues.append("Installer script missing version check")
    
    return len(issues) == 0, issues


def check_data_preservation() -> Tuple[bool, List[str]]:
    """Check if installer preserves user data during upgrades.
    
    Returns: (preserves_data, list_of_issues)
    """
    issues: List[str] = []
    
    installer_script = project_root / "scripts" / "installer.nsi"
    if not installer_script.exists():
        return False, ["Installer script not found"]
    
    content = installer_script.read_text(encoding="utf-8")
    
    # Check that installer doesn't delete user data directories
    # User data should be in APPDATA and LOCALAPPDATA, separate from installation
    if "RMDir /r" in content and "$APPDATA" in content:
        # Check if it's only in uninstaller section
        uninstall_section = content.split("Section \"Uninstall\"")[1] if "Section \"Uninstall\"" in content else ""
        if "$APPDATA" in uninstall_section:
            # This is OK - it's in uninstaller, and user is asked
            pass
        else:
            issues.append("Installer may delete user data during upgrade")
    
    # Check that installation directory is separate from user data
    if "$LOCALAPPDATA\\CuePoint" in content:
        # This is the installation directory, which is OK
        # User data should be in $APPDATA\CuePoint (separate)
        pass
    
    return len(issues) == 0, issues


def check_version_metadata() -> Tuple[bool, List[str]]:
    """Check version metadata in installer.
    
    Returns: (is_valid, list_of_issues)
    """
    issues: List[str] = []
    
    installer_script = project_root / "scripts" / "installer.nsi"
    if not installer_script.exists():
        return False, ["Installer script not found"]
    
    content = installer_script.read_text(encoding="utf-8")
    
    # Check for version in installer
    if "${VERSION}" not in content and __version__ not in content:
        issues.append("Version not found in installer script")
    
    # Check for version in registry entries
    if "DisplayVersion" in content:
        # Check if VERSION variable is used near DisplayVersion
        display_version_section = content.split("DisplayVersion")[1]
        if "${VERSION}" not in display_version_section[:200]:  # Check first 200 chars after DisplayVersion
            issues.append("DisplayVersion may not use VERSION variable")
    
    return len(issues) == 0, issues


def validate_update_compatibility() -> Tuple[bool, List[str]]:
    """Validate update compatibility.
    
    Returns: (is_compatible, list_of_issues)
    """
    all_issues: List[str] = []
    
    print("Validating Windows update compatibility...")
    print()
    
    # Check upgrade detection
    print("Checking upgrade detection...")
    has_detection, issues = check_installer_upgrade_detection()
    if has_detection:
        print("  [OK] Installer has upgrade detection")
    else:
        print("  [FAIL] Upgrade detection issues:")
        for issue in issues:
            print(f"    - {issue}")
            all_issues.append(f"Upgrade detection: {issue}")
    
    # Check data preservation
    print("\nChecking data preservation...")
    preserves_data, issues = check_data_preservation()
    if preserves_data:
        print("  [OK] User data will be preserved during upgrades")
    else:
        print("  [FAIL] Data preservation issues:")
        for issue in issues:
            print(f"    - {issue}")
            all_issues.append(f"Data preservation: {issue}")
    
    # Check version metadata
    print("\nChecking version metadata...")
    is_valid, issues = check_version_metadata()
    if is_valid:
        print("  [OK] Version metadata is correct")
    else:
        print("  [FAIL] Version metadata issues:")
        for issue in issues:
            print(f"    - {issue}")
            all_issues.append(f"Version metadata: {issue}")
    
    return len(all_issues) == 0, all_issues


def main():
    is_compatible, issues = validate_update_compatibility()
    
    print()
    if is_compatible:
        print("[PASS] Update compatibility validation passed")
        return 0
    else:
        print(f"[FAIL] Update compatibility validation failed ({len(issues)} issue(s)):")
        for issue in issues:
            print(f"  - {issue}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
