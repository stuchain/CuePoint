#!/usr/bin/env python3
"""Run all Step 5.2 tests and display results."""
import subprocess
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

test_files = [
    "tests/unit/services/test_processor_service_step52.py",
    "tests/integration/test_step52_main_controller_di.py",
    "tests/integration/test_step52_full_integration.py",
]

print("=" * 80)
print("STEP 5.2 COMPREHENSIVE TEST SUITE")
print("=" * 80)
print()

all_results = []

for test_file in test_files:
    print(f"Testing: {test_file}")
    print("-" * 80)
    
    result = subprocess.run(
        [sys.executable, "-m", "pytest", test_file, "-v", "--tb=short"],
        capture_output=True,
        text=True,
    )
    
    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr, file=sys.stderr)
    
    all_results.append((test_file, result.returncode == 0))
    print()

print("=" * 80)
print("SUMMARY")
print("=" * 80)

all_passed = True
for test_file, passed in all_results:
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status}: {test_file}")
    if not passed:
        all_passed = False

print()
if all_passed:
    print("🎉 ALL STEP 5.2 TESTS PASSED!")
    sys.exit(0)
else:
    print("❌ SOME TESTS FAILED")
    sys.exit(1)

