#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Schema migration runner for the CuePoint library database.

Applies pending migrations from :mod:`cuepoint.migrations` and records them in a
``schema_version` table, so a CuePoint update never requires the user to delete
their database.

Guarantees:

- **Each migration runs in its own transaction.** A failure rolls that migration
  back and leaves ``schema_version`` consistent, so a later run resumes from the
  last migration that actually succeeded rather than replaying a half-applied
  one.
- **Migrations are applied in order**, lowest version first.
- **A database from a newer CuePoint is refused** rather than being operated on
  by an older app that does not understand its schema.

Not to be confused with :mod:`cuepoint.services.schema_migration`, which
migrates exported CSV files between output-schema versions and is unrelated.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.migrations import Migration, discover_migrations, split_sql_statements
from cuepoint.services.interfaces import IDatabaseService, IMigrationRunner

_logger = logging.getLogger(__name__)

SCHEMA_VERSION_TABLE = "schema_version"

_CREATE_VERSION_TABLE = f"""
CREATE TABLE IF NOT EXISTS {SCHEMA_VERSION_TABLE} (
    version     INTEGER PRIMARY KEY,
    description TEXT    NOT NULL,
    applied_at  TEXT    NOT NULL
)
"""


class MigrationRunner(IMigrationRunner):
    """Applies schema migrations to the library database."""

    def __init__(
        self,
        database_service: IDatabaseService,
        migrations: Optional[List[Migration]] = None,
    ) -> None:
        """Initialize the runner.

        Args:
            database_service: Provides the connection to migrate.
            migrations: Migrations to apply. Defaults to those discovered in
                :mod:`cuepoint.migrations`; injectable for tests.
        """
        self._db = database_service
        self._migrations = (
            list(migrations) if migrations is not None else discover_migrations()
        )

    @property
    def available_migrations(self) -> List[Migration]:
        """All known migrations, ordered by version."""
        return list(self._migrations)

    @property
    def target_version(self) -> int:
        """Schema version this build of CuePoint expects (0 if none defined)."""
        return self._migrations[-1].version if self._migrations else 0

    def current_version(self) -> int:
        """Return the database's schema version (0 if no migration applied)."""
        connection = self._db.connect()
        connection.execute(_CREATE_VERSION_TABLE)
        row = connection.execute(
            f"SELECT MAX(version) AS version FROM {SCHEMA_VERSION_TABLE}"
        ).fetchone()
        version = row["version"] if row is not None else None
        return int(version) if version is not None else 0

    def pending_migrations(self) -> List[Migration]:
        """Return migrations not yet applied, in order."""
        applied = self._applied_versions()
        return [m for m in self._migrations if m.version not in applied]

    def migrate(self) -> List[Migration]:
        """Apply all pending migrations.

        Returns:
            The migrations applied, in the order they were applied. Empty when
            the database is already up to date.

        Raises:
            DatabaseError: If the database is newer than this build understands,
                or a migration fails. On failure the failing migration is rolled
                back; migrations applied before it remain applied.
        """
        current = self.current_version()
        target = self.target_version

        if current > target:
            raise DatabaseError(
                message=(
                    f"This library database is at schema version {current}, but this "
                    f"version of CuePoint only understands up to {target}. It was "
                    "likely created by a newer version of CuePoint. Update CuePoint "
                    "to open it."
                ),
                error_code="DB_SCHEMA_TOO_NEW",
                context={
                    "db_path": str(self._db.db_path),
                    "database_version": current,
                    "supported_version": target,
                },
            )

        pending = self.pending_migrations()
        if not pending:
            return []

        applied: List[Migration] = []
        for migration in pending:
            self._apply(migration)
            applied.append(migration)
            _logger.info(
                "[database] applied migration %04d (%s)",
                migration.version,
                migration.description,
            )
        return applied

    def _apply(self, migration: Migration) -> None:
        connection = self._db.connect()
        connection.execute(_CREATE_VERSION_TABLE)

        try:
            with self._db.transaction() as conn:
                # Statement by statement, never executescript(): that would
                # implicitly COMMIT and take the DDL outside this transaction.
                for statement in split_sql_statements(migration.sql):
                    conn.execute(statement)
                conn.execute(
                    f"INSERT INTO {SCHEMA_VERSION_TABLE} "
                    "(version, description, applied_at) VALUES (?, ?, ?)",
                    (
                        migration.version,
                        migration.description,
                        datetime.now(tz=timezone.utc).isoformat(),
                    ),
                )
        except DatabaseError:
            raise
        except Exception as exc:
            raise DatabaseError(
                message=(
                    f"Migration {migration.version:04d} ({migration.description}) "
                    f"failed and was rolled back: {exc}"
                ),
                error_code="DB_MIGRATION_FAILED",
                context={
                    "db_path": str(self._db.db_path),
                    "migration_version": migration.version,
                    "migration_module": migration.module_name,
                },
            ) from exc

    def _applied_versions(self) -> set[int]:
        connection = self._db.connect()
        connection.execute(_CREATE_VERSION_TABLE)
        return {
            int(row["version"])
            for row in connection.execute(f"SELECT version FROM {SCHEMA_VERSION_TABLE}")
        }
