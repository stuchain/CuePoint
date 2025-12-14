#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for update system components.

This script tests the update system components to ensure they work correctly.
"""

import sys
from pathlib import Path

# Add SRC to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cuepoint.update.update_checker import UpdateChecker, UpdateCheckError
from cuepoint.update.update_preferences import UpdatePreferences
from cuepoint.update.version_utils import (
    compare_versions,
    is_newer_version,
    is_stable_version,
    parse_version,
)


def test_version_utils():
    """Test version comparison utilities."""
    print("Testing version utilities...")
    
    # Test parse_version
    assert parse_version("1.0.0") == (1, 0, 0, None)
    assert parse_version("1.0.0-beta.1") == (1, 0, 0, "beta.1")
    assert parse_version("2.5.10") == (2, 5, 10, None)
    
    # Test compare_versions
    assert compare_versions("1.0.0", "1.0.1") == -1
    assert compare_versions("1.0.1", "1.0.0") == 1
    assert compare_versions("1.0.0", "1.0.0") == 0
    assert compare_versions("2.0.0", "1.9.9") == 1
    assert compare_versions("1.0.0", "1.0.0-beta.1") == 1  # Stable > prerelease
    
    # Test is_newer_version
    assert is_newer_version("1.0.1", "1.0.0") is True
    assert is_newer_version("1.0.0", "1.0.1") is False
    assert is_newer_version("1.0.0", "1.0.0") is False
    
    # Test is_stable_version
    assert is_stable_version("1.0.0") is True
    assert is_stable_version("1.0.0-beta.1") is False
    
    print("[OK] Version utilities tests passed")


def test_update_preferences():
    """Test update preferences."""
    print("Testing update preferences...")
    
    import os
    import tempfile

    # Create temporary preferences file
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
        temp_path = f.name
    
    try:
        prefs = UpdatePreferences(temp_path)
        
        # Test defaults
        assert prefs.get_check_frequency() == UpdatePreferences.CHECK_ON_STARTUP
        assert prefs.get_channel() == UpdatePreferences.CHANNEL_STABLE
        assert prefs.get_ignored_versions() == []
        
        # Test setting values
        prefs.set_check_frequency(UpdatePreferences.CHECK_DAILY)
        assert prefs.get_check_frequency() == UpdatePreferences.CHECK_DAILY
        
        prefs.set_channel(UpdatePreferences.CHANNEL_BETA)
        assert prefs.get_channel() == UpdatePreferences.CHANNEL_BETA
        
        # Test ignoring versions
        prefs.ignore_version("1.0.1")
        assert prefs.is_version_ignored("1.0.1") is True
        assert prefs.is_version_ignored("1.0.2") is False
        
        prefs.unignore_version("1.0.1")
        assert prefs.is_version_ignored("1.0.1") is False
        
        print("[OK] Update preferences tests passed")
    
    finally:
        # Clean up
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def test_update_checker():
    """Test update checker (requires network)."""
    print("Testing update checker...")
    
    # This test requires a valid feed URL, so we'll just test initialization
    checker = UpdateChecker(
        feed_url="https://stuchain.github.io/CuePoint/updates",
        current_version="1.0.0",
        channel="stable"
    )
    
    assert checker.current_version == "1.0.0"
    assert checker.channel == "stable"
    assert checker.get_feed_url("macos") == "https://stuchain.github.io/CuePoint/updates/macos/stable/appcast.xml"
    assert checker.get_feed_url("windows") == "https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml"
    
    print("[OK] Update checker initialization tests passed")
    print("  (Skipping network tests - requires valid feed URL)")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Update System Tests")
    print("=" * 60)
    print()
    
    try:
        test_version_utils()
        print()
        test_update_preferences()
        print()
        test_update_checker()
        print()
        print("=" * 60)
        print("All tests passed! [OK]")
        print("=" * 60)
        return 0
    
    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
