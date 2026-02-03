#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Policy document resolution (Step 11).

Resolves paths to policy documents (privacy, terms, licenses) for both
source and PyInstaller-bundled builds.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional, Tuple


def _get_base_path() -> Path:
    """Get base path for bundled resources (source or frozen)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    # From source: SRC/cuepoint/utils/policy_docs.py -> project root
    return Path(__file__).resolve().parents[3]


def find_privacy_notice() -> Optional[Path]:
    """Find privacy notice path."""
    base = _get_base_path()
    candidates = [
        base / "PRIVACY_NOTICE.md",
        base / "docs" / "PRIVACY_NOTICE.md",  # bundled
        base / "DOCS" / "POLICY" / "privacy-notice.md",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def find_terms_of_use() -> Optional[Path]:
    """Find terms of use path."""
    base = _get_base_path()
    candidates = [
        base / "docs" / "terms-of-use.md",  # bundled
        base / "DOCS" / "POLICY" / "terms-of-use.md",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def find_third_party_licenses() -> Optional[Path]:
    """Find third-party licenses path."""
    base = _get_base_path()
    candidates = [
        base / "licenses" / "THIRD_PARTY_LICENSES.txt",  # bundled
        base / "THIRD_PARTY_LICENSES.txt",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def find_support_policy() -> Optional[Path]:
    """Find support SLA / support policy path (Step 11)."""
    base = _get_base_path()
    candidates = [
        base / "docs" / "support-sla.md",  # bundled (PyInstaller)
        base / "DOCS" / "POLICY" / "support-sla.md",
        base / "DOCS" / "prerelease" / "support-sla-playbook.md",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def find_data_processing_notice() -> Optional[Path]:
    """Find data processing notice path (Step 11)."""
    base = _get_base_path()
    candidates = [
        base / "docs" / "data-processing-notice.md",  # bundled
        base / "DOCS" / "POLICY" / "data-processing-notice.md",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def load_policy_text(path: Optional[Path], fallback: str) -> str:
    """Load policy document text or return fallback."""
    if path and path.exists():
        try:
            return path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            pass
    return fallback
