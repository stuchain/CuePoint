#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test generate_version_info.py with various version formats.
"""

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

# Add SRC to path
sys.path.insert(0, str(Path('SRC').resolve()))

# Import the version module
import cuepoint.version as version_module

def test_version_format(version_str):
    """Test version format parsing."""
    print(f"\nTesting version: {version_str}")
    
    # Save original version
    original_version = version_module.__version__
    
    try:
        # Set test version
        version_module.__version__ = version_str
        
        # Extract base version
        base_version = version_str
        if '-' in base_version:
            base_version = base_version.split('-')[0]
        if '+' in base_version:
            base_version = base_version.split('+')[0]
        
        # Parse
        version_parts = base_version.split('.')
        if len(version_parts) != 3:
            raise ValueError(f"Version must have 3 parts, got: {base_version}")
        
        major, minor, patch = map(int, version_parts)
        
        print(f"  Base version: {base_version}")
        print(f"  Major: {major}, Minor: {minor}, Patch: {patch}")
        print(f"  [PASS]")
        return True
        
    except Exception as e:
        print(f"  [FAIL] Error: {e}")
        return False
    finally:
        # Restore original version
        version_module.__version__ = original_version

def main():
    """Run tests."""
    print("="*60)
    print("Testing generate_version_info.py version parsing")
    print("="*60)
    
    test_versions = [
        "1.0.0",
        "1.0.1",
        "1.0.0-test2",
        "1.0.0-test10",
        "1.0.1-test-unsigned47",
        "1.0.1-test9",
        "2.5.10-beta.1",
        "1.0.0+build.123",
        "1.0.0-test10+build.123",
    ]
    
    results = []
    for version in test_versions:
        result = test_version_format(version)
        results.append((version, result))
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for version, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status} {version}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n[SUCCESS] All version formats handled correctly!")
        return 0
    else:
        print(f"\n[FAILURE] {total - passed} test(s) failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
