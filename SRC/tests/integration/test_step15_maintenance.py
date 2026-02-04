"""
Step 15: Long-Term Maintenance and Evolution — Integration tests.

Tests maintenance report, compatibility checks, and maintenance tooling.
"""

import json
import platform
import subprocess
import sys
from pathlib import Path

import pytest


def _repo_root() -> Path:
    """Repository root (where requirements.txt, scripts/, DOCS/ live)."""
    # __file__ = SRC/tests/integration/test_step15_maintenance.py
    # parent.parent.parent = SRC, parent of SRC = repo root
    return Path(__file__).resolve().parent.parent.parent.parent


@pytest.mark.integration
def test_maintenance_report_script_runs() -> None:
    """Maintenance report script runs and produces valid output."""
    repo_root = _repo_root()
    script = repo_root / "scripts" / "maintenance_report.py"
    if not script.exists():
        pytest.skip("scripts/maintenance_report.py not found")
    # --skip-audit for fast test (pip-audit can be slow; CI runs it separately)
    result = subprocess.run(
        [sys.executable, str(script), "--skip-audit"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode in (0, 1), f"Unexpected exit: {result.stderr}"
    assert "Maintenance Report" in result.stdout or "maintenance_report" in result.stdout
    assert "Python" in result.stdout
    assert "Platform" in result.stdout or "platform" in result.stdout.lower()


@pytest.mark.integration
def test_maintenance_report_json_output() -> None:
    """Maintenance report --json produces valid JSON with expected keys."""
    repo_root = _repo_root()
    script = repo_root / "scripts" / "maintenance_report.py"
    if not script.exists():
        pytest.skip("scripts/maintenance_report.py not found")
    result = subprocess.run(
        [sys.executable, str(script), "--json", "--skip-audit"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, f"JSON mode failed: {result.stderr}"
    data = json.loads(result.stdout)
    assert "python_version" in data
    assert "platform" in data
    assert "requirements" in data
    assert "dependency_audit" in data
    assert "maintenance_report" in data
    assert data["maintenance_report"] is True


@pytest.mark.integration
def test_maintenance_report_cli_flag() -> None:
    """--maintenance-report CLI flag runs report and exits."""
    repo_root = _repo_root()
    main_py = repo_root / "SRC" / "main.py"
    if not main_py.exists():
        pytest.skip("SRC/main.py not found")
    # --skip-audit for fast test (pip-audit can be slow; CI runs it separately)
    result = subprocess.run(
        [sys.executable, str(main_py), "--maintenance-report", "--skip-audit"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode in (0, 1)
    assert "Maintenance Report" in result.stdout or "maintenance_report" in result.stdout


@pytest.mark.integration
def test_python_version_supported() -> None:
    """Python version is in supported range (3.11+)."""
    major, minor = sys.version_info.major, sys.version_info.minor
    assert major == 3, "Python 3 required"
    assert minor >= 11, "Python 3.11+ required (see compatibility matrix)"


@pytest.mark.integration
def test_platform_detection() -> None:
    """Platform info can be collected (compatibility matrix)."""
    system = platform.system()
    release = platform.release()
    assert system in ("Windows", "Darwin", "Linux"), f"Unexpected system: {system}"
    assert release, "Release should be non-empty"


@pytest.mark.integration
def test_requirements_files_exist() -> None:
    """Required dependency files exist."""
    repo_root = _repo_root()
    assert (repo_root / "requirements.txt").exists()
    assert (repo_root / "requirements-dev.txt").exists()
    assert (repo_root / "requirements-build.txt").exists()


@pytest.mark.integration
def test_maintenance_docs_exist() -> None:
    """Step 15 maintenance documentation exists."""
    repo_root = _repo_root()
    assert (repo_root / "DOCS" / "RELEASE" / "maintenance-policy.md").exists()
    assert (repo_root / "DOCS" / "RELEASE" / "compatibility-matrix.md").exists()
    assert (repo_root / "DOCS" / "RELEASE" / "maintenance-roadmap.md").exists()
