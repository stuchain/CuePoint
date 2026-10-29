#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What state the library is in, worked out once and served from ``/api/v1/status`` (HARDEN-03).

The library can be fine, or it can be a file CuePoint cannot read (``damaged``),
one a newer CuePoint last opened (``too_new``), one whose upgrade failed
(``upgrade_failed``), or one whose upgrade has not run because the disk had no
room for the copy kept before it (``needs_space``). The app shows a screen for
each of the last four, with a way back; it can only do that if the engine
*starts and answers* when the library cannot be opened. Migrations run lazily, on
the first repository a request resolves, so nothing could ever answer for them;
here they are run once, at start, and what they raise is caught into the state.

The state is computed once (:func:`get_library_state`) and kept. It is computed
again only by :func:`recompute` (the app's "Try again", after a restore or a
failure) and changed by :func:`mark_damaged` (damage seen during the session, or
by the integrity check). It is never computed per request, and never served by
the open ``/health``.

**Words.** Anything here a person may read says "library" and "backup", never
"database", "schema" or "engine" (DEC-155, DEC-158).

**Reports.** ``damaged`` and ``upgrade_failed`` are reported once per session,
with the versions (DEC-126). ``too_new`` and ``needs_space`` are the user's to
act on and are not.

The unclean-exit flag is the environment variable ``CUEPOINT_UNCLEAN_EXIT=1``
(the ``--unclean-exit`` argument does the same); the desktop app's main process
passes it when it found the last session did not end. The engine only echoes it
in the state: when to check the library is the app's to decide.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from cuepoint.exceptions.cuepoint_exceptions import R002_DISK_FULL, DatabaseError
from cuepoint.services import library_errors
from cuepoint.version import __version__

_logger = logging.getLogger(__name__)

OK = "ok"
DAMAGED = "damaged"
TOO_NEW = "too_new"
UPGRADE_FAILED = "upgrade_failed"
NEEDS_SPACE = "needs_space"

#: The environment variable that says the last session did not end properly.
UNCLEAN_EXIT_ENV = "CUEPOINT_UNCLEAN_EXIT"
UNCLEAN_EXIT_ARG = "--unclean-exit"

INTEGRITY_IDLE = "idle"
INTEGRITY_RUNNING = "running"
INTEGRITY_OK = "ok"
INTEGRITY_FAILED = "failed"

#: Codes of the errors that hold the library's upgrade back; both are expected
#: (reporting/expected.py): the state reports once, requests do not.
MIGRATION_BLOCKED = "DB_MIGRATION_BLOCKED"
NEEDS_SPACE_CODE = "DB_NEEDS_SPACE"

_lock = threading.RLock()
_state: Optional[Dict[str, Any]] = None
_computing = False
_reported: set[str] = set()
_integrity: Dict[str, Any] = {"state": INTEGRITY_IDLE, "finishedAt": None}
_on_ready: Optional[Callable[[], None]] = None


# ---------------------------------------------------------------------------
# Small readers
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def unclean_exit() -> bool:
    """Whether the app said the last session did not end properly."""
    if os.environ.get(UNCLEAN_EXIT_ENV, "").strip().lower() in ("1", "true", "yes"):
        return True
    return UNCLEAN_EXIT_ARG in sys.argv[1:]


def _library_path() -> Path:
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IDatabaseService
    from cuepoint.utils.di_container import get_container

    bootstrap_services()
    return Path(get_container().resolve(IDatabaseService).db_path)


def _backup_service() -> Any:
    from cuepoint.services.bootstrap import bootstrap_services
    from cuepoint.services.interfaces import IBackupService
    from cuepoint.utils.di_container import get_container

    bootstrap_services()
    return get_container().resolve(IBackupService)


def _read_last_opened_by(path: Path) -> Optional[str]:
    try:
        connection = sqlite3.connect(str(path))
        try:
            row = connection.execute(
                "SELECT value FROM library_meta WHERE key = 'last_opened_by'"
            ).fetchone()
        finally:
            connection.close()
    except sqlite3.Error:
        return None
    return None if row is None or row[0] is None else str(row[0])


def _backup_json(info: Any) -> Dict[str, Any]:
    return {"name": info.name, "createdAt": info.created_at, "reason": info.reason}


def _newest_good_backup() -> Optional[Dict[str, Any]]:
    """The newest backup that passes ``quick_check``, skipping any that do not."""
    try:
        service = _backup_service()
        for info in service.list_backups():
            try:
                service.verify_backup(info.path)
            except DatabaseError:
                continue
            return _backup_json(info)
    except Exception as exc:  # noqa: BLE001 - the state is still worth showing
        _logger.warning("[library] could not look through the backups: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Computing the state
# ---------------------------------------------------------------------------


def _base() -> Dict[str, Any]:
    return {
        "state": OK,
        "appVersion": __version__,
        "libraryVersion": None,
        "schemaVersion": None,
        "headVersion": None,
        "newestGoodBackup": None,
        "preUpgradeBackup": None,
        "requiredFreeBytes": None,
        "failedMigration": None,
        "uncleanExit": unclean_exit(),
        "computedAt": _now(),
    }


def _finish(state: Dict[str, Any]) -> Dict[str, Any]:
    """Fill in what only a library that needs help shows: the way back."""
    if state["state"] in (DAMAGED, TOO_NEW, UPGRADE_FAILED):
        state["newestGoodBackup"] = _newest_good_backup()
    return state


def compute_library_state() -> Dict[str, Any]:
    """Work out the library's state now. Runs the upgrade if one is due. Never raises.

    Reads the file with plain SELECTs first, so a library that cannot be read is
    reported as damaged rather than failing inside a repository; takes the copy
    the upgrade needs (or finds it has no room); then runs the migrations and
    sorts what they raise into a state.
    """
    global _computing
    with _lock:
        _computing = True
        try:
            return _compute()
        except Exception as exc:  # noqa: BLE001 - a state must come out of this
            _logger.warning("[library] could not work out the library's state: %s", exc)
            return _base()
        finally:
            _computing = False
            library_errors.set_damage_listener(mark_damaged)


def _compute() -> Dict[str, Any]:
    from cuepoint.services.migration_runner import (
        pending_versions,
        schema_and_head,
        schema_is_ahead,
    )

    library_errors.block_migrations(None)
    state = _base()
    path = _library_path()
    if not path.exists():
        return state

    try:
        schema, head = schema_and_head(path)
        state["schemaVersion"], state["headVersion"] = schema, head
        state["libraryVersion"] = _read_last_opened_by(path)
        ahead = schema_is_ahead(path)
        pending = pending_versions(path)
    except sqlite3.Error as exc:
        _logger.warning("[library] the library could not be read: %s", exc)
        state["state"] = DAMAGED
        return _finish(state)

    if ahead:
        state["state"] = TOO_NEW
        return _finish(state)
    if not pending:
        return state

    # An upgrade is due. Its copy is never skipped: with no room for it the
    # migrations do not run.
    service = _backup_service()
    copy = None
    try:
        copy = service.ensure_pre_upgrade(pending)
    except DatabaseError as exc:
        if exc.error_code == "BACKUP_NEEDS_SPACE":
            state["state"] = NEEDS_SPACE
            state["requiredFreeBytes"] = int(exc.context.get("requiredFreeBytes") or 0)
            library_errors.block_migrations(
                DatabaseError(
                    message=(
                        "CuePoint needs more free space to update your library safely."
                    ),
                    error_code=NEEDS_SPACE_CODE,
                )
            )
            return state
        # Any other trouble with the copy keeps the behaviour from before this
        # state existed: it is logged, and the upgrade goes on.
        _logger.warning("[library] the copy before the upgrade failed: %s", exc)

    return _upgrade(state, copy)


def _upgrade(state: Dict[str, Any], copy: Any) -> Dict[str, Any]:
    from cuepoint.services.interfaces import IMigrationRunner
    from cuepoint.services.migration_runner import schema_and_head
    from cuepoint.utils.di_container import get_container

    try:
        get_container().resolve(IMigrationRunner).migrate()
    except DatabaseError as exc:
        code = exc.error_code
        if code == "DB_SCHEMA_TOO_NEW":
            state["state"] = TOO_NEW
        elif code in ("DB_UNREADABLE", "DB_OPEN_FAILED") or library_errors.is_corrupt(
            exc
        ):
            state["state"] = DAMAGED
        else:
            state["state"] = UPGRADE_FAILED
            state["failedMigration"] = exc.context.get("migration_version")
            if copy is not None:
                state["preUpgradeBackup"] = {
                    **_backup_json(copy),
                    "fromVersion": copy.from_version,
                    "toVersion": copy.to_version,
                }
            # One failed attempt is enough: requests do not try it again; the
            # app's "Try again" (a recheck) does.
            library_errors.block_migrations(
                DatabaseError(
                    message=(
                        "CuePoint couldn't finish updating your library. Nothing "
                        "was lost."
                    ),
                    error_code=MIGRATION_BLOCKED,
                )
            )
        _logger.warning("[library] the library could not be updated: %s", code)
    try:
        state["schemaVersion"] = schema_and_head(_library_path())[0]
    except sqlite3.Error:
        pass
    return _finish(state)


# ---------------------------------------------------------------------------
# Serving it
# ---------------------------------------------------------------------------


def get_library_state() -> Dict[str, Any]:
    """The cached state; worked out the first time it is asked for, then never again."""
    global _state
    with _lock:
        if _state is None:
            _state = compute_library_state()
        return dict(_state)


def recompute() -> Dict[str, Any]:
    """Work the state out again (after "Try again", a restore or a failure).

    Retries the upgrade of an ``upgrade_failed`` library, and takes the copy a
    ``needs_space`` one was missing.
    """
    global _state
    with _lock:
        before = _state["state"] if _state is not None else None
        try:
            from cuepoint.services.bootstrap import bootstrap_services
            from cuepoint.services.interfaces import IDatabaseService
            from cuepoint.utils.di_container import get_container

            bootstrap_services()
            # Connections opened on the old file (or the failed attempt) go.
            get_container().resolve(IDatabaseService).close_all()
        except Exception as exc:  # noqa: BLE001
            _logger.warning(
                "[library] could not let go of the old connections: %s", exc
            )
        _state = compute_library_state()
        report_current()
        became_ready = before not in (None, OK) and _state["state"] == OK
        callback = _on_ready
    if became_ready and callback is not None:
        try:
            callback()
        except Exception as exc:  # noqa: BLE001
            _logger.warning(
                "[library] the work after the library opened failed: %s", exc
            )
    return library_json()


def on_ready(callback: Optional[Callable[[], None]]) -> None:
    """Run ``callback`` when a recheck finds a library that was not ok, ok."""
    global _on_ready
    _on_ready = callback


def library_json() -> Dict[str, Any]:
    """The ``library`` object ``/api/v1/status`` carries."""
    from cuepoint.services import backup_service

    payload = get_library_state()
    with _lock:
        payload["integrityCheck"] = dict(_integrity)
    skip = backup_service.LAST_LAUNCH_SKIP
    payload["launchBackupSkipped"] = dict(skip) if skip else None
    return payload


def reset() -> None:
    """Forget everything (tests)."""
    global _state, _computing, _on_ready
    with _lock:
        _state = None
        _computing = False
        _on_ready = None
        _reported.clear()
        _integrity.update({"state": INTEGRITY_IDLE, "finishedAt": None})
    library_errors.set_damage_listener(None)
    library_errors.block_migrations(None)


# ---------------------------------------------------------------------------
# Damage seen after the start
# ---------------------------------------------------------------------------


def mark_damaged(cause: Optional[BaseException] = None, *, wait: bool = False) -> None:
    """The library turned out to be damaged during the session.

    A no-op while the state is being computed, or when it is not ``ok`` (a
    library already in trouble stays in the state that names it). The way back
    (the newest good backup) is looked up on a thread unless ``wait``, so the
    request that hit the damage is not held up checking backups.
    """
    global _state
    with _lock:
        if _computing or _state is None or _state["state"] != OK:
            return
        _logger.warning("[library] the library is damaged: %s", type(cause).__name__)
        updated = dict(_state)
        updated.update(state=DAMAGED, computedAt=_now())
        _state = updated

    def fill() -> None:
        global _state
        good = _newest_good_backup()
        with _lock:
            if _state is not None and _state["state"] == DAMAGED:
                _state = {**_state, "newestGoodBackup": good}

    if wait:
        fill()
    else:
        threading.Thread(target=fill, name="library-damage-backup", daemon=True).start()
    _report(DAMAGED)


def damaged_now() -> bool:
    """Whether the state, if it has been worked out, says damaged."""
    with _lock:
        return _state is not None and _state["state"] == DAMAGED


# ---------------------------------------------------------------------------
# The integrity check
# ---------------------------------------------------------------------------


def _quick_check(path: Path) -> bool:
    """Run ``PRAGMA quick_check`` on the library; False when it finds damage."""
    connection = sqlite3.connect(str(path), timeout=30)
    try:
        rows = connection.execute("PRAGMA quick_check").fetchall()
    finally:
        connection.close()
    return len(rows) == 1 and rows[0][0] == "ok"


def _run_integrity_check() -> None:
    result = INTEGRITY_FAILED
    cause: Optional[BaseException] = None
    try:
        result = INTEGRITY_OK if _quick_check(_library_path()) else INTEGRITY_FAILED
    except sqlite3.DatabaseError as exc:
        cause = exc
        if not library_errors.is_corrupt(exc):
            # Busy or unreadable for another reason: not proof of damage.
            _logger.warning("[library] the check could not finish: %s", exc)
            result = INTEGRITY_IDLE
    except Exception as exc:  # noqa: BLE001
        _logger.warning("[library] the check could not finish: %s", exc)
        result = INTEGRITY_IDLE
    if result == INTEGRITY_FAILED:
        mark_damaged(cause, wait=True)
    with _lock:
        _integrity.update(
            state=result, finishedAt=_now() if result != INTEGRITY_IDLE else None
        )


def start_integrity_check() -> Dict[str, Any]:
    """Start the check on a thread (the library stays usable); return its status.

    Already running: that run's status. Poll ``integrityCheck`` in the status for
    the end. A failed check marks the library damaged.
    """
    get_library_state()
    with _lock:
        if _integrity["state"] == INTEGRITY_RUNNING:
            return dict(_integrity)
        _integrity.update(state=INTEGRITY_RUNNING, finishedAt=None)
    threading.Thread(
        target=_run_integrity_check, name="library-integrity-check", daemon=True
    ).start()
    with _lock:
        return dict(_integrity)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _report(state_name: str) -> None:
    """Report ``damaged`` or ``upgrade_failed`` once per session, with the versions."""
    with _lock:
        if state_name in _reported or _state is None:
            return
        _reported.add(state_name)
        snapshot = dict(_state)
    if state_name == DAMAGED:
        code, what = "LIBRARY_DAMAGED", "The library could not be read"
    else:
        code, what = "LIBRARY_UPGRADE_FAILED", "The library could not be updated"
    message = (
        f"{what} (app {snapshot['appVersion']}, library {snapshot['libraryVersion']}, "
        f"version {snapshot['schemaVersion']} of {snapshot['headVersion']}, "
        f"step {snapshot['failedMigration']})"
    )
    try:
        from cuepoint.reporting.engine_reporting import report_unexpected

        report_unexpected(
            DatabaseError(message=message, error_code=code),
            route="library-state",
            error_code=code,
        )
    except Exception as exc:  # noqa: BLE001 - reporting never costs the library
        _logger.debug("[library] could not report %s: %s", state_name, exc)


def report_current() -> None:
    """Report the state if it is one that is reported (once per session)."""
    with _lock:
        name = _state["state"] if _state is not None else None
    if name in (DAMAGED, UPGRADE_FAILED):
        _report(name)


# ---------------------------------------------------------------------------
# The request error path
# ---------------------------------------------------------------------------

_LIBRARY_MESSAGES = {
    "DB_SCHEMA_TOO_NEW": "This library was last opened by a newer CuePoint.",
    "DB_UNREADABLE": "CuePoint couldn't read your library.",
    "DB_MIGRATION_FAILED": "CuePoint couldn't finish updating your library.",
    MIGRATION_BLOCKED: "CuePoint couldn't finish updating your library.",
    NEEDS_SPACE_CODE: "CuePoint needs more free space to update your library safely.",
}


def status_for(exc: BaseException) -> Optional[tuple[int, Dict[str, Any]]]:
    """The answer for a failure that is the library's state speaking, or None.

    A full disk is 507 ``R002`` with the words above. A library that cannot be
    used is 503 with its own code and a sentence a person can read; the app
    shows its recovery screen from ``/api/v1/status``, not from these. Damage
    seen on the way is noted (the state turns ``damaged``). Everything else is
    None, and the caller answers as it always did.
    """
    from cuepoint.engine.api_errors import error_payload

    library_errors.note_failure(exc)
    if library_errors.is_library_disk_full(exc):
        return 507, error_payload(R002_DISK_FULL, library_errors.DISK_FULL_MESSAGE)
    for item in library_errors.chain(exc):
        if isinstance(item, DatabaseError) and item.error_code in _LIBRARY_MESSAGES:
            return 503, error_payload(
                item.error_code, _LIBRARY_MESSAGES[item.error_code]
            )
    if library_errors.is_corrupt(exc):
        return 503, error_payload("DB_UNREADABLE", _LIBRARY_MESSAGES["DB_UNREADABLE"])
    return None
