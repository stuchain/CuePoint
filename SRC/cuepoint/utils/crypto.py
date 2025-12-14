#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Cryptographic utilities (Step 8.2 / Step 8.3).

This module intentionally keeps a *small* surface area:
- SHA-256 hashing helpers (files/bytes)
- Constant-time comparisons
- Basic digest validation helpers

CuePoint v1.0 does not implement its own signature scheme; update integrity
is handled via HTTPS + platform code signing, with optional checksum verification.
"""

from __future__ import annotations

import hashlib
import hmac
from pathlib import Path


def sha256_bytes(data: bytes) -> str:
    """Return SHA-256 hex digest of bytes."""
    return hashlib.sha256(data).hexdigest()


def sha256_file(file_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Return SHA-256 hex digest of a file (streaming)."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def constant_time_equal(a: str, b: str) -> bool:
    """Constant-time string compare (best-effort)."""
    return hmac.compare_digest(a.encode("utf-8", errors="ignore"), b.encode("utf-8", errors="ignore"))


def is_hex_digest(value: str, length: int) -> bool:
    """Return True if value is a hex string of an expected length."""
    if not isinstance(value, str):
        return False
    v = value.strip()
    if len(v) != length:
        return False
    try:
        int(v, 16)
        return True
    except ValueError:
        return False


def is_sha256_hex(value: str) -> bool:
    """Return True if value looks like a 64-char hex SHA-256 digest."""
    return is_hex_digest(value, 64)

