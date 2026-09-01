#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guards that package data files are bundled into the engine sidecar.

PyInstaller follows the module graph, so ``.py`` files are included
automatically, but any other file a package reads at runtime must be listed in
``datas`` explicitly. Missing one fails **only in packaged builds**, which is the
hardest place to notice: inCrate's schema.sql was absent from the sidecar, so
creating the inventory database would fail on a user's machine while working
perfectly in development.
"""

from __future__ import annotations

from pathlib import Path

import pytest

# src/tests/unit/scripts -> 5 levels up
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_SPEC = _REPO_ROOT / "build" / "engine-sidecar.spec"
_PACKAGE = _REPO_ROOT / "src" / "cuepoint"


def _package_data_files() -> list[Path]:
    """Every non-Python file inside the cuepoint package."""
    return sorted(
        path
        for path in _PACKAGE.rglob("*")
        if path.is_file()
        and path.suffix != ".py"
        and "__pycache__" not in path.parts
        and path.suffix not in {".pyc", ".pyo"}
    )


@pytest.mark.unit
class TestEngineSidecarDatas:
    def test_spec_exists(self):
        assert _SPEC.is_file(), f"missing PyInstaller spec: {_SPEC}"

    def test_every_package_data_file_is_bundled(self):
        """A data file the package reads at runtime must be in the spec.

        If this fails after adding a data file, add it to ``datas`` in
        build/engine-sidecar.spec with a destination mirroring its package path.
        """
        spec_text = _SPEC.read_text(encoding="utf-8")

        missing = [
            path.relative_to(_REPO_ROOT).as_posix()
            for path in _package_data_files()
            if path.name not in spec_text
        ]

        assert not missing, (
            "package data files not referenced in build/engine-sidecar.spec "
            f"(they would be absent from packaged builds): {missing}"
        )

    def test_incrate_schema_is_bundled(self):
        """Regression: schema.sql was missing from the packaged sidecar."""
        spec_text = _SPEC.read_text(encoding="utf-8")
        assert "schema.sql" in spec_text
        assert "cuepoint/incrate" in spec_text, (
            "schema.sql must be bundled to a destination mirroring its package "
            "path, so __file__-relative lookup resolves inside the bundle"
        )


@pytest.mark.unit
class TestSchemaResolution:
    def test_schema_loads_in_a_source_checkout(self):
        from cuepoint.incrate import inventory_db

        assert "CREATE TABLE" in inventory_db._load_schema().upper()

    def test_missing_schema_reports_actionable_error(self, monkeypatch, tmp_path):
        from cuepoint.incrate import inventory_db

        monkeypatch.setattr(
            inventory_db, "_SCHEMA_PATH", tmp_path / "does_not_exist.sql"
        )
        monkeypatch.delattr(inventory_db.sys, "_MEIPASS", raising=False)

        with pytest.raises(FileNotFoundError, match="engine-sidecar.spec"):
            inventory_db._load_schema()

    def test_falls_back_to_bundle_root(self, monkeypatch, tmp_path):
        """Simulates a frozen build where __file__-relative lookup misses."""
        from cuepoint.incrate import inventory_db

        bundled = tmp_path / "cuepoint" / "incrate"
        bundled.mkdir(parents=True)
        (bundled / "schema.sql").write_text("CREATE TABLE bundled (id INTEGER);")

        monkeypatch.setattr(
            inventory_db, "_SCHEMA_PATH", tmp_path / "missing" / "schema.sql"
        )
        monkeypatch.setattr(inventory_db.sys, "_MEIPASS", str(tmp_path), raising=False)

        assert "bundled" in inventory_db._load_schema()
