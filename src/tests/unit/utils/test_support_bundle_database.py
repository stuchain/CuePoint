#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The support bundle must describe the library database, never export it.

A bundle is meant to be shareable with a maintainer. The database holds the
user's whole library — titles, artists, file paths — plus tags, ratings, notes
and history. File paths are exactly what the bundle's log sanitizer strips out,
so shipping the database would undo that in one step.

What a maintainer actually needs is the database's *shape*: schema version,
outstanding migrations, row counts, integrity.
"""

from __future__ import annotations

import json
import zipfile

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.utils.support_bundle import SupportBundleGenerator

# Values that must never appear anywhere in a bundle.
SECRET_TITLE = "Zzyzx Unmistakable Track Title"
SECRET_ARTIST = "Qqqx Unmistakable Artist"
SECRET_PATH = "/Volumes/PrivateDrive/unmistakable-folder/track.aiff"


@pytest.fixture
def populated_database(_library_database_sandbox):
    """A real library database at the path the bundle will look at.

    The sandbox is session-scoped, so this resets the table rather than
    assuming an empty one; otherwise the second test to use it collides on the
    unique Rekordbox id.
    """
    service = DatabaseService(db_path=_library_database_sandbox)
    MigrationRunner(service).migrate()

    with service.transaction() as conn:
        conn.execute("DELETE FROM tracks")

    TrackRepository(service).add(
        LibraryTrack(
            rekordbox_track_id="1",
            title=SECRET_TITLE,
            artist=SECRET_ARTIST,
            file_path=SECRET_PATH,
        )
    )
    yield service
    service.close_all()


def _bundle_entries(bundle_path) -> dict[str, str]:
    with zipfile.ZipFile(bundle_path) as archive:
        return {
            name: archive.read(name).decode("utf-8", errors="replace")
            for name in archive.namelist()
        }


@pytest.mark.unit
class TestDatabaseSummary:
    def test_reports_shape_not_contents(self, populated_database):
        summary = SupportBundleGenerator._collect_database_summary()

        assert summary["included"] is False
        assert summary["exists"] is True
        assert summary["row_counts"]["tracks"] == 1
        assert summary["schema_version"] >= 1
        assert summary["integrity_check"] == "ok"

    def test_reports_pending_migrations(self, populated_database):
        summary = SupportBundleGenerator._collect_database_summary()
        assert summary["expected_schema_version"] >= summary["schema_version"]
        assert summary["pending_migrations"] == []

    def test_summary_contains_no_library_content(self, populated_database):
        blob = json.dumps(SupportBundleGenerator._collect_database_summary())
        for secret in (SECRET_TITLE, SECRET_ARTIST, SECRET_PATH):
            assert secret not in blob

    def test_missing_database_is_reported_not_raised(self, tmp_path, monkeypatch):
        from cuepoint.services import database_service

        monkeypatch.setattr(
            database_service, "default_database_path", lambda: tmp_path / "absent.db"
        )
        summary = SupportBundleGenerator._collect_database_summary()
        assert summary["exists"] is False
        assert "note" in summary

    def test_unreadable_database_is_reported_not_raised(self, tmp_path, monkeypatch):
        """Bundles are generated when something is already wrong."""
        broken = tmp_path / "broken.db"
        broken.write_bytes(b"definitely not a database" * 20)

        from cuepoint.services import database_service

        monkeypatch.setattr(database_service, "default_database_path", lambda: broken)

        summary = SupportBundleGenerator._collect_database_summary()
        assert summary["exists"] is True
        assert "error" in summary or summary.get("integrity_check") != "ok"

    def test_foreign_keys_is_not_reported(self, populated_database):
        """It is per-connection; reporting 0 here would mislead a maintainer."""
        assert "foreign_keys" not in SupportBundleGenerator._collect_database_summary()


@pytest.mark.unit
class TestBundleContents:
    def test_bundle_includes_the_database_summary(self, populated_database, tmp_path):
        bundle = SupportBundleGenerator.generate_bundle(output_path=tmp_path)
        entries = _bundle_entries(bundle)

        assert "database.json" in entries
        assert json.loads(entries["database.json"])["included"] is False

    def test_bundle_does_not_contain_the_database_file(
        self, populated_database, tmp_path
    ):
        bundle = SupportBundleGenerator.generate_bundle(output_path=tmp_path)
        names = list(_bundle_entries(bundle))

        assert not [n for n in names if n.endswith(".db")], (
            f"the library database was bundled: {names}"
        )

    def test_no_library_content_appears_anywhere_in_the_bundle(
        self, populated_database, tmp_path
    ):
        """The strongest form of the guarantee: scan every entry."""
        bundle = SupportBundleGenerator.generate_bundle(output_path=tmp_path)
        entries = _bundle_entries(bundle)

        for name, content in entries.items():
            for secret in (SECRET_TITLE, SECRET_ARTIST, SECRET_PATH):
                assert secret not in content, (
                    f"library content leaked into bundle entry {name!r}"
                )


@pytest.mark.unit
class TestPrivacyClearLeavesTheLibraryAlone:
    """Clearing a cache must never delete someone's library."""

    def test_database_is_outside_cache_and_log_directories(self):
        from cuepoint.services.database_service import default_database_path
        from cuepoint.utils.paths import AppPaths

        db = default_database_path().resolve()
        for directory in (AppPaths.cache_dir(), AppPaths.logs_dir()):
            resolved = directory.resolve()
            assert not str(db).startswith(str(resolved)), (
                f"the library database sits inside {resolved}, which privacy "
                "clear actions delete wholesale"
            )

    def test_clear_cache_does_not_remove_the_database(self, tmp_path):
        from cuepoint.utils.privacy import DataDeletionManager

        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()
        (cache_dir / "entry.json").write_text("{}")
        database = tmp_path / "cuepoint.db"
        database.write_bytes(b"library")

        DataDeletionManager.clear_cache(cache_dir=cache_dir)

        assert database.exists(), "clearing the cache deleted the library database"
        assert not (cache_dir / "entry.json").exists()

    def test_clear_logs_does_not_remove_the_database(self, tmp_path):
        from cuepoint.utils.privacy import DataDeletionManager

        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        (logs_dir / "app.log").write_text("log")
        database = tmp_path / "cuepoint.db"
        database.write_bytes(b"library")

        DataDeletionManager.clear_logs(logs_dir=logs_dir)

        assert database.exists(), "clearing logs deleted the library database"
        assert not (logs_dir / "app.log").exists()
