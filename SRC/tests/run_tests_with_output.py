#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run Step 5.2 tests and save output to file.
"""

import sys
import subprocess
import os

def main():
    """Run tests and save output."""
    test_files = [
        "tests/unit/services/test_processor_service_step52.py",
        "tests/integration/test_step52_main_controller_di.py",
        "tests/integration/test_step52_full_integration.py",
    ]
    
    output_file = "step52_test_results.txt"
    
    print(f"Running Step 5.2 tests...")
    print(f"Output will be saved to: {output_file}")
    print()
    
    # Run pytest with all test files
    cmd = [
        sys.executable, "-m", "pytest",
        "-v",
        "--tb=short",
        "--color=no",  # Disable color for file output
    ] + test_files
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            result = subprocess.run(
                cmd,
                stdout=f,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=os.path.dirname(os.path.abspath(__file__))
            )
        
        # Also print to console
        with open(output_file, 'r', encoding='utf-8') as f:
            output = f.read()
            print(output)
        
        print()
        print("=" * 80)
        if result.returncode == 0:
            print("✅ ALL TESTS PASSED!")
        else:
            print(f"❌ SOME TESTS FAILED (exit code: {result.returncode})")
        print("=" * 80)
        print(f"\nFull output saved to: {output_file}")
        
        return result.returncode
    except Exception as e:
        print(f"Error running tests: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())

