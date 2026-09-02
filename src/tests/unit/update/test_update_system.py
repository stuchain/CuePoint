#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Behaviour of the retained update/appcast utilities.

This lived inside the package as ``cuepoint/update/test_update_system.py``,
where ``testpaths = src/tests`` meant it was never collected: three passing
tests that ran nowhere, and the only coverage ``update_preferences`` and most
of ``version_utils`` had. Moved here so it actually runs.
"""

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.update_preferences import UpdatePreferences
from cuepoint.update.version_utils import (
    compare_versions,
    is_newer_version,
    is_stable_version,
    is_test_version,
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

    # Test is_test_version (test vs non-test track)
    assert is_test_version("1.0.3-test1") is True
    assert is_test_version("1.0.4-test4") is True
    assert is_test_version("1.0.0") is False
    assert is_test_version("1.0.0-alpha") is False
    assert is_test_version("1.0.0-beta.1") is False

    print("[OK] Version utilities tests passed")


def test_update_preferences():
    """Test update preferences."""
    print("Testing update preferences...")

    import os
    import tempfile

    # Create temporary preferences file
    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as f:
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
        channel="stable",
    )

    assert checker.current_version == "1.0.0"
    assert checker.channel == "stable"
    assert (
        checker.get_feed_url("macos")
        == "https://stuchain.github.io/CuePoint/updates/macos/stable/appcast.xml"
    )
    assert (
        checker.get_feed_url("windows")
        == "https://stuchain.github.io/CuePoint/updates/windows/stable/appcast.xml"
    )

    print("[OK] Update checker initialization tests passed")
    print("  (Skipping network tests - requires valid feed URL)")
