#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guards that package data files are bundled into the engine sidecar.

PyInstaller follows the module graph, so ``.py`` files are included
automatically, but any other file a package reads at runtime must be listed in
``datas`` explicitly. Missing one fails **only in packaged builds**, which is the
hardest place to notice: inCrate's schema.sql was once absent from the sidecar,
so creating the inventory database failed on a user's machine while working
perfectly in development. inCrate and its schema retired in DISCOVER-12.
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

    def test_the_retired_inventory_schema_is_not_bundled(self):
        """inCrate's schema.sql retired with it (DISCOVER-12): nothing reads it."""
        spec_text = _SPEC.read_text(encoding="utf-8")
        assert "schema.sql" not in spec_text
        assert not (_PACKAGE / "incrate" / "schema.sql").exists()
