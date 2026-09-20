#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Only one job writes audio files (CLEAN-10, Phase 7 cross-cutting fact 2).

"Nothing else in this phase may import a writing function from
``data/tag_writer.py`` or ``data/rekordbox.py``" is worth being a fact the suite
checks rather than a sentence in a specification, in the spirit of
``scripts/check_no_qt_in_core.py``. CLEAN-10's own module for putting values
back, ``data/tag_fields.py``, is held to the same rule.

Two halves, so that neither can drift:

- **Which functions write.** Found from the source — a function that saves tags,
  touches a RIFF chunk, writes a file, or calls a function that does — and
  compared with the names listed here. A new writing function fails this test
  until it is listed, and so falls under the second half.
- **Who imports them.** Every module under ``src/`` (tests aside), every script,
  and ``main.py`` is parsed. A writer reached by name, through its module, a
  dotted import, the ``cuepoint.data`` package's re-exports, or a module name in
  a string is an import. The importers must be exactly the ones listed: the
  existing paths through ``rekordbox.py`` and CLEAN-10's tag write service.
  inKey's Sync Tags was the third until it retired (CLEAN-14, DEC-071), and
  EXPORT-01 then deleted the writers it had been the only caller of.

``rekordbox.py`` no longer writes anything but its own probe file, and no longer
reaches ``tag_writer`` at all. The one writer in the data layer that touches a
file a user chose is now ``rekordbox_export.py``'s patch, which writes the export
and never the source (DEC-083), and never an audio file (DEC-085).
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional, Set

import pytest

_SRC = Path(__file__).resolve().parents[3]
_REPO = _SRC.parent

#: Each writing module and the functions in it that write.
WRITING_FUNCTIONS: Dict[str, FrozenSet[str]] = {
    "cuepoint.data.tag_writer": frozenset(
        {
            "write_key_comment_year_to_file",
            "_write_id3",
            "_write_wav_list_info",
            "_delete_wav_id3_chunk",
            "_write_wav",
            "_write_flac",
            "_write_id3_in_container",
            "_write_vorbis",
            "_write_mutagen_auto",
        }
    ),
    "cuepoint.data.tag_fields": frozenset(
        {"restore_tag_fields", "embed_front_cover", "remove_picture", "_save_id3"}
    ),
    # Nothing here writes any more (EXPORT-01). The entry stays so that a
    # writing function added to this module fails this test rather than going
    # unnoticed, and so `is_writable` keeps its PROBES exemption.
    "cuepoint.data.rekordbox": frozenset(),
    "cuepoint.data.rekordbox_export": frozenset(
        {"patch_collection_xml", "_write_atomically"}
    ),
}

#: Functions in those modules that write, but never to user data, so the
#: boundary does not apply to them. ``is_writable`` writes and deletes a probe
#: file in CuePoint's own output or cache folder to learn whether it can write
#: there, for the CLI's preflight check.
PROBES: Dict[str, FrozenSet[str]] = {
    "cuepoint.data.rekordbox": frozenset({"is_writable"}),
}

#: The only modules, by repository path, that may reach each module's writers.
ALLOWED_IMPORTERS: Dict[str, Set[str]] = {
    "cuepoint.data.tag_writer": {
        # EXPORT-01 removed rekordbox.py's tag-writing wrappers, so CLEAN-10's
        # service is the only route left from the runtime into tag_writer.
        "src/cuepoint/services/tag_write_service.py",
        # A developer's debugging script for the same existing path.
        "scripts/debug_sync_to_split_test.py",
    },
    "cuepoint.data.tag_fields": {"src/cuepoint/services/tag_write_service.py"},
    # EXPORT-01 removed this module's writers, so nothing reaches one.
    "cuepoint.data.rekordbox": set(),
    "cuepoint.data.rekordbox_export": {
        # The package re-exports the patch. EXPORT-05's job will be the second
        # entry here, and nothing else should be.
        "src/cuepoint/data/__init__.py",
    },
}

#: Method calls that write to a file.
_WRITE_METHODS = frozenset(
    {"save", "delete", "delete_chunk", "insert_chunk", "write_text", "write_bytes"}
)


def _module_path(module: str) -> Path:
    return _SRC.joinpath(*module.split(".")).with_suffix(".py")


def _opens_for_writing(call: ast.Call) -> bool:
    mode: Optional[ast.expr] = call.args[1] if len(call.args) > 1 else None
    for keyword in call.keywords:
        if keyword.arg == "mode":
            mode = keyword.value
    return (
        isinstance(mode, ast.Constant)
        and isinstance(mode.value, str)
        and any(flag in mode.value for flag in "wax+")
    )


def writing_functions(sources: Dict[str, str]) -> Dict[str, Set[str]]:
    """The top-level functions in each module that write, found from source.

    A function writes when it saves tags, touches a RIFF chunk, writes a file,
    opens one for writing, or calls a function — in any of these modules — that
    does.
    """
    direct: Dict[str, Set[str]] = {}
    called: Dict[str, Dict[str, Set[str]]] = {}
    for module, text in sources.items():
        direct[module] = set()
        called[module] = {}
        for node in ast.parse(text).body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            names: Set[str] = set()
            for inner in ast.walk(node):
                if not isinstance(inner, ast.Call):
                    continue
                target = inner.func
                if isinstance(target, ast.Attribute):
                    names.add(target.attr)
                    if target.attr in _WRITE_METHODS or (
                        target.attr == "write" and inner.args
                    ):
                        direct[module].add(node.name)
                elif isinstance(target, ast.Name):
                    names.add(target.id)
                    if target.id == "open" and _opens_for_writing(inner):
                        direct[module].add(node.name)
            called[module][node.name] = names
    writers = {module: set(found) for module, found in direct.items()}
    changed = True
    while changed:
        changed = False
        everywhere = set().union(*writers.values())
        for module, functions in called.items():
            for name, names in functions.items():
                if name not in writers[module] and names & everywhere:
                    writers[module].add(name)
                    changed = True
    return writers


def _dotted(node: ast.expr) -> Optional[str]:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        head = _dotted(node.value)
        return None if head is None else f"{head}.{node.attr}"
    return None


def _absolute(node: ast.ImportFrom, relative_to: Optional[str]) -> Optional[str]:
    if not node.level:
        return node.module
    if relative_to is None:
        return None
    package = relative_to.split(".")[: -node.level]
    return ".".join(package + ([node.module] if node.module else []))


def modules_reaching_writers(
    source: str,
    writers: Dict[str, FrozenSet[str]],
    module_name: Optional[str] = None,
) -> Set[str]:
    """Which writing modules' writers a piece of source reaches."""
    tree = ast.parse(source)
    reached: Set[str] = set()
    aliases: Dict[str, str] = {}
    package_exports = {
        name: module
        for module, names in writers.items()
        if module.startswith("cuepoint.data.")
        for name in names
    }
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = _absolute(node, module_name)
            for alias in node.names:
                local = alias.asname or alias.name
                if module in writers and (
                    alias.name == "*" or alias.name in writers[module]
                ):
                    reached.add(module)
                full = f"{module}.{alias.name}"
                if full in writers:
                    aliases[local] = full
                if module == "cuepoint.data" and alias.name in package_exports:
                    reached.add(package_exports[alias.name])
                if module == "cuepoint.data" and alias.name == "*":
                    reached.update(
                        name for name in writers if name.startswith("cuepoint.data.")
                    )
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in writers and alias.asname:
                    aliases[alias.asname] = alias.name
        elif isinstance(node, ast.Attribute):
            dotted = _dotted(node.value)
            module = aliases.get(dotted or "", dotted)
            if module in writers and node.attr in writers[module]:
                reached.add(module)
        elif isinstance(node, ast.Constant) and node.value in writers:
            reached.add(str(node.value))
    return reached


def _scanned_files() -> List[Path]:
    found = [
        path
        for path in (_SRC / "cuepoint").rglob("*.py")
        if "__pycache__" not in path.parts
    ]
    found += [path for path in _SRC.glob("*.py")]
    found += [path for path in (_REPO / "scripts").rglob("*.py")]
    found.append(_REPO / "main.py")
    return sorted(path for path in found if path.is_file())


def _module_name(path: Path) -> Optional[str]:
    try:
        relative = path.relative_to(_SRC)
    except ValueError:
        return None
    parts = list(relative.with_suffix("").parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def actual_importers() -> Dict[str, Set[str]]:
    found: Dict[str, Set[str]] = {module: set() for module in WRITING_FUNCTIONS}
    for path in _scanned_files():
        name = _module_name(path)
        text = path.read_text(encoding="utf-8")
        for module in modules_reaching_writers(text, WRITING_FUNCTIONS, name):
            # A writing module calling its own writers is not an import of them.
            if module != name:
                found[module].add(path.relative_to(_REPO).as_posix())
    return found


# ------------------------------------------------------------------- tests


@pytest.mark.unit
class TestTheBoundary:
    def test_the_writing_functions_are_the_ones_named(self):
        sources = {
            module: _module_path(module).read_text(encoding="utf-8")
            for module in WRITING_FUNCTIONS
        }

        found = writing_functions(sources)

        for module, writers in WRITING_FUNCTIONS.items():
            expected = set(writers) | set(PROBES.get(module, frozenset()))
            assert found[module] == expected, (
                f"{module} writes from {sorted(found[module])}. A new writing"
                " function must be listed in WRITING_FUNCTIONS, which puts it"
                " under the importer check below."
            )

    def test_the_one_probe_writes_only_its_probe_file(self):
        import inspect

        from cuepoint.data import rekordbox

        source = inspect.getsource(rekordbox.is_writable)

        assert '".cuepoint_write_test"' in source
        assert "unlink()" in source
        assert set(PROBES) == {"cuepoint.data.rekordbox"}

    def test_only_the_named_modules_reach_a_writer(self):
        found = actual_importers()

        for module, allowed in ALLOWED_IMPORTERS.items():
            unexpected = sorted(found[module] - allowed)
            assert not unexpected, (
                f"{unexpected} reach a writing function of {module}. Only CLEAN-10's"
                " tag write service writes audio files in Phase 7 (cross-cutting"
                " fact 2); write through it rather than widening this list."
            )
            # The list cannot go stale either: an allowance nobody uses is one
            # a new module could slip into unnoticed.
            assert found[module] == allowed, (
                f"{sorted(allowed - found[module])} no longer reach {module};"
                " remove them from ALLOWED_IMPORTERS"
            )

    def test_the_scan_covers_the_runtime_and_the_scripts(self):
        files = {path.relative_to(_REPO).as_posix() for path in _scanned_files()}

        assert len(files) > 300
        assert "src/cuepoint/engine/tag_write_jobs.py" in files
        assert "src/cuepoint/engine/sync_tags_api.py" not in files
        assert "scripts/debug_sync_to_split_test.py" in files
        assert "main.py" in files
        assert not any(name.startswith("src/tests/") for name in files)


@pytest.mark.unit
class TestTheScannerItself:
    """Guards the guard: a scanner that finds nothing would pass vacuously."""

    @pytest.mark.parametrize(
        "source, module",
        [
            (
                "from cuepoint.data.tag_writer import write_key_comment_year_to_file",
                "cuepoint.data.tag_writer",
            ),
            (
                "from cuepoint.data.tag_writer import *",
                "cuepoint.data.tag_writer",
            ),
            (
                "from cuepoint.data import tag_fields\n"
                "tag_fields.restore_tag_fields(p, {})",
                "cuepoint.data.tag_fields",
            ),
            (
                "import cuepoint.data.rekordbox_export as rx\n"
                "rx.patch_collection_xml(a, {}, b)",
                "cuepoint.data.rekordbox_export",
            ),
            (
                "import cuepoint.data.rekordbox_export\n"
                "cuepoint.data.rekordbox_export.patch_collection_xml(a, {}, b)",
                "cuepoint.data.rekordbox_export",
            ),
            (
                "from cuepoint.data import patch_collection_xml",
                "cuepoint.data.rekordbox_export",
            ),
            (
                "import importlib\nimportlib.import_module('cuepoint.data.tag_fields')",
                "cuepoint.data.tag_fields",
            ),
            (
                "from .tag_writer import write_key_comment_year_to_file",
                "cuepoint.data.tag_writer",
            ),
        ],
    )
    def test_every_way_of_reaching_a_writer_is_found(self, source, module):
        assert module in modules_reaching_writers(
            source, WRITING_FUNCTIONS, "cuepoint.data.somewhere"
        )

    @pytest.mark.parametrize(
        "source",
        [
            "from cuepoint.data.rekordbox import get_track_locations",
            "from cuepoint.data.tag_fields import read_tag_fields, tag_format_of",
            "from cuepoint.data import rekordbox\nrekordbox.is_readable(p)",
            "from cuepoint.data.tag_writer import _normalize_year",
            "from cuepoint.data.rekordbox_export import TrackExportValues",
            "from cuepoint.data import TrackExportValues, PatchResult",
        ],
    )
    def test_reading_is_not_writing(self, source):
        assert modules_reaching_writers(source, WRITING_FUNCTIONS) == set()

    def test_a_new_writing_function_is_found(self):
        source = (
            "def saves(path):\n    audio = load(path)\n    audio.save()\n\n"
            "def calls_one(path):\n    saves(path)\n\n"
            "def opens(path):\n    with open(path, 'r+b') as f:\n        f.seek(0)\n\n"
            "def opens_by_keyword(path):\n    open(path, mode='wb')\n\n"
            "def reads(path):\n    with open(path, 'rb') as f:\n        f.read()\n\n"
            "def serializes(picture):\n    return picture.write()\n\n"
            "def calls_elsewhere(path):\n    restore_tag_fields(path, {})\n"
        )

        found = writing_functions(
            {
                "cuepoint.data.new": source,
                "cuepoint.data.tag_fields": "def restore_tag_fields(p, v):\n    a.save()\n",
            }
        )

        assert found["cuepoint.data.new"] == {
            "saves",
            "calls_one",
            "opens",
            "opens_by_keyword",
            "calls_elsewhere",
        }

    def test_a_writing_module_path_resolves(self, tmp_path):
        for module in WRITING_FUNCTIONS:
            assert _module_path(module).is_file(), module
