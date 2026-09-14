#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0014: the batch index CLEAN-06's revert reads (DEC-063).

An index is a schema change like any other: it applies to a library that already
has history, it touches no row, and it is the index the query actually uses. The
last is asserted in ``test_revert.py``, against the revert's own SQL.
"""

from __future__ import annotations

from typing import Dict, List

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


def _runner(service, through: int) -> MigrationRunner:
    return MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= through]
    )


def _history(service) -> List[Dict[str, object]]:
    return [
        dict(row)
        for row in service.connect().execute("SELECT * FROM track_history ORDER BY id")
    ]


@pytest.fixture
def populated(tmp_path):
    """A version 13 library whose history holds batch and single changes."""
    service = DatabaseService(db_path=tmp_path / "v13.db")
    _runner(service, 13).migrate()
    with service.transaction() as conn:
        conn.execute(
            "INSERT INTO tracks (rekordbox_track_id, title, artist, normalized_path,"
            " created_at, updated_at) VALUES ('1', 'T', 'A', '', 'now', 'now')"
        )
        conn.executemany(
            "INSERT INTO track_history (track_id, field, old_value_json,"
            " new_value_json, source, changed_at, batch_id)"
            " VALUES (1, 'cuepoint_rating', NULL, ?, 'cuepoint', 'now', ?)",
            [("1", "b"), ("2", None), ("3", "b")],
        )
    yield service
    service.close_all()


class TestUpgradingAVersionThirteenLibrary:
    def test_it_applies_alone(self, populated):
        assert [m.version for m in _runner(populated, 14).migrate()] == [14]

    def test_every_history_row_survives(self, populated):
        before = _history(populated)
        _runner(populated, 14).migrate()
        assert _history(populated) == before

    def test_the_index_holds_only_batched_changes_in_id_order(self, populated):
        _runner(populated, 14).migrate()
        row = (
            populated.connect()
            .execute(
                "SELECT sql FROM sqlite_master WHERE name = 'idx_track_history_batch'"
            )
            .fetchone()
        )
        sql = " ".join(row["sql"].split())
        assert "ON track_history (batch_id, id)" in sql
        assert sql.endswith("WHERE batch_id IS NOT NULL")
