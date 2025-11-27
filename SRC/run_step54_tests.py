#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Run all Step 5.4 tests with coverage reporting."""

import subprocess
import sys
from pathlib import Path

# Add src to path
src_dir = Path(__file__).parent
sys.path.insert(0, str(src_dir))

def main():
    """Run tests with coverage."""
    print("=" * 80)
    print("Running Step 5.4 Comprehensive Testing")
    print("=" * 80)
    print()
    
    # Run tests with coverage
    cmd = [
        sys.executable, "-m", "pytest",
        "--cov=cuepoint",
        "--cov-report=term-missing",
        "--cov-report=html",
        "--cov-fail-under=80",
        "-v",
        "tests/unit/services/test_beatport_service.py",
        "tests/unit/services/test_logging_service.py",
        "tests/unit/data/test_beatport.py",
        "tests/unit/services/test_output_writer.py",
    ]
    
    print(f"Running: {' '.join(cmd)}")
    print()
    
    result = subprocess.run(cmd, cwd=src_dir)
    
    print()
    print("=" * 80)
    if result.returncode == 0:
        print("✅ All Step 5.4 tests passed!")
        print("📊 Coverage report generated in htmlcov/index.html")
    else:
        print("❌ Some tests failed or coverage below 80%")
    print("=" * 80)
    
    return result.returncode

if __name__ == "__main__":
    sys.exit(main())

