#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What state the library is in, worked out once and served from ``/api/v1/status`` (HARDEN-03).

The library can be fine, or it can be a file CuePoint cannot read (``damaged``),
one a newer CuePoint last opened (``too_new``), one whose upgrade failed
(``upgrade_failed``), or one whose upgrade has not run because the disk had no
room for the copy kept before it (``needs_space``). The app shows a screen for
each of those, with a way back; it can only do that if the engine *starts and
answers* when the library cannot be opened. Outside this module the migrations
run when a request first resolves a repository, so a failure there reaches the
renderer as an unrelated request error. Here they run once, on a thread started
after the port is bound, and what they raise is caught into the state.

Until that thread has finished the state is ``upgrading`` (the app waits; status
and health answer meanwhile), and every other thread's migrations are held back
by ``DB_UPGRADING`` so none can run beside the copy kept before the upgrade.
Only the computing thread may migrate. The same holds for a recheck.

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

UPGRADING = "upgrading"
UPGRADING_CODE = "DB_UPGRADING"

# _lock guards the published state and is only ever held for a moment; the work
# of computing it is never done under it, so a status request never waits for
# an upgrade. _compute_lock makes one compute at a time.
_lock = threading.RLock()
_compute_lock = threading.Lock()
_state: Optional[Dict[str, Any]] = None
_reported: set[str] = set()
_integrity: Dict[str, Any] = {"state": INTEGRITY_IDLE, "finishedAt": None}
_on_ready: Optional[Callable[[], None]] = None
_ready_fired = False
#: The pre-upgrade copy this session took (or was handed by the launch backup):
#: a retry of a failed upgrade may reuse it, nothing else may.
_session_copy: Optional[str] = None
_fill_threads: list[threading.Thread] = []


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


def _blocker(code: str, message: str) -> DatabaseError:
    return DatabaseError(message=message, error_code=code)


def _block(code: str, message: str) -> None:
    """Hold this library's migrations back, for every thread but the computing one."""
    library_errors.block_migrations(_blocker(code, message), _library_path())


def _fill_way_back(computed_at: str, state_name: str) -> None:
    """Look up the newest good backup on a thread, so no one waits for the quick_checks."""

    def fill() -> None:
        global _state
        good = _newest_good_backup()
        with _lock:
            if (
                _state is not None
                and _state["state"] == state_name
                and _state["computedAt"] == computed_at
            ):
                _state = {**_state, "newestGoodBackup": good}

    thread = threading.Thread(target=fill, name="library-way-back", daemon=True)
    with _lock:
        _fill_threads[:] = [t for t in _fill_threads if t.is_alive()]
        _fill_threads.append(thread)
    thread.start()


def settle(timeout: float = 10.0) -> None:
    """Wait for the background lookups of the way back (tests)."""
    with _lock:
        threads = list(_fill_threads)
    for thread in threads:
        thread.join(timeout)


def compute_library_state() -> Dict[str, Any]:
    """Work out the library's state now. Runs the upgrade if one is due. Never raises.

    Reads the file with plain SELECTs first, so a library that cannot be read is
    reported as damaged rather than failing inside a repository; takes the copy
    the upgrade needs (or finds it has no room); then runs the migrations and
    sorts what they raise into a state. The calling thread alone may migrate
    meanwhile (``allow_migrations``); every other thread is held by
    ``DB_UPGRADING``, set by :func:`_publish_upgrading`.
    """
    try:
        with library_errors.allow_migrations():
            return _compute()
    except Exception as exc:  # noqa: BLE001 - a state must come out of this
        _logger.warning("[library] could not work out the library's state: %s", exc)
        return _base()


def _compute() -> Dict[str, Any]:
    from cuepoint.services.migration_runner import (
        pending_versions,
        schema_and_head,
        schema_is_ahead,
    )

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
        return state

    if ahead:
        state["state"] = TOO_NEW
        return state
    if not pending:
        return state

    # An upgrade is due. Its copy is never skipped: with no room for it the
    # migrations do not run.
    global _session_copy
    service = _backup_service()
    copy = None
    try:
        copy = service.ensure_pre_upgrade(pending, reuse=_session_copy)
        _session_copy = copy.name
    except DatabaseError as exc:
        if exc.error_code == "BACKUP_NEEDS_SPACE":
            return _needs_space(state, int(exc.context.get("requiredFreeBytes") or 0))
        # Any other trouble with the copy keeps the behaviour from before this
        # state existed: it is logged, and the upgrade goes on.
        _logger.warning("[library] the copy before the upgrade failed: %s", exc)

    return _upgrade(state, copy)


def _needs_space(state: Dict[str, Any], required: int) -> Dict[str, Any]:
    state["state"] = NEEDS_SPACE
    state["requiredFreeBytes"] = required
    _block(
        NEEDS_SPACE_CODE,
        "CuePoint needs more free space to update your library safely.",
    )
    return state


def _upgrade(state: Dict[str, Any], copy: Any) -> Dict[str, Any]:
    from cuepoint.services.interfaces import IMigrationRunner
    from cuepoint.services.migration_runner import schema_and_head
    from cuepoint.utils.di_container import get_container

    try:
        get_container().resolve(IMigrationRunner).migrate()
    except DatabaseError as exc:
        code = exc.error_code
        _logger.warning("[library] the library could not be updated: %s", code)
        if library_errors.is_library_disk_full(exc):
            # The room that was there for the copy was not enough for the
            # upgrade itself. The user's to fix; nothing was half-applied.
            required = 0
            try:
                required = int(_backup_service().required_free_bytes())
            except Exception:  # noqa: BLE001
                pass
            return _needs_space(state, required)
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
            _block(
                MIGRATION_BLOCKED,
                "CuePoint couldn't finish updating your library. Nothing was lost.",
            )
    try:
        state["schemaVersion"] = schema_and_head(_library_path())[0]
    except sqlite3.Error:
        pass
    return state


# ---------------------------------------------------------------------------
# Serving it
# ---------------------------------------------------------------------------


def _upgrading_state() -> Dict[str, Any]:
    state = _base()
    state["state"] = UPGRADING
    return state


def _publish_upgrading() -> bool:
    """Say the state is being worked out, and hold every other thread's migrations.

    Returns False when it already is (someone else is computing).
    """
    global _state
    with _lock:
        if _state is not None and _state["state"] == UPGRADING:
            return False
        _state = _upgrading_state()
    _block(UPGRADING_CODE, "CuePoint is still getting your library ready.")
    return True


def begin() -> None:
    """Publish ``upgrading`` and block migrations, before the engine takes requests."""
    try:
        _publish_upgrading()
    except Exception as exc:  # noqa: BLE001
        _logger.warning("[library] could not hold the migrations back: %s", exc)


def note_launch_backup(info: Any) -> None:
    """Remember the pre-upgrade copy the launch backup took, for the compute to reuse."""
    global _session_copy
    if info is not None and getattr(info, "reason", None) == "pre-upgrade":
        _session_copy = info.name


def run_compute(*, wait: bool = False) -> Dict[str, Any]:
    """Work the state out, publish it, and start what a library that opened needs.

    Never under ``_lock``: status requests are answered (``upgrading``) while
    this runs, however long the upgrade takes. One compute at a time; a caller
    that finds another running returns the state published meanwhile, unless
    ``wait``: a recheck asked for while the previous compute is still finishing
    (it has published, and is reporting) waits its turn and then runs, so the
    answer it was promised is not lost to the earlier one.
    """
    global _state, _ready_fired
    if not _compute_lock.acquire(blocking=wait):
        return get_library_state()
    try:
        with _lock:
            _integrity.update(state=INTEGRITY_IDLE, finishedAt=None)
        _publish_upgrading()
        result = compute_library_state()
        # The block set for the computation gives way to the one the state
        # needs (set during the compute) or to none.
        if result["state"] not in (NEEDS_SPACE, UPGRADE_FAILED):
            library_errors.block_migrations(None)
        result["computedAt"] = _now()
        with _lock:
            _state = result
        library_errors.set_damage_listener(mark_damaged)
        if result["state"] in (DAMAGED, TOO_NEW, UPGRADE_FAILED):
            _fill_way_back(result["computedAt"], result["state"])
        report_current()
        fire = False
        with _lock:
            if result["state"] == OK and not _ready_fired and _on_ready is not None:
                _ready_fired = fire = True
            callback = _on_ready
        if fire and callback is not None:
            try:
                callback()
            except Exception as exc:  # noqa: BLE001
                _logger.warning(
                    "[library] the work after the library opened failed: %s", exc
                )
        return dict(result)
    finally:
        _compute_lock.release()


def get_library_state() -> Dict[str, Any]:
    """The published state. Worked out (here, once) only if nothing has started it.

    While an upgrade runs this answers ``upgrading`` at once.
    """
    with _lock:
        if _state is not None:
            return dict(_state)
    return run_compute()


def recompute() -> Dict[str, Any]:
    """Start working the state out again (after "Try again", a restore or a failure).

    Returns at once with ``upgrading``; the caller polls the status. Retries the
    upgrade of an ``upgrade_failed`` library, and takes the copy a ``needs_space``
    one was missing. Connections opened on the old file go first.
    """
    try:
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IDatabaseService
        from cuepoint.utils.di_container import get_container

        bootstrap_services()
        get_container().resolve(IDatabaseService).close_all()
    except Exception as exc:  # noqa: BLE001
        _logger.warning("[library] could not let go of the old connections: %s", exc)
    finishing = False
    if _compute_lock.locked():
        with _lock:
            running = _state is None or _state["state"] == UPGRADING
        if running:
            return get_library_state()
        # The compute holding the lock has already published its result and is
        # reporting it. Asking again is not answered with that old result: the
        # recheck runs once the lock is free.
        finishing = True
    # The block goes up here, before the thread starts, so no request slips in.
    _publish_upgrading()
    # The answer is taken before the thread starts: a library that is quick to
    # check can be done before this returns, and the caller was told "upgrading".
    answer = get_library_state()
    threading.Thread(
        target=run_compute,
        kwargs={"wait": finishing},
        name="library-recheck",
        daemon=True,
    ).start()
    return answer


def on_ready(callback: Optional[Callable[[], None]]) -> None:
    """Run ``callback`` once, the first time the state is worked out as ``ok``."""
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


def current_state_name() -> Optional[str]:
    """The published state's name, or None before there is one. Never computes."""
    with _lock:
        return _state["state"] if _state is not None else None


def reset() -> None:
    """Forget everything (tests)."""
    global _state, _on_ready, _ready_fired, _session_copy
    settle(5)
    with _lock:
        _state = None
        _on_ready = None
        _ready_fired = False
        _session_copy = None
        _reported.clear()
        _integrity.update({"state": INTEGRITY_IDLE, "finishedAt": None})
    library_errors.set_damage_listener(None)
    library_errors.block_migrations(None)


# ---------------------------------------------------------------------------
# Damage seen after the start
# ---------------------------------------------------------------------------


def mark_damaged(cause: Optional[BaseException] = None, *, wait: bool = False) -> None:
    """The library turned out to be damaged during the session.

    A no-op unless the state is ``ok`` (a library already in trouble, or still
    being worked out, stays in the state that names it). The way back (the
    newest good backup) is looked up on a thread unless ``wait``, so the request
    that hit the damage is not held up checking backups.
    """
    global _state
    with _lock:
        if _state is None or _state["state"] != OK:
            return
        _logger.warning("[library] the library is damaged: %s", type(cause).__name__)
        updated = dict(_state)
        updated.update(state=DAMAGED, computedAt=_now())
        _state = updated
        stamp = updated["computedAt"]
    if wait:
        good = _newest_good_backup()
        with _lock:
            if _state is not None and _state["computedAt"] == stamp:
                _state = {**_state, "newestGoodBackup": good}
    else:
        _fill_way_back(stamp, DAMAGED)
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
    # Read-only: the check must never be the thing that changes the file.
    connection = sqlite3.connect(
        f"{path.resolve().as_uri()}?mode=ro", timeout=30, uri=True
    )
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
    UPGRADING_CODE: "CuePoint is still getting your library ready.",
}

#: Codes that are only the state speaking when the state is already in trouble;
#: while it says ``ok`` they are a failure we have not seen before, and reported.
_ONLY_IN_TROUBLE = {
    "DB_UNREADABLE": (DAMAGED,),
    "DB_MIGRATION_FAILED": (UPGRADE_FAILED,),
}


def status_for(exc: BaseException) -> Optional[tuple[int, Dict[str, Any]]]:
    """The answer for a failure that is the library's state speaking, or None.

    A full disk is 507 ``R002`` with the words above. A library that cannot be
    used is 503 with its own code and a sentence a person can read; the app
    shows its recovery screen from ``/api/v1/status``, not from these. Damage
    seen on the way is noted (the state turns ``damaged``). ``DB_UNREADABLE``
    or ``DB_MIGRATION_FAILED`` while the state is ``ok`` that is not damage is a
    failure like any other: None, and the caller reports it. Everything else is
    None, and the caller answers as it always did.
    """
    from cuepoint.engine.api_errors import error_payload

    library_errors.note_failure(exc)
    if library_errors.is_library_disk_full(exc):
        return 507, error_payload(R002_DISK_FULL, library_errors.DISK_FULL_MESSAGE)
    name = current_state_name()
    for item in library_errors.chain(exc):
        if (
            not isinstance(item, DatabaseError)
            or item.error_code not in _LIBRARY_MESSAGES
        ):
            continue
        code = item.error_code
        allowed = _ONLY_IN_TROUBLE.get(code)
        if allowed is not None and name not in allowed:
            # The damage just noted turns the state; that is the state speaking.
            if not library_errors.is_corrupt(exc):
                return None
        return 503, error_payload(code, _LIBRARY_MESSAGES[code])
    if library_errors.is_corrupt(exc):
        return 503, error_payload("DB_UNREADABLE", _LIBRARY_MESSAGES["DB_UNREADABLE"])
    return None
