#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guards that only the persistence layer touches the library database.

Scattering SQL across services and API handlers is how a schema change turns
into a hunt through the whole codebase, and how query plans silently regress at
50,000 tracks. Repositories are the single place that talks to ``cuepoint.db``.

This is an architectural rule, so it is enforced rather than documented: adding
a query somewhere new fails here with an explanation, instead of passing review
unnoticed.

Note this is about CuePoint's *library* database only. ``incrate/inventory_db``
owns a separate inCrate inventory database and is deliberately out of scope.
"""

from __future__ import annotations

from pathlib import Path

import pytest

# src/tests/unit/persistence/<file> -> parents[3] is "src"
_PACKAGE = Path(__file__).resolve().parents[3] / "cuepoint"

# Modules allowed to depend on the library database connection.
_ALLOWED = {
    "services/database_service.py",  # owns the connection itself
    "services/migration_runner.py",  # owns schema_version and migrations
    "services/interfaces.py",  # declares the contracts
    "services/bootstrap.py",  # wires them together
}
_ALLOWED_PREFIXES = ("persistence/", "migrations/")


def _modules_referencing_database() -> set[str]:
    found = set()
    for path in _PACKAGE.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "IDatabaseService" in text:
            found.add(path.relative_to(_PACKAGE).as_posix())
    return found


@pytest.mark.unit
class TestPersistenceBoundary:
    def test_only_persistence_layer_uses_the_library_database(self):
        offenders = sorted(
            module
            for module in _modules_referencing_database()
            if module not in _ALLOWED and not module.startswith(_ALLOWED_PREFIXES)
        )
        assert not offenders, (
            "these modules reach for the library database directly; queries "
            f"belong in a repository under cuepoint/persistence/: {offenders}"
        )

    def test_package_path_resolves(self):
        """Guards the guard: scanning the wrong directory would pass vacuously."""
        assert _PACKAGE.is_dir(), f"cuepoint package not found at {_PACKAGE}"

    def test_repository_layer_actually_exists(self):
        """Guards the guard: finding nothing at all would also pass vacuously."""
        referencing = _modules_referencing_database()
        assert any(module.startswith("persistence/") for module in referencing), (
            f"no persistence module found; scanned {_PACKAGE}"
        )
