#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for the dead-code audit (scripts/audit_dead_code.py, PRUNE-01).

The audit's verdicts are only as good as its classification, so each kind of
file it must tell apart is planted in a small tree and checked:

- a module the CLI reaches, and one nothing reaches;
- a module only ``importlib.import_module`` loads (fact 2: a static import
  scan misses it);
- a migration, which is never reported dead, and a package scanned with
  ``pkgutil.iter_modules(__path__)``;
- a module only its own test imports (fact 1: a test does not make code alive);
- scripts run by a workflow, by another script, named only by a doc, named by
  nothing, and run only by the retired app's pipeline;
- the Electron side: a reached file, an unreached one, a test-only one, an
  export nothing imports, and CSS classes used, unused and built from a prefix.

The tree is built in ``tmp_path`` rather than kept under ``fixtures/``: its
modules would otherwise be tracked files that the real audit reports.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "audit_dead_code.py"


def _load_script_module():
    spec = importlib.util.spec_from_file_location("audit_dead_code", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


audit = _load_script_module()

pytestmark = pytest.mark.unit


TREE: dict[str, str] = {
    # -- Python: the CLI's two entry points, as in the repository ----------
    "main.py": "import sys\nfrom main import main\n",
    "src/__init__.py": "",
    "src/main.py": (
        "from app.alive import run\nimport app.scanned\nimport requests\n"
        "def main():\n    run()\n"
    ),
    "src/app/__init__.py": "",
    "src/app/alive.py": (
        "import importlib\n"
        "from . import helper\n"
        "def run():\n"
        "    importlib.import_module('app.plugin')\n"
        "    helper.go()\n"
    ),
    "src/app/helper.py": "def go():\n    return 1\n",
    "src/app/plugin.py": "LOADED = True\n",
    "src/app/dead.py": "from PySide6.QtCore import QObject\n",
    "src/app/tested_only.py": "def value():\n    return 2\n",
    "src/app/script_only.py": "X = 1\n",
    "src/app/migrations/__init__.py": (
        "import pkgutil\n"
        "def discover():\n"
        "    return [m.name for m in pkgutil.iter_modules(__path__)]\n"
    ),
    "src/app/migrations/m001_initial.py": "VERSION = 1\n",
    "src/app/scanned/__init__.py": (
        "import importlib\nimport pkgutil\n"
        "for info in pkgutil.iter_modules(__path__):\n"
        "    importlib.import_module(f'{__name__}.{info.name}')\n"
    ),
    "src/app/scanned/child.py": "C = 3\n",
    "src/tests/__init__.py": "",
    "src/tests/test_tested_only.py": (
        "from app.tested_only import value\n"
        "def test_value():\n    assert value() == 2\n"
    ),
    "src/tests/test_patches.py": (
        "from unittest import mock\n"
        "def test_patch():\n"
        "    with mock.patch('app.dead.QObject'):\n        pass\n"
    ),
    # -- Scripts -----------------------------------------------------------
    "scripts/run_by_ci.py": (
        "import sys\nsys.path.insert(0, 'src')\n"
        "from helper_script import assist\n"
        "from app.script_only import X\n"
    ),
    "scripts/helper_script.py": "def assist():\n    return 0\n",
    "scripts/doc_only.py": "print('only a doc names me')\n",
    "scripts/orphan.py": "print('nothing names me')\n",
    "scripts/test_only_script.py": "print('a test names me')\n",
    "scripts/old_build.py": "print('the retired app')\n",
    "scripts/README.md": "# Scripts\n",
    ".github/workflows/ci.yml": (
        "name: CI\n"
        "on:\n  push:\n  pull_request:\n"
        "jobs:\n  test:\n    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - run: pip install -r requirements.txt\n"
        "      - run: python scripts/run_by_ci.py\n"
        "      - run: python scripts/gone.py\n"
    ),
    ".github/workflows/build-old.yml": (
        "name: Build old app\n"
        "on:\n  push:\n    tags: ['v*']\n"
        "jobs:\n  build:\n    runs-on: windows-latest\n"
        "    steps:\n"
        "      - run: pip install -r requirements-qt.txt\n"
        "      - run: python scripts/build_pyinstaller.py\n"
        "      - run: python scripts/old_build.py\n"
    ),
    "src/tests/test_scripts.py": "SCRIPT = 'scripts/test_only_script.py'\n",
    "docs/guide.md": (
        "# Guide\n\nRun `scripts/doc_only.py`. See [the old page](old.md) "
        "and [a missing page](missing.md).\n"
    ),
    "docs/old.md": "# Old\n\nThe PySide6 window and the Sparkle appcast.\n",
    "docs/orphan.md": "# Orphan\n\nNothing links here.\n",
    "requirements.txt": "requests==2.0\naiohttp==3.0  # unused\n",
    "requirements-qt.txt": "PySide6==6.0\n",
    # -- Electron and the renderer ----------------------------------------
    "apps/desktop-electron/package.json": json.dumps(
        {
            "name": "desktop",
            "scripts": {
                "build": "esbuild electron/main.ts",
                "dist": "electron-builder",
            },
            "devDependencies": {
                "esbuild": "1",
                "electron-builder": "1",
                "left-pad": "1",
            },
        }
    ),
    "apps/desktop-electron/electron/main.ts": (
        "import { app } from 'electron';\n"
        "import { used } from './used';\n"
        "// import { unused } from './unused';\n"
        "used(app);\n"
    ),
    "apps/desktop-electron/electron/used.ts": (
        "export function used(x: unknown) { return helper(x); }\n"
        "export function helper(x: unknown) { return x; }\n"
        "export const NEVER_IMPORTED = 1;\n"
    ),
    "apps/desktop-electron/electron/unused.ts": "export const unused = 1;\n",
    "apps/desktop-electron/electron/preload.cjs": "const { contextBridge } = require('electron');\n",
    "apps/desktop-electron/electron/used.test.ts": (
        "import { helper } from './used';\nhelper(1);\n"
    ),
    "apps/desktop-electron/renderer/package.json": json.dumps(
        {"name": "renderer", "dependencies": {"react": "1"}}
    ),
    "apps/desktop-electron/renderer/index.html": (
        '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n'
    ),
    "apps/desktop-electron/renderer/src/main.tsx": (
        "import React from 'react';\n"
        "import './App.css';\n"
        "import { App } from './App';\n"
        "const Lazy = React.lazy(() => import('./Lazy'));\n"
        "export default [App, Lazy];\n"
    ),
    "apps/desktop-electron/renderer/src/App.tsx": (
        "export function App({ tone }: { tone: string }) {\n"
        "  return <div className={`card cp-tone-${tone}`} />;\n"
        "}\n"
    ),
    "apps/desktop-electron/renderer/src/App.css": (
        "/* .commented { } is not a rule */\n"
        ".card { color: red; }\n"
        ".cp-tone-red { color: red; }\n"
        ".orphan-rule, .card:hover { color: blue; }\n"
        "@media (min-resolution: 1.5dppx) { .card { color: green; } }\n"
        ".tested-class { color: pink; }\n"
    ),
    "apps/desktop-electron/renderer/src/Lazy.tsx": "export default function Lazy() { return null; }\n",
    "apps/desktop-electron/renderer/src/onlyTested.ts": "export const ONLY = 1;\n",
    "apps/desktop-electron/renderer/src/onlyTested.test.ts": (
        "import { ONLY } from './onlyTested';\n"
        "document.querySelector('.tested-class');\n"
        "expect(ONLY).toBe(1);\n"
    ),
}


@pytest.fixture()
def tree(tmp_path: Path) -> Path:
    for rel, text in TREE.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp_path


@pytest.fixture()
def result(tree: Path):
    return audit.run_audit(tree)


def _modules(result) -> dict[str, object]:
    return {m.path: m for m in result.python.modules}


def _scripts(result) -> dict[str, object]:
    return {s.path: s for s in result.scripts}


class TestPythonReach:
    def test_a_module_the_cli_imports_is_shipped(self, result):
        modules = _modules(result)
        assert modules["src/app/alive.py"].status == "shipped"
        assert modules["src/app/helper.py"].status == "shipped"
        assert modules["src/main.py"].status == "shipped"

    def test_the_route_to_a_shipped_module_starts_at_an_entry_point(self, result):
        via = _modules(result)["src/app/alive.py"].via
        assert via[0] in ("main.py", "src/main.py")
        assert via[-1] == "src/app/alive.py"

    def test_an_unreached_module_is_reported(self, result):
        dead = _modules(result)["src/app/dead.py"]
        assert dead.status == "unreached"
        assert dead.imports_qt is True

    def test_a_module_loaded_only_by_importlib_is_reached(self, result):
        assert _modules(result)["src/app/plugin.py"].status == "shipped"

    def test_a_package_scanned_with_pkgutil_reaches_its_children(self, result):
        assert _modules(result)["src/app/scanned/child.py"].status == "shipped"

    def test_a_migration_is_never_reported_dead(self, tree):
        layout = audit.Layout(migration_dirs=("src/app/migrations",))
        result = audit.run_audit(tree, layout=layout)
        modules = _modules(result)
        assert modules["src/app/migrations/m001_initial.py"].status == "migration"
        assert modules["src/app/migrations/__init__.py"].status == "migration"
        unreached = [m.path for m in result.python.modules if m.status == "unreached"]
        assert not [p for p in unreached if "/migrations/" in p]

    def test_a_module_imported_only_by_its_test_is_unreached_with_the_test_named(
        self, result
    ):
        tested = _modules(result)["src/app/tested_only.py"]
        assert tested.status == "unreached"
        assert tested.tests == ["src/tests/test_tested_only.py"]

    def test_a_test_naming_a_module_in_a_patch_string_is_listed(self, result):
        assert "src/tests/test_patches.py" in _modules(result)["src/app/dead.py"].tests

    def test_a_file_name_in_a_test_is_not_a_module_name(self, tree):
        (tree / "src/tests/test_names.py").write_text(
            "FILES = ['__init__.py', 'tested_only.py', 'app.dead.json']\n"
        )
        modules = _modules(audit.run_audit(tree))
        assert "src/tests/test_names.py" not in modules["src/__init__.py"].tests
        assert modules["src/app/tested_only.py"].tests == [
            "src/tests/test_tested_only.py"
        ]
        assert "src/tests/test_names.py" not in modules["src/app/dead.py"].tests

    def test_only_a_patched_name_counts_not_a_dotted_config_key(self, tree):
        # "app.dead" as a config key reached src/app/dead.py once; the audit
        # listed config tests as tests of a shim that way (PRUNE-03).
        (tree / "src/tests/test_keys.py").write_text(
            "def test_keys(monkeypatch):\n"
            "    config = {'app.dead': 1, 'app.tested_only.value': 2}\n"
            "    monkeypatch.setattr('app.helper.go', lambda: 0)\n"
        )
        modules = _modules(audit.run_audit(tree))
        assert "src/tests/test_keys.py" not in modules["src/app/dead.py"].tests
        assert "src/tests/test_keys.py" not in modules["src/app/tested_only.py"].tests
        assert "src/tests/test_keys.py" in modules["src/app/helper.py"].tests

    def test_a_module_only_a_live_script_imports_is_reached_by_script(self, result):
        assert _modules(result)["src/app/script_only.py"].status == "script"

    def test_a_module_only_a_launcher_reaches_is_reached_by_launcher(self, tree):
        (tree / "src/app/launch.py").write_text("import app.tested_only\n")
        layout = audit.Layout(python_launchers=(("src/app/launch.py", "a launcher"),))
        modules = _modules(audit.run_audit(tree, layout=layout))
        assert modules["src/app/launch.py"].status == "launcher"
        assert modules["src/app/tested_only.py"].status == "launcher"
        assert modules["src/app/tested_only.py"].via == [
            "src/app/launch.py",
            "src/app/tested_only.py",
        ]

    def test_tests_are_not_modules(self, result):
        assert not [p for p in _modules(result) if p.startswith("src/tests/")]

    def test_the_computed_import_is_listed_for_a_person(self, result):
        sites = result.python.dynamic_sites
        assert any("import_module" in s for s in sites["src/app/scanned/__init__.py"])

    def test_a_module_named_in_a_config_is_listed(self, tree):
        (tree / "mypy.ini").write_text("[mypy-app.dead]\nignore_errors = True\n")
        result = audit.run_audit(tree)
        assert _modules(result)["src/app/dead.py"].named_in == ["mypy.ini:1"]


class TestSidecarSpec:
    SPEC = (
        "hiddenimports = (\n"
        "    collect_submodules('app.scanned')\n"
        "    + ['app.dead', 'app.gone', 'PIL.PngImagePlugin']\n"
        ")\n"
        "a = Analysis(['x.py'], hiddenimports=hiddenimports, "
        "excludes=['PySide6', 'app.old_ui'])\n"
    )

    def test_hidden_imports_reach_and_stale_names_are_listed(self, tree):
        (tree / "build").mkdir()
        (tree / "build" / "engine-sidecar.spec").write_text(self.SPEC)
        result = audit.run_audit(tree)
        modules = _modules(result)
        assert modules["src/app/dead.py"].status == "shipped"
        assert "build/engine-sidecar.spec: hiddenimports app.gone" in (
            result.python.sidecar_missing
        )
        assert "build/engine-sidecar.spec: excludes app.old_ui" in (
            result.python.sidecar_missing
        )
        # Third-party names are not ours to resolve.
        assert not [m for m in result.python.sidecar_missing if "PIL" in m]


class TestPyprojectEntryPoints:
    def test_a_console_script_is_a_root(self, tree):
        (tree / "pyproject.toml").write_text(
            '[project]\nname = "x"\n[project.scripts]\nx = "app.tested_only:value"\n'
        )
        result = audit.run_audit(tree)
        assert _modules(result)["src/app/tested_only.py"].status == "shipped"


class TestScripts:
    def test_a_script_a_workflow_runs_is_run(self, result):
        script = _scripts(result)["scripts/run_by_ci.py"]
        assert script.status == "run"
        assert script.refs["workflow"] == [".github/workflows/ci.yml"]

    def test_a_script_a_live_script_imports_is_run_by_that_script(self, result):
        script = _scripts(result)["scripts/helper_script.py"]
        assert script.status == "run-by-script"
        assert script.reason == "run by scripts/run_by_ci.py"

    def test_a_script_referenced_only_by_a_doc_is_not_run(self, result):
        script = _scripts(result)["scripts/doc_only.py"]
        assert script.status == "not-run"
        assert script.refs == {"doc": ["docs/guide.md"]}

    def test_a_script_nothing_names_is_unreferenced(self, result):
        script = _scripts(result)["scripts/orphan.py"]
        assert script.status == "unreferenced"
        assert script.refs == {}

    def test_a_script_named_only_by_a_test_is_not_run(self, result):
        script = _scripts(result)["scripts/test_only_script.py"]
        assert script.status == "not-run"
        assert set(script.refs) == {"test"}

    def test_a_script_only_the_retired_pipeline_runs_is_marked_so(self, result):
        assert _scripts(result)["scripts/old_build.py"].status == "retired-pipeline"

    def test_a_developer_doc_keeps_a_script_alive(self, tree):
        (tree / "AGENTS.md").write_text("Run `python scripts/orphan.py`.\n")
        result = audit.run_audit(tree)
        assert _scripts(result)["scripts/orphan.py"].status == "dev-docs"

    def test_the_archive_is_not_a_developer_doc(self, tree):
        archive = tree / "docs" / "development" / "archive"
        archive.mkdir(parents=True)
        (archive / "old.md").write_text("Run `scripts/orphan.py`.\n")
        result = audit.run_audit(tree)
        assert _scripts(result)["scripts/orphan.py"].status == "not-run"

    def test_the_audit_naming_a_candidate_does_not_make_it_referenced(self, tree):
        audit_doc = tree / "docs" / "v1" / "PHASE12_AUDIT.md"
        audit_doc.parent.mkdir(parents=True)
        audit_doc.write_text(
            "| `scripts/orphan.py` | delete |\nSee [old](../old.md).\n"
        )
        result = audit.run_audit(tree)
        assert _scripts(result)["scripts/orphan.py"].status == "unreferenced"
        docs = {d.path: d for d in result.docs}
        assert "docs/v1/PHASE12_AUDIT.md" not in str(docs["docs/old.md"].referenced_by)

    def test_the_readme_is_not_a_script(self, result):
        assert "scripts/README.md" not in _scripts(result)


class TestWorkflows:
    def test_each_workflow_says_what_it_runs_and_what_is_missing(self, result):
        workflows = {w.path: w for w in result.workflows}
        ci = workflows[".github/workflows/ci.yml"]
        assert ci.name == "CI"
        assert ci.triggers == ["push", "pull_request"]
        assert ci.jobs == ["test"]
        assert ci.scripts == ["scripts/gone.py", "scripts/run_by_ci.py"]
        assert ci.missing_paths == ["scripts/gone.py"]
        assert ci.requirements == ["requirements.txt"]
        assert not ci.installs_qt and not ci.builds_pyinstaller_app

    def test_the_retired_app_workflow_is_recognised(self, result):
        old = {w.path: w for w in result.workflows}[".github/workflows/build-old.yml"]
        assert old.installs_qt and old.mentions_qt and old.builds_pyinstaller_app
        assert "scripts/build_pyinstaller.py" in old.missing_paths


class TestTypeScript:
    def _files(self, result) -> dict[str, str]:
        return {f.path: f.status for f in result.typescript.files}

    def test_a_reached_file_is_not_reported(self, result):
        files = self._files(result)
        for reached in (
            "electron/used.ts",
            "renderer/src/App.tsx",
            "renderer/src/Lazy.tsx",
        ):
            assert f"apps/desktop-electron/{reached}" not in files

    def test_a_file_named_only_in_a_comment_is_unreached(self, result):
        assert (
            self._files(result)["apps/desktop-electron/electron/unused.ts"]
            == "unreached"
        )

    def test_a_file_only_a_test_imports_is_test_only(self, result):
        files = self._files(result)
        assert files["apps/desktop-electron/renderer/src/onlyTested.ts"] == "test-only"

    def test_exports_are_classified(self, result):
        exports = {
            (e.path.rsplit("/", 1)[-1], e.name): e for e in result.typescript.exports
        }
        assert ("used.ts", "used") not in exports
        assert exports[("used.ts", "helper")].status == "test-only"
        assert exports[("used.ts", "helper")].used_in_file is True
        assert exports[("used.ts", "NEVER_IMPORTED")].status == "unused"
        assert exports[("used.ts", "NEVER_IMPORTED")].used_in_file is False
        # A dynamic import takes everything; a default export through it is used.
        assert ("Lazy.tsx", "default") not in exports

    def test_css_classes_are_classified(self, result):
        css = {c.selector: c.status for c in result.typescript.css}
        assert "card" not in css
        assert css["orphan-rule"] == "unused"
        assert css["cp-tone-red"] == "dynamic"
        assert css["tested-class"] == "test-only"
        assert "commented" not in css
        assert not [name for name in css if name[0].isdigit()]

    def test_bare_imports_are_recorded_as_packages(self, result):
        packages = result.typescript.packages
        assert (
            "apps/desktop-electron/renderer/src/main.tsx" in packages["react"]["files"]
        )
        assert "electron" in packages


class TestDocs:
    def test_links_signals_and_broken_links(self, result):
        docs = {d.path: d for d in result.docs}
        assert docs["docs/old.md"].referenced_by == {"doc": ["docs/guide.md"]}
        assert docs["docs/orphan.md"].referenced_by == {}
        assert docs["docs/guide.md"].broken_links == ["missing.md"]
        assert docs["docs/old.md"].signals == {"qt": 1, "old_updater": 2}
        assert docs["docs/old.md"].title == "Old"


class TestDependencies:
    def test_python_and_npm_packages_have_their_users(self, result):
        deps = {(d.ecosystem.split(" ")[0], d.name): d for d in result.dependencies}
        assert deps[("python", "requests")].importers == {"shipped": ["src/main.py"]}
        assert deps[("python", "aiohttp")].importers == {}
        assert deps[("python", "pyside6")].importers == {"dead": ["src/app/dead.py"]}
        assert deps[("npm", "react")].importers["source"] == [
            "apps/desktop-electron/renderer/src/main.tsx"
        ]
        assert deps[("npm", "left-pad")].importers == {}
        assert deps[("npm", "left-pad")].tool_uses == []
        assert any("esbuild" in use for use in deps[("npm", "esbuild")].tool_uses)


MORE: dict[str, str] = {
    # Python: relative imports, a missing internal name, a file that does not
    # parse, and a computed import the scan cannot follow.
    "src/app/pkg/__init__.py": "from .inner import X\n",
    "src/app/pkg/inner.py": "from .. import helper\nfrom ..pkg import sibling\nX = 1\n",
    "src/app/pkg/sibling.py": "S = 1\n",
    "src/app/broken.py": "def oops(:\n    from app import helper\n",
    "src/app/computed.py": (
        "import importlib\n"
        "def load(name):\n    return importlib.import_module(name)\n"
        "import app.missing_module\n"
    ),
    # TypeScript: barrels, a .js specifier for a .ts file, a story, a
    # declaration, a config naming a setup file, a path that resolves to
    # nothing, and node builtins.
    "apps/desktop-electron/renderer/src/barrel/index.ts": (
        "export { Thing as Renamed } from './thing';\n"
        "export * from './everything';\n"
        "export type { Shape } from './thing';\n"
    ),
    "apps/desktop-electron/renderer/src/barrel/thing.ts": (
        "export const Thing = 1;\nexport type Shape = { a: 1 };\n"
        "const local = 2;\nexport { local as exported };\n"
    ),
    "apps/desktop-electron/renderer/src/barrel/everything.ts": "export const Every = 1;\n",
    "apps/desktop-electron/renderer/src/usesBarrel.ts": (
        "import { Renamed } from './barrel';\n"
        "import { thing } from './jsSpecifier.js';\n"
        "import * as path from 'node:path';\n"
        "import fs from 'fs';\n"
        "import missing from './doesNotExist';\n"
        "import logo from './logo.svg';\n"
        "export const all = [Renamed, thing, path, fs, missing, logo];\n"
    ),
    "apps/desktop-electron/renderer/src/jsSpecifier.ts": "export const thing = 1;\n",
    "apps/desktop-electron/renderer/src/Story.stories.tsx": (
        "import { storyOnly } from './storyOnly';\nexport default { storyOnly };\n"
    ),
    "apps/desktop-electron/renderer/src/storyOnly.ts": "export const storyOnly = 1;\n",
    "apps/desktop-electron/renderer/src/env.d.ts": "declare const VERSION: string;\n",
    "apps/desktop-electron/renderer/src/test/setup.ts": "export const SETUP = 1;\n",
    "apps/desktop-electron/renderer/vite.config.ts": (
        "import react from '@vitejs/plugin-react';\n"
        "export default { plugins: [react()], test: { environment: 'jsdom',"
        " setupFiles: ['./src/test/setup.ts'] } };\n"
    ),
    "apps/desktop-electron/renderer/tsconfig.app.json": '{"compilerOptions": {"types": ["node"]}}',
    # A Sparkle feed workflow is part of the retired pipeline too.
    ".github/workflows/release-old.yml": (
        "name: Release old\non: push\njobs:\n  feeds:\n    runs-on: ubuntu-latest\n"
        "    steps:\n      - run: python scripts/generate_appcast.py\n"
    ),
    "scripts/generate_appcast.py": "print('feeds')\n",
    # pyproject's optional dependencies count as declarations.
    "pyproject.toml": (
        '[project]\nname = "x"\ndependencies = ["requests>=2"]\n'
        '[project.optional-dependencies]\ndev = ["hypothesis"]\n'
    ),
}


@pytest.fixture()
def more(tree: Path) -> Path:
    for rel, text in MORE.items():
        path = tree / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    # The renderer's own packages, as npm would leave them.
    renderer = tree / "apps/desktop-electron/renderer"
    renderer_pkg = json.loads((renderer / "package.json").read_text())
    renderer_pkg["devDependencies"] = {
        "@types/node": "1",
        "@vitejs/plugin-react": "1",
        "jsdom": "1",
        "vite-tool": "1",
    }
    renderer_pkg["scripts"] = {"build": "vt build"}
    (renderer / "package.json").write_text(json.dumps(renderer_pkg))
    bin_dir = renderer / "node_modules" / "vite-tool"
    bin_dir.mkdir(parents=True)
    (bin_dir / "package.json").write_text(
        json.dumps({"name": "vite-tool", "bin": {"vt": "x"}})
    )
    return tree


class TestMoreShapes:
    def test_relative_imports_resolve(self, more):
        modules = _modules(audit.run_audit(more))
        # Nothing imports app.pkg, so the chain stays unreached, but its
        # relative imports were followed: the parent package is an importer.
        assert "src/app/pkg/inner.py" in modules["src/app/helper.py"].importers
        assert "src/app/pkg/inner.py" in modules["src/app/pkg/sibling.py"].importers
        assert "src/app/pkg/__init__.py" in modules["src/app/pkg/inner.py"].importers

    def test_a_file_that_does_not_parse_is_still_scanned(self, more):
        result = audit.run_audit(more)
        assert "src/app/broken.py" in result.python.parse_errors
        assert "src/app/broken.py" in _modules(result)["src/app/helper.py"].importers

    def test_a_computed_import_and_a_missing_module_are_listed(self, more):
        result = audit.run_audit(more)
        assert any(
            "import_module(name)" in site
            for site in result.python.dynamic_sites["src/app/computed.py"]
        )
        assert result.python.unresolved_internal["src/app/computed.py"] == [
            "4: app.missing_module"
        ]
        report = audit.render_markdown(result)
        assert "### Names that match no module" in report
        assert "### Dynamic sites to check by hand" in report

    def test_barrels_and_specifiers_resolve(self, more):
        ts = audit.run_audit(more).typescript
        files = {f.path.rsplit("/", 1)[-1]: f.status for f in ts.files}
        # usesBarrel.ts is reached by nothing, and takes its imports with it.
        assert files["usesBarrel.ts"] == "unreached"
        assert files["jsSpecifier.ts"] == "unreached"
        assert files["thing.ts"] == "unreached"
        assert files["storyOnly.ts"] == "test-only"
        assert "env.d.ts" not in files
        assert "setup.ts" not in files
        assert "vite.config.ts" not in files
        assert ts.unresolved == [
            "apps/desktop-electron/renderer/src/usesBarrel.ts:5: ./doesNotExist"
        ]
        assert "fs" not in ts.packages and "node:path" not in ts.packages

    def test_exports_through_a_barrel_count_as_used(self, more):
        tree = more
        main = tree / "apps/desktop-electron/renderer/src/main.tsx"
        main.write_text(
            main.read_text() + "import { all } from './usesBarrel';\nall;\n"
        )
        ts = audit.run_audit(tree).typescript
        exports = {(e.path.rsplit("/", 1)[-1], e.name): e.status for e in ts.exports}
        assert ("thing.ts", "Thing") not in exports
        assert ("thing.ts", "Shape") not in exports
        assert ("everything.ts", "Every") not in exports
        assert exports[("thing.ts", "exported")] == "unused"
        # The barrel's own names: one imported, one re-exported for nobody.
        assert ("index.ts", "Renamed") not in exports
        assert exports[("index.ts", "Shape")] == "unused"
        report = audit.render_markdown(audit.run_audit(tree))
        assert "### Relative imports that resolve to nothing" in report

    def test_npm_tools_types_and_configs_count_as_uses(self, more):
        deps = {
            d.name: d
            for d in audit.run_audit(more).dependencies
            if d.ecosystem.startswith("npm")
        }
        assert deps["@vitejs/plugin-react"].importers == {
            "tooling": ["apps/desktop-electron/renderer/vite.config.ts"]
        }
        assert deps["jsdom"].tool_uses == [
            "apps/desktop-electron/renderer/vite.config.ts"
        ]
        assert any("vt" in use for use in deps["vite-tool"].tool_uses)
        assert deps["@types/node"].tool_uses == ["types for node"]

    def test_the_feed_workflow_is_retired_pipeline(self, more):
        result = audit.run_audit(more)
        feeds = {w.path: w for w in result.workflows}[
            ".github/workflows/release-old.yml"
        ]
        assert feeds.publishes_sparkle_feeds
        assert (
            _scripts(result)["scripts/generate_appcast.py"].status == "retired-pipeline"
        )
        assert "publishes its feeds" in audit.render_markdown(result)

    def test_pyproject_dependencies_are_declarations(self, more):
        deps = {
            d.name: d
            for d in audit.run_audit(more).dependencies
            if d.ecosystem == "python"
        }
        assert deps["requests"].declared_in == ["pyproject.toml", "requirements.txt"]
        assert deps["hypothesis"].declared_in == ["pyproject.toml"]


class TestGitCheckout:
    """In a git checkout only tracked files count (DEC-147, Q-150)."""

    def _git(self, root: Path, *args: str) -> None:
        subprocess.run(
            ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
            cwd=root,
            check=True,
            capture_output=True,
        )

    def test_untracked_files_are_never_reported(self, tree):
        self._git(tree, "init", "-q")
        self._git(tree, "add", "-A")
        self._git(tree, "commit", "-q", "-m", "fixture")
        (tree / "src/app/untracked.py").write_text("X = 1\n")
        (tree / "scripts/untracked.py").write_text("X = 1\n")
        (tree / "docs/old.md").unlink()  # deleted, not yet staged
        result = audit.run_audit(tree)
        assert "src/app/untracked.py" not in _modules(result)
        assert "scripts/untracked.py" not in _scripts(result)
        assert "docs/old.md" not in {d.path for d in result.docs}
        dates = {d.path: d.last_commit for d in result.docs}
        assert len(dates["docs/guide.md"]) == len("2026-01-01")


class TestCounts:
    def test_counts_are_taken(self, result):
        counts = result.counts
        assert counts["scripts"]["files"] == 7
        assert counts["docs_markdown"]["files"] == 3
        assert counts["qt_modules"] == 1
        assert counts["unreached_modules"] >= 2
        assert counts["workflows_qt_or_pyinstaller_app"] == 1


class TestTheScriptChangesNothing:
    def test_running_it_leaves_the_tree_as_it_was(self, tree, tmp_path_factory):
        before = {p: p.read_bytes() for p in tree.rglob("*") if p.is_file()}
        out = tmp_path_factory.mktemp("out")
        code = audit.main(
            [
                "--root",
                str(tree),
                "--output",
                str(out / "r.md"),
                "--json",
                str(out / "r.json"),
            ]
        )
        assert code == 0
        after = {p: p.read_bytes() for p in tree.rglob("*") if p.is_file()}
        assert after == before
        report = (out / "r.md").read_text(encoding="utf-8")
        assert "`src/app/dead.py`" in report
        data = json.loads((out / "r.json").read_text(encoding="utf-8"))
        assert {"counts", "python", "scripts", "workflows", "docs"} <= set(data)

    def test_a_section_can_be_asked_for_alone(self, tree, capsys):
        assert audit.main(["--root", str(tree), "--section", "scripts"]) == 0
        out = capsys.readouterr().out
        assert "## Scripts" in out and "## Python" not in out

    def test_a_missing_root_is_an_error(self, tmp_path):
        assert audit.main(["--root", str(tmp_path / "nope")]) == 2


class TestHelpers:
    def test_comments_are_blanked_without_moving_lines(self):
        text = "a // c\nb /* x\ny */ 'not // a comment'\n"
        stripped = audit.strip_js_comments(text)
        assert stripped.count("\n") == text.count("\n")
        assert "c" not in stripped.split("\n")[0]
        assert "'not // a comment'" in stripped

    def test_import_clauses(self):
        assert audit._clause_names("React, { useState, type FC, a as b }") == {
            "default",
            "useState",
            "FC",
            "a",
        }
        assert audit._clause_names("* as ns") == {audit.ALL}

    def test_reference_kinds(self):
        layout = audit.DEFAULT_LAYOUT
        assert audit.reference_kind(".github/workflows/x.yml", layout) == "workflow"
        assert (
            audit.reference_kind("apps/desktop-electron/package.json", layout) == "npm"
        )
        assert audit.reference_kind(".claude/hooks/qt-guard.sh", layout) == "hook"
        assert audit.reference_kind(".pre-commit-config.yaml", layout) == "pre-commit"
        assert audit.reference_kind("build/engine-sidecar.spec", layout) == "build"
        assert audit.reference_kind("docs/x.md", layout) == "doc"
        assert audit.reference_kind("src/tests/unit/test_x.py", layout) == "test"
        assert audit.reference_kind("scripts/x.py", layout) == "script"
        assert audit.reference_kind("src/cuepoint/x.py", layout) == "source"


_CLEAN_KEYS = (
    "main.py",
    "scripts/README.md",
    "apps/desktop-electron/package.json",
    "apps/desktop-electron/electron/main.ts",
    "apps/desktop-electron/electron/preload.cjs",
    "apps/desktop-electron/renderer/package.json",
    "apps/desktop-electron/renderer/index.html",
)

_CLEAN_EXTRA: dict[str, str] = {
    "src/main.py": "from cuepoint.alive import run\ndef main():\n    run()\n",
    "src/cuepoint/__init__.py": "",
    "src/cuepoint/alive.py": "def run():\n    return 1\n",
    "scripts/run_by_ci.py": "print('run')\n",
    ".github/workflows/ci.yml": (
        "name: CI\non:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n"
        "    steps:\n      - run: python scripts/run_by_ci.py\n"
    ),
    "apps/desktop-electron/renderer/src/main.tsx": "export const X = 1;\n",
}


@pytest.fixture()
def clean(tmp_path: Path) -> Path:
    """A small repository in which everything is reached."""
    files = {k: TREE[k] for k in _CLEAN_KEYS} | _CLEAN_EXTRA
    for rel, text in files.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp_path


def _add(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _check(root: Path, capsys, *extra: str) -> tuple[int, str]:
    code = audit.main(["--root", str(root), "--check", *extra])
    captured = capsys.readouterr()
    return code, captured.out + captured.err


class TestTheGuard:
    def test_a_clean_tree_passes(self, clean, capsys):
        code, out = _check(clean, capsys)
        assert code == 0, out
        assert out.strip().count("\n") == 0
        assert "OK" in out

    def test_an_unreached_module_fails(self, clean, capsys):
        _add(clean, "src/cuepoint/orphan.py", "X = 1\n")
        code, out = _check(clean, capsys)
        assert code == 1
        assert "src/cuepoint/orphan.py" in out
        assert "Python module unreached" in out
        assert "ALLOWLIST" in out

    def test_a_migration_passes(self, clean, capsys):
        _add(clean, "src/cuepoint/migrations/__init__.py", "")
        _add(clean, "src/cuepoint/migrations/m001_initial.py", "VERSION = 1\n")
        code, out = _check(clean, capsys)
        assert code == 0, out

    def test_an_allowlisted_module_passes(self, clean, capsys, monkeypatch):
        _add(clean, "src/cuepoint/orphan.py", "X = 1\n")
        monkeypatch.setattr(
            audit, "ALLOWLIST", {"src/cuepoint/orphan.py": "loaded by a plugin host"}
        )
        code, out = _check(clean, capsys)
        assert code == 0, out
        assert "OK" in out
        assert "1 allowlisted" in out

    def test_an_unreferenced_script_fails(self, clean, capsys):
        _add(clean, "scripts/nobody.py", "print('x')\n")
        code, out = _check(clean, capsys)
        assert code == 1
        assert "scripts/nobody.py" in out
        assert "unreferenced" in out

    def test_a_script_only_the_retired_pipeline_runs_fails(self, clean, capsys):
        _add(clean, "scripts/old_build.py", "print('old')\n")
        _add(clean, "requirements-qt.txt", "PySide6==6.0\n")
        _add(
            clean,
            ".github/workflows/build-old.yml",
            TREE[".github/workflows/build-old.yml"],
        )
        code, out = _check(clean, capsys)
        assert code == 1
        assert "scripts/old_build.py" in out
        assert "retired-pipeline" in out

    @pytest.mark.parametrize("flag", ["--json", "--output"])
    def test_check_cannot_be_combined_with_a_report(self, clean, tmp_path, flag):
        target = tmp_path / "report.out"
        with pytest.raises(SystemExit) as raised:
            audit.main(["--root", str(clean), "--check", flag, str(target)])
        assert raised.value.code == 2
        assert not target.exists()

    def test_check_cannot_be_combined_with_a_section(self, clean):
        with pytest.raises(SystemExit):
            audit.main(["--root", str(clean), "--check", "--section", "python"])

    def test_the_hint_is_not_printed_for_a_stale_entry_alone(
        self, clean, capsys, monkeypatch
    ):
        monkeypatch.setattr(audit, "ALLOWLIST", {"src/cuepoint/gone.py": "x"})
        _, out = _check(clean, capsys)
        assert "Delete it, wire it in" not in out

    def test_a_failure_line_does_not_repeat_its_status(self, clean, capsys):
        _add(clean, "src/cuepoint/orphan.py", "X = 1\n")
        _, out = _check(clean, capsys)
        assert "Python module unreached: src/cuepoint/orphan.py\n" in out

    def test_a_test_only_file_says_only_tests_import_it(self, clean, capsys):
        base = "apps/desktop-electron/renderer/src/"
        _add(clean, base + "only.ts", "export const ONLY = 1;\n")
        _add(clean, base + "only.test.ts", "import { ONLY } from './only';\n")
        _, out = _check(clean, capsys)
        assert f"Renderer file test-only: {base}only.ts (only tests import it)" in out

    def test_a_script_named_only_by_a_non_dev_doc_fails(self, clean, capsys):
        _add(clean, "scripts/doc_only.py", "print('x')\n")
        _add(clean, "docs/guide.md", "Run `scripts/doc_only.py`.\n")
        code, out = _check(clean, capsys)
        assert code == 1
        assert "scripts/doc_only.py" in out
        assert "not-run" in out

    def test_an_unreached_renderer_file_fails(self, clean, capsys):
        _add(
            clean,
            "apps/desktop-electron/renderer/src/lost.ts",
            "export const LOST = 1;\n",
        )
        code, out = _check(clean, capsys)
        assert code == 1
        assert "apps/desktop-electron/renderer/src/lost.ts" in out
        assert "unreached" in out

    def test_a_renderer_file_only_its_test_imports_fails(self, clean, capsys):
        base = "apps/desktop-electron/renderer/src/"
        _add(clean, base + "only.ts", "export const ONLY = 1;\n")
        _add(
            clean,
            base + "only.test.ts",
            "import { ONLY } from './only';\nexpect(ONLY).toBe(1);\n",
        )
        code, out = _check(clean, capsys)
        assert code == 1
        assert base + "only.ts" in out
        assert "test-only" in out

    def test_a_stale_allowlist_entry_for_a_missing_path_fails(
        self, clean, capsys, monkeypatch
    ):
        monkeypatch.setattr(audit, "ALLOWLIST", {"src/cuepoint/gone.py": "was dynamic"})
        code, out = _check(clean, capsys)
        assert code == 1
        assert "src/cuepoint/gone.py" in out
        assert "no longer exists" in out
        assert "remove" in out.lower()

    def test_a_stale_allowlist_entry_for_a_reached_path_fails(
        self, clean, capsys, monkeypatch
    ):
        monkeypatch.setattr(
            audit, "ALLOWLIST", {"src/cuepoint/alive.py": "was unreached once"}
        )
        code, out = _check(clean, capsys)
        assert code == 1
        assert "src/cuepoint/alive.py" in out
        assert "no longer a failing file (reached, untracked or not guarded)" in out
        assert "remove" in out.lower()

    def test_check_does_not_write_reports(self, clean, capsys):
        code, out = _check(clean, capsys)
        assert code == 0
        assert "#" not in out
        assert "| " not in out


class TestTheRealRepository:
    """The audit runs on this repository, and what must hold of it does."""

    @pytest.fixture(scope="class")
    def real(self):
        return audit.run_audit(_REPO_ROOT, sections=("python", "scripts", "workflows"))

    def test_the_engine_and_cli_are_shipped(self, real):
        modules = _modules(real)
        assert modules["src/cuepoint/engine/server.py"].status == "shipped"
        assert modules["src/cuepoint/cli/cli_processor.py"].status == "shipped"

    def test_every_migration_is_held_as_one(self, real):
        migrations = [
            m
            for m in real.python.modules
            if m.path.startswith("src/cuepoint/migrations/")
        ]
        assert migrations and all(m.status == "migration" for m in migrations)

    def test_the_guards_run(self, real):
        scripts = _scripts(real)
        assert scripts["scripts/check_no_qt.py"].status == "run"
        assert (
            scripts["scripts/audit_dead_code.py"].status == "run"
        )  # test.yml, PRUNE-08

    def test_through_the_command_line(self):
        completed = subprocess.run(
            [sys.executable, str(_SCRIPT), "--section", "workflows"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            cwd=str(_REPO_ROOT),
            check=False,
        )
        assert completed.returncode == 0, completed.stderr
        assert "desktop-electron.yml" in completed.stdout

    def test_the_repository_passes_the_guard(self):
        completed = subprocess.run(
            [sys.executable, str(_SCRIPT), "--check"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            cwd=str(_REPO_ROOT),
            check=False,
        )
        assert completed.returncode == 0, completed.stdout + completed.stderr
