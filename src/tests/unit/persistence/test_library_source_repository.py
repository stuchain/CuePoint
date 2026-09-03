#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the DEC-035 source-record repository.

The record is singular by write path rather than by schema constraint —
migration 0005 deliberately left out a ``CHECK (id = 1)`` so a later release can
grow an import history — so "there is only ever one" is a property this
repository has to keep, and therefore one worth asserting.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_source import LibrarySource
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db):
    return LibrarySourceRepository(db)


def source(path="/music/collection.xml", **kwargs):
    kwargs.setdefault("imported_at", "2026-09-03T10:00:00+00:00")
    kwargs.setdefault("xml_modified_at", "2026-09-03T09:00:00+00:00")
    kwargs.setdefault("xml_size_bytes", 4_554_104)
    kwargs.setdefault("track_count", 3880)
    kwargs.setdefault("playlist_count", 234)
    return LibrarySource(xml_path=path, **kwargs)


@pytest.mark.unit
class TestReplaceAndGet:
    def test_nothing_imported_yet_reads_as_none(self, repo):
        assert repo.get() is None

    def test_a_record_round_trips(self, repo):
        stored = repo.replace(source())
        read_back = repo.get()

        assert read_back is not None
        assert read_back.xml_path == "/music/collection.xml"
        assert read_back.xml_modified_at == "2026-09-03T09:00:00+00:00"
        assert read_back.xml_size_bytes == 4_554_104
        assert read_back.imported_at == "2026-09-03T10:00:00+00:00"
        assert read_back.track_count == 3880
        assert read_back.playlist_count == 234
        assert read_back.id == stored.id

    def test_replace_returns_the_record_with_its_id(self, repo):
        stored = repo.replace(source())
        assert stored.id is not None
        assert stored.xml_path == "/music/collection.xml"

    def test_replacing_leaves_exactly_one_row(self, db, repo):
        repo.replace(source("/music/first.xml"))
        repo.replace(source("/music/second.xml"))
        repo.replace(source("/music/third.xml"))

        count = (
            db.connect().execute("SELECT count(*) FROM library_source").fetchone()[0]
        )
        assert count == 1
        assert repo.get().xml_path == "/music/third.xml"

    def test_a_record_with_no_stat_is_stored(self, repo):
        repo.replace(LibrarySource(xml_path="/music/c.xml", imported_at="now"))
        read_back = repo.get()
        assert read_back.xml_modified_at is None
        assert read_back.xml_size_bytes is None
        assert read_back.is_stat_known is False

    def test_clear_forgets_the_source(self, repo):
        repo.replace(source())
        repo.clear()
        assert repo.get() is None

    def test_clear_on_an_empty_table_is_harmless(self, repo):
        repo.clear()
        assert repo.get() is None

    def test_the_most_recent_row_wins(self, db, repo):
        """A future import history must read correctly through get()."""
        repo.replace(source("/music/old.xml"))
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO library_source (xml_path, imported_at) "
                "VALUES ('/music/newer.xml', 'later')"
            )
        assert repo.get().xml_path == "/music/newer.xml"

    def test_unicode_and_windows_paths_survive(self, repo):
        path = r"C:\Users\stü\Müsik\collection – 2026.xml"
        repo.replace(source(path))
        assert repo.get().xml_path == path
