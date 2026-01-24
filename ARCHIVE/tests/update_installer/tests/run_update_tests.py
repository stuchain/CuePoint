#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Quick Test Runner for Update System

Runs all update system tests and provides a summary.
"""

import sys
import unittest
from pathlib import Path

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))

def main():
    """Run all update system tests."""
    print("=" * 70)
    print("UPDATE SYSTEM COMPREHENSIVE TEST SUITE")
    print("=" * 70)
    print()
    
    # Import and run tests
    from test_update_system_complete import (
        TestVersionFiltering,
        TestUpdateDialog,
        TestContextMenu,
        TestDownloadURLExtraction,
        TestStartupUpdateCheck,
        TestErrorHandling,
        TestVersionUtils,
        TestRealWorldScenarios,
    )
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    test_classes = [
        ("Version Filtering", TestVersionFiltering),
        ("Update Dialog", TestUpdateDialog),
        ("Context Menu", TestContextMenu),
        ("Download URL Extraction", TestDownloadURLExtraction),
        ("Startup Update Check", TestStartupUpdateCheck),
        ("Error Handling", TestErrorHandling),
        ("Version Utils", TestVersionUtils),
        ("Real-World Scenarios", TestRealWorldScenarios),
    ]
    
    print("Loading test suites...")
    for name, test_class in test_classes:
        tests = loader.loadTestsFromTestCase(test_class)
        suite.addTests(tests)
        print(f"  ✓ {name}: {tests.countTestCases()} tests")
    
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
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
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
        print("✅ ALL TESTS PASSED!")
        print("The update system is ready for production.")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("Please review the failures above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
