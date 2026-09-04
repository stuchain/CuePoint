#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0007 — the browse index (LIBUI-01, DEC-040).

Two things beyond "the index exists".

The first is the collation. An index's collation has to match the query's or
SQLite ignores it, and it does so silently: the query still returns the right
rows, just by reading and sorting all of them. On a 50,000-track library that is
the whole difference the index was created for, and nothing about the result
would say so. ``test_track_browse.py`` asserts the plan; this file asserts the
declaration, because the two fail differently and a change is likely to break
only one of them.

The second is that the migration is safe on a database that already holds a
library — the FOUNDATION-03 guarantee, checked against real rows rather than an
empty table, as migration 0005's tests established.
"""

from __future__ import annotations

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

#: The one index migration 0007 creates. Six more were proposed, built,
#: measured and removed — see the migration's own docstring.
BROWSE_INDEX = "idx_tracks_artist_title"

_PRE_0007_INSERT = (
    "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
    " title, artist, bpm, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
)


def _migrations_up_to(version: int):
    return [m for m in discover_migrations() if m.version <= version]


def _migration_seven():
    return next(m for m in discover_migrations() if m.version == 7)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def populated_v6(tmp_path):
    """A database at schema version 6 with a library already in it."""
    service = DatabaseService(db_path=tmp_path / "populated.db")
    MigrationRunner(service, migrations=_migrations_up_to(6)).migrate()
    with service.transaction() as conn:
        conn.executemany(
            _PRE_0007_INSERT,
            [
                (str(i), f"/m/{i}.mp3", f"/m/{i}.mp3", f"T{i}", "A", 120.0, "t", "t")
                for i in range(1, 51)
            ],
        )
    yield service
    service.close_all()


def index_names(service) -> set:
    rows = service.connect().execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tracks'"
    )
    return {row["name"] for row in rows}


def index_sql(service, name: str) -> str:
    row = (
        service.connect()
        .execute(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?", (name,)
        )
        .fetchone()
    )
    return "" if row is None or row["sql"] is None else str(row["sql"])


class TestMigration:
    def test_it_is_discovered_as_version_seven(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert 7 in by_version
        assert by_version[7].module_name == "m0007_browse_indexes"

    def test_a_fresh_database_ends_at_version_seven_or_later(self, db):
        assert MigrationRunner(db).current_version() >= 7

    def test_the_browse_index_exists(self, db):
        assert BROWSE_INDEX in index_names(db)

    def test_it_creates_exactly_one_index(self, db):
        # A guard against the speculative indexes coming back: the six that
        # were measured and removed changed no query time and cost 10% of
        # import. An index that serves a real query belongs to the step whose
        # query it serves, which can measure it.
        created = [
            statement
            for statement in _migration_seven().sql.split(";")
            if statement.strip()
        ]
        assert len(created) == 1

    def test_the_phase_three_indexes_survive(self, db):
        # The migration adds; it must not have disturbed identity lookups.
        assert {"idx_tracks_rekordbox_track_id", "idx_tracks_normalized_path"} <= (
            index_names(db)
        )


class TestCollation:
    def test_the_default_order_index_declares_nocase(self, db):
        sql = index_sql(db, BROWSE_INDEX).upper()
        assert sql.count("COLLATE NOCASE") == 2

    def test_it_carries_the_row_id_for_the_tiebreak(self, db):
        # Without `id` in the index, the ordering's tiebreak costs a sort even
        # when the artist and title come from the index.
        assert index_sql(db, BROWSE_INDEX).rstrip(")").endswith("id")

    def test_it_indexes_both_ordering_columns(self, db):
        sql = index_sql(db, BROWSE_INDEX).lower()
        assert "artist" in sql and "title" in sql


class TestExistingData:
    def test_it_applies_to_a_populated_database(self, populated_v6):
        applied = MigrationRunner(populated_v6).migrate()
        assert 7 in [m.version for m in applied]

    def test_no_row_is_lost(self, populated_v6):
        MigrationRunner(populated_v6).migrate()
        row = (
            populated_v6.connect()
            .execute("SELECT count(*) AS n FROM tracks")
            .fetchone()
        )
        assert row["n"] == 50

    def test_the_indexes_cover_the_rows_that_were_already_there(self, populated_v6):
        MigrationRunner(populated_v6).migrate()
        # An index built over existing rows must find them, not only later ones.
        plan = (
            populated_v6.connect()
            .execute(
                "EXPLAIN QUERY PLAN SELECT id FROM tracks "
                "ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE, id"
            )
            .fetchall()
        )
        assert "idx_tracks_artist_title" in " ".join(str(r["detail"]) for r in plan)
