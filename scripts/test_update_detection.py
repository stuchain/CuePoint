#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Update Detection

Tests the update checker with various version scenarios to ensure
prerelease updates are detected correctly.

Usage:
    python scripts/test_update_detection.py
"""

import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path("SRC").resolve()))

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.version_utils import compare_versions, is_stable_version


def test_version_comparisons():
    """Test version comparison scenarios"""
    print("=" * 60)
    print("Testing Version Comparisons")
    print("=" * 60)
    
    test_cases = [
        # (new_version, current_version, expected_result, description)
        ("1.0.1-test-unsigned51", "1.0.0-test-unsigned51", 1, "Prerelease to prerelease (minor bump)"),
        ("1.0.1-test-unsigned51", "1.0.0", 1, "Stable to prerelease (should compare, filter will block)"),
        ("1.0.1", "1.0.0", 1, "Stable to stable"),
        ("1.0.0", "1.0.1", -1, "Older version"),
        ("1.0.0", "1.0.0", 0, "Same version"),
        ("1.0.1-test-unsigned52", "1.0.1-test-unsigned51", 1, "Prerelease to prerelease (build bump)"),
    ]
    
    all_passed = True
    for new_ver, current_ver, expected, desc in test_cases:
        try:
            result = compare_versions(new_ver, current_ver)
            passed = (result == expected) or (expected > 0 and result > 0) or (expected < 0 and result < 0)
            status = "[PASS]" if passed else "[FAIL]"
            print(f"{status} {desc}")
            print(f"    {new_ver} vs {current_ver} = {result} (expected: {expected})")
            if not passed:
                all_passed = False
        except Exception as e:
            print(f"[FAIL] {desc}")
            print(f"    Error: {e}")
            all_passed = False
    
    return all_passed


def test_prerelease_filtering():
    """Test prerelease filtering logic"""
    print("\n" + "=" * 60)
    print("Testing Prerelease Filtering Logic")
    print("=" * 60)
    
    # Simulate the filtering logic from _find_latest_update
    scenarios = [
        # (current_version, channel, test_version, should_show, description)
        ("1.0.0", "stable", "1.0.1", True, "Stable to stable on stable channel"),
        ("1.0.0", "stable", "1.0.1-test-unsigned51", False, "Stable to prerelease on stable channel (blocked)"),
        ("1.0.0-test-unsigned51", "stable", "1.0.1-test-unsigned51", True, "Prerelease to prerelease on stable channel (allowed)"),
        ("1.0.0", "beta", "1.0.1-test-unsigned51", True, "Stable to prerelease on beta channel (allowed)"),
    ]
    
    all_passed = True
    for current, channel, test_ver, should_show, desc in scenarios:
        try:
            current_is_prerelease = not is_stable_version(current)
            version_is_prerelease = not is_stable_version(test_ver)
            
            # Apply filtering logic
            if channel == "stable":
                if not current_is_prerelease and version_is_prerelease:
                    filtered = False  # Blocked
                else:
                    filtered = True  # Allowed
            else:  # beta channel
                filtered = True  # All allowed
            
            passed = (filtered == should_show)
            status = "[PASS]" if passed else "[FAIL]"
            print(f"{status} {desc}")
            print(f"    Current: {current} (prerelease: {current_is_prerelease})")
            print(f"    Test: {test_ver} (prerelease: {version_is_prerelease})")
            print(f"    Channel: {channel}")
            print(f"    Filtered: {filtered} (expected: {should_show})")
            if not passed:
                all_passed = False
        except Exception as e:
            print(f"[FAIL] {desc}")
            print(f"    Error: {e}")
            all_passed = False
    
    return all_passed


def test_update_checker_initialization():
    """Test UpdateChecker initialization"""
    print("\n" + "=" * 60)
    print("Testing UpdateChecker Initialization")
    print("=" * 60)
    
    try:
        # Test with prerelease version
        checker = UpdateChecker(
            feed_url="https://stuchain.github.io/CuePoint/updates",
            current_version="1.0.0-test-unsigned51",
            channel="stable"
        )
        
        print("[PASS] UpdateChecker initialized with prerelease version")
        print(f"    Current version: {checker.current_version}")
        print(f"    Channel: {checker.channel}")
        
        # Test that it uses short_version for comparison
        # (This is tested in the actual update check, but we can verify the structure)
        return True
    except Exception as e:
        print(f"[FAIL] UpdateChecker initialization failed: {e}")
        return False


def main():
    print("\n" + "=" * 60)
    print("Update Detection Testing")
    print("=" * 60 + "\n")
    
    results = []
    results.append(("Version Comparisons", test_version_comparisons()))
    results.append(("Prerelease Filtering", test_prerelease_filtering()))
    results.append(("UpdateChecker Initialization", test_update_checker_initialization()))
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    all_passed = True
    for name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status} {name}")
        if not passed:
            all_passed = False
    
    print()
    if all_passed:
        print("[PASS] All update detection tests passed!")
        return 0
    else:
        print("[FAIL] Some tests failed. Please review the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
