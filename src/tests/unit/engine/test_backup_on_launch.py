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

from cuepoint.engine import library_state as library_state_module
from cuepoint.engine import server
from tests.unit.engine.engine_start import FakeServer, run_engine_to_the_end
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
    def test_run_engine_binds_the_server_first_and_then_backs_up(
        self, library, monkeypatch
    ):
        """The port is bound first (health answers); the backup precedes the upgrade."""
        calls = []

        monkeypatch.setattr(
            server, "backup_library_on_launch", lambda: calls.append("backup")
        )
        monkeypatch.setattr(
            library_state_module,
            "compute_library_state",
            lambda: calls.append("state") or library_state_module._base(),
        )

        class Recording(FakeServer):
            def __init__(self, *a, **k):
                calls.append("server")
                super().__init__(*a, **k)

        monkeypatch.setattr(server, "ThreadingHTTPServer", Recording)
        server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))
        server._LIBRARY_START.join(30)

        assert calls == ["server", "backup", "state"]

    def test_backup_runs_once_per_launch_not_per_request(self, library, monkeypatch):
        """Starting the engine takes exactly one backup."""
        calls = []
        monkeypatch.setattr(
            server, "backup_library_on_launch", lambda: calls.append("backup")
        )
        run_engine_to_the_end(monkeypatch)

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


def _reasons(db_path):
    from cuepoint.services.backup_service import reason_of

    return [reason_of(p.name) for p in _backups(db_path)]


def _make_old_database(db_path):
    """A library one migration behind this build, as an upgrade finds it."""
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.migration_runner import MigrationRunner, _discovered

    service = DatabaseService(db_path=db_path)
    older = _discovered()[:-1]
    MigrationRunner(service, migrations=older).migrate()
    service.close_all()
    return db_path


@pytest.mark.unit
class TestPreUpgrade:
    def test_pending_migrations_give_one_pre_upgrade_copy_and_no_launch_copy(
        self, library
    ):
        _make_old_database(library)

        taken = server.backup_library_on_launch()

        assert _reasons(library) == ["pre-upgrade"]
        assert taken is not None and taken.reason == "pre-upgrade"

    def test_even_when_nothing_changed_since_the_last_backup(self, library):
        _make_old_database(library)
        # A launch copy newer than the library: "unchanged" by the old rule.
        from cuepoint.services.backup_service import BackupService
        from cuepoint.services.database_service import DatabaseService

        service = DatabaseService(db_path=library)
        BackupService(database_service=service).create_backup(reason="launch")
        service.close_all()

        server.backup_library_on_launch()

        assert sorted(_reasons(library)) == ["launch", "pre-upgrade"]

    def test_the_copy_is_the_library_before_it_migrates(self, library):
        _make_old_database(library)

        server.backup_library_on_launch()

        copy = _backups(library)[0]
        connection = sqlite3.connect(copy)
        try:
            top = connection.execute(
                "SELECT MAX(version) FROM schema_version"
            ).fetchone()
        finally:
            connection.close()
        from cuepoint.services.migration_runner import _discovered

        assert top[0] == _discovered()[-2].version

    def test_none_pending_gives_the_launch_copy_as_before(self, library):
        _make_populated_database(library)

        server.backup_library_on_launch()

        assert _reasons(library) == ["launch"]

    def test_a_library_that_has_applied_nothing_is_not_an_upgrade(self, library):
        library.touch()
        server.backup_library_on_launch()
        assert "pre-upgrade" not in _reasons(library)

    def test_the_app_version_is_written_at_every_start(self, library):
        from cuepoint.persistence.library_meta import LAST_OPENED_BY, get_meta
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IDatabaseService
        from cuepoint.utils.di_container import get_container
        from cuepoint.version import __version__

        _make_populated_database(library)
        bootstrap_services()
        get_container().resolve(IDatabaseService)

        server.record_library_opened_by()

        # Migrations run on a repository's first resolve; ask for one.
        from cuepoint.services.interfaces import IActivityService

        get_container().resolve(IActivityService)
        server.record_library_opened_by()
        assert get_meta(get_container().resolve(IDatabaseService), LAST_OPENED_BY) == (
            __version__
        )

    def test_the_pre_upgrade_copy_is_taken_even_with_backups_switched_off(
        self, library
    ):
        from cuepoint.services.backup_service import BackupService
        from cuepoint.services.database_service import DatabaseService

        class Off:
            def get(self, key):
                return False if key == "backup.enabled" else None

        _make_old_database(library)
        service = DatabaseService(db_path=library)
        try:
            taken = BackupService(
                database_service=service, config_service=Off()
            ).backup_on_launch()
        finally:
            service.close_all()

        assert taken is not None and taken.reason == "pre-upgrade"

    def test_switched_off_still_means_no_launch_copy(self, library):
        from cuepoint.services.backup_service import BackupService
        from cuepoint.services.database_service import DatabaseService

        class Off:
            def get(self, key):
                return False if key == "backup.enabled" else None

        _make_populated_database(library)
        service = DatabaseService(db_path=library)
        try:
            assert (
                BackupService(
                    database_service=service, config_service=Off()
                ).backup_on_launch()
                is None
            )
        finally:
            service.close_all()

    def test_an_older_build_keeps_the_newer_builds_version(self, library):
        from cuepoint.persistence.library_meta import (
            LAST_OPENED_BY,
            get_meta,
            record_last_opened_by,
            set_meta,
        )
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IActivityService, IDatabaseService
        from cuepoint.utils.di_container import get_container

        _make_populated_database(library)
        bootstrap_services()
        get_container().resolve(IActivityService)
        database = get_container().resolve(IDatabaseService)
        set_meta(database, LAST_OPENED_BY, "9.9.9")
        with database.transaction() as conn:
            conn.execute(
                "INSERT INTO schema_version (version, description, applied_at)"
                " VALUES (9999, 'from the future', '2030-01-01')"
            )

        assert record_last_opened_by("1.0.0") is False
        assert get_meta(database, LAST_OPENED_BY) == "9.9.9"
