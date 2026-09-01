#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Schema migrations for the CuePoint library database.

Each migration is a module named ``mNNNN_description.py`` in this package,
defining:

- ``VERSION: int`` — the schema version this migration produces (sequential
  from 1, no gaps)
- ``DESCRIPTION: str`` — a short human-readable summary
- ``SQL: str`` — the statements to apply, executed as one script inside a
  single transaction

Migrations are **Python modules rather than .sql data files** on purpose.
PyInstaller follows the module graph automatically, so migrations are always
present in the packaged engine sidecar. Data files must be listed explicitly in
the spec, and this repository already has a case where that was missed
(``incrate/schema.sql`` is absent from the packaged sidecar), which would break
the database at runtime in exactly the situation hardest to debug — a shipped
build on a user's machine.

Migrations are append-only: never edit one that has shipped, since users'
databases already record it as applied. Correct a mistake with a new migration.

If a future migration needs procedural logic (for example backfilling a derived
column), extend the runner to call an optional ``upgrade(connection)`` hook
instead of widening ``SQL``.
"""

from __future__ import annotations

import importlib
import pkgutil
import re
import sqlite3
from dataclasses import dataclass
from typing import List

_MODULE_PATTERN = re.compile(r"^m(\d{4})_[a-z0-9_]+$")
_LINE_COMMENT = re.compile(r"--[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def _has_executable_sql(statement: str) -> bool:
    """Return True if anything remains once comments are stripped."""
    stripped = _BLOCK_COMMENT.sub("", _LINE_COMMENT.sub("", statement))
    return bool(stripped.strip().strip(";").strip())


def split_sql_statements(script: str) -> List[str]:
    """Split a SQL script into individual executable statements.

    Migrations cannot be run with ``sqlite3.Cursor.executescript``: that issues
    an implicit ``COMMIT`` before executing, which would commit the migration's
    DDL outside the runner's transaction. A migration that then failed would
    leave the schema changed but unrecorded — the exact corruption migrations
    exist to prevent. Executing statement by statement keeps the whole migration
    inside one transaction.

    Uses :func:`sqlite3.complete_statement` to find boundaries, so semicolons
    inside string literals and multi-statement ``CREATE TRIGGER`` bodies are
    handled correctly rather than naively splitting on ``;``.
    """
    statements: List[str] = []
    buffer: List[str] = []

    # Scanned character by character rather than line by line so that two
    # statements sharing a line are still separated; sqlite3.Cursor.execute()
    # accepts only one statement at a time.
    for char in script:
        buffer.append(char)
        if char == ";":
            candidate = "".join(buffer)
            if sqlite3.complete_statement(candidate):
                statements.append(candidate.strip())
                buffer = []

    remainder = "".join(buffer).strip()
    if remainder:
        # Trailing statement with no terminating semicolon.
        statements.append(remainder)

    return [s for s in statements if _has_executable_sql(s)]


@dataclass(frozen=True)
class Migration:
    """A single schema migration discovered in this package."""

    version: int
    description: str
    sql: str
    module_name: str


def discover_migrations() -> List[Migration]:
    """Return every migration in this package, ordered by version.

    Raises:
        ValueError: If a module is malformed, a version is duplicated, or the
            sequence has gaps. These are developer errors that must fail loudly
            rather than silently skipping a migration on a user's database.
    """
    migrations: List[Migration] = []

    for module_info in pkgutil.iter_modules(__path__):
        match = _MODULE_PATTERN.match(module_info.name)
        if not match:
            continue

        module = importlib.import_module(f"{__name__}.{module_info.name}")
        for attribute in ("VERSION", "DESCRIPTION", "SQL"):
            if not hasattr(module, attribute):
                raise ValueError(
                    f"Migration module {module_info.name} is missing {attribute}"
                )

        filename_version = int(match.group(1))
        if module.VERSION != filename_version:
            raise ValueError(
                f"Migration module {module_info.name} declares VERSION "
                f"{module.VERSION} but its filename says {filename_version}"
            )

        migrations.append(
            Migration(
                version=int(module.VERSION),
                description=str(module.DESCRIPTION),
                sql=str(module.SQL),
                module_name=module_info.name,
            )
        )

    migrations.sort(key=lambda m: m.version)

    versions = [m.version for m in migrations]
    duplicates = {v for v in versions if versions.count(v) > 1}
    if duplicates:
        raise ValueError(
            f"Duplicate migration version(s): {sorted(duplicates)}. "
            "Two migrations cannot produce the same schema version."
        )
    expected = list(range(1, len(migrations) + 1))
    if versions != expected:
        raise ValueError(
            f"Migration versions must be sequential from 1 with no gaps; "
            f"found {versions}"
        )

    return migrations
