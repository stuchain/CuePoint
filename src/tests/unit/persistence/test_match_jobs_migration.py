#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0013 — the options each match job was started with (CLEAN-03).

A new table, so the tests are the ones every new table here gets: the model is
exactly the table, the constraints say what the model says, nothing is indexed
that no query needs, and a populated library upgrades without a row changing.
"""

from __future__ import annotations

import dataclasses
import sqlite3
from typing import Any, Dict, List

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import MatchPlan
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-13T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def columns(service, table: str) -> Dict[str, Dict[str, Any]]:
    return {
        row["name"]: dict(row)
        for row in service.connect().execute(f"PRAGMA table_info({table})")
    }


def insert(service, **fields) -> None:
    values: dict = dict(
        job_id="job-1",
        resumed_from=None,
        rematch=0,
        selected=10,
        excluded=2,
        attempt_watermark=0,
        created_at=NOW,
    )
    values.update(fields)
    names = ", ".join(values)
    marks = ", ".join("?" for _ in values)
    with service.transaction() as conn:
        conn.execute(
            f"INSERT INTO match_jobs ({names}) VALUES ({marks})", tuple(values.values())
        )


def snapshot(service) -> Dict[str, List[Dict[str, Any]]]:
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


class TestShape:
    def test_it_is_discovered_as_version_thirteen(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[13].module_name == "m0013_match_jobs"

    def test_the_model_is_exactly_the_table(self, db):
        assert {f.name for f in dataclasses.fields(MatchPlan)} == set(
            columns(db, "match_jobs")
        )

    def test_the_job_is_the_key(self, db):
        keyed = [name for name, col in columns(db, "match_jobs").items() if col["pk"]]
        assert keyed == ["job_id"]

    def test_it_references_nothing(self, db):
        assert (
            db.connect().execute("PRAGMA foreign_key_list(match_jobs)").fetchall() == []
        )

    def test_nothing_but_the_key_is_indexed(self, db):
        indexes = db.connect().execute("PRAGMA index_list(match_jobs)").fetchall()
        assert [row["origin"] for row in indexes] == ["pk"]

    @pytest.mark.parametrize(
        "column", ["rematch", "selected", "excluded", "attempt_watermark", "created_at"]
    )
    def test_a_required_column_cannot_be_null(self, db, column):
        with pytest.raises(sqlite3.IntegrityError, match="NOT NULL"):
            insert(db, **{column: None})

    def test_resumed_from_may_be_null(self, db):
        insert(db, resumed_from=None)


class TestChecks:
    @pytest.mark.parametrize("rematch", [0, 1])
    def test_rematch_is_a_flag(self, db, rematch):
        insert(db, rematch=rematch)

    @pytest.mark.parametrize(
        "fields",
        [
            {"rematch": 2},
            {"rematch": -1},
            {"selected": -1, "excluded": 0},
            {"excluded": -1},
            {"selected": 3, "excluded": 4},
            {"attempt_watermark": -1},
        ],
    )
    def test_what_the_model_refuses_the_table_refuses(self, db, fields):
        with pytest.raises(sqlite3.IntegrityError, match="CHECK"):
            insert(db, **fields)

    def test_leaving_out_everything_selected_is_allowed(self, db):
        insert(db, selected=4, excluded=4)

    def test_a_job_has_one_plan(self, db):
        insert(db)
        with pytest.raises(sqlite3.IntegrityError, match="UNIQUE"):
            insert(db)


class TestUpgradingAVersionTwelveLibrary:
    @pytest.fixture
    def populated(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "v12.db")
        MigrationRunner(
            service, migrations=[m for m in discover_migrations() if m.version <= 12]
        ).migrate()
        TrackRepository(service).add_many(
            [
                LibraryTrack(rekordbox_track_id=str(i), title=f"T{i}", artist="A")
                for i in range(1, 4)
            ]
        )
        with service.transaction() as conn:
            conn.executemany(
                "INSERT INTO match_job_tracks (job_id, position, track_id, done)"
                " VALUES ('old-job', ?, ?, ?)",
                [(0, 1, 1), (1, 2, 0), (2, 3, 0)],
            )
        yield service
        service.close_all()

    def test_it_applies_alone(self, populated):
        assert [m.version for m in MigrationRunner(populated).migrate()] == [13]

    def test_every_existing_row_survives_and_the_new_table_starts_empty(
        self, populated
    ):
        before = snapshot(populated)
        MigrationRunner(populated).migrate()
        after = snapshot(populated)

        assert after.pop("match_jobs") == []
        applied = [row["version"] for row in after.pop("schema_version")]
        assert sorted(applied) == sorted(
            [row["version"] for row in before.pop("schema_version")] + [13]
        )
        assert after == before

    def test_the_upgraded_schema_is_a_fresh_one(self, populated, db):
        MigrationRunner(populated).migrate()
        assert schema(populated) == schema(db)
