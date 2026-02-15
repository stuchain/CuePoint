#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for two-appcast-feeds (stable vs test) design.

Verifies FR1, FR2, I2: effective channel is "test" when version is test,
otherwise from preferences; UpdateChecker builds correct feed URL for test channel.
"""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.update_manager import UpdateManager
from cuepoint.update.update_preferences import UpdatePreferences
from cuepoint.update.version_utils import is_test_version


@pytest.mark.unit
class TestEffectiveChannel:
    """UpdateManager must use effective_channel: test when version is test, else preference."""

    def test_test_version_uses_test_channel_ignores_preference(self):
        """FR1, I2: Test version => channel "test" even if preference is stable or beta."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            prefs_path = f.name
        try:
            prefs = UpdatePreferences(preferences_file=Path(prefs_path))
            prefs.set_channel(UpdatePreferences.CHANNEL_STABLE)
            manager = UpdateManager(
                current_version="1.0.3-test1",
                feed_url="https://example.com/updates",
                preferences=prefs,
            )
            assert manager.checker.channel == "test"
        finally:
            Path(prefs_path).unlink(missing_ok=True)

    def test_test_version_uses_test_channel_when_preference_beta(self):
        """FR1, I2: Test version => channel "test" when preference is beta."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            prefs_path = f.name
        try:
            prefs = UpdatePreferences(preferences_file=Path(prefs_path))
            prefs.set_channel(UpdatePreferences.CHANNEL_BETA)
            manager = UpdateManager(
                current_version="1.0.4-test4",
                feed_url="https://example.com/updates",
                preferences=prefs,
            )
            assert manager.checker.channel == "test"
        finally:
            Path(prefs_path).unlink(missing_ok=True)

    def test_non_test_version_uses_stable_from_preference(self):
        """FR2: Non-test version => channel from preferences (stable)."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            prefs_path = f.name
        try:
            prefs = UpdatePreferences(preferences_file=Path(prefs_path))
            prefs.set_channel(UpdatePreferences.CHANNEL_STABLE)
            manager = UpdateManager(
                current_version="1.0.0",
                feed_url="https://example.com/updates",
                preferences=prefs,
            )
            assert manager.checker.channel == "stable"
        finally:
            Path(prefs_path).unlink(missing_ok=True)

    def test_non_test_version_uses_beta_from_preference(self):
        """FR2: Non-test version => channel from preferences (beta)."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            prefs_path = f.name
        try:
            prefs = UpdatePreferences(preferences_file=Path(prefs_path))
            prefs.set_channel(UpdatePreferences.CHANNEL_BETA)
            manager = UpdateManager(
                current_version="1.0.0-alpha",
                feed_url="https://example.com/updates",
                preferences=prefs,
            )
            assert manager.checker.channel == "beta"
        finally:
            Path(prefs_path).unlink(missing_ok=True)


@pytest.mark.unit
class TestUpdateCheckerTestChannelFeedUrl:
    """UpdateChecker with channel "test" must produce feed URLs with /test/."""

    def test_get_feed_url_macos_test_channel(self):
        """Feed URL for macOS and channel test contains /macos/test/appcast.xml."""
        checker = UpdateChecker(
            feed_url="https://stuchain.github.io/CuePoint/updates",
            current_version="1.0.3-test1",
            channel="test",
        )
        url = checker.get_feed_url("macos")
        assert "/macos/test/appcast.xml" in url
        assert (
            url == "https://stuchain.github.io/CuePoint/updates/macos/test/appcast.xml"
        )

    def test_get_feed_url_windows_test_channel(self):
        """Feed URL for Windows and channel test contains /windows/test/appcast.xml."""
        checker = UpdateChecker(
            feed_url="https://stuchain.github.io/CuePoint/updates",
            current_version="1.0.3-test1",
            channel="test",
        )
        url = checker.get_feed_url("windows")
        assert "/windows/test/appcast.xml" in url
        assert (
            url
            == "https://stuchain.github.io/CuePoint/updates/windows/test/appcast.xml"
        )

    def test_get_feed_url_stable_channel_unchanged(self):
        """Stable channel still produces /stable/ path (regression)."""
        checker = UpdateChecker(
            feed_url="https://example.com/updates",
            current_version="1.0.0",
            channel="stable",
        )
        assert "/stable/appcast.xml" in checker.get_feed_url("macos")
        assert "/stable/appcast.xml" in checker.get_feed_url("windows")


@pytest.mark.unit
class TestIsTestVersionEdgeCases:
    """Edge cases for is_test_version (design §7.6)."""

    def test_stable_not_test(self):
        assert is_test_version("1.0.0") is False

    def test_test_suffix_is_test(self):
        assert is_test_version("1.0.0-test") is True
        assert is_test_version("1.0.0-test1") is True
        assert is_test_version("1.0.0-test1.1") is True

    def test_alpha_beta_not_test(self):
        assert is_test_version("1.0.0-alpha") is False
        assert is_test_version("1.0.0-beta.1") is False

    def test_case_insensitive_test_prefix(self):
        """Prerelease is lowercased before startswith('test')."""
        assert is_test_version("1.0.0-TEST2") is True

    def test_test_with_suffix_unsigned(self):
        """e.g. 1.0.0-test-unsigned42: prerelease starts with 'test'."""
        assert is_test_version("2.1.0-test-unsigned42") is True


@pytest.mark.unit
class TestTestToTestUpdateReturnsDownloadUrl:
    """Test build updating to newer test build gets a valid download_url (no 404 after publishing test releases)."""

    def test_thread_path_keeps_test_channel_for_test_build(self):
        """_do_check (thread path, used on Windows) must not overwrite test channel with preference.

        Bug: channel was set from preferences.get_channel() so test builds fetched stable feed.
        """
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            prefs_path = f.name
        try:
            prefs = UpdatePreferences(preferences_file=Path(prefs_path))
            prefs.set_channel(UpdatePreferences.CHANNEL_STABLE)
            manager = UpdateManager(
                current_version="0.0.1-test",
                feed_url="https://example.com/updates",
                preferences=prefs,
            )
            assert manager.checker.channel == "test"
            feed_url_before = manager.checker.get_feed_url("windows")
            assert "/test/" in feed_url_before

            with patch.object(manager.checker, "check_for_updates", return_value=None):
                manager._do_check()

            assert manager.checker.channel == "test"
            feed_url_after = manager.checker.get_feed_url("windows")
            assert "/test/" in feed_url_after
        finally:
            Path(prefs_path).unlink(missing_ok=True)

    def test_test_version_sees_newer_test_in_appcast_with_download_url(self):
        """0.0.3-test sees 0.0.4-test in appcast and gets update with HTTPS download_url."""
        # Minimal appcast with one item: 0.0.4-test, GitHub-style enclosure URL
        ns = "http://www.andymatuschak.org/xml-namespaces/sparkle"
        appcast_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:sparkle="{ns}">
  <channel>
    <item>
      <title>CuePoint 0.0.4-test</title>
      <sparkle:version>202502111200</sparkle:version>
      <sparkle:shortVersionString>0.0.4-test</sparkle:shortVersionString>
      <enclosure url="https://github.com/stuchain/CuePoint/releases/download/v0.0.4-test/CuePoint-Setup-0.0.4-test.exe"
                 length="50000000"
                 type="application/octet-stream"
                 sparkle:sha256="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/>
    </item>
  </channel>
</rss>"""
        checker = UpdateChecker(
            feed_url="https://stuchain.github.io/CuePoint/updates",
            current_version="0.0.3-test",
            channel="test",
        )
        result = checker.check_update_from_appcast(appcast_xml.encode("utf-8"))
        assert result is not None
        assert result.get("short_version") == "0.0.4-test"
        download_url = result.get("download_url")
        assert download_url is not None
        assert download_url.startswith("https://")
        assert "releases/download" in download_url
        assert "0.0.4-test" in download_url
