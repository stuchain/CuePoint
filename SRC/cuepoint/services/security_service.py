#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Security service (Step 8.1 / 8.2 / 8.3).

This is a lightweight aggregation layer to keep security-relevant checks in one
place. In v1.0, most "security" comes from:
- secure defaults (sanitized logs, TLS verification, input validation)
- update URL requirements (HTTPS)
- platform code signing
"""

from __future__ import annotations

import ssl
from dataclasses import dataclass
from typing import Optional

from cuepoint.update.security import FeedIntegrityVerifier


@dataclass(frozen=True)
class SecurityCheckResult:
    ok: bool
    error: Optional[str] = None


class SecurityService:
    """Central place for security checks and invariants."""

    @staticmethod
    def validate_https_url(url: str) -> SecurityCheckResult:
        ok, err = FeedIntegrityVerifier.verify_feed_https(url)
        return SecurityCheckResult(ok=ok, error=err)

    @staticmethod
    def validate_system_ssl() -> SecurityCheckResult:
        """Basic runtime check that SSL can create a default context."""
        try:
            ssl.create_default_context()
            return SecurityCheckResult(ok=True, error=None)
        except Exception as e:
            return SecurityCheckResult(ok=False, error=f"SSL context error: {e}")

