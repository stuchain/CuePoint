#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Runner for DLL Fix Comprehensive Tests

Runs all tests related to the DLL fix to ensure everything is working correctly.
"""

import sys
import unittest
from pathlib import Path

# Add tests directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Import test modules
import test_dll_fix_comprehensive
import test_python_dll_inclusion
import test_app_reopening_after_update


def run_all_tests():
    """Run all DLL fix related tests."""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add tests from all modules
    suite.addTests(loader.loadTestsFromModule(test_dll_fix_comprehensive))
    suite.addTests(loader.loadTestsFromModule(test_python_dll_inclusion))
    suite.addTests(loader.loadTestsFromModule(test_app_reopening_after_update))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print("\n" + "=" * 70)
    print("DLL Fix Tests Summary")
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
    
    # Return success if all tests passed
    return len(result.failures) == 0 and len(result.errors) == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
