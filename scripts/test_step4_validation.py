#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Step 4 Validation Scripts
Runs all Step 4 validation scripts to ensure Windows packaging is correct.

This script runs:
1. Publisher identity validation
2. Signing validation
3. Dependency validation
4. Update compatibility validation
5. Pitfall detection

Usage:
    python scripts/test_step4_validation.py [--exe-path PATH] [--installer-path PATH]
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple

# Validation scripts to run
VALIDATION_SCRIPTS = [
    ("Publisher Identity", "validate_publisher_identity.py"),
    ("Windows Signing", "validate_windows_signing.py"),
    ("Windows Dependencies", "validate_windows_dependencies.py"),
    ("Update Compatibility", "validate_update_compatibility_windows.py"),
    ("Pitfall Detection", "detect_windows_pitfalls.py"),
]


def run_validation_script(script_name: str, script_path: Path, args: List[str]) -> Tuple[bool, str]:
    """Run a validation script.
    
    Returns: (success, output)
    """
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)] + args,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        output = result.stdout + result.stderr
        success = result.returncode == 0
        
        return success, output
    except subprocess.TimeoutExpired:
        return False, f"Script timed out: {script_name}"
    except Exception as e:
        return False, f"Error running script: {e}"


def test_step4_validation(
    exe_path: Optional[Path] = None,
    installer_path: Optional[Path] = None,
    verbose: bool = False
) -> Tuple[bool, List[str]]:
    """Run all Step 4 validation scripts.
    
    Returns: (all_passed, list_of_failures)
    """
    failures: List[str] = []
    
    scripts_dir = Path(__file__).parent
    
    # Build common arguments
    common_args = []
    if exe_path:
        common_args.extend(["--exe-path", str(exe_path)])
    if installer_path:
        common_args.extend(["--installer-path", str(installer_path)])
    if verbose:
        common_args.append("--verbose")
    
    print("=" * 70)
    print("Step 4 Validation Test Suite")
    print("=" * 70)
    print()
    
    for test_name, script_file in VALIDATION_SCRIPTS:
        script_path = scripts_dir / script_file
        
        if not script_path.exists():
            print(f"⚠ {test_name}: Script not found ({script_file})")
            failures.append(f"{test_name}: Script not found")
            continue
        
        print(f"Running: {test_name}...")
        print("-" * 70)
        
        success, output = run_validation_script(test_name, script_path, common_args)
        
        if success:
            print(f"[PASS] {test_name}: PASSED")
            if verbose and output:
                print(output)
        else:
            print(f"[FAIL] {test_name}: FAILED")
            print(output)
            failures.append(f"{test_name}: Validation failed")
        
        print()
    
    return len(failures) == 0, failures


def main():
    parser = argparse.ArgumentParser(
        description="Test all Step 4 validation scripts"
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
        help="Show detailed output from each validation script"
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
    
    all_passed, failures = test_step4_validation(
        exe_path=args.exe_path if args.exe_path.exists() else None,
        installer_path=args.installer_path if args.installer_path and args.installer_path.exists() else None,
        verbose=args.verbose
    )
    
    print("=" * 70)
    if all_passed:
        print("[PASS] All Step 4 validations passed!")
        return 0
    else:
        print(f"[FAIL] {len(failures)} validation(s) failed:")
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
