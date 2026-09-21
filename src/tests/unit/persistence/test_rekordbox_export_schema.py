#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0020 — the export record (EXPORT-03, DEC-086).

Forward-only DDL under user data, so these are about the ways two additive
tables could quietly go wrong rather than about whether a column exists:

1. **A reference that outlives what it names.** The record has to survive the
   Collection it describes being renamed, refiled or deleted, and the tracks it
   counted being removed by a refresh. ``collection_id`` is deliberately not a
   foreign key, and the tests that delete a Collection and a track out from
   under a record are what pin that.
2. **A cascade that reaches exactly as far as it should.** A playlist row means
   nothing without its export, so it goes with it — and nothing else does.
3. **A count that claims something nobody checked.** DEC-088 says a library
   that has never been file-checked reports so rather than reporting zero, so
   ``missing_file_count`` is nullable and carries no default. A ``NOT NULL
   DEFAULT 0`` here would make the claim the decision refuses.
4. **A vocabulary that drifts from its model.** Each CHECK is read back out of
   ``sqlite_master`` and compared with the constants the models validate
   against, as ``test_clean_schema`` does.
5. **A vocabulary restated where it should have been reused.** DEC-089 keeps the
   three key notations in one place and says the export validates against it
   rather than restating it. Nothing here may hold a second copy, and every
   notation that vocabulary holds has to be storable.
6. **A per-track table.** DEC-086 refuses one; a test asserts nothing this
   migration added references ``tracks``.

The upgrade is tested with a version-19 database holding real tracks,
overrides, Collections, entries, attempts, candidates and match state, and
every row is compared before and after.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    KIND_SMART,
    Collection,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_export import (
    EXPORT_CANCELLED,
    EXPORT_FAILED,
    EXPORT_OUTCOMES,
    EXPORT_WRITTEN,
    EXPORTED_KINDS,
    RekordboxExport,
    RekordboxExportPlaylist,
)
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_write_options import KEY_FORMATS

NOW = "2026-09-20T12:00:00+00:00"

#: The two tables this migration adds.
EXPORT_TABLES = ("rekordbox_exports", "rekordbox_export_playlists")

#: Every column of each, in the order the migration declares them.
EXPORT_COLUMNS = (
    "id",
    "job_id",
    "started_at",
    "finished_at",
    "outcome",
    "destination_path",
    "source_path",
    "source_stale",
    "track_count",
    "changed_track_count",
    "fields_json",
    "key_format",
    "missing_file_count",
    "dropped_reference_count",
    "error",
)

PLAYLIST_COLUMNS = (
    "id",
    "export_id",
    "collection_id",
    "kind",
    "name",
    "path",
    "entry_count",
    "dropped_count",
    "rules_json",
)

RULES = json.dumps(
    {"match": "all", "rules": [{"field": "bpm", "operator": "gte", "value": 124}]}
)

FIELDS = json.dumps(["key", "bpm", "genre", "label", "year", "rating"])


# --------------------------------------------------------------------- helpers


def _migrations_up_to(version: int):
    return [m for m in discover_migrations() if m.version <= version]


@pytest.fixture
def db(tmp_path):
    """A library at the shipped schema version."""
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def count(service, sql: str, params: Iterable[Any] = ()) -> int:
    return int(service.connect().execute(sql, tuple(params)).fetchone()[0])


def columns_of(service, table: str) -> List[str]:
    return [
        row["name"] for row in service.connect().execute(f"PRAGMA table_info({table})")
    ]


def table_sql(service, table: str) -> str:
    row = (
        service.connect()
        .execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        )
        .fetchone()
    )
    assert row is not None, f"no table {table}"
    return str(row["sql"])


def insert(service, table: str, row: Dict[str, Any]) -> int:
    """Insert a row as given, leaving an unset ``id`` to the database."""
    data = {k: v for k, v in row.items() if not (k == "id" and v is None)}
    names = ", ".join(data)
    marks = ", ".join("?" for _ in data)
    with service.transaction() as conn:
        cursor = conn.execute(
            f"INSERT INTO {table} ({names}) VALUES ({marks})", tuple(data.values())
        )
        return int(cursor.lastrowid)


def export_row(**overrides: Any) -> Dict[str, Any]:
    """A raw ``rekordbox_exports`` row the table accepts.

    Raw rather than built from a model, so a test can set a column to a value
    the model would have refused and see what the *schema* does.
    """
    row = dict(
        job_id="job-1",
        started_at=NOW,
        finished_at=NOW,
        outcome="written",
        destination_path="/exports/library.xml",
        source_path="/rekordbox/collection.xml",
        source_stale=0,
        track_count=50,
        changed_track_count=12,
        fields_json=FIELDS,
        key_format="camelot",
        missing_file_count=3,
        dropped_reference_count=1,
        error=None,
    )
    row.update(overrides)
    return row


def playlist_row(export_id: int, **overrides: Any) -> Dict[str, Any]:
    """A raw ``rekordbox_export_playlists`` row the table accepts."""
    row = dict(
        export_id=export_id,
        collection_id=7,
        kind="collection",
        name="Saturday",
        path="CuePoint/Gigs/Saturday",
        entry_count=24,
        dropped_count=0,
        rules_json=None,
    )
    row.update(overrides)
    return row


def add_export(service, **overrides: Any) -> int:
    return insert(service, "rekordbox_exports", export_row(**overrides))


def add_playlist(service, export_id: int, **overrides: Any) -> int:
    return insert(
        service, "rekordbox_export_playlists", playlist_row(export_id, **overrides)
    )


def check_vocabulary(service, table: str, column: str) -> Set[str]:
    """The values a CHECK allows, read out of the stored DDL."""
    match = re.search(
        rf"\b{column}\b[^,]*?CHECK\s*\(\s*{column}\s+IN\s*\(([^)]*)\)\s*\)",
        table_sql(service, table),
        re.DOTALL,
    )
    assert match, f"no CHECK on {table}.{column}"
    return {token.strip().strip("'") for token in match.group(1).split(",")}


def indexes_on(service, table: str) -> Dict[str, Dict[str, Any]]:
    """Every index on a table: its origin and its columns in order."""
    connection = service.connect()
    found: Dict[str, Dict[str, Any]] = {}
    for row in connection.execute(f"PRAGMA index_list({table})"):
        info = connection.execute(f"PRAGMA index_info('{row['name']}')").fetchall()
        found[row["name"]] = {
            "origin": row["origin"],
            "unique": bool(row["unique"]),
            "columns": [r["name"] for r in sorted(info, key=lambda r: r["seqno"])],
        }
    return found


def foreign_keys_of(service, table: str) -> Dict[str, Dict[str, str]]:
    """Each referencing column, what it references and what a delete does."""
    return {
        row["from"]: {
            "table": row["table"],
            "to": row["to"],
            "on_delete": row["on_delete"],
        }
        for row in service.connect().execute(f"PRAGMA foreign_key_list({table})")
    }


def snapshot(service) -> Dict[str, List[Dict[str, Any]]]:
    """Every row of every table, in a comparable order."""
    connection = service.connect()
    tables = [
        row["name"]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
            " AND name NOT LIKE 'sqlite_%'"
        )
    ]
    return {
        table: sorted(
            (dict(row) for row in connection.execute(f"SELECT * FROM {table}")),
            key=repr,
        )
        for table in tables
    }


def schema(service):
    rows = service.connect().execute(
        "SELECT type, name, sql FROM sqlite_master"
        " WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )
    return [(r["type"], r["name"], r["sql"]) for r in rows]


# ------------------------------------------------------------------- the shape


@pytest.mark.unit
class TestTheMigration:
    def test_it_is_discovered_as_version_twenty(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[20].module_name == "m0020_rekordbox_exports"

    def test_a_fresh_database_ends_at_version_twenty_or_later(self, db):
        assert MigrationRunner(db).current_version() >= 20

    def test_both_tables_exist_with_every_column_the_record_needs(self, db):
        assert columns_of(db, "rekordbox_exports") == list(EXPORT_COLUMNS)
        assert columns_of(db, "rekordbox_export_playlists") == list(PLAYLIST_COLUMNS)

    def test_each_model_is_exactly_its_table(self, db):
        """A column the model does not carry is a column nothing can write."""
        for model, table in (
            (RekordboxExport, "rekordbox_exports"),
            (RekordboxExportPlaylist, "rekordbox_export_playlists"),
        ):
            stored = model.__dataclass_fields__
            assert set(columns_of(db, table)) == set(stored), table

    def test_an_id_is_its_own_rowid_so_the_newest_export_is_the_last_row(self, db):
        """DEC-083 pre-fills from the most recent export; that is the last id."""
        first = add_export(db)
        second = add_export(db, destination_path="/exports/second.xml")
        assert second > first
        newest = (
            db.connect()
            .execute(
                "SELECT destination_path FROM rekordbox_exports ORDER BY id DESC LIMIT 1"
            )
            .fetchone()
        )
        assert newest["destination_path"] == "/exports/second.xml"

    def test_an_id_is_never_reused_after_a_delete(self, db):
        """``AUTOINCREMENT``: a deleted export's id must not name a later one."""
        first = add_export(db)
        with db.transaction() as conn:
            conn.execute("DELETE FROM rekordbox_exports WHERE id = ?", (first,))
        assert add_export(db) > first

    def test_the_playlist_index_is_on_the_referencing_column(self, db):
        found = indexes_on(db, "rekordbox_export_playlists")
        by_columns = {
            name: info["columns"]
            for name, info in found.items()
            if info["origin"] == "c"
        }
        assert by_columns == {"idx_rekordbox_export_playlists_export": ["export_id"]}

    def test_the_export_table_is_not_indexed_speculatively(self, db):
        """Nothing reads these yet; an index is a query a later step measures."""
        created = [
            name
            for name, info in indexes_on(db, "rekordbox_exports").items()
            if info["origin"] == "c"
        ]
        assert created == []

    def test_a_parent_delete_finds_its_children_without_a_scan(self, db):
        plan = (
            db.connect()
            .execute(
                "EXPLAIN QUERY PLAN SELECT 1 FROM rekordbox_export_playlists"
                " WHERE export_id = 1"
            )
            .fetchall()
        )
        assert any(
            "idx_rekordbox_export_playlists_export" in str(row["detail"])
            for row in plan
        )

    def test_foreign_keys_are_enforced_on_this_connection(self, db):
        enabled = db.connect().execute("PRAGMA foreign_keys").fetchone()[0]
        assert enabled == 1


@pytest.mark.unit
class TestTheReferences:
    def test_a_playlist_row_belongs_to_its_export_and_cascades(self, db):
        assert foreign_keys_of(db, "rekordbox_export_playlists")["export_id"] == {
            "table": "rekordbox_exports",
            "to": "id",
            "on_delete": "CASCADE",
        }

    def test_a_playlist_row_references_nothing_else(self, db):
        """``collection_id`` is text-adjacent bookkeeping, not a reference."""
        assert set(foreign_keys_of(db, "rekordbox_export_playlists")) == {"export_id"}

    def test_an_export_references_nothing_at_all(self, db):
        assert foreign_keys_of(db, "rekordbox_exports") == {}

    def test_a_playlist_row_cannot_name_an_export_that_is_not_there(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            add_playlist(db, 9999)

    def test_there_is_no_per_track_table(self, db):
        """DEC-086: no per-track export state, so nothing here names a track."""
        for table in EXPORT_TABLES:
            assert "track_id" not in columns_of(db, table), table
            assert "tracks" not in {
                fk["table"] for fk in foreign_keys_of(db, table).values()
            }, table


# ------------------------------------------------------------- the vocabularies


@pytest.mark.unit
class TestTheVocabularies:
    def test_the_outcome_check_says_what_the_model_says(self, db):
        assert check_vocabulary(db, "rekordbox_exports", "outcome") == set(
            EXPORT_OUTCOMES
        )

    def test_the_kind_check_says_what_the_model_says(self, db):
        assert check_vocabulary(db, "rekordbox_export_playlists", "kind") == set(
            EXPORTED_KINDS
        )

    def test_a_folder_is_not_an_exported_playlist(self, db):
        """The tree's folders are structure; only these two kinds are rows."""
        assert KIND_FOLDER not in EXPORTED_KINDS
        assert set(EXPORTED_KINDS) == {KIND_COLLECTION, KIND_SMART}
        with pytest.raises(sqlite3.IntegrityError):
            add_playlist(db, add_export(db), kind=KIND_FOLDER)

    @pytest.mark.parametrize("outcome", EXPORT_OUTCOMES)
    def test_every_outcome_in_the_vocabulary_is_accepted(self, db, outcome):
        error = (
            "the destination could not be written" if outcome == EXPORT_FAILED else None
        )
        assert add_export(db, outcome=outcome, error=error) > 0

    @pytest.mark.parametrize("kind", EXPORTED_KINDS)
    def test_every_kind_in_the_vocabulary_is_accepted(self, db, kind):
        rules = RULES if kind == KIND_SMART else None
        assert add_playlist(db, add_export(db), kind=kind, rules_json=rules) > 0

    @pytest.mark.parametrize("value", ["running", "WRITTEN", "", "done"])
    def test_an_outcome_outside_the_vocabulary_is_refused(self, db, value):
        with pytest.raises(sqlite3.IntegrityError):
            add_export(db, outcome=value)

    @pytest.mark.parametrize("value", ["folder", "SMART", "", "playlist"])
    def test_a_kind_outside_the_vocabulary_is_refused(self, db, value):
        with pytest.raises(sqlite3.IntegrityError):
            add_playlist(db, add_export(db), kind=value)

    @pytest.mark.parametrize("value", [2, -1, 100])
    def test_a_staleness_flag_outside_zero_and_one_is_refused(self, db, value):
        with pytest.raises(sqlite3.IntegrityError):
            add_export(db, source_stale=value)

    @pytest.mark.parametrize(
        "column",
        [
            "started_at",
            "outcome",
            "destination_path",
            "source_path",
            "source_stale",
            "track_count",
            "changed_track_count",
            "fields_json",
            "key_format",
            "dropped_reference_count",
        ],
    )
    def test_a_required_export_column_cannot_be_null(self, db, column):
        with pytest.raises(sqlite3.IntegrityError):
            add_export(db, **{column: None})

    @pytest.mark.parametrize(
        "column", ["export_id", "kind", "name", "path", "entry_count", "dropped_count"]
    )
    def test_a_required_playlist_column_cannot_be_null(self, db, column):
        export = add_export(db)
        row = playlist_row(export)
        row[column] = None
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "rekordbox_export_playlists", row)

    @pytest.mark.parametrize(
        "column", ["job_id", "finished_at", "error", "missing_file_count"]
    )
    def test_an_optional_export_column_may_be_absent(self, db, column):
        assert add_export(db, outcome=EXPORT_CANCELLED, **{column: None}) > 0

    @pytest.mark.parametrize("column", ["collection_id", "rules_json"])
    def test_an_optional_playlist_column_may_be_absent(self, db, column):
        assert add_playlist(db, add_export(db), **{column: None}) > 0

    def test_the_three_defaults_are_what_the_migration_says(self, db):
        """A row written without them takes a stale flag of no and no drops."""
        export = insert(
            db,
            "rekordbox_exports",
            dict(
                started_at=NOW,
                outcome=EXPORT_WRITTEN,
                destination_path="/d.xml",
                source_path="/s.xml",
                track_count=1,
                changed_track_count=0,
                fields_json=FIELDS,
                key_format="normal",
            ),
        )
        row = (
            db.connect()
            .execute("SELECT * FROM rekordbox_exports WHERE id = ?", (export,))
            .fetchone()
        )
        assert row["source_stale"] == 0
        assert row["dropped_reference_count"] == 0
        # And the one that is deliberately not defaulted.
        assert row["missing_file_count"] is None

        playlist = insert(
            db,
            "rekordbox_export_playlists",
            dict(
                export_id=export,
                kind=KIND_COLLECTION,
                name="Set",
                path="CuePoint/Set",
                entry_count=0,
            ),
        )
        stored = (
            db.connect()
            .execute(
                "SELECT * FROM rekordbox_export_playlists WHERE id = ?", (playlist,)
            )
            .fetchone()
        )
        assert stored["dropped_count"] == 0


# -------------------------------------------------- the notation is not restated


@pytest.mark.unit
class TestTheKeyNotation:
    """DEC-089 keeps one vocabulary for the three notations, in one place."""

    @pytest.mark.parametrize("key_format", KEY_FORMATS)
    def test_every_notation_the_shared_vocabulary_holds_is_storable(
        self, db, key_format
    ):
        stored = add_export(db, key_format=key_format)
        row = (
            db.connect()
            .execute("SELECT key_format FROM rekordbox_exports WHERE id = ?", (stored,))
            .fetchone()
        )
        assert row["key_format"] == key_format

    def test_the_column_carries_no_check_of_its_own(self, db):
        """A CHECK here would be a restatement in the one place that cannot be
        revised: the schema is forward-only, and DEC-089 may yet add a
        notation."""
        sql = table_sql(db, "rekordbox_exports")
        assert "key_format" in sql
        assert not re.search(r"key_format[^,]*CHECK", sql, re.DOTALL)

    def test_a_notation_added_later_needs_no_migration(self, db):
        """The consequence of the previous test, stated as behaviour."""
        assert add_export(db, key_format="a_notation_invented_next_year") > 0

    def test_the_model_defines_no_vocabulary_of_its_own(self):
        """Two near-identical enums are how a validator receives the other
        one's value (DEC-089's own reason)."""
        import cuepoint.models.rekordbox_export as module

        wanted = set(KEY_FORMATS)
        for name, value in vars(module).items():
            if isinstance(value, (tuple, list, set, frozenset)):
                assert not wanted <= {str(item) for item in value}, name

    def test_the_model_accepts_a_notation_the_vocabulary_may_gain(self):
        """The same as the schema's promise, one layer up: the record stores
        the notation used, and the choice is refused where it is made."""
        record = RekordboxExport(
            started_at=NOW,
            outcome=EXPORT_CANCELLED,
            destination_path="/d.xml",
            source_path="/s.xml",
            track_count=0,
            changed_track_count=0,
            fields_json="[]",
            key_format="a_notation_invented_next_year",
        )
        assert record.key_format == "a_notation_invented_next_year"

    def test_the_model_imports_from_no_layer_but_its_own(self):
        """Why it cannot simply import ``KEY_FORMATS``: every model in this
        package imports from ``cuepoint.models`` and from nowhere else, and
        ``KEY_FORMATS`` lives a layer up in ``services``."""
        import cuepoint.models.rekordbox_export as module

        source = Path(module.__file__).read_text(encoding="utf-8")
        imported = re.findall(r"^from (cuepoint[.\w]*) import", source, re.MULTILINE)
        assert imported, "the model imports nothing from cuepoint at all"
        assert {name.split(".")[1] for name in imported} == {"models"}


# --------------------------------------------------- not checked is not zero


@pytest.mark.unit
class TestNotCheckedIsNotZero:
    """DEC-088: a library nobody has file-checked says so rather than zero."""

    def test_a_never_checked_library_stores_no_count(self, db):
        stored = add_export(db, missing_file_count=None)
        record = RekordboxExport.from_row(
            db.connect()
            .execute("SELECT * FROM rekordbox_exports WHERE id = ?", (stored,))
            .fetchone()
        )
        assert record.missing_file_count is None
        assert record.file_check_known is False

    def test_a_checked_library_with_nothing_missing_stores_zero(self, db):
        stored = add_export(db, missing_file_count=0)
        record = RekordboxExport.from_row(
            db.connect()
            .execute("SELECT * FROM rekordbox_exports WHERE id = ?", (stored,))
            .fetchone()
        )
        assert record.missing_file_count == 0
        assert record.file_check_known is True

    def test_the_two_are_different_rows_and_different_records(self, db):
        """The whole point: a count of zero and no count are not the same fact."""
        unchecked = RekordboxExport.from_row(
            db.connect()
            .execute(
                "SELECT * FROM rekordbox_exports WHERE id = ?",
                (add_export(db, missing_file_count=None),),
            )
            .fetchone()
        )
        checked = RekordboxExport.from_row(
            db.connect()
            .execute(
                "SELECT * FROM rekordbox_exports WHERE id = ?",
                (add_export(db, missing_file_count=0),),
            )
            .fetchone()
        )
        assert unchecked.missing_file_count != checked.missing_file_count


# ------------------------------------------- what a delete takes, and what not


@pytest.mark.unit
class TestDeletingAnExport:
    def test_it_takes_its_playlist_rows(self, db):
        export = add_export(db)
        other = add_export(db, destination_path="/exports/other.xml")
        for index in range(3):
            add_playlist(db, export, name=f"Set {index}", path=f"CuePoint/Set {index}")
        add_playlist(db, other, name="Kept", path="CuePoint/Kept")

        with db.transaction() as conn:
            conn.execute("DELETE FROM rekordbox_exports WHERE id = ?", (export,))

        assert count(db, "SELECT count(*) FROM rekordbox_export_playlists") == 1
        remaining = (
            db.connect()
            .execute("SELECT export_id FROM rekordbox_export_playlists")
            .fetchone()
        )
        assert remaining["export_id"] == other

    def test_deleting_a_playlist_row_leaves_its_export(self, db):
        export = add_export(db)
        playlist = add_playlist(db, export)
        with db.transaction() as conn:
            conn.execute(
                "DELETE FROM rekordbox_export_playlists WHERE id = ?", (playlist,)
            )
        assert count(db, "SELECT count(*) FROM rekordbox_exports") == 1


@pytest.mark.unit
class TestTheRecordOutlivesWhatItNames:
    """The decision this migration turns on: the row records what CuePoint
    wrote, not what still exists."""

    @pytest.fixture
    def recorded(self, db):
        """An export recording one Collection and one Smart Collection."""
        collections = CollectionRepository(db)
        gigs = collections.create(Collection(name="Gigs", kind=KIND_FOLDER))
        saturday = collections.create(
            Collection(name="Saturday", kind=KIND_COLLECTION, parent_id=gigs.id)
        )
        recent = collections.create(
            Collection(name="Recent", kind=KIND_SMART, rules_json=RULES)
        )
        tracks = TrackRepository(db)
        stored = [
            tracks.add(
                LibraryTrack(
                    rekordbox_track_id=str(n),
                    file_path=f"/m/{n}.mp3",
                    title=f"T{n}",
                    artist="An Artist",
                )
            )
            for n in range(1, 4)
        ]
        collections.add(saturday.id, [t.id for t in stored])

        export = add_export(db)
        add_playlist(
            db,
            export,
            collection_id=saturday.id,
            kind=KIND_COLLECTION,
            name="Saturday",
            path="CuePoint/Gigs/Saturday",
            entry_count=3,
        )
        add_playlist(
            db,
            export,
            collection_id=recent.id,
            kind=KIND_SMART,
            name="Recent",
            path="CuePoint/Recent",
            entry_count=2,
            rules_json=RULES,
        )
        return dict(
            export=export,
            saturday=int(saturday.id),
            recent=int(recent.id),
            gigs=int(gigs.id),
            tracks=[int(t.id) for t in stored],
        )

    def test_deleting_a_collection_leaves_both_rows_intact(self, db, recorded):
        assert CollectionRepository(db).delete(recorded["saturday"]) is True

        assert count(db, "SELECT count(*) FROM rekordbox_exports") == 1
        rows = (
            db.connect()
            .execute("SELECT * FROM rekordbox_export_playlists ORDER BY id")
            .fetchall()
        )
        assert len(rows) == 2
        assert rows[0]["collection_id"] == recorded["saturday"]
        assert rows[0]["name"] == "Saturday"
        assert rows[0]["path"] == "CuePoint/Gigs/Saturday"

    def test_deleting_the_folder_above_it_leaves_them_too(self, db, recorded):
        """The cascade takes the Collection with the folder; the record stays."""
        CollectionRepository(db).delete(recorded["gigs"])

        assert (
            count(
                db,
                "SELECT count(*) FROM collections WHERE id = ?",
                (recorded["saturday"],),
            )
            == 0
        )
        assert count(db, "SELECT count(*) FROM rekordbox_export_playlists") == 2

    def test_a_smart_collection_keeps_its_rules_after_it_is_gone(self, db, recorded):
        """DEC-081: the rules are the only thing that can explain the count."""
        CollectionRepository(db).delete(recorded["recent"])

        row = (
            db.connect()
            .execute(
                "SELECT * FROM rekordbox_export_playlists WHERE kind = ?", (KIND_SMART,)
            )
            .fetchone()
        )
        assert json.loads(row["rules_json"]) == json.loads(RULES)
        assert row["entry_count"] == 2

    def test_renaming_a_collection_does_not_rewrite_the_record(self, db, recorded):
        CollectionRepository(db).rename(recorded["saturday"], "Sunday")

        row = (
            db.connect()
            .execute("SELECT name FROM rekordbox_export_playlists ORDER BY id")
            .fetchone()
        )
        assert row["name"] == "Saturday"

    def test_deleting_every_track_it_counted_leaves_both_rows(self, db, recorded):
        """A refresh that removes tracks (DEC-003) must not touch history."""
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks")

        assert count(db, "SELECT count(*) FROM tracks") == 0
        assert count(db, "SELECT count(*) FROM rekordbox_exports") == 1
        assert count(db, "SELECT count(*) FROM rekordbox_export_playlists") == 2
        record = RekordboxExport.from_row(
            db.connect().execute("SELECT * FROM rekordbox_exports").fetchone()
        )
        assert record.track_count == 50


# ------------------------------------------------------------------ the models


@pytest.mark.unit
class TestTheModelsOverRealRows:
    def test_an_export_reads_back_what_was_stored(self, db):
        written = RekordboxExport(
            job_id="job-7",
            started_at=NOW,
            finished_at="2026-09-20T12:00:09+00:00",
            outcome=EXPORT_WRITTEN,
            destination_path="/exports/library.xml",
            source_path="/rekordbox/collection.xml",
            source_stale=True,
            track_count=50_000,
            changed_track_count=1_204,
            fields_json=FIELDS,
            key_format="camelot",
            missing_file_count=17,
            dropped_reference_count=4,
        )
        stored = insert(db, "rekordbox_exports", written.to_dict())
        row = (
            db.connect()
            .execute("SELECT * FROM rekordbox_exports WHERE id = ?", (stored,))
            .fetchone()
        )

        read = RekordboxExport.from_row(row)
        assert read == RekordboxExport(
            **{**written.to_dict(), "id": stored, "source_stale": True}
        )
        assert read.source_stale is True
        assert read.fields == ("key", "bpm", "genre", "label", "year", "rating")
        assert read.wrote_file and read.is_finished and read.file_check_known
        assert read.changed_nothing is False

    @pytest.mark.parametrize("kind", EXPORTED_KINDS)
    def test_a_playlist_row_reads_back_what_was_stored(self, db, kind):
        export = add_export(db)
        written = RekordboxExportPlaylist(
            export_id=export,
            collection_id=12,
            kind=kind,
            name="Saturday",
            path="CuePoint (2)/Gigs/Saturday",
            entry_count=24,
            dropped_count=2,
            rules_json=RULES if kind == KIND_SMART else None,
        )
        stored = insert(db, "rekordbox_export_playlists", written.to_dict())
        row = (
            db.connect()
            .execute("SELECT * FROM rekordbox_export_playlists WHERE id = ?", (stored,))
            .fetchone()
        )

        read = RekordboxExportPlaylist.from_row(row)
        assert read.to_dict() == {**written.to_dict(), "id": stored}
        assert read.requested_count == 26
        assert read.is_smart is (kind == KIND_SMART)

    def test_a_stale_flag_survives_sqlites_integer(self, db):
        """SQLite hands back 1, not True; the model reads both."""
        stored = add_export(db, source_stale=1)
        row = (
            db.connect()
            .execute("SELECT * FROM rekordbox_exports WHERE id = ?", (stored,))
            .fetchone()
        )
        assert RekordboxExport.from_row(row).source_stale is True

    def test_a_row_written_bare_reads_back_with_the_defaults(self, db):
        """Every column the migration defaults, read through the model."""
        stored = insert(
            db,
            "rekordbox_exports",
            dict(
                started_at=NOW,
                outcome=EXPORT_CANCELLED,
                destination_path="/d.xml",
                source_path="/s.xml",
                track_count=0,
                changed_track_count=0,
                fields_json="[]",
                key_format="normal",
            ),
        )
        read = RekordboxExport.from_row(
            db.connect()
            .execute("SELECT * FROM rekordbox_exports WHERE id = ?", (stored,))
            .fetchone()
        )
        assert read.source_stale is False
        assert read.dropped_reference_count == 0
        assert read.missing_file_count is None
        assert read.job_id is None and read.finished_at is None and read.error is None
        assert read.fields == ()
        assert read.changed_nothing is True
        assert read.wrote_file is False


@pytest.mark.unit
class TestWhatTheModelsRefuse:
    def base(self, **overrides: Any) -> Dict[str, Any]:
        row = dict(
            started_at=NOW,
            outcome=EXPORT_WRITTEN,
            destination_path="/d.xml",
            source_path="/s.xml",
            track_count=10,
            changed_track_count=1,
            fields_json=FIELDS,
            key_format="normal",
        )
        row.update(overrides)
        return row

    def test_more_tracks_changed_than_were_in_scope(self):
        with pytest.raises(ValueError, match="cannot exceed"):
            RekordboxExport(**self.base(track_count=5, changed_track_count=6))

    def test_changing_every_track_in_scope_is_fine(self):
        assert (
            RekordboxExport(
                **self.base(track_count=5, changed_track_count=5)
            ).changed_track_count
            == 5
        )

    def test_an_outcome_outside_the_vocabulary(self):
        with pytest.raises(ValueError, match="outcome"):
            RekordboxExport(**self.base(outcome="running"))

    def test_a_failure_that_does_not_say_why(self):
        with pytest.raises(ValueError, match="must say why"):
            RekordboxExport(**self.base(outcome=EXPORT_FAILED))

    def test_a_failure_whose_reason_is_only_spaces(self):
        with pytest.raises(ValueError, match="must say why"):
            RekordboxExport(**self.base(outcome=EXPORT_FAILED, error="   "))

    def test_a_written_export_that_recorded_an_error(self):
        with pytest.raises(ValueError, match="recorded no error"):
            RekordboxExport(**self.base(error="but it worked"))

    def test_a_cancelled_export_may_say_why_or_not(self):
        assert RekordboxExport(**self.base(outcome=EXPORT_CANCELLED)).error is None
        assert (
            RekordboxExport(**self.base(outcome=EXPORT_CANCELLED, error="user")).error
            == "user"
        )

    @pytest.mark.parametrize(
        "column", ["started_at", "destination_path", "source_path", "key_format"]
    )
    def test_a_required_text_column_that_is_blank(self, column):
        with pytest.raises(ValueError, match=column):
            RekordboxExport(**self.base(**{column: "  "}))

    @pytest.mark.parametrize("value", ["not json", "{", ""])
    def test_a_fields_list_that_is_not_json(self, value):
        with pytest.raises(ValueError, match="fields_json"):
            RekordboxExport(**self.base(fields_json=value))

    @pytest.mark.parametrize("value", ['{"key": true}', "3", '"key"'])
    def test_a_fields_list_that_is_not_a_list(self, value):
        with pytest.raises(ValueError, match="array of field names"):
            RekordboxExport(**self.base(fields_json=value))

    @pytest.mark.parametrize(
        "column", ["track_count", "changed_track_count", "dropped_reference_count"]
    )
    def test_a_count_below_zero(self, column):
        # ``changed_track_count`` is held at zero so that the count refused is
        # the negative one rather than the pair that cannot both be true —
        # except when it is itself the column under test.
        fields = {"changed_track_count": 0}
        fields[column] = -1
        with pytest.raises(ValueError, match=column):
            RekordboxExport(**self.base(**fields))

    def test_a_missing_file_count_below_zero(self):
        with pytest.raises(ValueError, match="missing_file_count"):
            RekordboxExport(**self.base(missing_file_count=-1))

    def test_a_staleness_flag_that_is_neither(self):
        with pytest.raises(ValueError, match="source_stale"):
            RekordboxExport(**self.base(source_stale="yes"))

    def test_a_smart_playlist_without_its_rules(self):
        with pytest.raises(ValueError, match="must record its rules"):
            RekordboxExportPlaylist(
                export_id=1, kind=KIND_SMART, name="N", path="CuePoint/N", entry_count=0
            )

    def test_a_collection_playlist_carrying_rules(self):
        """It exported stored membership; rules beside it would suggest they
        had a part in it."""
        with pytest.raises(ValueError, match="stored membership"):
            RekordboxExportPlaylist(
                export_id=1,
                kind=KIND_COLLECTION,
                name="N",
                path="CuePoint/N",
                entry_count=0,
                rules_json=RULES,
            )

    def test_a_rule_set_that_is_not_json(self):
        with pytest.raises(ValueError, match="rules_json"):
            RekordboxExportPlaylist(
                export_id=1,
                kind=KIND_SMART,
                name="N",
                path="CuePoint/N",
                entry_count=0,
                rules_json="not json",
            )

    def test_a_playlist_row_belonging_to_no_export(self):
        with pytest.raises(ValueError, match="export_id"):
            RekordboxExportPlaylist(
                export_id=None, kind=KIND_COLLECTION, name="N", path="p", entry_count=0
            )

    @pytest.mark.parametrize("column", ["name", "path"])
    def test_a_playlist_row_with_no_name_or_no_path(self, column):
        fields = dict(
            export_id=1, kind=KIND_COLLECTION, name="N", path="p", entry_count=0
        )
        fields[column] = "   "
        with pytest.raises(ValueError, match=column):
            RekordboxExportPlaylist(**fields)

    def test_a_collection_id_that_is_not_an_id(self):
        with pytest.raises(ValueError, match="collection_id"):
            RekordboxExportPlaylist(
                export_id=1,
                kind=KIND_COLLECTION,
                name="N",
                path="p",
                entry_count=0,
                collection_id=0,
            )


# --------------------------------------------------------------- the upgrade


@pytest.mark.unit
class TestUpgradingAVersionNineteenLibrary:
    """A version-19 library with rows in the tables a user's would have."""

    @pytest.fixture
    def populated_v19(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "upgrade.db")
        MigrationRunner(service, migrations=_migrations_up_to(19)).migrate()

        TrackRepository(service).add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/m/{i}.mp3",
                    title=f"T{i}",
                    artist="An Artist",
                    key="Am" if i % 2 else "8A",
                    bpm=120.0 + i,
                    genre="House" if i % 2 else "Techno",
                    label="Defected",
                    year=2000 + i,
                    rating=i % 6,
                    comment="from rekordbox",
                )
                for i in range(1, 26)
            ]
        )
        ids = [
            int(row["id"])
            for row in service.connect().execute("SELECT id FROM tracks ORDER BY id")
        ]
        with service.transaction() as conn:
            conn.execute(
                "INSERT INTO track_metadata"
                " (track_id, rating, favorite, notes, key, bpm, genre, label, year,"
                "  created_at, updated_at)"
                " VALUES (?, 5, 1, 'a note', 'Fm', 126.0, 'Techno', 'Drumcode',"
                " 2019, 'then', 'then')",
                (ids[0],),
            )
            collection = conn.execute(
                "INSERT INTO collections"
                " (kind, name, position, depth, created_at, updated_at)"
                " VALUES ('collection', 'Warmups', 0, 0, 'then', 'then')"
            ).lastrowid
            conn.execute(
                "INSERT INTO collections"
                " (kind, name, position, depth, rules_json, created_at, updated_at)"
                " VALUES ('smart', 'Recent', 1, 0, ?, 'then', 'then')",
                (RULES,),
            )
            for position, track_id in enumerate((ids[3], ids[3], ids[4])):
                conn.execute(
                    "INSERT INTO collection_tracks"
                    " (collection_id, track_id, position, added_at)"
                    " VALUES (?, ?, ?, 'then')",
                    (collection, track_id, position),
                )
            attempt = conn.execute(
                "INSERT INTO match_attempts"
                " (track_id, job_id, started_at, finished_at, outcome, input_json)"
                " VALUES (?, 'job-old', 'then', 'then', 'matched', '{}')",
                (ids[0],),
            ).lastrowid
            candidate = conn.execute(
                "INSERT INTO match_candidates"
                " (attempt_id, rank, url, score, guard_ok, is_winner)"
                " VALUES (?, 0, 'https://www.beatport.com/track/t/1', 96.0, 1, 1)",
                (attempt,),
            ).lastrowid
            conn.execute(
                "INSERT INTO track_match"
                " (track_id, state, decided_by, attempt_id, candidate_id, decided_at,"
                "  candidate_score)"
                " VALUES (?, 'accepted', 'user', ?, ?, 'then', 96.0)",
                (ids[0], attempt, candidate),
            )
            conn.execute(
                "INSERT INTO track_files"
                " (track_id, status, checked_path, checked_at)"
                " VALUES (?, 'missing', '/m/2.mp3', 'then')",
                (ids[1],),
            )
            conn.execute(
                "INSERT INTO file_writes"
                " (job_id, track_id, file_path, field, outcome, written_at, pending)"
                " VALUES ('job-old', ?, '/m/1.mp3', 'key', 'written', 'then', 0)",
                (ids[0],),
            )
            conn.execute(
                "INSERT INTO activity_events (type, summary, detail_json, created_at)"
                " VALUES ('library.refresh', 'Refreshed', '{}', 'then')"
            )
            playlist = conn.execute(
                "INSERT INTO rekordbox_playlists"
                " (name, kind, depth, position, rekordbox_path, track_count)"
                " VALUES ('Set', 'playlist', 0, 0, 'ROOT/Set', 2)"
            ).lastrowid
            for position, track_id in enumerate(ids[:2]):
                conn.execute(
                    "INSERT INTO rekordbox_playlist_tracks"
                    " (playlist_id, track_id, position) VALUES (?, ?, ?)",
                    (playlist, track_id, position),
                )
        yield service
        service.close_all()

    def test_it_applies(self, populated_v19):
        applied = MigrationRunner(populated_v19).migrate()
        assert 20 in [m.version for m in applied]

    def test_it_applies_alone(self, populated_v19):
        runner = MigrationRunner(populated_v19, migrations=_migrations_up_to(20))
        assert [m.version for m in runner.migrate()] == [20]

    def test_no_row_in_any_existing_table_changes(self, populated_v19):
        before = snapshot(populated_v19)
        MigrationRunner(populated_v19).migrate()
        after = snapshot(populated_v19)

        for table, rows in before.items():
            if table == "schema_version":
                continue
            assert after[table] == rows, table

        old_versions = {row["version"] for row in before["schema_version"]}
        new_versions = {row["version"] for row in after["schema_version"]}
        assert old_versions < new_versions and 20 in new_versions

    def test_both_new_tables_start_empty(self, populated_v19):
        MigrationRunner(populated_v19).migrate()
        for table in EXPORT_TABLES:
            assert count(populated_v19, f"SELECT count(*) FROM {table}") == 0, table

    def test_an_upgraded_database_has_the_same_schema_as_a_fresh_one(
        self, populated_v19, db
    ):
        MigrationRunner(populated_v19).migrate()
        assert schema(populated_v19) == schema(db)

    def test_it_still_browses_after_the_upgrade(self, populated_v19):
        MigrationRunner(populated_v19).migrate()
        repo = TrackRepository(populated_v19)
        query = BrowseQuery(query="T", sort="bpm")
        rows = repo.browse(query, limit=100)
        assert len(rows) == 25
        assert repo.browse_count(query) == 25

    def test_its_collections_still_read_back(self, populated_v19):
        MigrationRunner(populated_v19).migrate()
        tree = CollectionRepository(populated_v19).tree()
        assert [(node.name, node.kind) for node in tree] == [
            ("Warmups", KIND_COLLECTION),
            ("Recent", KIND_SMART),
        ]

    def test_the_record_can_be_written_straight_after_the_upgrade(self, populated_v19):
        MigrationRunner(populated_v19).migrate()
        export = add_export(populated_v19)
        add_playlist(populated_v19, export)
        assert (
            count(populated_v19, "SELECT count(*) FROM rekordbox_export_playlists") == 1
        )


# ------------------------------------------------- nothing reads them yet


@pytest.mark.unit
class TestOneModuleRunsTheirSQL:
    """EXPORT-03 landed the schema with nothing touching it; EXPORT-05 gave it
    its one reader and writer. All SQL for these tables lives in that
    repository, and a query anywhere else is a second copy of it."""

    def test_only_the_repository_runs_sql_against_either_table(self):
        package = Path(__file__).resolve().parents[3] / "cuepoint"
        statement = re.compile(
            r"\b(FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+(rekordbox_exports"
            r"|rekordbox_export_playlists)\b",
            re.IGNORECASE,
        )
        offenders = []
        for path in sorted(package.rglob("*.py")):
            if path.name == "m0020_rekordbox_exports.py":
                continue
            if statement.search(path.read_text(encoding="utf-8")):
                offenders.append(path.relative_to(package).as_posix())
        assert offenders == ["persistence/rekordbox_export_repository.py"]
