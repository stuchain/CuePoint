#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0025: the Set schema (PREP-01).

m0025 does two different things, and each has its own way of being wrong.

It **rebuilds three tables that hold user data** — ``collections``,
``collection_tracks`` and ``rekordbox_export_playlists`` — to widen a ``CHECK``
by one word. A rebuild can quietly change a table, lose or renumber a row, hand
an id out twice, or drop a reference, and under ``foreign_keys=ON`` a careless
one empties every Collection a user has. So:

1. **The tables are what they were.** Each rebuilt table is compared with its
   version-24 self: DDL text, columns, references and indexes, with only the
   widened ``CHECK`` and two added unique indexes different.
2. **Every row survives.** A version-24 library with a nested tree, a
   Collection moved under a folder made after it, a repeated entry, a Smart
   Collection, a frozen Collection, export records, deleted rows and rows in the
   tables around them is compared row for row, and its sequences value for
   value.
3. **The hazard is real, and the order is what prevents it.** Dropping
   ``collections`` first empties ``collection_tracks``; the migration's own
   statements copy everything before anything is dropped.

It also **creates four tables** whose job is to refuse mistakes a service could
make: plan data on a node that is not a Set, a chapter from another Set, an
acknowledgement across two Sets, a key SQLite would invent, and a chapter
deleted while it still holds entries. Each is shown refused, and each cascade
is shown to reach exactly as far as it should.
"""

from __future__ import annotations

import re
import sqlite3
from typing import Any, Dict, List, Optional

import pytest

from cuepoint.migrations import discover_migrations, split_sql_statements
from cuepoint.models.collection import KIND_SET, KINDS
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures import legacy_rows

pytestmark = pytest.mark.unit

NOW = "2026-09-28T12:00:00+00:00"

REBUILT = ("collections", "collection_tracks", "rekordbox_export_playlists")

NEW_TABLES = ("set_details", "set_chapters", "set_entries", "set_acknowledgements")

#: The only DDL text each rebuilt table may differ in.
WIDENED = {
    "collections": (
        "CHECK (kind IN ('folder', 'collection', 'smart'))",
        "CHECK (kind IN ('folder', 'collection', 'smart', 'set'))",
    ),
    "rekordbox_export_playlists": (
        "CHECK (kind IN ('collection', 'smart'))",
        "CHECK (kind IN ('collection', 'smart', 'set'))",
    ),
}

#: The unique indexes the composite references need, true of every row by
#: construction because each leads with a primary key.
ADDED_INDEXES = {
    "collections": {"idx_collections_kind": ["id", "kind"]},
    "collection_tracks": {"idx_collection_tracks_entry": ["id", "collection_id"]},
}


def m0025():
    return next(m for m in discover_migrations() if m.version == 25)


def runner(service: DatabaseService, through: Optional[int] = None) -> MigrationRunner:
    migrations = discover_migrations()
    if through is not None:
        migrations = [m for m in migrations if m.version <= through]
    return MigrationRunner(service, migrations=migrations)


def at_version(tmp_path, name: str, version: int) -> DatabaseService:
    service = DatabaseService(db_path=tmp_path / name)
    runner(service, version).migrate()
    return service


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    runner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def v24(tmp_path):
    service = at_version(tmp_path, "v24.db", 24)
    yield service
    service.close_all()


@pytest.fixture
def v25(tmp_path):
    service = at_version(tmp_path, "v25.db", 25)
    yield service
    service.close_all()


def rows(service, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    return [dict(row) for row in service.connect().execute(sql, params)]


def count(service, table: str) -> int:
    return int(service.connect().execute(f"SELECT count(*) FROM {table}").fetchone()[0])


def table_sql(service, table: str) -> str:
    return str(
        service.connect()
        .execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        )
        .fetchone()["sql"]
    )


def user_tables(service) -> List[str]:
    return [
        r["name"]
        for r in rows(
            service,
            "SELECT name FROM sqlite_master WHERE type = 'table'"
            " AND name NOT LIKE 'sqlite_%' AND name != 'schema_version'",
        )
    ]


def snapshot(service, tables: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    return {
        table: sorted(rows(service, f"SELECT * FROM {table}"), key=repr)
        for table in tables
    }


def schema(service):
    return [
        (r["type"], r["name"], r["sql"])
        for r in rows(
            service,
            "SELECT type, name, sql FROM sqlite_master"
            " WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        )
    ]


def sequence(service) -> Dict[str, int]:
    return {r["name"]: r["seq"] for r in rows(service, "SELECT * FROM sqlite_sequence")}


def indexes(service, table: str) -> Dict[str, Any]:
    """Every index on a table: its columns, uniqueness and origin."""
    found = {}
    for index in rows(service, f"PRAGMA index_list({table})"):
        columns = [
            c["name"] for c in rows(service, f"PRAGMA index_info({index['name']})")
        ]
        found[index["name"]] = (columns, index["unique"], index["origin"])
    return found


def references(service, table: str) -> List[tuple]:
    return sorted(
        (r["table"], r["from"], r["to"], r["on_delete"], r["on_update"], r["seq"])
        for r in rows(service, f"PRAGMA foreign_key_list({table})")
    )


def add_track(service, number: int) -> int:
    return legacy_rows.add_track(
        service,
        LibraryTrack(
            rekordbox_track_id=str(number),
            file_path=f"/m/{number}.mp3",
            title=f"T{number}",
            artist="An Artist",
        ),
    )


def add_node(
    conn,
    kind: str,
    name: str,
    parent_id: Optional[int] = None,
    depth: int = 0,
    position: int = 0,
    rules_json: Optional[str] = None,
    node_id: Optional[int] = None,
    frozen_from_id: Optional[int] = None,
) -> int:
    cursor = conn.execute(
        "INSERT INTO collections (id, parent_id, kind, name, position, depth,"
        " rules_json, sort_field, sort_dir, frozen_from_id, frozen_at,"
        " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            node_id,
            parent_id,
            kind,
            name,
            position,
            depth,
            rules_json,
            "bpm" if kind == "smart" else None,
            "desc" if kind == "smart" else None,
            frozen_from_id,
            NOW if frozen_from_id else None,
            NOW,
            NOW,
        ),
    )
    return int(cursor.lastrowid)


def add_entry(conn, collection_id: int, track_id: int, position: int) -> int:
    cursor = conn.execute(
        "INSERT INTO collection_tracks (collection_id, track_id, position, added_at)"
        " VALUES (?, ?, ?, ?)",
        (collection_id, track_id, position, NOW),
    )
    return int(cursor.lastrowid)


RULES = '{"match": "all", "rules": [{"field": "bpm", "operator": "gte", "value": 120}]}'


# ------------------------------------------------------------------ the rebuild


class TestDiscovery:
    def test_it_is_version_twenty_five(self):
        assert m0025().module_name == "m0025_sets"

    def test_a_fresh_database_ends_at_version_twenty_five_or_later(self, db):
        assert runner(db).current_version() >= 25


class TestTheRebuiltTablesAreWhatTheyWere:
    @pytest.mark.parametrize("table", REBUILT)
    def test_the_ddl_differs_only_in_the_widened_kind(self, v24, v25, table):
        before = table_sql(v24, table)
        expected = before
        if table in WIDENED:
            old, new = WIDENED[table]
            assert old in before, table
            expected = before.replace(old, new)
        assert table_sql(v25, table) == expected

    @pytest.mark.parametrize("table", REBUILT)
    def test_the_same_columns_in_the_same_order_with_the_same_rules(
        self, v24, v25, table
    ):
        def info(service):
            return rows(service, f"PRAGMA table_info({table})")

        assert info(v25) == info(v24)

    @pytest.mark.parametrize("table", REBUILT)
    def test_every_reference_is_as_it_was(self, v24, v25, table):
        assert references(v25, table) == references(v24, table)

    @pytest.mark.parametrize("table", REBUILT)
    def test_every_index_is_as_it_was_plus_only_the_named_ones(self, v24, v25, table):
        before, after = indexes(v24, table), indexes(v25, table)
        added = {name: after[name] for name in set(after) - set(before)}
        assert {name: after[name] for name in before} == before
        assert {name: columns for name, (columns, _, _) in added.items()} == (
            ADDED_INDEXES.get(table, {})
        )
        assert all(unique == 1 for _, unique, _ in added.values())

    def test_the_references_to_the_rebuilt_tables_are_as_they_were(self, v24, v25):
        """Nothing outside the rebuilt tables pointed into them at version 24,
        and only m0025's own tables do now."""

        def pointing_in(service, exclude):
            found = []
            for table in user_tables(service):
                if table in exclude:
                    continue
                for ref in references(service, table):
                    if ref[0] in REBUILT:
                        found.append((table, ref))
            return sorted(found)

        assert pointing_in(v24, REBUILT) == []
        assert {table for table, _ in pointing_in(v25, REBUILT)} == {
            "set_details",
            "set_entries",
        }

    def test_no_working_table_is_left_behind(self, v25):
        assert (
            rows(v25, "SELECT name FROM sqlite_master WHERE name LIKE 'm0025%'") == []
        )

    def test_the_kind_check_says_what_the_model_says(self, v25):
        declared = re.search(
            r"CHECK \(kind IN \(([^)]*)\)\)", table_sql(v25, "collections")
        )
        assert declared
        assert set(re.findall(r"'([a-z]+)'", declared.group(1))) == set(KINDS)
        assert KIND_SET in KINDS


# --------------------------------------------------- upgrading a user's library


@pytest.fixture
def populated(tmp_path):
    """A version-24 library shaped the way a real one gets shaped."""
    service = at_version(tmp_path, "upgrade.db", 24)
    tracks = [add_track(service, n) for n in range(1, 9)]
    with service.transaction() as conn:
        # Made first, filed later: its id is lower than its folder's.
        early = add_node(conn, "collection", "Warmups")
        gigs = add_node(conn, "folder", "Gigs")
        conn.execute(
            "UPDATE collections SET parent_id = ?, depth = 1 WHERE id = ?",
            (gigs, early),
        )
        year = add_node(conn, "folder", "2026", parent_id=gigs, depth=1, position=1)
        saturday = add_node(conn, "collection", "Saturday", parent_id=year, depth=2)
        smart = add_node(conn, "smart", "Fast", position=1, rules_json=RULES)
        frozen = add_node(
            conn,
            "collection",
            "Fast, frozen",
            position=2,
            rules_json=RULES,
            frozen_from_id=smart,
        )
        # A node deleted leaves the sequence above the highest id.
        gone = add_node(conn, "collection", "Deleted", position=3)
        conn.execute("DELETE FROM collections WHERE id = ?", (gone,))

        for position, track in enumerate([tracks[0], tracks[1], tracks[0]]):
            add_entry(conn, early, track, position)  # a repeat, DEC-058
        for position, track in enumerate(tracks[2:6]):
            add_entry(conn, saturday, track, position)
        add_entry(conn, frozen, tracks[6], 0)
        # An entry deleted leaves its sequence above the highest id.
        removed = add_entry(conn, frozen, tracks[7], 1)
        conn.execute("DELETE FROM collection_tracks WHERE id = ?", (removed,))

        export = int(
            conn.execute(
                "INSERT INTO rekordbox_exports (started_at, finished_at, outcome,"
                " destination_path, source_path, track_count, changed_track_count,"
                " fields_json, key_format) VALUES (?, ?, 'written', '/out/a.xml',"
                " '/in/lib.xml', 8, 2, '[\"bpm\"]', 'classic')",
                (NOW, NOW),
            ).lastrowid
        )
        for kind, node, rules in (
            ("collection", early, None),
            ("smart", smart, RULES),
            ("collection", None, None),  # a Collection since deleted
        ):
            conn.execute(
                "INSERT INTO rekordbox_export_playlists (export_id, collection_id,"
                " kind, name, path, entry_count, dropped_count, rules_json)"
                " VALUES (?, ?, ?, 'N', 'CuePoint/N', 3, 1, ?)",
                (export, node, kind, rules),
            )
        dropped = conn.execute(
            "INSERT INTO rekordbox_export_playlists (export_id, kind, name, path,"
            " entry_count) VALUES (?, 'collection', 'X', 'CuePoint/X', 0)",
            (export,),
        ).lastrowid
        conn.execute("DELETE FROM rekordbox_export_playlists WHERE id = ?", (dropped,))

        # The tables around the rebuilt ones, which must not notice.
        conn.execute(
            "INSERT INTO track_metadata (track_id, rating, favorite, notes,"
            " created_at, updated_at) VALUES (?, 4, 1, 'Closer', ?, ?)",
            (tracks[0], NOW, NOW),
        )
        tag = conn.execute(
            "INSERT INTO tags (name, category, created_at) VALUES ('Peak', 'Mood', ?)",
            (NOW,),
        ).lastrowid
        conn.execute(
            "INSERT INTO track_tags (track_id, tag_id, created_at) VALUES (?, ?, ?)",
            (tracks[1], tag, NOW),
        )
    service.ids = {
        "tracks": tracks,
        "early": early,
        "gigs": gigs,
        "saturday": saturday,
        "smart": smart,
        "export": export,
    }
    yield service
    service.close_all()


class TestUpgradingAVersionTwentyFourLibrary:
    def test_the_fixture_has_a_child_older_than_its_folder(self, populated):
        early = rows(
            populated,
            "SELECT id, parent_id FROM collections WHERE id = ?",
            (populated.ids["early"],),
        )[0]
        assert early["id"] < early["parent_id"]

    def test_it_applies(self, populated):
        assert [m.version for m in runner(populated).migrate()][0] == 25

    def test_every_row_of_every_table_survives(self, populated):
        before_tables = user_tables(populated)
        before = snapshot(populated, before_tables)
        runner(populated, 25).migrate()
        assert snapshot(populated, before_tables) == before

    def test_the_new_tables_start_empty(self, populated):
        runner(populated, 25).migrate()
        assert {table: count(populated, table) for table in NEW_TABLES} == {
            table: 0 for table in NEW_TABLES
        }

    def test_no_id_is_handed_out_twice(self, populated):
        before = sequence(populated)
        for table in REBUILT:
            highest = rows(populated, f"SELECT max(id) AS m FROM {table}")[0]["m"]
            assert before[table] > highest, table

        runner(populated, 25).migrate()
        assert sequence(populated) == before

        with populated.transaction() as conn:
            node = add_node(conn, "collection", "New", position=9)
            entry = add_entry(conn, node, populated.ids["tracks"][0], 0)
            playlist = conn.execute(
                "INSERT INTO rekordbox_export_playlists (export_id, kind, name, path,"
                " entry_count) VALUES (?, 'collection', 'Y', 'CuePoint/Y', 0)",
                (populated.ids["export"],),
            ).lastrowid
        assert node == before["collections"] + 1
        assert entry == before["collection_tracks"] + 1
        assert playlist == before["rekordbox_export_playlists"] + 1

    def test_every_reference_still_holds(self, populated):
        runner(populated).migrate()
        assert rows(populated, "PRAGMA foreign_key_check") == []
        assert rows(populated, "PRAGMA integrity_check") == [{"integrity_check": "ok"}]

    def test_the_repository_reads_the_same_tree_and_entries(self, populated):
        repo = CollectionRepository(populated)

        def read():
            return (
                [node.to_dict() for node in repo.tree()],
                {
                    node.id: repo.track_ids(int(node.id or 0))
                    for node in repo.tree()
                    if node.kind == "collection"
                },
            )

        before = read()
        runner(populated).migrate()
        assert read() == before

    def test_deleting_a_folder_still_takes_its_subtree_and_no_tracks(self, populated):
        runner(populated).migrate()
        tracks = count(populated, "tracks")
        with populated.transaction() as conn:
            conn.execute(
                "DELETE FROM collections WHERE id = ?", (populated.ids["gigs"],)
            )
        names = {r["name"] for r in rows(populated, "SELECT name FROM collections")}
        assert names == {"Fast", "Fast, frozen"}
        remaining = rows(
            populated, "SELECT DISTINCT collection_id FROM collection_tracks"
        )
        assert len(remaining) == 1
        assert count(populated, "tracks") == tracks

    def test_deleting_a_track_still_takes_its_entries(self, populated):
        runner(populated).migrate()
        first = populated.ids["tracks"][0]
        with populated.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (first,))
        assert (
            rows(
                populated,
                "SELECT count(*) AS n FROM collection_tracks WHERE track_id = ?",
                (first,),
            )[0]["n"]
            == 0
        )
        assert count(populated, "collection_tracks") == 6

    def test_the_upgraded_schema_is_a_fresh_one(self, populated, db):
        runner(populated).migrate()
        assert schema(populated) == schema(db)


class TestUpgradingEmptyTables:
    def test_no_sequence_appears_and_ids_start_at_one(self, v24):
        assert not set(REBUILT) & set(sequence(v24))
        others = sequence(v24)

        runner(v24, 25).migrate()
        assert sequence(v24) == others

        with v24.transaction() as conn:
            assert add_node(conn, "folder", "First") == 1


class TestTheCascadeTheCopyOrderPrevents:
    def test_dropping_collections_first_would_empty_every_collection(self, populated):
        """Why the migration copies before it drops: under ``foreign_keys=ON``
        a ``DROP TABLE`` is a ``DELETE`` first, and deletes cascade."""
        assert count(populated, "collection_tracks") == 8
        conn = populated.connect()
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        conn.execute("SAVEPOINT hazard")
        try:
            conn.execute("DROP TABLE collections")
            assert count(populated, "collection_tracks") == 0
        finally:
            conn.execute("ROLLBACK TO hazard")
            conn.execute("RELEASE hazard")
        assert count(populated, "collection_tracks") == 8

    def test_every_copy_is_taken_before_anything_is_dropped(self):
        statements = [" ".join(s.split()) for s in split_sql_statements(m0025().sql)]

        def first(prefix: str) -> int:
            return next(i for i, s in enumerate(statements) if s.startswith(prefix))

        copies = [
            first(f"CREATE TABLE m0025_{name} AS")
            for name in ("collections", "collection_tracks", "export_playlists")
        ]
        copies.append(first("CREATE TABLE m0025_sequence AS"))
        drops = [first(f"DROP TABLE {table};") for table in REBUILT]
        assert max(copies) < min(drops)

    def test_the_entries_are_dropped_before_the_nodes_they_belong_to(self):
        """Not what protects the rows, which the copies do, but what keeps the
        drop cheap: dropping the nodes first would cascade a delete to every
        entry, one row at a time, immediately before the table goes anyway."""
        statements = [" ".join(s.split()) for s in split_sql_statements(m0025().sql)]
        assert statements.index("DROP TABLE collection_tracks;") < statements.index(
            "DROP TABLE collections;"
        )

    def test_a_failed_upgrade_leaves_the_library_as_it_was(self, populated):
        """The runner's transaction is the last line of defence: a migration
        that fails half way leaves version 24 and every row of it."""
        before = snapshot(populated, user_tables(populated))
        broken = m0025()
        broken = type(broken)(
            version=25,
            description=broken.description,
            sql=broken.sql + "\nINSERT INTO no_such_table VALUES (1);\n",
            module_name=broken.module_name,
        )
        earlier = [m for m in discover_migrations() if m.version <= 24]
        with pytest.raises(Exception):
            MigrationRunner(populated, migrations=[*earlier, broken]).migrate()
        assert runner(populated, 24).current_version() == 24
        assert snapshot(populated, user_tables(populated)) == before


# ------------------------------------------------------------ the new tables


def make_set(conn, name: str = "Friday", position: int = 0) -> int:
    node = add_node(conn, KIND_SET, name, position=position)
    conn.execute(
        "INSERT INTO set_details (collection_id, notes, created_at, updated_at)"
        " VALUES (?, NULL, ?, ?)",
        (node, NOW, NOW),
    )
    return node


def make_chapter(conn, set_id: int, position: int = 0, name: str = "", **values) -> int:
    columns = {"collection_id": set_id, "position": position, "name": name}
    columns.update(values)
    columns.setdefault("created_at", NOW)
    columns.setdefault("updated_at", NOW)
    names = ", ".join(columns)
    marks = ", ".join("?" for _ in columns)
    return int(
        conn.execute(
            f"INSERT INTO set_chapters ({names}) VALUES ({marks})",
            tuple(columns.values()),
        ).lastrowid
    )


def make_plan(
    conn,
    entry_id: int,
    set_id: int,
    chapter_id: int,
    in_seconds: Optional[int] = None,
    out_seconds: Optional[int] = None,
    note: Optional[str] = None,
) -> None:
    conn.execute(
        "INSERT INTO set_entries (entry_id, collection_id, chapter_id, in_seconds,"
        " out_seconds, note) VALUES (?, ?, ?, ?, ?, ?)",
        (entry_id, set_id, chapter_id, in_seconds, out_seconds, note),
    )


def make_ack(conn, set_id: int, from_id: int, to_id: int, warning="key_clash") -> int:
    return int(
        conn.execute(
            "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
            " to_entry_id, warning, compared_json, created_at)"
            " VALUES (?, ?, ?, ?, '{}', ?)",
            (set_id, from_id, to_id, warning, NOW),
        ).lastrowid
    )


@pytest.fixture
def a_set(db):
    """One Set of three entries (the first track twice) in two chapters, each
    transition acknowledged, beside a Collection and a second Set."""
    tracks = [add_track(db, n) for n in range(1, 5)]
    with db.transaction() as conn:
        set_id = make_set(conn)
        warmup = make_chapter(conn, set_id, 0, "Warm-up", target_seconds=1800)
        peak = make_chapter(conn, set_id, 1, "Peak", bpm_min=124.0, bpm_max=128.0)
        entries = [
            add_entry(conn, set_id, track, position)
            for position, track in enumerate([tracks[0], tracks[1], tracks[0]])
        ]
        make_plan(conn, entries[0], set_id, warmup, 0, 240, "Long intro")
        make_plan(conn, entries[1], set_id, warmup, None, 300)
        make_plan(conn, entries[2], set_id, peak)
        make_ack(conn, set_id, entries[0], entries[1])
        make_ack(conn, set_id, entries[1], entries[2], "tempo_jump")

        crate = add_node(conn, "collection", "Crate", position=1)
        crate_entry = add_entry(conn, crate, tracks[2], 0)
        other = make_set(conn, "Saturday", position=2)
        other_chapter = make_chapter(conn, other)
        other_entry = add_entry(conn, other, tracks[3], 0)
        make_plan(conn, other_entry, other, other_chapter)
    db.ids = {
        "tracks": tracks,
        "set": set_id,
        "warmup": warmup,
        "peak": peak,
        "entries": entries,
        "crate": crate,
        "crate_entry": crate_entry,
        "other": other,
        "other_chapter": other_chapter,
        "other_entry": other_entry,
    }
    return db


def refused(db, sql: str, params: tuple = ()) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        with db.transaction() as conn:
            conn.execute(sql, params)


class TestTheNewTables:
    def test_they_exist_with_their_columns_in_order(self, db):
        def columns(table):
            return [r["name"] for r in rows(db, f"PRAGMA table_info({table})")]

        assert columns("set_details") == [
            "collection_id",
            "kind",
            "notes",
            "created_at",
            "updated_at",
        ]
        assert columns("set_chapters") == [
            "id",
            "collection_id",
            "position",
            "name",
            "notes",
            "target_seconds",
            "bpm_min",
            "bpm_max",
            "created_at",
            "updated_at",
        ]
        assert columns("set_entries") == [
            "entry_id",
            "collection_id",
            "chapter_id",
            "in_seconds",
            "out_seconds",
            "note",
        ]
        assert columns("set_acknowledgements") == [
            "id",
            "collection_id",
            "from_entry_id",
            "to_entry_id",
            "warning",
            "compared_json",
            "created_at",
        ]

    @pytest.mark.parametrize("table", ["set_details", "set_entries"])
    def test_the_tables_keyed_by_another_tables_id_have_no_rowid(self, db, table):
        assert "WITHOUT ROWID" in table_sql(db, table)

    @pytest.mark.parametrize("table", ["set_chapters", "set_acknowledgements"])
    def test_ids_the_renderer_holds_are_never_reused(self, db, table):
        assert "AUTOINCREMENT" in table_sql(db, table)

    def test_the_whole_reference_map(self, db):
        assert {table: references(db, table) for table in NEW_TABLES} == {
            "set_details": [
                ("collections", "collection_id", "id", "CASCADE", "NO ACTION", 0),
                ("collections", "kind", "kind", "CASCADE", "NO ACTION", 1),
            ],
            "set_chapters": [
                (
                    "set_details",
                    "collection_id",
                    "collection_id",
                    "CASCADE",
                    "NO ACTION",
                    0,
                ),
            ],
            "set_entries": sorted(
                [
                    ("collection_tracks", "entry_id", "id", "CASCADE", "NO ACTION", 0),
                    (
                        "collection_tracks",
                        "collection_id",
                        "collection_id",
                        "CASCADE",
                        "NO ACTION",
                        1,
                    ),
                    ("set_chapters", "chapter_id", "id", "NO ACTION", "NO ACTION", 0),
                    (
                        "set_chapters",
                        "collection_id",
                        "collection_id",
                        "NO ACTION",
                        "NO ACTION",
                        1,
                    ),
                ]
            ),
            "set_acknowledgements": sorted(
                [
                    (
                        "set_entries",
                        "from_entry_id",
                        "entry_id",
                        "CASCADE",
                        "NO ACTION",
                        0,
                    ),
                    (
                        "set_entries",
                        "collection_id",
                        "collection_id",
                        "CASCADE",
                        "NO ACTION",
                        1,
                    ),
                    (
                        "set_entries",
                        "to_entry_id",
                        "entry_id",
                        "CASCADE",
                        "NO ACTION",
                        0,
                    ),
                    (
                        "set_entries",
                        "collection_id",
                        "collection_id",
                        "CASCADE",
                        "NO ACTION",
                        1,
                    ),
                ]
            ),
        }

    @pytest.mark.parametrize("table", NEW_TABLES)
    def test_every_reference_leads_an_index(self, db, table):
        """m0009's rule: a parent delete seeks the child rather than scanning it."""
        leading = {columns[0] for columns, _, _ in indexes(db, table).values()}
        primary = [
            r["name"] for r in rows(db, f"PRAGMA table_info({table})") if r["pk"]
        ]
        leading.update(primary[:1])
        for ref in rows(db, f"PRAGMA foreign_key_list({table})"):
            if ref["seq"] == 0:
                assert ref["from"] in leading, (table, ref["from"])

    def test_every_composite_reference_has_the_unique_key_it_needs(self, db):
        """A reference whose parent key has no unique index is a "foreign key
        mismatch" at the first write, not at the migration."""
        wanted = {
            ("collections", ("id", "kind")),
            ("collection_tracks", ("id", "collection_id")),
            ("set_chapters", ("id", "collection_id")),
            ("set_entries", ("entry_id", "collection_id")),
        }
        for table, columns in wanted:
            unique = {
                tuple(cols)
                for cols, is_unique, _ in indexes(db, table).values()
                if is_unique
            }
            assert columns in unique, table

    def test_chapter_positions_are_indexed_and_not_unique(self, db):
        """m0009's reason: chapters are reordered, and SQLite has no deferred
        uniqueness, so a swap would violate a unique index halfway through."""
        columns, unique, _ = indexes(db, "set_chapters")["idx_set_chapters_set"]
        assert columns == ["collection_id", "position"]
        assert unique == 0

    def test_the_foreign_keys_hold_on_this_connection(self, db):
        assert db.connect().execute("PRAGMA foreign_keys").fetchone()[0] == 1


class TestOnlyASetHasSetData:
    def test_a_set_takes_its_details_chapters_and_plans(self, a_set):
        assert count(a_set, "set_details") == 2
        assert count(a_set, "set_chapters") == 3
        assert count(a_set, "set_entries") == 4
        assert count(a_set, "set_acknowledgements") == 2

    @pytest.mark.parametrize("kind", ["folder", "collection", "smart"])
    def test_details_for_a_node_that_is_not_a_set_are_refused(self, db, kind):
        with db.transaction() as conn:
            node = add_node(
                conn, kind, "Not a Set", rules_json=RULES if kind == "smart" else None
            )
        refused(
            db,
            "INSERT INTO set_details (collection_id, created_at, updated_at)"
            " VALUES (?, ?, ?)",
            (node, NOW, NOW),
        )

    def test_details_for_no_node_are_refused(self, db):
        refused(
            db,
            "INSERT INTO set_details (collection_id, created_at, updated_at)"
            " VALUES (999, ?, ?)",
            (NOW, NOW),
        )

    @pytest.mark.parametrize("kind", ["collection", "smart", "", "SET"])
    def test_details_cannot_claim_another_kind(self, a_set, kind):
        refused(
            a_set,
            "UPDATE set_details SET kind = ? WHERE collection_id = ?",
            (kind, a_set.ids["set"]),
        )

    def test_a_set_holding_details_cannot_become_another_kind(self, a_set):
        refused(
            a_set,
            "UPDATE collections SET kind = 'collection' WHERE id = ?",
            (a_set.ids["set"],),
        )

    def test_a_set_with_no_details_yet_may_still_change_kind(self, db):
        """The reference guards Set data, not the word: a node holding none is
        not held."""
        with db.transaction() as conn:
            node = add_node(conn, KIND_SET, "Bare")
            conn.execute(
                "UPDATE collections SET kind = 'collection' WHERE id = ?", (node,)
            )

    def test_a_chapter_for_a_node_without_details_is_refused(self, db):
        with db.transaction() as conn:
            crate = add_node(conn, "collection", "Crate")
        refused(
            db,
            "INSERT INTO set_chapters (collection_id, position, created_at,"
            " updated_at) VALUES (?, 0, ?, ?)",
            (crate, NOW, NOW),
        )

    def test_a_plan_for_a_collections_entry_is_refused(self, a_set):
        """The entry and the chapter must be in one Set: a Collection's entry
        has no chapter in its own node."""
        refused(
            a_set,
            "INSERT INTO set_entries (entry_id, collection_id, chapter_id)"
            " VALUES (?, ?, ?)",
            (a_set.ids["crate_entry"], a_set.ids["set"], a_set.ids["warmup"]),
        )
        refused(
            a_set,
            "INSERT INTO set_entries (entry_id, collection_id, chapter_id)"
            " VALUES (?, ?, ?)",
            (a_set.ids["crate_entry"], a_set.ids["crate"], a_set.ids["warmup"]),
        )

    def test_a_chapter_from_another_set_is_refused(self, a_set):
        refused(
            a_set,
            "UPDATE set_entries SET chapter_id = ? WHERE entry_id = ?",
            (a_set.ids["other_chapter"], a_set.ids["entries"][0]),
        )

    def test_a_plan_that_names_the_wrong_set_is_refused(self, a_set):
        refused(
            a_set,
            "UPDATE set_entries SET collection_id = ?, chapter_id = ?"
            " WHERE entry_id = ?",
            (a_set.ids["other"], a_set.ids["other_chapter"], a_set.ids["entries"][0]),
        )

    def test_a_chapter_in_the_same_set_is_accepted(self, a_set):
        with a_set.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET chapter_id = ? WHERE entry_id = ?",
                (a_set.ids["peak"], a_set.ids["entries"][0]),
            )

    def test_one_plan_per_entry(self, a_set):
        refused(
            a_set,
            "INSERT INTO set_entries (entry_id, collection_id, chapter_id)"
            " VALUES (?, ?, ?)",
            (a_set.ids["entries"][0], a_set.ids["set"], a_set.ids["peak"]),
        )

    def test_an_acknowledgement_across_two_sets_is_refused(self, a_set):
        refused(
            a_set,
            "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
            " to_entry_id, warning, compared_json, created_at)"
            " VALUES (?, ?, ?, 'key_clash', '{}', ?)",
            (a_set.ids["set"], a_set.ids["entries"][2], a_set.ids["other_entry"], NOW),
        )

    def test_an_acknowledgement_of_an_entry_with_no_plan_is_refused(self, a_set):
        with a_set.transaction() as conn:
            unplanned = add_entry(conn, a_set.ids["set"], a_set.ids["tracks"][2], 3)
        refused(
            a_set,
            "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
            " to_entry_id, warning, compared_json, created_at)"
            " VALUES (?, ?, ?, 'key_clash', '{}', ?)",
            (a_set.ids["set"], a_set.ids["entries"][2], unplanned, NOW),
        )

    def test_an_acknowledgement_is_between_two_entries(self, a_set):
        entry = a_set.ids["entries"][0]
        refused(
            a_set,
            "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
            " to_entry_id, warning, compared_json, created_at)"
            " VALUES (?, ?, ?, 'key_clash', '{}', ?)",
            (a_set.ids["set"], entry, entry, NOW),
        )

    def test_the_same_warning_on_one_transition_is_acknowledged_once(self, a_set):
        first, second = a_set.ids["entries"][:2]
        refused(
            a_set,
            "INSERT INTO set_acknowledgements (collection_id, from_entry_id,"
            " to_entry_id, warning, compared_json, created_at)"
            " VALUES (?, ?, ?, 'key_clash', '{}', ?)",
            (a_set.ids["set"], first, second, NOW),
        )
        with a_set.transaction() as conn:
            make_ack(conn, a_set.ids["set"], first, second, "tempo_jump")
            make_ack(conn, a_set.ids["set"], second, first, "key_clash")


class TestNoKeyIsInvented:
    """In a rowid table an omitted ``INTEGER PRIMARY KEY`` is given the next
    free number. Each case below is built so that number would name a real row
    the reference accepts, which is when the trap stops being theoretical."""

    def test_details_without_a_node_id_are_refused(self, db):
        with db.transaction() as conn:
            node = add_node(conn, KIND_SET, "Bare")
        assert node == 1  # the number an empty rowid table would hand out
        refused(
            db,
            "INSERT INTO set_details (created_at, updated_at) VALUES (?, ?)",
            (NOW, NOW),
        )
        assert count(db, "set_details") == 0

    def test_a_plan_without_an_entry_id_is_refused(self, a_set):
        planned = [
            r["entry_id"] for r in rows(a_set, "SELECT entry_id FROM set_entries")
        ]
        with a_set.transaction() as conn:
            unplanned = add_entry(conn, a_set.ids["set"], a_set.ids["tracks"][3], 3)
        assert unplanned == max(planned) + 1  # the number a rowid table would invent
        refused(
            a_set,
            "INSERT INTO set_entries (collection_id, chapter_id) VALUES (?, ?)",
            (a_set.ids["set"], a_set.ids["warmup"]),
        )
        assert (
            rows(
                a_set,
                "SELECT count(*) AS n FROM set_entries WHERE entry_id = ?",
                (unplanned,),
            )[0]["n"]
            == 0
        )


class TestTheChecks:
    @pytest.mark.parametrize(
        "column, value",
        [
            ("position", -1),
            ("target_seconds", 0),
            ("target_seconds", -60),
            ("bpm_min", 0),
            ("bpm_max", -1.0),
        ],
    )
    def test_a_chapter_value_out_of_range_is_refused(self, a_set, column, value):
        refused(
            a_set,
            f"UPDATE set_chapters SET {column} = ? WHERE id = ?",
            (value, a_set.ids["warmup"]),
        )

    def test_a_bpm_range_must_run_upwards(self, a_set):
        refused(
            a_set,
            "UPDATE set_chapters SET bpm_min = 130, bpm_max = 120 WHERE id = ?",
            (a_set.ids["peak"],),
        )
        with a_set.transaction() as conn:
            conn.execute(
                "UPDATE set_chapters SET bpm_min = 126, bpm_max = 126 WHERE id = ?",
                (a_set.ids["peak"],),
            )
            conn.execute(
                "UPDATE set_chapters SET bpm_min = 140, bpm_max = NULL WHERE id = ?",
                (a_set.ids["peak"],),
            )

    def test_a_chapter_name_defaults_to_unnamed(self, a_set):
        with a_set.transaction() as conn:
            chapter = conn.execute(
                "INSERT INTO set_chapters (collection_id, position, created_at,"
                " updated_at) VALUES (?, 2, ?, ?)",
                (a_set.ids["set"], NOW, NOW),
            ).lastrowid
        assert rows(
            a_set, "SELECT name FROM set_chapters WHERE id = ?", (chapter,)
        ) == [{"name": ""}]

    @pytest.mark.parametrize(
        "in_seconds, out_seconds",
        [(-1, None), (None, 0), (None, -5), (300, 300), (400, 300)],
    )
    def test_planned_times_out_of_order_or_range_are_refused(
        self, a_set, in_seconds, out_seconds
    ):
        refused(
            a_set,
            "UPDATE set_entries SET in_seconds = ?, out_seconds = ? WHERE entry_id = ?",
            (in_seconds, out_seconds, a_set.ids["entries"][0]),
        )

    @pytest.mark.parametrize(
        "in_seconds, out_seconds",
        [(None, None), (0, None), (30, None), (0, 1), (None, 90)],
    )
    def test_planned_times_in_order_are_accepted(self, a_set, in_seconds, out_seconds):
        with a_set.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET in_seconds = ?, out_seconds = ?"
                " WHERE entry_id = ?",
                (in_seconds, out_seconds, a_set.ids["entries"][0]),
            )


class TestTheCascades:
    def test_deleting_a_set_takes_all_of_its_data_and_no_tracks(self, a_set):
        tracks = count(a_set, "tracks")
        with a_set.transaction() as conn:
            conn.execute("DELETE FROM collections WHERE id = ?", (a_set.ids["set"],))
        assert count(a_set, "set_details") == 1
        assert rows(a_set, "SELECT id FROM set_chapters") == [
            {"id": a_set.ids["other_chapter"]}
        ]
        assert rows(a_set, "SELECT entry_id FROM set_entries") == [
            {"entry_id": a_set.ids["other_entry"]}
        ]
        assert count(a_set, "set_acknowledgements") == 0
        assert count(a_set, "tracks") == tracks
        assert rows(a_set, "PRAGMA foreign_key_check") == []

    def test_deleting_the_folder_a_set_is_in_takes_the_set(self, a_set):
        with a_set.transaction() as conn:
            folder = add_node(conn, "folder", "Gigs", position=5)
            conn.execute(
                "UPDATE collections SET parent_id = ?, depth = 1 WHERE id = ?",
                (folder, a_set.ids["set"]),
            )
            conn.execute("DELETE FROM collections WHERE id = ?", (folder,))
        assert rows(
            a_set, "SELECT collection_id FROM set_details ORDER BY collection_id"
        ) == [{"collection_id": a_set.ids["other"]}]
        assert count(a_set, "set_acknowledgements") == 0

    def test_deleting_a_track_takes_its_entries_plans_and_acknowledgements(self, a_set):
        """The first track is in the Set twice, at either end of both
        acknowledged transitions."""
        with a_set.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (a_set.ids["tracks"][0],))
        remaining = {
            r["entry_id"]
            for r in rows(
                a_set,
                "SELECT entry_id FROM set_entries WHERE collection_id = ?",
                (a_set.ids["set"],),
            )
        }
        assert remaining == {a_set.ids["entries"][1]}
        assert count(a_set, "set_acknowledgements") == 0
        assert count(a_set, "set_chapters") == 3

    def test_removing_one_entry_takes_only_the_acknowledgements_it_ends(self, a_set):
        first, second, third = a_set.ids["entries"]
        with a_set.transaction() as conn:
            conn.execute("DELETE FROM collection_tracks WHERE id = ?", (third,))
        assert rows(
            a_set, "SELECT from_entry_id, to_entry_id FROM set_acknowledgements"
        ) == [{"from_entry_id": first, "to_entry_id": second}]

    def test_a_chapter_still_holding_entries_cannot_be_deleted(self, a_set):
        refused(a_set, "DELETE FROM set_chapters WHERE id = ?", (a_set.ids["warmup"],))
        assert count(a_set, "set_entries") == 4

    def test_an_empty_chapter_can_be_deleted(self, a_set):
        with a_set.transaction() as conn:
            conn.execute(
                "UPDATE set_entries SET chapter_id = ? WHERE chapter_id = ?",
                (a_set.ids["peak"], a_set.ids["warmup"]),
            )
            conn.execute(
                "DELETE FROM set_chapters WHERE id = ?", (a_set.ids["warmup"],)
            )
        assert rows(
            a_set,
            "SELECT DISTINCT chapter_id FROM set_entries WHERE collection_id = ?",
            (a_set.ids["set"],),
        ) == [{"chapter_id": a_set.ids["peak"]}]

    def test_a_sets_details_cannot_be_removed_while_its_entries_are_planned(
        self, a_set
    ):
        """Removing the details cascades to the chapters, and a planned entry's
        chapter reference refuses that: the plan cannot be orphaned this way,
        only removed with its entry or its Set."""
        before = snapshot(a_set, list(NEW_TABLES))
        refused(
            a_set,
            "DELETE FROM set_details WHERE collection_id = ?",
            (a_set.ids["set"],),
        )
        assert snapshot(a_set, list(NEW_TABLES)) == before

    def test_a_sets_details_with_no_planned_entries_take_its_chapters(self, db):
        with db.transaction() as conn:
            set_id = make_set(conn)
            make_chapter(conn, set_id, 0, "Warm-up")
            make_chapter(conn, set_id, 1, "Peak")
            conn.execute("DELETE FROM set_details WHERE collection_id = ?", (set_id,))
        assert count(db, "set_chapters") == 0
        assert rows(db, "SELECT kind FROM collections WHERE id = ?", (set_id,)) == [
            {"kind": KIND_SET}
        ]
