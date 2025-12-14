#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate .gitignore configuration

Checks that critical files are properly ignored

Usage:
    python scripts/validate_gitignore.py
"""

import subprocess
import sys
from pathlib import Path


def check_ignored_files():
    """Check that critical files are ignored"""
    critical_patterns = [
        '.venv/',
        'dist/',
        'build/',
        '*.p12',
        '*.pfx',
        '.env',
    ]
    
    # Patterns that are allowed to be tracked (test files, etc.)
    allowed_patterns = [
        'test_logs/',
        'SRC/tests/',
    ]
    
    errors = []
    
    for pattern in critical_patterns:
        # Check if any files matching pattern are tracked
        result = subprocess.run(
            ['git', 'ls-files', pattern],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.stdout.strip():
            # Check if any tracked files are in allowed locations
            tracked_files = result.stdout.strip().split('\n')
            problematic_files = []
            for file in tracked_files:
                if not any(allowed in file for allowed in allowed_patterns):
                    problematic_files.append(file)
            
            if problematic_files:
                errors.append(f"Files matching '{pattern}' are tracked: {', '.join(problematic_files)}")
    
    return errors


def main():
    """Main function"""
    gitignore = Path('.gitignore')
    if not gitignore.exists():
        print("Warning: .gitignore not found")
        sys.exit(0)
    
    errors = check_ignored_files()
    
    if errors:
        print("ERROR: .gitignore validation failed:")
        for error in errors:
            print(f"  {error}")
        sys.exit(1)
    
    print("✓ .gitignore validation passed")


if __name__ == '__main__':
    main()
