#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0038: the artist and label pictures, filled from past digs' cards."""

from __future__ import annotations

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

OLD = "2026-10-01T12:00:00+00:00"
NEW = "2026-11-01T12:00:00+00:00"
HOST = "https://geo-media.beatport.com/image_size/{w}x{h}/%s.jpg"


@pytest.fixture
def old(tmp_path):
    service = DatabaseService(db_path=tmp_path / "v37.db")
    MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= 37]
    ).migrate()
    yield service
    service.close_all()


def run(conn, run_id, started):
    conn.execute(
        "INSERT INTO discovery_runs (id, started_at, params_json, outcome,"
        " finished_at) VALUES (?, ?, '{}', 'succeeded', ?)",
        (run_id, started, started),
    )


def group(conn, run_id, kind, key, beatport_id, art, position=0):
    conn.execute(
        "INSERT INTO discovery_run_groups (run_id, kind, key, name, position,"
        " beatport_id, art_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (run_id, kind, key, key.title(), position, beatport_id, art),
    )


def rows(service):
    return {
        (r[0], r[1]): (r[2], r[3])
        for r in service.connect().execute(
            "SELECT kind, beatport_id, image_url, read_at FROM beatport_entity_art"
        )
    }


def test_it_is_discovered_at_version_38():
    by_version = {m.version: m for m in discover_migrations()}
    assert by_version[38].module_name == "m0038_entity_art"


def test_the_table_is_keyed_by_kind_and_id_without_a_rowid(old):
    MigrationRunner(old).migrate()
    conn = old.connect()
    columns = {
        r["name"]: (r["type"], r["notnull"], r["pk"])
        for r in conn.execute("PRAGMA table_info(beatport_entity_art)")
    }
    assert columns == {
        "kind": ("TEXT", 1, 1),
        "beatport_id": ("INTEGER", 1, 2),
        "image_url": ("TEXT", 0, 0),
        "read_at": ("TEXT", 1, 0),
    }
    sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name = 'beatport_entity_art'"
    ).fetchone()["sql"]
    assert "WITHOUT ROWID" in sql


def test_it_takes_artist_and_label_cards_with_an_id_and_a_picture(old):
    with old.transaction() as conn:
        run(conn, 1, OLD)
        group(conn, 1, "artist", "mara veil", 301001, HOST % "mara")
        group(conn, 1, "label", "nightfall audio", 40211, HOST % "night", 1)
    MigrationRunner(old).migrate()
    assert rows(old) == {
        ("artist", 301001): (HOST % "mara", OLD),
        ("label", 40211): (HOST % "night", OLD),
    }


def test_the_newest_run_s_picture_wins(old):
    with old.transaction() as conn:
        run(conn, 1, OLD)
        run(conn, 2, NEW)
        group(conn, 1, "artist", "mara veil", 301001, HOST % "old")
        group(conn, 2, "artist", "mara veil", 301001, HOST % "new")
    MigrationRunner(old).migrate()
    assert rows(old) == {("artist", 301001): (HOST % "new", NEW)}


def test_it_skips_charts_cards_with_no_id_and_cards_with_no_picture(old):
    with old.transaction() as conn:
        run(conn, 1, OLD)
        group(conn, 1, "chart", "1", 55, HOST % "chart")
        group(conn, 1, "artist", "no id", None, HOST % "x", 1)
        group(conn, 1, "artist", "no art", 301002, None, 2)
    MigrationRunner(old).migrate()
    assert rows(old) == {}


def test_an_empty_library_gets_an_empty_table(old):
    MigrationRunner(old).migrate()
    assert rows(old) == {}


def test_it_copies_only_urls_on_beatport_s_artwork_hosts_over_https(old):
    with old.transaction() as conn:
        run(conn, 1, OLD)
        group(conn, 1, "artist", "other host", 5, "https://example.com/a.jpg")
        group(conn, 1, "label", "plain http", 6, "http://geo-media.beatport.com/a.jpg", 1)
        group(conn, 1, "artist", "userinfo", 7, "https://x@geo-media.beatport.com/a.jpg", 2)
        group(conn, 1, "artist", "lookalike", 8, "https://beatport.com.evil.test/a.jpg", 3)
        group(conn, 1, "artist", "mara veil", 301001, HOST % "mara", 4)
    MigrationRunner(old).migrate()
    assert rows(old) == {("artist", 301001): (HOST % "mara", OLD)}
