#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0015: why a file was found missing without being looked at (CLEAN-07).

A column added under rows a check already wrote. It applies alone to a version 14
library, every row survives with no reason, and the vocabulary is enforced by
the table as well as by the model.
"""

from __future__ import annotations

import sqlite3
from typing import Dict, List

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-14T12:00:00+00:00"


def _runner(service, through: int) -> MigrationRunner:
    return MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= through]
    )


def _checks(service) -> List[Dict[str, object]]:
    return [
        dict(row)
        for row in service.connect().execute(
            "SELECT * FROM track_files ORDER BY track_id"
        )
    ]


@pytest.fixture
def populated(tmp_path):
    """A version 14 library holding a check of each status."""
    service = DatabaseService(db_path=tmp_path / "v14.db")
    _runner(service, 14).migrate()
    with service.transaction() as conn:
        conn.executemany(
            "INSERT INTO tracks (rekordbox_track_id, title, artist, file_path,"
            " normalized_path, created_at, updated_at)"
            " VALUES (?, 'T', 'A', ?, '', 'now', 'now')",
            [("1", "/m/1.mp3"), ("2", "/m/2.mp3"), ("3", "/m/3.mp3")],
        )
        conn.executemany(
            "INSERT INTO track_files (track_id, status, checked_path, size_bytes,"
            " checked_at) VALUES (?, ?, ?, ?, ?)",
            [
                (1, "present", "/m/1.mp3", 1024, NOW),
                (2, "missing", "/m/2.mp3", None, NOW),
                (3, "unreadable", "/m/3.mp3", None, NOW),
            ],
        )
    yield service
    service.close_all()


class TestUpgradingAVersionFourteenLibrary:
    def test_it_applies_alone(self, populated):
        assert [m.version for m in _runner(populated, 15).migrate()] == [15]

    def test_every_check_survives_with_no_reason(self, populated):
        before = _checks(populated)
        _runner(populated, 15).migrate()
        after = _checks(populated)
        assert [row["reason"] for row in after] == [None, None, None]
        assert [
            {key: value for key, value in row.items() if key != "reason"}
            for row in after
        ] == before

    def test_a_missing_file_can_say_its_root_was_unavailable(self, populated):
        _runner(populated, 15).migrate()
        with populated.transaction() as conn:
            conn.execute(
                "UPDATE track_files SET reason = 'root_unavailable' WHERE track_id = 2"
            )
        assert _checks(populated)[1]["reason"] == "root_unavailable"

    @pytest.mark.parametrize("reason", ["moved", "ROOT_UNAVAILABLE", ""])
    def test_a_reason_outside_the_vocabulary_is_refused(self, populated, reason):
        _runner(populated, 15).migrate()
        with pytest.raises(sqlite3.IntegrityError):
            with populated.transaction() as conn:
                conn.execute(
                    "UPDATE track_files SET reason = ? WHERE track_id = 2", (reason,)
                )
