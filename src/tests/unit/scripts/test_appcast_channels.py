#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for appcast/update feed generators accepting --channel test.

Design §7.2, A.1, A.2: generate_appcast.py and generate_update_feed.py must accept
--channel test and produce output under updates/*/test/.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

# Project root (CuePoint): src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_GENERATE_APPCAST = _REPO_ROOT / "scripts" / "generate_appcast.py"
_GENERATE_UPDATE_FEED = _REPO_ROOT / "scripts" / "generate_update_feed.py"


@pytest.mark.unit
class TestGenerateAppcastChannelTest:
    """generate_appcast.py must accept --channel test and write to test path."""

    def test_channel_test_produces_test_path(self):
        """With --channel test and --output to a path containing 'test', script succeeds."""
        with tempfile.TemporaryDirectory() as tmp:
            dmg = Path(tmp) / "dummy.dmg"
            dmg.write_bytes(b"x" * 256)  # minimal content for size/sha256
            out = Path(tmp) / "updates" / "macos" / "test" / "appcast.xml"
            out.parent.mkdir(parents=True, exist_ok=True)
            result = subprocess.run(
                [
                    sys.executable,
                    str(_GENERATE_APPCAST),
                    "--dmg",
                    str(dmg),
                    "--version",
                    "1.0.0-test1",
                    "--url",
                    "https://example.com/CuePoint.dmg",
                    "--channel",
                    "test",
                    "--output",
                    str(out),
                ],
                cwd=str(_REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=30,
            )
            assert result.returncode == 0, (result.stdout, result.stderr)
            assert out.exists()
            assert "test" in str(out)
            content = out.read_text(encoding="utf-8")
            assert "1.0.0-test1" in content or "test1" in content

    def test_channel_invalid_fails(self):
        """--channel invalid must fail (argparse invalid choice)."""
        with tempfile.TemporaryDirectory() as tmp:
            dmg = Path(tmp) / "dummy.dmg"
            dmg.write_bytes(b"x" * 256)
            result = subprocess.run(
                [
                    sys.executable,
                    str(_GENERATE_APPCAST),
                    "--dmg",
                    str(dmg),
                    "--version",
                    "1.0.0",
                    "--url",
                    "https://example.com/x.dmg",
                    "--channel",
                    "invalid",
                    "--output",
                    str(Path(tmp) / "appcast.xml"),
                ],
                cwd=str(_REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=10,
            )
            assert result.returncode != 0
            assert "invalid" in result.stderr.lower() or "choice" in result.stderr.lower()


@pytest.mark.unit
class TestGenerateUpdateFeedChannelTest:
    """generate_update_feed.py must accept --channel test and write to test path."""

    @pytest.mark.skipif(sys.platform == "win32", reason="Qt event loop can raise on Windows")
    def test_channel_test_produces_test_path(self):
        """With --channel test and --output to test path, script succeeds."""
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / "dummy.exe"
            exe.write_bytes(b"x" * 256)
            out = Path(tmp) / "updates" / "windows" / "test" / "appcast.xml"
            out.parent.mkdir(parents=True, exist_ok=True)
            result = subprocess.run(
                [
                    sys.executable,
                    str(_GENERATE_UPDATE_FEED),
                    "--exe",
                    str(exe),
                    "--version",
                    "1.0.0-test1",
                    "--url",
                    "https://example.com/CuePoint.exe",
                    "--channel",
                    "test",
                    "--output",
                    str(out),
                ],
                cwd=str(_REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=30,
            )
            assert result.returncode == 0, (result.stdout, result.stderr)
            assert out.exists()
            assert "test" in str(out)
            content = out.read_text(encoding="utf-8")
            assert "1.0.0-test1" in content or "test1" in content

    @pytest.mark.skipif(sys.platform == "win32", reason="Qt event loop can raise on Windows")
    def test_channel_invalid_fails(self):
        """--channel invalid must fail (argparse invalid choice)."""
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / "dummy.exe"
            exe.write_bytes(b"x" * 256)
            result = subprocess.run(
                [
                    sys.executable,
                    str(_GENERATE_UPDATE_FEED),
                    "--exe",
                    str(exe),
                    "--version",
                    "1.0.0",
                    "--url",
                    "https://example.com/x.exe",
                    "--channel",
                    "invalid",
                    "--output",
                    str(Path(tmp) / "appcast.xml"),
                ],
                cwd=str(_REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=10,
            )
            assert result.returncode != 0
            assert "invalid" in result.stderr.lower() or "choice" in result.stderr.lower()
