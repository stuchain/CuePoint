#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0008 — the facet indexes (LIBUI-02).

The collation is the thing worth guarding. A facet groups by
``column COLLATE NOCASE``, and SQLite uses an index only when its collation
matches the query's — so an index declared without it is read straight past.
Nothing about the result changes: the same values, the same counts, five times
the time. That failure has no symptom a test of behaviour could catch, so it is
caught twice here, once in the declaration and once in the query plan.

The second thing worth pinning is the *absence* of indexes on artist, album and
remixer. Those were left out on purpose (see the migration's docstring), and a
test that says so is what stops "while we are here" from putting them back
without measuring.
"""

from __future__ import annotations

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_query import (
    BrowseQuery,
    build_facet_value_count,
    build_facet_values,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

#: The indexes migration 0008 creates, and the collation each needs.
TEXT_FACET_INDEXES = {
    "idx_tracks_genre_facet": "genre",
    "idx_tracks_key_facet": "key",
    "idx_tracks_colour_facet": "colour",
    "idx_tracks_label_facet": "label",
}

NUMERIC_FACET_INDEXES = {
    "idx_tracks_year_facet": "year",
    "idx_tracks_rating_facet": "rating",
    "idx_tracks_bitrate_facet": "bitrate",
}

#: Left unindexed deliberately: long tails, offered as a searchable list.
UNINDEXED_FACET_FIELDS = ("artist", "album", "remixer")

_PRE_0008_INSERT = (
    "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
    " title, artist, genre, created_at, updated_at)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
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
def seeded(db) -> TrackRepository:
    """Enough rows that SQLite has a reason to prefer an index."""
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist=f"Artist {i % 50}",
                genre=("House", "Techno", "Minimal")[i % 3],
                key=f"{(i % 12) + 1}A",
                label=f"Label {i % 20}",
                rating=i % 6,
                year=2000 + (i % 25),
            )
            for i in range(1, 2001)
        ]
    )
    db.connect().execute("ANALYZE")
    return repo


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


def plan(service, sql: str, params) -> str:
    rows = service.connect().execute(f"EXPLAIN QUERY PLAN {sql}", params).fetchall()
    return " | ".join(str(row["detail"]) for row in rows)


class TestMigration:
    def test_it_is_discovered_as_version_eight(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert 8 in by_version
        assert by_version[8].module_name == "m0008_facet_indexes"

    def test_a_fresh_database_ends_at_version_eight_or_later(self, db):
        assert MigrationRunner(db).current_version() >= 8

    def test_every_facet_index_exists(self, db):
        expected = set(TEXT_FACET_INDEXES) | set(NUMERIC_FACET_INDEXES)
        assert expected <= index_names(db)

    def test_the_earlier_indexes_survive(self, db):
        assert {
            "idx_tracks_rekordbox_track_id",
            "idx_tracks_normalized_path",
            "idx_tracks_artist_title",
        } <= index_names(db)


class TestCollation:
    @pytest.mark.parametrize("name", sorted(TEXT_FACET_INDEXES))
    def test_text_facet_indexes_declare_nocase(self, db, name):
        # Without this the index exists, the query is correct, and it is five
        # times slower with nothing to say why.
        assert "COLLATE NOCASE" in index_sql(db, name).upper()

    @pytest.mark.parametrize("name,column", sorted(TEXT_FACET_INDEXES.items()))
    def test_text_facet_indexes_cover_their_column(self, db, name, column):
        assert column in index_sql(db, name).lower()

    @pytest.mark.parametrize("name", sorted(NUMERIC_FACET_INDEXES))
    def test_numeric_facet_indexes_have_no_collation(self, db, name):
        assert "COLLATE" not in index_sql(db, name).upper()


class TestTheyAreActuallyUsed:
    @pytest.mark.parametrize("field", ["genre", "key", "label", "colour"])
    def test_a_text_facet_reads_the_index_and_does_not_group_by_hand(
        self, seeded, db, field
    ):
        sql, params = build_facet_values(BrowseQuery(), field)
        detail = plan(db, sql, params)
        assert f"idx_tracks_{field}_facet" in detail
        # "USE TEMP B-TREE FOR GROUP BY" means SQLite read and sorted the whole
        # library instead — which is the cost this migration exists to remove.
        assert "TEMP B-TREE FOR GROUP BY" not in detail.upper()

    @pytest.mark.parametrize("field", ["rating", "year"])
    def test_a_numeric_facet_reads_the_index(self, seeded, db, field):
        sql, params = build_facet_values(BrowseQuery(), field)
        detail = plan(db, sql, params)
        assert f"idx_tracks_{field}_facet" in detail
        assert "TEMP B-TREE FOR GROUP BY" not in detail.upper()

    def test_the_totals_query_reads_the_index_too(self, seeded, db):
        sql, params = build_facet_value_count(BrowseQuery(), "genre")
        detail = plan(db, sql, params)
        assert "idx_tracks_genre_facet" in detail
        assert "TEMP B-TREE FOR GROUP BY" not in detail.upper()


class TestThePlanChoice:
    """The index is a win with nothing else to filter by and a loss with
    anything else — measured, and chosen here rather than left to the planner.
    See ``_facet_table``'s docstring for the numbers."""

    def test_an_unfiltered_facet_reads_the_index(self, seeded, db):
        sql, params = build_facet_values(BrowseQuery(), "genre")
        assert "NOT INDEXED" not in sql
        assert "idx_tracks_genre_facet" in plan(db, sql, params)

    def test_a_filtered_facet_scans_instead(self, seeded, db):
        query = BrowseQuery(rules=RuleSet(rules=(FilterRule("rating", "gte", 3),)))
        sql, params = build_facet_values(query, "genre")
        assert "NOT INDEXED" in sql
        # Every index entry would otherwise need its row fetched to test the
        # rating: fifty thousand random reads instead of one pass.
        assert "idx_tracks_genre_facet" not in plan(db, sql, params)

    def test_a_text_query_counts_as_a_filter(self, seeded, db):
        sql, _ = build_facet_values(BrowseQuery(query="Artist 3"), "genre")
        assert "NOT INDEXED" in sql

    def test_both_facet_queries_agree_about_the_plan(self, seeded):
        query = BrowseQuery(rules=RuleSet(rules=(FilterRule("rating", "gte", 3),)))
        values_sql, _ = build_facet_values(query, "genre")
        totals_sql, _ = build_facet_value_count(query, "genre")
        assert ("NOT INDEXED" in values_sql) == ("NOT INDEXED" in totals_sql)

    def test_the_choice_does_not_change_the_answer(self, seeded):
        # The rule is about speed only. A facet under a filter must still count
        # exactly what a filter finds.
        query = BrowseQuery(rules=RuleSet(rules=(FilterRule("rating", "gte", 3),)))
        for value in seeded.facet_values(query, "genre").values:
            clause = (
                FilterRule("genre", "is_empty")
                if value.value is None
                else FilterRule("genre", "is", value.value)
            )
            combined = BrowseQuery(
                rules=RuleSet(rules=(FilterRule("rating", "gte", 3), clause))
            )
            assert seeded.browse_count(combined) == value.count


class TestDeliberateAbsences:
    @pytest.mark.parametrize("field", UNINDEXED_FACET_FIELDS)
    def test_long_tail_fields_have_no_facet_index(self, db, field):
        # Left out on purpose: 900 artists in a 50,000-track library is a
        # searchable list, not a set of choices, and the index would be the
        # largest in the database for the least-used question. Adding one is a
        # decision to make with a measurement, not in passing.
        assert f"idx_tracks_{field}_facet" not in index_names(db)

    @pytest.mark.parametrize("field", UNINDEXED_FACET_FIELDS)
    def test_their_facets_still_answer(self, seeded, field):
        # No index does not mean no facet: it means a slower one.
        assert seeded.facet_values(field=field).total_values > 0


class TestExistingData:
    @pytest.fixture
    def populated_v7(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "populated.db")
        MigrationRunner(service, migrations=_migrations_up_to(7)).migrate()
        with service.transaction() as conn:
            conn.executemany(
                _PRE_0008_INSERT,
                [
                    (
                        str(i),
                        f"/m/{i}.mp3",
                        f"/m/{i}.mp3",
                        f"T{i}",
                        "A",
                        "House",
                        "t",
                        "t",
                    )
                    for i in range(1, 51)
                ],
            )
        yield service
        service.close_all()

    def test_it_applies_to_a_populated_database(self, populated_v7):
        applied = MigrationRunner(populated_v7).migrate()
        assert 8 in [m.version for m in applied]

    def test_no_row_is_lost(self, populated_v7):
        MigrationRunner(populated_v7).migrate()
        row = (
            populated_v7.connect()
            .execute("SELECT count(*) AS n FROM tracks")
            .fetchone()
        )
        assert row["n"] == 50

    def test_the_facet_finds_the_rows_that_were_already_there(self, populated_v7):
        MigrationRunner(populated_v7).migrate()
        facet = TrackRepository(populated_v7).facet_values(field="genre")
        assert [(v.value, v.count) for v in facet.values] == [("House", 50)]
