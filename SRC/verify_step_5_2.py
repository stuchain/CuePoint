#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Simple verification script for Step 5.2
Verifies that all files exist and basic structure is correct.
"""

import os
import sys

def check_file_exists(path):
    """Check if file exists."""
    if os.path.exists(path):
        print(f"[OK] {path}")
        return True
    else:
        print(f"[MISSING] {path}")
        return False

def main():
    """Verify Step 5.2 implementation."""
    print("Verifying Step 5.2 - Dependency Injection & Service Layer")
    print("=" * 60)
    
    base_path = os.path.dirname(os.path.abspath(__file__))
    files_to_check = [
        "cuepoint/services/interfaces.py",
        "cuepoint/utils/di_container.py",
        "cuepoint/services/logging_service.py",
        "cuepoint/services/cache_service.py",
        "cuepoint/services/config_service.py",
        "cuepoint/services/export_service.py",
        "cuepoint/services/matcher_service.py",
        "cuepoint/services/beatport_service.py",
        "cuepoint/services/processor_service.py",
        "cuepoint/services/bootstrap.py",
        "tests/unit/test_di_container.py",
        "tests/unit/test_services.py",
        "tests/integration/test_di_integration.py",
    ]
    
    all_exist = True
    for file_path in files_to_check:
        full_path = os.path.join(base_path, file_path)
        if not check_file_exists(full_path):
            all_exist = False
    
    print("=" * 60)
    if all_exist:
        print("[SUCCESS] All required files exist!")
        print("\nStep 5.2 implementation structure is complete.")
        print("\nNext steps:")
        print("1. Run unit tests: pytest tests/unit/test_di_container.py")
        print("2. Run integration tests: pytest tests/integration/test_di_integration.py")
        print("3. Refactor existing code to use services")
        return 0
    else:
        print("[ERROR] Some files are missing!")
        return 1

if __name__ == "__main__":
    sys.exit(main())

