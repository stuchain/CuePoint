"""
System / CLI smoke tests. Design 3.32, 3.93.

Run CLI with small XML; validate exit code and that outputs are produced.

Uses CUEPOINT_SKIP_BEATPORT=1 to avoid real network calls (Beatport search),
which would cause timeouts in CI. Tracks are processed as unmatched; outputs
(CSV files) are still produced.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

# Env for subprocess: skip Beatport to avoid network timeouts in CI
_SKIP_BEATPORT_ENV = {**os.environ, "CUEPOINT_SKIP_BEATPORT": "1"}


def tests_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def fixtures_dir() -> Path:
    return tests_dir() / "fixtures" / "rekordbox"


@pytest.mark.system
def test_cli_smoke_small_xml(tmp_path: Path) -> None:
    """CLI run with small.xml produces outputs and exit 0 (happy path). Design 3.93."""
    small_xml = fixtures_dir() / "small.xml"
    if not small_xml.exists():
        pytest.skip("fixtures/rekordbox/small.xml not found")
    # Run from project root so SRC/main.py and imports work
    project_root = tests_dir().parent.parent
    out_dir = tmp_path / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        str(project_root / "SRC" / "main.py"),
        "--xml",
        str(small_xml),
        "--playlist",
        "My Playlist",
        "--output-dir",
        str(out_dir),
        "--out",
        "smoke_test",
        "--no-preflight",  # Skip network check for fast CI run
    ]
    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        capture_output=True,
        text=True,
        timeout=120,
        env=_SKIP_BEATPORT_ENV,
    )
    assert result.returncode == 0, f"CLI failed: {result.stderr or result.stdout}"
    # At least main CSV should exist (with timestamp in name)
    csv_files = list(out_dir.glob("smoke_test*.csv"))
    assert len(csv_files) >= 1, f"Expected at least one output CSV in {out_dir}"


@pytest.mark.system
def test_cli_missing_xml_returns_error() -> None:
    """CLI with missing --xml returns non-zero. Design 3.111."""
    project_root = Path(__file__).resolve().parent.parent.parent
    cmd = [
        sys.executable,
        str(project_root / "SRC" / "main.py"),
        "--xml",
        "/nonexistent/path.xml",
        "--playlist",
        "Test",
    ]
    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0


@pytest.mark.system
def test_cli_resume_and_reliability_flags(tmp_path: Path) -> None:
    """Design 5.53, 5.153: CLI --resume, --no-resume, --checkpoint-every, --max-retries parse and run."""
    small_xml = fixtures_dir() / "small.xml"
    if not small_xml.exists():
        pytest.skip("fixtures/rekordbox/small.xml not found")
    project_root = tests_dir().parent.parent
    out_dir = tmp_path / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    # Run with --no-resume and reliability flags (should run normally)
    cmd = [
        sys.executable,
        str(project_root / "SRC" / "main.py"),
        "--xml", str(small_xml),
        "--playlist", "My Playlist",
        "--output-dir", str(out_dir),
        "--out", "reliability_test",
        "--no-resume",
        "--checkpoint-every", "25",
        "--max-retries", "2",
        "--no-preflight",  # Skip network check for fast CI run
    ]
    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        capture_output=True,
        text=True,
        timeout=120,
        env=_SKIP_BEATPORT_ENV,
    )
    assert result.returncode == 0, f"CLI failed: {result.stderr or result.stdout}"


@pytest.mark.system
def test_cli_missing_playlist_returns_error() -> None:
    """CLI without required --playlist returns non-zero. Design 3.111."""
    project_root = Path(__file__).resolve().parent.parent.parent
    small_xml = fixtures_dir() / "small.xml"
    if not small_xml.exists():
        pytest.skip("fixtures/rekordbox/small.xml not found")
    cmd = [
        sys.executable,
        str(project_root / "SRC" / "main.py"),
        "--xml",
        str(small_xml),
        # missing --playlist
    ]
    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0
