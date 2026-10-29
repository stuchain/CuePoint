#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The library's state at start, served from ``/api/v1/status`` (HARDEN-03).

Each state comes from a real fixture: a file of noise or a truncated one, a
schema version above head, a migration made to fail, a disk with no room. The
state is worked out once and served from the status route, never from
``/health``; the engine answers when the library cannot open.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from collections import namedtuple

import pytest

from cuepoint.engine import library_state
from cuepoint.engine.server import EngineConfig, start_engine_thread
from cuepoint.exceptions.cuepoint_exceptions import DatabaseError
from cuepoint.persistence.library_meta import LAST_OPENED_BY, set_meta
from cuepoint.services import backup_service
from cuepoint.services import database_service as database_service_module
from cuepoint.services.backup_service import (
    PRE_UPGRADE_REASON,
    BackupService,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner, _discovered
from cuepoint.utils.di_container import reset_container
from tests.unit.engine.test_engine_library_browse import _free_port

pytestmark = pytest.mark.unit

TOKEN = "library-state-token"
_Usage = namedtuple("_Usage", "total used free")
MB = 1024 * 1024


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def library(tmp_path, monkeypatch):
    """A sandboxed library path with a fresh container; the file is not made."""
    from cuepoint.services.bootstrap import bootstrap_services

    path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(database_service_module, "default_database_path", lambda: path)
    monkeypatch.delenv(library_state.UNCLEAN_EXIT_ENV, raising=False)
    reset_container()
    bootstrap_services()
    yield path
    _close_backup_databases()
    reset_container()


def make_library(path, *, behind: int = 0, opened_by: str = "1.0.0") -> None:
    """A migrated library; ``behind`` is how many migrations it has not applied."""
    service = DatabaseService(db_path=path)
    migrations = _discovered()
    MigrationRunner(
        service, migrations=migrations[: len(migrations) - behind]
    ).migrate()
    if not behind:  # the table is made by the newest migration
        set_meta(service, LAST_OPENED_BY, opened_by)
    with service.transaction() as connection:
        connection.execute(
            "INSERT INTO jobs (id, type, state, created_at, updated_at)"
            " VALUES ('j1', 'match', 'completed', 'x', 'x')"
        )
    service.close_all()


def state_now() -> dict:
    """The state once it is worked out and its way back is looked up."""
    deadline = time.monotonic() + 20
    state = library_state.get_library_state()
    while state["state"] == "upgrading" and time.monotonic() < deadline:
        time.sleep(0.02)
        state = library_state.get_library_state()
    library_state.settle()
    return library_state.get_library_state()


def recompute_now() -> dict:
    first = library_state.recompute()
    assert first["state"] == "upgrading"
    return state_now()


_BACKUP_DATABASES: list = []


def backups_of(path) -> BackupService:
    database = DatabaseService(db_path=path)
    _BACKUP_DATABASES.append(database)
    return BackupService(database_service=database)


def _close_backup_databases() -> None:
    """Close what ``backups_of`` opened. On Windows an open connection keeps the
    library and its -wal locked, so a file cannot be overwritten or removed."""
    while _BACKUP_DATABASES:
        _BACKUP_DATABASES.pop().close_all()


def noise(path) -> None:
    _close_backup_databases()
    for suffix in ("-wal", "-shm"):
        path.with_name(path.name + suffix).unlink(missing_ok=True)
    path.write_bytes(os.urandom(8192))


def low_disk(monkeypatch, free: int = 1 * MB) -> None:
    monkeypatch.setattr(
        backup_service.shutil, "disk_usage", lambda _p: _Usage(10**12, 10**12, free)
    )


def call(base, method, path, token=TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = urllib.request.Request(
        base + path,
        data=b"{}" if method == "POST" else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


@pytest.fixture
def engine(library):
    port = _free_port()
    server, thread = start_engine_thread(EngineConfig("127.0.0.1", port, TOKEN))
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=2)


def state_of(base) -> dict:
    deadline = time.monotonic() + 20
    while True:
        status, body = call(base, "GET", "/api/v1/status")
        assert status == 200, body
        if body["library"]["state"] != "upgrading" or time.monotonic() > deadline:
            break
        time.sleep(0.02)
    library_state.settle()
    return call(base, "GET", "/api/v1/status")[1]["library"]


# ---------------------------------------------------------------------------
# Each state
# ---------------------------------------------------------------------------


class TestStates:
    def test_a_library_that_is_fine_is_ok(self, library):
        make_library(library, opened_by="1.0.0")
        state = state_now()
        head = _discovered()[-1].version
        assert state["state"] == "ok"
        assert state["appVersion"]
        assert state["libraryVersion"] == "1.0.0"
        assert state["schemaVersion"] == state["headVersion"] == head
        assert state["newestGoodBackup"] is None
        assert state["preUpgradeBackup"] is None
        assert state["requiredFreeBytes"] is None
        assert state["uncleanExit"] is False

    def test_no_library_yet_is_ok(self, library):
        assert state_now()["state"] == "ok"
        assert not library.exists(), "working out the state created the library"

    def test_the_unclean_exit_flag_is_echoed(self, library, monkeypatch):
        monkeypatch.setenv(library_state.UNCLEAN_EXIT_ENV, "1")
        assert state_now()["uncleanExit"] is True

    def test_the_unclean_exit_argument_is_the_same_flag(self, library, monkeypatch):
        monkeypatch.setattr("sys.argv", ["engine", "--unclean-exit"])
        assert state_now()["uncleanExit"] is True

    @pytest.mark.parametrize("damage", ["noise", "truncated"])
    def test_a_file_that_cannot_be_read_is_damaged(self, library, damage):
        make_library(library)
        if damage == "noise":
            noise(library)
        else:
            for suffix in ("-wal", "-shm"):
                library.with_name(library.name + suffix).unlink(missing_ok=True)
            with open(library, "r+b") as handle:
                handle.truncate(100)
        state = state_now()
        assert state["state"] == "damaged"
        assert state["schemaVersion"] is None

    def test_the_newest_good_backup_is_chosen_past_a_bad_one(self, library):
        make_library(library)
        service = backups_of(library)
        oldest = service.create_backup(reason="manual")
        middle = service.create_backup(reason="launch")
        newest = service.create_backup(reason="manual")
        now = time.time()
        for age, info in ((300, oldest), (200, middle), (100, newest)):
            os.utime(info.path, (now - age, now - age))
        # The newest copy has been damaged since it was made.
        newest.path.write_bytes(os.urandom(4096))
        noise(library)

        state = state_now()
        assert state["state"] == "damaged"
        assert state["newestGoodBackup"] == {
            "name": middle.name,
            "createdAt": state["newestGoodBackup"]["createdAt"],
            "reason": "launch",
        }

    def test_with_no_good_backup_there_is_none_to_name(self, library):
        make_library(library)
        noise(library)
        assert state_now()["newestGoodBackup"] is None

    def test_a_version_above_head_is_too_new(self, library):
        make_library(library, opened_by="9.9.9")
        head = _discovered()[-1].version
        connection = sqlite3.connect(str(library))
        connection.execute(
            "INSERT INTO schema_version (version, description, applied_at)"
            " VALUES (?, 'from a newer build', 'x')",
            (head + 5,),
        )
        connection.commit()
        connection.close()
        backups_of(library).create_backup(reason="manual")

        state = state_now()
        assert state["state"] == "too_new"
        assert state["libraryVersion"] == "9.9.9"
        assert state["schemaVersion"] == head + 5
        assert state["headVersion"] == head
        assert state["newestGoodBackup"]["reason"] == "manual"

    def test_a_migration_that_fails_is_upgrade_failed(self, library, monkeypatch):
        make_library(library, behind=1)
        last = _discovered()[-1].version
        real = MigrationRunner._apply

        def failing(self, migration):
            if migration.version == last:
                raise DatabaseError(
                    message="made to fail",
                    error_code="DB_MIGRATION_FAILED",
                    context={"migration_version": last},
                )
            return real(self, migration)

        monkeypatch.setattr(MigrationRunner, "_apply", failing)
        state = state_now()
        assert state["state"] == "upgrade_failed"
        assert state["failedMigration"] == last
        copy = state["preUpgradeBackup"]
        assert copy["reason"] == PRE_UPGRADE_REASON
        assert (library.parent / "backups" / copy["name"]).is_file()
        assert copy["toVersion"] == library_state.__version__
        # Nothing half-applied, and the next request does not try it again.
        assert state["schemaVersion"] == last - 1
        with pytest.raises(DatabaseError) as blocked:
            MigrationRunner(DatabaseService(db_path=library)).migrate()
        assert blocked.value.error_code == "DB_MIGRATION_BLOCKED"

    def test_try_again_retries_the_upgrade(self, library, monkeypatch):
        make_library(library, behind=1)
        last = _discovered()[-1].version
        real = MigrationRunner._apply
        monkeypatch.setattr(
            MigrationRunner,
            "_apply",
            lambda self, m: (_ for _ in ()).throw(
                DatabaseError(
                    message="made to fail",
                    error_code="DB_MIGRATION_FAILED",
                    context={"migration_version": last},
                )
            ),
        )
        assert state_now()["state"] == "upgrade_failed"
        monkeypatch.setattr(MigrationRunner, "_apply", real)

        after = recompute_now()
        assert after["state"] == "ok"
        assert after["schemaVersion"] == last
        # The copy from before the first attempt was reused, not added to.
        copies = [
            b
            for b in backups_of(library).list_backups()
            if b.reason == PRE_UPGRADE_REASON
        ]
        assert len(copies) == 1

    def test_no_room_for_the_copy_means_the_upgrade_does_not_run(
        self, library, monkeypatch
    ):
        make_library(library, behind=1)
        last = _discovered()[-1].version
        low_disk(monkeypatch, free=1 * MB)
        state = state_now()
        assert state["state"] == "needs_space"
        needed = state["requiredFreeBytes"]
        assert needed % MB == 0 and needed >= 50 * MB
        # No copy was made, and the migrations did not run, now or on a request.
        assert backups_of(library).list_backups() == []
        with pytest.raises(DatabaseError) as blocked:
            MigrationRunner(DatabaseService(db_path=library)).migrate()
        assert blocked.value.error_code == "DB_NEEDS_SPACE"
        connection = sqlite3.connect(str(library))
        assert (
            connection.execute("SELECT max(version) FROM schema_version").fetchone()[0]
            == last - 1
        )
        connection.close()

        # Room again, and "Try again" takes the copy and upgrades.
        monkeypatch.undo()
        again = recompute_now()
        assert again["state"] == "ok"
        assert again["schemaVersion"] == last
        assert len(backups_of(library).list_backups()) == 1


# ---------------------------------------------------------------------------
# Computed once, served from /status
# ---------------------------------------------------------------------------


class TestServing:
    def _count_computes(self, monkeypatch) -> list:
        calls: list = []
        real = library_state.compute_library_state

        def counting():
            calls.append(1)
            return real()

        monkeypatch.setattr(library_state, "compute_library_state", counting)
        return calls

    def test_computed_once_across_several_status_calls(
        self, library, engine, monkeypatch
    ):
        make_library(library)
        calls = self._count_computes(monkeypatch)
        for _ in range(4):
            assert state_of(engine)["state"] == "ok"
        assert len(calls) == 1

    def test_health_never_computes_and_never_carries_it(
        self, library, engine, monkeypatch
    ):
        make_library(library)
        calls = self._count_computes(monkeypatch)
        for _ in range(3):
            status, body = call(engine, "GET", "/health", token=None)
            assert status == 200
            assert "library" not in body
        assert calls == []

    def test_status_keeps_its_fields_and_stays_authenticated(self, library, engine):
        make_library(library)
        status, body = call(engine, "GET", "/api/v1/status", token=None)
        assert status == 401 and "library" not in body
        _, body = call(engine, "GET", "/api/v1/status")
        assert body["ready"] is True and body["status"] == "ok" and body["version"]

    def test_recheck_computes_again(self, library, engine, monkeypatch):
        make_library(library)
        calls = self._count_computes(monkeypatch)
        state_of(engine)
        status, body = call(engine, "POST", "/api/v1/library/recheck")
        assert status == 202 and body["library"]["state"] == "upgrading"
        state_now()
        assert len(calls) == 2
        state_of(engine)
        assert len(calls) == 2

    def test_recheck_needs_the_token(self, library, engine):
        assert call(engine, "POST", "/api/v1/library/recheck", token=None)[0] == 401
        assert (
            call(engine, "POST", "/api/v1/library/integrity-check", token=None)[0]
            == 401
        )

    def test_the_engine_answers_status_when_the_library_cannot_open(
        self, library, engine
    ):
        make_library(library)
        noise(library)
        state = state_of(engine)
        assert state["state"] == "damaged"
        # A request that needs the library says so in words, not as a generic failure.
        status, body = call(engine, "GET", "/api/v1/library/playlists")
        assert status == 503, body

    def test_a_library_that_is_too_new_still_answers(self, library, engine):
        make_library(library)
        connection = sqlite3.connect(str(library))
        connection.execute(
            "INSERT INTO schema_version (version, description, applied_at)"
            " VALUES (9999, 'newer', 'x')"
        )
        connection.commit()
        connection.close()
        assert state_of(engine)["state"] == "too_new"
        assert call(engine, "GET", "/api/v1/library/playlists")[0] == 503

    def test_a_failed_upgrade_answers_requests_without_a_server_error(
        self, library, engine, monkeypatch
    ):
        make_library(library, behind=1)
        monkeypatch.setattr(
            MigrationRunner,
            "_apply",
            lambda self, m: (_ for _ in ()).throw(
                DatabaseError(
                    message="made to fail",
                    error_code="DB_MIGRATION_FAILED",
                    context={"migration_version": m.version},
                )
            ),
        )
        assert state_of(engine)["state"] == "upgrade_failed"
        assert call(engine, "GET", "/api/v1/library/playlists")[0] == 503

    def test_launch_backup_skipped_for_room_is_in_the_status(
        self, library, engine, monkeypatch
    ):
        make_library(library)
        low_disk(monkeypatch)
        assert backups_of(library).backup_on_launch() is None
        skipped = state_of(engine)["launchBackupSkipped"]
        assert (
            skipped["reason"] == "low_space" and skipped["requiredFreeBytes"] >= 50 * MB
        )


# ---------------------------------------------------------------------------
# The integrity check
# ---------------------------------------------------------------------------


def wait_for(base, wanted, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        check = state_of(base)["integrityCheck"]
        if check["state"] == wanted:
            return check
        time.sleep(0.05)
    raise AssertionError(f"the check never reached {wanted}: {state_of(base)}")


class TestIntegrityCheck:
    def test_idle_until_asked(self, library, engine):
        make_library(library)
        assert state_of(engine)["integrityCheck"] == {
            "state": "idle",
            "finishedAt": None,
        }

    def test_a_good_library_passes_and_stays_ok(self, library, engine):
        make_library(library)
        status, body = call(engine, "POST", "/api/v1/library/integrity-check")
        assert status == 202 and body["integrityCheck"]["state"] in ("running", "ok")
        check = wait_for(engine, "ok")
        assert check["finishedAt"]
        assert state_of(engine)["state"] == "ok"

    def test_a_failing_check_marks_the_library_damaged_and_is_reported_once(
        self, library, engine, monkeypatch
    ):
        make_library(library)
        backups_of(library).create_backup(reason="manual")
        reports: list = []
        from cuepoint.reporting import engine_reporting

        monkeypatch.setattr(
            engine_reporting,
            "report_unexpected",
            lambda exc, **kw: reports.append((str(exc), kw)),
        )
        started = threading.Event()

        def failing(_path):
            started.set()
            return False

        monkeypatch.setattr(library_state, "_quick_check", failing)
        call(engine, "POST", "/api/v1/library/integrity-check")
        wait_for(engine, "failed")
        state = state_of(engine)
        assert state["state"] == "damaged"
        assert state["newestGoodBackup"]["reason"] == "manual"
        library_state.report_current()
        library_state.report_current()
        assert len(reports) == 1
        assert "app " in reports[0][0] and "library 1.0.0" in reports[0][0]

    def test_the_library_stays_usable_while_it_runs(self, library, engine, monkeypatch):
        make_library(library)
        release = threading.Event()
        monkeypatch.setattr(
            library_state, "_quick_check", lambda _p: release.wait(10) or True
        )
        call(engine, "POST", "/api/v1/library/integrity-check")
        assert state_of(engine)["integrityCheck"]["state"] == "running"
        status, _ = call(engine, "GET", "/api/v1/library/playlists")
        assert status == 200
        # Asking again while it runs starts nothing new.
        assert (
            call(engine, "POST", "/api/v1/library/integrity-check")[1][
                "integrityCheck"
            ]["state"]
            == "running"
        )
        release.set()
        wait_for(engine, "ok")


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


class TestReporting:
    @pytest.fixture
    def reports(self, monkeypatch):
        out: list = []
        from cuepoint.reporting import engine_reporting

        monkeypatch.setattr(
            engine_reporting,
            "report_unexpected",
            lambda exc, **kw: out.append((str(exc), kw)),
        )
        return out

    def test_damaged_is_reported_once_with_versions(self, library, reports):
        make_library(library, opened_by="1.0.0")
        noise(library)
        state_now()
        library_state.report_current()
        library_state.report_current()
        recompute_now()
        assert len(reports) == 1
        message, kw = reports[0]
        assert (
            library_state.__version__ in message
            and kw["error_code"] == "LIBRARY_DAMAGED"
        )

    def test_upgrade_failed_is_reported_with_versions(
        self, library, reports, monkeypatch
    ):
        make_library(library, behind=1)
        monkeypatch.setattr(
            MigrationRunner,
            "_apply",
            lambda self, m: (_ for _ in ()).throw(
                DatabaseError(
                    message="made to fail",
                    error_code="DB_MIGRATION_FAILED",
                    context={"migration_version": m.version},
                )
            ),
        )
        state_now()
        library_state.report_current()
        assert [kw["error_code"] for _, kw in reports] == ["LIBRARY_UPGRADE_FAILED"]
        assert f"step {_discovered()[-1].version}" in reports[0][0]

    def test_too_new_and_a_full_disk_are_not_reported(
        self, library, reports, monkeypatch
    ):
        make_library(library)
        connection = sqlite3.connect(str(library))
        connection.execute(
            "INSERT INTO schema_version (version, description, applied_at)"
            " VALUES (9999, 'newer', 'x')"
        )
        connection.commit()
        connection.close()
        state_now()
        library_state.report_current()
        assert reports == []
        from cuepoint.reporting.expected import is_expected_failure
        from cuepoint.services import library_errors

        assert is_expected_failure("INTERNAL_ERROR", library_errors.disk_full_error())
        assert is_expected_failure("DB_SCHEMA_TOO_NEW")


def test_a_failure_the_state_speaks_for_is_answered_in_words():
    from cuepoint.services import library_errors

    status, body = library_state.status_for(library_errors.disk_full_error())
    assert status == 507
    assert body["error"] == {
        "code": "R002",
        "message": library_errors.DISK_FULL_MESSAGE,
    }
    status, body = library_state.status_for(
        DatabaseError(message="x", error_code="DB_MIGRATION_BLOCKED")
    )
    assert (status, body["error"]["code"]) == (503, "DB_MIGRATION_BLOCKED")
    assert library_state.status_for(ValueError("not ours")) is None
    # A full disk elsewhere (an export's destination) keeps its own answer.
    assert library_state.status_for(OSError(28, "No space left on device")) is None


def test_words_a_person_reads_never_say_database(library):
    from cuepoint.services import library_errors

    for text in (
        library_errors.DISK_FULL_MESSAGE,
        *library_state._LIBRARY_MESSAGES.values(),
    ):
        lowered = text.lower()
        assert (
            "database" not in lowered
            and "schema" not in lowered
            and "engine" not in lowered
        )


# ---------------------------------------------------------------------------
# Starting without holding anything up
# ---------------------------------------------------------------------------


class TestUpgrading:
    def test_status_answers_upgrading_while_the_upgrade_runs_and_only_it_may_migrate(
        self, library, engine, monkeypatch
    ):
        make_library(library, behind=1)
        entered, release = threading.Event(), threading.Event()
        real = BackupService.ensure_pre_upgrade

        def slow(self, *args, **kwargs):
            entered.set()
            release.wait(20)
            return real(self, *args, **kwargs)

        monkeypatch.setattr(BackupService, "ensure_pre_upgrade", slow)
        library_state.begin()
        worker = threading.Thread(target=library_state.run_compute, daemon=True)
        worker.start()
        assert entered.wait(10)
        started = time.monotonic()
        status, body = call(engine, "GET", "/api/v1/status")
        assert status == 200 and body["library"]["state"] == "upgrading"
        assert time.monotonic() - started < 2
        # A request thread that resolves a repository meanwhile cannot migrate.
        with pytest.raises(DatabaseError) as held:
            MigrationRunner(DatabaseService(db_path=library)).migrate()
        assert held.value.error_code == "DB_UPGRADING"
        assert call(engine, "GET", "/api/v1/library/playlists")[0] == 503
        release.set()
        worker.join(20)
        assert state_of(engine)["state"] == "ok"
        MigrationRunner(DatabaseService(db_path=library)).migrate()

    def test_a_recheck_holds_requests_off_the_migrations_too(
        self, library, engine, monkeypatch
    ):
        make_library(library, behind=1)
        low_disk(monkeypatch)
        assert state_now()["state"] == "needs_space"
        monkeypatch.undo()
        entered, release = threading.Event(), threading.Event()
        real = BackupService.ensure_pre_upgrade

        def slow(self, *args, **kwargs):
            entered.set()
            release.wait(20)
            return real(self, *args, **kwargs)

        monkeypatch.setattr(BackupService, "ensure_pre_upgrade", slow)
        status, body = call(engine, "POST", "/api/v1/library/recheck")
        assert status == 202
        assert entered.wait(10)
        assert (
            call(engine, "GET", "/api/v1/status")[1]["library"]["state"] == "upgrading"
        )
        with pytest.raises(DatabaseError) as held:
            MigrationRunner(DatabaseService(db_path=library)).migrate()
        assert held.value.error_code == "DB_UPGRADING"
        release.set()
        assert state_of(engine)["state"] == "ok"

    def test_the_block_belongs_to_the_library_file(self, tmp_path):
        from cuepoint.services import library_errors

        library_errors.block_migrations(
            DatabaseError(message="x", error_code="DB_UPGRADING"), tmp_path / "a.db"
        )
        library_errors.check_migrations_allowed(tmp_path / "b.db")
        with pytest.raises(DatabaseError):
            library_errors.check_migrations_allowed(tmp_path / "a.db")
        with library_errors.allow_migrations():
            library_errors.check_migrations_allowed(tmp_path / "a.db")

    def test_the_way_back_is_looked_up_off_the_computing_thread(
        self, library, monkeypatch
    ):
        make_library(library)
        noise(library)
        release = threading.Event()
        real = library_state._newest_good_backup
        monkeypatch.setattr(
            library_state, "_newest_good_backup", lambda: release.wait(10) and real()
        )
        began = time.monotonic()
        state = library_state.get_library_state()
        assert state["state"] == "damaged" and state["newestGoodBackup"] is None
        assert time.monotonic() - began < 5
        release.set()
        library_state.settle()

    def test_a_full_disk_during_a_migration_is_needs_space_and_not_reported(
        self, library, monkeypatch
    ):
        from cuepoint.reporting import engine_reporting
        from cuepoint.services import library_errors

        make_library(library, behind=1)
        reports: list = []
        monkeypatch.setattr(
            engine_reporting, "report_unexpected", lambda *a, **k: reports.append(a)
        )
        monkeypatch.setattr(
            MigrationRunner,
            "_apply",
            lambda self, m: (_ for _ in ()).throw(library_errors.disk_full_error()),
        )
        state = state_now()
        assert state["state"] == "needs_space" and state["requiredFreeBytes"] >= 50 * MB
        library_state.report_current()
        assert reports == []
        with pytest.raises(DatabaseError) as held:
            MigrationRunner(DatabaseService(db_path=library)).migrate()
        assert held.value.error_code == "DB_NEEDS_SPACE"

    def test_unreadable_while_ok_and_not_damage_is_not_the_states_to_answer(
        self, library
    ):
        make_library(library)
        assert state_now()["state"] == "ok"
        cause = PermissionError("denied")
        error = DatabaseError(message="x", error_code="DB_UNREADABLE")
        error.__cause__ = cause
        assert library_state.status_for(error) is None
        assert library_state.current_state_name() == "ok"
        # The same code from damage turns the state and is answered.
        error.__cause__ = sqlite3.DatabaseError("file is not a database")
        status, _ = library_state.status_for(error)
        assert status == 503 and library_state.current_state_name() == "damaged"
        library_state.settle()

    def test_the_failed_codes_are_not_expected_but_the_waiting_ones_are(self):
        from cuepoint.reporting.expected import is_expected_failure

        for code in (
            "R002",
            "DB_NEEDS_SPACE",
            "DB_MIGRATION_BLOCKED",
            "BACKUP_NEEDS_SPACE",
            "DB_UPGRADING",
        ):
            assert is_expected_failure(code), code
            assert is_expected_failure(
                None, DatabaseError(message="x", error_code=code)
            )
        for code in ("DB_UNREADABLE", "DB_MIGRATION_FAILED"):
            assert not is_expected_failure(code)
            assert not is_expected_failure(
                None, DatabaseError(message="x", error_code=code)
            )

    def test_a_recheck_forgets_the_last_integrity_check(self, library):
        make_library(library)
        state_now()
        library_state._integrity.update(state="failed", finishedAt="x")
        recompute_now()
        assert library_state.library_json()["integrityCheck"] == {
            "state": "idle",
            "finishedAt": None,
        }

    def test_the_integrity_check_opens_the_library_read_only(self, library):
        make_library(library)
        before = library.stat().st_mtime_ns
        assert library_state._quick_check(library) is True
        assert library.stat().st_mtime_ns == before
