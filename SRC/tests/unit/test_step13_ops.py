#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for Step 13: Post-Launch Operations and Support.

Design 13.182: CLI --export-support-bundle flag
"""

import subprocess
import sys
from pathlib import Path

import pytest


class TestExportSupportBundleCLI:
    """Tests for --export-support-bundle CLI flag (Design 13.182)."""

    def test_export_support_bundle_creates_file(self):
        """--export-support-bundle generates support bundle and exits with 0."""
        project_root = Path(__file__).resolve().parents[3]
        result = subprocess.run(
            [sys.executable, str(project_root / "main.py"), "--export-support-bundle"],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )
        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        stdout = result.stdout or ""
        assert "Support bundle created:" in stdout or "support bundle" in stdout.lower()
        assert ".zip" in stdout

    def test_export_support_bundle_help_shows_flag(self):
        """--help includes --export-support-bundle."""
        project_root = Path(__file__).resolve().parents[3]
        result = subprocess.run(
            [sys.executable, str(project_root / "main.py"), "--help"],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )
        assert result.returncode == 0
        stdout = result.stdout or ""
        assert "--export-support-bundle" in stdout
