#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate checksums for build artifacts

Usage:
    python scripts/generate_checksums.py [--artifacts <path1> <path2> ...] [--output <output_path>] [--algorithms sha256,md5]
"""

import argparse
import hashlib
import sys
from pathlib import Path


def calculate_checksum(file_path, algorithm='sha256'):
    """Calculate checksum for a file
    
    Args:
        file_path: Path to file
        algorithm: Hash algorithm ('sha256' or 'md5')
    
    Returns:
        Hex digest string
    """
    hash_obj = hashlib.new(algorithm)
    
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            hash_obj.update(chunk)
    
    return hash_obj.hexdigest()


def generate_checksums(artifacts, algorithms=['sha256', 'md5']):
    """Generate checksums for artifacts
    
    Args:
        artifacts: List of artifact file paths
        algorithms: List of hash algorithms to use
    
    Returns:
        List of checksum strings in GNU coreutils format
    """
    checksums = []
    
    for artifact_path in artifacts:
        artifact = Path(artifact_path)
        if not artifact.exists():
            print(f"Warning: Artifact not found: {artifact_path}", file=sys.stderr)
            continue
        
        for algorithm in algorithms:
            try:
                checksum = calculate_checksum(artifact, algorithm)
                checksums.append(f"{algorithm.upper()} ({artifact.name}) = {checksum}")
            except Exception as e:
                print(f"Warning: Failed to calculate {algorithm} for {artifact_path}: {e}", file=sys.stderr)
    
    return checksums


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Generate checksums for build artifacts'
    )
    parser.add_argument('--artifacts', nargs='+',
                       help='Artifact file paths (default: all .dmg and .exe in dist/)')
    parser.add_argument('--output',
                       help='Output file path (default: print to stdout)')
    parser.add_argument('--algorithms',
                       default='sha256,md5',
                       help='Comma-separated list of algorithms (default: sha256,md5)')
    
    args = parser.parse_args()
    
    # Get artifacts
    if args.artifacts:
        artifacts = [Path(a) for a in args.artifacts]
    else:
        dist_path = Path('dist')
        if not dist_path.exists():
            print("Error: dist/ directory not found", file=sys.stderr)
            sys.exit(1)
        artifacts = list(dist_path.glob('*.dmg')) + list(dist_path.glob('*.exe'))
    
    if not artifacts:
        print("No artifacts found", file=sys.stderr)
        sys.exit(1)
    
    # Parse algorithms
    algorithms = [a.strip() for a in args.algorithms.split(',')]
    
    # Generate checksums
    checksums = generate_checksums(artifacts, algorithms)
    
    if not checksums:
        print("No checksums generated", file=sys.stderr)
        sys.exit(1)
    
    # Output
    output_text = '\n'.join(checksums) + '\n'
    
    if args.output:
        output_path = Path(args.output)
        output_path.write_text(output_text, encoding='utf-8')
        print(f"Checksums written to: {output_path}")
    else:
        print(output_text)


if __name__ == '__main__':
    main()
