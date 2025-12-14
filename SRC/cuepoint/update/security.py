#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update security utilities (Step 8.3).

This module provides:
- HTTPS enforcement for update feeds and download URLs
- SHA-256 checksum verification helpers (for frameworks or custom download flows)
- File size verification helpers
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import urlparse


class FeedIntegrityVerifier:
    """Verify update feed integrity prerequisites."""

    @staticmethod
    def verify_feed_https(url: str) -> Tuple[bool, Optional[str]]:
        """Verify that the update feed URL uses HTTPS."""
        try:
            parsed = urlparse(url)
            if parsed.scheme != "https":
                return False, f"Feed URL must use HTTPS, got: {parsed.scheme or 'missing scheme'}"
            if not parsed.netloc:
                return False, "Feed URL is missing a host"
            return True, None
        except Exception as e:
            return False, f"Invalid feed URL: {e}"

    @staticmethod
    def verify_download_https(url: str) -> Tuple[bool, Optional[str]]:
        """Verify that the update download URL uses HTTPS."""
        try:
            parsed = urlparse(url)
            if parsed.scheme != "https":
                return False, f"Download URL must use HTTPS, got: {parsed.scheme or 'missing scheme'}"
            if not parsed.netloc:
                return False, "Download URL is missing a host"
            return True, None
        except Exception as e:
            return False, f"Invalid download URL: {e}"


class PackageIntegrityVerifier:
    """Verify update package integrity."""

    @staticmethod
    def verify_checksum(file_path: Path, expected_checksum: str) -> Tuple[bool, Optional[str]]:
        """Verify package SHA-256 checksum.

        Args:
            file_path: Path to downloaded package.
            expected_checksum: Expected SHA-256 hex string.
        """
        try:
            expected = (expected_checksum or "").strip().lower()
            if not expected:
                return False, "Missing expected checksum"
            if not PackageIntegrityVerifier.is_sha256_hex(expected):
                return False, "Expected checksum is not a valid SHA-256 hex string"

            sha256 = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    sha256.update(chunk)
            actual = sha256.hexdigest().lower()

            if actual != expected:
                return False, f"Checksum mismatch: expected {expected}, got {actual}"
            return True, None
        except FileNotFoundError:
            return False, f"File not found: {file_path}"
        except Exception as e:
            return False, f"Checksum verification error: {e}"

    @staticmethod
    def verify_file_size(file_path: Path, expected_size: int) -> Tuple[bool, Optional[str]]:
        """Verify package file size matches expected bytes."""
        try:
            if expected_size < 0:
                return False, "Expected size cannot be negative"
            actual_size = file_path.stat().st_size
            if actual_size != expected_size:
                return False, f"File size mismatch: expected {expected_size}, got {actual_size}"
            return True, None
        except FileNotFoundError:
            return False, f"File not found: {file_path}"
        except Exception as e:
            return False, f"File size verification error: {e}"

    @staticmethod
    def is_sha256_hex(value: str) -> bool:
        """Return True if value looks like a 64-char hex SHA-256 digest."""
        if len(value) != 64:
            return False
        try:
            int(value, 16)
            return True
        except ValueError:
            return False


