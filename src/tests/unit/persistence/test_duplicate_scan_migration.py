#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0016: a fingerprint per duplicate group, and the view of groups shown.

It applies alone to a version 15 library, keeps every group, member and
dismissal, and the view answers exactly "shown": two or more members, and no
dismissal made for exactly those members.
"""

from __future__ import annotations

from typing import Dict, List, Set, Tuple

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.duplicate_group import member_hash
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-14T12:00:00+00:00"


def _runner(service, through: int) -> MigrationRunner:
    return MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= through]
    )


def _rows(service, table: str) -> List[Dict[str, object]]:
    return [dict(row) for row in service.connect().execute(f"SELECT * FROM {table}")]


def _view(service) -> Set[Tuple[int, str]]:
    return {
        (int(row["track_id"]), str(row["signal"]))
        for row in service.connect().execute(
            "SELECT track_id, signal FROM duplicate_track_signals"
        )
    }


@pytest.fixture
def populated(tmp_path):
    """A version 15 library with a pair, a dismissed pair and a group of one."""
    service = DatabaseService(db_path=tmp_path / "v15.db")
    _runner(service, 15).migrate()
    with service.transaction() as conn:
        conn.executemany(
            "INSERT INTO tracks (rekordbox_track_id, title, artist, normalized_path,"
            " created_at, updated_at) VALUES (?, 'T', 'A', '', 'now', 'now')",
            [(str(i),) for i in range(1, 6)],
        )
        conn.executemany(
            "INSERT INTO duplicate_groups (id, signal, group_key, computed_at)"
            " VALUES (?, ?, ?, ?)",
            [
                (1, "path", "/m/a", NOW),
                (2, "text", "a|t||300", NOW),
                (3, "path", "/m/b", NOW),
            ],
        )
        conn.executemany(
            "INSERT INTO duplicate_members (group_id, track_id) VALUES (?, ?)",
            [(1, 1), (1, 2), (2, 3), (2, 4), (3, 5)],
        )
        conn.execute(
            "INSERT INTO duplicate_dismissals VALUES ('text', 'a|t||300', ?, ?)",
            (member_hash([3, 4]), NOW),
        )
    yield service
    service.close_all()


class TestUpgradingAVersionFifteenLibrary:
    def test_it_applies_alone(self, populated):
        assert [m.version for m in _runner(populated, 16).migrate()] == [16]

    def test_every_group_member_and_dismissal_survives(self, populated):
        before = {
            table: _rows(populated, table)
            for table in ("duplicate_members", "duplicate_dismissals")
        }
        groups = _rows(populated, "duplicate_groups")
        _runner(populated, 16).migrate()
        assert {table: _rows(populated, table) for table in before} == before
        after = _rows(populated, "duplicate_groups")
        assert [row["member_hash"] for row in after] == ["", "", ""]
        assert [
            {k: v for k, v in row.items() if k != "member_hash"} for row in after
        ] == groups


class TestTheView:
    def test_a_group_nothing_has_fingerprinted_is_shown(self, populated):
        _runner(populated, 16).migrate()
        # A dismissal made for {3, 4} does not cover a group with no fingerprint.
        assert _view(populated) == {(1, "path"), (2, "path"), (3, "text"), (4, "text")}

    def test_a_dismissal_for_exactly_its_members_hides_it(self, populated):
        _runner(populated, 16).migrate()
        with populated.transaction() as conn:
            conn.execute(
                "UPDATE duplicate_groups SET member_hash = ? WHERE id = 2",
                (member_hash([3, 4]),),
            )
        assert _view(populated) == {(1, "path"), (2, "path")}

    def test_a_group_of_one_is_never_shown(self, populated):
        _runner(populated, 16).migrate()
        assert (5, "path") not in _view(populated)

    def test_a_member_deleted_with_its_track_dissolves_the_pair_at_once(
        self, populated
    ):
        _runner(populated, 16).migrate()
        with populated.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = 2")
        assert {signal for _, signal in _view(populated)} == {"text"}
