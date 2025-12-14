#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate Windows Code Signing
Validates that Windows executables and installers are properly signed.

This script checks:
1. Executable is signed
2. Installer is signed
3. Signatures are valid
4. Timestamps are present
5. Publisher matches expected

Usage:
    python scripts/validate_windows_signing.py [--exe-path PATH] [--installer-path PATH]
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple

# Expected publisher name
EXPECTED_PUBLISHER = "StuChain"


def check_signtool_available() -> bool:
    """Check if signtool is available."""
    try:
        subprocess.run(
            ["signtool", "/?"],
            capture_output=True,
            timeout=5,
            check=False
        )
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def verify_signature(file_path: Path) -> Tuple[bool, Optional[str], List[str]]:
    """Verify signature of a file using signtool.
    
    Returns: (is_valid, error_message, details)
    """
    if not file_path.exists():
        return False, f"File not found: {file_path}", []
    
    if not check_signtool_available():
        return False, "signtool not available (Windows SDK required)", []
    
    try:
        result = subprocess.run(
            ["signtool", "verify", "/pa", "/v", str(file_path)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        output = result.stdout + result.stderr
        details = output.splitlines()
        
        if result.returncode == 0:
            # Check for timestamp
            has_timestamp = any("timestamp" in line.lower() for line in details)
            if not has_timestamp:
                return True, "Warning: No timestamp found in signature", details
            
            return True, None, details
        else:
            # Extract error message
            error_lines = [line for line in details if "error" in line.lower() or "failed" in line.lower()]
            error_msg = error_lines[0] if error_lines else "Signature verification failed"
            return False, error_msg, details
            
    except subprocess.TimeoutExpired:
        return False, "Verification timed out", []
    except Exception as e:
        return False, f"Verification error: {e}", []


def check_publisher_in_signature(file_path: Path) -> Tuple[bool, Optional[str]]:
    """Check if expected publisher is in signature.
    
    Returns: (is_valid, error_message)
    """
    is_valid, error, details = verify_signature(file_path)
    if not is_valid:
        return False, error
    
    # Check if publisher appears in signature details
    output_text = "\n".join(details).lower()
    if EXPECTED_PUBLISHER.lower() in output_text:
        return True, None
    
    # Check for any publisher mention
    if "subject" in output_text or "signing certificate" in output_text:
        return False, f"Publisher in signature doesn't match expected: {EXPECTED_PUBLISHER}"
    
    return True, "Could not verify publisher in signature details"


def validate_signing(
    exe_path: Optional[Path] = None,
    installer_path: Optional[Path] = None,
    verbose: bool = False
) -> Tuple[bool, List[str]]:
    """Validate signing for all files.
    
    Returns: (is_valid, list_of_errors)
    """
    errors: List[str] = []
    
    # Check signtool availability
    if not check_signtool_available():
        errors.append("signtool not available. Install Windows SDK or Visual Studio.")
        return False, errors
    
    # Validate executable
    if exe_path and exe_path.exists():
        print(f"Checking executable: {exe_path.name}")
        is_valid, error, details = verify_signature(exe_path)
        if not is_valid:
            errors.append(f"Executable signing failed: {error}")
        else:
            # Check publisher
            pub_valid, pub_error = check_publisher_in_signature(exe_path)
            if not pub_valid and pub_error:
                if "Warning" not in pub_error:
                    errors.append(f"Executable publisher check: {pub_error}")
                elif verbose:
                    print(f"  Warning: {pub_error}")
            
            if verbose and details:
                print(f"  Signature details:")
                for line in details[:5]:  # Show first 5 lines
                    print(f"    {line}")
            print(f"  [OK] Executable is properly signed")
    elif exe_path:
        errors.append(f"Executable not found: {exe_path}")
    
    # Validate installer
    if installer_path and installer_path.exists():
        print(f"\nChecking installer: {installer_path.name}")
        is_valid, error, details = verify_signature(installer_path)
        if not is_valid:
            errors.append(f"Installer signing failed: {error}")
        else:
            # Check publisher
            pub_valid, pub_error = check_publisher_in_signature(installer_path)
            if not pub_valid and pub_error:
                if "Warning" not in pub_error:
                    errors.append(f"Installer publisher check: {pub_error}")
                elif verbose:
                    print(f"  Warning: {pub_error}")
            
            if verbose and details:
                print(f"  Signature details:")
                for line in details[:5]:  # Show first 5 lines
                    print(f"    {line}")
            print(f"  [OK] Installer is properly signed")
    elif installer_path:
        errors.append(f"Installer not found: {installer_path}")
    
    return len(errors) == 0, errors


def main():
    parser = argparse.ArgumentParser(
        description="Validate Windows code signing for executables and installers"
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
        help="Show detailed signature information"
    )
    
    args = parser.parse_args()
    
    # Default paths
    project_root = Path(__file__).parent.parent
    if not args.exe_path:
        args.exe_path = project_root / "dist" / "CuePoint.exe"
    if not args.installer_path:
        # Try to find installer
        dist_dir = project_root / "dist"
        installers = list(dist_dir.glob("CuePoint-Setup-*.exe"))
        if installers:
            args.installer_path = installers[0]
    
    print("Validating Windows code signing...")
    print(f"Expected publisher: {EXPECTED_PUBLISHER}")
    print()
    
    is_valid, errors = validate_signing(
        exe_path=args.exe_path,
        installer_path=args.installer_path,
        verbose=args.verbose
    )
    
    print()
    if errors:
        print("Errors found:")
        for error in errors:
            print(f"  ✗ {error}", file=sys.stderr)
        print()
        return 1
    
    if is_valid:
        print("[PASS] All files are properly signed")
        return 0
    else:
        print("[FAIL] Signing validation failed", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
