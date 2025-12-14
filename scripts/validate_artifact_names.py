#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate artifact names match naming convention

Usage:
    python scripts/validate_artifact_names.py <name>
    python scripts/validate_artifact_names.py --check-all
"""

import argparse
import re
import sys
from pathlib import Path

# Naming pattern: CuePoint-vX.Y.Z-{platform}-{architecture}[-{variant}].{extension}
PATTERN = r'^CuePoint-v(\d+\.\d+\.\d+)-(macos|windows)-(universal|arm64|x64|x86)(-(setup|portable|debug|beta))?\.(dmg|exe|zip|msi|pkg)$'


def validate_name(name):
    """Validate artifact name matches convention
    
    Args:
        name: Artifact name to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    match = re.match(PATTERN, name)
    if not match:
        return False, "Name does not match pattern"
    
    version = match.group(1)
    platform = match.group(2)
    architecture = match.group(3)
    variant = match.group(5)
    extension = match.group(6)
    
    # Validate platform-architecture combinations
    if platform == 'macos' and architecture == 'x86':
        return False, "macOS does not support x86"
    if platform == 'windows' and architecture == 'arm64':
        return False, "Windows arm64 not supported yet"
    
    # Validate extension-platform combinations
    if platform == 'macos' and extension not in ['dmg', 'zip', 'pkg']:
        return False, f"Invalid extension for macOS: {extension}"
    if platform == 'windows' and extension not in ['exe', 'msi', 'zip']:
        return False, f"Invalid extension for Windows: {extension}"
    
    # Validate variant-extension combinations
    if variant == 'portable' and extension != 'zip':
        return False, "Portable variant must use .zip extension"
    if variant == 'setup' and extension != 'exe':
        return False, "Setup variant must use .exe extension"
    
    return True, "Name is valid"


def check_all_artifacts():
    """Check all artifacts in dist/ directory"""
    dist_path = Path('dist')
    if not dist_path.exists():
        print("No dist/ directory found")
        return 0
    
    errors = []
    for file_path in dist_path.iterdir():
        if file_path.is_file():
            valid, message = validate_name(file_path.name)
            if not valid:
                errors.append((file_path.name, message))
    
    if errors:
        print("Invalid artifact names found:")
        for name, message in errors:
            print(f"  [ERROR] {name}: {message}")
        return len(errors)
    else:
        print("[OK] All artifact names are valid")
        return 0


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Validate artifact names match naming convention'
    )
    parser.add_argument('name', nargs='?',
                       help='Artifact name to validate')
    parser.add_argument('--check-all', action='store_true',
                       help='Check all artifacts in dist/ directory')
    
    args = parser.parse_args()
    
    if args.check_all:
        sys.exit(check_all_artifacts())
    
    if not args.name:
        parser.print_help()
        sys.exit(1)
    
    valid, message = validate_name(args.name)
    
    if valid:
        print(f"[OK] {args.name} is valid")
        sys.exit(0)
    else:
        print(f"[ERROR] {args.name} is invalid: {message}")
        sys.exit(1)


if __name__ == '__main__':
    main()
