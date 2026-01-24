#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Pre-Build Test Suite for Update System

Run this BEFORE building to ensure everything works.
Tests all functionality locally without requiring GitHub downloads.
"""

import sys
import unittest
from pathlib import Path

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))

def run_pre_build_tests():
    """Run all pre-build tests."""
    print("=" * 70)
    print("PRE-BUILD UPDATE SYSTEM TEST SUITE")
    print("=" * 70)
    print()
    print("This test suite verifies all update functionality works")
    print("before building the application.")
    print()
    print("Testing:")
    print("  1. Context menu fix (no TypeError)")
    print("  2. Version filtering (test to test, stable to stable)")
    print("  3. Download flow")
    print("  4. Startup check")
    print("  5. Update info storage")
    print()
    print("=" * 70)
    print()
    
    # Import test classes
    from test_update_complete_local import (
        TestContextMenuFix,
        TestVersionFilteringComplete,
        TestDownloadFlowComplete,
        TestStartupCheckComplete,
        TestUpdateInfoStorage,
    )
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    test_classes = [
        ("Context Menu Fix", TestContextMenuFix),
        ("Version Filtering", TestVersionFilteringComplete),
        ("Download Flow", TestDownloadFlowComplete),
        ("Startup Check", TestStartupCheckComplete),
        ("Update Info Storage", TestUpdateInfoStorage),
    ]
    
    print("Loading test suites...")
    for name, test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)
        print(f"  [OK] {name}: {tests.countTestCases()} tests")
    
    print()
    print("Running tests...")
    print("=" * 70)
    print()
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"Tests run: {result.testsRun}")
    print(f"Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failed: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print()
    
    if result.failures:
        print("FAILURES:")
        for test, traceback in result.failures:
            print(f"  - {test}")
        print()
    
    if result.errors:
        print("ERRORS:")
        for test, traceback in result.errors:
            print(f"  - {test}")
        print()
    
    if result.wasSuccessful():
        print("[PASS] ALL TESTS PASSED!")
        print("The update system is ready for building.")
        print()
        print("You can now:")
        print("  1. Build the application locally")
        print("  2. Test with the built version")
        print("  3. Verify everything works before release")
        return 0
    else:
        print("[FAIL] SOME TESTS FAILED")
        print("Please fix the issues before building.")
        print()
        print("DO NOT BUILD until all tests pass!")
        return 1


if __name__ == "__main__":
    sys.exit(run_pre_build_tests())
