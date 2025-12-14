#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Signature verification helpers for update artifacts (Step 8.3).

Important:
- CuePoint v1.0 relies on **platform signing** (macOS codesign/notarization,
  Windows Authenticode) + HTTPS for update delivery.
- This module provides checksum verification and a forward-looking interface
  for signature verification if we ever add an out-of-band signature scheme.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

from cuepoint.update.security import PackageIntegrityVerifier


@dataclass(frozen=True)
class VerificationResult:
    ok: bool
    error: Optional[str] = None


class SignatureVerifier:
    """Verify downloaded update artifacts (best-effort)."""

    @staticmethod
    def verify_sha256(file_path: Path, sha256_hex: str) -> VerificationResult:
        ok, err = PackageIntegrityVerifier.verify_checksum(file_path, sha256_hex)
        return VerificationResult(ok=ok, error=err)

    @staticmethod
    def verify_expected_size(file_path: Path, expected_size: int) -> VerificationResult:
        ok, err = PackageIntegrityVerifier.verify_file_size(file_path, expected_size)
        return VerificationResult(ok=ok, error=err)

    @staticmethod
    def verify_sparkle_eddsa_signature(*_args, **_kwargs) -> VerificationResult:
        """Placeholder for Sparkle EdDSA signature verification.

        In practice Sparkle validates signatures itself (given the appcast signature
        and the app's embedded public key), and WinSparkle relies on Authenticode.
        If we implement *custom* validation in the future, we should add a concrete
        implementation here with a clear key management story.
        """
        return VerificationResult(
            ok=False,
            error="Not implemented in v1.0 (Sparkle/WinSparkle handles signature verification)",
        )

