"""HARDEN-04: every file CuePoint writes goes through the atomic helpers.

A source scan of the engine (``src/cuepoint``) and the Electron main process
(``apps/desktop-electron/electron``), tests aside. It finds the calls that put a
file in place by hand - ``os.replace``, ``os.rename``, ``shutil.move``,
``Path.replace``, ``Path.rename``; ``fs.rename``, ``renameSync``,
``writeFile``, ``writeFileSync`` - and fails on any outside the files named in
the allow-lists below, each with the reason it is not a user-facing or library
write. A new writer fails here until it either uses ``write_atomic`` /
``atomic_file`` / ``writeAtomic`` or is added to a list with a reason a reviewer
accepts.

Not a perfect net (a writer that calls ``open(path, "w")`` without a rename is
simply not atomic and is not found here), but it finds the pattern that was
copied around before the helpers existed: a temporary file and a rename with no
``fsync``.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Dict, List, Tuple

import pytest

_REPO = Path(__file__).resolve().parents[3]
_PYTHON_ROOT = _REPO / "src" / "cuepoint"
_ELECTRON_ROOT = _REPO / "apps" / "desktop-electron" / "electron"

#: Python files that may put a file in place by hand, and why.
PYTHON_ALLOWED: Dict[str, str] = {
    "src/cuepoint/utils/atomic_write.py": "the helper itself",
    "src/cuepoint/persistence/waveform_store.py": (
        "sets a damaged waveform store aside (renames CuePoint's own derived data)"
    ),
    "src/cuepoint/utils/paths.py": (
        "moves a legacy settings folder aside to <name>.old when migrating it"
    ),
    "src/cuepoint/services/backup_service.py": (
        "the restore's replace of the library over itself, which verifies a "
        "safety copy first (HARDEN-01a); backups write their own temp names"
    ),
}

#: Receivers of a one-argument ``.replace(...)`` that are not files.
NOT_FILE_RECEIVERS: Dict[str, str] = {
    "self._source": "a repository replacing its database row (library_import_service)",
}

#: TypeScript files that may, and why.
TYPESCRIPT_ALLOWED: Dict[str, str] = {
    "apps/desktop-electron/electron/atomicWrite.ts": "the helper itself",
    "apps/desktop-electron/electron/mainLog.ts": "log rotation (logging)",
    "apps/desktop-electron/electron/beatportSignInLog.ts": "log rotation (logging)",
    "apps/desktop-electron/electron/macInstaller.ts": (
        "DIST-06's Mac swap: a shell script moves the app bundle aside and the "
        "new one in, and the script file itself is a temporary installer"
    ),
    "apps/desktop-electron/electron/logTextDialog.ts": (
        "declares and calls an injected writer; main.ts passes writeAtomic"
    ),
}

_TS_PATTERN = re.compile(
    r"\brenameSync\b|\.rename\(|\brename\(|\bwriteFileSync\b|\bwriteFile\b(?!\s*:)"
)


def _relative(path: Path) -> str:
    return path.relative_to(_REPO).as_posix()


def hits_in_source(source: str) -> List[Tuple[int, str]]:
    """``(line, what)`` for every hand-made put-in-place call in some Python."""
    hits: List[Tuple[int, str]] = []
    for node in ast.walk(ast.parse(source)):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        func = node.func
        owner = func.value.id if isinstance(func.value, ast.Name) else None
        if owner == "os" and func.attr in ("replace", "rename", "renames"):
            hits.append((node.lineno, f"os.{func.attr}"))
        elif owner == "shutil" and func.attr == "move":
            hits.append((node.lineno, "shutil.move"))
        elif (
            func.attr in ("replace", "rename")
            and len(node.args) == 1
            and not node.keywords
        ):
            # str.replace and dataclasses.replace take two arguments; one is a path.
            receiver = ast.unparse(func.value)
            if receiver not in NOT_FILE_RECEIVERS:
                hits.append((node.lineno, f"Path.{func.attr}"))
    return sorted(hits)


def python_hits() -> List[Tuple[str, int, str]]:
    return [
        (_relative(path), line, what)
        for path in sorted(_PYTHON_ROOT.rglob("*.py"))
        for line, what in hits_in_source(path.read_text(encoding="utf-8"))
    ]


def typescript_hits() -> List[Tuple[str, int, str]]:
    hits: List[Tuple[str, int, str]] = []
    for path in sorted(_ELECTRON_ROOT.rglob("*.ts")):
        if path.name.endswith((".test.ts", ".integration.test.ts", ".d.ts")):
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            code = line.strip()
            if code.startswith(("//", "*", "/*")):
                continue
            match = _TS_PATTERN.search(line)
            if match:
                hits.append((_relative(path), number, match.group(0)))
    return hits


@pytest.mark.unit
def test_python_writers_use_the_helper():
    stray = [
        f"{file}:{line} {what}"
        for file, line, what in python_hits()
        if file not in PYTHON_ALLOWED
    ]
    assert stray == [], (
        "These put a file in place by hand. Use cuepoint.utils.atomic_write "
        "(write_atomic, atomic_file, stage_temp/commit_temp), or add the file "
        "to PYTHON_ALLOWED with a reason:\n" + "\n".join(stray)
    )


@pytest.mark.unit
def test_electron_writers_use_the_helper():
    stray = [
        f"{file}:{line} {what}"
        for file, line, what in typescript_hits()
        if file not in TYPESCRIPT_ALLOWED
    ]
    assert stray == [], (
        "These put a file in place by hand. Use electron/atomicWrite.ts "
        "(writeAtomic, writeAtomicSync), or add the file to TYPESCRIPT_ALLOWED "
        "with a reason:\n" + "\n".join(stray)
    )


@pytest.mark.unit
def test_every_allowed_file_exists_and_has_a_reason():
    # backup_service.py arrives with HARDEN-01a; until then its entry is only a
    # reservation and the file may not exist yet.
    pending = {"src/cuepoint/services/backup_service.py"}
    for table in (PYTHON_ALLOWED, TYPESCRIPT_ALLOWED):
        for file, reason in table.items():
            assert reason.strip(), file
            if file not in pending:
                assert (_REPO / file).is_file(), f"{file} is allowed but gone"


@pytest.mark.unit
def test_the_scan_finds_what_it_is_meant_to():
    """The scan itself: a hand-made rename is a hit, a string replace is not."""
    source = (
        "import os, shutil\n"
        "from pathlib import Path\n"
        "os.replace('a', 'b')\n"
        "Path('a').replace('b')\n"
        "'x'.replace('a', 'b')\n"
        "Path('a').rename(Path('b'))\n"
        "shutil.move('a', 'b')\n"
        "service.rename(1, 'name')\n"
    )
    assert hits_in_source(source) == [
        (3, "os.replace"),
        (4, "Path.replace"),
        (6, "Path.rename"),
        (7, "shutil.move"),
    ]
