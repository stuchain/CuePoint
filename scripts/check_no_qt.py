#!/usr/bin/env python3
"""Fail if Qt comes back into CuePoint.

The desktop app is Electron; Qt was removed entirely in Phase 12 (PRUNE-02,
DEC-147). This guard keeps it out of three places:

- **Python under ``src/``, ``scripts/`` and the repository root**, tests
  included: no import of a Qt binding, whether ``import``, ``from … import``,
  inside a function or a ``try``, or ``importlib.import_module("PySide6…")``.
  A docstring, comment or string that *names* PySide6 is fine: several modules
  state the rule that way.
- **The requirements:** no Qt package in a ``requirements*.txt`` or in
  ``pyproject.toml``'s dependencies.
- **The workflows and shell scripts:** no ``pip install`` of a Qt package or
  of a Qt requirements file.

Run by CI (``test.yml``, ``desktop-electron.yml``) and by Claude Code's
``qt-guard.sh`` hook after every edit to a Python file.
"""

from __future__ import annotations

import argparse
import ast
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List, Optional

ROOT = Path(__file__).resolve().parent.parent

#: Import names of Qt bindings and of the pytest plugin for them.
QT_MODULES = frozenset(
    {
        "PySide6",
        "PySide2",
        "shiboken6",
        "shiboken2",
        "PyQt6",
        "PyQt5",
        "PyQt4",
        "pytestqt",
    }
)
#: Their distribution names, lower-case with ``-`` (PEP 503).
QT_DISTRIBUTIONS = frozenset(
    {
        "pyside6",
        "pyside6-essentials",
        "pyside6-addons",
        "pyside2",
        "shiboken6",
        "shiboken2",
        "pyqt6",
        "pyqt5",
        "pyqt6-qt6",
        "pyqt5-qt5",
        "pytest-qt",
    }
)
#: Directories searched for Python, relative to the root ("" is the root's own files).
PYTHON_DIRS = ("src", "scripts", "")
WORKFLOWS_DIR = ".github/workflows"
#: Shell scripts under the Python directories, checked for a ``pip install`` of Qt.
_SHELL_SUFFIXES = (".sh", ".bash", ".ps1", ".bat", ".cmd", ".command")

_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache"}
_QT_IMPORT_LINE = re.compile(
    r"^\s*(?:from|import)\s+(" + "|".join(sorted(QT_MODULES)) + r")\b", re.MULTILINE
)
_PIP_INSTALL = re.compile(r"\bpip3?\s+install\b|\bpip\s+.*\binstall\b")
_DIST_TOKEN = re.compile(r"(?<![\w.-])([A-Za-z][A-Za-z0-9._-]*)")


def _normalise(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _list_files(root: Path) -> List[str]:
    """Tracked files and new files git does not ignore; every file outside git."""
    try:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if Path(top).resolve() == root.resolve():
            out = subprocess.run(
                ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                cwd=root,
                capture_output=True,
                check=True,
            ).stdout.decode("utf-8")
            return sorted({f for f in out.split("\0") if f and (root / f).is_file()})
    except (OSError, subprocess.CalledProcessError):
        pass
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for name in filenames:
            found.append((Path(dirpath) / name).relative_to(root).as_posix())
    return sorted(found)


def _line_of(violation: str) -> int:
    parts = violation.split(":")
    return int(parts[1]) if len(parts) > 2 and parts[1].isdigit() else 0


def _is_qt(module: str) -> bool:
    return module.split(".")[0] in QT_MODULES


def python_violations(rel: str, text: str) -> List[str]:
    """Every import of a Qt binding in one Python file."""
    found: List[str] = []
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        # A file that does not parse is still checked, line by line.
        for match in _QT_IMPORT_LINE.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            found.append(f"{rel}:{line}: imports {match.group(1)}")
        return found
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _is_qt(alias.name):
                    found.append(f"{rel}:{node.lineno}: imports {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module and _is_qt(node.module):
                found.append(f"{rel}:{node.lineno}: imports from {node.module}")
        elif isinstance(node, ast.Call):
            func = node.func
            name = (
                func.attr
                if isinstance(func, ast.Attribute)
                else getattr(func, "id", "")
            )
            first = node.args[0] if node.args else None
            if (
                name in ("import_module", "__import__")
                and isinstance(first, ast.Constant)
                and isinstance(first.value, str)
                and _is_qt(first.value)
            ):
                found.append(f"{rel}:{node.lineno}: loads {first.value}")
    return sorted(found, key=_line_of)


def requirement_violations(rel: str, text: str) -> List[str]:
    """Every Qt package a requirements file declares."""
    found = []
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        match = re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*", line)
        if match and _normalise(match.group(0)) in QT_DISTRIBUTIONS:
            found.append(f"{rel}:{number}: requires {match.group(0)}")
    return found


def pyproject_violations(rel: str, text: str) -> List[str]:
    """Every Qt package in ``pyproject.toml``'s dependency lists."""
    try:
        import tomllib
    except ModuleNotFoundError:  # pragma: no cover - the repository needs 3.11+
        return []
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        return [f"{rel}: unreadable ({exc})"]
    project = data.get("project", {})
    specs = list(project.get("dependencies", []))
    for group in project.get("optional-dependencies", {}).values():
        specs.extend(group)
    found = []
    for spec in specs:
        match = re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*", str(spec))
        if match and _normalise(match.group(0)) in QT_DISTRIBUTIONS:
            found.append(f"{rel}: requires {match.group(0)}")
    return found


def install_violations(rel: str, text: str) -> List[str]:
    """Every ``pip install`` of Qt in a workflow or a shell script."""
    found = []
    for number, line in enumerate(text.splitlines(), 1):
        code = line.split("#", 1)[0]
        if not _PIP_INSTALL.search(code):
            continue
        if re.search(r"requirements[\w.-]*qt[\w.-]*\.txt", code, re.IGNORECASE):
            found.append(f"{rel}:{number}: installs a Qt requirements file")
            continue
        for token in _DIST_TOKEN.findall(code):
            name = re.split(r"[=<>!~\[]", token, maxsplit=1)[0]
            if _normalise(name) in QT_DISTRIBUTIONS:
                found.append(f"{rel}:{number}: installs {name}")
    return found


def scan(root: Path) -> List[str]:
    violations: List[str] = []
    for rel in _list_files(root):
        name = rel.rsplit("/", 1)[-1]
        directory = rel.rsplit("/", 1)[0] if "/" in rel else ""
        in_python_dir = directory == "" or any(
            directory == d or directory.startswith(d + "/") for d in PYTHON_DIRS if d
        )
        try:
            text = (root / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if name.endswith(".py") and in_python_dir:
            violations += python_violations(rel, text)
        elif (
            directory == ""
            and name.startswith("requirements")
            and name.endswith(".txt")
        ):
            violations += requirement_violations(rel, text)
        elif rel == "pyproject.toml":
            violations += pyproject_violations(rel, text)
        elif directory == WORKFLOWS_DIR and name.endswith((".yml", ".yaml")):
            violations += install_violations(rel, text)
        elif in_python_dir and directory and name.endswith(_SHELL_SUFFIXES):
            violations += install_violations(rel, text)
    return violations


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Fail if Qt comes back into CuePoint.")
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    args = parser.parse_args(list(argv) if argv is not None else None)

    violations = scan(args.root.resolve())
    if violations:
        print("Qt found; CuePoint has no Qt (PRUNE-02, DEC-147):\n")
        print("\n".join(violations))
        return 1
    print(
        "OK: no Qt import in src/, scripts/ or the root; no Qt in the requirements; "
        "no workflow installs Qt"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
