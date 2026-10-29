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


def _leave_a_wal_at_close(db, monkeypatch, content: bytes = b"stale-wal-frames"):
    """Make the library still carry a -wal when restore reaches the swap."""
    real = db.close_all

    def close_then_leave_wal():
        real()
        Path(str(db.db_path) + "-wal").write_bytes(content)

    monkeypatch.setattr(db, "close_all", close_then_leave_wal)


def _real_wal_library(db: DatabaseService) -> None:
    """Rows that live only in the -wal: checkpointing is switched off."""
    db.connect().execute("PRAGMA wal_autocheckpoint = 0")


@pytest.mark.unit
class TestStaleWalNeverReplays:
    def test_a_stale_wal_present_at_the_swap_is_moved_before_it(
        self, db, backups, monkeypatch
    ):
        import os

        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Later")
        wal = Path(str(db.db_path) + "-wal")
        _leave_a_wal_at_close(db, monkeypatch)

        seen = {}
        real_replace = os.replace

        def spy(src, dst):
            if Path(dst) == db.db_path:
                seen["wal_at_swap"] = wal.exists()
            return real_replace(src, dst)

        monkeypatch.setattr(os, "replace", spy)
        backups.restore(info.path)
        monkeypatch.undo()

        assert seen == {"wal_at_swap": False}
        assert not wal.exists(), "the old WAL was left beside the restored library"
        assert _titles(db) == ["Original"]
        assert not list(db.db_path.parent.glob(".cuepoint.db*.stale"))

    def test_a_failed_move_aside_aborts_before_the_swap(self, db, backups, monkeypatch):
        import os

        _add_track(db, "1", "Original")
        info = backups.create_backup()
        _add_track(db, "2", "Later")
        db.close_all()
        _leave_a_wal_at_close(db, monkeypatch, b"x" * 64)
        before_db = db.db_path.read_bytes()

        real_replace = os.replace

        def refuse_wal(src, dst):
            if str(src).endswith("-wal") and str(dst).endswith(".stale"):
                raise PermissionError("antivirus has the file open")
            return real_replace(src, dst)

        monkeypatch.setattr(os, "replace", refuse_wal)
        with pytest.raises(DatabaseError) as exc:
            backups.restore(info.path)
        monkeypatch.undo()

        assert exc.value.error_code == "RESTORE_FAILED"
        assert "was not changed" in exc.value.message
        assert "antivirus" not in exc.value.message
        assert db.db_path.read_bytes() == before_db
        assert Path(str(db.db_path) + "-wal").read_bytes() == b"x" * 64

    def test_a_crash_between_the_move_and_the_swap_is_undone_at_start(
        self, db, backups
    ):
        _add_track(db, "1", "Original")
        db.close_all()
        live_wal = Path(str(db.db_path) + "-wal")
        stale = db.db_path.parent / ".cuepoint.db-wal.stale"
        stale.write_bytes(b"wal")
        (db.db_path.parent / ".cuepoint.db.restore").write_bytes(b"temp")
        live_wal.unlink(missing_ok=True)

        backups.sweep_partials()

        assert live_wal.read_bytes() == b"wal"
        assert not stale.exists()
        assert not (db.db_path.parent / ".cuepoint.db.restore").exists()

    def test_leftovers_after_a_finished_swap_are_dropped_at_start(self, db, backups):
        stale = db.db_path.parent / ".cuepoint.db-wal.stale"
        stale.write_bytes(b"wal")
        backups.sweep_partials()
        assert not stale.exists()


@pytest.mark.unit
class TestDamagedSetAside:
    def test_real_wal_rows_survive_a_main_file_that_opens_but_is_corrupt(
        self, db, backups, tmp_path
    ):
        import shutil

        _add_track(db, "1", "Original")
        info = backups.create_backup()
        db.close_all()
        live = db.db_path
        # A crash image: a writer with checkpointing off leaves rows only in the
        # -wal; snapshot main + wal while it is still open.
        writer = sqlite3.connect(str(live))
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint = 0")
        writer.execute(
            "INSERT INTO jobs (id, type, state, created_at, updated_at)"
            " VALUES ('wal-only', 'match', 'completed', 'x', 'x')"
        )
        writer.commit()
        root = writer.execute(
            "SELECT rootpage FROM sqlite_master WHERE name = 'tracks'"
        ).fetchone()[0]
        snap = tmp_path / "snap"
        snap.mkdir()
        shutil.copyfile(live, snap / "main")
        shutil.copyfile(str(live) + "-wal", snap / "wal")
        writer.close()
        wal_bytes = (snap / "wal").read_bytes()
        assert len(wal_bytes) > 0

        main = bytearray((snap / "main").read_bytes())
        main[(root - 1) * 4096 + 8 : (root - 1) * 4096 + 3000] = b"\xff" * (2992)
        for suffix in ("", "-wal", "-shm"):
            Path(str(live) + suffix).unlink(missing_ok=True)
        live.write_bytes(bytes(main))
        Path(str(live) + "-wal").write_bytes(wal_bytes)
        main_corrupt = live.read_bytes()

        aside = backups.restore(info.path)

        assert aside.reason == "pre-restore-damaged"
        assert aside.path.read_bytes() == main_corrupt
        assert Path(str(aside.path) + "-wal").read_bytes() == wal_bytes
        assert _titles(db) == ["Original"]
        assert not list(backups.backup_dir.glob(".*"))

    def test_a_failed_set_aside_aborts_and_changes_nothing(
        self, db, backups, monkeypatch
    ):
        import os

        _add_track(db, "1", "Original")
        info = backups.create_backup()
        db.close_all()
        db.db_path.write_bytes(os.urandom(4096))
        before = db.db_path.read_bytes()

        def no_copy(*_a, **_k):
            raise OSError("disk full")

        monkeypatch.setattr(shutil_module(), "copyfile", no_copy)
        with pytest.raises(DatabaseError) as exc:
            backups.restore(info.path)
        monkeypatch.undo()

        assert exc.value.error_code == "RESTORE_FAILED"
        assert "disk full" not in exc.value.message
        assert db.db_path.read_bytes() == before
        assert not [b for b in backups.list_backups() if "damaged" in b.name]

    def test_orphaned_sidecars_are_swept(self, db, backups):
        backups.backup_dir.mkdir(parents=True, exist_ok=True)
        orphan = (
            backups.backup_dir / "cuepoint-20200101-000000-pre-restore-damaged.db-wal"
        )
        orphan.write_bytes(b"x")
        lone = backups.backup_dir / "cuepoint-20200101-000000-manual.db.json"
        lone.write_text("{}")
        backups.sweep_partials()
        assert not orphan.exists() and not lone.exists()

    def test_delete_removes_the_wal_shm_and_record_too(self, db, backups):
        _add_track(db, "1", "Song")
        made = backups.create_backup(reason="pre-restore-damaged")
        for suffix in ("-wal", "-shm"):
            Path(str(made.path) + suffix).write_bytes(b"x")
        backups.delete_backup(made.name)
        assert list(backups.backup_dir.iterdir()) == []


def shutil_module():
    import shutil

    return shutil


@pytest.mark.unit
class TestMessagesAndNames:
    def test_user_facing_messages_carry_no_raw_error_text(self, db, backups, tmp_path):
        bogus = tmp_path / "bogus.db"
        bogus.write_bytes(b"not a database" * 50)
        with pytest.raises(DatabaseError) as exc:
            backups.verify_backup(bogus)
        assert exc.value.message in {
            "This backup could not be read",
            "This backup failed its integrity check",
        }
        assert str(tmp_path) not in exc.value.message

    def test_the_name_must_match_completely(self, db, backups):
        _add_track(db, "1", "Song")
        made = backups.create_backup()
        for bad in (made.name + "\n", made.name + "x"):
            with pytest.raises(DatabaseError) as exc:
                backups.backup_path(bad)
            assert exc.value.error_code == "BACKUP_INVALID_NAME"

    def test_concurrent_creates_in_one_second_never_share_a_name(self, db, backups):
        import threading

        _add_track(db, "1", "Song")
        made: list = []
        errors: list = []

        def work():
            try:
                service = BackupService(database_service=db)
                made.append(service.create_backup(reason="manual").name)
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        # Each thread has its own connection through the shared service.
        threads = [threading.Thread(target=work) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, errors
        assert len(set(made)) == 6
        assert (
            len(list(backups.backup_dir.glob("cuepoint-*.db"))) == 5
        )  # pruned to keep

    def test_a_reserved_name_is_skipped_not_reused(self, db, backups, monkeypatch):
        _add_track(db, "1", "Song")
        backups.backup_dir.mkdir(parents=True, exist_ok=True)
        first, partial = backups._reserve("manual")
        second, _ = backups._reserve("manual")
        assert first != second and partial.exists()


# ---------------------------------------------------------------------------
# Room for a copy (HARDEN-03)
# ---------------------------------------------------------------------------

MB = 1024 * 1024


def _with_free_space(monkeypatch, free: int) -> None:
    from collections import namedtuple

    usage = namedtuple("usage", "total used free")
    monkeypatch.setattr(
        "cuepoint.services.backup_service.shutil.disk_usage",
        lambda _path: usage(10**12, 10**12 - free, free),
    )


@pytest.mark.unit
class TestRoomForACopy:
    def test_the_room_needed_is_the_library_times_1_2_plus_50_mb_in_whole_mb(
        self, db, backups
    ):
        import math

        from cuepoint.services import backup_service as module

        _add_track(db, "1", "Song")
        size = backups.library_size_bytes()
        assert size > 0
        expected = math.ceil((math.ceil(size * 1.2) + 50 * MB) / MB) * MB
        assert backups.required_free_bytes() == expected
        assert module.ROOM_FACTOR == 1.2 and module.ROOM_EXTRA_BYTES == 50 * MB

    def test_a_launch_backup_with_too_little_room_is_skipped_and_says_why(
        self, db, backups, monkeypatch, caplog
    ):
        from cuepoint.services import backup_service as module

        _add_track(db, "1", "Song")
        _with_free_space(monkeypatch, 1 * MB)
        with caplog.at_level("WARNING"):
            assert backups.backup_on_launch() is None
        assert backups.list_backups() == []
        assert not list(backups.backup_dir.glob(".*partial*"))
        assert module.LAST_LAUNCH_SKIP == {
            "reason": "low_space",
            "requiredFreeBytes": backups.required_free_bytes(),
            "freeBytes": 1 * MB,
        }
        assert "not enough free space" in caplog.text

    def test_with_room_the_launch_backup_is_taken_and_the_skip_cleared(
        self, db, backups, monkeypatch
    ):
        from cuepoint.services import backup_service as module

        _add_track(db, "1", "Song")
        _with_free_space(monkeypatch, 1 * MB)
        backups.backup_on_launch()
        assert module.LAST_LAUNCH_SKIP is not None
        _with_free_space(monkeypatch, 10**11)
        assert backups.backup_on_launch() is not None
        assert module.LAST_LAUNCH_SKIP is None

    def _older_library(self, tmp_path):
        from cuepoint.services.migration_runner import _discovered

        service = DatabaseService(db_path=tmp_path / "old.db")
        migrations = _discovered()
        MigrationRunner(service, migrations=migrations[:-1]).migrate()
        return service, migrations[-1].version

    def test_a_pre_upgrade_copy_with_too_little_room_stops_the_upgrade(
        self, tmp_path, monkeypatch
    ):
        from cuepoint.services.backup_service import NeedsSpaceError

        service, last = self._older_library(tmp_path)
        try:
            copies = BackupService(database_service=service)
            _with_free_space(monkeypatch, 1 * MB)
            with pytest.raises(NeedsSpaceError) as raised:
                copies.ensure_pre_upgrade()
            assert raised.value.required_bytes == copies.required_free_bytes()
            assert raised.value.error_code == "BACKUP_NEEDS_SPACE"
            # Launch does not take a smaller copy instead, or go on without one.
            assert copies.backup_on_launch() is None
            assert copies.list_backups() == []
        finally:
            service.close_all()

    def test_the_pre_upgrade_copy_is_taken_when_there_is_room_and_reused_after(
        self, tmp_path, monkeypatch
    ):
        service, last = self._older_library(tmp_path)
        try:
            copies = BackupService(database_service=service)
            _with_free_space(monkeypatch, 10**11)
            first = copies.ensure_pre_upgrade()
            assert first.reason == "pre-upgrade" and first.pending_versions == (last,)
            assert first.from_schema == last - 1
            # Without being told to, a new copy is taken: the library may have
            # been written to since.
            assert copies.ensure_pre_upgrade().name != first.name
            # Named, it covers a retry even with no room now.
            _with_free_space(monkeypatch, 1 * MB)
            again = copies.ensure_pre_upgrade(reuse=first.name)
            assert again.name == first.name and copies.reused_last_copy
            # A copy from another starting point is not reused.
            with pytest.raises(Exception):
                copies.ensure_pre_upgrade(pending=[last, last + 1], reuse=first.name)
        finally:
            service.close_all()

    def test_a_copy_that_runs_out_of_room_while_written_needs_space(
        self, db, backups, monkeypatch
    ):
        import errno

        from cuepoint.services.backup_service import NeedsSpaceError

        _add_track(db, "1", "Song")
        _with_free_space(monkeypatch, 10**11)
        monkeypatch.setattr(
            "cuepoint.services.backup_service.os.replace",
            lambda *a: (_ for _ in ()).throw(OSError(errno.ENOSPC, "full")),
        )
        with pytest.raises(NeedsSpaceError):
            backups.create_backup(reason="manual")
        assert backups.list_backups() == []
