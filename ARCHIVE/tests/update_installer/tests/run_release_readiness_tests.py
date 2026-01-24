#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Release Readiness Test Runner

Runs all comprehensive tests to verify release readiness:
1. Configuration tests
2. Build tests
3. Update system tests
4. Installation tests
5. DLL fix tests

Usage:
    python ARCHIVE/tests/update_installer/tests/run_release_readiness_tests.py
"""

import sys
import unittest
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))


def run_all_tests():
    """Run all release readiness tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Import and add test modules
    try:
        import test_release_readiness_comprehensive
        suite.addTests(loader.loadTestsFromModule(test_release_readiness_comprehensive))
        print("✓ Loaded: test_release_readiness_comprehensive")
    except ImportError as e:
        print(f"✗ Failed to load test_release_readiness_comprehensive: {e}")
    
    try:
        import test_python_dll_inclusion
        suite.addTests(loader.loadTestsFromModule(test_python_dll_inclusion))
        print("✓ Loaded: test_python_dll_inclusion")
    except ImportError as e:
        print(f"✗ Failed to load test_python_dll_inclusion: {e}")
    
    try:
        import test_update_installer_comprehensive
        suite.addTests(loader.loadTestsFromModule(test_update_installer_comprehensive))
        print("✓ Loaded: test_update_installer_comprehensive")
    except ImportError as e:
        print(f"✗ Failed to load test_update_installer_comprehensive: {e}")
    
    try:
        import test_update_system_complete
        suite.addTests(loader.loadTestsFromModule(test_update_system_complete))
        print("✓ Loaded: test_update_system_complete")
    except ImportError as e:
        print(f"✗ Failed to load test_update_system_complete: {e}")
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2, buffer=True)
    result = runner.run(suite)
    
    return result


if __name__ == '__main__':
    print("=" * 80)
    print("Release Readiness Test Suite")
    print("=" * 80)
    print()
    print("Running comprehensive tests to verify release readiness...")
    print()
    
    result = run_all_tests()
    
    print()
    print("=" * 80)
    print("Test Results Summary")
    print("=" * 80)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")
    print()
    
    if result.wasSuccessful():
        print("✅ All tests passed! Release is ready.")
        sys.exit(0)
    else:
        print("❌ Some tests failed. Please fix issues before release.")
        if result.failures:
            print("\nFailures:")
            for test, traceback in result.failures[:5]:  # Show first 5
                print(f"  - {test}")
        if result.errors:
            print("\nErrors:")
            for test, traceback in result.errors[:5]:  # Show first 5
                print(f"  - {test}")
        sys.exit(1)
