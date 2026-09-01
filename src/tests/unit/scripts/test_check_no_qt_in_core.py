#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for the Qt-boundary guard (scripts/check_no_qt_in_core.py).

AGENTS.md invariant: Qt must not enter core, engine, CLI, or services. PySide6
is not in the default requirements, so a Qt import in any engine-runtime package
raises ImportError inside the shipped Electron engine sidecar.

These tests cover both directions:
- the guard passes against the real source tree, and
- the guard actually *fails* when a violation is planted (so a green result
  means something).
"""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_SCRIPT = _REPO_ROOT / "scripts" / "check_no_qt_in_core.py"
_CUEPOINT = _REPO_ROOT / "src" / "cuepoint"


def _load_script_module():
    """Import check_no_qt_in_core.py as a module."""
    spec = importlib.util.spec_from_file_location("check_no_qt_in_core", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.unit
class TestQtBoundaryGuard:
    def test_script_exists(self):
        assert _SCRIPT.is_file(), f"missing guard script: {_SCRIPT}"

    def test_guard_passes_on_real_tree(self):
        """The current source tree must satisfy the Qt boundary."""
        result = subprocess.run(
            [sys.executable, str(_SCRIPT)],
            capture_output=True,
            text=True,
            cwd=str(_REPO_ROOT),
        )
        assert result.returncode == 0, (
            f"Qt boundary violated:\n{result.stdout}\n{result.stderr}"
        )

    def test_guard_scans_services_package(self):
        """services/ must be in scope.

        Regression guard: services/privacy_service.py and
        services/onboarding_service.py both carried unguarded QSettings imports
        that this script did not catch, because services/ was not scanned.
        """
        module = _load_script_module()
        assert "services/" in module.CORE_PREFIXES

    @pytest.mark.parametrize(
        "prefix", ["core/", "services/", "engine/", "cli/", "compat/", "models/"]
    )
    def test_guard_covers_agents_md_protected_packages(self, prefix):
        module = _load_script_module()
        assert prefix in module.CORE_PREFIXES

    def test_guard_detects_planted_violation(self, tmp_path, monkeypatch):
        """A planted Qt import in a scanned package must fail the guard."""
        module = _load_script_module()

        fake_root = tmp_path / "cuepoint"
        (fake_root / "services").mkdir(parents=True)
        (fake_root / "services" / "offender.py").write_text(
            "from PySide6.QtCore import QSettings\n", encoding="utf-8"
        )

        monkeypatch.setattr(module, "SCAN_ROOT", fake_root)
        monkeypatch.setattr(module, "GUI_APP", tmp_path / "missing_gui_app.py")

        assert module.main() == 1

    def test_guard_ignores_unscanned_packages(self, tmp_path, monkeypatch):
        """Qt in a package outside CORE_PREFIXES (e.g. utils/) is not a failure."""
        module = _load_script_module()

        fake_root = tmp_path / "cuepoint"
        (fake_root / "utils").mkdir(parents=True)
        (fake_root / "utils" / "qt_helper.py").write_text(
            "from PySide6.QtCore import QSettings\n", encoding="utf-8"
        )

        monkeypatch.setattr(module, "SCAN_ROOT", fake_root)
        monkeypatch.setattr(module, "GUI_APP", tmp_path / "missing_gui_app.py")

        assert module.main() == 0

    @pytest.mark.parametrize(
        "line",
        [
            "from PySide6.QtCore import QSettings",
            "import PySide6",
            "from PyQt5.QtWidgets import QApplication",
            "from PyQt6 import QtCore",
            "    import PySide6.QtGui",
        ],
    )
    def test_qt_import_pattern_matches_real_import_forms(self, line):
        module = _load_script_module()
        assert module.QT_IMPORT.search(line)

    @pytest.mark.parametrize(
        "line",
        [
            "# from PySide6.QtCore import QSettings",
            '"""PySide6 is not used here."""',
            "PySide6_NAME = 'unused'",
        ],
    )
    def test_qt_import_pattern_ignores_non_imports(self, line):
        module = _load_script_module()
        assert not module.QT_IMPORT.search(line)


@pytest.mark.unit
class TestServicesPackageIsQtFree:
    """Direct source assertion, independent of the guard script."""

    def test_no_qt_imports_in_services(self):
        pattern = re.compile(r"^\s*(?:from|import)\s+(?:PySide6|PyQt6|PyQt5)\b")
        offenders = []
        for path in sorted((_CUEPOINT / "services").rglob("*.py")):
            for line_no, line in enumerate(
                path.read_text(encoding="utf-8").splitlines(), 1
            ):
                if pattern.search(line):
                    offenders.append(f"{path.name}:{line_no}: {line.strip()}")
        assert not offenders, "Qt imports found in services/:\n" + "\n".join(offenders)
