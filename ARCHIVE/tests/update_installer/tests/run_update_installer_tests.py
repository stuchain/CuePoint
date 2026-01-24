#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run all update installer tests.

This script runs all test suites for the update installer system.
"""

import sys
import unittest
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))

def run_all_tests():
    """Run all update installer test suites."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Import test modules
    try:
        import test_update_installer_comprehensive as comprehensive_tests
        suite.addTests(loader.loadTestsFromModule(comprehensive_tests))
        print("[OK] Loaded comprehensive installer tests")
    except ImportError as e:
        print(f"[WARN] Could not load comprehensive tests: {e}")
    
    try:
        import test_update_installer_ui_integration as ui_tests
        suite.addTests(loader.loadTestsFromModule(ui_tests))
        print("[OK] Loaded UI integration tests")
    except ImportError as e:
        print(f"[WARN] Could not load UI integration tests: {e}")
    
    try:
        import test_update_installer_scripts as script_tests
        suite.addTests(loader.loadTestsFromModule(script_tests))
        print("[OK] Loaded script tests")
    except ImportError as e:
        print(f"[WARN] Could not load script tests: {e}")
    
    # Run tests
    print("\n" + "=" * 70)
    print("Running Update Installer Test Suite")
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
