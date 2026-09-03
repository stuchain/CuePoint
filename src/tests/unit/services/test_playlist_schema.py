#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0006 — the mirrored Rekordbox playlist tree.

Two things beyond "the tables exist".

The indexes are asserted explicitly because every one of them backs a query the
tree cannot do without: listing a folder's children, resolving a path, reading a
playlist in order, and finding which playlists hold a track. At 234 nodes a
missing index is invisible; the target is a library where it is not.

And the migration is applied to a database that already holds tracks and their
history, because that is the state a user upgrading into this release is in.
"""

from __future__ import annotations

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

PLAYLIST_COLUMNS = {
    "id",
    "parent_id",
    "name",
    "kind",
    "depth",
    "position",
    "rekordbox_path",
    "parent_path",
    "track_count",
}

ENTRY_COLUMNS = {"playlist_id", "track_id", "position"}

_PRE_0006_TRACK = (
    "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
    " title, artist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
)


def _migrations_up_to(version: int):
    return [m for m in discover_migrations() if m.version <= version]


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def populated_v5(tmp_path):
    """A database at schema version 5 with tracks and history already in it."""
    service = DatabaseService(db_path=tmp_path / "populated.db")
    MigrationRunner(service, migrations=_migrations_up_to(5)).migrate()
    with service.transaction() as conn:
        conn.executemany(
            _PRE_0006_TRACK,
            [
                (str(i), f"/m/{i}.mp3", f"/m/{i}.mp3", f"T{i}", "A", "then", "then")
                for i in range(20)
            ],
        )
        conn.execute(
            "INSERT INTO track_history (track_id, field, old_value_json,"
            " new_value_json, source, changed_at)"
            " VALUES (1, 'title', '\"a\"', '\"b\"', 'cuepoint', 'then')"
        )
    yield service
    service.close_all()


@pytest.mark.unit
class TestTables:
    def test_playlist_table_has_the_expected_columns(self, db):
        columns = {
            row["name"]
            for row in db.connect().execute("PRAGMA table_info(rekordbox_playlists)")
        }
        assert columns == PLAYLIST_COLUMNS

    def test_membership_table_has_the_expected_columns(self, db):
        columns = {
            row["name"]
            for row in db.connect().execute(
                "PRAGMA table_info(rekordbox_playlist_tracks)"
            )
        }
        assert columns == ENTRY_COLUMNS

    def test_target_version_includes_migration_6(self):
        assert max(m.version for m in discover_migrations()) >= 6

    def test_membership_is_keyed_on_playlist_and_position(self, db):
        """Ordering as an enforced property rather than a convention."""
        key = [
            row["name"]
            for row in db.connect().execute(
                "PRAGMA table_info(rekordbox_playlist_tracks)"
            )
            if row["pk"]
        ]
        assert set(key) == {"playlist_id", "position"}

    def test_parent_id_is_nullable_for_roots(self, db):
        row = {
            r["name"]: r
            for r in db.connect().execute("PRAGMA table_info(rekordbox_playlists)")
        }["parent_id"]
        assert row["notnull"] == 0

    def test_the_path_is_indexed(self, db):
        connection = db.connect()
        indexed = {
            column["name"]
            for index in connection.execute("PRAGMA index_list(rekordbox_playlists)")
            for column in connection.execute(f"PRAGMA index_info('{index['name']}')")
        }
        assert "rekordbox_path" in indexed

    def test_the_path_is_not_unique(self, db):
        """A name may contain "/", so two nodes can render the same path.

        A folder ``A/B`` holding ``C`` and a folder ``A`` holding ``B/C`` both
        render as ``A/B/C``. A UNIQUE constraint would reject that legal
        Rekordbox tree at import, which is why parent_id carries the structure.
        """
        connection = db.connect()
        unique_columns = {
            column["name"]
            for index in connection.execute("PRAGMA index_list(rekordbox_playlists)")
            if index["unique"]
            for column in connection.execute(f"PRAGMA index_info('{index['name']}')")
        }
        assert "rekordbox_path" not in unique_columns

    def test_two_nodes_may_share_a_path(self, db):
        """The property the previous test protects, exercised against the table."""
        with db.transaction() as conn:
            conn.executemany(
                "INSERT INTO rekordbox_playlists"
                " (name, kind, depth, position, rekordbox_path)"
                " VALUES (?, 'playlist', 1, ?, 'ROOT/A/B')",
                [("A/B", 0), ("B", 1)],
            )
        assert (
            db.connect()
            .execute(
                "SELECT count(*) FROM rekordbox_playlists WHERE rekordbox_path='ROOT/A/B'"
            )
            .fetchone()[0]
            == 2
        )


@pytest.mark.unit
class TestForeignKeys:
    def test_a_node_points_at_its_parent_and_cascades(self, db):
        keys = {
            (row["table"], row["from"], row["on_delete"])
            for row in db.connect().execute(
                "PRAGMA foreign_key_list(rekordbox_playlists)"
            )
        }
        assert ("rekordbox_playlists", "parent_id", "CASCADE") in keys

    def test_membership_cascades_from_both_sides(self, db):
        keys = {
            (row["table"], row["from"], row["on_delete"])
            for row in db.connect().execute(
                "PRAGMA foreign_key_list(rekordbox_playlist_tracks)"
            )
        }
        assert ("rekordbox_playlists", "playlist_id", "CASCADE") in keys
        assert ("tracks", "track_id", "CASCADE") in keys


@pytest.mark.unit
class TestIndexesServeTheTreeQueries:
    """Every one of these backs a query Phase 4 makes constantly."""

    @pytest.fixture
    def populated(self, db):
        with db.transaction() as conn:
            conn.executemany(
                "INSERT INTO rekordbox_playlists"
                " (parent_id, name, kind, depth, position, rekordbox_path)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (1 if i else None, f"n{i}", "playlist", 1, i, f"ROOT/n{i}")
                    for i in range(2000)
                ],
            )
            conn.executemany(
                "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
                " title, artist, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, 'now', 'now')",
                [(str(i), f"/m/{i}", f"/m/{i}", f"T{i}", "A") for i in range(2000)],
            )
            conn.executemany(
                "INSERT INTO rekordbox_playlist_tracks"
                " (playlist_id, track_id, position) VALUES (?, ?, ?)",
                [(2, i + 1, i) for i in range(1000)],
            )
        return db

    def _plan(self, db, sql):
        return " ".join(
            row["detail"] for row in db.connect().execute(f"EXPLAIN QUERY PLAN {sql}")
        )

    def test_listing_a_folders_children_uses_an_index(self, populated):
        plan = self._plan(
            populated,
            "SELECT * FROM rekordbox_playlists WHERE parent_id = 1 ORDER BY position",
        )
        assert "idx_rekordbox_playlists_parent" in plan

    def test_path_lookup_uses_an_index(self, populated):
        plan = self._plan(
            populated,
            "SELECT * FROM rekordbox_playlists WHERE rekordbox_path = 'ROOT/n5'",
        )
        assert "idx_rekordbox_playlists_path" in plan

    def test_reading_a_playlist_in_order_uses_the_primary_key(self, populated):
        """The (playlist_id, position) key serves both the filter and the order.

        Named explicitly rather than checked for the absence of "SCAN": SQLite
        reports a covering scan as a SCAN too, and that assertion would have
        passed against a table with no key at all.
        """
        plan = self._plan(
            populated,
            "SELECT track_id FROM rekordbox_playlist_tracks "
            "WHERE playlist_id = 2 ORDER BY position",
        )
        assert "sqlite_autoindex_rekordbox_playlist_tracks_1" in plan
        assert "TEMP B-TREE" not in plan.upper(), "the order is being sorted, not read"

    def test_finding_a_tracks_playlists_uses_an_index(self, populated):
        plan = self._plan(
            populated,
            "SELECT playlist_id FROM rekordbox_playlist_tracks WHERE track_id = 5",
        )
        assert "idx_rekordbox_playlist_tracks_track" in plan


@pytest.mark.unit
class TestMigrationOnAPopulatedDatabase:
    def test_existing_tracks_and_history_survive(self, populated_v5):
        MigrationRunner(populated_v5).migrate()

        connection = populated_v5.connect()
        assert connection.execute("SELECT count(*) FROM tracks").fetchone()[0] == 20
        assert (
            connection.execute("SELECT count(*) FROM track_history").fetchone()[0] == 1
        )

    def test_the_new_tables_start_empty(self, populated_v5):
        MigrationRunner(populated_v5).migrate()

        connection = populated_v5.connect()
        assert (
            connection.execute("SELECT count(*) FROM rekordbox_playlists").fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM rekordbox_playlist_tracks"
            ).fetchone()[0]
            == 0
        )

    def test_the_track_identity_indexes_still_serve_lookups(self, populated_v5):
        MigrationRunner(populated_v5).migrate()
        plan = (
            populated_v5.connect()
            .execute(
                "EXPLAIN QUERY PLAN SELECT * FROM tracks WHERE rekordbox_track_id = '5'"
            )
            .fetchone()["detail"]
        )
        assert "idx_tracks_rekordbox_track_id" in plan
