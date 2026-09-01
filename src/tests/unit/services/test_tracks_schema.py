#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Schema tests for the library tracks table (migration 0002).

The indexes here back DEC-002's identity lookups, so they are asserted
explicitly rather than assumed: a missing unique constraint would let a refresh
become ambiguous, and a missing path index would turn the fallback lookup into a
full scan of the whole library.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def _insert(db: DatabaseService, track: LibraryTrack) -> None:
    data = track.to_dict()
    data.pop("id")
    columns = ", ".join(data)
    placeholders = ", ".join("?" for _ in data)
    with db.transaction() as conn:
        conn.execute(
            f"INSERT INTO tracks ({columns}) VALUES ({placeholders})",
            tuple(data.values()),
        )


def _track(track_id: str = "1", path: str = "/music/a.mp3") -> LibraryTrack:
    return LibraryTrack(
        rekordbox_track_id=track_id, title="T", artist="A", file_path=path
    )


@pytest.mark.unit
class TestTracksTable:
    def test_table_exists_with_expected_columns(self, db):
        columns = {
            row["name"] for row in db.connect().execute("PRAGMA table_info(tracks)")
        }
        assert {
            "id",
            "rekordbox_track_id",
            "file_path",
            "normalized_path",
            "title",
            "artist",
            "remixer",
            "album",
            "label",
            "genre",
            "key",
            "bpm",
            "year",
            "duration_seconds",
            "created_at",
            "updated_at",
        } == columns

    def test_library_track_round_trips_through_the_table(self, db):
        original = LibraryTrack(
            rekordbox_track_id="42",
            title="Song",
            artist="Someone",
            file_path=r"C:\Music\Song.mp3",
            label="Label",
            genre="House",
            key="8A",
            bpm=124.0,
            year=2021,
            duration_seconds=360,
        )
        _insert(db, original)

        row = (
            db.connect()
            .execute("SELECT * FROM tracks WHERE rekordbox_track_id='42'")
            .fetchone()
        )
        restored = LibraryTrack.from_row(row)

        assert restored.id is not None
        assert restored.rekordbox_track_id == "42"
        assert restored.file_path == r"C:\Music\Song.mp3"
        assert restored.normalized_path == "c:/music/song.mp3"
        assert restored.bpm == 124.0
        assert restored.year == 2021

    def test_duplicate_rekordbox_id_is_rejected(self, db):
        """Two rows for one Rekordbox track would make a refresh ambiguous."""
        _insert(db, _track("1", "/music/a.mp3"))
        with pytest.raises(sqlite3.IntegrityError):
            _insert(db, _track("1", "/music/b.mp3"))

    def test_duplicate_normalized_path_is_allowed(self, db):
        """Paths can legitimately repeat; only TrackID is unique."""
        _insert(db, _track("1", "/music/a.mp3"))
        _insert(db, _track("2", "/music/a.mp3"))

        count = (
            db.connect()
            .execute("SELECT count(*) FROM tracks WHERE normalized_path='/music/a.mp3'")
            .fetchone()[0]
        )
        assert count == 2

    def test_empty_path_rows_are_allowed(self, db):
        _insert(db, _track("1", ""))
        _insert(db, _track("2", ""))
        assert db.connect().execute("SELECT count(*) FROM tracks").fetchone()[0] == 2


@pytest.mark.unit
class TestIdentityLookupsUseIndexes:
    """A full scan here would be a per-track cost across the whole library."""

    @pytest.fixture
    def populated(self, db):
        with db.transaction() as conn:
            conn.executemany(
                "INSERT INTO tracks (rekordbox_track_id, file_path, normalized_path,"
                " title, artist, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (str(i), f"/m/{i}.mp3", f"/m/{i}.mp3", f"T{i}", "A", "now", "now")
                    for i in range(2000)
                ],
            )
        return db

    def test_rekordbox_id_lookup_uses_index(self, populated):
        plan = (
            populated.connect()
            .execute(
                "EXPLAIN QUERY PLAN SELECT * FROM tracks WHERE rekordbox_track_id = '5'"
            )
            .fetchone()["detail"]
        )
        assert "idx_tracks_rekordbox_track_id" in plan

    def test_normalized_path_lookup_uses_index(self, populated):
        plan = (
            populated.connect()
            .execute(
                "EXPLAIN QUERY PLAN SELECT * FROM tracks WHERE normalized_path = '/m/5.mp3'"
            )
            .fetchone()["detail"]
        )
        assert "idx_tracks_normalized_path" in plan


@pytest.mark.unit
class TestMigrationSequence:
    def test_tracks_arrives_at_version_two(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "seq.db")
        try:
            runner = MigrationRunner(service)
            runner.migrate()
            assert runner.current_version() == 2
        finally:
            service.close_all()

    def test_migrating_twice_leaves_schema_intact(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "twice.db")
        try:
            MigrationRunner(service).migrate()
            assert MigrationRunner(service).migrate() == []
            tables = {
                row["name"]
                for row in service.connect().execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            assert "tracks" in tables
        finally:
            service.close_all()
