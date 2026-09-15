#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The record of tag writes, and what a write reads (CLEAN-10, DEC-070).

- **What a write reads is the effective value** — CuePoint's override over
  Rekordbox's column — and the file check for the path the track has now.
- **A record is kept whatever happens to its track**, and only a pending row is
  ever changed: confirmed, or marked failed.
- **A write is restorable until a restore of it is confirmed**, newest first,
  by job or by track; a pending or skipped restore leaves it restorable.
- **Migration 0018** adds the flag, the reference and its index, and a file
  write's new size is recorded only against the present file it was written to.
"""

from __future__ import annotations

import sqlite3
import uuid
from typing import Dict, Optional

import pytest

from cuepoint.models.file_status import (
    FILE_MISSING,
    FILE_NOT_CHECKED,
    FILE_PRESENT,
    TrackFileStatus,
)
from cuepoint.models.file_write import (
    WRITE_FAILED,
    WRITE_RESTORED,
    WRITE_SKIPPED,
    WRITE_WRITTEN,
    FileWrite,
)
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.file_write_repository import FileWriteRepository, TagTarget
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner, discover_migrations

NOW = "2026-09-15T12:00:00+00:00"


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> FileWriteRepository:
    return FileWriteRepository(db)


def add(db, path: str = "/m/a.mp3", **fields) -> int:
    rekordbox_id = uuid.uuid4().hex
    TrackRepository(db).add_many(
        [
            LibraryTrack(
                rekordbox_track_id=rekordbox_id,
                title="T",
                artist="A",
                file_path=path,
                **fields,
            )
        ]
    )
    return int(
        db.connect()
        .execute("SELECT id FROM tracks WHERE rekordbox_track_id = ?", (rekordbox_id,))
        .fetchone()["id"]
    )


def check(db, track_id: int, status: str, path: str, size: Optional[int] = 10) -> None:
    with db.transaction():
        FileStatusRepository(db).record(
            [
                TrackFileStatus(
                    track_id,
                    status,
                    path,
                    NOW,
                    size_bytes=size if status == FILE_PRESENT else None,
                )
            ]
        )


def row(**overrides) -> FileWrite:
    fields: Dict[str, object] = dict(
        job_id="job-1",
        file_path="/m/a.mp3",
        field="key",
        outcome=WRITE_WRITTEN,
        written_at=NOW,
        old_value_json="null",
        new_value_json='{"TKEY": ["Am"]}',
        pending=True,
    )
    fields.update(overrides)
    return FileWrite(**fields)  # type: ignore[arg-type]


@pytest.mark.unit
class TestTargets:
    def test_the_effective_value_is_the_override_over_rekordbox(self, db, repo):
        track = add(db, key="C", bpm=120.0, genre="House", label="Label", year=2001)
        metadata = TrackMetadataRepository(db)
        metadata.set_override(track, "key", "Am")
        metadata.set_override(track, "bpm", 124.5)
        metadata.set_override(track, "year", 2019)

        [target] = repo.targets([track])

        assert (target.key, target.bpm, target.genre, target.label, target.year) == (
            "Am",
            124.5,
            "House",
            "Label",
            2019,
        )

    def test_neither_layer_is_none(self, db, repo):
        [target] = repo.targets([add(db)])
        assert (target.key, target.bpm, target.genre, target.label, target.year) == (
            None,
            None,
            None,
            None,
            None,
        )

    def test_the_file_check_is_read_for_the_path_the_track_has_now(self, db, repo):
        present = add(db, "/m/present.mp3")
        check(db, present, FILE_PRESENT, "/m/present.mp3")
        missing = add(db, "/m/missing.mp3")
        check(db, missing, FILE_MISSING, "/m/missing.mp3")
        moved = add(db, "/m/moved.mp3")
        check(db, moved, FILE_PRESENT, "/old/moved.mp3")
        never = add(db, "/m/never.mp3")

        statuses = {
            target.track_id: target.current_file_status
            for target in repo.targets([present, missing, moved, never])
        }

        assert statuses == {
            present: FILE_PRESENT,
            missing: FILE_MISSING,
            moved: FILE_NOT_CHECKED,
            never: FILE_NOT_CHECKED,
        }

    def test_a_track_with_no_path_is_not_checked(self):
        assert (
            TagTarget(
                1, "", file_status=FILE_PRESENT, checked_path=""
            ).current_file_status
            == FILE_NOT_CHECKED
        )

    def test_order_given_once_each_and_strangers_dropped(self, db, repo):
        first, second = add(db, "/m/1.mp3"), add(db, "/m/2.mp3")

        found = repo.targets([second, 99_999, first, second])

        assert [target.track_id for target in found] == [second, first]


@pytest.mark.unit
class TestTheRecord:
    def test_rows_are_recorded_in_order_and_read_back_whole(self, db, repo):
        track = add(db)

        ids = repo.record([row(track_id=track), row(track_id=track, field="year")])

        assert ids == sorted(ids) and len(ids) == 2
        stored = repo.for_job("job-1")
        assert [record.id for record in stored] == ids
        assert stored[0] == row(track_id=track, id=ids[0])
        assert repo.for_track(track) == stored
        assert repo.get(ids[1]) == stored[1]
        assert repo.get(99_999) is None
        assert repo.pending_count() == 2

    def test_a_row_for_a_track_just_deleted_is_kept_against_no_track(self, db, repo):
        track = add(db)
        with db.transaction() as conn:
            conn.execute("DELETE FROM tracks WHERE id = ?", (track,))

        [write_id] = repo.record([row(track_id=track)])

        stored = repo.get(write_id)
        assert stored is not None and stored.track_id is None
        assert stored.file_path == "/m/a.mp3"

    def test_a_recorded_row_is_never_recorded_again(self, repo):
        with pytest.raises(ValueError, match="never recorded again"):
            repo.record([row(id=5)])

    def test_nothing_to_record_records_nothing(self, repo):
        assert repo.record([]) == []

    def test_only_a_pending_row_is_confirmed_or_failed(self, repo):
        pending, done = repo.record([row(), row(pending=False)])

        assert repo.confirm(pending, '{"TKEY": ["Bbm"]}') is True
        assert repo.confirm(pending, "null") is False
        assert repo.fail(done, "late") is False
        confirmed = repo.get(pending)
        assert confirmed is not None
        assert (confirmed.pending, confirmed.new_value) == (False, {"TKEY": ["Bbm"]})

    def test_a_failure_says_why_and_stops_being_pending(self, repo):
        [write_id] = repo.record([row()])

        with pytest.raises(ValueError, match="say why"):
            repo.fail(write_id, " ")
        assert repo.fail(write_id, "locked") is True

        failed = repo.get(write_id)
        assert failed is not None
        assert (failed.outcome, failed.pending, failed.reason) == (
            WRITE_FAILED,
            False,
            "locked",
        )
        assert repo.pending_count() == 0


@pytest.mark.unit
class TestRestorable:
    def test_newest_first_by_job_and_by_track(self, db, repo):
        one, two = add(db, "/m/1.mp3"), add(db, "/m/2.mp3")
        a = repo.record([row(track_id=one, pending=False)])[0]
        b = repo.record([row(track_id=two, job_id="job-2", pending=False)])[0]
        c = repo.record(
            [row(track_id=one, job_id="job-2", field="year", pending=False)]
        )[0]

        assert [w.id for w in repo.restorable(job_id="job-2")] == [c, b]
        assert [w.id for w in repo.restorable(track_id=one)] == [c, a]

    def test_only_a_confirmed_restore_ends_a_write(self, db, repo):
        written, other, failed = repo.record(
            [
                row(pending=False),
                row(pending=False, field="year"),
                row(pending=False, field="label"),
            ]
        )
        with db.transaction() as conn:
            conn.execute(
                "UPDATE file_writes SET outcome = 'failed', reason = 'x' WHERE id = ?",
                (failed,),
            )
        restore_pending, stale = repo.record(
            [
                row(
                    job_id="r", outcome=WRITE_RESTORED, restore_of=written, pending=True
                ),
                row(
                    job_id="r",
                    outcome=WRITE_SKIPPED,
                    reason="stale",
                    restore_of=other,
                    pending=False,
                ),
            ]
        )

        # A failed write has nothing to restore; a pending or skipped restore
        # has not undone its write.
        assert [w.id for w in repo.restorable(job_id="job-1")] == [other, written]

        repo.confirm(restore_pending, "null")

        assert [w.id for w in repo.restorable(job_id="job-1")] == [other]
        assert repo.restorable(job_id="r") == []

    @pytest.mark.parametrize("scope", [{}, {"job_id": "a", "track_id": 1}])
    def test_a_job_or_a_track_exactly(self, repo, scope):
        with pytest.raises(ValueError, match="not both or neither"):
            repo.restorable(**scope)


@pytest.mark.unit
class TestMigration18:
    def test_it_is_discovered(self):
        by_version = {m.version: m for m in discover_migrations()}
        assert by_version[18].module_name == "m0018_tag_writes"

    def test_a_restore_must_name_a_write_that_exists(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO file_writes (job_id, file_path, field, outcome,"
                    " written_at, restore_of) VALUES ('r', '/m', 'key', 'restored', ?, 424242)",
                    (NOW,),
                )

    def test_the_reference_is_indexed_where_it_is_set(self, db):
        row_ = (
            db.connect()
            .execute(
                "SELECT sql FROM sqlite_master WHERE name = 'idx_file_writes_restore_of'"
            )
            .fetchone()
        )
        assert row_ is not None
        assert "restore_of IS NOT NULL" in row_["sql"]

    def test_a_row_from_before_the_migration_is_not_pending(self, db):
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO file_writes (job_id, file_path, field, outcome, written_at)"
                " VALUES ('old', '/m', 'key', 'written', ?)",
                (NOW,),
            )
        [old] = FileWriteRepository(db).for_job("old")
        assert (old.pending, old.restore_of) == (False, None)


@pytest.mark.unit
class TestTheNewSize:
    def test_recorded_only_for_the_present_file_at_that_path(self, db):
        statuses = FileStatusRepository(db)
        present = add(db, "/m/p.mp3")
        check(db, present, FILE_PRESENT, "/m/p.mp3", size=10)
        missing = add(db, "/m/x.mp3")
        check(db, missing, FILE_MISSING, "/m/x.mp3")
        moved = add(db, "/m/moved.mp3")
        check(db, moved, FILE_PRESENT, "/old/moved.mp3", size=10)

        assert statuses.refresh_size(
            present, "/m/p.mp3", 99, "2026-09-16T00:00:00+00:00"
        )
        assert not statuses.refresh_size(missing, "/m/x.mp3", 99, NOW)
        assert not statuses.refresh_size(moved, "/m/moved.mp3", 99, NOW)

        updated = statuses.get(present)
        assert updated is not None
        assert (updated.size_bytes, updated.checked_at) == (
            99,
            "2026-09-16T00:00:00+00:00",
        )
        moved_row = statuses.get(moved)
        assert moved_row is not None and moved_row.size_bytes == 10
