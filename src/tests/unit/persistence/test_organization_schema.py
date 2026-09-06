#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0009 — the organizational tables (ORG-01).

This is the first schema in CuePoint holding data that exists nowhere else. A
track can be re-imported from the XML; a rating, a note, a tag and a Collection
cannot be re-derived from anything at all. So the tests here are less about
"does the column exist" and more about the three ways this schema could quietly
destroy something:

1. **A cascade that reaches too far.** Deleting a Collection must delete its
   entries and no tracks; deleting a tag must delete its assignments and no
   tracks. Those two assertions are the most valuable lines in this file.
2. **A cascade that does not reach far enough.** A track removed by a refresh
   (DEC-003) must take its metadata, tags and memberships with it, or the
   database keeps rows pointing at nothing.
3. **A constraint that makes the common operation wrong.** ``position`` on
   ``collection_tracks`` is indexed and *not* unique on purpose (see the
   migration's docstring); a swap of two entries has to be expressible in one
   statement without a renumbering dance. That is asserted here rather than
   left as a comment, because "while we are here" would otherwise make it
   unique one day and nothing would fail until a user reordered a Collection.

The upgrade path is tested with real rows written at version 8, because a
migration that works on an empty database and loses data on a full one is the
only kind that matters.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

ORG_TABLES = (
    "track_metadata",
    "tags",
    "track_tags",
    "collections",
    "collection_tracks",
)

#: Every index this migration creates. Each one is on a column referencing
#: another table — which is what makes the cascades affordable — or is the
#: unique constraint on tag names.
ORG_INDEXES = (
    "idx_tags_name",
    "idx_track_tags_tag",
    "idx_collections_parent",
    "idx_collection_tracks_collection",
    "idx_collection_tracks_track",
)

#: Deliberately not indexed: a query nobody has written cannot be measured, and
#: LIBUI-01 already built six single-column indexes, measured them and deleted
#: them again. Named here so "while we are here" meets a test.
DELIBERATELY_UNINDEXED = (
    "idx_track_metadata_favorite",
    "idx_track_metadata_rating",
    "idx_tags_category",
    "idx_track_history_batch",
)

_PRE_0009_HISTORY_INSERT = (
    "INSERT INTO track_history"
    " (track_id, field, old_value_json, new_value_json, source, changed_at)"
    " VALUES (?, ?, ?, ?, ?, ?)"
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
def track(db) -> int:
    """One persisted track, to hang CuePoint's own data off."""
    repo = TrackRepository(db)
    stored = repo.add(
        LibraryTrack(
            rekordbox_track_id="1",
            file_path="/m/1.mp3",
            title="A Track",
            artist="An Artist",
        )
    )
    assert stored.id is not None
    return int(stored.id)


def table_names(service) -> set:
    rows = service.connect().execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
    return {row["name"] for row in rows}


def index_names(service) -> set:
    rows = service.connect().execute(
        "SELECT name FROM sqlite_master WHERE type = 'index'"
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


def columns_of(service, table: str) -> set:
    rows = service.connect().execute(f"PRAGMA table_info({table})")
    return {row["name"] for row in rows}


def count(service, sql: str, params=()) -> int:
    row = service.connect().execute(sql, params).fetchone()
    return int(row[0])


def make_collection(service, name="Warmups", kind="collection", parent_id=None) -> int:
    with service.transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO collections"
            " (parent_id, kind, name, position, depth, created_at, updated_at)"
            " VALUES (?, ?, ?, 0, 0, 'now', 'now')",
            (parent_id, kind, name),
        )
        return int(cursor.lastrowid)


def make_tag(service, name="Peak-time") -> int:
    with service.transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO tags (name, created_at) VALUES (?, 'now')", (name,)
        )
        return int(cursor.lastrowid)


def add_entry(service, collection_id: int, track_id: int, position: int) -> int:
    with service.transaction() as conn:
        cursor = conn.execute(
            "INSERT INTO collection_tracks"
            " (collection_id, track_id, position, added_at)"
            " VALUES (?, ?, ?, 'now')",
            (collection_id, track_id, position),
        )
        return int(cursor.lastrowid)


class TestMigration:
    def test_it_is_discovered_as_version_nine(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert 9 in by_version
        assert by_version[9].module_name == "m0009_organization"

    def test_a_fresh_database_ends_at_version_nine_or_later(self, db):
        assert MigrationRunner(db).current_version() >= 9

    def test_every_table_exists(self, db):
        assert set(ORG_TABLES) <= table_names(db)

    def test_every_index_exists(self, db):
        assert set(ORG_INDEXES) <= index_names(db)

    def test_the_earlier_tables_survive(self, db):
        assert {
            "tracks",
            "jobs",
            "activity_events",
            "track_history",
            "library_source",
            "rekordbox_playlists",
            "rekordbox_playlist_tracks",
        } <= table_names(db)

    def test_nothing_speculative_is_indexed(self, db):
        # ORG-02, ORG-03, ORG-05 and ORG-07 add these against the queries that
        # need them, with a measurement — the discipline LIBUI-01 paid for.
        assert set(DELIBERATELY_UNINDEXED).isdisjoint(index_names(db))

    def test_every_index_is_on_a_referencing_column_or_a_constraint(self, db):
        # The justification for each index, asserted rather than trusted to a
        # docstring: a new index here has to be able to say which cascade or
        # constraint it serves.
        assert index_sql(db, "idx_tags_name").upper().startswith("CREATE UNIQUE")
        for name, column in (
            ("idx_track_tags_tag", "tag_id"),
            ("idx_collections_parent", "parent_id"),
            ("idx_collection_tracks_collection", "collection_id"),
            ("idx_collection_tracks_track", "track_id"),
        ):
            assert column in index_sql(db, name)

    def test_track_history_gains_a_batch_id(self, db):
        assert "batch_id" in columns_of(db, "track_history")

    def test_the_columns_are_the_ones_the_phase_needs(self, db):
        assert columns_of(db, "track_metadata") == {
            "track_id",
            "rating",
            "favorite",
            "notes",
            "created_at",
            "updated_at",
        }
        assert columns_of(db, "tags") == {
            "id",
            "name",
            "category",
            "colour",
            "created_at",
        }
        assert columns_of(db, "collections") == {
            "id",
            "parent_id",
            "kind",
            "name",
            "position",
            "depth",
            "rules_json",
            "sort_field",
            "sort_dir",
            "frozen_from_id",
            "frozen_at",
            "created_at",
            "updated_at",
        }
        assert columns_of(db, "collection_tracks") == {
            "id",
            "collection_id",
            "track_id",
            "position",
            "added_at",
        }


class TestUpgradingARealDatabase:
    """The only migration test that matters: one with data in it."""

    @pytest.fixture
    def populated_v8(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "upgrade.db")
        MigrationRunner(service, migrations=_migrations_up_to(8)).migrate()

        repo = TrackRepository(service)
        repo.add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/m/{i}.mp3",
                    title=f"T{i}",
                    artist="An Artist",
                    rating=i % 6,
                )
                for i in range(1, 26)
            ]
        )
        first_id = (
            service.connect()
            .execute("SELECT id FROM tracks ORDER BY id LIMIT 1")
            .fetchone()["id"]
        )
        with service.transaction() as conn:
            conn.execute(
                _PRE_0009_HISTORY_INSERT,
                (first_id, "genre", '"House"', '"Techno"', "cuepoint", "then"),
            )
        yield service
        service.close_all()

    def test_it_applies(self, populated_v8):
        applied = MigrationRunner(populated_v8).migrate()
        assert 9 in [m.version for m in applied]

    def test_no_track_is_lost(self, populated_v8):
        MigrationRunner(populated_v8).migrate()
        assert count(populated_v8, "SELECT count(*) FROM tracks") == 25

    def test_no_history_row_is_lost(self, populated_v8):
        MigrationRunner(populated_v8).migrate()
        assert count(populated_v8, "SELECT count(*) FROM track_history") == 1

    def test_an_existing_history_row_reads_as_not_part_of_a_batch(self, populated_v8):
        MigrationRunner(populated_v8).migrate()
        row = (
            populated_v8.connect()
            .execute("SELECT batch_id FROM track_history")
            .fetchone()
        )
        assert row["batch_id"] is None

    def test_the_imported_rating_is_untouched(self, populated_v8):
        # The column DEC-057 says CuePoint never writes. It is worth checking
        # that adding CuePoint's own layer did not disturb Rekordbox's.
        MigrationRunner(populated_v8).migrate()
        row = (
            populated_v8.connect()
            .execute("SELECT rating FROM tracks WHERE rekordbox_track_id = '4'")
            .fetchone()
        )
        assert row["rating"] == 4

    def test_an_upgraded_database_has_the_same_schema_as_a_fresh_one(
        self, populated_v8, db
    ):
        MigrationRunner(populated_v8).migrate()

        def schema(service):
            rows = service.connect().execute(
                "SELECT type, name, sql FROM sqlite_master"
                " WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
            )
            return [(r["type"], r["name"], r["sql"]) for r in rows]

        assert schema(populated_v8) == schema(db)


class TestTheKindDiscriminator:
    @pytest.mark.parametrize("kind", ["folder", "collection", "smart"])
    def test_the_three_kinds_are_accepted(self, db, kind):
        assert make_collection(db, name=f"a {kind}", kind=kind) > 0

    def test_a_fourth_kind_is_refused(self, db):
        # m0006's reasoning, applied again: a typo in a discriminator would
        # otherwise sit in the database until something quietly failed to find
        # a folder.
        with pytest.raises(sqlite3.IntegrityError):
            make_collection(db, kind="playlist")


class TestPositionIsNotUnique:
    """DEC-058's ordering, and the constraint deliberately not written."""

    def test_the_membership_index_is_not_unique(self, db):
        assert "UNIQUE" not in index_sql(db, "idx_collection_tracks_collection").upper()

    def test_two_entries_can_swap_places_in_one_statement(self, db, track):
        collection = make_collection(db)
        first = add_entry(db, collection, track, 0)
        second = add_entry(db, collection, track, 1)

        # The operation a unique index would have made impossible: halfway
        # through this statement both rows hold the same position.
        with db.transaction() as conn:
            conn.execute(
                "UPDATE collection_tracks SET position = 1 - position"
                " WHERE collection_id = ?",
                (collection,),
            )

        positions = {
            row["id"]: row["position"]
            for row in db.connect().execute(
                "SELECT id, position FROM collection_tracks WHERE collection_id = ?",
                (collection,),
            )
        }
        assert positions == {first: 1, second: 0}

    def test_a_track_can_be_in_a_collection_twice(self, db, track):
        # DEC-058, in one assertion. Each entry has its own id, which is what
        # makes "remove this one" a well-formed request.
        collection = make_collection(db)
        first = add_entry(db, collection, track, 0)
        second = add_entry(db, collection, track, 1)
        assert first != second
        assert (
            count(
                db,
                "SELECT count(*) FROM collection_tracks WHERE collection_id = ?",
                (collection,),
            )
            == 2
        )

    def test_removing_one_entry_leaves_the_other(self, db, track):
        collection = make_collection(db)
        first = add_entry(db, collection, track, 0)
        add_entry(db, collection, track, 1)
        with db.transaction() as conn:
            conn.execute("DELETE FROM collection_tracks WHERE id = ?", (first,))
        assert (
            count(
                db,
                "SELECT count(*) FROM collection_tracks WHERE collection_id = ?",
                (collection,),
            )
            == 1
        )


class TestTagNamesAreOneNamespace:
    def test_the_name_index_is_unique_and_case_insensitive(self, db):
        sql = index_sql(db, "idx_tags_name").upper()
        assert "UNIQUE" in sql
        assert "COLLATE NOCASE" in sql

    def test_the_same_name_in_another_case_is_refused(self, db):
        make_tag(db, "Peak-time")
        with pytest.raises(sqlite3.IntegrityError):
            make_tag(db, "peak-time")

    def test_a_track_carries_a_tag_once(self, db, track):
        tag = make_tag(db)
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO track_tags (track_id, tag_id, created_at)"
                " VALUES (?, ?, 'now')",
                (track, tag),
            )
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO track_tags (track_id, tag_id, created_at)"
                    " VALUES (?, ?, 'now')",
                    (track, tag),
                )


class TestCascadesReachExactlyFarEnough:
    """What happens when the thing on the other end goes away."""

    @pytest.fixture
    def furnished(self, db, track):
        """A track with everything CuePoint can attach to it."""
        tag = make_tag(db)
        collection = make_collection(db)
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO track_metadata"
                " (track_id, rating, favorite, notes, created_at, updated_at)"
                " VALUES (?, 5, 1, 'a note', 'now', 'now')",
                (track,),
            )
            conn.execute(
                "INSERT INTO track_tags (track_id, tag_id, created_at)"
                " VALUES (?, ?, 'now')",
                (track, tag),
            )
        add_entry(db, collection, track, 0)
        return {"track": track, "tag": tag, "collection": collection}

    def test_foreign_keys_are_enforced_on_this_connection(self, db):
        # Every assertion in this class is worthless without it.
        row = db.connect().execute("PRAGMA foreign_keys").fetchone()
        assert row[0] == 1

    def test_deleting_a_track_takes_its_cuepoint_data_with_it(self, db, furnished):
        # DEC-003's deletion, and exactly the loss DEC-011's warning announces
        # before it happens.
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (furnished["track"],))
        assert count(db, "SELECT count(*) FROM track_metadata") == 0
        assert count(db, "SELECT count(*) FROM track_tags") == 0
        assert count(db, "SELECT count(*) FROM collection_tracks") == 0
        # The tag itself and the Collection are not the track's to take.
        assert count(db, "SELECT count(*) FROM tags") == 1
        assert count(db, "SELECT count(*) FROM collections") == 1

    def test_deleting_a_collection_deletes_no_tracks(self, db, furnished):
        # The worst possible bug in this phase, asserted directly.
        with db.transaction() as conn:
            conn.execute(
                "DELETE FROM collections WHERE id = ?", (furnished["collection"],)
            )
        assert count(db, "SELECT count(*) FROM tracks") == 1
        assert count(db, "SELECT count(*) FROM collection_tracks") == 0

    def test_deleting_a_tag_deletes_no_tracks(self, db, furnished):
        with db.transaction() as conn:
            conn.execute("DELETE FROM tags WHERE id = ?", (furnished["tag"],))
        assert count(db, "SELECT count(*) FROM tracks") == 1
        assert count(db, "SELECT count(*) FROM track_tags") == 0

    def test_deleting_a_folder_takes_its_subtree(self, db, track):
        top = make_collection(db, name="Sets", kind="folder")
        inner = make_collection(db, name="2026", kind="folder", parent_id=top)
        leaf = make_collection(db, name="March", parent_id=inner)
        add_entry(db, leaf, track, 0)

        with db.transaction() as conn:
            conn.execute("DELETE FROM collections WHERE id = ?", (top,))

        assert count(db, "SELECT count(*) FROM collections") == 0
        assert count(db, "SELECT count(*) FROM collection_tracks") == 0
        assert count(db, "SELECT count(*) FROM tracks") == 1

    def test_metadata_cannot_point_at_a_track_that_is_not_there(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO track_metadata"
                    " (track_id, favorite, created_at, updated_at)"
                    " VALUES (9999, 0, 'now', 'now')"
                )

    def test_an_entry_cannot_point_at_a_collection_that_is_not_there(self, db, track):
        with pytest.raises(sqlite3.IntegrityError):
            add_entry(db, 9999, track, 0)


class TestFrozenProvenanceOutlivesItsSource:
    """DEC-061 makes a freeze a copy, not a link."""

    def test_deleting_the_smart_collection_leaves_the_frozen_one(self, db):
        with db.transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO collections"
                " (kind, name, position, depth, rules_json, created_at, updated_at)"
                " VALUES ('smart', 'Recent house', 0, 0, '{}', 'now', 'now')"
            )
            smart = int(cursor.lastrowid)
            conn.execute(
                "INSERT INTO collections"
                " (kind, name, position, depth, frozen_from_id, frozen_at,"
                "  created_at, updated_at)"
                " VALUES ('collection', 'Recent house (frozen)', 1, 0, ?, 'now',"
                "  'now', 'now')",
                (smart,),
            )
            conn.execute("DELETE FROM collections WHERE id = ?", (smart,))

        row = (
            db.connect()
            .execute("SELECT name, frozen_from_id FROM collections")
            .fetchone()
        )
        assert row["name"] == "Recent house (frozen)"
        # Provenance survives the disappearance it exists to survive.
        assert row["frozen_from_id"] is not None
