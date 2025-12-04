#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Run all Step 5.5 tests."""

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    src_dir = Path(__file__).parent

    print("=" * 80)
    print("Running Step 5.5 Tests: Type Hints & Documentation")
    print("=" * 80)
    print()

    # Run unit tests
    print("1. Running unit tests for type hints and docstrings...")
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/unit/test_step55_type_hints.py", "-v"],
        cwd=src_dir,
    )
    unit_passed = result.returncode == 0

    print()
    print("2. Running integration tests for mypy validation...")
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/integration/test_step55_mypy_validation.py", "-v"],
        cwd=src_dir,
    )
    integration_passed = result.returncode == 0

    print()
    print("=" * 80)
    if unit_passed and integration_passed:
        print("✅ All Step 5.5 tests passed!")
        sys.exit(0)
    else:
        print("❌ Some Step 5.5 tests failed.")
        sys.exit(1)

