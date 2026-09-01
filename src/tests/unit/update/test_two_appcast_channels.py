#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for two-appcast-feeds (stable vs test) design.

Verifies that UpdateChecker builds the correct feed URL per channel and that
test-version detection behaves as designed.

Note: the "effective channel" tests that exercised UpdateManager were removed
along with the Qt update flow. The rule they protected still matters and must be
reimplemented by any future (Electron-native) updater: **a test build must fetch
the test feed regardless of the user's channel preference**, otherwise test
builds check the stable feed and never see test releases. See
docs/features/update-system.md.
"""

import pytest

from cuepoint.update.update_checker import UpdateChecker
from cuepoint.update.version_utils import is_test_version


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
