#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CuePoint library database (SQLite).

Owns the connection lifecycle for CuePoint's persistent store — the library
itself: tracks, playlists, match decisions and CuePoint-owned metadata such as
tags, ratings and notes. This module provides plumbing only; the schema is
created by migrations.

Design notes:

- **One connection per thread.** CuePoint is thread-based throughout
  (``ThreadPoolExecutor`` in the processing pipeline, a thread per engine job,
  and ``ThreadingHTTPServer`` for the engine API). SQLite connections are not
  safe to share across threads, so each thread lazily gets its own.
- **WAL journal mode**, so readers do not block the writer. This matters
  because engine job threads and API request threads read and write
  concurrently.
- **Foreign keys enforced per connection.** SQLite defaults this to OFF and the
  setting is not persisted in the file, so it must be set on every connection.
- **The database file is user data.** Failures are raised as
  :class:`DatabaseError` with an actionable message rather than a raw
  ``sqlite3`` error, since losing or corrupting this file means losing the
  user's library work.
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services.interfaces import IConfigService, IDatabaseService
from cuepoint.utils.paths import cuepoint_home

DATABASE_FILENAME = "cuepoint.db"


def default_database_path() -> Path:
    """Return the default library database path (``~/.cuepoint/cuepoint.db``).

    Kept alongside ``config.yaml`` so a user's CuePoint state lives in one
    place, which also makes the backup story simple: one directory to copy.
    ``CUEPOINT_HOME`` moves both together.
    """
    home: Path = cuepoint_home()
    return home / DATABASE_FILENAME


class DatabaseService(IDatabaseService):
    """Thread-safe SQLite connection provider for the library database."""

    def __init__(
        self,
        db_path: Optional[str | Path] = None,
        config_service: Optional[IConfigService] = None,
        busy_timeout_seconds: Optional[float] = None,
    ) -> None:
        """Initialize the service.

        Args:
            db_path: Explicit database path. When omitted, taken from
                ``database.path`` in configuration, else the platform default.
            config_service: Optional configuration service.
            busy_timeout_seconds: Lock wait before SQLite reports "database is
                locked". When omitted, taken from
                ``database.busy_timeout_seconds``, else 5 seconds.

        Note:
            Constructing the service does not open the database, and does not
            even resolve its path. Configuration is read on first use, so a
            ``database.path`` set after the container is built — which is how
            the CLI applies flags, and how tests redirect the database away from
            the user's real one — is still honoured. Resolving eagerly meant
            this service captured the default path at bootstrap and silently
            ignored later configuration.
        """
        self._explicit_path = Path(db_path) if db_path is not None else None
        self._explicit_timeout = busy_timeout_seconds
        self._config = config_service

        self._resolved_path: Optional[Path] = None
        self._resolved_timeout: Optional[float] = None

        # Connections are per-thread; the registry lets close_all() reach them.
        self._local = threading.local()
        self._connections: list[sqlite3.Connection] = []
        self._lock = threading.Lock()

    def _resolve_path(self) -> Path:
        if self._explicit_path is not None:
            return self._explicit_path
        if self._config is not None:
            try:
                configured = self._config.get("database.path")
            except AttributeError:
                configured = None
            if configured and str(configured).strip():
                return Path(str(configured).strip())
        return default_database_path()

    def _resolve_timeout(self) -> float:
        if self._explicit_timeout is not None:
            return float(self._explicit_timeout)
        if self._config is not None:
            try:
                configured = self._config.get("database.busy_timeout_seconds")
                if configured is not None:
                    return float(configured)
            except (AttributeError, TypeError, ValueError):
                pass
        return 5.0

    @property
    def db_path(self) -> Path:
        """Path to the SQLite database file.

        Resolved once, on first access, and cached: moving the database while
        connections are open would leave them pointing at the old file.
        """
        if self._resolved_path is None:
            self._resolved_path = self._resolve_path()
        return self._resolved_path

    @property
    def _busy_timeout_seconds(self) -> float:
        if self._resolved_timeout is None:
            self._resolved_timeout = self._resolve_timeout()
        return self._resolved_timeout

    def connect(self) -> sqlite3.Connection:
        """Return this thread's connection, opening it if needed.

        The connection is owned by the service; callers must not close it.

        Raises:
            DatabaseError: If the database cannot be opened (unwritable
                directory, corrupt or non-database file, disk full).
        """
        existing: Optional[sqlite3.Connection] = getattr(
            self._local, "connection", None
        )
        if existing is not None:
            return existing

        # Opening is serialized across threads. Switching a database to WAL
        # needs a brief exclusive lock, and SQLite reports SQLITE_BUSY for a
        # contended "PRAGMA journal_mode" without consulting the busy handler.
        # Several threads opening a fresh database at once would otherwise race
        # and one would fail with "database is locked" — which is exactly what
        # happens on first launch, when engine request and job threads all reach
        # for the database together. Opening is rare, so serializing costs
        # nothing; once WAL is set it persists in the file and later opens are a
        # no-op.
        with self._lock:
            connection = self._open_connection()
            self._connections.append(connection)
        self._local.connection = connection
        return connection

    def _open_connection(self) -> sqlite3.Connection:
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise DatabaseError(
                message=(
                    f"Could not create the CuePoint data folder at "
                    f"{self.db_path.parent}: {exc}"
                ),
                error_code="DB_DIR_CREATE_FAILED",
                context={"db_path": str(self.db_path)},
            ) from exc

        try:
            connection = sqlite3.connect(
                str(self.db_path),
                timeout=self._busy_timeout_seconds,
                # Connections are per-thread, so SQLite's own check is
                # redundant; keeping it on would break the context manager
                # returning a connection created in the same thread.
                check_same_thread=True,
                isolation_level=None,  # explicit transactions via transaction()
            )
        except sqlite3.Error as exc:
            raise DatabaseError(
                message=f"Could not open the CuePoint library database: {exc}",
                error_code="DB_OPEN_FAILED",
                context={"db_path": str(self.db_path)},
            ) from exc

        try:
            connection.row_factory = sqlite3.Row
            # busy_timeout first, so the busy handler is armed before anything
            # that can contend for a lock.
            connection.execute(
                f"PRAGMA busy_timeout={int(self._busy_timeout_seconds * 1000)}"
            )
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA foreign_keys=ON")
            # Surfaces a corrupt or non-database file here, with context, rather
            # than at some arbitrary later query.
            connection.execute("SELECT count(*) FROM sqlite_master").fetchone()
        except sqlite3.DatabaseError as exc:
            connection.close()
            raise DatabaseError(
                message=(
                    f"The CuePoint library database at {self.db_path} could not be "
                    f"read. It may be corrupt or not a database file: {exc}"
                ),
                error_code="DB_UNREADABLE",
                context={"db_path": str(self.db_path)},
            ) from exc

        return connection

    @contextmanager
    def transaction(self, join_existing: bool = False) -> Iterator[sqlite3.Connection]:
        """Run a unit of work in a transaction.

        Commits on success and rolls back on exception.

        Opening one inside another is refused by default, and the reason is
        worth keeping: an inner block that *committed* would make the outer
        block's rollback a lie, having already written part of its work.

        ``join_existing`` is the opposite of that, and is why it is safe. When a
        transaction is already open the inner block yields the same connection
        and does nothing on the way out — no BEGIN, no COMMIT, no ROLLBACK. The
        outer block still owns the boundary, so a failure anywhere undoes
        everything. When no transaction is open it behaves exactly as usual.

        A caller wanting several repositories to succeed or fail together opens
        one transaction and lets them join it. LIBRARY-09's refresh is the first:
        it deletes tracks, upserts the rest, rewrites the playlist mirror and
        records the source, and a half-applied version of that would be data
        loss rather than an inconvenience.

        Args:
            join_existing: Participate in an already-open transaction instead of
                refusing. The caller that opened it decides the outcome.

        Raises:
            DatabaseError: If a transaction is already active and
                ``join_existing`` is False, or if it cannot be started or
                committed.
        """
        connection = self.connect()
        if connection.in_transaction:
            if join_existing:
                # Deliberately no commit and no rollback: the block that opened
                # this transaction is responsible for both.
                yield connection
                return
            raise DatabaseError(
                message="A transaction is already active on this connection",
                error_code="DB_NESTED_TRANSACTION",
                context={"db_path": str(self.db_path)},
            )

        connection.execute("BEGIN")
        try:
            yield connection
        except BaseException:
            try:
                connection.rollback()
            except sqlite3.Error:
                pass
            raise

        try:
            connection.commit()
        except sqlite3.Error as exc:
            try:
                connection.rollback()
            except sqlite3.Error:
                pass
            raise DatabaseError(
                message=f"Could not save changes to the library database: {exc}",
                error_code="DB_COMMIT_FAILED",
                context={"db_path": str(self.db_path)},
            ) from exc

    def execute_script(self, script: str) -> None:
        """Execute a multi-statement SQL script (used by migrations).

        Raises:
            DatabaseError: If the script fails. Any partial work is rolled back.
        """
        connection = self.connect()
        try:
            connection.executescript(script)
        except sqlite3.Error as exc:
            try:
                connection.rollback()
            except sqlite3.Error:
                pass
            raise DatabaseError(
                message=f"Failed to execute database script: {exc}",
                error_code="DB_SCRIPT_FAILED",
                context={"db_path": str(self.db_path)},
            ) from exc

    def close(self) -> None:
        """Close this thread's connection, if open."""
        connection: Optional[sqlite3.Connection] = getattr(
            self._local, "connection", None
        )
        if connection is None:
            return
        self._local.connection = None
        with self._lock:
            if connection in self._connections:
                self._connections.remove(connection)
        try:
            connection.close()
        except sqlite3.Error:
            pass

    def close_all(self) -> None:
        """Close every connection opened by this service, across all threads.

        Intended for shutdown and test teardown. Connections belonging to other
        threads must not be in use concurrently when this is called.
        """
        with self._lock:
            connections = list(self._connections)
            self._connections.clear()
        for connection in connections:
            try:
                connection.close()
            except sqlite3.Error:
                pass
        self._local.connection = None
