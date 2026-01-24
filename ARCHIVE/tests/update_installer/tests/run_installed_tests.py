#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Helper script to run installed version tests.

This script makes it easy to test the built/installed version of CuePoint
after building with PyInstaller.

Usage:
    # After building:
    python ARCHIVE/tests/update_installer/tests/run_installed_tests.py
    
    # Run specific test:
    python ARCHIVE/tests/update_installer/tests/run_installed_tests.py -k test_executable_exists
    
    # Run with verbose output:
    python ARCHIVE/tests/update_installer/tests/run_installed_tests.py -v
"""

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT))

import pytest


def main():
    """Run installed version tests."""
    # Test file path
    test_file = Path(__file__).parent / "test_installed_version.py"
    
    # Default arguments
    args = [
        str(test_file),
        "-v",  # Verbose
        "--tb=short",  # Short traceback format
    ]
    
    # Add any command-line arguments passed to this script
    if len(sys.argv) > 1:
        args.extend(sys.argv[1:])
    
    # Run pytest
    exit_code = pytest.main(args)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
