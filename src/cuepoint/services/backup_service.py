#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Library database backups (DEC-009).

Automatic backup on launch when the database changed, a retention cap, and
manual backup/restore.

**Backups are taken with SQLite's backup API, never by copying the file.** The
database runs in WAL mode, so at rest it is three files — ``cuepoint.db`` plus
``-wal`` and ``-shm`` sidecars — and recent commits live in the WAL until a
checkpoint folds them in. Copying only ``cuepoint.db`` produces a backup missing
everything since the last checkpoint; in testing, a fresh database's entire
schema and all its rows were still in the WAL, so the copy did not even contain
the tables. That failure is silent until someone tries to restore, which is the
worst possible moment to discover it.

Restore is the one operation here with real blast radius, so it verifies the
backup before touching anything, takes a safety copy of the current database
first, and clears the stale sidecars that would otherwise be reapplied on top of
the restored file.
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services.interfaces import (
    IBackupService,
    IConfigService,
    IDatabaseService,
)

_logger = logging.getLogger(__name__)

BACKUP_PREFIX = "cuepoint-"
BACKUP_SUFFIX = ".db"
# Written next to a restore so the pre-restore state is always recoverable.
PRE_RESTORE_REASON = "pre-restore"


@dataclass(frozen=True)
class BackupInfo:
    """A backup file on disk."""

    path: Path
    created_at: str
    size_bytes: int

    @property
    def name(self) -> str:
        return self.path.name


class BackupService(IBackupService):
    """Creates, lists, prunes and restores library database backups."""

    def __init__(
        self,
        database_service: IDatabaseService,
        config_service: Optional[IConfigService] = None,
    ) -> None:
        self._db = database_service
        self._config = config_service

    # ------------------------------------------------------------- settings

    def _setting(self, key: str, default):
        if self._config is None:
            return default
        try:
            value = self._config.get(key)
        except AttributeError:
            return default
        return default if value is None else value

    @property
    def backup_dir(self) -> Path:
        """Directory holding backups; defaults to ``<db dir>/backups``."""
        configured = self._setting("backup.directory", None)
        if configured and str(configured).strip():
            return Path(str(configured).strip())
        return self._db.db_path.parent / "backups"

    @property
    def keep(self) -> int:
        try:
            return max(1, int(self._setting("backup.keep", 5)))
        except (TypeError, ValueError):
            return 5

    @property
    def enabled(self) -> bool:
        return bool(self._setting("backup.enabled", True))

    # -------------------------------------------------------------- create

    def create_backup(self, reason: str = "manual") -> BackupInfo:
        """Write a consistent copy of the database and prune old ones.

        Raises:
            DatabaseError: If the backup cannot be written.
        """
        source = self._db.db_path
        if not source.exists():
            raise DatabaseError(
                message="There is no library database to back up yet",
                error_code="BACKUP_NO_DATABASE",
                context={"db_path": str(source)},
            )

        self.backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d-%H%M%S")
        target = self.backup_dir / f"{BACKUP_PREFIX}{stamp}-{reason}{BACKUP_SUFFIX}"
        # Two backups within the same second must not collide.
        counter = 1
        while target.exists():
            target = (
                self.backup_dir
                / f"{BACKUP_PREFIX}{stamp}-{reason}-{counter}{BACKUP_SUFFIX}"
            )
            counter += 1

        try:
            destination = sqlite3.connect(str(target))
            try:
                # Resolves WAL content; safe against a live, in-use database.
                self._db.connect().backup(destination)
            finally:
                destination.close()
        except (sqlite3.Error, OSError) as exc:
            target.unlink(missing_ok=True)
            raise DatabaseError(
                message=f"Could not create a database backup: {exc}",
                error_code="BACKUP_FAILED",
                context={"db_path": str(source), "target": str(target)},
            ) from exc

        _logger.info("[backup] wrote %s", target.name)
        self.prune()
        return self._info(target)

    def backup_on_launch(self) -> Optional[BackupInfo]:
        """Back up if enabled and the database changed since the last backup.

        Never raises: a backup problem must not stop the application starting.
        Returns the backup taken, or ``None`` if one was not needed.
        """
        try:
            if not self.enabled or not self._db.db_path.exists():
                return None
            if not self._changed_since_last_backup():
                return None
            return self.create_backup(reason="launch")
        except Exception as exc:  # noqa: BLE001 - must not block startup
            _logger.warning("[backup] launch backup skipped: %s", exc)
            return None

    def _changed_since_last_backup(self) -> bool:
        backups = self.list_backups()
        if not backups:
            return True

        newest_backup = max(b.path.stat().st_mtime for b in backups)
        # Commits land in the -wal sidecar, so the main file's mtime alone can
        # sit still while the database is actively changing.
        source_mtime = 0.0
        for suffix in ("", "-wal", "-shm"):
            candidate = Path(str(self._db.db_path) + suffix)
            if candidate.exists():
                source_mtime = max(source_mtime, candidate.stat().st_mtime)

        return source_mtime > newest_backup

    # ---------------------------------------------------------------- list

    @staticmethod
    def _info(path: Path) -> BackupInfo:
        stat = path.stat()
        return BackupInfo(
            path=path,
            created_at=datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat(),
            size_bytes=stat.st_size,
        )

    def list_backups(self) -> List[BackupInfo]:
        """Return backups, newest first."""
        directory = self.backup_dir
        if not directory.is_dir():
            return []
        files = [
            path
            for path in directory.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}")
            if path.is_file()
        ]
        files.sort(key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
        return [self._info(path) for path in files]

    def prune(self, keep: Optional[int] = None) -> int:
        """Delete the oldest backups beyond the retention cap.

        Pre-restore safety copies are never pruned: they exist precisely for the
        case where a restore turned out to be a mistake.

        Returns:
            Number of backups deleted.
        """
        limit = self.keep if keep is None else max(1, int(keep))
        prunable = [
            info for info in self.list_backups() if PRE_RESTORE_REASON not in info.name
        ]

        deleted = 0
        for info in prunable[limit:]:
            try:
                info.path.unlink()
                deleted += 1
            except OSError as exc:
                _logger.warning("[backup] could not delete %s: %s", info.name, exc)
        return deleted

    # ------------------------------------------------------------- restore

    def verify_backup(self, backup_path: Path) -> None:
        """Check a backup is a readable database before it is used.

        Raises:
            DatabaseError: If the file is missing, unreadable or fails an
                integrity check.
        """
        path = Path(backup_path)
        if not path.is_file():
            raise DatabaseError(
                message=f"Backup file not found: {path}",
                error_code="BACKUP_NOT_FOUND",
                context={"backup": str(path)},
            )

        try:
            connection = sqlite3.connect(str(path))
            try:
                result = connection.execute("PRAGMA quick_check").fetchone()[0]
            finally:
                connection.close()
        except sqlite3.Error as exc:
            raise DatabaseError(
                message=f"This backup could not be read: {exc}",
                error_code="BACKUP_UNREADABLE",
                context={"backup": str(path)},
            ) from exc

        if result != "ok":
            raise DatabaseError(
                message=f"This backup failed its integrity check: {result}",
                error_code="BACKUP_CORRUPT",
                context={"backup": str(path), "quick_check": result},
            )

    def restore(self, backup_path: Path) -> BackupInfo:
        """Replace the library database with a backup.

        The current database is backed up first, so a restore chosen by mistake
        is itself recoverable. The backup is verified before anything is
        touched: restoring a corrupt file over a working library would turn a
        recoverable situation into data loss.

        Returns:
            The safety backup taken of the pre-restore database.

        Raises:
            DatabaseError: If the backup is unusable or the restore fails.
        """
        source = Path(backup_path)
        self.verify_backup(source)

        safety: Optional[BackupInfo] = None
        if self._db.db_path.exists():
            safety = self.create_backup(reason=PRE_RESTORE_REASON)

        # Connections hold the old file open and its WAL in memory.
        self._db.close_all()

        target = self._db.db_path
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            # Restore through SQLite rather than copying the file, so the result
            # is a clean database rather than one paired with stale sidecars.
            destination = sqlite3.connect(str(target))
            try:
                origin = sqlite3.connect(str(source))
                try:
                    origin.backup(destination)
                finally:
                    origin.close()
            finally:
                destination.close()

            # Any -wal/-shm left from the previous database describe a file that
            # no longer exists; SQLite would try to apply them to the new one.
            for suffix in ("-wal", "-shm"):
                Path(str(target) + suffix).unlink(missing_ok=True)
        except (sqlite3.Error, OSError) as exc:
            raise DatabaseError(
                message=(
                    f"Restoring the backup failed: {exc}. The database from "
                    "before the restore was saved first"
                    + (f" as {safety.name}" if safety else "")
                ),
                error_code="RESTORE_FAILED",
                context={
                    "backup": str(source),
                    "db_path": str(target),
                    "safety_backup": safety.name if safety else None,
                },
            ) from exc

        _logger.info("[backup] restored library database from %s", source.name)
        return safety if safety is not None else self._info(source)
