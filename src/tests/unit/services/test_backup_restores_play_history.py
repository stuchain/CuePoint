#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A restored launch backup brings the play history back (STATS-01, DEC-137).

The history exists nowhere but the database: a refresh overwrites the counts
in ``tracks`` and Rekordbox keeps only the latest, so DEC-009's launch backup is
the only other copy. The backup is a whole-database copy, and m0027 put both
tables in that file; this pins it, so a later change that moved history to a
sidecar or left a table out of the copy would be caught here.
"""

from __future__ import annotations

import pytest

from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.play_history_repository import PlayHistoryRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.backup_service import BackupService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.services.test_play_history import export, track

pytestmark = pytest.mark.unit


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def history(db):
    connection = db.connect()
    return (
        [
            tuple(r)
            for r in connection.execute("SELECT * FROM library_reads ORDER BY id")
        ],
        [
            tuple(r)
            for r in connection.execute(
                "SELECT * FROM play_counts ORDER BY track_id, read_id"
            )
        ],
    )


def test_a_restore_brings_the_reads_and_their_counts_back(db, tmp_path):
    importer = LibraryImportService(
        TrackRepository(db),
        PlaylistRepository(db),
        LibrarySourceRepository(db),
        db,
    )
    importer.import_rekordbox_xml(
        export(tmp_path, "a.xml", track("1", "/m/1.mp3", 3), track("2", "/m/2.mp3", 0))
    )
    importer.apply_refresh(
        importer.compute_refresh_diff(
            export(
                tmp_path, "b.xml", track("1", "/m/1.mp3", 8), track("2", "/m/2.mp3", 0)
            ),
            force=True,
        )
    )
    expected = history(db)
    assert len(expected[0]) == 2 and len(expected[1]) == 3

    backup = BackupService(db).backup_on_launch()
    assert backup is not None

    # Lose the history the way it is lost: the file is still there.
    with db.transaction() as conn:
        conn.execute("DELETE FROM play_counts")
        conn.execute("DELETE FROM library_reads")
    assert history(db) == ([], [])

    BackupService(db).restore(backup.path)

    assert history(db) == expected
    assert PlayHistoryRepository(db).has_reads() is True
