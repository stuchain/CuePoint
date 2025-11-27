#!/usr/bin/env python3
"""Run all Step 5.3 tests and display results."""

import subprocess
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

test_files = [
    "tests/unit/test_results_controller.py",
    "tests/unit/test_export_controller.py",
    "tests/unit/test_config_controller.py",
    "tests/integration/test_step53_ui_controllers.py",
]

print("=" * 80)
print("STEP 5.3 COMPREHENSIVE TEST SUITE")
print("=" * 80)
print()

total_tests = 0
total_passed = 0
total_failed = 0

for test_file in test_files:
    print(f"\n{'=' * 80}")
    print(f"Running: {test_file}")
    print(f"{'=' * 80}")
    
    result = subprocess.run(
        [sys.executable, "-m", "pytest", test_file, "-v", "--tb=short"],
        capture_output=True,
        text=True,
    )
    
    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr, file=sys.stderr)
    
    # Parse output to count tests
    lines = result.stdout.split('\n')
    for line in lines:
        if ' passed' in line or ' failed' in line or ' error' in line:
            print(f"\n{line}")
            # Extract numbers
            parts = line.split()
            for i, part in enumerate(parts):
                if part in ['passed', 'failed', 'error']:
                    if i > 0:
                        try:
                            count = int(parts[i-1])
                            if 'passed' in part:
                                total_passed += count
                                total_tests += count
                            elif 'failed' in part or 'error' in part:
                                total_failed += count
                                total_tests += count
                        except ValueError:
                            pass
    
    if result.returncode != 0:
        print(f"❌ Tests failed for {test_file}")
    else:
        print(f"✅ Tests passed for {test_file}")

print()
print("=" * 80)
print("STEP 5.3 TEST SUMMARY")
print("=" * 80)
print(f"Total Tests: {total_tests}")
print(f"Passed: {total_passed}")
print(f"Failed: {total_failed}")
print("=" * 80)

if total_failed > 0:
    sys.exit(1)
else:
    print("\n✅ All Step 5.3 tests PASSED!")
    sys.exit(0)

