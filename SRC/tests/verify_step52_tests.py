#!/usr/bin/env python3
"""Verify all Step 5.2 tests pass."""
import subprocess
import sys

if __name__ == "__main__":
    print("Running Step 5.2 tests...")
    print("=" * 80)
    
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/unit/services/test_processor_service_step52.py",
            "-v",
            "--tb=short",
        ],
        capture_output=True,
        text=True,
        cwd=".",
    )
    
    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr, file=sys.stderr)
    
    print("=" * 80)
    if result.returncode == 0:
        print("✅ All tests PASSED!")
    else:
        print("❌ Some tests FAILED!")
    
    sys.exit(result.returncode)
