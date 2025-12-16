#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate release notes

Usage:
    python scripts/validate_release_notes.py [--file <path>]
"""

import argparse
import re
import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

try:
    from cuepoint.version import __version__
except ImportError:
    __version__ = "1.0.0"


def validate_release_notes(notes_path):
    """Validate release notes
    
    Args:
        notes_path: Path to release notes file
    
    Returns:
        Tuple of (is_valid, warnings_list)
    """
    notes_path = Path(notes_path)
    if not notes_path.exists():
        return False, [f"Release notes not found: {notes_path}"]
    
    content = notes_path.read_text(encoding='utf-8')
    warnings = []
    
    # Check for version
    if __version__ not in content and f"v{__version__}" not in content:
        warnings.append(f"Version {__version__} not found in release notes")
    
    # Check for date
    date_patterns = [
        r'\d{4}-\d{2}-\d{2}',
        r'\w+ \d{1,2}, \d{4}',
        r'\d{1,2}/\d{1,2}/\d{4}',
    ]
    has_date = any(re.search(pattern, content) for pattern in date_patterns)
    if not has_date:
        warnings.append("No date found in release notes")
    
    # Check for content
    if len(content.strip()) < 100:
        warnings.append("Release notes seem too short")
    
    # Check for sections (optional but recommended)
    recommended_sections = ['##', '###']
    has_sections = any(line.startswith('#') for line in content.split('\n'))
    if not has_sections:
        warnings.append("No markdown sections found (consider adding ## sections)")
    
    return len(warnings) == 0, warnings


def main():
    """Main function"""
    # Set UTF-8 encoding for Windows console compatibility
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    
    parser = argparse.ArgumentParser(
        description='Validate release notes'
    )
    parser.add_argument('--file',
                       default='RELEASE_NOTES.md',
                       help='Path to release notes file (default: RELEASE_NOTES.md)')
    
    args = parser.parse_args()
    
    valid, warnings = validate_release_notes(args.file)
    
    if valid:
        print(f"[PASS] Release notes validated: {args.file}")
        sys.exit(0)
    else:
        print(f"[WARN] Release notes validation warnings:")
        for warning in warnings:
            print(f"  - {warning}")
        # Don't exit with error - warnings are non-blocking
        sys.exit(0)


if __name__ == '__main__':
    main()
