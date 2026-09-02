#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The DEC-009 launch backup is actually taken when the engine starts.

DEC-009 chose "automatic on launch + retention + manual restore".
``BackupService.backup_on_launch`` was implemented and tested, registered in the
DI container — and called by nothing outside its own tests, so the automatic
half never happened. These tests pin the wiring, not just the capability.
"""

from __future__ import annotations

import logging
import sqlite3

import pytest

from cuepoint.engine import server
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container


@pytest.fixture
def library(tmp_path, monkeypatch):
    """A sandboxed library database path with a fresh DI container."""
    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    yield db_path
    reset_container()


def _make_populated_database(db_path):
    """A migrated database with a row in it, as a real launch would find."""
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.migration_runner import MigrationRunner

    service = DatabaseService(db_path=db_path)
    MigrationRunner(service).migrate()
    with service.transaction() as conn:
        conn.execute(
            "INSERT INTO jobs (id, type, state, created_at, updated_at)"
            " VALUES (?,?,?,?,?)",
            (
                "job-1",
                "match",
                "completed",
                "2026-09-02T00:00:00Z",
                "2026-09-02T00:00:00Z",
            ),
        )
    service.close_all()
    return db_path


def _backups(db_path):
    directory = db_path.parent / "backups"
    return sorted(directory.glob("cuepoint-*.db")) if directory.is_dir() else []


@pytest.mark.unit
class TestWiring:
    def test_run_engine_backs_up_before_starting_the_server(self, monkeypatch):
        """The backup must happen before the server exists, not after."""
        calls = []

        monkeypatch.setattr(
            server, "backup_library_on_launch", lambda: calls.append("backup")
        )

        def fake_server(*_args, **_kwargs):
            calls.append("server")
            raise RuntimeError("stop here")

        monkeypatch.setattr(server, "ThreadingHTTPServer", fake_server)

        with pytest.raises(RuntimeError, match="stop here"):
            server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))

        assert calls == ["backup", "server"]

    def test_backup_runs_once_per_launch_not_per_request(self, monkeypatch):
        """Starting the engine takes exactly one backup."""
        calls = []
        monkeypatch.setattr(
            server, "backup_library_on_launch", lambda: calls.append("backup")
        )
        monkeypatch.setattr(
            server,
            "ThreadingHTTPServer",
            lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("stop here")),
        )

        with pytest.raises(RuntimeError, match="stop here"):
            server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))

        assert calls == ["backup"]


@pytest.mark.unit
class TestBehaviour:
    def test_fresh_install_creates_nothing(self, library):
        """No database yet means nothing to protect — and nothing to create."""
        server.backup_library_on_launch()

        assert not library.exists(), "launch backup created the database"
        assert _backups(library) == []

    def test_existing_database_is_backed_up_with_its_contents(self, library):
        _make_populated_database(library)

        server.backup_library_on_launch()

        backups = _backups(library)
        assert len(backups) == 1, "no launch backup was written"

        restored = sqlite3.connect(backups[0])
        try:
            rows = restored.execute("SELECT id FROM jobs").fetchall()
        finally:
            restored.close()
        assert rows == [("job-1",)], "backup does not contain the database contents"

    def test_backup_does_not_trigger_migrations(self, library, monkeypatch):
        """This is what makes the backup a *pre*-migration copy.

        Repository factories migrate on first resolve. If taking the backup
        resolved one of those, the copy would be of the already-migrated
        database — useless for recovering from a bad migration.
        """
        _make_populated_database(library)

        from cuepoint.services.migration_runner import MigrationRunner

        migrated = []
        original = MigrationRunner.migrate

        def spy(self, *args, **kwargs):
            migrated.append(True)
            return original(self, *args, **kwargs)

        monkeypatch.setattr(MigrationRunner, "migrate", spy)

        server.backup_library_on_launch()

        assert migrated == [], "launch backup applied migrations before backing up"
        assert len(_backups(library)) == 1

    def test_unchanged_database_is_not_backed_up_twice(self, library):
        _make_populated_database(library)

        server.backup_library_on_launch()
        server.backup_library_on_launch()

        assert len(_backups(library)) == 1, "backed up an unchanged database again"

    def test_a_broken_container_does_not_stop_startup(self, library, monkeypatch):
        """A backup failure must never prevent the engine from starting."""
        import cuepoint.services.bootstrap as bootstrap

        monkeypatch.setattr(
            bootstrap,
            "bootstrap_services",
            lambda: (_ for _ in ()).throw(RuntimeError("container exploded")),
        )

        # The app installs its own logging handlers, so capture at the logger
        # rather than depending on where those handlers happen to write.
        messages: list[str] = []

        class _Sink(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                messages.append(record.getMessage())

        sink = _Sink()
        logger = logging.getLogger(server.__name__)
        logger.addHandler(sink)
        try:
            server.backup_library_on_launch()  # must not raise
        finally:
            logger.removeHandler(sink)

        assert any("container exploded" in message for message in messages), (
            "a backup failure should be logged, not swallowed silently"
        )
        assert _backups(library) == []
