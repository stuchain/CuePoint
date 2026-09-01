#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for library database backup and restore (DEC-009).

The two things that matter most here are covered first: a backup must capture
data still sitting in the WAL, and a restore must never damage a working
library — including when the backup handed to it is unusable.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

import pytest

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.backup_service import PRE_RESTORE_REASON, BackupService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IBackupService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def backups(db) -> BackupService:
    return BackupService(database_service=db)


def _add_track(db: DatabaseService, track_id: str, title: str) -> None:
    TrackRepository(db).add(
        LibraryTrack(
            rekordbox_track_id=track_id,
            title=title,
            artist="Artist",
            file_path=f"/music/{track_id}.mp3",
        )
    )


def _titles(db: DatabaseService) -> list[str]:
    return [t.title for t in TrackRepository(db).list_all()]


def _rows_in_backup(path: Path, table: str = "tracks") -> int:
    connection = sqlite3.connect(str(path))
    try:
        return connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
    finally:
        connection.close()


@pytest.mark.unit
class TestInterface:
    def test_implements_interface(self):
        assert issubclass(BackupService, IBackupService)

    def test_no_unimplemented_abstract_methods(self):
        assert not getattr(BackupService, "__abstractmethods__", frozenset())


@pytest.mark.unit
class TestBackupCapturesWalContent:
    """The reason backups use SQLite's API rather than copying the file."""

    def test_backup_contains_uncheckpointed_writes(self, db, backups):
        _add_track(db, "1", "Written Just Now")

        info = backups.create_backup()

        assert _rows_in_backup(info.path) == 1, (
            "backup missed data still in the WAL — it was taken by copying the "
            "file rather than through SQLite"
        )

    def test_backup_is_a_valid_database(self, db, backups):
        _add_track(db, "1", "Song")
        info = backups.create_backup()
        backups.verify_backup(info.path)  # must not raise

    def test_backup_of_missing_database_is_rejected(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "absent.db")
        try:
            with pytest.raises(DatabaseError) as exc:
                BackupService(database_service=service).create_backup()
            assert exc.value.error_code == "BACKUP_NO_DATABASE"
        finally:
            service.close_all()

    def test_backups_within_the_same_second_do_not_collide(self, db, backups):
        _add_track(db, "1", "Song")
        first = backups.create_backup()
        second = backups.create_backup()
        assert first.path != second.path
        assert first.path.exists() and second.path.exists()


@pytest.mark.unit
class TestListingAndRetention:
    def test_lists_newest_first(self, db, backups):
        _add_track(db, "1", "Song")
        for _ in range(3):
            backups.create_backup()
            time.sleep(0.01)

        listed = backups.list_backups()
        mtimes = [b.path.stat().st_mtime for b in listed]
        assert mtimes == sorted(mtimes, reverse=True)

    def test_no_backups_yet(self, backups):
        assert backups.list_backups() == []

    def test_prune_keeps_the_cap(self, db, backups):
        _add_track(db, "1", "Song")
        for _ in range(6):
            backups.create_backup()
            time.sleep(0.01)

        backups.prune(keep=2)
        assert len(backups.list_backups()) == 2

    def test_prune_removes_oldest_first(self, db, backups):
        _add_track(db, "1", "Song")
        created = []
        for _ in range(4):
            created.append(backups.create_backup())
            time.sleep(0.01)

        backups.prune(keep=1)
        remaining = {b.name for b in backups.list_backups()}
        assert created[-1].name in remaining
        assert created[0].name not in remaining

    def test_pre_restore_backups_survive_pruning(self, db, backups):
        """They exist for the case where the restore was the mistake."""
        _add_track(db, "1", "Song")
        safety = backups.create_backup(reason=PRE_RESTORE_REASON)
        for _ in range(5):
            backups.create_backup()
            time.sleep(0.01)

        backups.prune(keep=1)

        assert safety.path.exists(), "the pre-restore safety copy was pruned away"


@pytest.mark.unit
class TestBackupOnLaunch:
    def test_backs_up_when_the_database_changed(self, db, backups):
        _add_track(db, "1", "Song")
        assert backups.backup_on_launch() is not None

    def test_skips_when_nothing_changed(self, db, backups):
        _add_track(db, "1", "Song")
        assert backups.backup_on_launch() is not None
        assert backups.backup_on_launch() is None, "backed up an unchanged database"

    def test_backs_up_again_after_a_change(self, db, backups):
        _add_track(db, "1", "Song")
        backups.backup_on_launch()
        time.sleep(0.02)
        _add_track(db, "2", "Another")

        assert backups.backup_on_launch() is not None

    def test_never_raises(self, tmp_path, monkeypatch):
        """A backup problem must not stop the application starting."""
        service = DatabaseService(db_path=tmp_path / "cuepoint.db")
        try:
            MigrationRunner(service).migrate()
            backup_service = BackupService(database_service=service)
            monkeypatch.setattr(
                backup_service,
                "create_backup",
                lambda reason="launch": (_ for _ in ()).throw(
                    RuntimeError("disk full")
                ),
            )
            assert backup_service.backup_on_launch() is None
        finally:
            service.close_all()

    def test_missing_database_is_not_an_error(self, tmp_path):
        service = DatabaseService(db_path=tmp_path / "absent.db")
        try:
            assert BackupService(database_service=service).backup_on_launch() is None
        finally:
            service.close_all()


@pytest.mark.unit
class TestVerifyBackup:
    def test_missing_file_rejected(self, backups, tmp_path):
        with pytest.raises(DatabaseError) as exc:
            backups.verify_backup(tmp_path / "nope.db")
        assert exc.value.error_code == "BACKUP_NOT_FOUND"

    def test_non_database_file_rejected(self, backups, tmp_path):
        bogus = tmp_path / "bogus.db"
        bogus.write_bytes(b"this is not a database" * 50)
        with pytest.raises(DatabaseError) as exc:
            backups.verify_backup(bogus)
        assert exc.value.error_code in {"BACKUP_UNREADABLE", "BACKUP_CORRUPT"}


@pytest.mark.unit
class TestRestore:
    def test_round_trip(self, db, backups):
        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Added Later")
        assert len(_titles(db)) == 2

        backups.restore(info.path)

        assert _titles(db) == ["Original"]

    def test_takes_a_safety_backup_first(self, db, backups):
        """A restore chosen by mistake must itself be recoverable."""
        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Would Be Lost")

        safety = backups.restore(info.path)

        assert PRE_RESTORE_REASON in safety.name
        assert _rows_in_backup(safety.path) == 2, (
            "the safety copy does not contain the pre-restore state"
        )

    def test_the_restore_can_itself_be_undone(self, db, backups):
        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Added Later")

        safety = backups.restore(info.path)
        assert _titles(db) == ["Original"]

        backups.restore(safety.path)

        assert sorted(_titles(db)) == ["Added Later", "Original"]

    def test_corrupt_backup_is_rejected_before_touching_the_library(
        self, db, backups, tmp_path
    ):
        """Restoring a bad file over a working library is the worst outcome."""
        _add_track(db, "1", "Precious")
        bogus = tmp_path / "bogus.db"
        bogus.write_bytes(b"not a database" * 50)

        with pytest.raises(DatabaseError):
            backups.restore(bogus)

        assert _titles(db) == ["Precious"], "the live library was damaged"

    def test_missing_backup_is_rejected_before_touching_the_library(
        self, db, backups, tmp_path
    ):
        _add_track(db, "1", "Precious")

        with pytest.raises(DatabaseError):
            backups.restore(tmp_path / "absent.db")

        assert _titles(db) == ["Precious"]

    def test_stale_sidecars_are_cleared(self, db, backups):
        """A -wal from the old database must not be applied to the new file.

        Checked immediately after the restore, before anything reopens the
        database — a fresh WAL for the restored file is expected and fine.
        """
        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Added Later")

        backups.restore(info.path)

        for suffix in ("-wal", "-shm"):
            assert not Path(str(db.db_path) + suffix).exists(), (
                f"stale {suffix} left behind after restore"
            )

    def test_restored_database_is_usable(self, db, backups):
        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Added Later")

        backups.restore(info.path)

        # Writes still work against the restored file.
        _add_track(db, "3", "After Restore")
        assert sorted(_titles(db)) == ["After Restore", "Original"]
