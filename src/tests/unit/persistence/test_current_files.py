#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Each track's current file, and the check made there (WAVE-02).

``FileStatusRepository.current_files`` is the one answer to "which file is
this track, and may it be opened". Phase 11 keys its waveforms by the path it
answers, and opens only a file it says is present, so its mistakes would be a
waveform stored under the wrong key or a file opened that the check never
found.
"""

from __future__ import annotations

import pytest

from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_PRESENT,
    REASON_ROOT_UNAVAILABLE,
    CurrentFile,
    TrackFileStatus,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.id_chunks import CHUNK_SIZE
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-30T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def add(db, paths):
    TrackRepository(db).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=f"rb-{i}", title="T", artist="A", file_path=p
            )
            for i, p in enumerate(paths)
        ]
    )
    rows = db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
    by = {r["rekordbox_track_id"]: int(r["id"]) for r in rows}
    return [by[f"rb-{i}"] for i in range(len(paths))]


@pytest.mark.unit
class TestCurrentFiles:
    def test_each_kind_of_track(self, db):
        repo = FileStatusRepository(db)
        present, missing, root, never, moved, no_path = add(
            db, ["/m/a.flac", "/m/b.flac", "/V/c.flac", "/m/d.flac", "/m/new.flac", ""]
        )
        repo.record(
            [
                TrackFileStatus(present, FILE_PRESENT, "/m/a.flac", NOW, size_bytes=5),
                TrackFileStatus(missing, FILE_MISSING, "/m/b.flac", NOW),
                TrackFileStatus(
                    root, FILE_MISSING, "/V/c.flac", NOW, reason=REASON_ROOT_UNAVAILABLE
                ),
                TrackFileStatus(moved, FILE_PRESENT, "/m/old.flac", NOW, size_bytes=5),
            ]
        )

        found = repo.current_files([present, missing, root, never, moved, no_path])

        assert found == [
            CurrentFile(present, "/m/a.flac", FILE_PRESENT),
            CurrentFile(missing, "/m/b.flac", FILE_MISSING),
            CurrentFile(root, "/V/c.flac", FILE_MISSING, REASON_ROOT_UNAVAILABLE),
            CurrentFile(never, "/m/d.flac"),
            # A check of the old path is not this path's check.
            CurrentFile(moved, "/m/new.flac"),
            CurrentFile(no_path, ""),
        ]
        assert [f.is_present for f in found] == [
            True,
            False,
            False,
            False,
            False,
            False,
        ]

    def test_order_duplicates_and_strangers(self, db):
        a, b = add(db, ["/a", "/b"])

        found = FileStatusRepository(db).current_files([b, 424242, a, b])

        assert [f.track_id for f in found] == [b, a]

    def test_more_ids_than_one_query_holds(self, db):
        ids = add(db, [f"/m/{i}.flac" for i in range(CHUNK_SIZE * 2 + 3)])

        found = FileStatusRepository(db).current_files(ids)

        assert [f.track_id for f in found] == ids
        assert found[-1].path == f"/m/{CHUNK_SIZE * 2 + 2}.flac"
