#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Run Step 5.6 error handling and logging tests."""

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    src_dir = Path(__file__).parent
    
    print("=" * 80)
    print("Step 5.6: Error Handling & Logging - Test Suite")
    print("=" * 80)
    print()
    
    # Test files to run
    test_files = [
        # Exception hierarchy tests
        "tests/unit/test_step56_exceptions.py",
        # Error handler tests
        "tests/unit/test_step56_error_handler.py",
        # Logging service tests
        "tests/unit/test_step56_logging_service.py",
        # Service error handling tests
        "tests/unit/services/test_step56_error_handling.py",
        # Integration tests
        "tests/integration/test_step56_error_handling_integration.py",
        "tests/integration/test_step56_processor_service_errors.py",
    ]
    
    results = []
    
    for test_file in test_files:
        print(f"\n{'=' * 80}")
        print(f"Running: {test_file}")
        print("=" * 80)
        result = subprocess.run(
            [sys.executable, "-m", "pytest", test_file, "-v", "--tb=short"],
            cwd=src_dir,
            capture_output=True,
            text=True,
        )
        
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        results.append((test_file, result.returncode == 0))
    
    # Summary
    print("\n" + "=" * 80)
    print("Test Summary")
    print("=" * 80)
    for test_file, passed in results:
        status = "PASSED" if passed else "FAILED"
        print(f"{status}: {test_file}")
    
    all_passed = all(passed for _, passed in results)
    
    if all_passed:
        print("\nAll Step 5.6 tests passed!")
        sys.exit(0)
    else:
        print("\nSome tests failed. See output above.")
        sys.exit(1)

