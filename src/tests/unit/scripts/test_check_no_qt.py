#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for the no-Qt guard (scripts/check_no_qt.py, PRUNE-02).

Qt was removed from CuePoint entirely (DEC-147). The guard replaced
``check_no_qt_in_core.py``, which looked only at the engine's packages: it
covers all of ``src/`` (tests included), ``scripts/``, the repository root's
Python, the requirements and the workflows.

Both directions are tested, as the old guard's tests were: the real tree
passes, and every way of bringing Qt back fails, while a docstring that names
PySide6 to state the rule does not.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "check_no_qt.py"
_HOOK = _REPO_ROOT / ".claude" / "hooks" / "qt-guard.sh"


def _load_script_module():
    spec = importlib.util.spec_from_file_location("check_no_qt", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


guard = _load_script_module()

pytestmark = pytest.mark.unit

#: The binding named by these tests; built so this file never imports it.
QT = "Py" + "Side6"


def _tree(tmp_path: Path, files: dict[str, str]) -> Path:
    for rel, text in files.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp_path


def _violations(tmp_path: Path, files: dict[str, str]) -> list[str]:
    return guard.scan(_tree(tmp_path, files))


class TestTheRealTree:
    def test_the_repository_has_no_qt(self):
        completed = subprocess.run(
            [sys.executable, str(_SCRIPT)],
            capture_output=True,
            text=True,
            cwd=str(_REPO_ROOT),
            check=False,
        )
        assert completed.returncode == 0, completed.stdout + completed.stderr
        assert completed.stdout.startswith("OK:")

    def test_the_old_guard_is_gone(self):
        assert not (_REPO_ROOT / "scripts" / "check_no_qt_in_core.py").exists()


class TestPythonImports:
    @pytest.mark.parametrize(
        "source",
        [
            f"import {QT}\n",
            f"import {QT}.QtCore as core\n",
            f"from {QT}.QtWidgets import QApplication\n",
            f"from {QT} import QtCore\n",
            f"from {QT}.QtCore import *\n",
            f"def f():\n    from {QT}.QtCore import QTimer\n",
            f"try:\n    import {QT}\nexcept ImportError:\n    pass\n",
            f"import importlib\nimportlib.import_module('{QT}.QtCore')\n",
            f"__import__('{QT}')\n",
            "import PyQt5.QtWidgets\n",
            "from PyQt6 import QtGui\n",
            "import PySide2\n",
            "import shiboken6\n",
            "from pytestqt.qtbot import QtBot\n",
        ],
    )
    def test_every_form_of_import_fails(self, tmp_path, source):
        violations = _violations(tmp_path, {"src/cuepoint/x.py": source})
        assert violations and violations[0].startswith("src/cuepoint/x.py:")

    @pytest.mark.parametrize(
        "rel",
        [
            "src/cuepoint/engine/x.py",
            "src/cuepoint/utils/x.py",
            "src/tests/unit/test_x.py",
            "src/x.py",
            "scripts/x.py",
            "scripts/setup/x.py",
            "main.py",
        ],
    )
    def test_every_place_python_lives_is_scanned(self, tmp_path, rel):
        assert _violations(tmp_path, {rel: f"import {QT}\n"})

    @pytest.mark.parametrize(
        "rel", ["docs/x.py", "apps/desktop-electron/x.py", "build/x.py"]
    )
    def test_places_outside_its_scope_are_not(self, tmp_path, rel):
        assert _violations(tmp_path, {rel: f"import {QT}\n"}) == []

    @pytest.mark.parametrize(
        "source",
        [
            f'"""This module must stay free of {QT}: the engine has no Qt."""\n',
            f"# {QT} was removed in Phase 12\n",
            f"NOTE = 'no {QT} here'\n",
            f"excludes = ['{QT}', 'PyQt5']\n",
            "import pyside6_tools\n",
            f"from .{QT} import local_name\n",
            "import importlib\nname = 'x'\nimportlib.import_module(name)\n",
        ],
    )
    def test_naming_qt_without_importing_it_passes(self, tmp_path, source):
        assert _violations(tmp_path, {"src/cuepoint/x.py": source}) == []

    def test_a_file_that_does_not_parse_is_still_checked(self, tmp_path):
        source = f"def broken(:\n    pass\nfrom {QT}.QtCore import QObject\n"
        assert _violations(tmp_path, {"scripts/x.py": source}) == [
            f"scripts/x.py:3: imports {QT}"
        ]

    def test_violations_are_listed_in_line_order(self, tmp_path):
        source = f"import os\ndef f():\n    import {QT}\nimport PyQt5\n"
        violations = _violations(tmp_path, {"src/x.py": source})
        assert [v.split(":")[1] for v in violations] == ["3", "4"]


class TestRequirements:
    @pytest.mark.parametrize(
        "text",
        [
            f"{QT}==6.10.1\n",
            "pyside6>=6\n",
            "pytest-qt==4.5.0\n",
            "PyQt5\n",
            "PySide6_Essentials\n",
        ],
    )
    def test_a_qt_requirement_fails(self, tmp_path, text):
        assert _violations(tmp_path, {"requirements-dev.txt": text})

    def test_a_comment_or_another_package_passes(self, tmp_path):
        text = f"# {QT} is gone\nrequests==2.33.0\n-r requirements.txt\npyqtgraph-tools==1\n"
        assert _violations(tmp_path, {"requirements.txt": text}) == []

    def test_only_the_roots_requirements_files_are_read(self, tmp_path):
        assert _violations(tmp_path, {"docs/requirements.txt": f"{QT}\n"}) == []

    def test_pyproject_dependencies_and_extras_are_read(self, tmp_path):
        text = (
            '[project]\nname = "x"\ndependencies = ["requests"]\n'
            f'[project.optional-dependencies]\nui = ["{QT}>=6"]\n'
        )
        assert _violations(tmp_path, {"pyproject.toml": text}) == [
            f"pyproject.toml: requires {QT}"
        ]

    def test_an_unreadable_pyproject_is_reported(self, tmp_path):
        violations = _violations(tmp_path, {"pyproject.toml": "[project\n"})
        assert violations and "unreadable" in violations[0]


class TestInstalls:
    @pytest.mark.parametrize(
        "line",
        [
            f"pip install {QT}",
            f"pip install requests {QT}==6.10.1",
            "python -m pip install pytest-qt",
            "pip3 install -r requirements-qt.txt",
            "pip install --upgrade PyQt6",
        ],
    )
    def test_a_workflow_installing_qt_fails(self, tmp_path, line):
        workflow = f"jobs:\n  t:\n    steps:\n      - run: {line}\n"
        assert _violations(tmp_path, {".github/workflows/ci.yml": workflow})

    @pytest.mark.parametrize(
        "line",
        [
            f"pip list | grep {QT}",
            "pip install -r requirements.txt",
            f"pip install requests  # not {QT}",
            f"echo '{QT} was removed'",
        ],
    )
    def test_a_workflow_naming_qt_without_installing_it_passes(self, tmp_path, line):
        workflow = f"jobs:\n  t:\n    steps:\n      - run: {line}\n"
        assert _violations(tmp_path, {".github/workflows/ci.yml": workflow}) == []

    def test_a_shell_script_installing_qt_fails(self, tmp_path):
        script = f"#!/bin/bash\npip3 install -r requirements.txt\npip3 install {QT}\n"
        assert _violations(tmp_path, {"scripts/setup/install.sh": script}) == [
            f"scripts/setup/install.sh:3: installs {QT}"
        ]


class TestGitCheckout:
    def _git(self, root: Path, *args: str) -> None:
        subprocess.run(
            ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
            cwd=root,
            check=True,
            capture_output=True,
        )

    def test_new_files_count_and_ignored_ones_do_not(self, tmp_path):
        _tree(tmp_path, {".gitignore": "ignored/\n", "src/ok.py": "import os\n"})
        self._git(tmp_path, "init", "-q")
        self._git(tmp_path, "add", "-A")
        self._git(tmp_path, "commit", "-q", "-m", "fixture")
        _tree(
            tmp_path,
            {
                "src/new.py": f"import {QT}\n",
                "src/ignored/old.py": f"import {QT}\n",
            },
        )
        (tmp_path / "src" / ".gitignore").write_text("ignored/\n")
        assert guard.scan(tmp_path) == [f"src/new.py:1: imports {QT}"]


class TestCommandLine:
    def test_a_violation_exits_one_and_lists_it(self, tmp_path, capsys):
        _tree(tmp_path, {"scripts/x.py": f"import {QT}\n"})
        assert guard.main(["--root", str(tmp_path)]) == 1
        out = capsys.readouterr().out
        assert "Qt found" in out and f"scripts/x.py:1: imports {QT}" in out

    def test_a_clean_tree_exits_zero(self, tmp_path, capsys):
        _tree(tmp_path, {"src/x.py": "import os\n"})
        assert guard.main(["--root", str(tmp_path)]) == 0
        assert capsys.readouterr().out.startswith("OK:")


def _bash() -> str | None:
    found = shutil.which("bash")
    if found and "system32" in found.lower():
        return None  # WSL's launcher, not a POSIX bash for this repository
    return found


@pytest.mark.skipif(_bash() is None, reason="needs bash, as Claude Code's hooks do")
class TestTheHook:
    """``qt-guard.sh`` runs the guard after an edit to Python under src/ or scripts/."""

    def _run(self, root: Path, edited: str) -> subprocess.CompletedProcess:
        payload = '{"tool_input":{"file_path":"%s"}}' % edited.replace("\\", "/")
        env = dict(os.environ)
        env["PATH"] = os.pathsep.join(
            [str(Path(sys.executable).parent), env.get("PATH", "")]
        )
        return subprocess.run(
            [_bash(), str(root / ".claude" / "hooks" / "qt-guard.sh")],
            input=payload,
            capture_output=True,
            text=True,
            cwd=str(root),
            env=env,
            check=False,
        )

    def _copy(self, tmp_path: Path) -> Path:
        (tmp_path / ".claude" / "hooks").mkdir(parents=True)
        (tmp_path / "scripts").mkdir()
        for name in ("qt-guard.sh", "lib.sh"):
            shutil.copy(
                _REPO_ROOT / ".claude" / "hooks" / name, tmp_path / ".claude" / "hooks"
            )
        shutil.copy(_SCRIPT, tmp_path / "scripts" / "check_no_qt.py")
        subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
        return tmp_path

    def test_an_edit_bringing_qt_back_is_blocked(self, tmp_path):
        root = self._copy(tmp_path)
        _tree(root, {"src/cuepoint/x.py": f"import {QT}\n"})
        completed = self._run(root, str(root / "src" / "cuepoint" / "x.py"))
        assert '"decision":"block"' in completed.stdout
        assert "check_no_qt.py failed" in completed.stdout

    def test_an_edit_to_a_script_is_checked_too(self, tmp_path):
        root = self._copy(tmp_path)
        _tree(root, {"scripts/tool.py": f"import {QT}\n"})
        completed = self._run(root, str(root / "scripts" / "tool.py"))
        assert '"decision":"block"' in completed.stdout

    def test_a_clean_edit_and_an_unrelated_file_pass_silently(self, tmp_path):
        root = self._copy(tmp_path)
        _tree(root, {"src/cuepoint/x.py": "import os\n", "docs/x.md": f"{QT}\n"})
        assert self._run(root, str(root / "src" / "cuepoint" / "x.py")).stdout == ""
        assert self._run(root, str(root / "docs" / "x.md")).stdout == ""
