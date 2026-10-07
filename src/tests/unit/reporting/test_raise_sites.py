"""The raise-site audit (REPORT-02, Part B).

Every ``raise X(...)`` under ``src/cuepoint/`` whose first argument is built from values (an
f-string with a formatted value, a ``%`` format or ``.format(...)``) is a *raise site*. The
scrubbers rely on a library value (a title, an artist, a playlist name) reaching such a message
quoted, so that the quoted-value rule can hide it. Each site is therefore classified in
``raise_sites.json``:

- ``corpus``: a value can hold a library value, a path, a URL with slugs or a token. The site
  must have an event in ``raise_site_events.json`` (or, once merged, ``scrub_corpus.json``),
  and any library value must be quoted in the message.
- ``exempt``: the values can only be numbers, ids, codes, type names or our own constants. The
  entry needs a ``reason``.

The test re-walks the tree, so a new f-string raise without a classification fails here and the
author has to decide which kind it is. Line numbers are not part of a key, so moving code is free.

Site key: ``<path relative to src/>::<enclosing qualname or <module>>::<template>`` where the
template is the message with each value replaced by ``{<expression source>}``.
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[3]
PACKAGE = SRC / "cuepoint"
FIXTURES = SRC / "tests" / "fixtures" / "reporting"
EXCLUDED_DIRS = {"reporting", "migrations", "__pycache__"}

_PERCENT_SPEC = re.compile(
    r"%(?:\([^)]*\))?[#0\- +]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[hlL]?[diouxXeEfFgGcrsa]"
)
_FORMAT_FIELD = re.compile(r"\{([^{}!:]*)(![rsa])?(:[^{}]*)?\}")


def _is_str_constant(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def _fstring_template(node: ast.JoinedStr) -> str | None:
    parts: list[str] = []
    has_value = False
    for piece in node.values:
        if isinstance(piece, ast.Constant):
            parts.append(str(piece.value))
        elif isinstance(piece, ast.FormattedValue):
            has_value = True
            conversion = {114: "!r", 115: "!s", 97: "!a"}.get(piece.conversion, "")
            parts.append("{" + ast.unparse(piece.value) + conversion + "}")
    return "".join(parts) if has_value else None


def _percent_template(node: ast.BinOp) -> str | None:
    if not (isinstance(node.op, ast.Mod) and _is_str_constant(node.left)):
        return None
    text = node.left.value  # type: ignore[attr-defined]
    right = node.right
    values = list(right.elts) if isinstance(right, ast.Tuple) else [right]
    specs = [m for m in _PERCENT_SPEC.finditer(text) if not m.group(0).endswith("%%")]
    if len(specs) == len(values) and not isinstance(right, ast.Dict):
        it = iter(values)

        def fill(match: re.Match[str]) -> str:
            conversion = {"r": "!r", "a": "!a"}.get(match.group(0)[-1], "")
            return "{" + ast.unparse(next(it)) + conversion + "}"

        return _PERCENT_SPEC.sub(fill, text)
    return f"{text} % {ast.unparse(right)}"


def _format_template(node: ast.Call) -> str | None:
    func = node.func
    if not (
        isinstance(func, ast.Attribute)
        and func.attr == "format"
        and _is_str_constant(func.value)
    ):
        return None
    text = func.value.value  # type: ignore[attr-defined]
    auto = iter(node.args)
    kwargs = {k.arg: k.value for k in node.keywords if k.arg}

    def fill(match: re.Match[str]) -> str:
        name = match.group(1).split(".")[0].split("[")[0]
        try:
            if name == "":
                value = next(auto)
            elif name.isdigit():
                value = node.args[int(name)]
            else:
                value = kwargs[name]
        except (StopIteration, IndexError, KeyError):
            return match.group(0)
        return "{" + ast.unparse(value) + (match.group(2) or "") + "}"

    return _FORMAT_FIELD.sub(fill, text)


def message_template(node: ast.expr) -> str | None:
    """The template of a message built from values, or None for a plain message."""
    if isinstance(node, ast.JoinedStr):
        return _fstring_template(node)
    if isinstance(node, ast.BinOp):
        return _percent_template(node)
    if isinstance(node, ast.Call):
        return _format_template(node)
    return None


def find_templates(node: ast.AST) -> list[str]:
    """Every value-built message inside an expression: f-strings, ``%``, ``.format``.

    It looks through ``+`` concatenations, ``.join(...)``, conditional expressions and
    nested calls, so a message passed in any argument or keyword is found.
    """
    template = message_template(node) if isinstance(node, ast.expr) else None
    if template is not None:
        return [template]
    found: list[str] = []
    for child in ast.iter_child_nodes(node):
        found.extend(find_templates(child))
    return found


LOG_LEVELS = {"info", "warning", "warn", "error", "exception", "critical", "fatal"}
LOGGER_NAMES = {
    "logger",
    "_logger",
    "log",
    "_log",
    "logging",
    "LOGGER",
    "root_logger",
    "self.logger",
    "self._logger",
    "self._log",
    "self.log",
    "self.logging_service",
    "logging_service",
}


class _Walker(ast.NodeVisitor):
    def __init__(self, relpath: str) -> None:
        self.relpath = relpath
        self.scope: list[str] = []
        self.sites: dict[str, int] = {}

    def _scoped(self, node: ast.AST, name: str) -> None:
        self.scope.append(name)
        self.generic_visit(node)
        self.scope.pop()

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._scoped(node, node.name)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._scoped(node, node.name)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._scoped(node, node.name)

    def _record(self, call: ast.Call, prefix: str, line: int) -> None:
        qualname = ".".join(self.scope) or "<module>"
        values = [*call.args, *(k.value for k in call.keywords)]
        for value in values:
            for template in find_templates(value):
                key = f"{prefix}{self.relpath}::{qualname}::{template}"
                self.sites.setdefault(key, line)

    def visit_Raise(self, node: ast.Raise) -> None:
        if isinstance(node.exc, ast.Call):
            self._record(node.exc, "", node.lineno)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and func.attr in LOG_LEVELS
            and ast.unparse(func.value) in LOGGER_NAMES
        ):
            self._record(node, "log::", node.lineno)
        self.generic_visit(node)


def collect_sites() -> dict[str, int]:
    """Every raise site in the package, as {key: first line number}."""
    sites: dict[str, int] = {}
    for path in sorted(PACKAGE.rglob("*.py")):
        rel = path.relative_to(PACKAGE.parent)
        if EXCLUDED_DIRS & set(rel.parts):
            continue
        walker = _Walker(rel.as_posix())
        walker.visit(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
        sites.update(walker.sites)
    return sites


def _load(name: str) -> object | None:
    path = FIXTURES / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _event_names() -> set[str]:
    names: set[str] = set()
    for fixture in ("raise_site_events.json", "scrub_corpus.json"):
        entries = _load(fixture)
        if isinstance(entries, list):
            names.update(
                e["name"] for e in entries if isinstance(e, dict) and "name" in e
            )
    return names


@pytest.fixture(scope="module")
def sites() -> dict[str, int]:
    return collect_sites()


@pytest.fixture(scope="module")
def classified() -> dict[str, dict[str, str]]:
    data = _load("raise_sites.json")
    assert isinstance(data, dict), "raise_sites.json is missing"
    return data


def _listing(keys: list[str]) -> str:
    return "\n  ".join(keys)


def test_every_raise_site_is_classified(sites, classified) -> None:
    missing = sorted(set(sites) - set(classified))
    assert not missing, (
        "raise sites with a value in the message that raise_sites.json does not list; "
        "classify each as corpus (and add an event) or exempt (with a reason):\n  "
        + _listing([f"{k}  (line {sites[k]})" for k in missing])
    )


def test_no_stale_entries(sites, classified) -> None:
    stale = sorted(set(classified) - set(sites))
    assert not stale, "raise_sites.json entries whose site is gone:\n  " + _listing(
        stale
    )


def test_every_entry_is_well_formed(classified) -> None:
    bad = []
    for key, entry in classified.items():
        verdict = entry.get("verdict")
        if verdict not in ("corpus", "exempt"):
            bad.append(f"{key}: verdict {verdict!r}")
        elif not entry.get("holds", "").strip():
            bad.append(f"{key}: no 'holds'")
        elif verdict == "exempt" and not entry.get("reason", "").strip():
            bad.append(f"{key}: exempt without a reason")
    assert not bad, "malformed raise_sites.json entries:\n  " + _listing(bad)


def test_every_corpus_site_has_an_event(classified) -> None:
    names = _event_names()
    missing = sorted(
        k
        for k, e in classified.items()
        if e.get("verdict") == "corpus" and k not in names
    )
    assert not missing, (
        "corpus raise sites without an event in raise_site_events.json or scrub_corpus.json:\n  "
        + _listing(missing)
    )


def test_every_event_is_a_corpus_site(classified) -> None:
    entries = _load("raise_site_events.json")
    if not isinstance(entries, list):
        pytest.skip("raise_site_events.json is missing")
    corpus = {k for k, e in classified.items() if e.get("verdict") == "corpus"}
    extra = sorted(e["name"] for e in entries if e["name"] not in corpus)
    assert not extra, "events for sites that are not corpus sites:\n  " + _listing(
        extra
    )
