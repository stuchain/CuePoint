#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for library database backup and restore (DEC-009).

The two things that matter most here are covered first: a backup must capture
data still sitting in the WAL, and a restore must never damage a working
library — including when the backup handed to it is unusable.
"""

from __future__ import annotations

import re
import sqlite3
import time
from datetime import datetime
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
class TestBackupNames:
    @pytest.mark.skipif(not hasattr(time, "tzset"), reason="needs time.tzset")
    def test_the_name_carries_local_time_not_utc(self, db, backups, monkeypatch):
        """M272: Activity shows this name; it reads as the user's own clock."""
        # A zone far from UTC, so a name made in UTC cannot pass by accident.
        monkeypatch.setenv("TZ", "Pacific/Auckland")
        time.tzset()
        try:
            self._check_local_name(db, backups)
        finally:
            monkeypatch.undo()
            time.tzset()

    @staticmethod
    def _check_local_name(db, backups):
        _add_track(db, "1", "Song")
        before = datetime.now()
        info = backups.create_backup(reason="launch")
        after = datetime.now()

        match = re.fullmatch(r"cuepoint-(\d{8}-\d{6})-launch\.db", info.name)
        assert match, info.name
        stamp = datetime.strptime(match.group(1), "%Y%m%d-%H%M%S")
        assert before.replace(microsecond=0) <= stamp <= after


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


def _names_in(backups: BackupService) -> list[str]:
    return [b.name for b in backups.list_backups()]


@pytest.mark.unit
class TestWholeOrNothing:
    def test_an_interrupted_create_leaves_an_unlisted_partial_swept_at_start(
        self, db, backups, monkeypatch
    ):
        _add_track(db, "1", "Song")

        def die(*_args, **_kwargs):
            raise KeyboardInterrupt  # not an Exception: nothing cleans up after it

        monkeypatch.setattr(BackupService, "verify_backup", die)
        with pytest.raises(KeyboardInterrupt):
            backups.create_backup()
        monkeypatch.undo()

        leftovers = list(backups.backup_dir.glob(".*.partial"))
        assert len(leftovers) == 1, "the interrupted copy should be a dot-partial"
        assert backups.list_backups() == []

        assert backups.sweep_partials() == 1
        assert list(backups.backup_dir.iterdir()) == []

    def test_launch_sweeps_partials(self, db, backups):
        _add_track(db, "1", "Song")
        backups.backup_dir.mkdir(parents=True, exist_ok=True)
        stale = backups.backup_dir / ".cuepoint-20200101-000000-launch.db.partial"
        stale.write_bytes(b"half")

        backups.backup_on_launch()

        assert not stale.exists()

    def test_a_backup_failing_quick_check_is_deleted_and_not_counted(
        self, db, backups, monkeypatch
    ):
        _add_track(db, "1", "Song")
        good = backups.create_backup()
        time.sleep(0.01)

        real = BackupService.verify_backup

        def corrupt(self, path):
            if Path(path).name.startswith("."):
                raise DatabaseError("bad", error_code="BACKUP_CORRUPT")
            real(self, path)

        monkeypatch.setattr(BackupService, "verify_backup", corrupt)
        with pytest.raises(DatabaseError) as exc:
            backups.create_backup()

        assert exc.value.error_code == "BACKUP_VERIFY_FAILED"
        assert _names_in(backups) == [good.name]
        assert [p.name for p in backups.backup_dir.iterdir() if p.suffix == ".db"] == [
            good.name
        ]
        assert not list(backups.backup_dir.glob(".*"))

    def test_a_restore_interrupted_before_the_replace_leaves_the_library_alone(
        self, db, backups, monkeypatch
    ):
        import os

        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Added Later")
        db.close_all()
        before = db.db_path.read_bytes()

        real_replace = os.replace

        def refuse_library(src, dst):
            if Path(dst) == db.db_path:
                raise OSError("disk went away")
            return real_replace(src, dst)

        monkeypatch.setattr(os, "replace", refuse_library)
        with pytest.raises(DatabaseError) as exc:
            backups.restore(info.path)
        monkeypatch.undo()

        assert exc.value.error_code == "RESTORE_FAILED"
        assert db.db_path.read_bytes() == before
        assert sorted(_titles(db)) == ["Added Later", "Original"]
        assert not list(db.db_path.parent.glob(".cuepoint.db.restore*"))


@pytest.mark.unit
class TestReasonsAndPruning:
    def test_reason_is_parsed_from_the_name(self, db, backups):
        _add_track(db, "1", "Song")
        for reason in ("launch", "manual", "pre-upgrade", "pre-restore"):
            made = backups.create_backup(reason=reason)
            assert made.reason == reason
        assert {b.reason for b in backups.list_backups()} == {
            "launch",
            "manual",
            "pre-upgrade",
            "pre-restore",
        }

    def test_pre_upgrade_is_pruned_on_its_own_count_of_three(self, db, backups):
        _add_track(db, "1", "Song")
        upgrades = []
        for _ in range(5):
            upgrades.append(backups.create_backup(reason="pre-upgrade"))
            time.sleep(0.01)
        for _ in range(7):
            backups.create_backup(reason="launch")
            time.sleep(0.01)

        by_reason: dict[str, list[str]] = {}
        for b in backups.list_backups():
            by_reason.setdefault(b.reason, []).append(b.name)

        assert len(by_reason["pre-upgrade"]) == 3
        assert set(by_reason["pre-upgrade"]) == {u.name for u in upgrades[-3:]}
        assert len(by_reason["launch"]) == 5, "launch copies counted pre-upgrade ones"

    def test_launch_and_manual_share_the_cap(self, db, backups):
        _add_track(db, "1", "Song")
        for reason in ("launch", "manual") * 4:
            backups.create_backup(reason=reason)
            time.sleep(0.01)
        assert len(backups.list_backups()) == 5

    def test_pre_restore_damaged_is_never_pruned(self, db, backups):
        _add_track(db, "1", "Song")
        aside = backups.create_backup(reason="pre-restore-damaged")
        for _ in range(8):
            backups.create_backup()
            time.sleep(0.01)
        assert aside.path.exists()

    def test_pre_upgrade_records_both_versions(self, db, backups):
        from cuepoint.persistence.library_meta import LAST_OPENED_BY, set_meta
        from cuepoint.version import __version__

        _add_track(db, "1", "Song")
        set_meta(db, LAST_OPENED_BY, "0.9.0")

        made = backups.create_backup(reason="pre-upgrade")

        assert (made.app_version, made.from_version, made.to_version) == (
            "0.9.0",
            "0.9.0",
            __version__,
        )
        assert backups.list_backups()[0].to_version == __version__


@pytest.mark.unit
class TestDeleteBackup:
    def test_deletes_a_backup_and_its_record(self, db, backups):
        _add_track(db, "1", "Song")
        made = backups.create_backup()
        backups.delete_backup(made.name)
        assert backups.list_backups() == []
        assert list(backups.backup_dir.iterdir()) == []

    @pytest.mark.parametrize(
        "name",
        ["../cuepoint.db", "/etc/passwd", "a/b.db", "cuepoint.db", "", "..", "x\\y.db"],
    )
    def test_refuses_names_outside_the_backup_folder(self, db, backups, name):
        _add_track(db, "1", "Song")
        backups.create_backup()
        with pytest.raises(DatabaseError) as exc:
            backups.delete_backup(name)
        assert exc.value.error_code == "BACKUP_INVALID_NAME"
        assert db.db_path.exists()

    def test_unknown_backup(self, backups):
        with pytest.raises(DatabaseError) as exc:
            backups.delete_backup("cuepoint-20200101-000000-manual.db")
        assert exc.value.error_code == "BACKUP_NOT_FOUND"


@pytest.mark.unit
class TestRestoreOfADamagedLibrary:
    def test_the_damaged_library_is_set_aside_by_file_copy_and_replaced(
        self, db, backups
    ):
        import os

        _add_track(db, "1", "Original")
        info = backups.create_backup()
        db.close_all()
        noise = os.urandom(4096)
        db.db_path.write_bytes(noise)
        Path(str(db.db_path) + "-wal").write_bytes(b"wal-bytes")

        aside = backups.restore(info.path)

        assert aside.reason == "pre-restore-damaged"
        assert aside.path.read_bytes() == noise
        assert Path(str(aside.path) + "-wal").read_bytes() == b"wal-bytes"
        assert _titles(db) == ["Original"]
