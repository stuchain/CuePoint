#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for migration 0021 — the Discover schema (DISCOVER-02).

Nine additive tables under user data, landed before anything reads them, so
these are about the ways a forward-only schema can be quietly wrong in a way no
later step could fix without another migration:

1. **A cascade that reaches too far, or not far enough.** A library track takes
   its credits; a run takes its tracks and its sources; a catalog track takes
   its credits and nothing else — a catalog row a run or the wantlist holds
   cannot be deleted at all, and a deleted run leaves the wantlist entry it was
   added from, forgetting only where it came from.
2. **A reason for a track the run never found.** A source references the run's
   *track*, not the run, and a test inserts the stray row and sees it refused.
3. **A vocabulary that drifts from its model.** Each CHECK is read back out of
   ``sqlite_master`` and compared with the constants the models validate
   against, as ``test_clean_schema`` does; and the one vocabulary another layer
   owns — DISCOVER-01's error classes — is shown to be stored, not restated.
4. **A cache re-read that deletes what hangs off it.** ``INSERT OR REPLACE``
   cascades; an upsert does not. Both are run, so the migration's warning is a
   behaviour and not a sentence.
5. **Columns that do not follow what DISCOVER-01 parses.** The catalog table is
   compared with ``CatalogTrack`` field by field, and the fixture track is
   stored and read back through the model.
6. **An index that does not answer the query it exists for.** Every
   referencing column leads an index, and the query plans for the lookups
   later steps make are read back.
7. **An upgrade that touches a user's rows.** A version-20 library with rows in
   the tables a user's has is migrated, and every row compared before and
   after. The migration's SQL is shown to create and nothing else, which is why
   its cost does not grow with the library (measured at 50,000 tracks in the
   step outcome).
"""

from __future__ import annotations

import dataclasses
import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set

import pytest

from cuepoint.incrate.beatport_api_models import CatalogTrack
from cuepoint.migrations import discover_migrations, split_sql_statements
from cuepoint.models.beatport_cache import (
    ENTITY_ARTIST,
    ENTITY_KINDS,
    ENTITY_LABEL,
    BeatportNameLookup,
    CachedBeatportCredit,
    CachedBeatportTrack,
)
from cuepoint.models.discovery_run import (
    RUN_CANCELLED,
    RUN_COUNTS,
    RUN_FAILED,
    RUN_OUTCOMES,
    RUN_SUCCEEDED,
    SOURCE_CHART,
    SOURCE_LABEL_RELEASE,
    SOURCE_TYPES,
    DiscoveryRun,
    DiscoveryRunSource,
    DiscoveryRunTrack,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.track_credit import (
    CREDIT_ROLES,
    ROLE_ARTIST,
    ROLE_REMIXER,
    TRACK_CREDITS_INDEX,
    DerivedIndex,
    TrackCredit,
)
from cuepoint.models.wantlist import WantlistEntry
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.beatport_api_client import BEATPORT_ERROR_CLASSES
from cuepoint.services.beatport_catalog import parse_catalog_track
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-23T12:00:00+00:00"

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "beatport_v4"

#: Every column of every table this migration adds, in declared order.
COLUMNS: Dict[str, tuple] = {
    "beatport_tracks": (
        "beatport_track_id",
        "title",
        "mix_name",
        "url",
        "label_id",
        "label_name",
        "label_key",
        "release_id",
        "release_name",
        "release_date",
        "bpm",
        "key",
        "genre_id",
        "genre_name",
        "fetched_at",
    ),
    "beatport_track_artists": (
        "beatport_track_id",
        "role",
        "position",
        "artist_id",
        "name",
        "name_key",
    ),
    "beatport_name_lookups": (
        "kind",
        "name_key",
        "beatport_id",
        "beatport_name",
        "looked_up_at",
    ),
    "discovery_runs": (
        "id",
        "job_id",
        "started_at",
        "finished_at",
        "outcome",
        "params_json",
        *RUN_COUNTS,
        "error",
        "error_class",
    ),
    "discovery_run_tracks": ("run_id", "beatport_track_id", "position"),
    "discovery_run_sources": (
        "run_id",
        "beatport_track_id",
        "source_type",
        "source_id",
        "source_name",
        "source_url",
        "matched_on",
    ),
    "wantlist": (
        "beatport_track_id",
        "added_at",
        "note",
        "bought_at",
        "added_from_run_id",
    ),
    "track_credits": ("track_id", "role", "position", "name", "name_key"),
    "derived_indexes": ("name", "version", "built_at"),
}

DISCOVER_TABLES = tuple(COLUMNS)

#: The model over each table.
MODELS = {
    "beatport_tracks": CachedBeatportTrack,
    "beatport_track_artists": CachedBeatportCredit,
    "beatport_name_lookups": BeatportNameLookup,
    "discovery_runs": DiscoveryRun,
    "discovery_run_tracks": DiscoveryRunTrack,
    "discovery_run_sources": DiscoveryRunSource,
    "wantlist": WantlistEntry,
    "track_credits": TrackCredit,
    "derived_indexes": DerivedIndex,
}

#: Every index the migration creates, by table: name -> (columns, unique).
CREATED_INDEXES = {
    "beatport_tracks": {
        "idx_beatport_tracks_label": (["label_id"], False),
        "idx_beatport_tracks_label_key": (["label_key"], False),
    },
    "beatport_track_artists": {
        "idx_beatport_track_artists_artist": (
            ["artist_id", "beatport_track_id"],
            False,
        ),
        "idx_beatport_track_artists_name": (["name_key", "beatport_track_id"], False),
    },
    "beatport_name_lookups": {},
    "discovery_runs": {},
    "discovery_run_tracks": {
        "idx_discovery_run_tracks_track": (["beatport_track_id"], False),
        "idx_discovery_run_tracks_position": (["run_id", "position"], True),
    },
    "discovery_run_sources": {},
    "wantlist": {"idx_wantlist_run": (["added_from_run_id"], False)},
    "track_credits": {"idx_track_credits_name": (["name_key", "track_id"], False)},
    "derived_indexes": {},
}

TRACK_URL = "https://www.beatport.com/track/lantern-signal/{id}"


# --------------------------------------------------------------------- helpers


def _migrations_up_to(version: int):
    return [m for m in discover_migrations() if m.version <= version]


def _migration(version: int):
    return {m.version: m for m in discover_migrations()}[version]


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


def execute(service, sql: str, params: Iterable[Any] = ()) -> None:
    with service.transaction() as conn:
        conn.execute(sql, tuple(params))


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
    """Every index on a table: its origin, uniqueness and columns in order."""
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


def foreign_keys_of(service, table: str) -> Dict[tuple, Dict[str, Any]]:
    """Each reference, keyed by its columns: target table, columns, delete action."""
    grouped: Dict[int, Dict[str, Any]] = {}
    for row in service.connect().execute(f"PRAGMA foreign_key_list({table})"):
        entry = grouped.setdefault(
            row["id"],
            {
                "table": row["table"],
                "from": [],
                "to": [],
                "on_delete": row["on_delete"],
            },
        )
        entry["from"].append(row["from"])
        entry["to"].append(row["to"])
    return {
        tuple(entry["from"]): {
            "table": entry["table"],
            "to": tuple(entry["to"]),
            "on_delete": entry["on_delete"],
        }
        for entry in grouped.values()
    }


def plan(service, sql: str, params: Iterable[Any] = ()) -> str:
    rows = service.connect().execute(f"EXPLAIN QUERY PLAN {sql}", tuple(params))
    return " | ".join(str(row["detail"]) for row in rows)


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


# ------------------------------------------------------------- raw row builders


def catalog_row(track_id: int = 19000001, **overrides: Any) -> Dict[str, Any]:
    """A raw ``beatport_tracks`` row the table accepts."""
    row = dict(
        beatport_track_id=track_id,
        title="Lantern Signal",
        mix_name="Original Mix",
        url=TRACK_URL.format(id=track_id),
        label_id=40211,
        label_name="Nightfall Audio",
        label_key="nightfall audio",
        release_id=4500001,
        release_name="Lantern Signal EP",
        release_date="2026-08-14",
        bpm=124.0,
        key="Ebm",
        genre_id=5,
        genre_name="House",
        fetched_at=NOW,
    )
    row.update(overrides)
    return row


def add_catalog(service, track_id: int = 19000001, **overrides: Any) -> int:
    insert(service, "beatport_tracks", catalog_row(track_id, **overrides))
    return track_id


def add_beatport_credit(
    service,
    track_id: int,
    role: str = ROLE_ARTIST,
    position: int = 0,
    **overrides: Any,
) -> None:
    row = dict(
        beatport_track_id=track_id,
        role=role,
        position=position,
        artist_id=301001,
        name="Mara Veil",
        name_key="mara veil",
    )
    row.update(overrides)
    insert(service, "beatport_track_artists", row)


def run_row(**overrides: Any) -> Dict[str, Any]:
    """A raw ``discovery_runs`` row the table accepts: a finished success."""
    row = dict(
        job_id="job-1",
        started_at=NOW,
        finished_at=NOW,
        outcome=RUN_SUCCEEDED,
        params_json=json.dumps({"genres": [5], "days": 30}),
        labels_in_scope=12,
        labels_resolved=10,
        artists_in_scope=40,
        charts_read=3,
        releases_read=8,
        tracks_found=2,
        error=None,
        error_class=None,
    )
    row.update(overrides)
    return row


def add_run(service, **overrides: Any) -> int:
    return insert(service, "discovery_runs", run_row(**overrides))


def add_run_track(service, run_id: int, track_id: int, position: int = 0) -> None:
    insert(
        service,
        "discovery_run_tracks",
        dict(run_id=run_id, beatport_track_id=track_id, position=position),
    )


def source_row(run_id: int, track_id: int, **overrides: Any) -> Dict[str, Any]:
    row = dict(
        run_id=run_id,
        beatport_track_id=track_id,
        source_type=SOURCE_CHART,
        source_id=880001,
        source_name="Late Hours",
        source_url="https://www.beatport.com/chart/late-hours/880001",
        matched_on="Mara Veil",
    )
    row.update(overrides)
    return row


def add_source(service, run_id: int, track_id: int, **overrides: Any) -> None:
    insert(service, "discovery_run_sources", source_row(run_id, track_id, **overrides))


def add_want(service, track_id: int, **overrides: Any) -> None:
    row = dict(
        beatport_track_id=track_id,
        added_at=NOW,
        note=None,
        bought_at=None,
        added_from_run_id=None,
    )
    row.update(overrides)
    insert(service, "wantlist", row)


def add_library_tracks(service, n: int = 3) -> List[int]:
    TrackRepository(service).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"rb-{i}",
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist="Mara Veil, Dub Phizix Jr",
            )
            for i in range(1, n + 1)
        ]
    )
    return [
        int(row["id"])
        for row in service.connect().execute("SELECT id FROM tracks ORDER BY id")
    ]


def add_track_credit(
    service, track_id: int, role: str = ROLE_ARTIST, position: int = 0, **overrides
) -> None:
    row = dict(
        track_id=track_id,
        role=role,
        position=position,
        name="Mara Veil",
        name_key="mara veil",
    )
    row.update(overrides)
    insert(service, "track_credits", row)


# ------------------------------------------------------------------- the shape


@pytest.mark.unit
class TestTheMigration:
    def test_it_is_discovered_as_version_twenty_one(self):
        assert _migration(21).module_name == "m0021_discover"

    def test_a_fresh_database_ends_at_version_twenty_one_or_later(self, db):
        assert MigrationRunner(db).current_version() >= 21

    @pytest.mark.parametrize("table", DISCOVER_TABLES)
    def test_each_table_has_exactly_its_columns_in_order(self, db, table):
        assert columns_of(db, table) == list(COLUMNS[table])

    @pytest.mark.parametrize("table", DISCOVER_TABLES)
    def test_each_model_is_exactly_its_table(self, db, table):
        """A column the model does not carry is a column nothing can write."""
        fields = {f.name for f in dataclasses.fields(MODELS[table])}
        assert set(columns_of(db, table)) == fields

    def test_it_creates_and_does_nothing_else(self):
        """Every statement is a CREATE of something new, so nothing it runs
        reads or rewrites an existing row and its cost cannot grow with the
        library. Measured at 50,000 tracks in the step outcome."""
        statements = split_sql_statements(_migration(21).sql)
        assert statements
        for statement in statements:
            assert re.match(
                r"CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s", statement, re.IGNORECASE
            ), statement
        created = {
            re.search(r"CREATE\s+TABLE\s+(\w+)", s).group(1)
            for s in statements
            if re.match(r"CREATE\s+TABLE", s)
        }
        assert created == set(DISCOVER_TABLES)

    def test_its_indexes_are_only_on_its_own_tables(self):
        for statement in split_sql_statements(_migration(21).sql):
            on = re.search(r"\bON\s+(\w+)\s*\(", statement)
            if on:
                assert on.group(1) in DISCOVER_TABLES, statement

    def test_foreign_keys_are_enforced_on_this_connection(self, db):
        assert db.connect().execute("PRAGMA foreign_keys").fetchone()[0] == 1

    def test_a_run_id_is_never_reused_after_a_delete(self, db):
        """``AUTOINCREMENT``: an id in an activity event must keep naming one run."""
        first = add_run(db)
        execute(db, "DELETE FROM discovery_runs WHERE id = ?", (first,))
        assert add_run(db) > first

    def test_nothing_stores_ownership(self, db):
        """DEC-092: owned is computed when read, never a column."""
        for table in DISCOVER_TABLES:
            assert not [c for c in columns_of(db, table) if "own" in c], table


# ------------------------------------------------------------------ the indexes


@pytest.mark.unit
class TestTheIndexes:
    @pytest.mark.parametrize("table", DISCOVER_TABLES)
    def test_each_table_has_exactly_the_indexes_the_migration_names(self, db, table):
        created = {
            name: (info["columns"], info["unique"])
            for name, info in indexes_on(db, table).items()
            if info["origin"] == "c"
        }
        assert created == CREATED_INDEXES[table]

    @pytest.mark.parametrize("table", DISCOVER_TABLES)
    def test_every_reference_leads_an_index(self, db, table):
        """m0009's rule: a parent delete must find the children by index."""
        leading = [info["columns"] for info in indexes_on(db, table).values()]
        primary = [
            row["name"]
            for row in sorted(
                db.connect().execute(f"PRAGMA table_info({table})"),
                key=lambda r: r["pk"],
            )
            if row["pk"]
        ]
        if primary:
            leading.append(primary)
        for columns in foreign_keys_of(db, table):
            assert any(index[: len(columns)] == list(columns) for index in leading), (
                table,
                columns,
            )

    def test_the_credit_rule_is_one_covering_seek(self, db):
        """DISCOVER-03's ``artist_name`` rule reads no credit row, only the index."""
        detail = plan(
            db,
            "SELECT count(*) FROM tracks WHERE EXISTS (SELECT 1 FROM track_credits"
            " WHERE track_id = tracks.id AND name_key = ?)",
            ("mara veil",),
        )
        assert (
            "SEARCH track_credits USING COVERING INDEX idx_track_credits_name"
            " (name_key=? AND track_id=?)"
        ) in detail, detail

    def test_tracks_by_a_credited_name_use_the_name_index(self, db):
        detail = plan(
            db, "SELECT track_id FROM track_credits WHERE name_key = ?", ("x",)
        )
        assert "COVERING INDEX idx_track_credits_name" in detail, detail

    def test_a_beatport_artists_tracks_use_the_artist_index(self, db):
        detail = plan(
            db,
            "SELECT beatport_track_id FROM beatport_track_artists WHERE artist_id = ?",
            (1,),
        )
        assert "COVERING INDEX idx_beatport_track_artists_artist" in detail, detail

    def test_a_beatport_name_uses_the_name_index(self, db):
        detail = plan(
            db,
            "SELECT beatport_track_id FROM beatport_track_artists WHERE name_key = ?",
            ("x",),
        )
        assert "COVERING INDEX idx_beatport_track_artists_name" in detail, detail

    @pytest.mark.parametrize(
        "column, index",
        [
            ("label_id", "idx_beatport_tracks_label"),
            ("label_key", "idx_beatport_tracks_label_key"),
        ],
    )
    def test_a_labels_cached_tracks_use_their_index(self, db, column, index):
        detail = plan(db, f"SELECT * FROM beatport_tracks WHERE {column} = ?", (1,))
        assert index in detail, detail

    def test_a_run_reads_in_first_seen_order_without_sorting(self, db):
        detail = plan(
            db,
            "SELECT beatport_track_id FROM discovery_run_tracks WHERE run_id = ?"
            " ORDER BY position LIMIT 50 OFFSET 100",
            (1,),
        )
        assert "idx_discovery_run_tracks_position" in detail, detail
        assert "TEMP B-TREE" not in detail, detail

    def test_a_run_gives_each_place_in_its_order_to_one_track(self, db):
        run = add_run(db)
        add_run_track(db, run, add_catalog(db, 1), position=0)
        with pytest.raises(sqlite3.IntegrityError):
            add_run_track(db, run, add_catalog(db, 2), position=0)

    def test_two_runs_may_both_have_a_first_track(self, db):
        track = add_catalog(db, 1)
        add_run_track(db, add_run(db), track, position=0)
        add_run_track(db, add_run(db), track, position=0)
        assert count(db, "SELECT count(*) FROM discovery_run_tracks") == 2


# --------------------------------------------------------------- the references


@pytest.mark.unit
class TestTheReferences:
    def test_the_whole_reference_map(self, db):
        """Every reference, what it points at and what a delete does."""
        assert {table: foreign_keys_of(db, table) for table in DISCOVER_TABLES} == {
            "beatport_tracks": {},
            "beatport_track_artists": {
                ("beatport_track_id",): {
                    "table": "beatport_tracks",
                    "to": ("beatport_track_id",),
                    "on_delete": "CASCADE",
                }
            },
            "beatport_name_lookups": {},
            "discovery_runs": {},
            "discovery_run_tracks": {
                ("run_id",): {
                    "table": "discovery_runs",
                    "to": ("id",),
                    "on_delete": "CASCADE",
                },
                ("beatport_track_id",): {
                    "table": "beatport_tracks",
                    "to": ("beatport_track_id",),
                    "on_delete": "NO ACTION",
                },
            },
            "discovery_run_sources": {
                ("run_id", "beatport_track_id"): {
                    "table": "discovery_run_tracks",
                    "to": ("run_id", "beatport_track_id"),
                    "on_delete": "CASCADE",
                }
            },
            "wantlist": {
                ("beatport_track_id",): {
                    "table": "beatport_tracks",
                    "to": ("beatport_track_id",),
                    "on_delete": "NO ACTION",
                },
                ("added_from_run_id",): {
                    "table": "discovery_runs",
                    "to": ("id",),
                    "on_delete": "SET NULL",
                },
            },
            "track_credits": {
                ("track_id",): {
                    "table": "tracks",
                    "to": ("id",),
                    "on_delete": "CASCADE",
                }
            },
            "derived_indexes": {},
        }

    def test_only_the_credit_index_names_a_library_track(self, db):
        """A Beatport track a user does not own has no ``tracks`` row, and
        nothing on the Beatport side pretends it does (DEC-093)."""
        naming_tracks = [
            table
            for table in DISCOVER_TABLES
            if any(
                fk["table"] == "tracks" for fk in foreign_keys_of(db, table).values()
            )
        ]
        assert naming_tracks == ["track_credits"]


@pytest.mark.unit
class TestDeletingALibraryTrack:
    def test_it_takes_its_credits(self, db):
        first, second, _ = add_library_tracks(db)
        add_track_credit(db, first)
        add_track_credit(db, first, ROLE_REMIXER, 0, name="Dub", name_key="dub")
        add_track_credit(db, second)
        execute(db, "DELETE FROM tracks WHERE id = ?", (first,))
        assert count(db, "SELECT count(*) FROM track_credits") == 1
        assert (
            count(
                db, "SELECT count(*) FROM track_credits WHERE track_id = ?", (second,)
            )
            == 1
        )

    def test_a_credit_cannot_name_a_track_that_is_not_there(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            add_track_credit(db, 9999)

    def test_it_leaves_the_beatport_side_alone(self, db):
        first, *_ = add_library_tracks(db)
        track = add_catalog(db)
        add_beatport_credit(db, track)
        add_want(db, track)
        execute(db, "DELETE FROM tracks WHERE id = ?", (first,))
        for table in ("beatport_tracks", "beatport_track_artists", "wantlist"):
            assert count(db, f"SELECT count(*) FROM {table}") == 1, table


@pytest.mark.unit
class TestDeletingACatalogTrack:
    def test_an_unreferenced_one_takes_its_credits(self, db):
        track = add_catalog(db)
        add_beatport_credit(db, track, ROLE_ARTIST, 0)
        add_beatport_credit(db, track, ROLE_ARTIST, 1, name="B", name_key="b")
        add_beatport_credit(db, track, ROLE_REMIXER, 0, name="R", name_key="r")
        execute(db, "DELETE FROM beatport_tracks WHERE beatport_track_id = ?", (track,))
        assert count(db, "SELECT count(*) FROM beatport_track_artists") == 0

    def test_one_on_the_wantlist_cannot_be_deleted(self, db):
        track = add_catalog(db)
        add_want(db, track)
        with pytest.raises(sqlite3.IntegrityError):
            execute(
                db, "DELETE FROM beatport_tracks WHERE beatport_track_id = ?", (track,)
            )

    def test_one_a_run_found_cannot_be_deleted(self, db):
        track = add_catalog(db)
        add_run_track(db, add_run(db), track)
        with pytest.raises(sqlite3.IntegrityError):
            execute(
                db, "DELETE FROM beatport_tracks WHERE beatport_track_id = ?", (track,)
            )

    def test_a_refused_delete_leaves_everything_as_it_was(self, db):
        track = add_catalog(db)
        add_beatport_credit(db, track)
        add_want(db, track)
        before = snapshot(db)
        with pytest.raises(sqlite3.IntegrityError):
            execute(
                db, "DELETE FROM beatport_tracks WHERE beatport_track_id = ?", (track,)
            )
        assert snapshot(db) == before

    def test_a_cache_prune_takes_only_what_nothing_holds(self, db):
        """The delete a cache prune would run: the unheld row goes, and the
        held rows stay because the prune names only unheld ones."""
        held, wanted, loose = add_catalog(db, 1), add_catalog(db, 2), add_catalog(db, 3)
        add_run_track(db, add_run(db), held)
        add_want(db, wanted)
        execute(
            db,
            "DELETE FROM beatport_tracks WHERE beatport_track_id NOT IN"
            " (SELECT beatport_track_id FROM discovery_run_tracks)"
            " AND beatport_track_id NOT IN (SELECT beatport_track_id FROM wantlist)",
        )
        remaining = {
            row[0]
            for row in db.connect().execute(
                "SELECT beatport_track_id FROM beatport_tracks"
            )
        }
        assert remaining == {held, wanted} and loose not in remaining

    @pytest.mark.parametrize(
        "table, row",
        [
            ("beatport_track_artists", "credit"),
            ("discovery_run_tracks", "run_track"),
            ("wantlist", "want"),
        ],
    )
    def test_nothing_can_name_a_catalog_track_that_is_not_there(self, db, table, row):
        with pytest.raises(sqlite3.IntegrityError):
            if row == "credit":
                add_beatport_credit(db, 12345)
            elif row == "run_track":
                add_run_track(db, add_run(db), 12345)
            else:
                add_want(db, 12345)


@pytest.mark.unit
class TestDeletingARun:
    @pytest.fixture
    def run_with_everything(self, db):
        run = add_run(db)
        first, second = add_catalog(db, 1), add_catalog(db, 2)
        add_run_track(db, run, first, 0)
        add_run_track(db, run, second, 1)
        add_source(db, run, first, source_id=880001)
        add_source(db, run, first, source_id=880002)
        add_source(
            db,
            run,
            second,
            source_type=SOURCE_LABEL_RELEASE,
            source_id=4500001,
            matched_on="Nightfall Audio",
        )
        add_want(db, first, added_from_run_id=run)
        return run

    def test_it_takes_its_tracks_and_every_source(self, db, run_with_everything):
        execute(db, "DELETE FROM discovery_runs WHERE id = ?", (run_with_everything,))
        assert count(db, "SELECT count(*) FROM discovery_run_tracks") == 0
        assert count(db, "SELECT count(*) FROM discovery_run_sources") == 0

    def test_it_leaves_the_catalog(self, db, run_with_everything):
        execute(db, "DELETE FROM discovery_runs WHERE id = ?", (run_with_everything,))
        assert count(db, "SELECT count(*) FROM beatport_tracks") == 2

    def test_the_wantlist_entry_stays_and_forgets_the_run(
        self, db, run_with_everything
    ):
        execute(db, "DELETE FROM discovery_runs WHERE id = ?", (run_with_everything,))
        row = db.connect().execute("SELECT * FROM wantlist").fetchone()
        assert row["beatport_track_id"] == 1
        assert row["added_from_run_id"] is None

    def test_it_leaves_other_runs_alone(self, db, run_with_everything):
        other = add_run(db)
        add_run_track(db, other, 1, 0)
        add_source(db, other, 1)
        execute(db, "DELETE FROM discovery_runs WHERE id = ?", (run_with_everything,))
        assert count(db, "SELECT count(*) FROM discovery_run_tracks") == 1
        assert count(db, "SELECT count(*) FROM discovery_run_sources") == 1

    def test_removing_one_track_from_a_run_takes_its_reasons(
        self, db, run_with_everything
    ):
        execute(
            db,
            "DELETE FROM discovery_run_tracks WHERE run_id = ? AND beatport_track_id = 1",
            (run_with_everything,),
        )
        assert count(db, "SELECT count(*) FROM discovery_run_sources") == 1


@pytest.mark.unit
class TestEveryReasonIsForATrackTheRunFound:
    def test_a_reason_for_a_track_the_run_never_listed_is_refused(self, db):
        run = add_run(db)
        listed, never = add_catalog(db, 1), add_catalog(db, 2)
        add_run_track(db, run, listed)
        with pytest.raises(sqlite3.IntegrityError):
            add_source(db, run, never)

    def test_a_reason_for_a_run_that_is_not_there_is_refused(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            add_source(db, 999, add_catalog(db))

    def test_a_track_can_be_found_for_several_reasons(self, db):
        """inCrate kept the first source; every one is kept here."""
        run, track = add_run(db), add_catalog(db)
        add_run_track(db, run, track)
        add_source(db, run, track, source_id=1)
        add_source(db, run, track, source_id=2)
        add_source(
            db,
            run,
            track,
            source_type=SOURCE_LABEL_RELEASE,
            source_id=1,
            matched_on="Nightfall Audio",
        )
        assert count(db, "SELECT count(*) FROM discovery_run_sources") == 3

    def test_the_same_reason_twice_is_refused(self, db):
        run, track = add_run(db), add_catalog(db)
        add_run_track(db, run, track)
        add_source(db, run, track)
        with pytest.raises(sqlite3.IntegrityError):
            add_source(db, run, track)


# ------------------------------------------------------------- the vocabularies


VOCABULARIES = [
    ("beatport_track_artists", "role", CREDIT_ROLES),
    ("track_credits", "role", CREDIT_ROLES),
    ("beatport_name_lookups", "kind", ENTITY_KINDS),
    ("discovery_runs", "outcome", RUN_OUTCOMES),
    ("discovery_run_sources", "source_type", SOURCE_TYPES),
]


@pytest.mark.unit
class TestTheVocabularies:
    @pytest.mark.parametrize("table, column, vocabulary", VOCABULARIES)
    def test_each_check_says_what_the_model_says(self, db, table, column, vocabulary):
        assert check_vocabulary(db, table, column) == set(vocabulary)

    def test_the_two_credit_tables_share_one_vocabulary(self, db):
        assert check_vocabulary(db, "track_credits", "role") == check_vocabulary(
            db, "beatport_track_artists", "role"
        )

    @pytest.mark.parametrize("role", CREDIT_ROLES)
    def test_every_role_is_accepted_on_both_sides(self, db, role):
        add_beatport_credit(db, add_catalog(db), role)
        add_track_credit(db, add_library_tracks(db, 1)[0], role)

    @pytest.mark.parametrize("value", ["featuring", "ARTIST", "", "producer"])
    def test_a_role_outside_the_vocabulary_is_refused_on_both_sides(self, db, value):
        track = add_catalog(db)
        with pytest.raises(sqlite3.IntegrityError):
            add_beatport_credit(db, track, value)
        with pytest.raises(sqlite3.IntegrityError):
            add_track_credit(db, add_library_tracks(db, 1)[0], value)

    @pytest.mark.parametrize("kind", ENTITY_KINDS)
    def test_every_lookup_kind_is_accepted(self, db, kind):
        insert(
            db,
            "beatport_name_lookups",
            dict(kind=kind, name_key="x", looked_up_at=NOW),
        )

    @pytest.mark.parametrize("value", ["genre", "Label", "", "track"])
    def test_a_lookup_kind_outside_the_vocabulary_is_refused(self, db, value):
        with pytest.raises(sqlite3.IntegrityError):
            insert(
                db,
                "beatport_name_lookups",
                dict(kind=value, name_key="x", looked_up_at=NOW),
            )

    @pytest.mark.parametrize("outcome", RUN_OUTCOMES)
    def test_every_outcome_is_accepted(self, db, outcome):
        error = "Beatport rejected the token" if outcome == RUN_FAILED else None
        assert add_run(db, outcome=outcome, error=error) > 0

    def test_a_running_run_has_no_outcome(self, db):
        assert add_run(db, outcome=None, finished_at=None) > 0

    @pytest.mark.parametrize("value", ["running", "SUCCEEDED", "", "written"])
    def test_an_outcome_outside_the_vocabulary_is_refused(self, db, value):
        with pytest.raises(sqlite3.IntegrityError):
            add_run(db, outcome=value)

    @pytest.mark.parametrize("source_type", SOURCE_TYPES)
    def test_every_source_type_is_accepted(self, db, source_type):
        run, track = add_run(db), add_catalog(db)
        add_run_track(db, run, track)
        add_source(db, run, track, source_type=source_type)

    @pytest.mark.parametrize("value", ["artist_release", "CHART", "", "search"])
    def test_a_source_type_outside_the_vocabulary_is_refused(self, db, value):
        run, track = add_run(db), add_catalog(db)
        add_run_track(db, run, track)
        with pytest.raises(sqlite3.IntegrityError):
            add_source(db, run, track, source_type=value)


@pytest.mark.unit
class TestTheErrorClassIsNotRestated:
    """DISCOVER-01 owns the five classes; this schema stores them."""

    @pytest.mark.parametrize("error_class", BEATPORT_ERROR_CLASSES)
    def test_every_class_is_storable(self, db, error_class):
        run = add_run(db, outcome=RUN_FAILED, error="x", error_class=error_class)
        stored = (
            db.connect()
            .execute("SELECT error_class FROM discovery_runs WHERE id = ?", (run,))
            .fetchone()
        )
        assert stored["error_class"] == error_class

    def test_the_column_carries_no_check_of_its_own(self, db):
        sql = table_sql(db, "discovery_runs")
        assert "error_class" in sql
        assert not re.search(r"error_class[^,]*CHECK", sql, re.DOTALL)

    def test_the_model_defines_no_vocabulary_of_its_own(self):
        import cuepoint.models.discovery_run as module

        wanted = set(BEATPORT_ERROR_CLASSES)
        for name, value in vars(module).items():
            if isinstance(value, (tuple, list, set, frozenset)):
                assert not wanted & {str(item) for item in value}, name

    @pytest.mark.parametrize("error_class", BEATPORT_ERROR_CLASSES)
    def test_the_model_accepts_every_class(self, error_class):
        run = DiscoveryRun(
            started_at=NOW,
            params_json="{}",
            finished_at=NOW,
            outcome=RUN_FAILED,
            error="Beatport said no",
            error_class=error_class,
        )
        assert run.error_class == error_class


@pytest.mark.unit
class TestRequiredAndOptional:
    REQUIRED = {
        "beatport_tracks": ("beatport_track_id", "title", "url", "fetched_at"),
        "beatport_track_artists": (
            "beatport_track_id",
            "role",
            "position",
            "name",
            "name_key",
        ),
        "beatport_name_lookups": ("kind", "name_key", "looked_up_at"),
        "discovery_runs": ("started_at", "params_json", *RUN_COUNTS),
        "discovery_run_tracks": ("run_id", "beatport_track_id", "position"),
        "discovery_run_sources": (
            "run_id",
            "beatport_track_id",
            "source_type",
            "source_id",
            "matched_on",
        ),
        "wantlist": ("beatport_track_id", "added_at"),
        "track_credits": ("track_id", "role", "position", "name", "name_key"),
        "derived_indexes": ("name", "version", "built_at"),
    }

    def _row(self, db, table: str) -> Dict[str, Any]:
        """A valid raw row for ``table``, with its parents inserted."""
        if table == "beatport_tracks":
            return catalog_row(77)
        if table == "beatport_track_artists":
            return dict(
                beatport_track_id=add_catalog(db, 77),
                role=ROLE_ARTIST,
                position=0,
                artist_id=1,
                name="A",
                name_key="a",
            )
        if table == "beatport_name_lookups":
            return dict(kind=ENTITY_LABEL, name_key="a", looked_up_at=NOW)
        if table == "discovery_runs":
            return run_row()
        if table == "discovery_run_tracks":
            return dict(
                run_id=add_run(db), beatport_track_id=add_catalog(db, 77), position=0
            )
        if table == "discovery_run_sources":
            run, track = add_run(db), add_catalog(db, 77)
            add_run_track(db, run, track)
            return source_row(run, track)
        if table == "wantlist":
            return dict(beatport_track_id=add_catalog(db, 77), added_at=NOW)
        if table == "track_credits":
            return dict(
                track_id=add_library_tracks(db, 1)[0],
                role=ROLE_ARTIST,
                position=0,
                name="A",
                name_key="a",
            )
        return dict(name=TRACK_CREDITS_INDEX, version=1, built_at=NOW)

    @pytest.mark.parametrize(
        "table, column",
        [(table, column) for table, columns in REQUIRED.items() for column in columns],
    )
    def test_a_required_column_cannot_be_null(self, db, table, column):
        row = self._row(db, table)
        row[column] = None
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, table, row)

    @pytest.mark.parametrize("table", DISCOVER_TABLES)
    def test_a_valid_row_is_accepted(self, db, table):
        insert(db, table, self._row(db, table))
        assert count(db, f"SELECT count(*) FROM {table}") == 1

    @pytest.mark.parametrize(
        "table, column",
        [
            ("beatport_tracks", c)
            for c in COLUMNS["beatport_tracks"]
            if c not in ("beatport_track_id", "title", "url", "fetched_at")
        ]
        + [
            ("beatport_track_artists", "artist_id"),
            ("beatport_name_lookups", "beatport_id"),
            ("beatport_name_lookups", "beatport_name"),
            ("discovery_runs", "job_id"),
            ("discovery_runs", "finished_at"),
            ("discovery_runs", "error"),
            ("discovery_runs", "error_class"),
            ("discovery_run_sources", "source_name"),
            ("discovery_run_sources", "source_url"),
            ("wantlist", "note"),
            ("wantlist", "bought_at"),
            ("wantlist", "added_from_run_id"),
        ],
    )
    def test_an_optional_column_may_be_absent(self, db, table, column):
        row = self._row(db, table)
        row[column] = None
        insert(db, table, row)

    def test_every_count_on_a_run_starts_at_zero(self, db):
        run = insert(db, "discovery_runs", dict(started_at=NOW, params_json="{}"))
        row = (
            db.connect()
            .execute("SELECT * FROM discovery_runs WHERE id = ?", (run,))
            .fetchone()
        )
        assert {name: row[name] for name in RUN_COUNTS} == dict.fromkeys(RUN_COUNTS, 0)
        assert row["outcome"] is None and row["finished_at"] is None

    def test_searched_and_not_found_is_a_row(self, db):
        """DEC-091: "nothing" is an answer the cache keeps."""
        insert(
            db,
            "beatport_name_lookups",
            dict(kind=ENTITY_LABEL, name_key="nobody", looked_up_at=NOW),
        )
        row = db.connect().execute("SELECT * FROM beatport_name_lookups").fetchone()
        assert row["beatport_id"] is None

    def test_one_lookup_per_kind_and_name(self, db):
        lookup = dict(kind=ENTITY_LABEL, name_key="nightfall audio", looked_up_at=NOW)
        insert(db, "beatport_name_lookups", lookup)
        insert(db, "beatport_name_lookups", {**lookup, "kind": ENTITY_ARTIST})
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "beatport_name_lookups", lookup)

    def test_one_wantlist_entry_per_track(self, db):
        track = add_catalog(db)
        add_want(db, track)
        with pytest.raises(sqlite3.IntegrityError):
            add_want(db, track)


@pytest.mark.unit
class TestABeatportIdIsNeverInvented:
    """In a rowid table an ``INTEGER PRIMARY KEY`` answers ``NULL`` with the
    next free number. Both tables keyed by a Beatport id have no rowid, so a
    lost id is refused instead of stored as one Beatport never gave."""

    @pytest.mark.parametrize("table", ["beatport_tracks", "wantlist"])
    def test_the_table_has_no_rowid(self, db, table):
        assert "WITHOUT ROWID" in table_sql(db, table)

    def test_a_catalog_row_with_no_id_is_refused(self, db):
        row = catalog_row()
        row["beatport_track_id"] = None
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "beatport_tracks", row)

    def test_a_catalog_row_that_leaves_the_id_out_is_refused(self, db):
        row = catalog_row()
        del row["beatport_track_id"]
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "beatport_tracks", row)
        assert count(db, "SELECT count(*) FROM beatport_tracks") == 0

    def test_a_wantlist_entry_with_no_id_is_refused_even_when_one_would_fit(self, db):
        """The case a rowid table gets wrong: catalog track 1 exists, so an
        invented id of 1 would even pass the foreign key."""
        add_catalog(db, 1)
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "wantlist", dict(beatport_track_id=None, added_at=NOW))
        assert count(db, "SELECT count(*) FROM wantlist") == 0

    def test_a_text_id_is_stored_as_the_number(self, db):
        insert(db, "beatport_tracks", catalog_row("19000001"))
        row = (
            db.connect()
            .execute(
                "SELECT beatport_track_id, typeof(beatport_track_id) AS t"
                " FROM beatport_tracks"
            )
            .fetchone()
        )
        assert (row["beatport_track_id"], row["t"]) == (19000001, "integer")

    def test_a_derived_index_needs_a_name(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            insert(db, "derived_indexes", dict(name=None, version=1, built_at=NOW))


# ------------------------------------------------------ a re-read is an upsert


UPSERT = (
    "INSERT INTO beatport_tracks ({cols}) VALUES ({marks})"
    " ON CONFLICT (beatport_track_id) DO UPDATE SET {sets}"
)


def upsert_catalog(db, row: Dict[str, Any]) -> None:
    cols = list(row)
    execute(
        db,
        UPSERT.format(
            cols=", ".join(cols),
            marks=", ".join("?" for _ in cols),
            sets=", ".join(
                f"{c} = excluded.{c}" for c in cols if c != "beatport_track_id"
            ),
        ),
        tuple(row.values()),
    )


@pytest.mark.unit
class TestAReReadIsAnUpsert:
    @pytest.fixture
    def held(self, db):
        """A catalog track with credits, on the wantlist and in a run."""
        track = add_catalog(db)
        add_beatport_credit(db, track, ROLE_ARTIST, 0)
        add_beatport_credit(db, track, ROLE_REMIXER, 0, name="R", name_key="r")
        run = add_run(db)
        add_run_track(db, run, track)
        add_source(db, run, track)
        add_want(db, track, added_from_run_id=run, note="the dub")
        return track

    def test_an_upsert_changes_the_values(self, db, held):
        upsert_catalog(db, catalog_row(held, title="Lantern Signal (Edit)", bpm=125.0))
        row = db.connect().execute("SELECT * FROM beatport_tracks").fetchone()
        assert (row["title"], row["bpm"]) == ("Lantern Signal (Edit)", 125.0)

    def test_an_upsert_keeps_everything_that_hangs_off_the_row(self, db, held):
        before = snapshot(db)
        upsert_catalog(db, catalog_row(held, fetched_at="2026-09-24T00:00:00+00:00"))
        after = snapshot(db)
        for table in (
            "beatport_track_artists",
            "discovery_run_tracks",
            "discovery_run_sources",
            "wantlist",
        ):
            assert after[table] == before[table], table

    def test_insert_or_replace_would_silently_drop_the_credits(self, db, held):
        """Why the migration forbids it: the delete half cascades, and no error
        says so. The references that do not cascade survive only because the
        row is back by the end of the statement."""
        row = catalog_row(held)
        execute(
            db,
            f"INSERT OR REPLACE INTO beatport_tracks ({', '.join(row)})"
            f" VALUES ({', '.join('?' for _ in row)})",
            tuple(row.values()),
        )
        assert count(db, "SELECT count(*) FROM beatport_track_artists") == 0
        assert count(db, "SELECT count(*) FROM wantlist") == 1


# ------------------------------------------- the columns follow DISCOVER-01


def _fixture_track() -> CatalogTrack:
    raw = json.loads((FIXTURES / "track.json").read_text(encoding="utf-8"))
    track = parse_catalog_track(raw)
    assert track is not None
    return track


@pytest.mark.unit
class TestTheCatalogFollowsDiscover01:
    #: CatalogTrack's name for a field -> the column it is stored in. The two
    #: credit lists are rows of ``beatport_track_artists`` instead.
    RENAMED = {"id": "beatport_track_id"}
    AS_CREDITS = {"artists": ROLE_ARTIST, "remixers": ROLE_REMIXER}

    def test_every_parsed_field_has_a_home(self, db):
        columns = set(columns_of(db, "beatport_tracks"))
        for field in dataclasses.fields(CatalogTrack):
            if field.name in self.AS_CREDITS:
                assert self.AS_CREDITS[field.name] in CREDIT_ROLES
                continue
            assert self.RENAMED.get(field.name, field.name) in columns, field.name

    def test_the_only_columns_the_parser_does_not_give_are_derived_or_stamped(self, db):
        parsed = {
            self.RENAMED.get(f.name, f.name)
            for f in dataclasses.fields(CatalogTrack)
            if f.name not in self.AS_CREDITS
        }
        assert set(columns_of(db, "beatport_tracks")) - parsed == {
            "label_key",
            "fetched_at",
        }

    def test_the_fixture_track_stores_and_reads_back(self, db):
        """Two artists, one with an accent, a remixer, a key and a label."""
        track = _fixture_track()
        cached = CachedBeatportTrack(
            beatport_track_id=track.id,
            title=track.title,
            url=track.url,
            fetched_at=NOW,
            mix_name=track.mix_name,
            label_id=track.label_id,
            label_name=track.label_name,
            label_key="nightfall audio",
            release_id=track.release_id,
            release_name=track.release_name,
            release_date=track.release_date,
            bpm=track.bpm,
            key=track.key,
            genre_id=track.genre_id,
            genre_name=track.genre_name,
        )
        insert(db, "beatport_tracks", cached.to_dict())
        credits = [
            CachedBeatportCredit(
                beatport_track_id=track.id,
                role=role,
                position=position,
                name=artist.name,
                name_key=artist.name.casefold(),
                artist_id=artist.id,
            )
            for role, people in (
                (ROLE_ARTIST, track.artists),
                (ROLE_REMIXER, track.remixers),
            )
            for position, artist in enumerate(people)
        ]
        for credit in credits:
            insert(db, "beatport_track_artists", credit.to_dict())

        stored = CachedBeatportTrack.from_row(
            db.connect().execute("SELECT * FROM beatport_tracks").fetchone()
        )
        assert stored == cached
        assert stored.key == "Ebm" and stored.bpm == 124.0
        read_back = [
            CachedBeatportCredit.from_row(row)
            for row in db.connect().execute(
                "SELECT * FROM beatport_track_artists ORDER BY role, position"
            )
        ]
        assert read_back == credits
        assert [c.name for c in read_back if c.role == ROLE_ARTIST] == [
            a.name for a in track.artists
        ]

    def test_a_candidates_text_id_joins_the_catalogs_integer_id(self, db):
        """DISCOVER-04's ownership join: ``match_candidates`` keeps the id it
        parsed from a page as text, the catalog keeps Beatport's number, and
        SQLite's numeric affinity makes them equal without a cast."""
        track_id, *_ = add_library_tracks(db, 1)
        add_catalog(db, 19000001)
        with db.transaction() as conn:
            attempt = conn.execute(
                "INSERT INTO match_attempts"
                " (track_id, job_id, started_at, finished_at, outcome, input_json)"
                " VALUES (?, 'job', ?, ?, 'matched', '{}')",
                (track_id, NOW, NOW),
            ).lastrowid
            conn.execute(
                "INSERT INTO match_candidates"
                " (attempt_id, rank, beatport_track_id, url, score, guard_ok,"
                "  is_winner)"
                " VALUES (?, 0, '19000001', ?, 96.0, 1, 1)",
                (attempt, TRACK_URL.format(id=19000001)),
            )
        joined = count(
            db,
            "SELECT count(*) FROM match_candidates c JOIN beatport_tracks b"
            " ON b.beatport_track_id = c.beatport_track_id",
        )
        assert joined == 1
        assert (
            count(
                db,
                "SELECT count(*) FROM beatport_tracks WHERE beatport_track_id IN"
                " (SELECT beatport_track_id FROM match_candidates)",
            )
            == 1
        )


# ------------------------------------------------- the models over real rows


def _valid_models(db) -> Dict[str, Any]:
    """One valid instance per table, with its parents inserted."""
    library_track = add_library_tracks(db, 1)[0]
    add_catalog(db, 19000001)
    add_catalog(db, 19000003)
    run = add_run(db)
    # Found first, so the source below has a track to be a reason for; the
    # run-track model is the run's second track.
    add_run_track(db, run, 19000001)
    return {
        "beatport_tracks": CachedBeatportTrack(
            beatport_track_id=19000002,
            title="Second",
            url=TRACK_URL.format(id=19000002),
            fetched_at=NOW,
            release_date="2026-01-02",
            bpm=128,
            label_name="Nightfall Audio",
            label_key="nightfall audio",
        ),
        "beatport_track_artists": CachedBeatportCredit(
            beatport_track_id=19000001,
            role=ROLE_REMIXER,
            position=2,
            name="Óscar Lindqvist",
            name_key="oscar lindqvist",
            artist_id=301002,
        ),
        "beatport_name_lookups": BeatportNameLookup(
            kind=ENTITY_LABEL,
            name_key="nightfall audio",
            looked_up_at=NOW,
            beatport_id=40211,
            beatport_name="Nightfall Audio",
        ),
        "discovery_runs": DiscoveryRun(
            started_at=NOW,
            params_json=json.dumps({"genres": [5, 6], "days": 14}),
            job_id="job-9",
            finished_at=NOW,
            outcome=RUN_FAILED,
            labels_in_scope=4,
            labels_resolved=4,
            tracks_found=9,
            error="Beatport rejected the token",
            error_class="rejected",
        ),
        "discovery_run_tracks": DiscoveryRunTrack(
            run_id=run, beatport_track_id=19000003, position=1
        ),
        "discovery_run_sources": DiscoveryRunSource(
            run_id=run,
            beatport_track_id=19000001,
            source_type=SOURCE_LABEL_RELEASE,
            source_id=4500001,
            matched_on="Nightfall Audio",
            source_name="Lantern Signal EP",
            source_url="https://www.beatport.com/release/lantern-signal-ep/4500001",
        ),
        "wantlist": WantlistEntry(
            beatport_track_id=19000001,
            added_at=NOW,
            note="the dub",
            bought_at=NOW,
            added_from_run_id=run,
        ),
        "track_credits": TrackCredit(
            track_id=library_track,
            role=ROLE_ARTIST,
            position=1,
            name="Dub Phizix Jr",
            name_key="dub phizix jr",
        ),
        "derived_indexes": DerivedIndex(
            name=TRACK_CREDITS_INDEX, version=3, built_at=NOW
        ),
    }


@pytest.mark.unit
class TestTheModelsOverRealRows:
    #: Which row is the model's, among the parents _valid_models inserted.
    ITS_ROW = {
        "beatport_tracks": "beatport_track_id = 19000002",
        "beatport_track_artists": "position = 2",
        "beatport_name_lookups": "name_key = 'nightfall audio'",
        "discovery_runs": "job_id = 'job-9'",
        "discovery_run_tracks": "position = 1",
        "discovery_run_sources": "source_id = 4500001",
        "wantlist": "beatport_track_id = 19000001",
        "track_credits": "position = 1",
        "derived_indexes": "name = 'track_credits'",
    }

    @pytest.mark.parametrize("table", DISCOVER_TABLES)
    def test_each_model_reads_back_what_it_stored(self, db, table):
        model = _valid_models(db)[table]
        data = model.to_dict()
        if data.get("id") is None:
            data.pop("id", None)
        insert(db, table, data)
        rows = (
            db.connect()
            .execute(f"SELECT * FROM {table} WHERE {self.ITS_ROW[table]}")
            .fetchall()
        )
        assert len(rows) == 1
        read_back = type(model).from_row(rows[0])
        expected = model
        if table == "discovery_runs":
            expected = dataclasses.replace(model, id=read_back.id)
        assert read_back == expected

    @pytest.mark.parametrize("table", DISCOVER_TABLES)
    def test_to_dict_is_exactly_the_columns(self, db, table):
        model = _valid_models(db)[table]
        assert set(model.to_dict()) == set(COLUMNS[table])

    def test_a_bpm_reads_back_as_a_number_from_sqlites_real(self, db):
        track = _valid_models(db)["beatport_tracks"]
        insert(db, "beatport_tracks", track.to_dict())
        stored = CachedBeatportTrack.from_row(
            db.connect()
            .execute("SELECT * FROM beatport_tracks WHERE beatport_track_id = 19000002")
            .fetchone()
        )
        assert stored.bpm == 128.0 and isinstance(stored.bpm, float)

    def test_a_bare_run_reads_back_as_running(self, db):
        run = insert(db, "discovery_runs", dict(started_at=NOW, params_json="{}"))
        stored = DiscoveryRun.from_row(
            db.connect()
            .execute("SELECT * FROM discovery_runs WHERE id = ?", (run,))
            .fetchone()
        )
        assert stored.is_running and stored.id == run and stored.tracks_found == 0


@pytest.mark.unit
class TestTheModelImports:
    @pytest.mark.parametrize(
        "module_name",
        [
            "cuepoint.models.track_credit",
            "cuepoint.models.beatport_cache",
            "cuepoint.models.discovery_run",
            "cuepoint.models.wantlist",
        ],
    )
    def test_each_imports_from_no_layer_but_its_own(self, module_name):
        import importlib

        module = importlib.import_module(module_name)
        source = Path(module.__file__).read_text(encoding="utf-8")
        imported = re.findall(r"^from (cuepoint[.\w]*) import", source, re.MULTILINE)
        assert imported
        assert {name.split(".")[1] for name in imported} == {"models"}


# ------------------------------------------------------ what the models refuse


def _track(**overrides: Any) -> CachedBeatportTrack:
    values: Dict[str, Any] = dict(
        beatport_track_id=1, title="T", url=TRACK_URL.format(id=1), fetched_at=NOW
    )
    values.update(overrides)
    return CachedBeatportTrack(**values)


def _run(**overrides: Any) -> DiscoveryRun:
    values: Dict[str, Any] = dict(started_at=NOW, params_json="{}")
    values.update(overrides)
    return DiscoveryRun(**values)


@pytest.mark.unit
class TestWhatTheCatalogModelsRefuse:
    @pytest.mark.parametrize("value", [0, -3, True, "abc", 1.5, None])
    def test_a_track_id_that_is_not_a_positive_id(self, value):
        with pytest.raises(ValueError):
            _track(beatport_track_id=value)

    @pytest.mark.parametrize(
        "url",
        [
            "javascript:alert(1)",
            "http://www.beatport.com/track/x/1",
            "file:///C:/x",
            "https://",
            "",
            "   ",
            None,
            42,
        ],
    )
    def test_a_url_the_app_should_not_open(self, url):
        with pytest.raises(ValueError):
            _track(url=url)

    @pytest.mark.parametrize("column", ["title", "fetched_at"])
    @pytest.mark.parametrize("value", ["", "  ", None])
    def test_blank_required_text(self, column, value):
        with pytest.raises(ValueError):
            _track(**{column: value})

    @pytest.mark.parametrize(
        "column", ["mix_name", "release_name", "key", "genre_name"]
    )
    def test_blank_optional_text_is_not_no_value(self, column):
        with pytest.raises(ValueError):
            _track(**{column: " "})

    @pytest.mark.parametrize(
        "value", ["2026-8-14", "14/08/2026", "2026-02-30", "2026-08-14T00:00:00", 2026]
    )
    def test_a_release_date_that_is_not_yyyy_mm_dd(self, value):
        with pytest.raises(ValueError):
            _track(release_date=value)

    @pytest.mark.parametrize("value", [0, -120, float("nan"), float("inf"), True, "x"])
    def test_a_bpm_that_is_not_a_positive_number(self, value):
        with pytest.raises(ValueError):
            _track(bpm=value)

    @pytest.mark.parametrize("column", ["label_id", "release_id", "genre_id"])
    def test_an_id_that_is_not_positive(self, column):
        with pytest.raises(ValueError):
            _track(**{column: 0})

    def test_a_label_name_without_its_key(self):
        with pytest.raises(ValueError, match="together"):
            _track(label_name="Nightfall Audio")

    def test_a_label_key_without_its_name(self):
        with pytest.raises(ValueError, match="together"):
            _track(label_key="nightfall audio")

    def test_a_track_with_only_what_is_required(self):
        track = _track()
        assert track.label_name is None and track.bpm is None

    @pytest.mark.parametrize(
        "overrides",
        [
            dict(role="featuring"),
            dict(position=-1),
            dict(name=""),
            dict(name_key=" "),
            dict(artist_id=0),
            dict(beatport_track_id=None),
        ],
    )
    def test_a_bad_credit(self, overrides):
        values: Dict[str, Any] = dict(
            beatport_track_id=1, role=ROLE_ARTIST, position=0, name="A", name_key="a"
        )
        values.update(overrides)
        with pytest.raises(ValueError):
            CachedBeatportCredit(**values)

    def test_a_lookup_that_found_nothing_but_names_a_result(self):
        with pytest.raises(ValueError, match="found nothing"):
            BeatportNameLookup(
                kind=ENTITY_LABEL,
                name_key="x",
                looked_up_at=NOW,
                beatport_name="Something",
            )

    def test_found_and_not_found(self):
        missing = BeatportNameLookup(kind=ENTITY_LABEL, name_key="x", looked_up_at=NOW)
        found = BeatportNameLookup(
            kind=ENTITY_ARTIST, name_key="x", looked_up_at=NOW, beatport_id=5
        )
        assert (missing.found, found.found) == (False, True)

    @pytest.mark.parametrize(
        "overrides",
        [
            dict(kind="genre"),
            dict(name_key=""),
            dict(looked_up_at=None),
            dict(beatport_id=-1),
        ],
    )
    def test_a_bad_lookup(self, overrides):
        values: Dict[str, Any] = dict(kind=ENTITY_LABEL, name_key="x", looked_up_at=NOW)
        values.update(overrides)
        with pytest.raises(ValueError):
            BeatportNameLookup(**values)


@pytest.mark.unit
class TestWhatTheRunModelsRefuse:
    def test_a_running_run(self):
        run = _run()
        assert run.is_running and run.params == {}

    @pytest.mark.parametrize("outcome", RUN_OUTCOMES)
    def test_an_outcome_without_an_end_time(self, outcome):
        with pytest.raises(ValueError, match="together"):
            _run(outcome=outcome, error="x" if outcome == RUN_FAILED else None)

    def test_an_end_time_without_an_outcome(self):
        with pytest.raises(ValueError, match="together"):
            _run(finished_at=NOW)

    def test_an_outcome_outside_the_vocabulary(self):
        with pytest.raises(ValueError):
            _run(outcome="running", finished_at=NOW)

    def test_a_failure_that_does_not_say_why(self):
        with pytest.raises(ValueError, match="say why"):
            _run(outcome=RUN_FAILED, finished_at=NOW)

    def test_a_failure_whose_reason_is_blank(self):
        with pytest.raises(ValueError):
            _run(outcome=RUN_FAILED, finished_at=NOW, error="  ")

    @pytest.mark.parametrize("outcome", [RUN_SUCCEEDED, RUN_CANCELLED, None])
    def test_an_error_on_a_run_that_did_not_fail(self, outcome):
        finished = None if outcome is None else NOW
        with pytest.raises(ValueError, match="Only a failed run"):
            _run(outcome=outcome, finished_at=finished, error="x")

    @pytest.mark.parametrize("outcome", [RUN_SUCCEEDED, RUN_CANCELLED, None])
    def test_an_error_class_on_a_run_that_did_not_fail(self, outcome):
        finished = None if outcome is None else NOW
        with pytest.raises(ValueError, match="Only a failed run"):
            _run(outcome=outcome, finished_at=finished, error_class="rejected")

    def test_a_failure_that_was_not_beatports_has_no_class(self):
        run = _run(outcome=RUN_FAILED, finished_at=NOW, error="database is locked")
        assert run.error_class is None

    def test_a_cancelled_run_keeps_its_counts(self):
        run = _run(outcome=RUN_CANCELLED, finished_at=NOW, tracks_found=40)
        assert not run.is_running and run.tracks_found == 40

    @pytest.mark.parametrize("value", ["[]", "3", "not json", "", None, {"a": 1}])
    def test_params_that_are_not_a_json_object(self, value):
        with pytest.raises(ValueError):
            _run(params_json=value)

    @pytest.mark.parametrize("name", RUN_COUNTS)
    @pytest.mark.parametrize("value", [-1, 1.5, True, None])
    def test_a_count_that_is_not_a_count(self, name, value):
        with pytest.raises(ValueError):
            _run(**{name: value})

    def test_more_labels_resolved_than_were_in_scope(self):
        with pytest.raises(ValueError, match="cannot exceed"):
            _run(labels_in_scope=2, labels_resolved=3)

    @pytest.mark.parametrize(
        "overrides",
        [dict(id=0), dict(job_id=""), dict(started_at=" ")],
    )
    def test_a_bad_identity_or_start(self, overrides):
        with pytest.raises(ValueError):
            _run(**overrides)

    @pytest.mark.parametrize(
        "overrides", [dict(run_id=0), dict(beatport_track_id=None), dict(position=-1)]
    )
    def test_a_bad_run_track(self, overrides):
        values: Dict[str, Any] = dict(run_id=1, beatport_track_id=1, position=0)
        values.update(overrides)
        with pytest.raises(ValueError):
            DiscoveryRunTrack(**values)

    @pytest.mark.parametrize(
        "overrides",
        [
            dict(source_type="search"),
            dict(source_id=0),
            dict(matched_on=""),
            dict(matched_on=None),
            dict(source_name=" "),
            dict(source_url="http://www.beatport.com/chart/x/1"),
            dict(source_url="javascript:void(0)"),
        ],
    )
    def test_a_bad_source(self, overrides):
        values: Dict[str, Any] = dict(
            run_id=1,
            beatport_track_id=1,
            source_type=SOURCE_CHART,
            source_id=1,
            matched_on="Mara Veil",
        )
        values.update(overrides)
        with pytest.raises(ValueError):
            DiscoveryRunSource(**values)


@pytest.mark.unit
class TestWhatTheLibraryAndWantlistModelsRefuse:
    @pytest.mark.parametrize(
        "overrides",
        [
            dict(track_id=0),
            dict(role="producer"),
            dict(position=-1),
            dict(name=""),
            dict(name_key=None),
        ],
    )
    def test_a_bad_credit(self, overrides):
        values: Dict[str, Any] = dict(
            track_id=1, role=ROLE_ARTIST, position=0, name="A", name_key="a"
        )
        values.update(overrides)
        with pytest.raises(ValueError):
            TrackCredit(**values)

    @pytest.mark.parametrize(
        "overrides",
        [dict(name=""), dict(version=0), dict(version=1.5), dict(built_at=None)],
    )
    def test_a_bad_derived_index(self, overrides):
        values: Dict[str, Any] = dict(name=TRACK_CREDITS_INDEX, version=1, built_at=NOW)
        values.update(overrides)
        with pytest.raises(ValueError):
            DerivedIndex(**values)

    def test_an_index_is_current_only_for_its_own_rule_version(self):
        """Exactly: an index a newer rule built answers wrongly for an older
        one, so a downgrade rebuilds too."""
        built = DerivedIndex(name=TRACK_CREDITS_INDEX, version=2, built_at=NOW)
        assert built.is_current(2)
        assert not built.is_current(1)
        assert not built.is_current(3)

    @pytest.mark.parametrize(
        "overrides",
        [
            dict(beatport_track_id=0),
            dict(added_at=""),
            dict(note=""),
            dict(note="   "),
            dict(bought_at=" "),
            dict(added_from_run_id=0),
        ],
    )
    def test_a_bad_wantlist_entry(self, overrides):
        values: Dict[str, Any] = dict(beatport_track_id=1, added_at=NOW)
        values.update(overrides)
        with pytest.raises(ValueError):
            WantlistEntry(**values)

    def test_bought_is_the_users_word(self):
        assert not WantlistEntry(beatport_track_id=1, added_at=NOW).is_bought
        assert WantlistEntry(beatport_track_id=1, added_at=NOW, bought_at=NOW).is_bought


# --------------------------------------------------------------- the upgrade


@pytest.mark.unit
class TestUpgradingAVersionTwentyLibrary:
    """A version-20 library with rows in the tables a user's would have."""

    @pytest.fixture
    def populated_v20(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "upgrade.db")
        MigrationRunner(service, migrations=_migrations_up_to(20)).migrate()

        TrackRepository(service).add_many(
            [
                LibraryTrack(
                    rekordbox_track_id=str(i),
                    file_path=f"/m/{i}.mp3",
                    title=f"T{i}",
                    artist="Mara Veil, Óscar Lindqvist",
                    remixer="Dub Phizix Jr" if i % 3 == 0 else None,
                    key="Am" if i % 2 else "8A",
                    bpm=120.0 + i,
                    genre="House",
                    label="Nightfall Audio",
                    year=2000 + i,
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
                " (track_id, rating, favorite, notes, label, created_at, updated_at)"
                " VALUES (?, 5, 1, 'a note', 'Drumcode', 'then', 'then')",
                (ids[0],),
            )
            collection = conn.execute(
                "INSERT INTO collections"
                " (kind, name, position, depth, created_at, updated_at)"
                " VALUES ('collection', 'Warmups', 0, 0, 'then', 'then')"
            ).lastrowid
            conn.execute(
                "INSERT INTO collection_tracks"
                " (collection_id, track_id, position, added_at)"
                " VALUES (?, ?, 0, 'then')",
                (collection, ids[2]),
            )
            attempt = conn.execute(
                "INSERT INTO match_attempts"
                " (track_id, job_id, started_at, finished_at, outcome, input_json)"
                " VALUES (?, 'job-old', 'then', 'then', 'matched', '{}')",
                (ids[0],),
            ).lastrowid
            candidate = conn.execute(
                "INSERT INTO match_candidates"
                " (attempt_id, rank, beatport_track_id, url, score, guard_ok,"
                "  is_winner)"
                " VALUES (?, 0, '19000001',"
                " 'https://www.beatport.com/track/t/19000001', 96.0, 1, 1)",
                (attempt,),
            ).lastrowid
            conn.execute(
                "INSERT INTO track_match"
                " (track_id, state, decided_by, attempt_id, candidate_id, decided_at,"
                "  candidate_score)"
                " VALUES (?, 'accepted', 'user', ?, ?, 'then', 96.0)",
                (ids[0], attempt, candidate),
            )
            export = conn.execute(
                "INSERT INTO rekordbox_exports"
                " (started_at, outcome, destination_path, source_path, track_count,"
                "  changed_track_count, fields_json, key_format)"
                " VALUES ('then', 'written', '/e.xml', '/s.xml', 25, 1, '[]',"
                " 'camelot')"
            ).lastrowid
            conn.execute(
                "INSERT INTO rekordbox_export_playlists"
                " (export_id, collection_id, kind, name, path, entry_count)"
                " VALUES (?, ?, 'collection', 'Warmups', 'CuePoint/Warmups', 1)",
                (export, collection),
            )
            conn.execute(
                "INSERT INTO activity_events (type, summary, detail_json, created_at)"
                " VALUES ('library.refresh', 'Refreshed', '{}', 'then')"
            )
        yield service
        service.close_all()

    def test_it_applies(self, populated_v20):
        applied = MigrationRunner(populated_v20).migrate()
        assert 21 in [m.version for m in applied]

    def test_it_applies_alone(self, populated_v20):
        runner = MigrationRunner(populated_v20, migrations=_migrations_up_to(21))
        assert [m.version for m in runner.migrate()] == [21]

    def test_no_row_in_any_existing_table_changes(self, populated_v20):
        before = snapshot(populated_v20)
        MigrationRunner(populated_v20).migrate()
        after = snapshot(populated_v20)

        for table, rows in before.items():
            if table == "schema_version":
                continue
            assert after[table] == rows, table

        old_versions = {row["version"] for row in before["schema_version"]}
        new_versions = {row["version"] for row in after["schema_version"]}
        assert old_versions < new_versions and 21 in new_versions

    def test_every_new_table_starts_empty(self, populated_v20):
        """Including the credit index: DISCOVER-03's job builds it, and its
        missing ``derived_indexes`` row is what tells that job to."""
        MigrationRunner(populated_v20).migrate()
        for table in DISCOVER_TABLES:
            assert count(populated_v20, f"SELECT count(*) FROM {table}") == 0, table

    def test_an_upgraded_database_has_the_same_schema_as_a_fresh_one(
        self, populated_v20, db
    ):
        MigrationRunner(populated_v20).migrate()
        assert schema(populated_v20) == schema(db)

    def test_it_still_browses_after_the_upgrade(self, populated_v20):
        MigrationRunner(populated_v20).migrate()
        repo = TrackRepository(populated_v20)
        query = BrowseQuery(query="T", sort="bpm")
        assert len(repo.browse(query, limit=100)) == 25
        assert repo.browse_count(query) == 25

    def test_its_collections_still_read_back(self, populated_v20):
        MigrationRunner(populated_v20).migrate()
        tree = CollectionRepository(populated_v20).tree()
        assert [node.name for node in tree] == ["Warmups"]

    def test_a_library_track_can_still_be_deleted(self, populated_v20):
        """A new reference into ``tracks`` must not block the refresh delete."""
        MigrationRunner(populated_v20).migrate()
        track_id = int(
            populated_v20.connect().execute("SELECT max(id) FROM tracks").fetchone()[0]
        )
        add_track_credit(populated_v20, track_id)
        execute(populated_v20, "DELETE FROM tracks WHERE id = ?", (track_id,))
        assert count(populated_v20, "SELECT count(*) FROM track_credits") == 0

    def test_everything_can_be_written_straight_after_the_upgrade(self, populated_v20):
        MigrationRunner(populated_v20).migrate()
        models = _valid_models(populated_v20)
        for table in DISCOVER_TABLES:
            data = models[table].to_dict()
            if data.get("id") is None:
                data.pop("id", None)
            insert(populated_v20, table, data)
        # The two catalog rows _valid_models inserted to be referenced, and the
        # model's own; the run's first track and the model's second.
        assert count(populated_v20, "SELECT count(*) FROM beatport_tracks") == 3
        assert count(populated_v20, "SELECT count(*) FROM discovery_run_tracks") == 2
        for table in DISCOVER_TABLES:
            assert count(populated_v20, f"SELECT count(*) FROM {table}") >= 1, table


# ------------------------------------------------------- nothing reads them yet


@pytest.mark.unit
class TestNothingTouchesThemYet:
    """DISCOVER-02 lands the schema with no reader or writer. The steps that
    add one change this test to name its repository, as EXPORT-05 did."""

    def test_no_module_runs_sql_against_any_of_them(self):
        package = Path(__file__).resolve().parents[3] / "cuepoint"
        statement = re.compile(
            r"\b(FROM|INTO|UPDATE|JOIN|DELETE\s+FROM)\s+("
            + "|".join(DISCOVER_TABLES)
            + r")\b",
            re.IGNORECASE,
        )
        offenders = []
        for path in sorted(package.rglob("*.py")):
            if path.name == "m0021_discover.py":
                continue
            if statement.search(path.read_text(encoding="utf-8")):
                offenders.append(path.relative_to(package).as_posix())
        assert offenders == []
