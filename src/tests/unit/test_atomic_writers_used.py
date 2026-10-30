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

#: Python calls that may put a file in place by hand: per file, the start of the
#: call's source text and why it is not a user-facing or library write. A new
#: call in an allowed file is still a hit unless its text starts with one of these.
PYTHON_ALLOWED: Dict[str, List[Tuple[str, str]]] = {
    "src/cuepoint/utils/atomic_write.py": [
        ("os.replace(temp, path)", "the helper itself")
    ],
    "src/cuepoint/data/tag_save.py": [
        (
            "shutil.copyfileobj(source, target",
            "fills the exclusive temporary copy of the audio file, which is "
            "checked and then put in place by the helper",
        )
    ],
    "src/cuepoint/data/rekordbox_export.py": [
        (
            "shutil.copy2(destination, backup)",
            "the dated safety copy of the previous export, fsynced right after",
        )
    ],
    "src/cuepoint/persistence/waveform_store.py": [
        (
            "source.replace(",
            "sets a damaged waveform store aside (CuePoint's own derived data)",
        )
    ],
    "src/cuepoint/utils/paths.py": [
        (
            "shutil.copytree(",
            "migrates a legacy settings folder (CuePoint's own state)",
        ),
        ("shutil.copy2(", "migrates a legacy settings folder (CuePoint's own state)"),
        ("old_path.rename(", "moves the legacy settings folder aside to <name>.old"),
    ],
    "src/cuepoint/services/integrity_service.py": [
        (
            "shutil.copyfileobj(f_in, f_out)",
            "gzips CuePoint's own audit log in its output folder",
        ),
        (
            "shutil.copy2(filepath, bak_path)",
            "keeps a .bak of CuePoint's own checksum file before it is rewritten",
        ),
    ],
    "src/cuepoint/services/backup_service.py": [
        (
            "os.replace(",
            "backups write .partial files and verify them; a restore verifies a "
            "safety copy first (HARDEN-01a)",
        ),
        (
            "shutil.copyfile(",
            "the restore's safety copy of a damaged library before it is replaced",
        ),
    ],
}

#: Receivers of a one-argument ``.replace(...)`` that are not files.
NOT_FILE_RECEIVERS: Dict[str, str] = {
    "self._source": "a repository replacing its database row (library_import_service)",
}

#: TypeScript lines that may, and why: per file, the start of the trimmed line.
TYPESCRIPT_ALLOWED: Dict[str, List[Tuple[str, str]]] = {
    "apps/desktop-electron/electron/atomicWrite.ts": [
        ("await handle.writeFile(", "the helper itself"),
        ("await fs.promises.rename(", "the helper itself"),
        ("fs.renameSync(", "the helper itself"),
    ],
    "apps/desktop-electron/electron/mainLog.ts": [
        ("appendFile", "logging"),
        ("rename", "log rotation (logging)"),
        ("await fs.rename(", "log rotation (logging)"),
        ("await fs.appendFile(", "logging"),
        ("if (keep > 1) await fs.rename(", "log rotation (logging)"),
    ],
    "apps/desktop-electron/electron/beatportSignInLog.ts": [
        ("appendFile", "logging"),
        ("rename", "log rotation (logging)"),
        ("await this.fs.rename(", "log rotation (logging)"),
        ("await this.fs.appendFile(", "logging"),
    ],
    "apps/desktop-electron/electron/engineEvidenceForTest.ts": [
        (
            "import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync }",
            "end-to-end runs only (CUEPOINT_E2E): engine evidence files in test-results, not user data",
        ),
        (
            'writeFileSync(request, "")',
            "end-to-end runs only (CUEPOINT_E2E): engine evidence files in test-results, not user data",
        ),
        (
            "writeFileSync(path.join(dir, `main-",
            "end-to-end runs only (CUEPOINT_E2E): engine evidence files in test-results, not user data",
        ),
    ],
    "apps/desktop-electron/electron/macInstaller.ts": [
        (
            "fs.writeFileSync(script,",
            "DIST-06: the temporary installer script that does the Mac swap (its "
            "own mv commands are in a shell string, not a TypeScript call)",
        )
    ],
    "apps/desktop-electron/electron/logTextDialog.ts": [
        (
            "await deps.writeFile(",
            "calls the injected writer; main.ts passes writeAtomic",
        ),
    ],
}

_TS_PATTERN = re.compile(
    r"\brenameSync\b|\.rename\(|\brename\(|\bwriteFileSync\b|\bwriteFile\b(?!\s*:)"
    r"|\bcreateWriteStream\b|\bcopyFile(?:Sync)?\b|\bappendFile(?:Sync)?\b|\bcpSync\b"
)


def _relative(path: Path) -> str:
    return path.relative_to(_REPO).as_posix()


_OS_NAMES = frozenset({"replace", "rename", "renames", "link", "symlink"})
_SHUTIL_NAMES = frozenset(
    {"move", "copyfile", "copy", "copy2", "copyfileobj", "copytree"}
)


def hits_in_source(source: str) -> List[Tuple[int, str]]:
    """``(line, snippet)`` for every hand-made put-in-place call in some Python.

    Resolves ``import os as x`` / ``import shutil as y`` and
    ``from os import replace [as z]`` / ``from shutil import copyfile ...``, so a
    renamed import is the same hit. One-argument ``.replace(p)`` / ``.rename(p)``
    is ``Path``'s; so is a two-argument one on a ``Path(...)`` expression
    (``str.replace`` takes two arguments, which is why those are not flagged
    elsewhere).
    """
    tree = ast.parse(source)
    modules: Dict[str, str] = {}  # local name -> "os" | "shutil"
    functions: Dict[str, str] = {}  # local name -> "os.replace" etc.
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in ("os", "shutil"):
                    modules[alias.asname or alias.name] = alias.name
        elif isinstance(node, ast.ImportFrom) and node.module in ("os", "shutil"):
            names = _OS_NAMES if node.module == "os" else _SHUTIL_NAMES
            for alias in node.names:
                if alias.name in names:
                    functions[alias.asname or alias.name] = (
                        f"{node.module}.{alias.name}"
                    )

    hits: List[Tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        snippet = ast.unparse(node)
        if isinstance(func, ast.Name) and func.id in functions:
            hits.append((node.lineno, snippet))
        elif isinstance(func, ast.Attribute):
            owner = func.value.id if isinstance(func.value, ast.Name) else None
            module = modules.get(owner or "")
            if (module == "os" and func.attr in _OS_NAMES) or (
                module == "shutil" and func.attr in _SHUTIL_NAMES
            ):
                hits.append((node.lineno, snippet))
            elif func.attr in ("replace", "rename") and not node.keywords:
                receiver = ast.unparse(func.value)
                one_path = len(node.args) == 1
                path_expression = len(node.args) == 2 and receiver.startswith(
                    ("Path(", "pathlib.Path(")
                )
                if (one_path or path_expression) and receiver not in NOT_FILE_RECEIVERS:
                    hits.append((node.lineno, snippet))
    return sorted(hits)


def python_hits() -> List[Tuple[str, int, str]]:
    return [
        (_relative(path), line, what)
        for path in sorted(_PYTHON_ROOT.rglob("*.py"))
        for line, what in hits_in_source(path.read_text(encoding="utf-8"))
    ]


def typescript_hits() -> List[Tuple[str, int, str]]:
    """``(file, line, trimmed source line)`` for every hand-made write."""
    hits: List[Tuple[str, int, str]] = []
    for path in sorted(_ELECTRON_ROOT.rglob("*.ts")):
        if path.name.endswith((".test.ts", ".integration.test.ts", ".d.ts")):
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            code = line.strip()
            if code.startswith(("//", "*", "/*")):
                continue
            if _TS_PATTERN.search(code):
                hits.append((_relative(path), number, code))
    return hits


def _allowed(table: Dict[str, List[Tuple[str, str]]], file: str, text: str) -> bool:
    return any(text.startswith(prefix) for prefix, _ in table.get(file, []))


@pytest.mark.unit
def test_python_writers_use_the_helper():
    stray = [
        f"{file}:{line} {text}"
        for file, line, text in python_hits()
        if not _allowed(PYTHON_ALLOWED, file, text)
    ]
    assert stray == [], (
        "These put a file in place by hand. Use cuepoint.utils.atomic_write "
        "(write_atomic, atomic_file, stage_temp and its pair), or add the call to "
        "PYTHON_ALLOWED with a reason:\n" + "\n".join(stray)
    )


@pytest.mark.unit
def test_electron_writers_use_the_helper():
    stray = [
        f"{file}:{line} {text}"
        for file, line, text in typescript_hits()
        if not _allowed(TYPESCRIPT_ALLOWED, file, text)
    ]
    assert stray == [], (
        "These write a file by hand. Use electron/atomicWrite.ts (writeAtomic, "
        "writeAtomicSync), or add the line to TYPESCRIPT_ALLOWED with a reason:\n"
        + "\n".join(stray)
    )


@pytest.mark.unit
def test_every_allowance_has_a_reason_and_still_matches_something():
    python_found = python_hits()
    typescript_found = typescript_hits()
    for table, found in (
        (PYTHON_ALLOWED, python_found),
        (TYPESCRIPT_ALLOWED, typescript_found),
    ):
        for file, entries in table.items():
            assert (_REPO / file).is_file(), f"{file} is allowed but gone"
            for prefix, reason in entries:
                assert reason.strip(), (file, prefix)
                assert any(
                    f == file and text.startswith(prefix) for f, _line, text in found
                ), (
                    f"{file}: nothing starts with {prefix!r} any more; remove the allowance"
                )


@pytest.mark.unit
def test_the_python_scan_finds_what_it_is_meant_to():
    source = (
        "import os, shutil\n"
        "import os as o\n"
        "import shutil as sh\n"
        "from os import replace, rename as mv\n"
        "from shutil import copyfile\n"
        "from pathlib import Path\n"
        "os.replace('a', 'b')\n"
        "o.rename('a', 'b')\n"
        "sh.move('a', 'b')\n"
        "replace('a', 'b')\n"
        "mv('a', 'b')\n"
        "copyfile('a', 'b')\n"
        "Path('a').replace('b')\n"
        "Path('a').replace('b', 'c')\n"
        "'x'.replace('a', 'b')\n"
        "service.rename(1, 'name')\n"
        "shutil.copyfile('a', 'b')\n"
        "dataclasses.replace(x, y=1)\n"
    )
    assert [line for line, _ in hits_in_source(source)] == [
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        17,
    ]


@pytest.mark.unit
@pytest.mark.parametrize(
    "line",
    [
        "fs.createWriteStream(path)",
        "await fs.promises.copyFile(a, b)",
        "fs.copyFileSync(a, b)",
        "await fs.promises.appendFile(a, text)",
        "fs.writeFileSync(a, b)",
        "await fs.promises.rename(a, b)",
    ],
)
def test_the_typescript_pattern_finds_the_ways_to_write(line):
    assert _TS_PATTERN.search(line)
