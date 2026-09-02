#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A mypy gate for the v1 foundation modules that can actually fail.

``test_step55_mypy_validation.py`` runs mypy over the legacy packages and
filters its output through ignore lists covering ``arg-type``, ``attr-defined``,
``assignment``, ``return-value``, ``misc``, ``index``, ``union-attr`` and most
other categories, matched as substrings against the whole line. Between them
they swallow essentially every error mypy can produce, so that check reports
success no matter what the code says. It documents the legacy gradual-typing
debt; it is not a gate.

The foundation modules were written type-clean, so they can be held to a real
standard: **any** mypy error here fails the build. ``--follow-imports=silent``
keeps the verdict about these files rather than the legacy modules they import,
which still carry known errors.

Add new foundation modules to ``GUARDED`` as they are written. The point is that
the clean core stays clean while the legacy surface is paid down separately.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

_SRC = Path(__file__).resolve().parents[2]
_REPO = _SRC.parent

# Paths are relative to `src/`, matching how mypy is invoked below.
GUARDED = (
    "cuepoint/persistence/",
    "cuepoint/migrations/",
    "cuepoint/models/library_track.py",
    "cuepoint/services/database_service.py",
    "cuepoint/services/migration_runner.py",
    "cuepoint/services/library_service.py",
    "cuepoint/services/activity_service.py",
    "cuepoint/services/backup_service.py",
    "cuepoint/services/interfaces.py",
    "cuepoint/services/config_service.py",
    "cuepoint/services/privacy_service.py",
    "cuepoint/services/onboarding_service.py",
)


@pytest.mark.integration
def test_guarded_paths_all_exist():
    """A renamed module must not silently drop out of the gate.

    mypy does not complain about a target that no longer exists in the way this
    test needs it to, so the gate could quietly shrink to nothing while still
    reporting success.
    """
    missing = [path for path in GUARDED if not (_SRC / path).exists()]
    assert not missing, (
        f"Guarded paths no longer exist: {missing}. Update GUARDED to point at "
        "their new location — do not just delete the entry, or these modules "
        "stop being type-checked."
    )


@pytest.mark.integration
def test_foundation_modules_have_no_type_errors():
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "mypy",
            "--config-file",
            str(_REPO / "mypy.ini"),
            "--explicit-package-bases",
            "--namespace-packages",
            # Report on the guarded files only; legacy modules they import have
            # their own known errors and are not this gate's business.
            "--follow-imports=silent",
            *GUARDED,
        ],
        cwd=_SRC,
        capture_output=True,
        text=True,
    )

    output = result.stdout + result.stderr
    errors = [line for line in output.splitlines() if ": error:" in line]

    assert not errors, "mypy found type errors in foundation modules:\n" + "\n".join(
        errors
    )
