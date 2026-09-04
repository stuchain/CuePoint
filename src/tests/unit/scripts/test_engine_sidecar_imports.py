#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guards that dynamically imported packages reach the engine sidecar.

PyInstaller builds its bundle from the module graph: what ``import`` statements
reference, directly or transitively. A package that is only ever loaded through
``importlib.import_module`` is invisible to it, and the failure is silent — the
build succeeds, the app starts, and the missing code is simply not there.

``cuepoint.migrations`` is exactly that. ``discover_migrations()`` walks the
package with ``pkgutil.iter_modules`` and imports each module by a name built at
runtime, so nothing in the source refers to ``m0001_baseline`` and friends. The
sidecar shipped without them, which means a fresh install would create a
database with no tables and fail on its first query — on a user's machine,
where it is hardest to diagnose.

This is the same class of bug as ``test_engine_sidecar_datas.py`` next door,
which exists because inCrate's ``schema.sql`` went missing the same way.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_SPEC = _REPO_ROOT / "build" / "engine-sidecar.spec"
_MIGRATIONS = _REPO_ROOT / "src" / "cuepoint" / "migrations"

_MIGRATION_FILE = re.compile(r"^m(\d{4})_.+\.py$")


def _migration_modules_on_disk() -> list[str]:
    """Every migration module in the package, by module name."""
    return sorted(
        path.stem
        for path in _MIGRATIONS.glob("*.py")
        if _MIGRATION_FILE.match(path.name)
    )


@pytest.mark.unit
class TestEngineSidecarHiddenImports:
    def test_spec_exists(self):
        assert _SPEC.is_file(), f"missing PyInstaller spec: {_SPEC}"

    def test_migrations_package_is_collected(self):
        """The spec must collect the migrations package explicitly.

        Asserted against the spec's text rather than a built bundle, because
        building takes minutes and this is the one line that matters.
        """
        spec = _SPEC.read_text(encoding="utf-8")

        assert 'collect_submodules("cuepoint.migrations")' in spec, (
            "build/engine-sidecar.spec must collect cuepoint.migrations: the "
            "modules are imported dynamically, so PyInstaller's module graph "
            "does not include them and the sidecar would ship none. A fresh "
            "install would then create a database with no tables."
        )

    def test_collecting_the_package_really_names_every_migration(self):
        """`collect_submodules` has to actually find them all.

        The line above is only worth having if it resolves to the modules on
        disk — a renamed package or a missing ``__init__.py`` would leave the
        spec looking right and the bundle empty.
        """
        pyinstaller_hooks = pytest.importorskip(
            "PyInstaller.utils.hooks",
            reason="PyInstaller is a build-time dependency",
        )

        collected = set(pyinstaller_hooks.collect_submodules("cuepoint.migrations"))
        expected = _migration_modules_on_disk()

        assert expected, "no migration modules found on disk — check the glob"
        missing = [
            name for name in expected if f"cuepoint.migrations.{name}" not in collected
        ]
        assert not missing, f"collect_submodules would not bundle: {missing}"

    def test_every_migration_on_disk_is_discoverable(self):
        """What ships and what runs have to be the same set.

        `discover_migrations()` is the runtime side of the same question, and a
        migration file that discovery skips would never be applied even in a
        development run.
        """
        from cuepoint.migrations import discover_migrations

        discovered = {migration.module_name for migration in discover_migrations()}

        assert discovered == set(_migration_modules_on_disk())
