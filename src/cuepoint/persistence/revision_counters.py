#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Change counters on ``cuepoint.db``, one per revision domain, kept by triggers.

Why not ``PRAGMA data_version`` alone
-------------------------------------
The engine's revisions (``engine/revisions.py``) say "look again" to every read
that depends on a domain. ``PRAGMA data_version`` moves on *any* commit to the
file, and ``cuepoint.db`` holds two kinds of data: the library (tracks,
playlists, Collections and Sets, matches, tags, marks, play history, the jobs
that write them, ...) and Discover's Beatport catalog cache and runs. A dig
caches catalog rows about once a second, so with ``data_version`` as the
library's revision every library page read again once a second for nothing,
and Statistics flickered (the bug this module fixes).

A commit cannot be told apart after the fact, and the writers are many
(routes, jobs, other processes), so the split is made where the rows are:
every ordinary table carries ``AFTER INSERT``, ``UPDATE`` and ``DELETE``
triggers that add one to its domain's row in :data:`COUNTER_TABLE`. Triggers
live in the file, so they count every connection's writes, an older CuePoint's
included, and a bulk write costs one single-row update per row in the same
transaction.

Which table counts where
------------------------
A table belongs to ``library`` unless it is named in :data:`DISCOVER_TABLES`:
a table a future migration adds counts as a library change without anyone
remembering to say so, which is the safe way to be wrong (a read too many, never
a stale answer). ``jobs`` is shared: a row of one of Discover's job types
(:data:`DISCOVER_JOB_TYPES`) counts as ``discover``, every other as
``library``, since a dig records its progress there once a second too.
``activity_events`` stays library: a dig records one event when it ends, and
Health reads the feed.

Keeping the triggers in step
----------------------------
:func:`sync` compares the triggers the file has with the ones the tables now
need and, only when they differ, creates the counter table and rewrites the
difference in one transaction. The migration runner calls it after migrating,
so a new table gets its triggers the first time a build that has it opens the
file, and a restored file gets them back. It adds no migration version, so an
older CuePoint still opens the file (its writes keep counting).

A file without the counters (not yet synced, a test's bare database) is read
through ``data_version`` by the revisions, as before: every commit counts.
Virtual tables cannot carry triggers; the library has none.
"""

from __future__ import annotations

import sqlite3
from typing import Dict, Iterable, Optional, Sequence, Tuple

from cuepoint.services.interfaces import IDatabaseService

COUNTER_TABLE = "revision_counters"

LIBRARY = "library"
DISCOVER = "discover"
COUNTED_DOMAINS: Tuple[str, ...] = (LIBRARY, DISCOVER)

#: Discover's own tables and the Beatport catalog cache a dig, a resolve or an
#: Artist or Label page writes (migrations 0021, 0024, 0029 and 0030).
DISCOVER_TABLES = frozenset(
    {
        "beatport_tracks",
        "beatport_track_artists",
        "beatport_name_lookups",
        "beatport_listings",
        "discovery_runs",
        "discovery_run_tracks",
        "discovery_run_sources",
        "discovery_run_groups",
        "discover_lists",
        "discover_list_members",
        "wantlist",
    }
)

#: Job types whose ``jobs`` rows count as Discover's (the engine's constants:
#: ``JOB_TYPE_DISCOVERY``, ``JOB_TYPE_BEATPORT_PLAYLIST``,
#: ``JOB_TYPE_BEATPORT_RESOLVE``).
DISCOVER_JOB_TYPES: Tuple[str, ...] = (
    "discovery",
    "beatport_playlist",
    "beatport_resolve",
)

#: A table split between the domains by one column's value.
_ROUTED: Dict[str, Tuple[str, Tuple[str, ...]]] = {
    "jobs": ("type", DISCOVER_JOB_TYPES),
}

TRIGGER_PREFIX = "cuepoint_rev_"

_OPERATIONS = (
    ("insert", "INSERT", "NEW"),
    ("update", "UPDATE", "NEW"),
    ("delete", "DELETE", "OLD"),
)


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def domain_of(table: str) -> str:
    """The domain a plain (unrouted) table's writes count in."""
    return DISCOVER if table in DISCOVER_TABLES else LIBRARY


def _trigger(
    table: str, op: str, event: str, domain: str, when: str
) -> Tuple[str, str]:
    name = f"{TRIGGER_PREFIX}{domain}_{table}_{op}"
    condition = f" WHEN {when}" if when else ""
    sql = (
        f"CREATE TRIGGER {_quote(name)} AFTER {event} ON {_quote(table)}{condition}"
        f" BEGIN UPDATE {COUNTER_TABLE} SET n = n + 1"
        f" WHERE domain = {_literal(domain)}; END"
    )
    return name, sql


def desired_triggers(tables: Iterable[str]) -> Dict[str, str]:
    """Every counting trigger ``tables`` need, by name, with its SQL."""
    wanted: Dict[str, str] = {}
    for table in sorted(set(tables)):
        if table == COUNTER_TABLE or table.startswith("sqlite_"):
            continue
        routed = _ROUTED.get(table)
        for op, event, row in _OPERATIONS:
            if routed is None:
                pairs = [(domain_of(table), "")]
            else:
                column, values = routed
                listed = ", ".join(_literal(v) for v in values)
                ref = f"{row}.{_quote(column)}"
                pairs = [
                    (DISCOVER, f"{ref} IN ({listed})"),
                    (LIBRARY, f"{ref} IS NULL OR {ref} NOT IN ({listed})"),
                ]
            for domain, when in pairs:
                name, sql = _trigger(table, op, event, domain, when)
                wanted[name] = sql
    return wanted


def _ordinary_tables(conn: sqlite3.Connection) -> list[str]:
    return [
        str(row[0])
        for row in conn.execute(
            "SELECT name, sql FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
        if not str(row[1] or "").lstrip().upper().startswith("CREATE VIRTUAL")
    ]


def _existing_triggers(conn: sqlite3.Connection) -> Dict[str, str]:
    return {
        str(row[0]): str(row[1] or "")
        for row in conn.execute(
            "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'"
            " AND substr(name, 1, ?) = ?",
            (len(TRIGGER_PREFIX), TRIGGER_PREFIX),
        ).fetchall()
    }


def _counters_present(conn: sqlite3.Connection) -> bool:
    try:
        found = {
            str(row[0])
            for row in conn.execute(f"SELECT domain FROM {COUNTER_TABLE}").fetchall()
        }
    except sqlite3.OperationalError:
        return False
    return set(COUNTED_DOMAINS) <= found


def _in_step(conn: sqlite3.Connection) -> bool:
    if not _counters_present(conn):
        return False
    return _existing_triggers(conn) == desired_triggers(_ordinary_tables(conn))


def sync(database: IDatabaseService) -> bool:
    """Give every table its counting triggers; True when anything was written.

    Reads only, when the file is already in step (every launch but the first
    of a build, and the first after a restore).
    """
    if _in_step(database.connect()):
        return False
    with database.transaction() as conn:
        # Asked again under the write lock: another thread may have just done it.
        if _in_step(conn):
            return False
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {COUNTER_TABLE} ("
            " domain TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)"
        )
        for domain in COUNTED_DOMAINS:
            conn.execute(
                f"INSERT OR IGNORE INTO {COUNTER_TABLE} (domain, n) VALUES (?, 0)",
                (domain,),
            )
        existing = _existing_triggers(conn)
        wanted = desired_triggers(_ordinary_tables(conn))
        for name, sql in existing.items():
            if wanted.get(name) != sql:
                conn.execute(f"DROP TRIGGER IF EXISTS {_quote(name)}")
        for name, sql in wanted.items():
            if existing.get(name) != sql:
                conn.execute(sql)
    return True


def read(conn: sqlite3.Connection, domains: Sequence[str]) -> Optional[Tuple[int, ...]]:
    """``(schema_version, *counters)`` for ``domains``, or None when not counted.

    None means the file has no counters (yet): the caller falls back to
    ``data_version``. A busy or locked file raises, as any read would. The
    schema version is part of it because DDL fires no trigger.
    """
    try:
        rows = conn.execute(f"SELECT domain, n FROM {COUNTER_TABLE}").fetchall()
    except sqlite3.OperationalError as exc:
        if "no such table" in str(exc).lower():
            return None
        raise
    found = {str(row[0]): int(row[1]) for row in rows}
    if not all(domain in found for domain in domains):
        return None
    schema = int(conn.execute("PRAGMA schema_version").fetchone()[0])
    return (schema, *(found[domain] for domain in domains))


__all__ = (
    "COUNTED_DOMAINS",
    "COUNTER_TABLE",
    "DISCOVER",
    "DISCOVER_JOB_TYPES",
    "DISCOVER_TABLES",
    "LIBRARY",
    "TRIGGER_PREFIX",
    "desired_triggers",
    "domain_of",
    "read",
    "sync",
)
