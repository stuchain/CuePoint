#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""``python -m cuepoint.engine --restore NAME`` (HARDEN-01).

The desktop app stops the engine and runs this once. It must restore and exit 0,
keep a ``pre-restore`` copy, refuse a corrupt backup without touching the
library, and work on a library too damaged to open.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from cuepoint.engine import restore_mode
from cuepoint.services import database_service as database_service_module
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.utils.di_container import reset_container

pytestmark = pytest.mark.unit


@pytest.fixture
def home(tmp_path, monkeypatch):
    """A library home the in-process mode and a subprocess both resolve to."""
    monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path))
    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    yield tmp_path
    reset_container()


SRC = str(Path(__file__).resolve().parents[3])


def _env(home: Path) -> dict:
    existing = os.environ.get("PYTHONPATH")
    return {
        **os.environ,
        "CUEPOINT_HOME": str(home),
        "PYTHONPATH": SRC + (os.pathsep + existing if existing else ""),
    }


def _job_ids(db_path: Path) -> list[str]:
    connection = sqlite3.connect(str(db_path))
    try:
        return [r[0] for r in connection.execute("SELECT id FROM jobs ORDER BY id")]
    finally:
        connection.close()


def _library_with_backup(home: Path, backup_dir: Path | None = None):
    """A library holding job-1, a backup of that, then job-2 added after."""
    from cuepoint.services.backup_service import BackupService

    service = DatabaseService(db_path=home / "cuepoint.db")
    MigrationRunner(service).migrate()

    def add(job_id: str) -> None:
        with service.transaction() as conn:
            conn.execute(
                "INSERT INTO jobs (id, type, state, created_at, updated_at)"
                " VALUES (?,?,?,?,?)",
                (job_id, "match", "completed", "2026-09-02", "2026-09-02"),
            )

    add("job-1")
    info = BackupService(database_service=service).create_backup(reason="manual")
    add("job-2")
    service.close_all()
    return info


def _names(home: Path) -> list[str]:
    return sorted(p.name for p in (home / "backups").glob("cuepoint-*.db"))


def _error_line(capsys) -> dict:
    lines = [ln for ln in capsys.readouterr().err.splitlines() if ln.strip()]
    assert len(lines) == 1, lines
    return json.loads(lines[0])


class TestRestoreMode:
    def test_restores_and_keeps_a_pre_restore_copy(self, home):
        info = _library_with_backup(home)

        assert restore_mode.run_restore(info.name) == 0

        assert _job_ids(home / "cuepoint.db") == ["job-1"]
        kept = [n for n in _names(home) if n.endswith("-pre-restore.db")]
        assert len(kept) == 1
        assert _job_ids(home / "backups" / kept[0]) == ["job-1", "job-2"]
        for suffix in ("-wal", "-shm"):
            assert not Path(str(home / "cuepoint.db") + suffix).exists()

    def test_a_corrupt_backup_fails_and_leaves_the_library_alone(self, home, capsys):
        info = _library_with_backup(home)
        (home / "backups" / info.name).write_bytes(b"not a library" * 100)
        before = (home / "cuepoint.db").read_bytes()

        assert restore_mode.run_restore(info.name) != 0

        error = _error_line(capsys)
        assert error["error_code"] in {"BACKUP_UNREADABLE", "BACKUP_CORRUPT"}
        assert (home / "cuepoint.db").read_bytes() == before
        assert not [n for n in _names(home) if "pre-restore" in n]

    @pytest.mark.parametrize(
        "name", ["nope.db", "../cuepoint.db", "cuepoint-20200101-000000-manual.db"]
    )
    def test_an_unknown_or_unsafe_name_fails_with_a_code(self, home, capsys, name):
        _library_with_backup(home)
        before = (home / "cuepoint.db").read_bytes()

        assert restore_mode.run_restore(name) != 0

        assert _error_line(capsys)["error_code"] in {
            "BACKUP_INVALID_NAME",
            "BACKUP_NOT_FOUND",
        }
        assert (home / "cuepoint.db").read_bytes() == before

    def test_a_library_of_noise_is_set_aside_by_file_copy_and_restored(self, home):
        info = _library_with_backup(home)
        live = home / "cuepoint.db"
        noise = os.urandom(8192)
        live.write_bytes(noise)

        assert restore_mode.run_restore(info.name) == 0

        assert _job_ids(live) == ["job-1"]
        aside = [n for n in _names(home) if n.endswith("-pre-restore-damaged.db")]
        assert len(aside) == 1
        assert (home / "backups" / aside[0]).read_bytes() == noise

    def test_no_name_is_a_usage_error(self, capsys):
        assert restore_mode.main([]) != 0
        assert _error_line(capsys)["error_code"] == "RESTORE_USAGE"


class TestAsAProcess:
    def test_restores_through_the_real_entry_point(self, home):
        info = _library_with_backup(home)
        (home / "cuepoint.db").write_bytes(os.urandom(4096))

        done = subprocess.run(
            [sys.executable, "-m", "cuepoint.engine", "--restore", info.name],
            env=_env(home),
            capture_output=True,
            text=True,
            timeout=120,
        )

        assert done.returncode == 0, done.stderr
        assert _job_ids(home / "cuepoint.db") == ["job-1"]
        assert any(n.endswith("-pre-restore-damaged.db") for n in _names(home))

    def test_a_failure_is_one_json_line_and_non_zero(self, home):
        _library_with_backup(home)

        done = subprocess.run(
            [sys.executable, "-m", "cuepoint.engine", "--restore", "nope.db"],
            env=_env(home),
            capture_output=True,
            text=True,
            timeout=120,
        )

        assert done.returncode != 0
        error_lines = [
            ln for ln in done.stderr.splitlines() if ln.strip().startswith("{")
        ]
        assert len(error_lines) == 1, done.stderr
        assert json.loads(error_lines[0])["error_code"] == "BACKUP_INVALID_NAME"
