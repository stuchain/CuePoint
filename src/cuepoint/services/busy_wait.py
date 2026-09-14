#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Writing while another job holds the database (CLEAN-07, CLEAN-08).

A background job that commits beside an import or a refresh will sometimes find
the write lock taken for longer than SQLite's busy timeout: a 50,000-track
import holds it for about eleven seconds. A unit of work that found the database
busy wrote nothing, so it can simply be tried again. Everything else a write
raises is a real failure and is raised at once.

Written once for the jobs that need it, so "busy" is recognized one way.
"""

from __future__ import annotations

import sqlite3
import time
from typing import Callable, Optional, TypeVar

from cuepoint.services.interfaces import IDatabaseService

T = TypeVar("T")


def database_busy(exc: BaseException) -> bool:
    """True when SQLite said the database is locked or busy.

    Raised as it is by a statement or by ``BEGIN``, or wrapped by the database
    service when a commit fails, so the cause chain is followed.
    """
    current: Optional[BaseException] = exc
    while current is not None:
        if isinstance(current, sqlite3.OperationalError):
            text = str(current).lower()
            if "locked" in text or "busy" in text:
                return True
        current = current.__cause__
    return False


def write_waiting(
    database_service: IDatabaseService,
    work: Callable[[], T],
    *,
    patience_seconds: float,
    interval_seconds: float,
    on_wait: Optional[Callable[[], None]] = None,
) -> T:
    """Run ``work`` in one transaction, trying again while the database is busy.

    Args:
        work: The unit of work; it runs inside the transaction and its answer is
            returned.
        patience_seconds: How long to keep trying after the first busy answer.
            Each try already waits the database's busy timeout.
        interval_seconds: The pause between tries, so a busy timeout configured
            to zero cannot spin.
        on_wait: Called once, the first time the database is busy.

    Raises:
        Whatever ``work`` or the transaction raised, at once unless it was
        "busy", and "busy" itself once the patience runs out.
    """
    waiting_since: Optional[float] = None
    while True:
        try:
            with database_service.transaction():
                return work()
        except Exception as exc:  # noqa: BLE001 — re-raised unless busy
            if not database_busy(exc):
                raise
            now = time.monotonic()
            if waiting_since is None:
                waiting_since = now
                if on_wait is not None:
                    on_wait()
            if now - waiting_since >= patience_seconds:
                raise
            time.sleep(interval_seconds)


__all__ = ("database_busy", "write_waiting")
