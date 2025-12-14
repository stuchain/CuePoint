#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate macOS notarization

Usage:
    python scripts/validate_notarization.py [--dmg <dmg_path>]
"""

import argparse
import subprocess
import sys
from pathlib import Path


def validate_notarization(dmg_path):
    """Validate DMG notarization
    
    Args:
        dmg_path: Path to DMG file
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    dmg_path = Path(dmg_path)
    if not dmg_path.exists():
        return False, f"DMG not found: {dmg_path}"
    
    # Check stapling
    result = subprocess.run(
        ['xcrun', 'stapler', 'validate', str(dmg_path)],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode != 0:
        return False, f"Notarization validation failed: {result.stderr}"
    
    # Check for staple
    if 'stapled' not in result.stdout.lower() and 'valid' not in result.stdout.lower():
        return False, "Notarization staple not found"
    
    return True, "Notarization verified"


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Validate macOS notarization'
    )
    parser.add_argument('--dmg',
                       help='Path to DMG file (default: auto-detect in dist/)')
    
    args = parser.parse_args()
    
    # Auto-detect DMG if not specified
    if not args.dmg:
        dist_path = Path('dist')
        dmgs = list(dist_path.glob('*.dmg'))
        
        if not dmgs:
            print("Error: No DMG files found in dist/", file=sys.stderr)
            sys.exit(1)
        
        args.dmg = str(dmgs[0])
    
    # Validate
    valid, message = validate_notarization(args.dmg)
    
    if valid:
        print(f"✓ {message}")
        sys.exit(0)
    else:
        print(f"✗ {message}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
