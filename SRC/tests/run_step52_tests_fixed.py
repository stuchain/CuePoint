#!/usr/bin/env python3
"""Run Step 5.2 tests and print results."""
import sys
import subprocess

if __name__ == "__main__":
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/unit/services/test_processor_service_step52.py",
            "-v",
            "--tb=short",
        ],
        cwd=".",
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr, file=sys.stderr)
    sys.exit(result.returncode)

