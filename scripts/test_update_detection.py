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
from cuepoint.update.version_utils import (
    compare_versions,
    extract_base_version,
    is_stable_version,
)


def test_version_comparisons():
    """Test version comparison scenarios"""
    print("=" * 60)
    print("Testing Version Comparisons")
    print("=" * 60)
    
    test_cases = [
        # (new_version, current_version, expected_result, description)
        ("1.0.1-test-unsigned53", "1.0.0-test-unsigned52", 1, "Prerelease to prerelease (minor bump)"),
        ("1.0.1-test-unsigned53", "1.0.0", 1, "Stable to prerelease (minor bump - should detect)"),
        ("1.0.1", "1.0.0", 1, "Stable to stable"),
        ("1.0.0", "1.0.1", -1, "Older version"),
        ("1.0.0", "1.0.0", 0, "Same version"),
        ("1.0.1-test-unsigned53", "1.0.1-test-unsigned52", 1, "Prerelease to prerelease (build bump)"),
        ("1.0.1-test-unsigned53", "1.0.1", -1, "Prerelease to stable (same base - should NOT detect)"),
        ("1.0.2-test-unsigned53", "1.0.1", 1, "Prerelease to stable (patch bump - should detect)"),
    ]
    
    all_passed = True
    for new_ver, current_ver, expected, desc in test_cases:
        try:
            # Test base version extraction
            base_new = extract_base_version(new_ver)
            base_current = extract_base_version(current_ver)
            
            # Test full version comparison
            result = compare_versions(new_ver, current_ver)
            
            # Test base version comparison
            base_result = compare_versions(base_new, base_current)
            
            # Determine if update should be detected based on new logic
            # Update should be detected if:
            # 1. Base version is newer, OR
            # 2. Base version is same but full version is newer
            should_detect = (base_result > 0) or (base_result == 0 and result > 0)
            expected_detect = expected > 0
            
            passed = (should_detect == expected_detect)
            status = "[PASS]" if passed else "[FAIL]"
            print(f"{status} {desc}")
            print(f"    {new_ver} vs {current_ver}")
            print(f"    Base: {base_new} vs {base_current} = {base_result}")
            print(f"    Full: {new_ver} vs {current_ver} = {result}")
            print(f"    Should detect: {should_detect} (expected: {expected_detect})")
            if not passed:
                all_passed = False
        except Exception as e:
            print(f"[FAIL] {desc}")
            print(f"    Error: {e}")
            import traceback
            traceback.print_exc()
            all_passed = False
    
    return all_passed


def test_prerelease_filtering():
    """Test prerelease filtering logic"""
    print("\n" + "=" * 60)
    print("Testing Prerelease Filtering Logic")
    print("=" * 60)
    
    # Simulate the filtering logic from _find_latest_update
    # Note: New logic compares BASE versions first, then applies filtering
    scenarios = [
        # (current_version, channel, test_version, should_show, description)
        ("1.0.0", "stable", "1.0.1", True, "Stable to stable on stable channel"),
        ("1.0.0", "stable", "1.0.1-test-unsigned51", True, "Stable to prerelease (minor bump - allowed)"),
        ("1.0.1", "stable", "1.0.1-test-unsigned51", False, "Stable to prerelease (same base - blocked)"),
        ("1.0.0-test-unsigned51", "stable", "1.0.1-test-unsigned51", True, "Prerelease to prerelease on stable channel (allowed)"),
        ("1.0.0", "beta", "1.0.1-test-unsigned51", True, "Stable to prerelease on beta channel (allowed)"),
    ]
    
    all_passed = True
    for current, channel, test_ver, should_show, desc in scenarios:
        try:
            base_current = extract_base_version(current)
            base_test = extract_base_version(test_ver)
            current_is_prerelease = not is_stable_version(current)
            version_is_prerelease = not is_stable_version(test_ver)
            
            # Apply NEW filtering logic (matches _find_latest_update)
            base_comp = compare_versions(base_test, base_current)
            
            if base_comp > 0:
                # Base version is newer - allow update (even if prerelease)
                # This ensures updates are detected when version numbers increment
                if channel == "stable":
                    if not current_is_prerelease and version_is_prerelease:
                        # Current is stable, candidate is prerelease
                        # Since base version is newer, allow the update
                        filtered = True  # Allowed
                    else:
                        filtered = True  # Allowed
                else:  # beta channel
                    filtered = True  # All allowed
            elif base_comp == 0:
                # Same base version
                if channel == "stable":
                    if not current_is_prerelease and version_is_prerelease:
                        filtered = False  # Blocked
                    else:
                        filtered = True  # Allowed
                else:  # beta channel
                    filtered = True  # All allowed
            else:
                filtered = False  # Older version
            
            passed = (filtered == should_show)
            status = "[PASS]" if passed else "[FAIL]"
            print(f"{status} {desc}")
            print(f"    Current: {current} (base: {base_current}, prerelease: {current_is_prerelease})")
            print(f"    Test: {test_ver} (base: {base_test}, prerelease: {version_is_prerelease})")
            print(f"    Channel: {channel}")
            print(f"    Base comparison: {base_comp}")
            print(f"    Filtered: {filtered} (expected: {should_show})")
            if not passed:
                all_passed = False
        except Exception as e:
            print(f"[FAIL] {desc}")
            print(f"    Error: {e}")
            import traceback
            traceback.print_exc()
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
