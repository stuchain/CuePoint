#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Library backups (DEC-009, HARDEN-01).

Automatic backup on launch when the library changed, a copy before every
upgrade, a retention cap, and manual backup/restore.

**Backups are taken with SQLite's backup API, never by copying the file.** The
library runs in WAL mode, so at rest it is three files — ``cuepoint.db`` plus
``-wal`` and ``-shm`` sidecars — and recent commits live in the WAL until a
checkpoint folds them in. Copying only ``cuepoint.db`` produces a backup missing
everything since the last checkpoint; that failure is silent until someone tries
to restore, which is the worst possible moment to discover it. The one
exception is a library too damaged to open (below), where a plain file copy of
all three files is the only thing left.

**Whole or nothing.** A backup is written to ``.<name>.partial``, checked with
``quick_check`` and only then renamed to its real name, so a crash leaves a
dot-file that is never listed and that :meth:`BackupService.sweep_partials`
removes at the next start. A copy that fails its check is deleted and reported,
never counted. A restore is built beside the library in a temp file, checked,
and swapped in with ``os.replace``; a failure before the swap leaves the library
byte-identical.

**Reasons** are part of the file name, ``cuepoint-<stamp>-<reason>[-n].db``:
``launch``, ``manual``, ``pre-upgrade``, ``pre-restore`` and
``pre-restore-damaged``. Launch and manual copies share the ``backup.keep`` cap;
``pre-upgrade`` copies are kept on their own count (:data:`PRE_UPGRADE_KEEP`);
the two ``pre-restore`` kinds are never pruned automatically.

**Versions** are recorded in a small ``<name>.json`` sidecar beside each copy
(not inside it, so a copy stays a byte-for-byte SQLite backup):
``appVersion`` is the CuePoint version that last opened the library
(``library_meta.last_opened_by``, if the library has one), and a ``pre-upgrade``
copy adds ``fromVersion`` (the same) and ``toVersion`` (the build taking the
copy). A missing or unreadable sidecar just means the version is unknown.

**A damaged library can be restored.** When the library cannot be opened or
fails its check, restore sets the file and its sidecars aside with a plain copy
(reason ``pre-restore-damaged``) rather than through SQLite, then restores as
usual.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services.interfaces import (
    IBackupService,
    IConfigService,
    IDatabaseService,
)
from cuepoint.utils.quoting import quoted

_logger = logging.getLogger(__name__)

BACKUP_PREFIX = "cuepoint-"
BACKUP_SUFFIX = ".db"
SIDECAR_SUFFIX = ".json"
PARTIAL_SUFFIX = ".partial"

LAUNCH_REASON = "launch"
MANUAL_REASON = "manual"
PRE_UPGRADE_REASON = "pre-upgrade"
# Written next to a restore so the pre-restore state is always recoverable.
PRE_RESTORE_REASON = "pre-restore"
# A library too damaged to open, set aside by plain file copy before a restore.
PRE_RESTORE_DAMAGED_REASON = "pre-restore-damaged"

REASONS = (
    LAUNCH_REASON,
    MANUAL_REASON,
    PRE_UPGRADE_REASON,
    PRE_RESTORE_REASON,
    PRE_RESTORE_DAMAGED_REASON,
)

#: How many pre-upgrade copies are kept, apart from the launch and manual ones.
PRE_UPGRADE_KEEP = 3

_NAME_PATTERN = re.compile(
    r"^cuepoint-(\d{8}-\d{6})-("
    + "|".join(re.escape(r) for r in sorted(REASONS, key=len, reverse=True))
    + r")(?:-\d+)?\.db$"
)


@dataclass(frozen=True)
class BackupInfo:
    """A backup file on disk."""

    path: Path
    created_at: str
    size_bytes: int
    reason: str = MANUAL_REASON
    app_version: Optional[str] = None
    from_version: Optional[str] = None
    to_version: Optional[str] = None

    @property
    def name(self) -> str:
        return self.path.name


def reason_of(name: str) -> Optional[str]:
    """The reason a backup file name carries, or None for a name that is not one's."""
    match = _NAME_PATTERN.match(name)
    return match.group(2) if match else None


def _sidecar_path(backup: Path) -> Path:
    return backup.with_name(backup.name + SIDECAR_SUFFIX)


class BackupService(IBackupService):
    """Creates, lists, prunes and restores library backups."""

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
        """Directory holding backups; defaults to ``<library dir>/backups``."""
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

    def _target_for(self, reason: str) -> Path:
        # Local time (M272): the name is what Activity shows, and a person
        # reads "cuepoint-20261027-104800" as when they were working. The file's
        # own modified time (``created_at``) stays UTC.
        stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
        target = self.backup_dir / f"{BACKUP_PREFIX}{stamp}-{reason}{BACKUP_SUFFIX}"
        # Two backups within the same second must not collide.
        counter = 1
        while target.exists():
            target = (
                self.backup_dir
                / f"{BACKUP_PREFIX}{stamp}-{reason}-{counter}{BACKUP_SUFFIX}"
            )
            counter += 1
        return target

    @staticmethod
    def _partial_for(target: Path) -> Path:
        return target.with_name(f".{target.name}{PARTIAL_SUFFIX}")

    def _recorded_version(self) -> Optional[str]:
        """The app version recorded in the live library, if it records one."""
        try:
            connection = sqlite3.connect(str(self._db.db_path))
            try:
                row = connection.execute(
                    "SELECT value FROM library_meta WHERE key = 'last_opened_by'"
                ).fetchone()
            finally:
                connection.close()
        except sqlite3.Error:
            return None
        return None if row is None or row[0] is None else str(row[0])

    def create_backup(self, reason: str = MANUAL_REASON) -> BackupInfo:
        """Write a verified copy of the library and prune old ones.

        Raises:
            DatabaseError: If the backup cannot be written, or the copy written
                fails its check (it is deleted, not kept).
        """
        source = self._db.db_path
        if not source.exists():
            raise DatabaseError(
                message="There is no library to back up yet",
                error_code="BACKUP_NO_DATABASE",
                context={"db_path": str(source)},
            )

        self.backup_dir.mkdir(parents=True, exist_ok=True)
        target = self._target_for(reason)
        partial = self._partial_for(target)
        from_version = self._recorded_version()

        try:
            destination = sqlite3.connect(str(partial))
            try:
                # Resolves WAL content; safe against a live, in-use library.
                self._db.connect().backup(destination)
            finally:
                destination.close()
            # A copy that cannot be read back is worse than none: it would be
            # listed, counted, and trusted at the moment it is needed.
            try:
                self.verify_backup(partial)
            except DatabaseError as exc:
                raise DatabaseError(
                    message=(
                        "The backup was written but could not be read back, "
                        "so it was not kept"
                    ),
                    error_code="BACKUP_VERIFY_FAILED",
                    context={"target": str(target), "cause": exc.error_code},
                ) from exc
            os.replace(partial, target)
        except DatabaseError:
            self._discard(partial)
            raise
        except (sqlite3.Error, OSError) as exc:
            self._discard(partial)
            target.unlink(missing_ok=True)
            raise DatabaseError(
                message=f"Could not create a backup: {exc}",
                error_code="BACKUP_FAILED",
                context={"db_path": str(source), "target": str(target)},
            ) from exc

        self._write_sidecar(target, reason, from_version)
        _logger.info("[backup] wrote %s", target.name)
        self.prune()
        return self._info(target)

    @staticmethod
    def _discard(partial: Path) -> None:
        for suffix in ("", "-wal", "-shm", "-journal"):
            Path(str(partial) + suffix).unlink(missing_ok=True)

    def _write_sidecar(
        self, target: Path, reason: str, from_version: Optional[str]
    ) -> None:
        """Record the app versions beside a copy; never a reason to lose the copy."""
        from cuepoint.version import __version__

        record: Dict[str, Optional[str]] = {"appVersion": from_version}
        if reason == PRE_UPGRADE_REASON:
            record["fromVersion"] = from_version
            record["toVersion"] = __version__
        try:
            _sidecar_path(target).write_text(json.dumps(record), encoding="utf-8")
        except OSError as exc:
            _logger.warning(
                "[backup] could not record versions for %s: %s", target, exc
            )

    def sweep_partials(self) -> int:
        """Remove every backup an earlier run left half-written.

        Returns:
            Number of files removed.
        """
        directory = self.backup_dir
        if not directory.is_dir():
            return 0
        removed = 0
        for path in directory.glob(f".{BACKUP_PREFIX}*{PARTIAL_SUFFIX}*"):
            try:
                path.unlink()
                removed += 1
            except OSError as exc:
                _logger.warning("[backup] could not remove %s: %s", path.name, exc)
        return removed

    def _migrations_pending(self) -> bool:
        from cuepoint.services.migration_runner import pending_versions

        try:
            return bool(pending_versions(self._db.db_path))
        except sqlite3.Error as exc:
            _logger.warning("[backup] could not tell if an upgrade is pending: %s", exc)
            return False

    def backup_on_launch(self) -> Optional[BackupInfo]:
        """Take the copy a launch calls for: before an upgrade, or after a change.

        When this build has migrations the library has not applied, one
        ``pre-upgrade`` copy is taken, always, instead of the launch copy —
        whether or not the library changed since the last backup. Otherwise a
        ``launch`` copy is taken if the library changed. Either is skipped when
        backups are switched off.

        Never raises: a backup problem must not stop the application starting.
        Returns the backup taken, or ``None`` if one was not needed.
        """
        try:
            self.sweep_partials()
            if not self.enabled or not self._db.db_path.exists():
                return None
            if self._migrations_pending():
                return self.create_backup(reason=PRE_UPGRADE_REASON)
            if not self._changed_since_last_backup():
                return None
            return self.create_backup(reason=LAUNCH_REASON)
        except Exception as exc:  # noqa: BLE001 - must not block startup
            _logger.warning("[backup] launch backup skipped: %s", exc)
            return None

    def _changed_since_last_backup(self) -> bool:
        backups = self.list_backups()
        if not backups:
            return True

        newest_backup = max(b.path.stat().st_mtime for b in backups)
        # Commits land in the -wal sidecar, so the main file's mtime alone can
        # sit still while the library is actively changing.
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
        record: Dict[str, object] = {}
        try:
            loaded = json.loads(_sidecar_path(path).read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                record = loaded
        except (OSError, ValueError):
            pass

        def text(key: str) -> Optional[str]:
            value = record.get(key)
            return value if isinstance(value, str) and value else None

        return BackupInfo(
            path=path,
            created_at=datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat(),
            size_bytes=stat.st_size,
            reason=reason_of(path.name) or MANUAL_REASON,
            app_version=text("appVersion"),
            from_version=text("fromVersion"),
            to_version=text("toVersion"),
        )

    def list_backups(self) -> List[BackupInfo]:
        """Return backups, newest first. Half-written copies are never listed."""
        directory = self.backup_dir
        if not directory.is_dir():
            return []
        files = [
            path
            for path in directory.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}")
            if path.is_file() and not path.name.startswith(".")
        ]
        files.sort(key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
        return [self._info(path) for path in files]

    def prune(self, keep: Optional[int] = None) -> int:
        """Delete the oldest backups beyond the retention caps.

        Launch and manual copies share ``keep``; pre-upgrade copies are kept on
        their own count. Pre-restore copies are never pruned: they exist
        precisely for the case where a restore turned out to be a mistake.

        Returns:
            Number of backups deleted.
        """
        limit = self.keep if keep is None else max(1, int(keep))
        rolling: List[BackupInfo] = []
        upgrades: List[BackupInfo] = []
        for info in self.list_backups():
            if info.reason == PRE_UPGRADE_REASON:
                upgrades.append(info)
            elif info.reason in (PRE_RESTORE_REASON, PRE_RESTORE_DAMAGED_REASON):
                continue
            else:
                rolling.append(info)

        deleted = 0
        for info in rolling[limit:] + upgrades[PRE_UPGRADE_KEEP:]:
            try:
                self._remove(info.path)
                deleted += 1
            except OSError as exc:
                _logger.warning("[backup] could not delete %s: %s", info.name, exc)
        return deleted

    @staticmethod
    def _remove(path: Path) -> None:
        path.unlink()
        _sidecar_path(path).unlink(missing_ok=True)

    def backup_path(self, name: str) -> Path:
        """The backup file called ``name``, in the backup folder and nowhere else.

        Raises:
            DatabaseError: If ``name`` is not the name of a backup (a path, a
                traversal, a partial) or no such backup exists.
        """
        valid = (
            isinstance(name, str)
            and name == Path(name).name
            and "\\" not in name
            and _NAME_PATTERN.match(name) is not None
        )
        if not valid:
            raise DatabaseError(
                message="That is not the name of a backup",
                error_code="BACKUP_INVALID_NAME",
                context={"name": str(name)[:200]},
            )
        path = self.backup_dir / name
        if not path.is_file():
            raise DatabaseError(
                message="That backup no longer exists",
                error_code="BACKUP_NOT_FOUND",
                context={"name": name},
            )
        return path

    def delete_backup(self, name: str) -> None:
        """Delete one backup by name, at the user's request.

        Raises:
            DatabaseError: If the name is not a backup in the backup folder.
        """
        path = self.backup_path(name)
        try:
            self._remove(path)
        except OSError as exc:
            raise DatabaseError(
                message=f"Could not delete that backup: {exc}",
                error_code="BACKUP_DELETE_FAILED",
                context={"name": name},
            ) from exc
        _logger.info("[backup] deleted %s", name)

    # ------------------------------------------------------------- restore

    def verify_backup(self, backup_path: Path) -> None:
        """Check a backup is a readable library before it is used.

        Raises:
            DatabaseError: If the file is missing, unreadable or fails an
                integrity check.
        """
        path = Path(backup_path)
        if not path.is_file():
            raise DatabaseError(
                message=f"Backup file not found: {quoted(path)}",
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

    def _library_is_healthy(self) -> bool:
        """True when the library opens and passes ``quick_check``."""
        try:
            connection = sqlite3.connect(str(self._db.db_path))
            try:
                return bool(
                    connection.execute("PRAGMA quick_check").fetchone()[0] == "ok"
                )
            finally:
                connection.close()
        except sqlite3.Error:
            return False

    def _hold_sidecars(self) -> Dict[str, Path]:
        """Copy the live ``-wal``/``-shm`` aside before the library is opened.

        Opening a damaged library to see whether it is damaged can delete or
        rewrite those files, and they are part of what must be kept.
        """
        held: Dict[str, Path] = {}
        live = self._db.db_path
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(live) + suffix)
            if not sidecar.exists():
                continue
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            copy = self.backup_dir / f".{BACKUP_PREFIX}held{suffix}{PARTIAL_SUFFIX}"
            try:
                shutil.copyfile(sidecar, copy)
                held[suffix] = copy
            except OSError as exc:
                _logger.warning("[backup] could not hold %s: %s", sidecar.name, exc)
        return held

    def _set_aside_damaged(self, held: Dict[str, Path]) -> BackupInfo:
        """Keep a library too damaged to open, with its sidecars, as it lies."""
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        live = self._db.db_path
        target = self._target_for(PRE_RESTORE_DAMAGED_REASON)
        partial = self._partial_for(target)
        try:
            shutil.copyfile(live, partial)
            for suffix, copy in held.items():
                os.replace(copy, Path(str(target) + suffix))
            os.replace(partial, target)
        except OSError as exc:
            self._discard(partial)
            raise DatabaseError(
                message=(
                    f"The library could not be set aside before restoring: {exc}. "
                    "Nothing was changed"
                ),
                error_code="RESTORE_FAILED",
                context={"db_path": str(live)},
            ) from exc
        _logger.warning("[backup] set the damaged library aside as %s", target.name)
        return self._info(target)

    def restore(self, backup_path: Path) -> BackupInfo:
        """Replace the library with a backup.

        The backup is verified before anything is touched: restoring a corrupt
        file over a working library would turn a recoverable situation into data
        loss. The current library is then kept as a ``pre-restore`` backup (or,
        when it is too damaged to open, copied aside as ``pre-restore-damaged``),
        so a restore chosen by mistake is itself recoverable. The backup is
        written into a temp file beside the library, checked, and swapped in with
        ``os.replace``; a failure before the swap leaves the library as it was.

        Returns:
            The copy kept of the library as it was before the restore.

        Raises:
            DatabaseError: If the backup is unusable or the restore fails.
        """
        source = Path(backup_path)
        self.verify_backup(source)

        target = self._db.db_path
        safety: Optional[BackupInfo] = None
        if target.exists():
            held = self._hold_sidecars()
            if self._library_is_healthy():
                for copy in held.values():
                    copy.unlink(missing_ok=True)
                safety = self.create_backup(reason=PRE_RESTORE_REASON)
                self._db.close_all()
            else:
                # Connections to a damaged file hold it open; let go first.
                self._db.close_all()
                try:
                    safety = self._set_aside_damaged(held)
                finally:
                    for copy in held.values():
                        copy.unlink(missing_ok=True)
        else:
            self._db.close_all()

        temp = target.with_name(f".{target.name}.restore")
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            self._discard(temp)
            destination = sqlite3.connect(str(temp))
            try:
                origin = sqlite3.connect(str(source))
                try:
                    origin.backup(destination)
                finally:
                    origin.close()
            finally:
                destination.close()
            self.verify_backup(temp)
            os.replace(temp, target)
            # Any -wal/-shm left from the previous library describe a file that
            # no longer exists; SQLite would try to apply them to the new one.
            for suffix in ("-wal", "-shm"):
                Path(str(target) + suffix).unlink(missing_ok=True)
        except (sqlite3.Error, OSError, DatabaseError) as exc:
            self._discard(temp)
            raise DatabaseError(
                message=(
                    f"Restoring the backup failed: {exc}. Your library was not "
                    "changed"
                    + (f"; a copy of it was saved as {safety.name}" if safety else "")
                ),
                error_code="RESTORE_FAILED",
                context={
                    "backup": str(source),
                    "db_path": str(target),
                    "safety_backup": safety.name if safety else None,
                },
            ) from exc

        _logger.info("[backup] restored the library from %s", source.name)
        return safety if safety is not None else self._info(source)
