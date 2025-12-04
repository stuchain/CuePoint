#!/usr/bin/env python3
"""Verify all Step 5.2 tests pass."""
import subprocess
import sys

def run_tests():
    """Run all Step 5.2 tests and report results."""
    test_files = [
        "tests/unit/services/test_processor_service_step52.py",
        "tests/integration/test_step52_main_controller_di.py",
        "tests/integration/test_step52_full_integration.py",
    ]
    
    print("=" * 80)
    print("Running Step 5.2 Tests")
    print("=" * 80)
    
    all_passed = True
    total_tests = 0
    total_passed = 0
    
    for test_file in test_files:
        print(f"\n📋 Running: {test_file}")
        print("-" * 80)
        
        result = subprocess.run(
            [sys.executable, "-m", "pytest", test_file, "-v", "--tb=line"],
            capture_output=True,
            text=True,
            cwd=".",
        )
        
        # Count tests
        output_lines = result.stdout.split('\n')
        passed = sum(1 for line in output_lines if 'PASSED' in line)
        failed = sum(1 for line in output_lines if 'FAILED' in line)
        error = sum(1 for line in output_lines if 'ERROR' in line)
        
        total_tests += (passed + failed + error)
        total_passed += passed
        
        if result.returncode == 0:
            print(f"✅ {test_file}: {passed} tests passed")
        else:
            print(f"❌ {test_file}: {failed} failed, {error} errors")
            print(result.stdout)
            if result.stderr:
                print("STDERR:", result.stderr)
            all_passed = False
    
    print("\n" + "=" * 80)
    print(f"Summary: {total_passed}/{total_tests} tests passed")
    if all_passed:
        print("✅ All Step 5.2 tests PASSED!")
    else:
        print("❌ Some tests FAILED!")
    print("=" * 80)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(run_tests())

