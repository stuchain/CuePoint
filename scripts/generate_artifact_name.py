#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate artifact names following naming convention

Usage:
    python scripts/generate_artifact_name.py <platform> [--architecture ARCH] [--variant VARIANT] [--extension EXT]

Examples:
    python scripts/generate_artifact_name.py macos
    python scripts/generate_artifact_name.py windows --variant setup
    python scripts/generate_artifact_name.py windows --variant portable
"""

import argparse
import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __version__
except ImportError:
    print("Error: Could not import version module")
    sys.exit(1)


def generate_artifact_name(platform, architecture='universal', variant=None, extension=None):
    """Generate artifact name following convention
    
    Format: CuePoint-vX.Y.Z-{platform}-{architecture}[-{variant}].{extension}
    
    Args:
        platform: 'macos' or 'windows'
        architecture: 'universal', 'arm64', 'x64', 'x86' (default: 'universal' for macos, 'x64' for windows)
        variant: Optional variant like 'setup', 'portable', 'debug', 'beta'
        extension: Optional extension override
    
    Returns:
        Artifact name string
    """
    product = "CuePoint"
    version = __version__.replace('v', '')  # Remove 'v' prefix if present
    
    # Set default architecture if not provided
    if architecture == 'universal' and platform == 'windows':
        architecture = 'x64'
    
    # Determine extension if not provided
    if not extension:
        if platform == 'macos':
            extension = '.dmg'
        elif platform == 'windows':
            if variant == 'portable':
                extension = '.zip'
            elif variant == 'setup':
                extension = '-setup.exe'
            else:
                extension = '.exe'
        else:
            raise ValueError(f"Unknown platform: {platform}")
    
    # Build name
    name_parts = [product, f"v{version}", platform, architecture]
    
    # Add variant if specified and not already in extension
    if variant and variant != 'setup':  # 'setup' is part of extension
        name_parts.append(variant)
    
    name = '-'.join(name_parts) + extension
    return name


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Generate artifact name following naming convention',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/generate_artifact_name.py macos
  python scripts/generate_artifact_name.py windows --variant setup
  python scripts/generate_artifact_name.py windows --variant portable
        """
    )
    parser.add_argument('platform', choices=['macos', 'windows'],
                       help='Target platform')
    parser.add_argument('--architecture', default=None,
                       choices=['universal', 'arm64', 'x64', 'x86'],
                       help='Target architecture (default: universal for macos, x64 for windows)')
    parser.add_argument('--variant',
                       choices=['setup', 'portable', 'debug', 'beta'],
                       help='Artifact variant')
    parser.add_argument('--extension',
                       help='File extension override')
    
    args = parser.parse_args()
    
    # Set default architecture
    if args.architecture is None:
        if args.platform == 'macos':
            args.architecture = 'universal'
        else:
            args.architecture = 'x64'
    
    try:
        name = generate_artifact_name(
            args.platform,
            args.architecture,
            args.variant,
            args.extension
        )
        print(name)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
