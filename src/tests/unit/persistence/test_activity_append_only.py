#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guards that the activity feed and track history are only ever appended to.

DEC-008's revert works by writing a *new* entry restoring a previous value. If
some future code path edits or deletes rows instead, the log stops being a
record of what happened and quietly becomes a record of what someone wanted it
to say — which is worse than having no log, because it still looks
authoritative.

Rows do disappear in one sanctioned way: ``track_history`` cascades when its
track is deleted (DEC-003 removes tracks outright). That is a schema-level
foreign key in the migration, not application code rewriting history.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

# src/tests/unit/persistence/<file> -> parents[3] is "src"
_PACKAGE = Path(__file__).resolve().parents[3] / "cuepoint"

_APPEND_ONLY_TABLES = ("activity_events", "track_history")

# UPDATE <table> ... / DELETE FROM <table>
_MUTATION = re.compile(
    r"\b(UPDATE|DELETE)\s+(?:FROM\s+)?(" + "|".join(_APPEND_ONLY_TABLES) + r")\b",
    re.IGNORECASE,
)

# The migration defines the tables and their cascade; it is not application
# code mutating rows.
_ALLOWED = {"migrations/m0004_activity.py"}


def _offending_modules() -> list[str]:
    offenders = []
    for path in sorted(_PACKAGE.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        relative = path.relative_to(_PACKAGE).as_posix()
        if relative in _ALLOWED:
            continue
        for line_no, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), 1
        ):
            if _MUTATION.search(line):
                offenders.append(f"{relative}:{line_no}: {line.strip()}")
    return offenders


@pytest.mark.unit
class TestAppendOnly:
    def test_package_path_resolves(self):
        """Guards the guard: scanning nothing would pass vacuously."""
        assert _PACKAGE.is_dir(), f"cuepoint package not found at {_PACKAGE}"

    def test_no_code_updates_or_deletes_history(self):
        offenders = _offending_modules()
        assert not offenders, (
            "activity_events and track_history are append-only; a revert writes "
            "a new entry rather than editing or removing one:\n" + "\n".join(offenders)
        )

    @pytest.mark.parametrize(
        "statement",
        [
            "conn.execute('UPDATE track_history SET field = ?')",
            "conn.execute('DELETE FROM activity_events WHERE id = ?')",
            "cursor.execute('delete from track_history')",
        ],
    )
    def test_guard_detects_mutations(self, statement):
        """Guards the guard: the pattern must actually match real mutations."""
        assert _MUTATION.search(statement)

    @pytest.mark.parametrize(
        "statement",
        [
            "conn.execute('INSERT INTO track_history (track_id) VALUES (?)')",
            "conn.execute('SELECT * FROM activity_events')",
            "conn.execute('UPDATE tracks SET title = ?')",
        ],
    )
    def test_guard_ignores_appends_reads_and_other_tables(self, statement):
        assert not _MUTATION.search(statement)


@pytest.mark.unit
class TestRepositoryHasNoMutators:
    """The repository exposes no way to edit or remove an entry."""

    def test_no_update_or_delete_methods(self):
        from cuepoint.persistence.activity_repository import ActivityRepository

        forbidden = [
            name
            for name in dir(ActivityRepository)
            if not name.startswith("_")
            and any(word in name.lower() for word in ("update", "delete", "remove"))
        ]
        assert not forbidden, f"append-only store exposes mutators: {forbidden}"
