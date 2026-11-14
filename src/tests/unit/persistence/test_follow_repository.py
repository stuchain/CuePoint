#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0034 and the follows it holds."""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.follow import Follow
from cuepoint.persistence.follow_repository import FollowRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

NOW = "2026-11-13T10:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def follows(db):
    return FollowRepository(db)


def follow(kind="artist", beatport_id=100, name="Âme", seen="2026-10-14"):
    return Follow(
        kind=kind,
        beatport_id=beatport_id,
        name=name,
        followed_at=NOW,
        seen_through=seen,
    )


class TestMigration:
    def test_it_is_discovered_at_its_number(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[34].module_name == "m0034_follows"
        assert by_version[36].module_name == "m0036_follow_seen_tracks"

    def test_the_table_is_keyed_by_kind_and_id_without_a_rowid(self, db):
        conn = db.connect()
        columns = {
            r["name"]: (r["type"], r["notnull"], r["pk"])
            for r in conn.execute("PRAGMA table_info(follows)")
        }
        assert columns == {
            "kind": ("TEXT", 1, 1),
            "beatport_id": ("INTEGER", 1, 2),
            "name": ("TEXT", 1, 0),
            "followed_at": ("TEXT", 1, 0),
            "seen_through": ("TEXT", 1, 0),
        }
        sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'follows'"
        ).fetchone()["sql"]
        assert "WITHOUT ROWID" in sql

    def test_seen_tracks_are_keyed_by_follow_and_track_and_go_with_the_follow(
        self, db, follows
    ):
        follows.add(follow("artist", 1, "A"))
        with db.transaction() as conn:
            conn.execute("INSERT INTO follow_seen_tracks VALUES ('artist', 1, 7)")
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute("INSERT INTO follow_seen_tracks VALUES ('artist', 1, 7)")
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute("INSERT INTO follow_seen_tracks VALUES ('artist', 2, 7)")
        assert follows.remove("artist", 1)
        assert (
            db.connect()
            .execute("SELECT count(*) FROM follow_seen_tracks")
            .fetchone()[0]
            == 0
        )

    def test_a_kind_that_is_neither_is_refused(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO follows (kind, beatport_id, name, followed_at, seen_through)"
                    " VALUES ('genre', 1, 'x', 'a', '2026-01-01')"
                )

    def test_a_missing_id_is_refused_not_invented(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO follows (kind, beatport_id, name, followed_at, seen_through)"
                    " VALUES ('artist', NULL, 'x', 'a', '2026-01-01')"
                )


class TestRepository:
    def test_it_starts_empty(self, follows):
        assert follows.list() == []
        assert follows.get("artist", 100) is None

    def test_an_add_is_stored_and_read_back(self, follows):
        assert follows.add(follow()) is True
        assert follows.get("artist", 100) == follow()
        assert follows.list() == [follow()]

    def test_adding_again_is_a_no_op_that_keeps_the_first_row(self, follows):
        follows.add(follow(seen="2026-10-14"))
        assert follows.add(follow(name="Other", seen="2026-11-01")) is False
        assert follows.get("artist", 100) == follow(seen="2026-10-14")

    def test_an_artist_and_a_label_may_share_an_id(self, follows):
        follows.add(follow("artist", 5, "A"))
        follows.add(follow("label", 5, "L"))
        assert [(f.kind, f.name) for f in follows.list()] == [
            ("artist", "A"),
            ("label", "L"),
        ]

    def test_the_list_is_artists_then_labels_each_by_name(self, follows):
        follows.add(follow("label", 1, "Zed"))
        follows.add(follow("artist", 2, "bravo"))
        follows.add(follow("artist", 3, "Alpha"))
        assert [f.name for f in follows.list()] == ["Alpha", "bravo", "Zed"]

    def test_a_remove_says_whether_it_was_followed(self, follows):
        follows.add(follow())
        assert follows.remove("artist", 100) is True
        assert follows.remove("artist", 100) is False
        assert follows.list() == []

    def test_mark_seen_moves_one_follow_forward(self, follows):
        follows.add(follow("artist", 1, "A", seen="2026-10-01"))
        follows.add(follow("artist", 2, "B", seen="2026-10-01"))
        moved = follows.mark_seen("2026-11-13", "artist", 1)
        assert [(f.beatport_id, f.seen_through) for f in moved] == [(1, "2026-11-13")]
        assert follows.get("artist", 1).seen_through == "2026-11-13"
        assert follows.get("artist", 2).seen_through == "2026-10-01"

    def test_mark_seen_with_no_follow_named_moves_all(self, follows):
        follows.add(follow("artist", 1, "A", seen="2026-10-01"))
        follows.add(follow("label", 2, "B", seen="2026-10-01"))
        assert len(follows.mark_seen("2026-11-13")) == 2
        assert {f.seen_through for f in follows.list()} == {"2026-11-13"}

    def test_mark_seen_never_moves_a_date_back(self, follows):
        follows.add(follow(seen="2026-11-20"))
        assert follows.mark_seen("2026-11-13") == []
        assert follows.get("artist", 100).seen_through == "2026-11-20"

    @pytest.mark.parametrize("which", [{"kind": "artist"}, {"beatport_id": 1}])
    def test_mark_seen_with_only_half_a_follow_named_raises_and_marks_nothing(
        self, follows, which
    ):
        follows.add(follow("artist", 1, "A", seen="2026-10-01"))
        with pytest.raises(ValueError):
            follows.mark_seen("2026-11-13", **which)
        assert follows.get("artist", 1).seen_through == "2026-10-01"

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"kind": "genre"},
            {"beatport_id": 0},
            {"name": "  "},
            {"seen": "yesterday"},
        ],
    )
    def test_a_row_the_model_refuses_never_reaches_sql(self, kwargs):
        with pytest.raises(ValueError):
            follow(**kwargs)

    def test_a_write_joins_the_callers_transaction(self, db, follows):
        with pytest.raises(RuntimeError):
            with db.transaction():
                follows.add(follow())
                raise RuntimeError("roll back")
        assert follows.list() == []
