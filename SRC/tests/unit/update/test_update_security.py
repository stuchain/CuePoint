#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from cuepoint.update.security import FeedIntegrityVerifier, PackageIntegrityVerifier
from cuepoint.update.update_checker import UpdateChecker


@pytest.mark.unit
class TestFeedIntegrityVerifier:
    def test_verify_feed_https_rejects_http(self):
        ok, err = FeedIntegrityVerifier.verify_feed_https("http://example.com/appcast.xml")
        assert ok is False
        assert "HTTPS" in (err or "")

    def test_verify_feed_https_accepts_https(self):
        ok, err = FeedIntegrityVerifier.verify_feed_https("https://example.com/appcast.xml")
        assert ok is True
        assert err is None

    def test_verify_download_https_rejects_http(self):
        ok, err = FeedIntegrityVerifier.verify_download_https("http://example.com/CuePoint.exe")
        assert ok is False
        assert "HTTPS" in (err or "")


@pytest.mark.unit
class TestPackageIntegrityVerifier:
    def test_verify_checksum_success_and_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "pkg.bin"
            p.write_bytes(b"hello")

            import hashlib

            expected = hashlib.sha256(b"hello").hexdigest()
            ok, err = PackageIntegrityVerifier.verify_checksum(p, expected)
            assert ok is True
            assert err is None

            ok, err = PackageIntegrityVerifier.verify_checksum(p, "0" * 64)
            assert ok is False
            assert "mismatch" in (err or "").lower()

    def test_verify_file_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "pkg.bin"
            p.write_bytes(b"12345")
            ok, err = PackageIntegrityVerifier.verify_file_size(p, 5)
            assert ok is True
            assert err is None

            ok, err = PackageIntegrityVerifier.verify_file_size(p, 6)
            assert ok is False
            assert "mismatch" in (err or "").lower()


@pytest.mark.unit
class TestUpdateCheckerIntegration:
    def test_parse_item_rejects_insecure_download_url(self):
        # Build an appcast <item> element with an insecure download URL.
        ns = UpdateChecker.SPARKLE_NS
        item = ET.Element("item")
        v = ET.SubElement(item, f"{{{ns}}}version")
        v.text = "1.0.1"
        sv = ET.SubElement(item, f"{{{ns}}}shortVersionString")
        sv.text = "1.0.1"
        enclosure = ET.SubElement(item, "enclosure")
        enclosure.set("url", "http://example.com/CuePoint.exe")
        enclosure.set("length", "123")

        checker = UpdateChecker("https://example.com/updates", "1.0.0", "stable")
        parsed = checker._parse_item(item)  # intentionally test the security gate
        assert parsed is None


