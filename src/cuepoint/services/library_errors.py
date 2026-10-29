#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Telling a full disk and a damaged library file from every other failure (HARDEN-03).

SQLite and the operating system say the same two things in several voices. A full
disk is ``SQLITE_FULL`` ("database or disk is full") from the library and
``ENOSPC`` from a file write; damage is ``SQLITE_CORRUPT`` ("database disk image
is malformed") or ``SQLITE_NOTADB`` ("file is not a database"). This module
recognises them wherever they arrive, so the database service and the engine's
request path agree.

A full disk becomes a :class:`DatabaseError` with code
:data:`~cuepoint.exceptions.cuepoint_exceptions.R002_DISK_FULL` and a message the
user can be shown. Damage is passed to whatever the engine registered with
:func:`set_damage_listener`, which marks the library damaged for the rest of the
session. Nothing here touches the library.
"""

from __future__ import annotations

import errno
import logging
import sqlite3
from typing import Callable, List, Optional

from cuepoint.exceptions.cuepoint_exceptions import R002_DISK_FULL, DatabaseError

_logger = logging.getLogger(__name__)

#: What a person is told when a write fails for lack of room (DEC-155/158).
DISK_FULL_MESSAGE = (
    "Your disk is full. CuePoint can't save changes until there's space."
)

# SQLite result codes (sqlite3.h); the primary code is the low byte.
_SQLITE_FULL = 13
_SQLITE_CORRUPT = 11
_SQLITE_NOTADB = 26

_CHAIN_DEPTH = 6

_damage_listener: Optional[Callable[[BaseException], None]] = None


def chain(exc: Optional[BaseException]) -> List[BaseException]:
    out: List[BaseException] = []
    while exc is not None and len(out) < _CHAIN_DEPTH and exc not in out:
        out.append(exc)
        exc = exc.__cause__ or exc.__context__
    return out


def _primary_code(exc: BaseException) -> Optional[int]:
    code = getattr(exc, "sqlite_errorcode", None)
    return (code & 0xFF) if isinstance(code, int) else None


def is_disk_full(exc: Optional[BaseException]) -> bool:
    """True when ``exc``, or what it was raised from, is a full disk."""
    for item in chain(exc):
        if isinstance(item, DatabaseError) and item.error_code == R002_DISK_FULL:
            return True
        if isinstance(item, OSError) and item.errno == errno.ENOSPC:
            return True
        if isinstance(item, sqlite3.Error) and (
            _primary_code(item) == _SQLITE_FULL
            or "database or disk is full" in str(item).lower()
        ):
            return True
    return False


def is_library_disk_full(exc: Optional[BaseException]) -> bool:
    """True for a full disk that the library itself reported (not a file write elsewhere)."""
    for item in chain(exc):
        if isinstance(item, DatabaseError) and item.error_code == R002_DISK_FULL:
            return True
        if isinstance(item, sqlite3.Error) and (
            _primary_code(item) == _SQLITE_FULL
            or "database or disk is full" in str(item).lower()
        ):
            return True
    return False


def is_corrupt(exc: Optional[BaseException]) -> bool:
    """True when ``exc``, or what it was raised from, says the library file is damaged."""
    for item in chain(exc):
        if not isinstance(item, sqlite3.DatabaseError):
            continue
        if _primary_code(item) in (_SQLITE_CORRUPT, _SQLITE_NOTADB):
            return True
        text = str(item).lower()
        if "malformed" in text or "file is not a database" in text:
            return True
    return False


def disk_full_error(cause: Optional[BaseException] = None) -> DatabaseError:
    """The error a full disk is reported as: code ``R002``, a message to show."""
    return DatabaseError(
        message=DISK_FULL_MESSAGE,
        error_code=R002_DISK_FULL,
        context={"cause": type(cause).__name__ if cause is not None else None},
    )


def set_damage_listener(listener: Optional[Callable[[BaseException], None]]) -> None:
    """Register what is told when damage is seen (the engine's library state)."""
    global _damage_listener
    _damage_listener = listener


def note_failure(exc: BaseException) -> None:
    """Tell the listener if ``exc`` is damage to the library file. Never raises."""
    listener = _damage_listener
    if listener is None or not is_corrupt(exc):
        return
    try:
        listener(exc)
    except Exception as error:  # noqa: BLE001 - noting must never replace the failure
        _logger.warning("[library] could not note the damage: %s", error)


def translate(exc: BaseException) -> BaseException:
    """Return ``exc`` or, for a full disk, the ``R002`` error to raise in its place.

    Also notes damage (:func:`note_failure`). A failure that is neither passes
    through untouched.
    """
    note_failure(exc)
    if isinstance(exc, DatabaseError) and exc.error_code == R002_DISK_FULL:
        return exc
    if is_disk_full(exc):
        return disk_full_error(exc)
    return exc


_migration_block: Optional[DatabaseError] = None


def block_migrations(reason: Optional[DatabaseError]) -> None:
    """Hold the library's migrations back (``reason``), or let them run (None).

    The engine holds them back while the library's state says they must not run:
    no room for the copy kept before them, or an upgrade that already failed and
    waits for "Try again". Nothing blocks them unless the engine says so.
    """
    global _migration_block
    _migration_block = reason


def check_migrations_allowed() -> None:
    """Raise the reason given to :func:`block_migrations`, if there is one."""
    reason = _migration_block
    if reason is not None:
        raise reason
