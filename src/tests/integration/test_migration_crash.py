#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A process killed halfway through an upgrade leaves a library that resumes (HARDEN-02).

Two kills, each of a real child process (SIGKILL on POSIX, TerminateProcess on
Windows: nothing runs in the child after it):

1. **In the middle of a migration.** The child runs the runner over a library a
   few versions behind, plus one extra migration that writes some rows and then
   pauses at a marker. The parent waits for the marker, kills the child, and
   starts a fresh runner: the migrations before the killed one are applied, the
   killed one is not (its rows and its change to existing data are gone), and
   applying it now gives the same library as if it had never been interrupted.
2. **In the middle of the pre-upgrade backup.** The child takes the engine's
   launch backup of a library one version behind and pauses with the copy
   written but not yet finished. The half-made ``.partial`` file is not listed
   as a backup, the library has not been migrated, and the next start removes
   the file (``sweep_partials``) and takes its own copy.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
import time
from pathlib import Path
from typing import List

import pytest

import cuepoint
from cuepoint.migrations import Migration
from cuepoint.services import database_service as database_service_module
from cuepoint.services.backup_service import (
    PARTIAL_SUFFIX,
    PRE_UPGRADE_REASON,
    BackupService,
    reason_of,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.utils.di_container import reset_container
from tests.fixtures import schema_ladder as ladder

pytestmark = pytest.mark.integration

HEAD = ladder.head_version()
#: Where the killed library starts: two real migrations still to apply, so the
#: kill leaves "earlier migrations applied" for the fresh runner to find.
START = HEAD - 2

WAIT_SECONDS = 60.0

EXTRA_VERSION = HEAD + 1
EXTRA_SQL = """
CREATE TABLE crash_probe (id INTEGER PRIMARY KEY, note TEXT NOT NULL);
INSERT INTO crash_probe (note) VALUES ('before the pause');
UPDATE tags SET name = name || '!' WHERE id = 1;
SELECT hold_here();
INSERT INTO crash_probe (note) VALUES ('after the pause');
"""

SRC_DIR = Path(cuepoint.__file__).resolve().parents[1]

_CHILD_MIGRATION = textwrap.dedent(
    """
    import json, sys, time
    from pathlib import Path

    import os

    def write_marker(path, text):
        # Whole or absent: the parent never reads half a marker.
        temp = path.with_name(path.name + ".tmp")
        temp.write_text(text, encoding="utf-8")
        os.replace(temp, path)
    from cuepoint.migrations import Migration
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.services.migration_runner import MigrationRunner, _discovered

    db_path, marker, extra = sys.argv[1], Path(sys.argv[2]), json.loads(sys.argv[3])
    service = DatabaseService(db_path=db_path)

    def hold_here():
        write_marker(marker, "held")
        time.sleep(300)  # the parent kills this process long before it ends
        return 1

    service.connect().create_function("hold_here", 0, hold_here)
    migrations = list(_discovered()) + [Migration(**extra)]
    MigrationRunner(service, migrations=migrations).migrate()
    write_marker(marker, "finished: the kill never came")
    """
)

_CHILD_BACKUP = textwrap.dedent(
    """
    import sys, time
    from pathlib import Path

    import os

    def write_marker(path, text):
        # Whole or absent: the parent never reads half a marker.
        temp = path.with_name(path.name + ".tmp")
        temp.write_text(text, encoding="utf-8")
        os.replace(temp, path)

    db_path, marker, mode = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]

    from cuepoint.services import database_service as database_service_module
    from cuepoint.services.backup_service import BackupService
    from cuepoint.services.database_service import DatabaseService
    from cuepoint.utils.di_container import reset_container

    database_service_module.default_database_path = lambda: db_path
    reset_container()

    if mode == "after-copy":
        def hold_before_the_copy_is_finished(self, backup_path):
            # The copy is all written into its hidden .partial; not yet a backup.
            write_marker(marker, str(backup_path))
            time.sleep(300)

        BackupService.verify_backup = hold_before_the_copy_is_finished
    else:
        class PagedConnection:
            # Copies one page at a time and stops after the first.

            def __init__(self, real):
                self._real = real

            def __getattr__(self, name):
                return getattr(self._real, name)

            def backup(self, target, **_kwargs):
                def progress(status, remaining, total):
                    if remaining > 0:
                        row = target.execute("PRAGMA database_list").fetchone()
                        write_marker(marker, row[2])
                        time.sleep(300)

                self._real.backup(target, pages=1, progress=progress)

        real_connect = DatabaseService.connect

        def connect(self):
            return PagedConnection(real_connect(self))

        DatabaseService.connect = connect

    from cuepoint.engine import server

    server.backup_library_on_launch()
    write_marker(marker, "finished: the kill never came")
    """
)


def _extra_migration() -> Migration:
    return Migration(
        version=EXTRA_VERSION,
        description="crash probe",
        sql=EXTRA_SQL,
        module_name=f"m{EXTRA_VERSION:04d}_crash_probe",
    )


def _spawn(script: str, tmp_path: Path, *args: str) -> subprocess.Popen:
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join(
        [str(SRC_DIR)] + ([env["PYTHONPATH"]] if env.get("PYTHONPATH") else [])
    )
    env["CUEPOINT_HOME"] = str(tmp_path / "home")
    path = tmp_path / "child.py"
    path.write_text(script, encoding="utf-8")
    # A log file, not pipes: nothing reads a pipe while the child sleeps, and a
    # full one would block the child before it reached its marker.
    log = tmp_path / "child.log"
    handle = log.open("wb")
    proc = subprocess.Popen(
        [sys.executable, str(path), *args],
        env=env,
        cwd=str(tmp_path),
        stdout=handle,
        stderr=subprocess.STDOUT,
    )
    proc.log_path = log  # type: ignore[attr-defined]
    proc.log_handle = handle  # type: ignore[attr-defined]
    return proc


def _log_of(proc: subprocess.Popen) -> str:
    try:
        return proc.log_path.read_text(encoding="utf-8", errors="replace")[-3000:]  # type: ignore[attr-defined]
    except OSError:
        return "(no log)"


def _kill_at(proc: subprocess.Popen, marker: Path) -> str:
    """Wait for the child to reach its marker, then kill it. Returns the marker text."""
    deadline = time.monotonic() + WAIT_SECONDS
    try:
        while time.monotonic() < deadline:
            # The child replaces the marker into place whole; empty means not yet.
            text = marker.read_text(encoding="utf-8") if marker.exists() else ""
            if text:
                assert not text.startswith("finished"), (
                    f"the child ran to the end instead of pausing: {text}\n"
                    f"{_log_of(proc)}"
                )
                proc.kill()
                proc.wait(timeout=30)
                return text
            if proc.poll() is not None:
                raise AssertionError(
                    f"the child exited ({proc.returncode}) before its marker:\n"
                    f"{_log_of(proc)}"
                )
            time.sleep(0.05)
        raise AssertionError(f"the child never reached its marker:\n{_log_of(proc)}")
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=30)
        proc.log_handle.close()  # type: ignore[attr-defined]


# ------------------------------------------------------ killed in a migration


class TestKilledInTheMiddleOfAMigration:
    @pytest.fixture
    def killed(self, tmp_path):
        """A library whose upgrade was killed inside the extra migration."""
        built = ladder.build_library_at(START, directory=tmp_path / "lib")
        before = ladder.snapshot_of(built)
        marker = tmp_path / "marker"
        extra = _extra_migration()
        proc = _spawn(
            _CHILD_MIGRATION,
            tmp_path,
            str(built),
            str(marker),
            json.dumps(
                {
                    "version": extra.version,
                    "description": extra.description,
                    "sql": extra.sql,
                    "module_name": extra.module_name,
                }
            ),
        )
        _kill_at(proc, marker)
        assert proc.returncode != 0
        return built, before

    def _fresh_runner(self, path: Path):
        service = DatabaseService(db_path=path)
        service.connect().create_function("hold_here", 0, lambda: 1)
        migrations: List[Migration] = ladder.all_migrations() + [_extra_migration()]
        return service, MigrationRunner(service, migrations=migrations)

    def test_the_earlier_migrations_are_applied_and_the_killed_one_is_not(self, killed):
        path, before = killed
        service, runner = self._fresh_runner(path)
        try:
            conn = service.connect()
            versions = [
                r[0] for r in conn.execute("SELECT version FROM schema_version")
            ]
            assert sorted(versions) == list(range(1, HEAD + 1)), (
                "the real migrations before the killed one should be applied"
            )
            assert [m.version for m in runner.pending_migrations()] == [EXTRA_VERSION]
            tables = ladder.table_names(conn)
            assert "crash_probe" not in tables, "the killed migration left a table"
            assert [tuple(r) for r in conn.execute("PRAGMA integrity_check")] == [
                ("ok",)
            ]
            assert [tuple(r) for r in conn.execute("PRAGMA foreign_key_check")] == []
            name = conn.execute("SELECT name FROM tags WHERE id = 1").fetchone()[0]
            assert not name.endswith("!"), "the killed migration changed a row"
        finally:
            service.close_all()
        # Everything the library held at the start is still there, though the
        # two real migrations after it ran in the child.
        service, _runner = self._fresh_runner(path)
        try:
            ladder.assert_nothing_lost(service.connect(), before, "after the kill")
        finally:
            service.close_all()

    def test_a_fresh_runner_applies_it_and_the_data_checks_pass(self, killed):
        path, before = killed
        service, runner = self._fresh_runner(path)
        try:
            applied = runner.migrate()
            assert [m.version for m in applied] == [EXTRA_VERSION]

            conn = service.connect()
            ladder.assert_sound(conn, EXTRA_VERSION)
            notes = [
                r[0] for r in conn.execute("SELECT note FROM crash_probe ORDER BY id")
            ]
            assert notes == ["before the pause", "after the pause"], (
                "the migration should run once, whole"
            )
            name = conn.execute("SELECT name FROM tags WHERE id = 1").fetchone()[0]
            assert name.endswith("!") and not name.endswith("!!"), name

            # Nothing else changed: compare everything but the one row it edits.
            trimmed = {
                table: {
                    "columns": data["columns"],
                    "rows": [
                        r
                        for r in data["rows"]
                        if not (table == "tags" and r["id"] == 1)
                    ],
                }
                for table, data in before.items()
            }
            ladder.assert_nothing_lost(conn, trimmed, "resumed upgrade")
            assert runner.migrate() == []
        finally:
            service.close_all()


# ------------------------------------------------ killed during the backup


@pytest.mark.parametrize(
    "mode", ["after-copy", "mid-copy"], ids=["copy-written", "copy-truncated"]
)
class TestKilledDuringThePreUpgradeBackup:
    @pytest.fixture
    def killed(self, tmp_path, mode):
        library = ladder.build_library_at(HEAD - 1, directory=tmp_path / "lib")
        before = ladder.snapshot_of(library)
        marker = tmp_path / "marker"
        proc = _spawn(_CHILD_BACKUP, tmp_path, str(library), str(marker), mode)
        partial_path = Path(_kill_at(proc, marker))
        assert proc.returncode != 0
        if mode == "mid-copy":
            assert partial_path.stat().st_size < library.stat().st_size, (
                "the mid-copy kill should leave a truncated file"
            )
        return library, before, partial_path

    @staticmethod
    def _backups_dir(library: Path) -> Path:
        return library.parent / "backups"

    def test_the_partial_file_is_there_but_is_not_a_backup(self, killed):
        library, _before, partial = killed
        assert partial.exists(), (
            "the child should have been killed with a copy half made"
        )
        assert partial.name.startswith(".") and PARTIAL_SUFFIX in partial.name
        service = DatabaseService(db_path=library)
        try:
            backups = BackupService(database_service=service)
            assert backups.list_backups() == [], "a .partial was listed as a backup"
            visible = [
                p
                for p in self._backups_dir(library).iterdir()
                if not p.name.startswith(".")
            ]
            assert visible == []
        finally:
            service.close_all()

    def test_no_migration_ran(self, killed):
        library, before, _partial = killed
        service = DatabaseService(db_path=library)
        try:
            conn = service.connect()
            top = conn.execute("SELECT max(version) FROM schema_version").fetchone()[0]
            assert top == HEAD - 1
            ladder.assert_nothing_lost(conn, before, "after the killed backup")
            # And nothing was added either: the same tables, the same rows.
            assert set(ladder.snapshot(conn)) == set(before)
            for table, data in before.items():
                assert len(ladder.snapshot(conn)[table]["rows"]) == len(data["rows"])
        finally:
            service.close_all()

    def test_sweep_partials_removes_it(self, killed):
        library, _before, partial = killed
        service = DatabaseService(db_path=library)
        try:
            removed = BackupService(database_service=service).sweep_partials()
            assert removed >= 1
            assert not partial.exists()
            assert not list(self._backups_dir(library).glob(f".*{PARTIAL_SUFFIX}*"))
        finally:
            service.close_all()

    def test_the_next_launch_sweeps_it_and_takes_exactly_one_pre_upgrade_copy(
        self, killed, monkeypatch
    ):
        from cuepoint.engine import server

        library, before, partial = killed
        monkeypatch.setattr(
            database_service_module, "default_database_path", lambda: library
        )
        reset_container()
        try:
            taken = server.backup_library_on_launch()
        finally:
            reset_container()

        assert taken is not None and taken.reason == PRE_UPGRADE_REASON
        assert not partial.exists(), "the half-made file survived the next start"
        directory = self._backups_dir(library)
        assert not list(directory.glob(f".*{PARTIAL_SUFFIX}*"))
        copies = sorted(directory.glob("cuepoint-*.db"))
        assert [reason_of(p.name) for p in copies] == [PRE_UPGRADE_REASON]

        service = DatabaseService(db_path=copies[0])
        try:
            conn = service.connect()
            assert [tuple(r) for r in conn.execute("PRAGMA quick_check")] == [("ok",)]
            assert conn.execute("SELECT max(version) FROM schema_version").fetchone()[
                0
            ] == (HEAD - 1)
            ladder.assert_nothing_lost(conn, before, "the pre-upgrade copy")
        finally:
            service.close_all()

        # The upgrade that follows the backup then goes through.
        live = DatabaseService(db_path=library)
        try:
            MigrationRunner(live).migrate()
            ladder.assert_sound(live.connect(), HEAD)
            ladder.assert_nothing_lost(live.connect(), before, "upgrade after the kill")
        finally:
            live.close_all()
