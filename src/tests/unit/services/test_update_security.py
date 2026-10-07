"""HTTPS and package-integrity checks for update URLs and downloads.

Moved with ``update_security.py`` from ``tests/unit/update/`` (PRUNE-03). The
update checker's own tests went with the old updater.
"""

import tempfile
from pathlib import Path

import pytest

from cuepoint.services.security_service import SecurityService
from cuepoint.services.update_security import (
    FeedIntegrityVerifier,
    PackageIntegrityVerifier,
)


@pytest.mark.unit
class TestFeedIntegrityVerifier:
    def test_verify_feed_https_rejects_http(self):
        ok, err = FeedIntegrityVerifier.verify_feed_https(
            "http://example.com/appcast.xml"
        )
        assert ok is False
        assert "HTTPS" in (err or "")

    def test_verify_feed_https_accepts_https(self):
        ok, err = FeedIntegrityVerifier.verify_feed_https(
            "https://example.com/appcast.xml"
        )
        assert ok is True
        assert err is None

    def test_verify_download_https_rejects_http(self):
        ok, err = FeedIntegrityVerifier.verify_download_https(
            "http://example.com/CuePoint.exe"
        )
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
class TestSecurityServiceUsesIt:
    def test_it_refuses_http_and_accepts_https(self):
        refused = SecurityService.validate_https_url("http://example.com/appcast.xml")
        assert refused.ok is False and "HTTPS" in (refused.error or "")
        accepted = SecurityService.validate_https_url("https://example.com/appcast.xml")
        assert accepted.ok is True and accepted.error is None
