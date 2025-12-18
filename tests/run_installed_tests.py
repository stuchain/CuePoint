#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Helper script to run installed version tests.

This script makes it easy to test the built/installed version of CuePoint
after building with PyInstaller.

Usage:
    # After building:
    python tests/run_installed_tests.py
    
    # Run specific test:
    python tests/run_installed_tests.py -k test_executable_exists
    
    # Run with verbose output:
    python tests/run_installed_tests.py -v
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

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
