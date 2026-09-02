#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The first things that write to the activity feed (DEC-029).

FOUNDATION-08 built the feed and SHELL-08 displays it, but nothing wrote to it,
so the panel read as broken rather than empty. The launch backup and every
engine start are the first two producers.

The ordering test here is the important one. Recording an event resolves the
activity service, which resolves a repository, and repository factories migrate
on first use — so recording during the backup step would turn DEC-009's
pre-migration copy into a copy of the migrated database. The existing
FOUNDATION-11 tests caught exactly that, and this pins the arrangement that
fixes it.
"""

from __future__ import annotations

import pytest

from cuepoint.engine import server
from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import reset_container


@pytest.fixture
def library(tmp_path, monkeypatch):
    """A sandboxed database path with a fresh DI container."""
    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    yield db_path
    reset_container()


def _populated(db_path):
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


def _events(event_type=None):
    from cuepoint.services.interfaces import IActivityService
    from cuepoint.utils.di_container import get_container

    return (
        get_container()
        .resolve(IActivityService)
        .recent_events(limit=50, event_type=event_type)
    )


@pytest.mark.unit
class TestRecordActivity:
    def test_records_an_event(self, library):
        from cuepoint.services.bootstrap import bootstrap_services

        bootstrap_services()
        server.record_activity("test.event", "Something happened", {"count": 1})

        events = _events("test.event")
        assert [e.summary for e in events] == ["Something happened"]
        assert events[0].detail == {"count": 1}

    def test_never_raises_when_the_feed_is_unavailable(self, library):
        # The feed records what happened; it is not a dependency of it. A
        # database that cannot be written must not stop the engine starting.
        reset_container()
        server.record_activity("test.event", "No container here")


@pytest.mark.unit
class TestEngineStart:
    def test_run_engine_records_a_start_event(self, library, monkeypatch):
        recorded = []
        monkeypatch.setattr(
            server, "record_activity", lambda *a, **k: recorded.append((a, k))
        )
        monkeypatch.setattr(server, "backup_library_on_launch", lambda: None)

        def stop_here(*_args, **_kwargs):
            raise RuntimeError("stop")

        monkeypatch.setattr(server, "ThreadingHTTPServer", stop_here)

        with pytest.raises(RuntimeError, match="stop"):
            server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))

        assert [args[0] for args, _ in recorded] == ["engine.started"]

    def test_a_real_start_lands_in_the_feed(self, library, monkeypatch):
        from cuepoint.services.bootstrap import bootstrap_services

        _populated(library)
        bootstrap_services()
        server.record_activity("engine.started", "Engine started (test)", {"port": 1})

        assert [e.type for e in _events()] == ["engine.started"]


@pytest.mark.unit
class TestBackupEvent:
    def test_records_the_backup_that_was_taken(self, library, monkeypatch):
        recorded = []
        monkeypatch.setattr(
            server, "record_activity", lambda *a, **k: recorded.append(a)
        )

        class FakeBackup:
            path = "/backups/cuepoint-20260902-launch.db"

        monkeypatch.setattr(server, "backup_library_on_launch", lambda: FakeBackup())
        monkeypatch.setattr(
            server,
            "ThreadingHTTPServer",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("stop")),
        )

        with pytest.raises(RuntimeError, match="stop"):
            server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))

        types = [args[0] for args in recorded]
        assert types == ["backup.created", "engine.started"]
        assert recorded[0][2]["file"] == "cuepoint-20260902-launch.db"

    def test_records_nothing_when_no_backup_was_needed(self, library, monkeypatch):
        # `backup_on_launch` returns None when the database has not changed, and
        # a skipped backup is not news.
        recorded = []
        monkeypatch.setattr(
            server, "record_activity", lambda *a, **k: recorded.append(a)
        )
        monkeypatch.setattr(server, "backup_library_on_launch", lambda: None)
        monkeypatch.setattr(
            server,
            "ThreadingHTTPServer",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("stop")),
        )

        with pytest.raises(RuntimeError, match="stop"):
            server.run_engine(server.EngineConfig(host="127.0.0.1", port=8123))

        assert [args[0] for args in recorded] == ["engine.started"]


@pytest.mark.unit
class TestOrderingIsPreserved:
    def test_taking_the_backup_still_does_not_migrate(self, library, monkeypatch):
        """The FOUNDATION-11 guarantee, re-pinned against DEC-029.

        A first attempt recorded the backup event inside
        ``backup_library_on_launch``. Resolving the activity service resolved a
        repository, repository factories migrate on first use, and the launch
        backup silently became a copy of the *migrated* database — the one state
        it exists to protect against.
        """
        _populated(library)

        from cuepoint.services.migration_runner import MigrationRunner

        migrated = []
        original = MigrationRunner.migrate
        monkeypatch.setattr(
            MigrationRunner,
            "migrate",
            lambda self, *a, **k: (migrated.append(1), original(self, *a, **k))[1],
        )

        server.backup_library_on_launch()

        assert migrated == []
