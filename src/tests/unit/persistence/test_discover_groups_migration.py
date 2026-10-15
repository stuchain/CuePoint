#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0030: the groups a dig's tracks came from.

A run stored before it keeps every track and every reason, and reads as one
list (no cards); a new reason can name a card, and one release can be found for
two artists' cards at once.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.persistence.discovery_repository import DiscoveryRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

NOW = "2026-09-23T12:00:00+00:00"


@pytest.fixture
def old(tmp_path):
    service = DatabaseService(db_path=tmp_path / "v29.db")
    MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= 29]
    ).migrate()
    with service.transaction() as conn:
        conn.execute(
            "INSERT INTO discovery_runs (id, started_at, params_json, outcome,"
            " finished_at) VALUES (1, ?, '{}', 'succeeded', ?)",
            (NOW, NOW),
        )
        conn.execute(
            "INSERT INTO beatport_tracks (beatport_track_id, title, url, fetched_at)"
            " VALUES (10, 'T', 'https://www.beatport.com/track/t/10', ?)",
            (NOW,),
        )
        conn.execute(
            "INSERT INTO discovery_run_tracks (run_id, beatport_track_id, position)"
            " VALUES (1, 10, 0)"
        )
        conn.execute(
            "INSERT INTO discovery_run_sources (run_id, beatport_track_id,"
            " source_type, source_id, source_name, matched_on)"
            " VALUES (1, 10, 'chart', 77, 'Old chart', 'Mara Veil')"
        )
    yield service
    service.close_all()


def test_it_is_discovered_at_its_number():
    by_version = {m.version: m for m in discover_migrations()}
    assert by_version[30].module_name == "m0030_discover_groups"


def test_a_run_stored_before_keeps_its_tracks_and_reasons_and_has_no_cards(old):
    MigrationRunner(old).migrate()
    repo = DiscoveryRepository(old)
    sources = repo.run_sources(1)
    assert [(s.source_type, s.source_id, s.matched_on) for s in sources] == [
        ("chart", 77, "Mara Veil")
    ]
    assert sources[0].group_key == ""
    assert repo.run_groups(1) == []
    page = repo.run_tracks(1, owned="all")
    assert [r.track.beatport_track_id for r in page.rows] == [10]
    assert [r.sources[0].source_name for r in page.rows] == ["Old chart"]


def test_an_artists_release_is_a_reason_and_may_belong_to_two_cards(old):
    MigrationRunner(old).migrate()
    with old.transaction() as conn:
        for key in ("a", "b"):
            conn.execute(
                "INSERT INTO discovery_run_sources (run_id, beatport_track_id,"
                " source_type, source_id, group_key, matched_on)"
                " VALUES (1, 10, 'artist_release', 5, ?, ?)",
                (key, key.upper()),
            )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO discovery_run_sources (run_id, beatport_track_id,"
                " source_type, source_id, group_key, matched_on)"
                " VALUES (1, 10, 'artist_release', 5, 'a', 'A')"
            )


def test_a_source_type_outside_the_vocabulary_is_still_refused(old):
    MigrationRunner(old).migrate()
    with pytest.raises(sqlite3.IntegrityError):
        with old.transaction() as conn:
            conn.execute(
                "INSERT INTO discovery_run_sources (run_id, beatport_track_id,"
                " source_type, source_id, matched_on) VALUES (1, 10, 'search', 1, 'x')"
            )


def test_deleting_a_run_takes_its_cards_with_it(old):
    MigrationRunner(old).migrate()
    with old.transaction() as conn:
        conn.execute(
            "INSERT INTO discovery_run_groups (run_id, kind, key, name, position)"
            " VALUES (1, 'artist', 'mara veil', 'Mara Veil', 0)"
        )
    assert DiscoveryRepository(old).delete_run(1)
    row = old.connect().execute("SELECT count(*) FROM discovery_run_groups").fetchone()
    assert row[0] == 0


def test_a_group_kind_outside_the_vocabulary_is_refused(old):
    MigrationRunner(old).migrate()
    with pytest.raises(sqlite3.IntegrityError):
        with old.transaction() as conn:
            conn.execute(
                "INSERT INTO discovery_run_groups (run_id, kind, key, name, position)"
                " VALUES (1, 'playlist', 'x', 'X', 0)"
            )
