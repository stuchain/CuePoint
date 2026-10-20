"""The per-domain change counters the engine's revisions read.

Pins: every table of the migrated schema carries its triggers; Discover's
tables and job rows count as ``discover`` and nothing else does; syncing again
writes nothing; a table added later, a restored file without triggers and a
changed classification are all brought back in step; and a file without
counters reads as "not counted".
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.engine.beatport_playlist_jobs import JOB_TYPE_BEATPORT_PLAYLIST
from cuepoint.engine.beatport_resolve_jobs import JOB_TYPE_BEATPORT_RESOLVE
from cuepoint.engine.discovery_jobs import JOB_TYPE_DISCOVERY
from cuepoint.persistence import revision_counters
from cuepoint.persistence.revision_counters import (
    COUNTER_TABLE,
    DISCOVER,
    DISCOVER_JOB_TYPES,
    DISCOVER_TABLES,
    LIBRARY,
    TRIGGER_PREFIX,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


def _tables(conn) -> set:
    return {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
            " AND name NOT LIKE 'sqlite_%'"
        )
    }


def _triggers(conn) -> set:
    return {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE ?",
            (TRIGGER_PREFIX + "%",),
        )
    }


def _counts(db) -> dict:
    found = revision_counters.read(db.connect(), (LIBRARY, DISCOVER))
    assert found is not None
    return {LIBRARY: found[1], DISCOVER: found[2]}


def test_every_discover_table_exists_in_the_schema(db):
    """A misspelt or renamed name would silently count as the library's."""
    assert DISCOVER_TABLES <= _tables(db.connect())


def test_the_discover_job_types_are_the_engines():
    assert set(DISCOVER_JOB_TYPES) == {
        JOB_TYPE_DISCOVERY,
        JOB_TYPE_BEATPORT_PLAYLIST,
        JOB_TYPE_BEATPORT_RESOLVE,
    }


def test_every_table_has_its_triggers_after_migrating(db):
    conn = db.connect()
    triggers = _triggers(conn)
    for table in _tables(conn) - {COUNTER_TABLE}:
        domain = DISCOVER if table in DISCOVER_TABLES else LIBRARY
        for op in ("insert", "update", "delete"):
            assert f"{TRIGGER_PREFIX}{domain}_{table}_{op}" in triggers, table
    assert not any(COUNTER_TABLE in name for name in triggers)


def test_syncing_again_writes_nothing(db):
    assert revision_counters.sync(db) is False
    version = db.connect().execute("PRAGMA schema_version").fetchone()[0]
    assert revision_counters.sync(db) is False
    assert db.connect().execute("PRAGMA schema_version").fetchone()[0] == version


def test_library_and_discover_writes_count_apart(db):
    before = _counts(db)
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO beatport_name_lookups (kind, name_key, beatport_id,"
            " beatport_name, looked_up_at) VALUES ('artist', 'k', 1, 'K', 'now')"
        )
    middle = _counts(db)
    assert middle[LIBRARY] == before[LIBRARY]
    assert middle[DISCOVER] > before[DISCOVER]
    with db.transaction() as conn:
        conn.execute("INSERT INTO tags (name, created_at) VALUES ('Warm', 'now')")
    after = _counts(db)
    assert after[LIBRARY] > middle[LIBRARY]
    assert after[DISCOVER] == middle[DISCOVER]


@pytest.mark.parametrize(
    ("job_type", "domain"),
    [("discovery", DISCOVER), ("beatport_resolve", DISCOVER), ("clean_match", LIBRARY)],
)
def test_a_job_row_counts_by_its_type(db, job_type, domain):
    other = LIBRARY if domain == DISCOVER else DISCOVER
    before = _counts(db)
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO jobs (id, type, state, demo, created_at, updated_at)"
            " VALUES ('j', ?, 'running', 0, 'now', 'now')",
            (job_type,),
        )
        conn.execute("UPDATE jobs SET state = 'succeeded' WHERE id = 'j'")
        conn.execute("DELETE FROM jobs WHERE id = 'j'")
    after = _counts(db)
    assert after[domain] == before[domain] + 3
    assert after[other] == before[other]


def test_a_table_added_later_counts_as_the_librarys(db):
    with db.transaction() as conn:
        conn.execute("CREATE TABLE future_library_rows (x INTEGER)")
    assert revision_counters.sync(db) is True
    before = _counts(db)
    with db.transaction() as conn:
        conn.execute("INSERT INTO future_library_rows VALUES (1)")
    assert _counts(db)[LIBRARY] == before[LIBRARY] + 1


def test_a_file_without_triggers_is_brought_back_in_step(db):
    with db.transaction() as conn:
        for name in _triggers(conn):
            conn.execute(f'DROP TRIGGER "{name}"')
        conn.execute(f"DROP TABLE {COUNTER_TABLE}")
    assert revision_counters.read(db.connect(), (LIBRARY,)) is None
    assert revision_counters.sync(db) is True
    assert revision_counters.read(db.connect(), (LIBRARY,)) is not None


def test_a_stale_trigger_is_replaced(db):
    with db.transaction() as conn:
        conn.execute(f'DROP TRIGGER "{TRIGGER_PREFIX}library_tracks_insert"')
        conn.execute(
            f'CREATE TRIGGER "{TRIGGER_PREFIX}discover_tracks_insert" AFTER INSERT'
            f" ON tracks BEGIN UPDATE {COUNTER_TABLE} SET n = n + 1"
            " WHERE domain = 'discover'; END"
        )
    assert revision_counters.sync(db) is True
    names = _triggers(db.connect())
    assert f"{TRIGGER_PREFIX}library_tracks_insert" in names
    assert f"{TRIGGER_PREFIX}discover_tracks_insert" not in names


def test_a_bare_file_is_not_counted(tmp_path):
    conn = sqlite3.connect(tmp_path / "bare.db")
    conn.execute("CREATE TABLE t (x INTEGER)")
    assert revision_counters.read(conn, (LIBRARY,)) is None
    conn.close()


def test_a_busy_file_raises_rather_than_reading_as_bare():
    class _Busy:
        def execute(self, *_):
            raise sqlite3.OperationalError("database is locked")

    with pytest.raises(sqlite3.OperationalError):
        revision_counters.read(_Busy(), (LIBRARY,))  # type: ignore[arg-type]
