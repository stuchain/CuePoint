#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for migration module discovery validation.

Malformed migration sets are developer errors that must fail loudly at
discovery, rather than silently skipping a migration on a user's database.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import List

import pytest

import cuepoint.migrations as migrations_pkg


def _fake_module(name: str, **attrs) -> types.ModuleType:
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    return module


@pytest.fixture
def fake_package(monkeypatch):
    """Install fake migration modules and make discovery see only them."""
    installed: List[str] = []

    def install(*modules: types.ModuleType):
        names = [m.__name__.rsplit(".", 1)[-1] for m in modules]
        for module in modules:
            sys.modules[module.__name__] = module
            installed.append(module.__name__)

        monkeypatch.setattr(
            migrations_pkg.pkgutil,
            "iter_modules",
            lambda path: [
                types.SimpleNamespace(name=n, ispkg=False, module_finder=None)
                for n in names
            ],
        )
        return migrations_pkg.discover_migrations

    yield install

    for name in installed:
        sys.modules.pop(name, None)


@pytest.mark.unit
class TestDiscoveryValidation:
    def test_duplicate_versions_rejected(self, fake_package):
        discover = fake_package(
            _fake_module(
                "cuepoint.migrations.m0001_a", VERSION=1, DESCRIPTION="a", SQL=""
            ),
            _fake_module(
                "cuepoint.migrations.m0001_b", VERSION=1, DESCRIPTION="b", SQL=""
            ),
        )
        with pytest.raises(ValueError, match="Duplicate migration version"):
            discover()

    def test_gap_in_sequence_rejected(self, fake_package):
        discover = fake_package(
            _fake_module(
                "cuepoint.migrations.m0001_a", VERSION=1, DESCRIPTION="a", SQL=""
            ),
            _fake_module(
                "cuepoint.migrations.m0003_c", VERSION=3, DESCRIPTION="c", SQL=""
            ),
        )
        with pytest.raises(ValueError, match="sequential"):
            discover()

    def test_missing_attribute_rejected(self, fake_package):
        discover = fake_package(
            _fake_module("cuepoint.migrations.m0001_a", VERSION=1, DESCRIPTION="a")
        )
        with pytest.raises(ValueError, match="missing SQL"):
            discover()

    def test_version_must_match_filename(self, fake_package):
        discover = fake_package(
            _fake_module(
                "cuepoint.migrations.m0001_a", VERSION=7, DESCRIPTION="a", SQL=""
            )
        )
        with pytest.raises(ValueError, match="filename"):
            discover()

    def test_non_migration_modules_ignored(self, fake_package):
        """Helper modules in the package must not be treated as migrations."""
        discover = fake_package(
            _fake_module(
                "cuepoint.migrations.m0001_a", VERSION=1, DESCRIPTION="a", SQL=""
            ),
            _fake_module("cuepoint.migrations.helpers", SOMETHING="else"),
        )
        assert [m.version for m in discover()] == [1]

    def test_finding_nothing_is_a_packaging_failure(self, fake_package):
        """Zero migrations means the modules are missing, not that there are none.

        This is what a packaged sidecar looked like before the spec collected
        `cuepoint.migrations`: discovery found nothing, no versions meant no
        duplicates and no gaps, and the runner applied nothing — leaving a
        database with no tables and a first query that failed somewhere else
        entirely. `fake_package()` with no modules is that state exactly.
        """
        discover = fake_package()

        with pytest.raises(ValueError, match="No migrations were found"):
            discover()

    def test_the_real_package_finds_every_migration_file(self):
        """Not a fake: the modules on disk are what discovery must return."""
        on_disk = sorted(
            path.stem
            for path in Path(migrations_pkg.__file__).parent.glob(
                "m[0-9][0-9][0-9][0-9]_*.py"
            )
        )
        discovered = sorted(m.module_name for m in migrations_pkg.discover_migrations())

        assert on_disk, "no migration files found — check the glob"
        assert discovered == on_disk

    def test_ordered_by_version_regardless_of_iteration_order(self, fake_package):
        discover = fake_package(
            _fake_module(
                "cuepoint.migrations.m0002_b", VERSION=2, DESCRIPTION="b", SQL=""
            ),
            _fake_module(
                "cuepoint.migrations.m0001_a", VERSION=1, DESCRIPTION="a", SQL=""
            ),
        )
        assert [m.version for m in discover()] == [1, 2]
