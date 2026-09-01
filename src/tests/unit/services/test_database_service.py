#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the library database service.

Covers connection lifecycle, the pragmas the rest of the persistence layer will
rely on (WAL, foreign keys), transaction semantics, concurrent access from
multiple threads, and failure handling for an unreadable database file.

Every test uses a temporary database; the user's real ~/.cuepoint/cuepoint.db is
never touched.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from unittest.mock import Mock

import pytest

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.services.database_service import (
    DATABASE_FILENAME,
    DatabaseService,
    default_database_path,
)
from cuepoint.services.interfaces import IConfigService, IDatabaseService


@pytest.fixture
def db_path(tmp_path) -> Path:
    return tmp_path / "cuepoint.db"


@pytest.fixture
def service(db_path):
    svc = DatabaseService(db_path=db_path)
    yield svc
    svc.close_all()


@pytest.mark.unit
class TestPathResolution:
    def test_implements_interface(self):
        assert issubclass(DatabaseService, IDatabaseService)

    def test_default_path_is_in_cuepoint_home(self):
        path = default_database_path()
        assert path.name == DATABASE_FILENAME
        assert path.parent == Path.home() / ".cuepoint"

    def test_explicit_path_wins(self, db_path):
        assert DatabaseService(db_path=db_path).db_path == db_path

    def test_path_from_config_service(self, tmp_path):
        configured = tmp_path / "from-config.db"
        config = Mock(spec=IConfigService)
        config.get.side_effect = lambda key, default=None: {
            "database.path": str(configured),
            "database.busy_timeout_seconds": 5.0,
        }.get(key, default)

        assert DatabaseService(config_service=config).db_path == configured

    def test_blank_config_path_falls_back_to_default(self):
        config = Mock(spec=IConfigService)
        config.get.side_effect = lambda key, default=None: {
            "database.path": "   ",
            "database.busy_timeout_seconds": 5.0,
        }.get(key, default)

        assert DatabaseService(config_service=config).db_path == default_database_path()

    def test_explicit_path_overrides_config(self, tmp_path):
        config = Mock(spec=IConfigService)
        config.get.return_value = str(tmp_path / "config.db")
        explicit = tmp_path / "explicit.db"

        assert (
            DatabaseService(db_path=explicit, config_service=config).db_path == explicit
        )

    def test_accepts_str_path(self, db_path):
        assert DatabaseService(db_path=str(db_path)).db_path == db_path

    def test_unicode_path(self, tmp_path):
        """Non-ASCII paths are a named cross-platform risk."""
        target = tmp_path / "Müsik ünd Ünicode ✦" / "cuepoint.db"
        svc = DatabaseService(db_path=target)
        try:
            svc.connect().execute("CREATE TABLE t (id INTEGER)")
            assert target.exists()
        finally:
            svc.close_all()


@pytest.mark.unit
class TestConnectionLifecycle:
    def test_construction_does_not_touch_disk(self, db_path):
        DatabaseService(db_path=db_path)
        assert not db_path.exists()

    def test_connect_creates_file_and_parent_dirs(self, tmp_path):
        nested = tmp_path / "a" / "b" / "cuepoint.db"
        svc = DatabaseService(db_path=nested)
        try:
            svc.connect()
            assert nested.exists()
        finally:
            svc.close_all()

    def test_connect_is_idempotent_per_thread(self, service):
        assert service.connect() is service.connect()

    def test_close_then_connect_reopens(self, service):
        first = service.connect()
        service.close()
        second = service.connect()
        assert second is not first
        second.execute("SELECT 1")

    def test_close_without_connection_is_safe(self, service):
        service.close()  # must not raise

    def test_close_all_without_connection_is_safe(self, service):
        service.close_all()  # must not raise

    def test_close_all_closes_open_connection(self, service):
        connection = service.connect()
        service.close_all()
        with pytest.raises(sqlite3.ProgrammingError):
            connection.execute("SELECT 1")


@pytest.mark.unit
class TestPragmas:
    def test_wal_journal_mode(self, service):
        mode = service.connect().execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"

    def test_foreign_keys_enforced(self, service):
        assert service.connect().execute("PRAGMA foreign_keys").fetchone()[0] == 1

    def test_foreign_key_violation_is_rejected(self, service):
        """The pragma must actually bite, not just report as on."""
        conn = service.connect()
        conn.executescript(
            """
            CREATE TABLE parent (id INTEGER PRIMARY KEY);
            CREATE TABLE child (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER NOT NULL REFERENCES parent(id)
            );
            """
        )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO child (parent_id) VALUES (999)")

    def test_row_factory_allows_name_access(self, service):
        conn = service.connect()
        conn.execute("CREATE TABLE t (name TEXT)")
        conn.execute("INSERT INTO t (name) VALUES ('x')")
        assert conn.execute("SELECT name FROM t").fetchone()["name"] == "x"

    def test_busy_timeout_applied(self, db_path):
        svc = DatabaseService(db_path=db_path, busy_timeout_seconds=2.5)
        try:
            value = svc.connect().execute("PRAGMA busy_timeout").fetchone()[0]
            assert value == 2500
        finally:
            svc.close_all()

    def test_busy_timeout_from_config(self, db_path):
        config = Mock(spec=IConfigService)
        config.get.side_effect = lambda key, default=None: {
            "database.path": str(db_path),
            "database.busy_timeout_seconds": 1.5,
        }.get(key, default)
        svc = DatabaseService(config_service=config)
        try:
            assert svc.connect().execute("PRAGMA busy_timeout").fetchone()[0] == 1500
        finally:
            svc.close_all()

    def test_pragmas_applied_to_every_thread_connection(self, service):
        """A second thread must get the same guarantees, not defaults."""
        seen: dict[str, object] = {}

        def worker():
            conn = service.connect()
            seen["journal"] = conn.execute("PRAGMA journal_mode").fetchone()[0]
            seen["fk"] = conn.execute("PRAGMA foreign_keys").fetchone()[0]

        thread = threading.Thread(target=worker)
        thread.start()
        thread.join()

        assert str(seen["journal"]).lower() == "wal"
        assert seen["fk"] == 1


@pytest.mark.unit
class TestTransactions:
    def test_commit_on_success(self, service):
        service.connect().execute("CREATE TABLE t (v TEXT)")
        with service.transaction() as conn:
            conn.execute("INSERT INTO t (v) VALUES ('a')")
        assert service.connect().execute("SELECT count(*) FROM t").fetchone()[0] == 1

    def test_rollback_on_exception(self, service):
        service.connect().execute("CREATE TABLE t (v TEXT)")
        with pytest.raises(RuntimeError):
            with service.transaction() as conn:
                conn.execute("INSERT INTO t (v) VALUES ('a')")
                raise RuntimeError("boom")
        assert service.connect().execute("SELECT count(*) FROM t").fetchone()[0] == 0

    def test_rollback_leaves_connection_usable(self, service):
        service.connect().execute("CREATE TABLE t (v TEXT)")
        with pytest.raises(RuntimeError):
            with service.transaction() as conn:
                conn.execute("INSERT INTO t (v) VALUES ('a')")
                raise RuntimeError("boom")
        with service.transaction() as conn:
            conn.execute("INSERT INTO t (v) VALUES ('b')")
        assert service.connect().execute("SELECT v FROM t").fetchone()["v"] == "b"

    def test_partial_work_rolled_back_atomically(self, service):
        service.connect().execute("CREATE TABLE t (v TEXT)")
        with pytest.raises(RuntimeError):
            with service.transaction() as conn:
                for value in "abc":
                    conn.execute("INSERT INTO t (v) VALUES (?)", (value,))
                raise RuntimeError("boom")
        assert service.connect().execute("SELECT count(*) FROM t").fetchone()[0] == 0

    def test_nested_transaction_rejected(self, service):
        """SQLite has no nested transactions; silently committing would be worse."""
        with service.transaction():
            with pytest.raises(DatabaseError) as exc:
                with service.transaction():
                    pass
        assert exc.value.error_code == "DB_NESTED_TRANSACTION"


@pytest.mark.unit
class TestExecuteScript:
    def test_runs_multiple_statements(self, service):
        service.execute_script(
            """
            CREATE TABLE a (id INTEGER PRIMARY KEY);
            CREATE TABLE b (id INTEGER PRIMARY KEY);
            """
        )
        names = {
            row["name"]
            for row in service.connect().execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        assert {"a", "b"} <= names

    def test_invalid_script_raises_database_error(self, service):
        with pytest.raises(DatabaseError) as exc:
            service.execute_script("CREATE TABLE ok (id INTEGER); NOT VALID SQL;")
        assert exc.value.error_code == "DB_SCRIPT_FAILED"


@pytest.mark.unit
class TestFailureHandling:
    def test_unreadable_file_raises_database_error(self, tmp_path):
        """A non-database file must fail with context, not a raw sqlite3 error."""
        bogus = tmp_path / "cuepoint.db"
        bogus.write_bytes(b"this is definitely not a sqlite database" * 10)

        svc = DatabaseService(db_path=bogus)
        try:
            with pytest.raises(DatabaseError) as exc:
                svc.connect()
            assert exc.value.error_code == "DB_UNREADABLE"
            assert exc.value.context["db_path"] == str(bogus)
        finally:
            svc.close_all()

    def test_database_error_message_names_the_file(self, tmp_path):
        bogus = tmp_path / "broken.db"
        bogus.write_bytes(b"garbage" * 100)
        svc = DatabaseService(db_path=bogus)
        try:
            with pytest.raises(DatabaseError) as exc:
                svc.connect()
            assert str(bogus) in exc.value.message
        finally:
            svc.close_all()

    def test_directory_in_place_of_file_raises_database_error(self, tmp_path):
        target = tmp_path / "cuepoint.db"
        target.mkdir()
        svc = DatabaseService(db_path=target)
        try:
            with pytest.raises(DatabaseError):
                svc.connect()
        finally:
            svc.close_all()


@pytest.mark.unit
class TestConcurrency:
    def test_each_thread_gets_its_own_connection(self, service):
        connections = []
        errors: list[BaseException] = []
        lock = threading.Lock()

        def worker():
            try:
                conn = service.connect()
            except BaseException as exc:  # noqa: BLE001 - surfaced via assert
                with lock:
                    errors.append(exc)
                return
            with lock:
                connections.append(conn)

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        assert not any(t.is_alive() for t in threads), "a worker thread hung"
        # Reported before the count assertion so a failure names the cause
        # rather than just showing a short list.
        assert not errors, f"connect() failed in a worker thread: {errors!r}"
        assert len(connections) == 4
        # Compared by object identity; every connection is still strongly
        # referenced here, so identity is stable for the whole assertion.
        assert len({id(c) for c in connections}) == 4, "connections were shared"

    def test_many_threads_open_a_fresh_database_simultaneously(self, tmp_path):
        """First launch: several threads reach for a brand-new database at once.

        Regression guard: switching a database to WAL takes a brief exclusive
        lock, and SQLite returns SQLITE_BUSY for a contended
        "PRAGMA journal_mode" without consulting the busy handler. Opening
        concurrently used to fail intermittently with "database is locked".
        """
        service = DatabaseService(db_path=tmp_path / "fresh.db")
        errors: list[BaseException] = []
        opened: list[object] = []
        lock = threading.Lock()
        start = threading.Barrier(8)

        def worker():
            try:
                start.wait(timeout=10)  # maximize contention
                conn = service.connect()
                with lock:
                    opened.append(conn)
            except BaseException as exc:  # noqa: BLE001 - surfaced via assert
                with lock:
                    errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        try:
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=30)

            assert not errors, (
                f"opening a fresh database concurrently failed: {errors!r}"
            )
            assert len(opened) == 8
        finally:
            service.close_all()

    def test_concurrent_writes_from_many_threads(self, service):
        """Mirrors the real workload: several threads writing at once."""
        service.connect().execute("CREATE TABLE t (thread TEXT, i INTEGER)")

        errors: list[BaseException] = []
        threads_count, per_thread = 6, 25

        def worker(name: str):
            try:
                for i in range(per_thread):
                    with service.transaction() as conn:
                        conn.execute(
                            "INSERT INTO t (thread, i) VALUES (?, ?)", (name, i)
                        )
            except BaseException as exc:  # noqa: BLE001 - surfaced via assert
                errors.append(exc)

        threads = [
            threading.Thread(target=worker, args=(f"t{n}",))
            for n in range(threads_count)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"concurrent writes failed: {errors[:3]}"
        total = service.connect().execute("SELECT count(*) FROM t").fetchone()[0]
        assert total == threads_count * per_thread

    def test_reader_not_blocked_by_open_write_transaction(self, service):
        """The point of WAL: a pending write must not block readers."""
        conn = service.connect()
        conn.execute("CREATE TABLE t (v TEXT)")
        conn.execute("INSERT INTO t (v) VALUES ('committed')")

        read_count: list[int] = []
        errors: list[BaseException] = []

        with service.transaction() as writer:
            writer.execute("INSERT INTO t (v) VALUES ('pending')")

            def reader():
                try:
                    svc = DatabaseService(db_path=service.db_path)
                    try:
                        read_count.append(
                            svc.connect()
                            .execute("SELECT count(*) FROM t")
                            .fetchone()[0]
                        )
                    finally:
                        svc.close_all()
                except BaseException as exc:  # noqa: BLE001 - surfaced via assert
                    errors.append(exc)

            thread = threading.Thread(target=reader)
            thread.start()
            thread.join(timeout=10)
            assert not thread.is_alive(), "reader blocked by open write transaction"

        assert not errors, f"reader failed: {errors}"
        assert read_count == [1], "reader saw uncommitted data"


@pytest.mark.unit
class TestScale:
    def test_bulk_insert_is_not_pathological(self, service):
        """Cheap guard against a per-row-transaction style regression."""
        service.connect().execute("CREATE TABLE t (i INTEGER, v TEXT)")
        with service.transaction() as conn:
            conn.executemany(
                "INSERT INTO t (i, v) VALUES (?, ?)",
                ((i, f"value-{i}") for i in range(20_000)),
            )
        assert (
            service.connect().execute("SELECT count(*) FROM t").fetchone()[0] == 20_000
        )
