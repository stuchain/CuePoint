#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test runner for Step 5.8: Configuration Management.

Runs all tests for Step 5.8 and reports results.
"""

import subprocess
import sys
from pathlib import Path

# Add src to path
src_dir = Path(__file__).parent
sys.path.insert(0, str(src_dir))

TEST_FILES = [
    "tests/unit/test_step58_config_models.py",
    "tests/unit/test_step58_config_service.py",
]


def run_tests():
    """Run all Step 5.8 tests."""
    print("=" * 80)
    print("Step 5.8: Configuration Management - Test Suite")
    print("=" * 80)
    print()

    all_passed = True
    total_tests = 0
    passed_tests = 0
    failed_tests = 0

    for test_file in TEST_FILES:
        test_path = src_dir / test_file
        if not test_path.exists():
            print(f"WARNING: Test file not found: {test_file}")
            continue

        print(f"Running: {test_file}")
        print("-" * 80)

        try:
            result = subprocess.run(
                [sys.executable, "-m", "pytest", str(test_path), "-v", "--tb=short"],
                cwd=src_dir,
                capture_output=True,
                text=True,
            )

            # Parse output for test counts
            output = result.stdout + result.stderr
            print(output)

            if result.returncode == 0:
                print(f"PASSED: {test_file}")
                # Try to extract test count
                if "passed" in output.lower():
                    lines = output.split("\n")
                    for line in lines:
                        if "passed" in line.lower() and "failed" not in line.lower():
                            parts = line.split()
                            for i, part in enumerate(parts):
                                if part == "passed":
                                    try:
                                        count = int(parts[i - 1])
                                        passed_tests += count
                                        total_tests += count
                                    except (ValueError, IndexError):
                                        pass
            else:
                print(f"FAILED: {test_file}")
                all_passed = False
                # Try to extract failure count
                if "failed" in output.lower():
                    lines = output.split("\n")
                    for line in lines:
                        if "failed" in line.lower():
                            parts = line.split()
                            for i, part in enumerate(parts):
                                if part == "failed":
                                    try:
                                        count = int(parts[i - 1])
                                        failed_tests += count
                                        total_tests += count
                                    except (ValueError, IndexError):
                                        pass

        except Exception as e:
            print(f"ERROR running {test_file}: {e}")
            all_passed = False

        print()

    # Summary
    print("=" * 80)
    print("Test Summary")
    print("=" * 80)
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {failed_tests}")
    print()

    if all_passed and failed_tests == 0:
        print("All tests PASSED!")
        return 0
    else:
        print("Some tests FAILED!")
        return 1


if __name__ == "__main__":
    sys.exit(run_tests())

