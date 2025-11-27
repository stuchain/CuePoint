#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test runner for Step 5.2 tests.

Runs all Step 5.2 related tests and displays results.
"""

import sys
import os

# Add src to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest

def main():
    """Run Step 5.2 tests."""
    test_files = [
        "tests/unit/services/test_processor_service_step52.py",
        "tests/integration/test_step52_main_controller_di.py",
        "tests/integration/test_step52_full_integration.py",
    ]
    
    # Also run existing DI tests
    existing_tests = [
        "tests/unit/test_di_container.py",
        "tests/integration/test_di_integration.py",
    ]
    
    all_tests = test_files + existing_tests
    
    print("=" * 80)
    print("Running Step 5.2 Tests")
    print("=" * 80)
    print()
    
    # Run tests
    exit_code = pytest.main([
        "-v",
        "--tb=short",
        "--color=yes",
        *all_tests
    ])
    
    print()
    print("=" * 80)
    if exit_code == 0:
        print("✅ ALL TESTS PASSED - Step 5.2 is 100% COMPLETE!")
    else:
        print(f"❌ SOME TESTS FAILED (exit code: {exit_code})")
    print("=" * 80)
    
    return exit_code

if __name__ == "__main__":
    sys.exit(main())

