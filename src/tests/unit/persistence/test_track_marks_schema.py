#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0026: each track's cue points and beat grid (WAVE-04, DEC-118).

m0026 adds two tables and touches nothing else, so the tests ask three things:

1. **Nothing else changed.** A version-25 library with tracks, a Set, a
   Collection, metadata and an export record is upgraded, and every table it
   had is compared row for row and its DDL character for character.
2. **A fresh database is an upgraded one.** The same schema either way, so a
   user who installs today and one who upgrades hold the same library.
3. **The tables refuse what a reader must never store.** Rekordbox's
   vocabulary is guarded by the reader; each ``CHECK`` is the backstop, and
   each cascade reaches exactly as far as it should.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

NOW = "2026-10-05T12:00:00+00:00"
NEW_TABLES = ("track_cues", "track_beat_grid")


def runner(service: DatabaseService, through: Optional[int] = None) -> MigrationRunner:
    migrations = discover_migrations()
    if through is not None:
        migrations = [m for m in migrations if m.version <= through]
    return MigrationRunner(service, migrations=migrations)


def rows(service, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    return [dict(row) for row in service.connect().execute(sql, params)]


def schema(service) -> List[tuple]:
    return [
        (r["type"], r["name"], r["sql"])
        for r in rows(
            service,
            "SELECT type, name, sql FROM sqlite_master"
            " WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        )
    ]


def user_tables(service) -> List[str]:
    return [
        r["name"]
        for r in rows(
            service,
            "SELECT name FROM sqlite_master WHERE type = 'table'"
            " AND name NOT LIKE 'sqlite_%' AND name != 'schema_version'",
        )
    ]


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    runner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def v25(tmp_path):
    """A version-25 library with something in every kind of table it has."""
    service = DatabaseService(db_path=tmp_path / "v25.db")
    runner(service, 25).migrate()
    tracks = TrackRepository(service)
    tracks.add_many(
        LibraryTrack(
            rekordbox_track_id=str(n),
            file_path=f"/m/{n}.mp3",
            title=f"T{n}",
            artist="A, B",
            bpm=120.0 + n,
        )
        for n in range(1, 6)
    )
    ids = [r["id"] for r in rows(service, "SELECT id FROM tracks ORDER BY id")]
    with service.transaction() as conn:
        for kind, name in (("collection", "Warmups"), ("set", "Friday")):
            node = conn.execute(
                "INSERT INTO collections (parent_id, kind, name, position, depth,"
                " created_at, updated_at) VALUES (NULL, ?, ?, 0, 0, ?, ?)",
                (kind, name, NOW, NOW),
            ).lastrowid
            for position, track in enumerate(ids[:3]):
                conn.execute(
                    "INSERT INTO collection_tracks (collection_id, track_id, position,"
                    " added_at) VALUES (?, ?, ?, ?)",
                    (node, track, position, NOW),
                )
        conn.execute(
            "INSERT INTO track_metadata (track_id, rating, favorite, notes,"
            " created_at, updated_at) VALUES (?, 4, 1, 'Closer', ?, ?)",
            (ids[0], NOW, NOW),
        )
        conn.execute(
            "INSERT INTO derived_indexes (name, version, built_at)"
            " VALUES ('track_credits', 1, ?)",
            (NOW,),
        )
    service.ids = ids
    yield service
    service.close_all()


def everything(service) -> Dict[str, List[Dict[str, Any]]]:
    return {
        table: sorted(rows(service, f"SELECT * FROM {table}"), key=repr)
        for table in user_tables(service)
    }


def m0026():
    return next(m for m in discover_migrations() if m.version == 26)


class TestTheMigration:
    def test_it_follows_the_set_schema(self):
        assert m0026().version == 26
        assert [m.version for m in discover_migrations()][24:26] == [25, 26]

    def test_it_adds_exactly_two_tables(self, v25):
        before = set(user_tables(v25))
        runner(v25, 26).migrate()
        assert set(user_tables(v25)) - before == set(NEW_TABLES)
        assert before <= set(user_tables(v25))

    def test_every_row_and_every_table_it_had_is_unchanged(self, v25):
        tables_before = schema(v25)
        rows_before = everything(v25)
        runner(v25, 26).migrate()
        rows_after = everything(v25)
        for table in NEW_TABLES:
            assert rows_after.pop(table) == []
        assert rows_after == rows_before
        added = {entry for entry in schema(v25) if entry not in tables_before}
        # Both are keyed by (track_id, position) without a rowid, so neither
        # has an index of its own: the two tables are all that is added.
        assert {name for _, name, _ in added} == set(NEW_TABLES)
        assert [entry for entry in tables_before if entry not in schema(v25)] == []

    def test_it_records_no_marks_as_read(self, v25):
        """So an upgraded library has its marks read from its source (the backfill)."""
        runner(v25).migrate()
        assert (
            rows(v25, "SELECT name FROM derived_indexes WHERE name = 'track_marks'")
            == []
        )

    def test_a_fresh_database_equals_an_upgraded_one(self, db, v25):
        runner(v25).migrate()
        assert schema(db) == schema(v25)


def add_cue(conn, track_id: int, position: int = 0, **values) -> None:
    row = {
        "kind": "cue",
        "hot_cue": None,
        "start_ms": 1000,
        "end_ms": None,
        "name": None,
        "color": None,
        **values,
    }
    conn.execute(
        "INSERT INTO track_cues (track_id, position, kind, hot_cue, start_ms,"
        " end_ms, name, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            track_id,
            position,
            row["kind"],
            row["hot_cue"],
            row["start_ms"],
            row["end_ms"],
            row["name"],
            row["color"],
        ),
    )


def add_marker(conn, track_id: int, position: int = 0, **values) -> None:
    row = {"start_ms": 0, "bpm": 128.0, "meter": "4/4", "beat": 1, **values}
    conn.execute(
        "INSERT INTO track_beat_grid (track_id, position, start_ms, bpm, meter, beat)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (track_id, position, row["start_ms"], row["bpm"], row["meter"], row["beat"]),
    )


@pytest.fixture
def track(db) -> int:
    TrackRepository(db).add(
        LibraryTrack(
            rekordbox_track_id="1", file_path="/m/1.mp3", title="T", artist="A"
        )
    )
    return int(rows(db, "SELECT id FROM tracks")[0]["id"])


class TestTheTablesRefuse:
    @pytest.mark.parametrize(
        "values",
        [
            {"kind": "hot"},
            {"kind": "CUE"},
            {"hot_cue": 8},
            {"hot_cue": -1},
            {"start_ms": -1},
            {"end_ms": 1000},
            {"end_ms": 999},
            {"color": "#fff"},
            {"color": "28e214"},
        ],
    )
    def test_a_cue_no_reader_would_store(self, db, track, values):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                add_cue(conn, track, **values)

    @pytest.mark.parametrize(
        "values",
        [{"bpm": 0}, {"bpm": -120.0}, {"start_ms": -1}, {"beat": 0}, {"beat": 5}],
    )
    def test_a_grid_marker_no_reader_would_store(self, db, track, values):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                add_marker(conn, track, **values)

    def test_two_marks_at_one_position(self, db, track):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                add_cue(conn, track, 0)
                add_cue(conn, track, 0)
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                add_marker(conn, track, 0)
                add_marker(conn, track, 0)

    def test_a_mark_for_no_track(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                add_cue(conn, 999)
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                add_marker(conn, 999)

    def test_every_kind_and_slot_it_should_hold(self, db, track):
        with db.transaction() as conn:
            for position, kind in enumerate(
                ("cue", "fade_in", "fade_out", "load", "loop")
            ):
                add_cue(conn, track, position, kind=kind, hot_cue=position)
            add_cue(conn, track, 5, hot_cue=7, end_ms=2000, color="#28e214")
            add_cue(conn, track, 6, hot_cue=None)
            add_marker(conn, track, 0, beat=None, meter=None)
        assert len(rows(db, "SELECT * FROM track_cues")) == 7


class TestCascades:
    def test_a_deleted_track_takes_its_marks_and_only_its_own(self, db):
        repo = TrackRepository(db)
        repo.add_many(
            LibraryTrack(
                rekordbox_track_id=n, file_path=f"/m/{n}.mp3", title=n, artist="A"
            )
            for n in ("1", "2")
        )
        first, second = [r["id"] for r in rows(db, "SELECT id FROM tracks ORDER BY id")]
        with db.transaction() as conn:
            for track in (first, second):
                add_cue(conn, track)
                add_marker(conn, track)
        repo.delete(first)
        assert [r["track_id"] for r in rows(db, "SELECT track_id FROM track_cues")] == [
            second
        ]
        assert [
            r["track_id"] for r in rows(db, "SELECT track_id FROM track_beat_grid")
        ] == [second]
