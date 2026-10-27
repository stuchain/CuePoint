#!/usr/bin/env python3
"""Find what nothing shipped or run reaches: the evidence behind Phase 12's audit.

PRUNE-01 (``docs/v1/PHASE12_CLEANUP.md``). The script reads the repository and
reports; it changes nothing. ``docs/v1/PHASE12_AUDIT.md`` is written from its
output, and PRUNE-08 keeps it as the dead-code guard.

What "dead" means is the phase's cross-cutting fact 1: nothing shipped or run
reaches a file, and it is not a public interface. "Shipped or run" is:

- the CLI (``main.py`` -> ``src/main.py``) and the engine
  (``python -m cuepoint.engine``, and the PyInstaller sidecar built from
  ``build/engine-sidecar.spec``);
- the Electron app: ``electron/main.ts``, the runtime ``preload.cjs`` and the
  renderer's ``index.html``;
- every script a workflow, an npm script, a hook, ``pre-commit``, the build or
  the developer docs run, and every script those scripts run.

A test does not make code alive: a module only its tests import is reported as
unreached, with those tests listed.

Fact 2 is why this is more than an import scan. Code is also loaded without an
``import`` line, so each of these counts as a reach:

- ``importlib.import_module("literal")`` and ``__import__("literal")``;
- ``pkgutil.iter_modules(__path__)`` in a package, which loads every child;
- the sidecar spec's ``hiddenimports`` and ``collect_submodules(...)``;
- entry points in ``pyproject.toml``;
- ``import()``, ``require()`` and ``new URL(..., import.meta.url)`` in
  TypeScript, and the scripts and styles ``index.html`` names;
- script names in workflows, ``package.json``, hooks, ``pre-commit`` and docs.

A load the scan cannot read (``import_module`` of a computed name, a file
loaded by path) is listed under "dynamic sites" for a person to check, and
every unreached module lists the files that name it anyway. Migrations are
never reported as dead: they are how every user's database reaches the
current schema.

Usage::

    python scripts/audit_dead_code.py                 # Markdown report to stdout
    python scripts/audit_dead_code.py --output r.md   # ...or to a file
    python scripts/audit_dead_code.py --json r.json   # the full findings as JSON
    python scripts/audit_dead_code.py --section python --section scripts
    python scripts/audit_dead_code.py --check         # the guard: exit 1 on dead code
"""

from __future__ import annotations

import argparse
import ast
import functools
import json
import os
import posixpath
import re
import subprocess
import sys
from collections import defaultdict, deque
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Optional

try:  # Python 3.11+
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - the repository needs 3.11+
    tomllib = None  # type: ignore[assignment]

ROOT = Path(__file__).resolve().parent.parent

#: PRUNE-08: files the guard (``--check``) tolerates although the scan finds
#: nothing reaching them, as ``path -> why it is genuinely used``. Only a use the
#: scan cannot see belongs here; otherwise delete the file or wire it in. An
#: entry whose file is gone or is now reached fails the guard, so this cannot rot.
ALLOWLIST: dict[str, str] = {}

SECTIONS = (
    "counts",
    "python",
    "scripts",
    "workflows",
    "typescript",
    "css",
    "docs",
    "dependencies",
)


# ---------------------------------------------------------------------------
# Layout: where things live. The fixture tests build a small tree that uses the
# same paths, so the defaults are CuePoint's own.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Layout:
    src_dir: str = "src"
    tests_dir: str = "src/tests"
    scripts_dir: str = "scripts"
    docs_dir: str = "docs"
    workflows_dir: str = ".github/workflows"
    desktop_dir: str = "apps/desktop-electron"
    #: Module packages whose files are never dead (fact 2).
    migration_dirs: tuple[str, ...] = ("src/cuepoint/migrations",)
    #: Python entry points that ship, with what each is.
    python_entries: tuple[tuple[str, str], ...] = (
        ("main.py", "CLI"),
        ("src/main.py", "CLI"),
        ("src/cuepoint/engine/__main__.py", "engine"),
    )
    #: Launchers that are run, but whose own future is an audit question. None
    #: remain: ``src/gui_app.py`` and its ``run_gui`` scripts went in PRUNE-02.
    python_launchers: tuple[tuple[str, str], ...] = ()
    sidecar_specs: tuple[str, ...] = ("build/engine-sidecar.spec",)
    pyproject: str = "pyproject.toml"
    #: What the Electron app loads first: main, the runtime preload, the page.
    ts_entries: tuple[str, ...] = (
        "apps/desktop-electron/electron/main.ts",
        "apps/desktop-electron/electron/preload.cjs",
        "apps/desktop-electron/renderer/index.html",
    )
    #: Docs that tell a developer what to run (fact 1). The archive is history.
    dev_docs: tuple[str, ...] = (
        "AGENTS.md",
        "CLAUDE.md",
        "README.md",
        "scripts/README.md",
        "docs/development/",
        ".claude/skills/",
        ".agents/skills/",
    )
    excluded_dev_docs: tuple[str, ...] = ("docs/development/archive/",)
    #: The design record, kept whatever its signals say (DEC-147).
    design_record: tuple[str, ...] = ("docs/v1/", "docs/ui-overhaul/adr/")
    #: Files that name candidates because they list them: the phase's spec, the
    #: audit, and this script and its test. A name there is not a use, and
    #: counting it would make every candidate look referenced.
    candidate_lists: tuple[str, ...] = (
        "docs/v1/PHASE12_CLEANUP.md",
        "docs/v1/PHASE12_AUDIT.md",
        "scripts/audit_dead_code.py",
        "src/tests/unit/scripts/test_audit_dead_code.py",
    )


DEFAULT_LAYOUT = Layout()

_WALK_SKIP_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
}

_TEXT_SUFFIXES = {
    ".py",
    ".md",
    ".yml",
    ".yaml",
    ".json",
    ".sh",
    ".ps1",
    ".bat",
    ".command",
    ".toml",
    ".ini",
    ".cfg",
    ".txt",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".spec",
    ".nsi",
    ".html",
    ".css",
    ".plist",
}
_TEXT_NAMES = {"Makefile", ".pre-commit-config.yaml", ".lycheeignore", ".gitignore"}
#: Lockfiles name every package and no script; reading them adds only noise.
_SKIPPED_TEXT_NAMES = {"package-lock.json"}
_MAX_TEXT_BYTES = 2_000_000


def _lines(text: str) -> int:
    """Lines as ``wc -l`` counts them, plus a last line with no newline."""
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def _is_under(rel: str, prefixes: Iterable[str]) -> bool:
    for prefix in prefixes:
        if prefix.endswith("/"):
            if rel.startswith(prefix):
                return True
        elif rel == prefix:
            return True
    return False


# ---------------------------------------------------------------------------
# The repository: tracked files only, so untracked local files are never
# reported (DEC-147, Q-150).
# ---------------------------------------------------------------------------


class Repo:
    def __init__(self, root: Path, layout: Layout = DEFAULT_LAYOUT) -> None:
        self.root = root.resolve()
        self.layout = layout
        self.files: list[str] = self._list_files()
        self.file_set: set[str] = set(self.files)
        self._text: dict[str, str] = {}
        self.tracked_by_git = self._git_toplevel() is not None

    def _git_toplevel(self) -> Optional[Path]:
        try:
            out = subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                cwd=self.root,
                capture_output=True,
                text=True,
                check=True,
            )
        except (OSError, subprocess.CalledProcessError):
            return None
        top = Path(out.stdout.strip()).resolve()
        return top if top == self.root else None

    def _list_files(self) -> list[str]:
        if self._git_toplevel() is not None:
            out = subprocess.run(
                ["git", "ls-files", "-z"],
                cwd=self.root,
                capture_output=True,
                check=True,
            )
            names = [n for n in out.stdout.decode("utf-8").split("\0") if n]
            # A file deleted in the working tree is still listed until staged.
            return sorted(n for n in names if (self.root / n).is_file())
        found: list[str] = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = sorted(d for d in dirnames if d not in _WALK_SKIP_DIRS)
            for name in filenames:
                full = Path(dirpath) / name
                found.append(full.relative_to(self.root).as_posix())
        return sorted(found)

    def is_text(self, rel: str) -> bool:
        name = posixpath.basename(rel)
        if name in _SKIPPED_TEXT_NAMES:
            return False
        return name in _TEXT_NAMES or posixpath.splitext(name)[1] in _TEXT_SUFFIXES

    def text(self, rel: str) -> str:
        cached = self._text.get(rel)
        if cached is not None:
            return cached
        path = self.root / rel
        try:
            if path.stat().st_size > _MAX_TEXT_BYTES:
                data = ""
            else:
                data = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            data = ""
        self._text[rel] = data
        return data

    def size(self, rel: str) -> int:
        try:
            return (self.root / rel).stat().st_size
        except OSError:
            return 0

    def text_files(self) -> list[str]:
        return [f for f in self.files if self.is_text(f)]

    def reference_sources(self) -> list[str]:
        """Text files whose naming of a file counts as a use of it."""
        lists = set(self.layout.candidate_lists)
        return [f for f in self.text_files() if f not in lists]

    def last_commit_dates(self, suffix: str) -> dict[str, str]:
        """The newest commit date of each tracked file ending in ``suffix``."""
        if not self.tracked_by_git:
            return {}
        try:
            out = subprocess.run(
                ["git", "log", "--format=@@%cs", "--name-only", "--", f"*{suffix}"],
                cwd=self.root,
                capture_output=True,
                check=True,
            )
        except (OSError, subprocess.CalledProcessError):
            return {}
        dates: dict[str, str] = {}
        current = ""
        for line in out.stdout.decode("utf-8", errors="replace").splitlines():
            if line.startswith("@@"):
                current = line[2:]
            elif line and line not in dates:
                dates[line] = current
        return dates


# ---------------------------------------------------------------------------
# References: which tracked file names which other file. One pass over the
# text finds every ``name.ext`` token; it is how scripts and docs are reached.
# ---------------------------------------------------------------------------


def reference_kind(rel: str, layout: Layout) -> str:
    """What kind of file a reference comes from."""
    name = posixpath.basename(rel)
    if rel.startswith(layout.workflows_dir + "/"):
        return "workflow"
    if name == "package.json":
        return "npm"
    if rel.startswith(".claude/hooks/") or rel == ".claude/settings.json":
        return "hook"
    if rel == ".pre-commit-config.yaml":
        return "pre-commit"
    if (
        rel == "Makefile"
        or rel.startswith("build/")
        or rel.startswith(f"{layout.desktop_dir}/build/")
    ):
        return "build"
    if name.endswith(".md") or rel.startswith((".claude/skills/", ".agents/skills/")):
        return "doc"
    if (
        rel.startswith(layout.tests_dir + "/")
        or "/e2e/" in f"/{rel}"
        or ".test." in name
        or ".spec." in name
    ):
        return "test"
    if rel.startswith(layout.scripts_dir + "/"):
        return "script"
    return "source"


_FILE_TOKEN = re.compile(r"[\w.@-]+\.[A-Za-z0-9]+")
_PY_IMPORT_LINE = re.compile(r"^\s*(?:from|import)\s+([A-Za-z_]\w*)", re.MULTILINE)


class References:
    """Who names each file, found once for the whole repository."""

    def __init__(self, repo: Repo) -> None:
        self.repo = repo
        self._by_name: dict[str, list[str]] = defaultdict(list)
        for rel in repo.files:
            self._by_name[posixpath.basename(rel)].append(rel)
        self._tokens: dict[str, set[str]] = {}
        self._py_imports: dict[str, set[str]] = {}

    def tokens(self, rel: str) -> set[str]:
        cached = self._tokens.get(rel)
        if cached is None:
            cached = set()
            for match in _FILE_TOKEN.finditer(self.repo.text(rel)):
                token = match.group(0).rstrip(".")
                cached.add(token)
            self._tokens[rel] = cached
        return cached

    def py_imports(self, rel: str) -> set[str]:
        cached = self._py_imports.get(rel)
        if cached is None:
            cached = set(_PY_IMPORT_LINE.findall(self.repo.text(rel)))
            self._py_imports[rel] = cached
        return cached

    def naming(self, targets: Iterable[str]) -> dict[str, set[str]]:
        """For each target file, the tracked text files naming it.

        A file names a target by its file name (``check_x.py`` in a path or a
        command) or, for a Python target, by importing its stem from a script
        or a test, which is how scripts load each other.
        """
        targets = list(targets)
        by_name: dict[str, list[str]] = defaultdict(list)
        by_stem: dict[str, list[str]] = defaultdict(list)
        for target in targets:
            name = posixpath.basename(target)
            by_name[name].append(target)
            if name.endswith(".py"):
                by_stem[name[:-3]].append(target)
        found: dict[str, set[str]] = {t: set() for t in targets}
        layout = self.repo.layout
        for rel in self.repo.reference_sources():
            for token in self.tokens(rel):
                name = token.rsplit("/", 1)[-1]
                for target in by_name.get(name, ()):
                    if target != rel:
                        found[target].add(rel)
            if rel.endswith(".py") and (
                rel.startswith(layout.scripts_dir + "/")
                or rel.startswith(layout.tests_dir + "/")
            ):
                for stem in self.py_imports(rel):
                    for target in by_stem.get(stem, ()):
                        if (
                            target != rel
                            and posixpath.dirname(target) == layout.scripts_dir
                        ):
                            found[target].add(rel)
        return found


# ---------------------------------------------------------------------------
# Python: the import graph, with fact 2's dynamic loads.
# ---------------------------------------------------------------------------

_DOTTED = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$")
#: Calls whose first argument is a dotted name the test reaches into. A dotted
#: string anywhere else (a config key like "beatport.timeout") names nothing.
_PATCHING_CALLS = {"patch", "dict", "setattr", "delattr"}
_QT_TOP = {"PySide6", "PyQt6", "PyQt5", "PySide2", "pytestqt"}
#: The last part of a dotted string that makes it a file name, not a module.
_FILE_EXTENSIONS = {s.lstrip(".") for s in _TEXT_SUFFIXES} | {
    "exe",
    "xml",
    "csv",
    "xlsx",
    "log",
    "db",
    "wav",
    "mp3",
    "flac",
    "png",
    "svg",
}


@dataclass
class PyImport:
    module: str
    names: tuple[str, ...]
    level: int
    line: int


@dataclass
class PyParse:
    imports: list[PyImport] = field(default_factory=list)
    dynamic_sites: list[str] = field(default_factory=list)
    scans_own_package: bool = False
    #: Dotted names a file patches: ``patch("a.b.c")``, ``monkeypatch.setattr("a.b.c", …)``.
    patched: set[str] = field(default_factory=set)
    error: Optional[str] = None


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        inner = _call_name(node.value)
        return f"{inner}.{node.attr}" if inner else node.attr
    return ""


def parse_python(text: str) -> PyParse:
    """Every import, dynamic load and patched name in one Python file."""
    result = PyParse()
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError) as exc:
        result.error = f"{type(exc).__name__}: {exc}"
        for match in re.finditer(
            r"^\s*from\s+(\.*)([\w.]*)\s+import\s+([\w, ]+)|^\s*import\s+([\w.]+)",
            text,
            re.MULTILINE,
        ):
            line = text.count("\n", 0, match.start()) + 1
            if match.group(4):
                result.imports.append(PyImport(match.group(4), (), 0, line))
            else:
                names = tuple(n.strip() for n in match.group(3).split(",") if n.strip())
                result.imports.append(
                    PyImport(match.group(2), names, len(match.group(1)), line)
                )
        return result

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                result.imports.append(PyImport(alias.name, (), 0, node.lineno))
        elif isinstance(node, ast.ImportFrom):
            result.imports.append(
                PyImport(
                    node.module or "",
                    tuple(a.name for a in node.names),
                    node.level or 0,
                    node.lineno,
                )
            )
        elif isinstance(node, ast.Call):
            name = _call_name(node.func)
            short = name.rsplit(".", 1)[-1]
            first = node.args[0] if node.args else None
            if short in ("import_module", "__import__"):
                if (
                    isinstance(first, ast.Constant)
                    and isinstance(first.value, str)
                    and not first.value.startswith(".")
                ):
                    result.imports.append(PyImport(first.value, (), 0, node.lineno))
                else:
                    result.dynamic_sites.append(f"{node.lineno}: {ast.unparse(node)}")
            elif (
                short in ("iter_modules", "walk_packages") and "pkgutil" in name + short
            ):
                if isinstance(first, ast.Name) and first.id == "__path__":
                    result.scans_own_package = True
                else:
                    result.dynamic_sites.append(f"{node.lineno}: {ast.unparse(node)}")
            elif short in ("spec_from_file_location", "run_path", "load_source"):
                result.dynamic_sites.append(f"{node.lineno}: {ast.unparse(node)}")
            elif (
                short in _PATCHING_CALLS
                and isinstance(first, ast.Constant)
                and isinstance(first.value, str)
                and _DOTTED.match(first.value)
            ):
                result.patched.add(first.value)
    return result


@dataclass
class ModuleFinding:
    path: str
    lines: int
    bytes: int
    #: shipped | launcher | script | migration | unreached
    status: str
    via: list[str] = field(default_factory=list)
    importers: list[str] = field(default_factory=list)
    tests: list[str] = field(default_factory=list)
    named_in: list[str] = field(default_factory=list)
    imports_qt: bool = False
    mentions_qt: bool = False


@dataclass
class PythonReport:
    modules: list[ModuleFinding]
    roots: dict[str, str]
    dynamic_sites: dict[str, list[str]]
    unresolved_internal: dict[str, list[str]]
    sidecar_missing: list[str]
    parse_errors: dict[str, str]


class PythonGraph:
    def __init__(self, repo: Repo) -> None:
        self.repo = repo
        self.layout = repo.layout
        self.py_files = [f for f in repo.files if f.endswith((".py", ".spec"))]
        self.parses: dict[str, PyParse] = {}
        self.edges: dict[str, set[str]] = {}
        self.externals: dict[str, set[str]] = {}
        self.unresolved: dict[str, list[str]] = defaultdict(list)
        for rel in self.py_files:
            if rel.endswith(".spec"):
                continue
            parse = parse_python(repo.text(rel))
            self.parses[rel] = parse
            self.edges[rel], self.externals[rel] = self._resolve_all(rel, parse)

    # -- resolution --------------------------------------------------------

    def _in_package(self, directory: str) -> bool:
        init = f"{directory}/__init__.py" if directory else "__init__.py"
        return init in self.repo.file_set

    def _search_bases(self, rel: str) -> list[str]:
        directory = posixpath.dirname(rel)
        bases = [self.layout.src_dir]
        if not self._in_package(directory):
            bases.append(directory)
        bases.append("")
        seen: list[str] = []
        for base in bases:
            if base not in seen:
                seen.append(base)
        return seen

    def module_file(self, parts: list[str], base: str) -> Optional[str]:
        if not parts:
            return None
        stem = "/".join(parts)
        prefix = f"{base}/" if base else ""
        for candidate in (f"{prefix}{stem}/__init__.py", f"{prefix}{stem}.py"):
            if candidate in self.repo.file_set:
                return candidate
        return None

    def _with_parents(self, parts: list[str], base: str, targets: set[str]) -> None:
        for i in range(1, len(parts)):
            init = self.module_file(parts[:i], base)
            if init and init.endswith("__init__.py"):
                targets.add(init)

    def resolve_name(
        self, dotted: str, importer: Optional[str] = None
    ) -> Optional[str]:
        """The file a dotted module name loads, or ``None`` if it is not ours."""
        parts = dotted.split(".")
        bases = self._search_bases(importer) if importer else [self.layout.src_dir, ""]
        for base in bases:
            found = self.module_file(parts, base)
            if found:
                return found
        return None

    def _resolve_all(self, rel: str, parse: PyParse) -> tuple[set[str], set[str]]:
        targets: set[str] = set()
        externals: set[str] = set()
        bases = self._search_bases(rel)
        for imp in parse.imports:
            if imp.level:
                directory = posixpath.dirname(rel)
                for _ in range(imp.level - 1):
                    directory = posixpath.dirname(directory)
                parts = imp.module.split(".") if imp.module else []
                if parts:
                    found = self.module_file(parts, directory)
                    if found:
                        targets.add(found)
                    self._with_parents(parts, directory, targets)
                elif self._in_package(directory):
                    targets.add(
                        f"{directory}/__init__.py" if directory else "__init__.py"
                    )
                for name in imp.names:
                    sub = self.module_file(parts + [name], directory)
                    if sub:
                        targets.add(sub)
                continue
            parts = imp.module.split(".")
            resolved = False
            for base in bases:
                found = self.module_file(parts, base)
                if found:
                    targets.add(found)
                    self._with_parents(parts, base, targets)
                    for name in imp.names:
                        sub = self.module_file(parts + [name], base)
                        if sub:
                            targets.add(sub)
                    resolved = True
                    break
            if resolved:
                continue
            top_base = next((b for b in bases if self.module_file(parts[:1], b)), None)
            if top_base is None:
                externals.add(parts[0])
            else:
                self._with_parents(parts, top_base, targets)
                self.unresolved[rel].append(f"{imp.line}: {imp.module}")
        return targets, externals

    def package_children(self, rel: str) -> list[str]:
        """Every module ``pkgutil.iter_modules(__path__)`` in ``rel`` loads."""
        directory = posixpath.dirname(rel)
        prefix = f"{directory}/"
        children = []
        for other in self.repo.files:
            if not other.startswith(prefix) or other == rel:
                continue
            rest = other[len(prefix) :]
            if rest.count("/") == 0 and rest.endswith(".py"):
                children.append(other)
            elif rest.count("/") == 1 and rest.endswith("/__init__.py"):
                children.append(other)
        return children

    def successors(self, rel: str) -> set[str]:
        nxt = set(self.edges.get(rel, ()))
        parse = self.parses.get(rel)
        if parse is not None and parse.scans_own_package:
            nxt.update(self.package_children(rel))
        return nxt

    # -- roots -------------------------------------------------------------

    def _modules_under(self, dotted_package: str) -> list[str]:
        package_file = self.resolve_name(dotted_package)
        if package_file is None:
            return []
        if not package_file.endswith("__init__.py"):
            return [package_file]
        prefix = posixpath.dirname(package_file) + "/"
        return [
            f for f in self.repo.files if f.startswith(prefix) and f.endswith(".py")
        ]

    def sidecar_roots(self) -> tuple[dict[str, str], list[str]]:
        """What each sidecar spec packages, and the names in it that match nothing."""
        roots: dict[str, str] = {}
        missing: list[str] = []
        for spec in self.layout.sidecar_specs:
            if spec not in self.repo.file_set:
                continue
            try:
                tree = ast.parse(self.repo.text(spec))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                hidden: Optional[ast.AST] = None
                if isinstance(node, ast.Assign) and any(
                    isinstance(t, ast.Name) and t.id == "hiddenimports"
                    for t in node.targets
                ):
                    hidden = node.value
                if isinstance(node, ast.Call) and _call_name(node.func) == "Analysis":
                    for kw in node.keywords:
                        if kw.arg == "excludes":
                            for const in ast.walk(kw.value):
                                if (
                                    isinstance(const, ast.Constant)
                                    and isinstance(const.value, str)
                                    and self._is_internal_name(const.value)
                                    and self.resolve_name(const.value) is None
                                ):
                                    missing.append(f"{spec}: excludes {const.value}")
                if hidden is None:
                    continue
                for sub in ast.walk(hidden):
                    if (
                        isinstance(sub, ast.Call)
                        and _call_name(sub.func) == "collect_submodules"
                    ):
                        arg = sub.args[0] if sub.args else None
                        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                            found = self._modules_under(arg.value)
                            if not found and self._is_internal_name(arg.value):
                                missing.append(
                                    f"{spec}: collect_submodules {arg.value}"
                                )
                            for rel in found:
                                roots.setdefault(
                                    rel, f"sidecar collect_submodules({arg.value})"
                                )
                    elif isinstance(sub, ast.Constant) and isinstance(sub.value, str):
                        rel = self.resolve_name(sub.value)
                        if rel:
                            roots.setdefault(rel, "sidecar hiddenimports")
                        elif self._is_internal_name(sub.value):
                            missing.append(f"{spec}: hiddenimports {sub.value}")
        return roots, missing

    def _is_internal_name(self, dotted: str) -> bool:
        top = dotted.split(".")[0]
        return self.module_file([top], self.layout.src_dir) is not None

    def pyproject_roots(self) -> dict[str, str]:
        roots: dict[str, str] = {}
        if tomllib is None or self.layout.pyproject not in self.repo.file_set:
            return roots
        try:
            data = tomllib.loads(self.repo.text(self.layout.pyproject))
        except (tomllib.TOMLDecodeError, ValueError):
            return roots
        project = data.get("project", {})
        groups: list[dict[str, Any]] = [
            project.get("scripts", {}),
            project.get("gui-scripts", {}),
        ]
        groups.extend(project.get("entry-points", {}).values())
        for group in groups:
            for name, target in group.items():
                module = str(target).split(":", 1)[0].strip()
                rel = self.resolve_name(module)
                if rel:
                    roots.setdefault(rel, f"pyproject entry point {name}")
        return roots

    # -- reach -------------------------------------------------------------

    def reach(self, roots: dict[str, str]) -> dict[str, Optional[str]]:
        """Breadth-first reach from ``roots``: each file mapped to its parent."""
        parent: dict[str, Optional[str]] = {}
        queue: deque[str] = deque()
        for root in roots:
            if root in self.parses and root not in parent:
                parent[root] = None
                queue.append(root)
        while queue:
            current = queue.popleft()
            for nxt in sorted(self.successors(current)):
                if nxt not in parent and nxt in self.parses:
                    parent[nxt] = current
                    queue.append(nxt)
        return parent

    @staticmethod
    def chain(parent: dict[str, Optional[str]], rel: str) -> list[str]:
        path = [rel]
        seen = {rel}
        while True:
            up = parent.get(path[-1])
            if up is None or up in seen:
                break
            path.append(up)
            seen.add(up)
        return list(reversed(path))

    def strings_resolving(self, rel: str) -> set[str]:
        """Modules a file patches by name: ``patch("a.b.c")``, ``monkeypatch.setattr("a.b", …)``."""
        found: set[str] = set()
        parse = self.parses.get(rel)
        if parse is None:
            return found
        for text in parse.patched:
            parts = text.split(".")
            # "beatport.py" and "__init__.py" are file names, not modules.
            if parts[-1] in _FILE_EXTENSIONS or "__init__" in parts:
                continue
            for end in range(len(parts), 0, -1):
                target = self.module_file(parts[:end], self.layout.src_dir)
                if target:
                    found.add(target)
                    break
        return found


def analyse_python(
    repo: Repo, graph: PythonGraph, live_scripts: Iterable[str]
) -> PythonReport:
    layout = repo.layout
    tests_prefix = layout.tests_dir + "/"
    src_prefix = layout.src_dir + "/"

    shipped_roots: dict[str, str] = {}
    for rel, label in layout.python_entries:
        if rel in repo.file_set:
            shipped_roots[rel] = label
    sidecar, sidecar_missing = graph.sidecar_roots()
    for rel, label in sidecar.items():
        shipped_roots.setdefault(rel, label)
    for rel, label in graph.pyproject_roots().items():
        shipped_roots.setdefault(rel, label)

    launcher_roots = {
        r: label for r, label in layout.python_launchers if r in repo.file_set
    }
    script_roots = {r: "live script" for r in live_scripts if r.endswith(".py")}

    shipped = graph.reach(shipped_roots)
    launched = graph.reach(launcher_roots)
    scripted = graph.reach(script_roots)

    tests = [f for f in graph.parses if f.startswith(tests_prefix)]
    tests_of: dict[str, set[str]] = defaultdict(set)
    for test in tests:
        for target in graph.edges.get(test, set()) | graph.strings_resolving(test):
            tests_of[target].add(test)

    importers_of: dict[str, set[str]] = defaultdict(set)
    for rel, targets in graph.edges.items():
        if rel.startswith(tests_prefix):
            continue
        for target in targets:
            importers_of[target].add(rel)

    modules = sorted(
        f
        for f in graph.parses
        if f.startswith(src_prefix) and not f.startswith(tests_prefix)
    )
    unreached_names: dict[str, list[str]] = {}
    findings: list[ModuleFinding] = []
    for rel in modules:
        parse = graph.parses[rel]
        text = repo.text(rel)
        imports_qt = any(
            (imp.module.split(".")[0] in _QT_TOP)
            for imp in parse.imports
            if not imp.level
        )
        if _is_under(rel, [d + "/" for d in layout.migration_dirs]):
            status, via = "migration", []
        elif rel in shipped:
            status, via = "shipped", graph.chain(shipped, rel)
        elif rel in launched:
            status, via = "launcher", graph.chain(launched, rel)
        elif rel in scripted:
            status, via = "script", graph.chain(scripted, rel)
        else:
            status, via = "unreached", []
        finding = ModuleFinding(
            path=rel,
            lines=_lines(text),
            bytes=repo.size(rel),
            status=status,
            via=via,
            importers=sorted(importers_of.get(rel, ())),
            tests=sorted(tests_of.get(rel, ())),
            imports_qt=imports_qt,
            mentions_qt="PySide6" in text,
        )
        findings.append(finding)
        if status == "unreached":
            unreached_names[rel] = _module_names(rel, layout)

    _attach_named_in(repo, findings, unreached_names)

    dynamic = {
        rel: parse.dynamic_sites
        for rel, parse in graph.parses.items()
        if parse.dynamic_sites and not rel.startswith(tests_prefix)
    }
    unresolved = {
        rel: lines
        for rel, lines in graph.unresolved.items()
        if not rel.startswith(tests_prefix)
    }
    roots = dict(shipped_roots)
    roots.update({r: f"launcher: {label}" for r, label in launcher_roots.items()})
    return PythonReport(
        modules=findings,
        roots=roots,
        dynamic_sites=dynamic,
        unresolved_internal=unresolved,
        sidecar_missing=sidecar_missing,
        parse_errors={r: p.error for r, p in graph.parses.items() if p.error},
    )


def _module_names(rel: str, layout: Layout) -> list[str]:
    """The ways a file can be named: dotted, and by path."""
    inner = (
        rel[len(layout.src_dir) + 1 :] if rel.startswith(layout.src_dir + "/") else rel
    )
    stem = inner[:-3]
    if stem.endswith("/__init__"):
        stem = stem[: -len("/__init__")]
    if stem in ("", "__init__"):
        return [rel]
    dotted = stem.replace("/", ".")
    if "." not in dotted:
        # A one-word name ("beatport") is everywhere; only a path or an import
        # line names the module itself.
        return [rel, f"import {dotted}", f"from {dotted} import"]
    return [dotted, inner, stem]


def _attach_named_in(
    repo: Repo, findings: list[ModuleFinding], names: dict[str, list[str]]
) -> None:
    """Every non-test, non-doc file that names an unreached module, not importing it.

    This is fact 2's catch-all: a name in a string, a config or a spec is a
    load the graph may not see.
    """
    if not names:
        return
    layout = repo.layout
    patterns = {
        rel: re.compile(
            "|".join(r"(?<![\w.])" + re.escape(n) + r"(?![\w])" for n in variants)
        )
        for rel, variants in names.items()
    }
    importers = {f.path: set(f.importers) for f in findings}
    hits: dict[str, list[str]] = defaultdict(list)
    for other in repo.reference_sources():
        if other.endswith(".md") or other.startswith(layout.tests_dir + "/"):
            continue
        text = repo.text(other)
        for rel, pattern in patterns.items():
            if other == rel or other in importers.get(rel, ()):
                continue
            # A plain substring test first: the pattern's lookarounds are slow.
            if not any(variant in text for variant in names[rel]):
                continue
            match = pattern.search(text)
            if match:
                line = text.count("\n", 0, match.start()) + 1
                hits[rel].append(f"{other}:{line}")
    for finding in findings:
        if finding.path in hits:
            finding.named_in = sorted(hits[finding.path])


# ---------------------------------------------------------------------------
# Scripts: each with every reference to it.
# ---------------------------------------------------------------------------

_MACHINE_KINDS = ("workflow", "npm", "hook", "pre-commit", "build")


@dataclass
class ScriptFinding:
    path: str
    lines: int
    bytes: int
    refs: dict[str, list[str]]
    #: run | dev-docs | run-by-script | retired-pipeline | not-run | unreferenced
    status: str
    reason: str


def analyse_scripts(
    repo: Repo, refs: References, retired: Iterable[str] = ()
) -> list[ScriptFinding]:
    """Each script's references, and whether anything that stays runs it.

    ``retired`` names the retired app's pipeline (``retired_pipeline``): a
    script only it runs is reported as ``retired-pipeline``, not as live.
    """
    layout = repo.layout
    retiring = set(retired)
    scripts = [
        f
        for f in repo.files
        if f.startswith(layout.scripts_dir + "/") and not f.endswith("README.md")
    ]
    naming = refs.naming(scripts)
    by_kind: dict[str, dict[str, list[str]]] = {}
    for script in scripts:
        kinds: dict[str, list[str]] = defaultdict(list)
        for source in sorted(naming[script]):
            kinds[reference_kind(source, layout)].append(source)
        by_kind[script] = dict(kinds)

    status: dict[str, tuple[str, str]] = {}
    retired_seeds: dict[str, str] = {}
    queue: deque[str] = deque()
    for script, kinds in by_kind.items():
        machine = [s for k in _MACHINE_KINDS for s in kinds.get(k, ())]
        live_machine = [s for s in machine if s not in retiring]
        dev = [
            s
            for s in kinds.get("doc", ())
            if _is_under(s, layout.dev_docs)
            and not _is_under(s, layout.excluded_dev_docs)
        ]
        if live_machine:
            status[script] = ("run", "run by " + ", ".join(live_machine[:4]))
            queue.append(script)
        elif dev:
            status[script] = (
                "dev-docs",
                "named by developer docs: " + ", ".join(dev[:4]),
            )
            queue.append(script)
        elif machine:
            retired_seeds[script] = "run only by the retired app's pipeline: " + (
                ", ".join(machine[:4])
            )

    def spread(label: str) -> None:
        """A script that a script with a status runs takes that status."""
        while queue:
            current = queue.popleft()
            for script, kinds in by_kind.items():
                if script not in status and current in kinds.get("script", ()):
                    status[script] = (label, f"run by {current}")
                    queue.append(script)

    # Live first, so a script both pipelines run is live.
    spread("run-by-script")
    for script, reason in retired_seeds.items():
        if script not in status:
            status[script] = ("retired-pipeline", reason)
            queue.append(script)
    spread("retired-pipeline")

    findings = []
    for script in scripts:
        kinds = by_kind[script]
        if script in status:
            label, reason = status[script]
        elif kinds:
            label = "not-run"
            reason = "referenced only by " + ", ".join(
                f"{k} ({len(v)})" for k, v in sorted(kinds.items())
            )
        else:
            label, reason = "unreferenced", "nothing names it"
        text = repo.text(script) if repo.is_text(script) else ""
        findings.append(
            ScriptFinding(
                path=script,
                lines=_lines(text),
                bytes=repo.size(script),
                refs=kinds,
                status=label,
                reason=reason,
            )
        )
    return findings


# ---------------------------------------------------------------------------
# Workflows: what each builds or checks, and whether that still exists.
# ---------------------------------------------------------------------------

_WF_PATH = re.compile(
    r"(?<![\w/.-])(?:\.\./)*((?:scripts|build|src|apps|docs|config|gh-pages-root)"
    r"[/\\][\w./\\-]+|requirements[\w-]*\.txt)"
)
_QT_INSTALL = re.compile(
    r"requirements-qt\.txt|pip install[^\n]*\b(?:PySide6|pytest-qt)\b"
)
_QT_MENTION = re.compile(r"PySide6|pytest-qt|QT_QPA_PLATFORM|-p no:pytest-qt")
_PYINSTALLER_APP = re.compile(r"build_pyinstaller\.py|pyinstaller\.spec")
_SPARKLE_FEEDS = re.compile(r"generate_appcast\.py|generate_update_feed\.py")


@dataclass
class WorkflowFinding:
    path: str
    name: str
    lines: int
    triggers: list[str]
    jobs: list[str]
    scripts: list[str]
    requirements: list[str]
    missing_paths: list[str]
    installs_qt: bool
    mentions_qt: bool
    builds_pyinstaller_app: bool
    publishes_sparkle_feeds: bool


def _yaml_keys(text: str, block: str) -> list[str]:
    """The two-space keys directly under a top-level ``block:``."""
    keys: list[str] = []
    inside = False
    for line in text.splitlines():
        if re.match(rf"^['\"]?{re.escape(block)}['\"]?\s*:", line):
            inside = True
            rest = line.split(":", 1)[1].strip()
            if rest and not rest.startswith("#"):
                keys.extend(
                    k.strip(" []'\"") for k in rest.split(",") if k.strip(" []")
                )
            continue
        if inside:
            if line and not line.startswith((" ", "#")):
                break
            match = re.match(r"^  ([\w-]+)\s*:", line)
            if match:
                keys.append(match.group(1))
    return keys


def analyse_workflows(repo: Repo) -> list[WorkflowFinding]:
    findings = []
    for rel in repo.files:
        if not rel.startswith(repo.layout.workflows_dir + "/") or not rel.endswith(
            (".yml", ".yaml")
        ):
            continue
        text = repo.text(rel)
        name_match = re.search(r"^name:\s*(.+)$", text, re.MULTILINE)
        scripts: set[str] = set()
        requirements: set[str] = set()
        missing: set[str] = set()
        for match in _WF_PATH.finditer(text):
            path = match.group(1).replace("\\", "/").rstrip(".")
            if "${{" in path or "*" in path:
                continue
            if path.startswith("requirements"):
                requirements.add(path)
                if path not in repo.file_set and not path.endswith("-hashed.txt"):
                    missing.add(path)
                continue
            if path.startswith(repo.layout.scripts_dir + "/"):
                scripts.add(path)
            exists = path in repo.file_set or (repo.root / path).exists()
            prefix = path.rstrip("/") + "/"
            if not exists and not any(f.startswith(prefix) for f in repo.files):
                # Outputs a step writes (dist/, build/sbom...) are not inputs.
                if path.startswith(("scripts/", "src/", "config/")) or path.endswith(
                    (".py", ".spec", ".nsi", ".sh", ".ps1")
                ):
                    missing.add(path)
        findings.append(
            WorkflowFinding(
                path=rel,
                name=name_match.group(1).strip().strip("'\"") if name_match else rel,
                lines=_lines(text),
                triggers=_yaml_keys(text, "on"),
                jobs=_yaml_keys(text, "jobs"),
                scripts=sorted(scripts),
                requirements=sorted(requirements),
                missing_paths=sorted(missing),
                installs_qt=bool(_QT_INSTALL.search(text)),
                mentions_qt=bool(_QT_MENTION.search(text) or _QT_INSTALL.search(text)),
                builds_pyinstaller_app=bool(_PYINSTALLER_APP.search(text)),
                publishes_sparkle_feeds=bool(_SPARKLE_FEEDS.search(text)),
            )
        )
    return findings


# ---------------------------------------------------------------------------
# TypeScript: files no import reaches, exports nothing imports, CSS no
# component uses. A small graph of our own (no new dependency); TypeScript's
# own ``noUnusedLocals`` covers what is unused inside a file.
# ---------------------------------------------------------------------------

_TS_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
_TS_RESOLVE_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json")
_NODE_BUILTINS = {
    "assert",
    "buffer",
    "child_process",
    "crypto",
    "events",
    "fs",
    "http",
    "https",
    "module",
    "net",
    "os",
    "path",
    "process",
    "readline",
    "stream",
    "timers",
    "tty",
    "url",
    "util",
    "worker_threads",
    "zlib",
}
ALL = "*"


def strip_js_comments(text: str) -> str:
    """Blank out ``//`` and ``/* */`` comments, keeping strings and offsets.

    Every removed character becomes a space (newlines stay), so a match's
    offset still gives its line.
    """
    out = list(text)
    i, n = 0, len(text)
    quote: Optional[str] = None
    while i < n:
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote or (ch == "\n" and quote != "`"):
                quote = None
            i += 1
            continue
        if ch in "'\"`":
            quote = ch
            i += 1
            continue
        if ch == "\\":
            i += 2
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                out[i] = " "
                i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            end = n if end == -1 else end + 2
            for j in range(i, end):
                if out[j] != "\n":
                    out[j] = " "
            i = end
            continue
        i += 1
    return "".join(out)


def strip_css_comments(text: str) -> str:
    return re.sub(
        r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S
    )


_IMPORT_FROM = re.compile(
    r"\bimport\s+(type\s+)?([\w$*{}\s,]+?)\s*\bfrom\s*(['\"])([^'\"]+)\3", re.S
)
_IMPORT_BARE = re.compile(r"\bimport\s*(['\"])([^'\"]+)\1")
_EXPORT_FROM = re.compile(
    r"\bexport\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['\"])([^'\"]+)\3",
    re.S,
)
_DYNAMIC_IMPORT = re.compile(r"\bimport\s*\(\s*(['\"`])([^'\"`$]+)\1\s*\)")
_REQUIRE = re.compile(r"\brequire\s*\(\s*(['\"])([^'\"]+)\1\s*\)")
_NEW_URL = re.compile(r"\bnew\s+URL\s*\(\s*(['\"])([^'\"]+)\1\s*,\s*import\.meta\.url")
_VI_MOCK = re.compile(r"\bvi\.mock\s*\(\s*(['\"])([^'\"]+)\1")
_EXPORT_DECL = re.compile(
    r"\bexport\s+(?:declare\s+)?(default\s+)?(?:async\s+)?(?:abstract\s+)?"
    r"(?:function\s*\*?|class|const|let|var|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)"
)
_EXPORT_DEFAULT = re.compile(r"\bexport\s+default\b")
_EXPORT_LIST = re.compile(r"\bexport\s+(?:type\s+)?\{([^}]*)\}(?!\s*from)")
_HTML_SCRIPT = re.compile(r"<script[^>]*\bsrc=[\"']([^\"']+)[\"']")
_HTML_STYLE = re.compile(r"<link[^>]*\bhref=[\"']([^\"']+\.css)[\"']")
_CSS_IMPORT = re.compile(r"@import\s+(?:url\(\s*)?['\"]([^'\"]+)['\"]")


def _clause_names(clause: str) -> set[str]:
    """The names an import clause takes: ``A, { b, c as d }`` -> {default, b, c}."""
    names: set[str] = set()
    clause = clause.strip()
    if "*" in clause:
        return {ALL}
    brace = re.search(r"\{([^}]*)\}", clause)
    head = clause[: brace.start()] if brace else clause
    head = head.strip().rstrip(",").strip()
    if head:
        names.add("default")
    if brace:
        for part in brace.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            part = re.sub(r"^type\s+", "", part)
            names.add(part.split(" as ")[0].strip())
    return names


def _package_name(spec: str) -> Optional[str]:
    if spec.startswith((".", "/")) or ":" in spec.split("/")[0]:
        if spec.startswith("node:"):
            return None
        return None
    parts = spec.split("/")
    name = "/".join(parts[:2]) if spec.startswith("@") else parts[0]
    if name in _NODE_BUILTINS:
        return None
    return name


@dataclass
class TsImport:
    spec: str
    names: set[str]
    line: int


@dataclass
class TsFile:
    rel: str
    imports: list[TsImport]
    exports: dict[str, int]
    stripped: str


def parse_ts(rel: str, text: str) -> TsFile:
    if rel.endswith(".html"):
        imports = [
            TsImport(m.group(1), {ALL}, text.count("\n", 0, m.start()) + 1)
            for m in list(_HTML_SCRIPT.finditer(text))
            + list(_HTML_STYLE.finditer(text))
        ]
        return TsFile(rel, imports, {}, text)
    if rel.endswith(".css"):
        stripped = strip_css_comments(text)
        imports = [
            TsImport(m.group(1), set(), stripped.count("\n", 0, m.start()) + 1)
            for m in _CSS_IMPORT.finditer(stripped)
        ]
        return TsFile(rel, imports, {}, stripped)

    stripped = strip_js_comments(text)

    def line_of(offset: int) -> int:
        return stripped.count("\n", 0, offset) + 1

    imports: list[TsImport] = []
    for m in _IMPORT_FROM.finditer(stripped):
        imports.append(
            TsImport(m.group(4), _clause_names(m.group(2)), line_of(m.start()))
        )
    for m in _IMPORT_BARE.finditer(stripped):
        imports.append(TsImport(m.group(2), set(), line_of(m.start())))
    for m in _EXPORT_FROM.finditer(stripped):
        clause = m.group(2)
        names = {ALL} if clause.startswith("*") else _clause_names(clause)
        imports.append(TsImport(m.group(4), names, line_of(m.start())))
    for pattern in (_DYNAMIC_IMPORT, _REQUIRE, _NEW_URL):
        for m in pattern.finditer(stripped):
            imports.append(TsImport(m.group(2), {ALL}, line_of(m.start())))
    for m in _VI_MOCK.finditer(stripped):
        imports.append(TsImport(m.group(2), set(), line_of(m.start())))

    exports: dict[str, int] = {}
    for m in _EXPORT_DECL.finditer(stripped):
        exports.setdefault("default" if m.group(1) else m.group(2), line_of(m.start()))
    for m in _EXPORT_DEFAULT.finditer(stripped):
        exports.setdefault("default", line_of(m.start()))
    for m in _EXPORT_LIST.finditer(stripped):
        for part in m.group(1).split(","):
            part = re.sub(r"^type\s+", "", part.strip())
            if part:
                exports.setdefault(part.split(" as ")[-1].strip(), line_of(m.start()))
    for m in _EXPORT_FROM.finditer(stripped):
        clause = m.group(2)
        if clause.startswith("{"):
            for name in _clause_names(clause):
                exports.setdefault(name, line_of(m.start()))
    return TsFile(rel, imports, exports, stripped)


@dataclass
class TsFileFinding:
    path: str
    lines: int
    #: shipped | tooling | test-only | unreached
    status: str
    importers: list[str]


@dataclass
class ExportFinding:
    path: str
    name: str
    line: int
    #: test-only | unused
    status: str
    used_in_file: bool


@dataclass
class CssFinding:
    path: str
    selector: str
    line: int
    #: test-only | unused | dynamic
    status: str


@dataclass
class TsReport:
    files: list[TsFileFinding]
    exports: list[ExportFinding]
    css: list[CssFinding]
    packages: dict[str, dict[str, list[str]]]
    unresolved: list[str]


def ts_kind(rel: str, layout: Layout) -> str:
    name = posixpath.basename(rel)
    inner = rel[len(layout.desktop_dir) + 1 :]
    if ".stories." in name:
        return "story"
    if (
        ".test." in name
        or ".spec." in name
        or ".testFixture." in name
        or inner.startswith("e2e/")
        or "/src/test/" in f"/{inner}"
    ):
        return "test"
    if name.endswith(".d.ts"):
        return "declaration"
    if (
        re.search(r"\.config\.[cm]?[jt]s$", name)
        or "/.storybook/" in f"/{inner}"
        or inner.startswith("build/")
    ):
        return "tooling"
    return "source"


class TsGraph:
    def __init__(self, repo: Repo) -> None:
        self.repo = repo
        layout = repo.layout
        prefix = layout.desktop_dir + "/"
        entries = set(layout.ts_entries)
        self.files = [
            f
            for f in repo.files
            if f.startswith(prefix)
            and (f.endswith(_TS_SUFFIXES + (".css",)) or f in entries)
        ]
        self.file_set = set(self.files)
        self.parsed = {f: parse_ts(f, repo.text(f)) for f in self.files}
        self.kind = {f: ts_kind(f, layout) for f in self.files}
        self.edges: dict[str, list[tuple[str, set[str]]]] = defaultdict(list)
        self.packages: dict[str, set[str]] = defaultdict(set)
        self.unresolved: list[str] = []
        for rel, parsed in self.parsed.items():
            for imp in parsed.imports:
                target = self.resolve(rel, imp.spec)
                if target:
                    self.edges[rel].append((target, imp.names))
                    continue
                package = _package_name(imp.spec)
                if package:
                    self.packages[package].add(rel)
                elif imp.spec.startswith((".", "/")) and not re.search(
                    r"\.(svg|png|jpe?g|gif|woff2?|ttf|ico|json)(\?|$)", imp.spec
                ):
                    self.unresolved.append(f"{rel}:{imp.line}: {imp.spec}")

    def resolve(self, importer: str, spec: str) -> Optional[str]:
        spec = spec.split("?", 1)[0]
        directory = posixpath.dirname(importer)
        if spec.startswith("."):
            base = posixpath.normpath(posixpath.join(directory, spec))
        elif spec.startswith("/") and importer.endswith(".html"):
            base = posixpath.normpath(posixpath.join(directory, spec.lstrip("/")))
        else:
            return None
        candidates = [base]
        stem, ext = posixpath.splitext(base)
        if ext in (".js", ".mjs", ".cjs", ".jsx"):
            candidates += [stem + ".ts", stem + ".tsx", stem + ".mts", stem + ".cts"]
        candidates += [base + e for e in _TS_RESOLVE_EXTS]
        candidates += [f"{base}/index{e}" for e in _TS_RESOLVE_EXTS]
        for candidate in candidates:
            if candidate in self.file_set or candidate in self.repo.file_set:
                return candidate
        return None

    def reach(self, roots: Iterable[str]) -> dict[str, Optional[str]]:
        parent: dict[str, Optional[str]] = {}
        queue: deque[str] = deque()
        for root in roots:
            if root in self.parsed and root not in parent:
                parent[root] = None
                queue.append(root)
        while queue:
            current = queue.popleft()
            for target, _names in self.edges.get(current, ()):
                if target not in parent and target in self.parsed:
                    parent[target] = current
                    queue.append(target)
        return parent

    def tooling_roots(self) -> list[str]:
        roots = [f for f, k in self.kind.items() if k == "tooling"]
        # Paths ``package.json`` names (electron-builder hooks, entry files).
        for pkg in self.repo.files:
            if posixpath.basename(pkg) != "package.json" or not pkg.startswith(
                self.repo.layout.desktop_dir + "/"
            ):
                continue
            base = posixpath.dirname(pkg)
            for value in re.findall(
                r"\"([\w./-]+\.(?:c?js|mjs|ts))\"", self.repo.text(pkg)
            ):
                candidate = posixpath.normpath(posixpath.join(base, value))
                if candidate in self.parsed:
                    roots.append(candidate)
        # Files a config names by path (vitest's setupFiles, for one).
        for config in [f for f, k in self.kind.items() if k == "tooling"]:
            base = posixpath.dirname(config)
            for value in re.findall(
                r"['\"](\.{1,2}/[\w./-]+)['\"]", self.parsed[config].stripped
            ):
                target = self.resolve(config, value)
                if target:
                    roots.append(target)
                elif "*" not in value:
                    candidate = posixpath.normpath(posixpath.join(base, value))
                    if candidate in self.parsed:
                        roots.append(candidate)
        return roots


_CSS_PRELUDE = re.compile(r"([^{}]+)\{")
_CSS_CLASS = re.compile(r"\.(-?[_a-zA-Z][\w-]*)")
_TOKEN = re.compile(r"[A-Za-z_-][\w-]*")
_DYNAMIC_PREFIX = re.compile(
    r"([A-Za-z_-][\w-]*[-_])\$\{|(['\"])([A-Za-z_-][\w-]*[-_])\2\s*\+"
)


def analyse_typescript(repo: Repo) -> TsReport:
    graph = TsGraph(repo)
    layout = repo.layout
    shipped = graph.reach(e for e in layout.ts_entries if e in graph.parsed)
    tooling = graph.reach(graph.tooling_roots())
    test_roots = [f for f, k in graph.kind.items() if k in ("test", "story")]
    tested = graph.reach(test_roots)

    importers: dict[str, set[str]] = defaultdict(set)
    for rel, edges in graph.edges.items():
        for target, _names in edges:
            importers[target].add(rel)

    files: list[TsFileFinding] = []
    for rel in graph.files:
        kind = graph.kind[rel]
        if kind in ("test", "story", "declaration") or rel in layout.ts_entries:
            continue
        if rel in shipped:
            status = "shipped"
        elif rel in tooling:
            status = "tooling"
        elif rel in tested:
            status = "test-only"
        else:
            status = "unreached"
        if status == "shipped" or (status == "tooling" and kind == "tooling"):
            continue
        files.append(
            TsFileFinding(
                path=rel,
                lines=_lines(repo.text(rel)),
                status=status,
                importers=sorted(importers.get(rel, ())),
            )
        )

    # Exports: used by name from live code, from tests only, or not at all.
    live = set(shipped) | set(tooling)
    used_live: dict[str, set[str]] = defaultdict(set)
    used_test: dict[str, set[str]] = defaultdict(set)
    for rel, edges in graph.edges.items():
        bucket = used_live if rel in live else used_test if rel in tested else None
        if bucket is None:
            continue
        for target, names in edges:
            bucket[target].update(names)
    exports: list[ExportFinding] = []
    for rel in sorted(shipped):
        if graph.kind.get(rel) != "source" or not rel.endswith(_TS_SUFFIXES):
            continue
        parsed = graph.parsed[rel]
        for name, line in sorted(parsed.exports.items(), key=lambda kv: kv[1]):
            live_names = used_live.get(rel, set())
            if ALL in live_names or name in live_names:
                continue
            test_names = used_test.get(rel, set())
            status = (
                "test-only" if (ALL in test_names or name in test_names) else "unused"
            )
            in_file = (
                name != "default"
                and len(
                    re.findall(
                        rf"(?<![\w$.]){re.escape(name)}(?![\w$])", parsed.stripped
                    )
                )
                > 1
            )
            exports.append(ExportFinding(rel, name, line, status, in_file))

    # CSS classes: a class is used when its name appears as a token in live
    # code. A class built from a string prefix is listed for a person to check.
    live_tokens: set[str] = set()
    test_tokens: set[str] = set()
    prefixes: set[str] = set()
    for rel in graph.files:
        if rel.endswith(".css"):
            continue
        text = graph.parsed[rel].stripped
        if rel in live:
            live_tokens.update(_TOKEN.findall(text))
            for m in _DYNAMIC_PREFIX.finditer(text):
                prefixes.add(m.group(1) or m.group(3))
        elif rel in tested:
            test_tokens.update(_TOKEN.findall(text))
    css: list[CssFinding] = []
    for rel in graph.files:
        if not rel.endswith(".css") or rel not in shipped:
            continue
        stripped = graph.parsed[rel].stripped
        seen: set[str] = set()
        for m in _CSS_PRELUDE.finditer(stripped):
            prelude = m.group(1).rsplit(";", 1)[-1].rsplit("}", 1)[-1]
            if prelude.strip().startswith("@"):
                continue
            offset = m.start(1) + (len(m.group(1)) - len(prelude))
            for cls in _CSS_CLASS.finditer(prelude):
                name = cls.group(1)
                if name in seen or name in live_tokens:
                    continue
                seen.add(name)
                line = stripped.count("\n", 0, offset + cls.start()) + 1
                if any(name.startswith(p) for p in prefixes):
                    status = "dynamic"
                elif name in test_tokens:
                    status = "test-only"
                else:
                    status = "unused"
                css.append(CssFinding(rel, name, line, status))

    return TsReport(
        files=files,
        exports=exports,
        css=css,
        packages={p: {"files": sorted(f)} for p, f in sorted(graph.packages.items())},
        unresolved=graph.unresolved,
    )


# ---------------------------------------------------------------------------
# Docs: each Markdown file, what names it, and what it talks about.
# ---------------------------------------------------------------------------

_MD_LINK = re.compile(r"\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
_MD_REF = re.compile(r"^\s*\[[^\]]+\]:\s*(\S+)", re.MULTILINE)
_MD_TOKEN = re.compile(r"[\w./@%-]+\.md\b")
_MD_HEADING = re.compile(r"^#\s+(.+)$", re.MULTILINE)
DOC_SIGNALS: dict[str, re.Pattern[str]] = {
    "qt": re.compile(
        r"\bPySide6\b|\bPyQt[56]?\b|\bQt\b|pytest-qt|\bqtbot\b|\bQWidget\b"
    ),
    "incrate": re.compile(r"\binCrate\b|\bincrate\b|\bINCRATE\b"),
    "old_updater": re.compile(r"\b[Ss]parkle\b|\b[Aa]ppcast\b|WinSparkle"),
    "pyinstaller_app": re.compile(r"build_pyinstaller\.py|pyinstaller\.spec"),
    "retired_ui": re.compile(
        r"\bResultsTable\b|\binKey\b|\bmain_window\b|\bMainWindow\b"
    ),
}


@dataclass
class DocFinding:
    path: str
    folder: str
    lines: int
    bytes: int
    title: str
    last_commit: str
    referenced_by: dict[str, list[str]]
    broken_links: list[str]
    signals: dict[str, int]
    design_record: bool


def analyse_docs(repo: Repo) -> list[DocFinding]:
    layout = repo.layout
    md_files = [f for f in repo.files if f.endswith(".md")]
    md_set = set(md_files)
    dates = repo.last_commit_dates(".md")
    referenced: dict[str, dict[str, set[str]]] = {f: defaultdict(set) for f in md_files}
    broken: dict[str, list[str]] = defaultdict(list)

    def resolve(source: str, target: str) -> Optional[str]:
        target = target.split("#", 1)[0].split("?", 1)[0].replace("%20", " ")
        if not target:
            return None
        candidates = []
        if target.startswith("/"):
            candidates.append(posixpath.normpath(target.lstrip("/")))
        else:
            candidates.append(
                posixpath.normpath(posixpath.join(posixpath.dirname(source), target))
            )
            candidates.append(posixpath.normpath(target))
        for candidate in candidates:
            if candidate in md_set:
                return candidate
        return None

    for source in repo.text_files():
        text = repo.text(source)
        kind = reference_kind(source, layout)
        if source.endswith(".md"):
            stripped = re.sub(r"```.*?```", "", text, flags=re.S)
            for match in list(_MD_LINK.finditer(stripped)) + list(
                _MD_REF.finditer(stripped)
            ):
                target = match.group(1)
                if re.match(r"^[a-z][\w+.-]*:", target) or target.startswith("#"):
                    continue
                path = target.split("#", 1)[0].split("?", 1)[0].replace("%20", " ")
                if not path:
                    continue
                full = posixpath.normpath(
                    posixpath.join(posixpath.dirname(source), path)
                )
                if path.startswith("/"):
                    full = posixpath.normpath(path.lstrip("/"))
                if full not in repo.file_set and not (repo.root / full).exists():
                    broken[source].append(target)
        if source in layout.candidate_lists:
            continue
        for token in set(_MD_TOKEN.findall(text)):
            target = resolve(source, token)
            if target and target != source:
                referenced[target][kind].add(source)

    findings = []
    for rel in md_files:
        text = repo.text(rel)
        heading = _MD_HEADING.search(text)
        findings.append(
            DocFinding(
                path=rel,
                folder=posixpath.dirname(rel) or ".",
                lines=_lines(text),
                bytes=repo.size(rel),
                title=heading.group(1).strip() if heading else "",
                last_commit=dates.get(rel, ""),
                referenced_by={
                    k: sorted(v) for k, v in sorted(referenced[rel].items())
                },
                broken_links=sorted(set(broken.get(rel, ()))),
                signals={
                    name: len(pattern.findall(text))
                    for name, pattern in DOC_SIGNALS.items()
                    if pattern.search(text)
                },
                design_record=_is_under(rel, layout.design_record),
            )
        )
    return findings


# ---------------------------------------------------------------------------
# Dependencies: each requirement and npm package, and the code that uses it.
# ---------------------------------------------------------------------------

#: Distributions whose import name is not their name, where the environment
#: cannot say (it is not installed). Lower-case, ``-`` for ``_``.
_KNOWN_IMPORTS = {
    "beautifulsoup4": {"bs4"},
    "pyyaml": {"yaml"},
    "python-dateutil": {"dateutil"},
    "pillow": {"PIL"},
    "pyside6": {"PySide6"},
    "pytest-qt": {"pytestqt"},
    "sentry-sdk": {"sentry_sdk"},
    "requests-cache": {"requests_cache"},
    "pyinstaller": {"PyInstaller"},
    "pip-tools": {"piptools"},
    "pre-commit": {"pre_commit"},
    "pytest-mock": {"pytest_mock"},
    "pytest-asyncio": {"pytest_asyncio"},
    "pytest-benchmark": {"pytest_benchmark"},
    "pytest-cov": {"pytest_cov"},
    "pytest-timeout": {"pytest_timeout"},
    "pytest-xdist": {"xdist"},
}

#: How a tool or plugin is used without an import: its command, flag or fixture.
_TOOL_TOKENS = {
    "pytest": [r"\bpytest\b"],
    "pytest-cov": [r"--cov\b"],
    "pytest-mock": [r"\bmocker\b"],
    "pytest-asyncio": [r"pytest\.mark\.asyncio", r"asyncio_mode"],
    "pytest-timeout": [
        r"pytest[^\n]*--timeout\b",
        r"pytest\.mark\.timeout",
        r"(?m)^timeout\s*=",
    ],
    "pytest-xdist": [r"pytest[^\n]*\s-n\s+(?:auto|\d)", r"--numprocesses"],
    "pytest-benchmark": [r"\bbenchmark\("],
    "pytest-qt": [r"\bqtbot\b"],
    "coverage": [r"\bcoverage\b"],
    "ruff": [r"\bruff\b"],
    "black": [r"\bblack\b"],
    "pylint": [r"\bpylint\b"],
    "mypy": [r"\bmypy\b"],
    "isort": [r"\bisort\b"],
    "flake8": [r"\bflake8\b"],
    "pre-commit": [r"\bpre-commit\b"],
    "radon": [r"\bradon\b"],
    "pyinstaller": [r"\bpyinstaller\b", r"\bPyInstaller\b"],
    "pip-tools": [r"\bpip-compile\b"],
    "playwright": [r"\bplaywright\b"],
}


def _normalise(dist: str) -> str:
    return re.sub(r"[-_.]+", "-", dist).lower()


@dataclass
class DependencyFinding:
    name: str
    ecosystem: str
    declared_in: list[str]
    #: Importers by kind: shipped, run, script, test, dead, tooling.
    importers: dict[str, list[str]]
    tool_uses: list[str]


def _python_requirements(repo: Repo) -> dict[str, list[str]]:
    declared: dict[str, list[str]] = defaultdict(list)
    for rel in repo.files:
        name = posixpath.basename(rel)
        if posixpath.dirname(rel) or not (
            name.startswith("requirements") and name.endswith(".txt")
        ):
            continue
        for line in repo.text(rel).splitlines():
            line = line.split("#", 1)[0].strip()
            if not line or line.startswith("-"):
                continue
            match = re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*", line)
            if match:
                declared[_normalise(match.group(0))].append(rel)
    if tomllib is not None and repo.layout.pyproject in repo.file_set:
        try:
            data = tomllib.loads(repo.text(repo.layout.pyproject))
        except (tomllib.TOMLDecodeError, ValueError):
            data = {}
        project = data.get("project", {})
        specs = list(project.get("dependencies", []))
        for group in project.get("optional-dependencies", {}).values():
            specs.extend(group)
        for spec in specs:
            match = re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*", spec)
            if match:
                declared[_normalise(match.group(0))].append(repo.layout.pyproject)
    return declared


@functools.lru_cache(maxsize=1)
def _installed_imports() -> dict[str, frozenset[str]]:
    """Import names by distribution, from what this environment has installed."""
    by_dist: dict[str, set[str]] = defaultdict(set)
    try:
        import importlib.metadata as metadata

        for top, dists in metadata.packages_distributions().items():
            for dist in dists:
                by_dist[_normalise(dist)].add(top)
    except Exception:  # noqa: BLE001 - the environment is a hint, not a source
        pass
    return {dist: frozenset(tops) for dist, tops in by_dist.items()}


def _import_names(dist: str) -> set[str]:
    names = set(_KNOWN_IMPORTS.get(dist, set()))
    names.update(_installed_imports().get(dist, frozenset()))
    names.add(dist.replace("-", "_"))
    if dist.startswith("types-"):
        names.discard(dist.replace("-", "_"))
    return names


def analyse_dependencies(
    repo: Repo, graph: PythonGraph, python: PythonReport, ts: Optional[TsReport]
) -> list[DependencyFinding]:
    layout = repo.layout
    status_of = {m.path: m.status for m in python.modules}
    findings: list[DependencyFinding] = []

    # A Python tool is run from a workflow, a hook, the build, a config, a
    # script or the developer docs. JavaScript is left out: "--timeout" in an
    # Electron build hook says nothing about pytest-timeout.
    tool_sources = [
        f
        for f in repo.reference_sources()
        if not f.endswith((".js", ".cjs", ".mjs", ".ts", ".tsx", ".json"))
        and (
            reference_kind(f, layout) in _MACHINE_KINDS
            or f
            in ("pytest.ini", "mypy.ini", "pyproject.toml", ".coveragerc", "setup.cfg")
            or f.startswith(layout.scripts_dir + "/")
            or (
                f.endswith(".md")
                and _is_under(f, layout.dev_docs)
                and not _is_under(f, layout.excluded_dev_docs)
            )
        )
    ]
    test_py = [
        f
        for f in graph.parses
        if f.startswith(layout.tests_dir + "/") and f not in layout.candidate_lists
    ]

    def bucket(rel: str) -> str:
        if rel.startswith(layout.tests_dir + "/"):
            return "test"
        if rel.startswith(layout.scripts_dir + "/"):
            return "script"
        status = status_of.get(rel)
        if status in ("shipped", "migration"):
            return "shipped"
        if status in ("launcher", "script"):
            return "run"
        if status == "unreached":
            return "dead"
        return "other"

    for dist, declared in sorted(_python_requirements(repo).items()):
        imports = _import_names(dist)
        if dist.startswith("types-"):
            imports = _import_names(dist[len("types-") :])
        importers: dict[str, list[str]] = defaultdict(list)
        for rel, externals in graph.externals.items():
            if externals & imports:
                importers[bucket(rel)].append(rel)
        tools: list[str] = []
        for pattern in _TOOL_TOKENS.get(dist, []):
            regex = re.compile(pattern)
            for rel in tool_sources + (test_py if dist.startswith("pytest-") else []):
                if regex.search(repo.text(rel)) and rel not in tools:
                    tools.append(rel)
        findings.append(
            DependencyFinding(
                name=dist,
                ecosystem="python",
                declared_in=sorted(set(declared)),
                importers={k: sorted(v) for k, v in sorted(importers.items())},
                tool_uses=sorted(tools),
            )
        )

    packages = ts.packages if ts is not None else {}
    for pkg in repo.files:
        if posixpath.basename(pkg) != "package.json" or not pkg.startswith(
            layout.desktop_dir + "/"
        ):
            continue
        try:
            data = json.loads(repo.text(pkg))
        except json.JSONDecodeError:
            continue
        base = posixpath.dirname(pkg)
        nested = [
            posixpath.dirname(other)
            for other in repo.files
            if posixpath.basename(other) == "package.json"
            and other != pkg
            and other.startswith(base + "/")
        ]
        owned = [
            f
            for f in repo.text_files()
            if f.startswith(base + "/")
            and not any(f.startswith(n + "/") for n in nested)
        ]
        scripts_text = " ".join(str(v) for v in data.get("scripts", {}).values())
        types = set()
        for tsconfig in [f for f in owned if re.search(r"tsconfig[\w.]*\.json$", f)]:
            types.update(
                re.findall(r"\"types\"\s*:\s*\[([^\]]*)\]", repo.text(tsconfig))
            )
        types_text = " ".join(types)
        for section in ("dependencies", "devDependencies"):
            for name in sorted(data.get(section, {})):
                importers: dict[str, list[str]] = defaultdict(list)
                for rel in packages.get(name, {}).get("files", []):
                    if not rel.startswith(base + "/") or any(
                        rel.startswith(n + "/") for n in nested
                    ):
                        continue
                    kind = ts_kind(rel, layout)
                    importers["test" if kind in ("test", "story") else kind].append(rel)
                tools: list[str] = []
                bins = _npm_bins(repo.root / base / "node_modules" / name) | {
                    name.rsplit("/", 1)[-1]
                }
                for binary in bins:
                    if re.search(
                        rf"(?<![\w@/-]){re.escape(binary)}(?![\w-])", scripts_text
                    ):
                        tools.append(f"{pkg} scripts: {binary}")
                quoted = re.compile(rf"['\"]{re.escape(name)}(?:/[^'\"]*)?['\"]")
                for rel in owned:
                    if rel == pkg:
                        continue
                    if quoted.search(repo.text(rel)) and not any(
                        rel in v for v in importers.values()
                    ):
                        tools.append(rel)
                if name.startswith("@types/"):
                    base_name = name[len("@types/") :]
                    if base_name in packages or base_name in _NODE_BUILTINS | {"node"}:
                        if re.search(rf"\b{re.escape(base_name)}\b", types_text) or (
                            base_name in packages
                        ):
                            tools.append(f"types for {base_name}")
                findings.append(
                    DependencyFinding(
                        name=name,
                        ecosystem=f"npm ({section})",
                        declared_in=[pkg],
                        importers={k: sorted(v) for k, v in sorted(importers.items())},
                        tool_uses=sorted(set(tools)),
                    )
                )
    return findings


def _npm_bins(package_dir: Path) -> set[str]:
    try:
        data = json.loads((package_dir / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    binary = data.get("bin")
    if isinstance(binary, str):
        return {data.get("name", "").rsplit("/", 1)[-1]}
    if isinstance(binary, dict):
        return set(binary)
    return set()


# ---------------------------------------------------------------------------
# Counts: fact 6, taken again.
# ---------------------------------------------------------------------------


def take_counts(
    repo: Repo,
    python: Optional[PythonReport],
    scripts: Optional[list[ScriptFinding]],
    workflows: Optional[list[WorkflowFinding]],
) -> dict[str, Any]:
    layout = repo.layout

    def tally(files: Iterable[str]) -> dict[str, int]:
        files = list(files)
        return {
            "files": len(files),
            "lines": sum(_lines(repo.text(f)) for f in files if repo.is_text(f)),
        }

    tests_prefix = layout.tests_dir + "/"
    counts: dict[str, Any] = {
        "python_modules": tally(
            f
            for f in repo.files
            if f.startswith(layout.src_dir + "/cuepoint/") and f.endswith(".py")
        ),
        "python_tests": tally(
            f for f in repo.files if f.startswith(tests_prefix) and f.endswith(".py")
        ),
        "typescript": tally(
            f
            for f in repo.files
            if f.startswith(layout.desktop_dir + "/") and f.endswith((".ts", ".tsx"))
        ),
        "scripts": tally(
            f for f in repo.files if f.startswith(layout.scripts_dir + "/")
        ),
        "docs_markdown": tally(
            f
            for f in repo.files
            if f.startswith(layout.docs_dir + "/") and f.endswith(".md")
        ),
        "markdown_everywhere": tally(f for f in repo.files if f.endswith(".md")),
    }
    docs_prefix = layout.docs_dir + "/"
    in_docs = [f[len(docs_prefix) :] for f in repo.files if f.startswith(docs_prefix)]
    counts["doc_folders"] = len({f.split("/")[0] for f in in_docs if "/" in f})
    counts["doc_loose_files"] = len([f for f in in_docs if "/" not in f])
    counts["qt_test_files"] = len(
        [
            f
            for f in repo.files
            if f.startswith(tests_prefix)
            and f.endswith(".py")
            and re.search(r"PySide6|pytestqt|pytest-qt|\bqtbot\b", repo.text(f))
        ]
    )
    if python is not None:
        unreached = [m for m in python.modules if m.status == "unreached"]
        counts["unreached_modules"] = len(unreached)
        counts["migrations"] = len(
            [m for m in python.modules if m.status == "migration"]
        )
        counts["qt_modules"] = len([m for m in python.modules if m.mentions_qt])
        counts["qt_importing_modules"] = len(
            [m for m in python.modules if m.imports_qt]
        )
    if scripts is not None:
        by_status: dict[str, int] = defaultdict(int)
        for s in scripts:
            by_status[s.status] += 1
        counts["scripts_by_status"] = dict(sorted(by_status.items()))
    if workflows is not None:
        counts["workflows"] = len(workflows)
        counts["workflows_qt_or_pyinstaller_app"] = len(
            [w for w in workflows if w.mentions_qt or w.builds_pyinstaller_app]
        )
    return counts


# ---------------------------------------------------------------------------
# The report.
# ---------------------------------------------------------------------------


@dataclass
class Audit:
    counts: Optional[dict[str, Any]] = None
    python: Optional[PythonReport] = None
    scripts: Optional[list[ScriptFinding]] = None
    workflows: Optional[list[WorkflowFinding]] = None
    typescript: Optional[TsReport] = None
    docs: Optional[list[DocFinding]] = None
    dependencies: Optional[list[DependencyFinding]] = None


def retired_pipeline(repo: Repo, workflows: Iterable[WorkflowFinding]) -> list[str]:
    """The retired PyInstaller app's release pipeline (DEC-147).

    Its workflows build that app or publish its Sparkle feeds, and its spec is
    ``pyinstaller.spec``. A script only these run is not run by anything that
    stays, and is reported that way rather than as live.
    """
    paths = [
        w.path
        for w in workflows
        if w.builds_pyinstaller_app or w.publishes_sparkle_feeds
    ]
    paths += [f for f in repo.files if posixpath.basename(f) == "pyinstaller.spec"]
    return paths


def run_audit(
    root: Path, sections: Iterable[str] = SECTIONS, layout: Layout = DEFAULT_LAYOUT
) -> Audit:
    wanted = set(sections)
    repo = Repo(root, layout)
    audit = Audit()
    workflows = analyse_workflows(repo)
    if "workflows" in wanted:
        audit.workflows = workflows
    need_scripts = wanted & {"scripts", "python", "dependencies", "counts"}
    scripts = (
        analyse_scripts(repo, References(repo), retired_pipeline(repo, workflows))
        if need_scripts
        else None
    )
    if "scripts" in wanted:
        audit.scripts = scripts
    graph: Optional[PythonGraph] = None
    python: Optional[PythonReport] = None
    if wanted & {"python", "dependencies", "counts"}:
        graph = PythonGraph(repo)
        live = [
            s.path
            for s in scripts or []
            if s.status in ("run", "dev-docs", "run-by-script")
        ]
        python = analyse_python(repo, graph, live)
        if "python" in wanted:
            audit.python = python
    ts: Optional[TsReport] = None
    if wanted & {"typescript", "css", "dependencies"}:
        ts = analyse_typescript(repo)
        if wanted & {"typescript", "css"}:
            audit.typescript = ts
    if "docs" in wanted:
        audit.docs = analyse_docs(repo)
    if "dependencies" in wanted and graph is not None and python is not None:
        audit.dependencies = analyse_dependencies(repo, graph, python, ts)
    if "counts" in wanted:
        audit.counts = take_counts(repo, python, scripts, workflows)
    return audit


def _cell(value: Any, limit: int = 4) -> str:
    if isinstance(value, (list, tuple, set)):
        items = sorted(value) if isinstance(value, set) else list(value)
        shown = ", ".join(f"`{v}`" for v in items[:limit])
        more = f" +{len(items) - limit}" if len(items) > limit else ""
        return (shown + more) or "—"
    text = str(value) if value not in (None, "") else "—"
    return text.replace("|", "\\|").replace("\n", " ")


def _retired_label(w: WorkflowFinding) -> str:
    parts = []
    if w.builds_pyinstaller_app:
        parts.append("builds it")
    if w.publishes_sparkle_feeds:
        parts.append("publishes its feeds")
    return ", ".join(parts)


def render_markdown(audit: Audit, sections: Iterable[str] = SECTIONS) -> str:
    wanted = set(sections)
    out: list[str] = [
        "# Dead-code audit evidence",
        "",
        "Generated by `scripts/audit_dead_code.py`. Evidence, not verdicts: "
        "`docs/v1/PHASE12_AUDIT.md` gives the verdicts.",
        "",
    ]
    if audit.counts is not None and "counts" in wanted:
        out += ["## Counts", "", "| What | Value |", "| --- | --- |"]
        for key, value in audit.counts.items():
            if isinstance(value, dict):
                value = ", ".join(f"{k} {v}" for k, v in value.items())
            out.append(f"| {key} | {value} |")
        out.append("")
    if audit.python is not None and "python" in wanted:
        py = audit.python
        unreached = [m for m in py.modules if m.status == "unreached"]
        out += [
            "## Python modules no shipped entry point reaches",
            "",
            f"{len(unreached)} unreached (migrations excluded). Roots: "
            + ", ".join(f"`{r}` ({label})" for r, label in sorted(py.roots.items())[:6])
            + (f" and {len(py.roots) - 6} more" if len(py.roots) > 6 else "")
            + ".",
            "",
            "| Module | Lines | Qt | Imported by (non-test) | Tests | Named in |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for m in unreached:
            qt = "imports" if m.imports_qt else "mentions" if m.mentions_qt else ""
            out.append(
                f"| `{m.path}` | {m.lines} | {qt} | {_cell(m.importers)} | "
                f"{_cell(m.tests)} | {_cell(m.named_in)} |"
            )
        reached_other = [m for m in py.modules if m.status in ("launcher", "script")]
        if reached_other:
            out += [
                "",
                "### Reached only by a launcher or a script",
                "",
                "| Module | Status | Via |",
                "| --- | --- | --- |",
            ]
            for m in reached_other:
                route = m.via[0] if len(m.via) < 2 else f"{m.via[0]} → … → {m.via[-2]}"
                out.append(f"| `{m.path}` | {m.status} | `{route}` |")
        if py.dynamic_sites:
            out += ["", "### Dynamic sites to check by hand", ""]
            for rel, sites in sorted(py.dynamic_sites.items()):
                for site in sites:
                    out.append(f"- `{rel}:{site}`")
        if py.unresolved_internal or py.sidecar_missing:
            out += ["", "### Names that match no module", ""]
            for rel, lines in sorted(py.unresolved_internal.items()):
                for line in lines:
                    out.append(f"- `{rel}:{line}`")
            for item in py.sidecar_missing:
                out.append(f"- `{item}`")
        out.append("")
    if audit.scripts is not None and "scripts" in wanted:
        out += [
            "## Scripts",
            "",
            "| Script | Lines | Status | Why |",
            "| --- | --- | --- | --- |",
        ]
        for s in audit.scripts:
            out.append(f"| `{s.path}` | {s.lines} | {s.status} | {_cell(s.reason)} |")
        out.append("")
    if audit.workflows is not None and "workflows" in wanted:
        out += [
            "## Workflows",
            "",
            "| Workflow | Triggers | Scripts | Qt | Retired app | Missing paths |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for w in audit.workflows:
            qt = "installs" if w.installs_qt else "mentions" if w.mentions_qt else ""
            out.append(
                f"| `{w.path}` ({w.name}) | {_cell(w.triggers)} | {len(w.scripts)} | {qt} | "
                f"{_retired_label(w)} | {_cell(w.missing_paths)} |"
            )
        out.append("")
    if audit.typescript is not None and "typescript" in wanted:
        ts = audit.typescript
        out += [
            "## Electron and renderer files not reached from the app",
            "",
            "| File | Lines | Status | Imported by |",
            "| --- | --- | --- | --- |",
        ]
        for f in ts.files:
            out.append(
                f"| `{f.path}` | {f.lines} | {f.status} | {_cell(f.importers)} |"
            )
        out += [
            "",
            "## Exports nothing live imports",
            "",
            "| File | Export | Line | Status | Used in its own file |",
            "| --- | --- | --- | --- | --- |",
        ]
        for e in ts.exports:
            out.append(
                f"| `{e.path}` | `{e.name}` | {e.line} | {e.status} | "
                f"{'yes' if e.used_in_file else 'no'} |"
            )
        if ts.unresolved:
            out += ["", "### Relative imports that resolve to nothing", ""]
            out += [f"- `{u}`" for u in ts.unresolved]
        out.append("")
    if audit.typescript is not None and "css" in wanted:
        out += [
            "## CSS classes no live code names",
            "",
            "| File | Class | Line | Status |",
            "| --- | --- | --- | --- |",
        ]
        for c in audit.typescript.css:
            out.append(f"| `{c.path}` | `.{c.selector}` | {c.line} | {c.status} |")
        out.append("")
    if audit.docs is not None and "docs" in wanted:
        out += [
            "## Docs",
            "",
            "| Doc | Lines | Last commit | Referenced by | Signals | Broken links |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for d in audit.docs:
            refs = (
                ", ".join(f"{k} {len(v)}" for k, v in d.referenced_by.items()) or "none"
            )
            signals = ", ".join(f"{k} {v}" for k, v in d.signals.items())
            out.append(
                f"| `{d.path}` | {d.lines} | {d.last_commit or '—'} | {refs} | "
                f"{signals or '—'} | {len(d.broken_links) or ''} |"
            )
        out.append("")
    if audit.dependencies is not None and "dependencies" in wanted:
        out += [
            "## Dependencies",
            "",
            "| Package | Ecosystem | Declared in | Importers | Tool uses |",
            "| --- | --- | --- | --- | --- |",
        ]
        for dep in audit.dependencies:
            importers = (
                ", ".join(f"{k} {len(v)}" for k, v in dep.importers.items()) or "none"
            )
            out.append(
                f"| `{dep.name}` | {dep.ecosystem} | {_cell(dep.declared_in)} | {importers} | "
                f"{_cell(dep.tool_uses, 3)} |"
            )
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def audit_to_json(audit: Audit) -> dict[str, Any]:
    return {key: value for key, value in asdict(audit).items() if value is not None}


#: Script statuses the guard fails on, and the same for renderer/Electron files.
GUARD_SCRIPT_STATUSES = ("unreferenced", "not-run", "retired-pipeline")
GUARD_TS_STATUSES = ("unreached", "test-only")


def guard_failures(audit: Audit) -> list[tuple[str, str, str]]:
    """``(kind, path, reason)`` for each file the guard fails on, allowlist aside.

    The kind carries the status, so ``reason`` is empty unless it says more.
    """
    found: list[tuple[str, str, str]] = []
    if audit.python:
        found += [
            ("Python module unreached", m.path, "")
            for m in audit.python.modules
            if m.status == "unreached"
        ]
    found += [
        (f"Script {s.status}", s.path, s.reason)
        for s in audit.scripts or []
        if s.status in GUARD_SCRIPT_STATUSES
    ]
    if audit.typescript:
        for f in audit.typescript.files:
            if f.status not in GUARD_TS_STATUSES:
                continue
            side = "Electron" if "/electron/" in f"/{f.path}" else "Renderer"
            reason = "only tests import it" if f.status == "test-only" else ""
            found.append((f"{side} file {f.status}", f.path, reason))
    return sorted(found, key=lambda item: item[1])


def run_guard(root: Path) -> int:
    """PRUNE-08: print one line per dead file and return 1, or print OK and 0."""
    audit = run_audit(root, ("python", "scripts", "typescript"))
    failures = guard_failures(audit)
    failing = {path for _, path, _ in failures}
    lines = [
        f"{kind}: {path}" + (f" ({reason})" if reason else "")
        for kind, path, reason in failures
        if path not in ALLOWLIST
    ]
    dead = len(lines)
    for path, reason in sorted(ALLOWLIST.items()):
        if path in failing:
            continue
        why = (
            "is no longer a failing file (reached, untracked or not guarded)"
            if (root / path).exists()
            else "no longer exists"
        )
        lines.append(
            f"Stale allowlist entry: {path} {why} ({reason}); remove it from ALLOWLIST"
        )
    if lines:
        print("\n".join(lines), file=sys.stderr)
        print(f"Dead-code guard: {len(lines)} problem(s).", file=sys.stderr)
        if dead:
            print(
                "Delete it, wire it in, or add it to ALLOWLIST in "
                "scripts/audit_dead_code.py with a reason.",
                file=sys.stderr,
            )
        return 1
    print(f"Dead-code guard: OK ({len(ALLOWLIST)} allowlisted).")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Report what nothing shipped or run reaches (Phase 12, PRUNE-01)."
    )
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    parser.add_argument(
        "--section",
        action="append",
        choices=SECTIONS,
        help="report only this section (repeatable); default: all",
    )
    parser.add_argument("--output", type=Path, help="write the Markdown report here")
    parser.add_argument("--json", type=Path, dest="json_path", help="write JSON here")
    parser.add_argument(
        "--check",
        action="store_true",
        help="the dead-code guard: exit 1 if a module, script or renderer file is unreached",
    )
    args = parser.parse_args(argv)

    sections = tuple(args.section) if args.section else SECTIONS
    if not args.root.is_dir():
        print(f"Not a directory: {args.root}", file=sys.stderr)
        return 2
    if args.check:
        if args.output or args.json_path or args.section:
            parser.error(
                "--check cannot be combined with --output, --json or --section"
            )
        return run_guard(args.root)
    audit = run_audit(args.root, sections)
    report = render_markdown(audit, sections)
    if args.json_path:
        args.json_path.write_text(
            json.dumps(audit_to_json(audit), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    if args.output:
        args.output.write_text(report, encoding="utf-8")
    elif not args.json_path:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
