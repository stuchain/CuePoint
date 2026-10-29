#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""``/api/v1/backups`` over the wire (HARDEN-01).

List shape and order, creating a manual backup, a failed create leaving nothing
listed, deleting, and every refusal of a name that is not a backup.
"""

# ruff: noqa: F811
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from cuepoint.models.library_track import LibraryTrack
from tests.unit.engine.test_engine_library_browse import (
    TOKEN,
    engine,  # noqa: F401 — a pytest fixture, used by name
    library_db,  # noqa: F401 — a pytest fixture, used by name
)

pytestmark = pytest.mark.unit


def call(base: str, method: str, path: str, token: str | None = TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = urllib.request.Request(
        f"{base}{path}",
        data=b"{}" if method == "POST" else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


@pytest.fixture
def library(library_db):  # noqa: F811 — the fixture is used by name
    """The sandboxed library, migrated, with a track in it."""
    from cuepoint.services.interfaces import ITrackRepository
    from cuepoint.utils.di_container import get_container

    get_container().resolve(ITrackRepository).add(
        LibraryTrack(
            rekordbox_track_id="1", file_path="/m/1.mp3", title="T", artist="A"
        )
    )
    return library_db


def backup_dir(library: Path) -> Path:
    return library.parent / "backups"


class TestList:
    def test_empty(self, engine, library):  # noqa: F811
        assert call(engine, "GET", "/api/v1/backups") == (200, {"backups": []})

    def test_shape_and_newest_first(self, engine, library):  # noqa: F811
        first = call(engine, "POST", "/api/v1/backups")[1]
        time.sleep(0.02)
        second = call(engine, "POST", "/api/v1/backups")[1]

        status, payload = call(engine, "GET", "/api/v1/backups")

        assert status == 200
        assert [b["name"] for b in payload["backups"]] == [
            second["name"],
            first["name"],
        ]
        for item in payload["backups"]:
            assert {"name", "createdAt", "reason", "appVersion", "bytes"} <= set(item)
            assert item["reason"] == "manual"
            assert item["bytes"] > 0

    def test_needs_the_token(self, engine, library):  # noqa: F811
        assert call(engine, "GET", "/api/v1/backups", token=None)[0] == 401
        assert call(engine, "POST", "/api/v1/backups", token=None)[0] == 401
        assert call(engine, "DELETE", "/api/v1/backups/x.db", token=None)[0] == 401


class TestCreate:
    def test_returns_the_new_copy(self, engine, library):  # noqa: F811
        status, created = call(engine, "POST", "/api/v1/backups")

        assert status == 200
        assert created["reason"] == "manual"
        assert (backup_dir(library) / created["name"]).is_file()
        listed = call(engine, "GET", "/api/v1/backups")[1]["backups"]
        assert [b["name"] for b in listed] == [created["name"]]

    def test_records_a_backup_created_event(self, engine, library):  # noqa: F811
        created = call(engine, "POST", "/api/v1/backups")[1]

        status, activity = call(engine, "GET", "/api/v1/activity/recent")
        assert status == 200
        events = [e for e in activity["events"] if e["type"] == "backup.created"]
        assert events and events[0]["detail"]["file"] == created["name"]

    def test_a_failed_create_lists_nothing(
        self,
        engine,
        library,
        monkeypatch,  # noqa: F811
    ):
        from cuepoint.services.backup_service import BackupService

        def bad_verify(self, path):
            from cuepoint.exceptions.cuepoint_exceptions import DatabaseError

            raise DatabaseError("nope", error_code="BACKUP_CORRUPT")

        monkeypatch.setattr(BackupService, "verify_backup", bad_verify)

        status, payload = call(engine, "POST", "/api/v1/backups")

        assert status == 500
        assert payload["error"]["code"] == "BACKUP_VERIFY_FAILED"
        for word in ("database", "schema", "engine"):
            assert word not in payload["error"]["message"].lower()
        assert call(engine, "GET", "/api/v1/backups")[1] == {"backups": []}
        leftovers = list(backup_dir(library).iterdir())
        assert leftovers == [], leftovers


class TestDelete:
    def test_deletes_one(self, engine, library):  # noqa: F811
        keep = call(engine, "POST", "/api/v1/backups")[1]
        time.sleep(0.02)
        gone = call(engine, "POST", "/api/v1/backups")[1]

        status, _ = call(engine, "DELETE", f"/api/v1/backups/{gone['name']}")

        assert status == 200
        listed = call(engine, "GET", "/api/v1/backups")[1]["backups"]
        assert [b["name"] for b in listed] == [keep["name"]]
        assert not (backup_dir(library) / f"{gone['name']}.json").exists()

    def test_unknown_backup_is_404(self, engine, library):  # noqa: F811
        status, payload = call(
            engine, "DELETE", "/api/v1/backups/cuepoint-20200101-000000-manual.db"
        )
        assert status == 404
        assert payload["error"]["code"] == "BACKUP_NOT_FOUND"

    @pytest.mark.parametrize(
        "name",
        [
            "..%2Fcuepoint.db",
            "..%2F..%2Fetc%2Fpasswd",
            "%2Fetc%2Fpasswd",
            "..%5Ccuepoint.db",
            "cuepoint.db",
            "notes.txt",
            ".cuepoint-20200101-000000-manual.db.partial",
        ],
    )
    def test_names_outside_the_backups_are_refused(
        self,
        engine,
        library,
        name,  # noqa: F811
    ):
        outside = library.parent / "cuepoint.db"
        before = outside.read_bytes()

        status, payload = call(engine, "DELETE", f"/api/v1/backups/{name}")

        assert status in (400, 404)
        assert outside.read_bytes() == before
        assert payload["error"]["code"] in {"BACKUP_INVALID_NAME", "NOT_FOUND"}
