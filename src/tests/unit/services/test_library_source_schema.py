#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0005 — DEC-034 track fields and DEC-035's source.

Two things are worth asserting beyond "the columns exist".

The first is that the migration is safe on a database that already has rows in
it. Every earlier migration created its tables empty, so nothing has yet proved
the FOUNDATION-03 guarantee — an update never asks the user to delete their
database — against real data. These tests build a database at version 4, fill it
with tracks, and then migrate.

The second is that the new columns are *null*, not zero. DEC-034 captures fields
Rekordbox omits freely, and "unrated" and "rated zero stars" are different
answers to different questions; a DEFAULT would erase that difference for every
existing row in the migration itself.
"""

from __future__ import annotations

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import _COLUMNS, TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

# Columns migration 0005 adds to `tracks`.
NEW_TRACK_COLUMNS = (
    "rating",
    "play_count",
    "colour",
    "date_added",
    "comment",
    "bitrate",
)

# duration_seconds predates this migration (0002) but is the column TotalTime is
# imported into (DEC-038), so it is asserted alongside them.

_PRE_0005_INSERT = (
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
def populated_v4(tmp_path):
    """A database at schema version 4 with tracks already in it."""
    service = DatabaseService(db_path=tmp_path / "populated.db")
    MigrationRunner(service, migrations=_migrations_up_to(4)).migrate()
    with service.transaction() as conn:
        conn.executemany(
            _PRE_0005_INSERT,
            [
                (str(i), f"/m/{i}.mp3", f"/m/{i}.mp3", f"T{i}", "A", "then", "then")
                for i in range(25)
            ],
        )
    yield service
    service.close_all()


@pytest.mark.unit
class TestMigrationOn5Applies:
    def test_new_track_columns_exist(self, db):
        columns = {
            row["name"] for row in db.connect().execute("PRAGMA table_info(tracks)")
        }
        assert set(NEW_TRACK_COLUMNS) <= columns

    def test_there_is_only_one_column_for_a_track_length(self, db):
        """DEC-038: TotalTime is imported into duration_seconds, not beside it."""
        columns = {
            row["name"] for row in db.connect().execute("PRAGMA table_info(tracks)")
        }
        assert "duration_seconds" in columns
        assert "total_time" not in columns

    def test_library_source_table_exists(self, db):
        tables = {
            row["name"]
            for row in db.connect().execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        assert "library_source" in tables

    def test_target_version_includes_migration_5(self):
        assert max(m.version for m in discover_migrations()) >= 5

    def test_new_columns_are_nullable_with_no_default(self, db):
        rows = {
            row["name"]: row
            for row in db.connect().execute("PRAGMA table_info(tracks)")
        }
        for column in NEW_TRACK_COLUMNS:
            assert rows[column]["notnull"] == 0, f"{column} must be nullable"
            assert rows[column]["dflt_value"] is None, (
                f"{column} must not default; a missing value is unknown, not zero"
            )


@pytest.mark.unit
class TestMigrationOnPopulatedDatabase:
    """FOUNDATION-03's guarantee, re-checked with real rows present."""

    def test_existing_tracks_survive(self, populated_v4):
        MigrationRunner(populated_v4).migrate()

        rows = (
            populated_v4.connect()
            .execute(
                "SELECT rekordbox_track_id, title FROM tracks ORDER BY CAST(rekordbox_track_id AS INTEGER)"
            )
            .fetchall()
        )
        assert len(rows) == 25
        assert rows[0]["title"] == "T0"
        assert rows[24]["rekordbox_track_id"] == "24"

    def test_migrated_rows_have_null_not_zero_in_the_new_columns(self, populated_v4):
        MigrationRunner(populated_v4).migrate()

        row = populated_v4.connect().execute("SELECT * FROM tracks LIMIT 1").fetchone()
        assert row is not None, "the migration lost the rows it was given"
        for column in NEW_TRACK_COLUMNS:
            assert row[column] is None, f"{column} backfilled a value it cannot know"

    def test_indexes_still_serve_identity_lookups(self, populated_v4):
        """ALTER TABLE ADD COLUMN must not have disturbed DEC-002's indexes."""
        MigrationRunner(populated_v4).migrate()

        plan = (
            populated_v4.connect()
            .execute(
                "EXPLAIN QUERY PLAN SELECT * FROM tracks WHERE rekordbox_track_id = '5'"
            )
            .fetchone()["detail"]
        )
        assert "idx_tracks_rekordbox_track_id" in plan

    def test_a_track_written_after_migrating_carries_the_new_fields(self, populated_v4):
        MigrationRunner(populated_v4).migrate()
        repository = TrackRepository(populated_v4)

        repository.add(
            LibraryTrack(
                rekordbox_track_id="900",
                title="New",
                artist="A",
                file_path="/m/new.mp3",
                rating=4,
                play_count=12,
                colour="0xFF007F",
                date_added="2024-03-01",
                comment="peak time",
                duration_seconds=421,
                bitrate=1411,
            )
        )
        restored = repository.find_by_rekordbox_id("900")

        assert restored is not None
        assert restored.rating == 4
        assert restored.play_count == 12
        assert restored.colour == "0xFF007F"
        assert restored.date_added == "2024-03-01"
        assert restored.comment == "peak time"
        assert restored.duration_seconds == 421
        assert restored.bitrate == 1411


@pytest.mark.unit
class TestLibrarySourceRecord:
    """DEC-035: the library remembers the file it was imported from."""

    def test_source_record_round_trips(self, db):
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO library_source (xml_path, xml_modified_at,"
                " xml_size_bytes, imported_at, track_count, playlist_count)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (
                    r"C:\Users\dj\rekordbox.xml",
                    "2026-09-03T10:15:00+00:00",
                    48_213_776,
                    "2026-09-03T10:16:04+00:00",
                    50_000,
                    312,
                ),
            )

        row = db.connect().execute("SELECT * FROM library_source").fetchone()
        assert row["xml_path"] == r"C:\Users\dj\rekordbox.xml"
        assert row["xml_modified_at"] == "2026-09-03T10:15:00+00:00"
        assert row["xml_size_bytes"] == 48_213_776
        assert row["imported_at"] == "2026-09-03T10:16:04+00:00"
        assert row["track_count"] == 50_000
        assert row["playlist_count"] == 312

    def test_stat_details_may_be_unknown(self, db):
        """A failed stat costs the refresh its shortcut, not the import."""
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO library_source (xml_path, imported_at)"
                " VALUES ('/music/collection.xml', 'now')"
            )

        row = db.connect().execute("SELECT * FROM library_source").fetchone()
        assert row["xml_modified_at"] is None
        assert row["xml_size_bytes"] is None
        assert row["track_count"] == 0

    def test_counts_are_not_null(self, db):
        import sqlite3

        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO library_source (xml_path, imported_at, track_count)"
                    " VALUES ('/x.xml', 'now', NULL)"
                )


@pytest.mark.unit
class TestColumnListCoversTheSchema:
    """The risk LIBRARY-01 names: a column in the schema but not in _COLUMNS.

    ``_COLUMNS`` drives both the INSERT and the UPDATE, so a column missing from
    it is never written and never complains — the value simply stays null while
    the schema, the model and the tests all look correct.
    """

    def test_repository_writes_every_track_column(self, db):
        schema_columns = {
            row["name"]
            for row in db.connect().execute("PRAGMA table_info(tracks)")
            if row["name"] != "id"
        }
        assert schema_columns == set(_COLUMNS), (
            "tracks columns and TrackRepository._COLUMNS have diverged; a column "
            "missing from _COLUMNS is silently never written"
        )
