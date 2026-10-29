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
copy). A missing or unreadable sidecar just means the version is unknown. A
``pre-upgrade`` sidecar also lists ``pendingVersions``, the migrations the copy
was taken ahead of, so a retry after a failed upgrade reuses the copy it already
has instead of taking another.

**Room first (HARDEN-03).** A backup is a whole copy of the library, so one is
only started when the backup folder's disk has room for it: the library's size
times :data:`ROOM_FACTOR` plus :data:`ROOM_EXTRA_BYTES`. A launch copy that has
no room is skipped, with the reason logged and kept in :data:`LAST_LAUNCH_SKIP`
for the engine's status. The ``pre-upgrade`` copy is never skipped:
:meth:`BackupService.ensure_pre_upgrade` raises :class:`NeedsSpaceError` and the
upgrade does not run.

**A damaged library can be restored.** When the library cannot be opened or
fails its check, restore sets the file and its sidecars aside with a plain copy
(reason ``pre-restore-damaged``) rather than through SQLite, then restores as
usual.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import threading
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services import library_errors
from cuepoint.services.interfaces import (
    IBackupService,
    IConfigService,
    IDatabaseService,
)

_logger = logging.getLogger(__name__)

#: Serialises backup creation in this process (a service is made per resolve).
_CREATE_LOCK = threading.RLock()

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

#: A backup needs the library's size times this much free room...
ROOM_FACTOR = 1.2
#: ...plus this much more, so the disk is not left with nothing (50 MB).
ROOM_EXTRA_BYTES = 50 * 1024 * 1024

#: Why the most recent launch backup was skipped, or None. Set by
#: :meth:`BackupService.backup_on_launch`; read by the engine's library status.
#: ``{"reason": "low_space", "requiredFreeBytes": int, "freeBytes": int}``.
LAST_LAUNCH_SKIP: Optional[Dict[str, object]] = None

#: How many pre-upgrade copies are kept, apart from the launch and manual ones.
PRE_UPGRADE_KEEP = 3

_NAME_PATTERN = re.compile(
    r"cuepoint-(\d{8}-\d{6})-("
    + "|".join(re.escape(r) for r in sorted(REASONS, key=len, reverse=True))
    + r")(?:-\d+)?\.db"
)


class NeedsSpaceError(DatabaseError):
    """The disk has no room for a copy that must be taken before an upgrade."""

    def __init__(self, required_bytes: int, free_bytes: int) -> None:
        super().__init__(
            message="There isn't enough free space on this disk to keep a backup.",
            error_code="BACKUP_NEEDS_SPACE",
            context={"requiredFreeBytes": required_bytes, "freeBytes": free_bytes},
        )
        self.required_bytes = required_bytes
        self.free_bytes = free_bytes


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
    pending_versions: Tuple[int, ...] = ()
    from_schema: Optional[int] = None

    @property
    def name(self) -> str:
        return self.path.name


def reason_of(name: str) -> Optional[str]:
    """The reason a backup file name carries, or None for a name that is not one's."""
    match = _NAME_PATTERN.fullmatch(name)
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

    # ----------------------------------------------------------------- room

    def library_size_bytes(self) -> int:
        """The library's size on disk: the file and its write-ahead log."""
        total = 0
        for suffix in ("", "-wal"):
            try:
                total += Path(str(self._db.db_path) + suffix).stat().st_size
            except OSError:
                pass
        return total

    def required_free_bytes(self) -> int:
        """How much free room a copy of the library needs, rounded up to a whole MB."""
        needed = math.ceil(self.library_size_bytes() * ROOM_FACTOR) + ROOM_EXTRA_BYTES
        megabyte = 1024 * 1024
        return int(math.ceil(needed / megabyte) * megabyte)

    def free_bytes(self) -> int:
        """Free room on the disk the backup folder is (or would be) on."""
        probe = self.backup_dir
        while not probe.exists() and probe != probe.parent:
            probe = probe.parent
        return int(shutil.disk_usage(probe).free)

    def _free_or_zero(self) -> int:
        try:
            return self.free_bytes()
        except OSError:
            return 0

    def has_room(self) -> bool:
        """True when a copy of the library fits with the room left over."""
        try:
            return self.free_bytes() >= self.required_free_bytes()
        except OSError as exc:
            # Cannot tell: do not stop a backup over a question that failed.
            _logger.warning("[backup] could not read the free space: %s", exc)
            return True

    # -------------------------------------------------------------- create

    def _reserve(self, reason: str) -> "tuple[Path, Path]":
        """Choose a free backup name and claim it, returning ``(target, partial)``.

        The claim is an exclusive create of the hidden ``.partial`` file, so two
        backups in the same second (even from two processes) cannot take the
        same name. The caller owns ``partial`` from here on.
        """
        # Local time (M272): the name is what Activity shows, and a person
        # reads "cuepoint-20261027-104800" as when they were working. The file's
        # own modified time (``created_at``) stays UTC.
        stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
        counter = 0
        while True:
            suffix = f"-{counter}" if counter else ""
            target = (
                self.backup_dir
                / f"{BACKUP_PREFIX}{stamp}-{reason}{suffix}{BACKUP_SUFFIX}"
            )
            partial = self._partial_for(target)
            counter += 1
            if target.exists():
                continue
            try:
                os.close(os.open(partial, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
            except FileExistsError:
                continue
            return target, partial

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

    def create_backup(
        self,
        reason: str = MANUAL_REASON,
        *,
        pending_versions: Optional[Sequence[int]] = None,
        from_schema: Optional[int] = None,
    ) -> BackupInfo:
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
        with _CREATE_LOCK:
            return self._create_locked(reason, source, pending_versions, from_schema)

    def _create_locked(
        self,
        reason: str,
        source: Path,
        pending_versions: Optional[Sequence[int]] = None,
        from_schema: Optional[int] = None,
    ) -> BackupInfo:
        target, partial = self._reserve(reason)
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
            _logger.warning("[backup] could not write %s: %s", target.name, exc)
            if library_errors.is_disk_full(exc):
                # The room that was there when it was checked is gone.
                raise NeedsSpaceError(
                    self.required_free_bytes(), self._free_or_zero()
                ) from exc
            raise DatabaseError(
                message="Could not create a backup",
                error_code="BACKUP_FAILED",
                context={
                    "db_path": str(source),
                    "target": str(target),
                    "cause": str(exc),
                },
            ) from exc

        self._write_sidecar(target, reason, from_version, pending_versions, from_schema)
        _logger.info("[backup] wrote %s", target.name)
        self.prune()
        return self._info(target)

    @staticmethod
    def _discard(partial: Path) -> None:
        for suffix in ("", "-wal", "-shm", "-journal"):
            Path(str(partial) + suffix).unlink(missing_ok=True)

    def _write_sidecar(
        self,
        target: Path,
        reason: str,
        from_version: Optional[str],
        pending_versions: Optional[Sequence[int]] = None,
        from_schema: Optional[int] = None,
    ) -> None:
        """Record the app versions beside a copy; never a reason to lose the copy."""
        from cuepoint.version import __version__

        record: Dict[str, object] = {"appVersion": from_version}
        if reason == PRE_UPGRADE_REASON:
            record["fromVersion"] = from_version
            record["toVersion"] = __version__
            record["pendingVersions"] = [int(v) for v in pending_versions or ()]
            record["fromSchema"] = from_schema
        try:
            _sidecar_path(target).write_text(json.dumps(record), encoding="utf-8")
        except OSError as exc:
            _logger.warning(
                "[backup] could not record versions for %s: %s", target, exc
            )

    def sweep_partials(self) -> int:
        """Remove what an earlier run left half-done.

        That is every hidden ``.partial`` backup, the sidecars of a backup whose
        file is gone, and the leftovers of an interrupted restore: a
        ``.restore`` temp beside the library (the swap never happened, so the
        library's own ``-wal``/``-shm``, which the restore had moved aside,
        are put back) or ``.stale`` sidecars (the swap happened; they are
        dropped).

        Returns:
            Number of files removed.
        """
        removed = self._sweep_restore_leftovers()
        directory = self.backup_dir
        if not directory.is_dir():
            return removed
        doomed = list(directory.glob(f".{BACKUP_PREFIX}*{PARTIAL_SUFFIX}*"))
        for extra in ("-wal", "-shm", SIDECAR_SUFFIX):
            for sidecar in directory.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}{extra}"):
                if not sidecar.with_name(sidecar.name[: -len(extra)]).exists():
                    doomed.append(sidecar)
        for path in doomed:
            try:
                path.unlink()
                removed += 1
            except OSError as exc:
                _logger.warning("[backup] could not remove %s: %s", path.name, exc)
        return removed

    def _restore_temp(self) -> Path:
        live = self._db.db_path
        return live.with_name(f".{live.name}.restore")

    def _stale_for(self, suffix: str) -> Path:
        live = self._db.db_path
        return live.with_name(f".{live.name}{suffix}.stale")

    def _sweep_restore_leftovers(self) -> int:
        removed = 0
        temp = self._restore_temp()
        swapped = not temp.exists()
        for suffix in ("-wal", "-shm"):
            stale = self._stale_for(suffix)
            if not stale.exists():
                continue
            live_sidecar = Path(str(self._db.db_path) + suffix)
            try:
                if swapped or live_sidecar.exists():
                    stale.unlink()
                    removed += 1
                else:
                    os.replace(stale, live_sidecar)
            except OSError as exc:
                _logger.warning("[backup] could not settle %s: %s", stale.name, exc)
        for path in (
            temp,
            *(Path(str(temp) + x) for x in ("-wal", "-shm", "-journal")),
        ):
            try:
                if path.exists():
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

    #: Whether the last :meth:`ensure_pre_upgrade` handed back a copy it already had.
    reused_last_copy = False

    def ensure_pre_upgrade(
        self, pending: Optional[Sequence[int]] = None, reuse: Optional[str] = None
    ) -> BackupInfo:
        """The ``pre-upgrade`` copy the migrations ``pending`` call for: taken, or ``reuse``.

        A new copy is taken unless ``reuse`` names a ``pre-upgrade`` copy that
        was taken ahead of at least these migrations, from a library at the
        schema version it has now. The caller names one only for a retry in the
        same session, when nothing has written to the library since (a failed
        upgrade holds the library closed). Taken **never skipped**: without room
        this raises and the upgrade does not run.

        Raises:
            NeedsSpaceError: The disk has too little free room for the copy.
            DatabaseError: The copy could not be written.
        """
        from cuepoint.services.migration_runner import (
            pending_versions,
            schema_and_head,
        )

        if pending is None:
            pending = pending_versions(self._db.db_path)
        wanted = set(pending)
        schema = schema_and_head(self._db.db_path)[0]
        self.reused_last_copy = False
        if reuse:
            for info in self.list_backups():
                if (
                    info.name == reuse
                    and info.reason == PRE_UPGRADE_REASON
                    and wanted <= set(info.pending_versions)
                    and info.from_schema == schema
                ):
                    self.reused_last_copy = True
                    return info
        if not self.has_room():
            raise NeedsSpaceError(self.required_free_bytes(), self.free_bytes())
        return self.create_backup(
            reason=PRE_UPGRADE_REASON,
            pending_versions=sorted(wanted),
            from_schema=schema,
        )

    def backup_on_launch(self) -> Optional[BackupInfo]:
        """Take the copy a launch calls for: before an upgrade, or after a change.

        When this build has migrations the library has not applied, one
        ``pre-upgrade`` copy is taken, always, instead of the launch copy —
        whether or not the library changed since the last backup, and **even
        when automatic backups are switched off**: it is the way back from a bad
        release (DIST-08), not a convenience. Otherwise a ``launch`` copy is
        taken if backups are enabled and the library changed, and **skipped
        when the disk has no room for it** (:data:`LAST_LAUNCH_SKIP`).

        Never raises: a backup problem must not stop the application starting.
        A pre-upgrade copy that could not be taken for lack of room is not
        hidden by that: the library state (``engine/library_state.py``) asks
        again and holds the upgrade back.
        Returns the backup taken, or ``None`` if one was not needed.
        """
        global LAST_LAUNCH_SKIP
        LAST_LAUNCH_SKIP = None
        try:
            self.sweep_partials()
            if not self._db.db_path.exists():
                return None
            if self._migrations_pending():
                return self.ensure_pre_upgrade()
            if not self.enabled:
                return None
            if not self._changed_since_last_backup():
                return None
            if not self.has_room():
                LAST_LAUNCH_SKIP = {
                    "reason": "low_space",
                    "requiredFreeBytes": self.required_free_bytes(),
                    "freeBytes": self.free_bytes(),
                }
                _logger.warning(
                    "[backup] launch backup skipped: not enough free space "
                    "(needs %d bytes, %d free)",
                    LAST_LAUNCH_SKIP["requiredFreeBytes"],
                    LAST_LAUNCH_SKIP["freeBytes"],
                )
                return None
            return self.create_backup(reason=LAUNCH_REASON)
        except NeedsSpaceError as exc:
            _logger.warning(
                "[backup] the copy before the upgrade needs %d bytes free; "
                "the upgrade will wait",
                exc.required_bytes,
            )
            return None
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

        pending = record.get("pendingVersions")
        schema = record.get("fromSchema")
        return BackupInfo(
            from_schema=schema
            if isinstance(schema, int) and not isinstance(schema, bool)
            else None,
            pending_versions=tuple(
                int(v)
                for v in pending
                if isinstance(v, int) and not isinstance(v, bool)
            )
            if isinstance(pending, list)
            else (),
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
        for suffix in ("-wal", "-shm"):
            Path(str(path) + suffix).unlink(missing_ok=True)

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
            and _NAME_PATTERN.fullmatch(name) is not None
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
            _logger.warning("[backup] could not delete %s: %s", name, exc)
            raise DatabaseError(
                message="Could not delete that backup",
                error_code="BACKUP_DELETE_FAILED",
                context={"name": name, "cause": str(exc)},
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
                message="That backup was not found",
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
                message="This backup could not be read",
                error_code="BACKUP_UNREADABLE",
                context={"backup": str(path), "cause": str(exc)},
            ) from exc

        if result != "ok":
            raise DatabaseError(
                message="This backup failed its integrity check",
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

    def _hold_library(self) -> Dict[str, Path]:
        """Copy the live library and its ``-wal``/``-shm`` aside, byte for byte.

        Done before anything opens the library: even a read can checkpoint the
        WAL into the main file and delete it, and a damaged library's own bytes
        are exactly what a set-aside must keep. Keyed by suffix (``""`` is the
        main file).

        Raises:
            DatabaseError: If any copy fails (nothing has been changed).
        """
        held: Dict[str, Path] = {}
        live = self._db.db_path
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        try:
            for suffix in ("", "-wal", "-shm"):
                source = Path(str(live) + suffix)
                if not source.exists():
                    continue
                copy = self.backup_dir / (
                    f".{BACKUP_PREFIX}held{suffix or '.db'}{PARTIAL_SUFFIX}"
                )
                held[suffix] = copy
                shutil.copyfile(source, copy)
        except OSError as exc:
            self._drop(held)
            _logger.warning("[backup] could not hold the library: %s", exc)
            raise DatabaseError(
                message=(
                    "The library could not be copied before restoring. "
                    "Nothing was changed"
                ),
                error_code="RESTORE_FAILED",
                context={"db_path": str(live), "cause": str(exc)},
            ) from exc
        return held

    @staticmethod
    def _drop(held: Dict[str, Path]) -> None:
        for copy in held.values():
            copy.unlink(missing_ok=True)

    def _set_aside_damaged(self, held: Dict[str, Path]) -> BackupInfo:
        """Name the held copy of a damaged library and keep it as a backup.

        The sidecars take their final names first and the main file last, so a
        copy is only listed once everything that goes with it is in place.
        """
        live = self._db.db_path
        target, reserved = self._reserve(PRE_RESTORE_DAMAGED_REASON)
        placed: List[Path] = []
        try:
            reserved.unlink(missing_ok=True)
            for suffix in ("-wal", "-shm"):
                if suffix in held:
                    final = Path(str(target) + suffix)
                    os.replace(held[suffix], final)
                    placed.append(final)
            os.replace(held[""], target)
        except OSError as exc:
            for path in placed:
                path.unlink(missing_ok=True)
            reserved.unlink(missing_ok=True)
            _logger.warning("[backup] could not set the library aside: %s", exc)
            raise DatabaseError(
                message=(
                    "The library could not be set aside before restoring. "
                    "Nothing was changed"
                ),
                error_code="RESTORE_FAILED",
                context={"db_path": str(live), "cause": str(exc)},
            ) from exc
        _logger.warning("[backup] set the damaged library aside as %s", target.name)
        return self._info(target)

    def _fail(
        self, source: Path, safety: Optional[BackupInfo], exc: BaseException
    ) -> DatabaseError:
        _logger.warning("[backup] restore failed: %s", exc)
        return DatabaseError(
            message="The backup could not be restored. Your library was not changed",
            error_code="RESTORE_FAILED",
            context={
                "backup": str(source),
                "db_path": str(self._db.db_path),
                "safety_backup": safety.name if safety else None,
                "cause": str(exc),
            },
        )

    def restore(self, backup_path: Path) -> BackupInfo:
        """Replace the library with a backup.

        The backup is verified before anything is touched: restoring a corrupt
        file over a working library would turn a recoverable situation into data
        loss. The library and its ``-wal``/``-shm`` are first copied byte for
        byte; a library that opens and passes its check is then kept as a
        ``pre-restore`` backup, and one that does not as ``pre-restore-damaged``
        (that copy), so a restore chosen by mistake is itself recoverable. The
        backup is written into a temp file beside the library and checked. The
        library's own ``-wal``/``-shm`` are then moved out of the way **before**
        the swap, so no crash can leave an old WAL beside the new file, and the
        temp file is swapped in with ``os.replace``. Any failure up to and
        including the swap puts everything back and leaves the library as it was.

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
            held = self._hold_library()
            try:
                if self._library_is_healthy():
                    safety = self.create_backup(reason=PRE_RESTORE_REASON)
                    self._db.close_all()
                    self._drop(held)
                else:
                    # Connections to a damaged file hold it open; let go first.
                    self._db.close_all()
                    safety = self._set_aside_damaged(held)
            finally:
                self._drop(held)
        else:
            self._db.close_all()

        temp = self._restore_temp()
        moved: List[tuple] = []
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
            # The old library's -wal/-shm describe a file that is about to stop
            # existing; SQLite would replay them onto the new one. They are in
            # the safety copy already, so move them aside now and abort if that
            # cannot be done, rather than swap and hope to clean up after.
            for suffix in ("-wal", "-shm"):
                live_sidecar = Path(str(target) + suffix)
                if live_sidecar.exists():
                    stale = self._stale_for(suffix)
                    os.replace(live_sidecar, stale)
                    moved.append((stale, live_sidecar))
            os.replace(temp, target)
        except (sqlite3.Error, OSError, DatabaseError) as exc:
            for stale, live_sidecar in moved:
                try:
                    os.replace(stale, live_sidecar)
                except OSError as undo:
                    _logger.error("[backup] could not put %s back: %s", stale, undo)
            self._discard(temp)
            raise self._fail(source, safety, exc) from exc

        # Past the swap: nothing below can undo the restore or replay anything
        # (the stale files no longer carry the names SQLite looks for).
        for stale, _live in moved:
            try:
                stale.unlink()
            except OSError as exc:
                _logger.warning("[backup] could not remove %s: %s", stale.name, exc)

        _logger.info("[backup] restored the library from %s", source.name)
        return safety if safety is not None else self._info(source)
