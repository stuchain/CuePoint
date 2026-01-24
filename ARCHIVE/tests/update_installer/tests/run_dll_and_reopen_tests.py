#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run tests for Python DLL inclusion and app reopening after update.

This test suite ensures:
1. Python DLL is included in PyInstaller builds
2. App can be reopened correctly after update installation
3. No DLL errors occur when app is launched after update
"""

import sys
import unittest
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))


def run_all_tests():
    """Run all DLL and reopen tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Import test modules
    try:
        import test_python_dll_inclusion as dll_tests
        suite.addTests(loader.loadTestsFromModule(dll_tests))
        print("[OK] Loaded Python DLL inclusion tests")
    except ImportError as e:
        print(f"[WARN] Could not load DLL tests: {e}")
    
    try:
        import test_app_reopening_after_update as reopen_tests
        suite.addTests(loader.loadTestsFromModule(reopen_tests))
        print("[OK] Loaded app reopening tests")
    except ImportError as e:
        print(f"[WARN] Could not load reopen tests: {e}")
    
    # Run tests
    print("\n" + "=" * 70)
    print("Running DLL Inclusion and App Reopening Tests")
    print("=" * 70 + "\n")
    
    if suite.countTestCases() == 0:
        print("[ERROR] No tests loaded! Check import paths and test files.")
        return False
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print("\n" + "=" * 70)
    print("Test Summary")
    print("=" * 70)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")
    
    if result.failures:
        print("\nFailures:")
        for test, traceback in result.failures:
            print(f"  - {test}")
    
    if result.errors:
        print("\nErrors:")
        for test, traceback in result.errors:
            print(f"  - {test}")
    
    print("=" * 70 + "\n")
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
