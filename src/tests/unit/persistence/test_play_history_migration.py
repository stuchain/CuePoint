#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Migration 0027: play history, seeded from the last import (STATS-01, DEC-168).

The migration is SQL only, so what it does to a library that already holds
play counts is what these tests pin: one ``seed`` read dated by the last
import, a row for every *known* count and none for an unknown one, nothing at
all for a library that was never imported, and the cascade that lets a
refresh delete a played track without asking (DEC-137).
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.migrations import discover_migrations
from cuepoint.models.library_track import LibraryTrack
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures import legacy_rows

IMPORTED = "2026-09-30T08:15:00+00:00"
EARLIER = "2026-09-01T08:15:00+00:00"


def _runner(service, through: int) -> MigrationRunner:
    return MigrationRunner(
        service, migrations=[m for m in discover_migrations() if m.version <= through]
    )


def _source(service, imported_at: str) -> None:
    with service.transaction() as conn:
        conn.execute(
            "INSERT INTO library_source (xml_path, imported_at, track_count)"
            " VALUES ('/x.xml', ?, 0)",
            (imported_at,),
        )


@pytest.fixture
def old(tmp_path):
    """A version 26 library: three tracks, two with known play counts."""
    service = DatabaseService(db_path=tmp_path / "v26.db")
    _runner(service, 26).migrate()
    ids = legacy_rows.add_tracks(
        service,
        [
            LibraryTrack(
                rekordbox_track_id=str(n),
                file_path=f"/m/{n}.mp3",
                title=f"T{n}",
                artist="A",
                play_count=count,
            )
            for n, count in ((1, 12), (2, None), (3, 0))
        ],
    )
    yield service, sorted(ids)
    service.close_all()


def _rows(service, sql: str):
    return [tuple(row) for row in service.connect().execute(sql)]


class TestMigratingALibraryThatWasImported:
    def test_it_applies_on_top_of_26_and_is_the_latest(self, old):
        service, _ = old
        _source(service, EARLIER)
        _source(service, IMPORTED)

        applied = _runner(service, 27).migrate()

        assert [m.version for m in applied] == [27]

    def test_one_seed_read_is_dated_by_the_most_recent_import(self, old):
        service, _ = old
        _source(service, EARLIER)
        _source(service, IMPORTED)
        _runner(service, 27).migrate()

        assert _rows(
            service, "SELECT read_at, kind, tracks, changed FROM library_reads"
        ) == [(IMPORTED, "seed", 3, 2)]

    def test_known_counts_are_copied_and_unknown_ones_are_not(self, old):
        service, ids = old
        _source(service, IMPORTED)
        _runner(service, 27).migrate()

        assert _rows(
            service,
            "SELECT track_id, play_count FROM play_counts ORDER BY track_id",
        ) == [(ids[0], 12), (ids[2], 0)]
        read_id = (
            service.connect().execute("SELECT id FROM library_reads").fetchone()[0]
        )
        assert {r[0] for r in _rows(service, "SELECT read_id FROM play_counts")} == {
            read_id
        }

    def test_the_tracks_table_is_untouched(self, old):
        service, ids = old
        _source(service, IMPORTED)
        _runner(service, 27).migrate()

        assert _rows(service, "SELECT id, play_count FROM tracks ORDER BY id") == [
            (ids[0], 12),
            (ids[1], None),
            (ids[2], 0),
        ]


class TestMigratingALibraryThatWasNeverImported:
    def test_there_is_no_seed_and_no_rows(self, old):
        service, _ = old

        _runner(service, 27).migrate()

        assert _rows(service, "SELECT * FROM library_reads") == []
        assert _rows(service, "SELECT * FROM play_counts") == []


class TestTheTables:
    @pytest.fixture
    def migrated(self, old):
        service, ids = old
        _source(service, IMPORTED)
        _runner(service, 27).migrate()
        return service, ids

    def test_deleting_a_track_removes_its_history(self, migrated):
        service, ids = migrated
        with service.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (ids[0],))

        assert _rows(service, "SELECT track_id FROM play_counts") == [(ids[2],)]
        # The read itself is the library's record and stays.
        assert len(_rows(service, "SELECT id FROM library_reads")) == 1

    def test_a_read_kind_outside_the_vocabulary_is_refused(self, migrated):
        service, _ = migrated
        with (
            pytest.raises(sqlite3.IntegrityError),
            service.transaction() as conn,
        ):
            conn.execute(
                "INSERT INTO library_reads (read_at, kind) VALUES ('t', 'guess')"
            )

    def test_a_track_has_one_count_per_read(self, migrated):
        service, ids = migrated
        read_id = (
            service.connect().execute("SELECT id FROM library_reads").fetchone()[0]
        )
        with (
            pytest.raises(sqlite3.IntegrityError),
            service.transaction() as conn,
        ):
            conn.execute(
                "INSERT INTO play_counts (track_id, read_id, play_count)"
                " VALUES (?, ?, 99)",
                (ids[0], read_id),
            )

    def test_a_count_cannot_name_a_read_that_does_not_exist(self, migrated):
        service, ids = migrated
        with (
            pytest.raises(sqlite3.IntegrityError),
            service.transaction() as conn,
        ):
            conn.execute(
                "INSERT INTO play_counts (track_id, read_id, play_count)"
                " VALUES (?, 9999, 1)",
                (ids[1],),
            )
