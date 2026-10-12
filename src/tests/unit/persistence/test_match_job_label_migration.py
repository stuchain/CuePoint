#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0028 — a label on each match job (C14, DEC-065).

One nullable column, so the tests are the small set an added column gets: it is
discovered at its number, the model still equals the table, an older library
upgrades without a row changing and its jobs have no label, and a new plan
stores one.
"""

from __future__ import annotations

import dataclasses
from typing import Any, Dict, List

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import MatchPlan
from cuepoint.persistence.match_job_repository import MatchJobRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-10-12T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def columns(service) -> Dict[str, Dict[str, Any]]:
    return {
        row["name"]: dict(row)
        for row in service.connect().execute("PRAGMA table_info(match_jobs)")
    }


class TestShape:
    def test_it_is_discovered_as_version_twenty_eight(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[28].module_name == "m0028_match_job_label"

    def test_the_label_is_a_nullable_text_column(self, db):
        label = columns(db)["label"]
        assert (label["type"], label["notnull"]) == ("TEXT", 0)

    def test_the_model_is_still_exactly_the_table(self, db):
        assert {f.name for f in dataclasses.fields(MatchPlan)} == set(columns(db))


class TestUpgradingAVersionTwentySevenLibrary:
    @pytest.fixture
    def old(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "v27.db")
        MigrationRunner(
            service, migrations=[m for m in discover_migrations() if m.version <= 27]
        ).migrate()
        with service.transaction() as conn:
            conn.execute(
                "INSERT INTO match_jobs (job_id, rematch, selected, excluded,"
                " attempt_watermark, created_at) VALUES ('old', 0, 5, 0, 0, ?)",
                (NOW,),
            )
        yield service
        service.close_all()

    def test_it_applies_alone_and_the_old_job_has_no_label(self, old):
        applied = MigrationRunner(old).migrate()

        assert [m.version for m in applied][0] == 28
        plan = MatchJobRepository(old).get("old")
        assert plan is not None and plan.label is None
        row = old.connect().execute("SELECT * FROM match_jobs").fetchone()
        assert dict(row)["selected"] == 5

    def test_the_upgraded_schema_is_a_fresh_one(self, old, db):
        MigrationRunner(old).migrate()

        def schema(service) -> List[tuple]:
            rows = service.connect().execute(
                "SELECT type, name FROM sqlite_master"
                " WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
            )
            return [tuple(r) for r in rows]

        assert schema(old) == schema(db)


class TestAPlanStoresItsLabel:
    def test_the_label_round_trips(self, db):
        TrackRepository(db).add_many(
            [LibraryTrack(rekordbox_track_id="1", title="T", artist="A")]
        )
        track_id = int(db.connect().execute("SELECT id FROM tracks").fetchone()[0])
        plan = MatchJobRepository(db).create(
            "job",
            [track_id],
            rematch=False,
            selected=1,
            created_at=NOW,
            label="Playlist \u201call\u201d",
        )

        assert plan.label == "Playlist \u201call\u201d"
        assert MatchJobRepository(db).get("job").label == "Playlist \u201call\u201d"
