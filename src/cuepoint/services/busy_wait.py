#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Writing while another job holds the database (CLEAN-07, CLEAN-08).

A background job that commits beside an import or a refresh will sometimes find
the write lock taken for longer than SQLite's busy timeout: a 50,000-track
import holds it for about eleven seconds. A unit of work that found the database
busy wrote nothing, so it can simply be tried again. Everything else a write
raises is a real failure and is raised at once.

Written once for the jobs that need it, so "busy" is recognized one way. A
person's own save waits too, for less time (:data:`REQUEST_PATIENCE_SECONDS`):
a tick or an edit made while a background job commits is held until the lock
frees, rather than refused after the busy timeout (Sentry PYTHON-1N).
"""

from __future__ import annotations

import sqlite3
import time
from typing import Callable, Optional, TypeVar

from cuepoint.services.interfaces import IDatabaseService

T = TypeVar("T")

#: How long one person's save waits for a busy library before it gives up and
#: the engine answers 503 ``LIBRARY_BUSY``. Each try already waits SQLite's
#: busy timeout (5 s by default), so this is about six tries. Kept well under
#: any client timeout: a request the renderer gave up on must not commit later.
REQUEST_PATIENCE_SECONDS = 30.0

#: The pause between those tries.
REQUEST_INTERVAL_SECONDS = 0.25


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


def retry_while_busy(
    work: Callable[[], T],
    *,
    patience_seconds: float,
    interval_seconds: float,
    on_wait: Optional[Callable[[], None]] = None,
) -> T:
    """Call ``work`` again while it fails because the database is busy.

    Opens no transaction of its own, so ``work`` may open one that does not
    join. Only for a ``work`` that a busy failure leaves unwritten: one
    transaction (``BEGIN IMMEDIATE`` is where SQLite says busy, so nothing in
    it was written), preceded by nothing but reads. Never for one that calls
    the network or writes a file before its transaction.

    Args:
        work: The unit of work; its answer is returned.
        patience_seconds: How long to keep trying after the first busy answer.
            Each try already waits the database's busy timeout.
        interval_seconds: The pause between tries, so a busy timeout configured
            to zero cannot spin.
        on_wait: Called once, the first time the database is busy.

    Raises:
        Whatever ``work`` raised, at once unless it was "busy", and "busy"
        itself once the patience runs out.
    """
    waiting_since: Optional[float] = None
    while True:
        try:
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

    def in_one_transaction() -> T:
        with database_service.transaction():
            return work()

    return retry_while_busy(
        in_one_transaction,
        patience_seconds=patience_seconds,
        interval_seconds=interval_seconds,
        on_wait=on_wait,
    )


__all__ = (
    "REQUEST_INTERVAL_SECONDS",
    "REQUEST_PATIENCE_SECONDS",
    "database_busy",
    "retry_while_busy",
    "write_waiting",
)
