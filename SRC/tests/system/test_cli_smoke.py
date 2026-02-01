"""
System / CLI smoke tests. Design 3.32, 3.93.

Run CLI with small XML; validate exit code and that outputs are produced.
"""

import subprocess
import sys
from pathlib import Path

import pytest


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
    ]
    result = subprocess.run(
        cmd,
        cwd=str(project_root),
        capture_output=True,
        text=True,
        timeout=120,
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
