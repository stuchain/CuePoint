#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate code signing for artifacts

Usage:
    python scripts/validate_signing.py [macos|windows] [--artifact <path>]
"""

import argparse
import platform
import subprocess
import sys
from pathlib import Path


def validate_macos_signing(app_path):
    """Validate macOS app signing
    
    Args:
        app_path: Path to .app bundle or DMG
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    app_path = Path(app_path)
    if not app_path.exists():
        return False, f"File not found: {app_path}"
    
    # Verify signing
    result = subprocess.run(
        ['codesign', '--verify', '--verbose', str(app_path)],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode != 0:
        return False, f"Signing validation failed: {result.stderr}"
    
    # Get signature details
    result = subprocess.run(
        ['codesign', '-dvv', str(app_path)],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode != 0:
        return False, f"Could not get signature details: {result.stderr}"
    
    # Check for Developer ID identity
    if 'Developer ID Application' not in result.stdout:
        return False, "Invalid signing identity (expected Developer ID Application)"
    
    # Check for hardened runtime
    if 'runtime' not in result.stdout:
        return False, "Hardened runtime not enabled"
    
    return True, "Signing verified"


def validate_windows_signing(exe_path):
    """Validate Windows executable signing
    
    Args:
        exe_path: Path to .exe file
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    exe_path = Path(exe_path)
    if not exe_path.exists():
        return False, f"File not found: {exe_path}"
    
    # Verify signing
    result = subprocess.run(
        ['signtool', 'verify', '/pa', '/v', str(exe_path)],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode != 0:
        return False, f"Signing validation failed: {result.stdout}"
    
    return True, "Signing verified"


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Validate code signing for artifacts'
    )
    parser.add_argument('platform', nargs='?',
                       choices=['macos', 'windows'],
                       help='Target platform (auto-detect if not specified)')
    parser.add_argument('--artifact',
                       help='Path to artifact (default: auto-detect in dist/)')
    
    args = parser.parse_args()
    
    # Auto-detect platform if not specified
    if not args.platform:
        if platform.system() == 'Darwin':
            args.platform = 'macos'
        elif platform.system() == 'Windows':
            args.platform = 'windows'
        else:
            print("Error: Could not auto-detect platform", file=sys.stderr)
            sys.exit(1)
    
    # Auto-detect artifact if not specified
    if not args.artifact:
        dist_path = Path('dist')
        if args.platform == 'macos':
            # Look for .app or .dmg
            artifacts = list(dist_path.glob('*.app')) + list(dist_path.glob('*.dmg'))
        else:
            # Look for .exe
            artifacts = list(dist_path.glob('*.exe'))
        
        if not artifacts:
            print("Error: No artifacts found in dist/", file=sys.stderr)
            sys.exit(1)
        
        args.artifact = str(artifacts[0])
    
    # Validate
    if args.platform == 'macos':
        valid, message = validate_macos_signing(args.artifact)
    else:
        valid, message = validate_windows_signing(args.artifact)
    
    if valid:
        print(f"✓ {message}")
        sys.exit(0)
    else:
        print(f"✗ {message}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
