#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Master release validation script

Runs all validation checks before release

Usage:
    python scripts/validate_release.py [--skip-tests] [--skip-feeds]
"""

import argparse
import subprocess
import sys
from pathlib import Path

VALIDATIONS = [
    ('version', 'scripts/validate_version.py', True),
    ('artifacts', 'scripts/validate_artifacts.py', True),
    ('signing', 'scripts/validate_signing.py', False),  # Platform-specific
    ('notarization', 'scripts/validate_notarization.py', False),  # macOS only
    ('version_embedding', 'scripts/verify_version_embedding.py', True),
    ('release_notes', 'scripts/validate_release_notes.py', True),
    ('feeds', 'scripts/validate_feeds.py', False),  # Optional
]


def run_validation(name, script, required=True):
    """Run a validation script
    
    Args:
        name: Name of validation
        script: Path to script
        required: Whether failure should block release
    
    Returns:
        Tuple of (success, output)
    """
    script_path = Path(script)
    if not script_path.exists():
        if required:
            return False, f"Validation script not found: {script}"
        else:
            return True, f"Skipped (script not found): {script}"
    
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode == 0:
            return True, result.stdout.strip()
        else:
            return False, result.stderr.strip() or result.stdout.strip()
            
    except subprocess.TimeoutExpired:
        return False, "Validation timed out"
    except Exception as e:
        return False, f"Error running validation: {e}"


def validate_release(skip_tests=False, skip_feeds=False):
    """Run all release validations
    
    Args:
        skip_tests: Skip test validation
        skip_feeds: Skip feed validation
    
    Returns:
        Tuple of (all_passed, failures_list)
    """
    failures = []
    skipped = []
    
    for name, script, required in VALIDATIONS:
        # Skip if requested
        if skip_tests and name == 'tests':
            skipped.append(name)
            continue
        if skip_feeds and name == 'feeds':
            skipped.append(name)
            continue
        
        print(f"\n{'='*60}")
        print(f"Validating {name}...")
        print('='*60)
        
        success, output = run_validation(name, script, required)
        
        if success:
            print(f"✓ {name} validation passed")
            if output:
                print(output)
        else:
            print(f"✗ {name} validation failed")
            print(output)
            if required:
                failures.append((name, output))
            else:
                print(f"  (Non-blocking - continuing...)")
    
    if skipped:
        print(f"\nSkipped validations: {', '.join(skipped)}")
    
    return len(failures) == 0, failures


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Master release validation script'
    )
    parser.add_argument('--skip-tests', action='store_true',
                       help='Skip test validation')
    parser.add_argument('--skip-feeds', action='store_true',
                       help='Skip feed validation')
    
    args = parser.parse_args()
    
    print("="*60)
    print("Release Validation")
    print("="*60)
    
    all_passed, failures = validate_release(
        skip_tests=args.skip_tests,
        skip_feeds=args.skip_feeds
    )
    
    print("\n" + "="*60)
    if all_passed:
        print("✓ All release validations passed")
        sys.exit(0)
    else:
        print("✗ Release validation failed:")
        for name, error in failures:
            print(f"  - {name}: {error}")
        sys.exit(1)


if __name__ == '__main__':
    main()
