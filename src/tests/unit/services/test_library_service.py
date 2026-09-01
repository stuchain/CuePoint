#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the library service.

Covers the service against a real repository and temporary database, plus the
DI wiring both entry points depend on: the CLI (``src/main.py``) and the engine
(``engine/jobs.py::_ensure_services``) each resolve services from the container
after ``bootstrap_services()``.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import (
    IConfigService,
    ILibraryService,
    ITrackRepository,
)
from cuepoint.services.library_service import LibraryService, LibraryStats
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def repo(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield TrackRepository(service)
    service.close_all()


@pytest.fixture
def library(repo) -> LibraryService:
    return LibraryService(track_repository=repo)


def _track(track_id: str = "1", **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", "Title")
    kwargs.setdefault("artist", "Artist")
    kwargs.setdefault("file_path", f"/music/{track_id}.mp3")
    return LibraryTrack(rekordbox_track_id=track_id, **kwargs)


@pytest.mark.unit
class TestInterface:
    def test_implements_interface(self):
        assert issubclass(LibraryService, ILibraryService)

    def test_no_unimplemented_abstract_methods(self):
        assert not getattr(LibraryService, "__abstractmethods__", frozenset())


@pytest.mark.unit
class TestEmptyLibrary:
    def test_is_empty_on_a_fresh_database(self, library):
        assert library.is_empty() is True
        assert library.track_count() == 0
        assert library.list_tracks() == []

    def test_stats_on_a_fresh_database(self, library):
        assert library.stats() == LibraryStats(track_count=0, is_empty=True)

    def test_empty_is_about_content_not_the_file(self, library, repo):
        """A database file exists as soon as anything opens it.

        First-launch flows must key off whether tracks were imported, not off
        the file's presence, or they would never trigger.
        """
        assert library.is_empty() is True
        repo.add(_track())
        assert library.is_empty() is False


@pytest.mark.unit
class TestReads:
    def test_get_track(self, library, repo):
        added = repo.add(_track(title="Song"))
        assert library.get_track(added.id).title == "Song"

    def test_get_unknown_track(self, library):
        assert library.get_track(999) is None

    def test_find_by_rekordbox_id(self, library, repo):
        repo.add(_track("7", title="Seven"))
        assert library.find_by_rekordbox_id("7").title == "Seven"

    def test_find_by_unknown_rekordbox_id(self, library):
        assert library.find_by_rekordbox_id("nope") is None

    def test_track_count(self, library, repo):
        repo.add_many([_track(str(i)) for i in range(4)])
        assert library.track_count() == 4

    def test_stats_reflect_contents(self, library, repo):
        repo.add_many([_track(str(i)) for i in range(3)])
        assert library.stats() == LibraryStats(track_count=3, is_empty=False)

    def test_list_tracks_is_ordered(self, library, repo):
        repo.add(_track("1", artist="Zed", title="A"))
        repo.add(_track("2", artist="alpha", title="B"))
        assert [t.artist for t in library.list_tracks()] == ["alpha", "Zed"]

    def test_list_tracks_paging(self, library, repo):
        repo.add_many([_track(str(i), artist=f"A{i:02d}") for i in range(10)])
        page = library.list_tracks(limit=2, offset=2)
        assert [t.artist for t in page] == ["A02", "A03"]


@pytest.mark.unit
class TestDependencyInjection:
    """Both the CLI and the engine resolve services from the container."""

    @pytest.fixture
    def container(self, di_container, tmp_path):
        from cuepoint.services.bootstrap import bootstrap_services

        bootstrap_services()
        di_container.resolve(IConfigService).set(
            "database.path", str(tmp_path / "library.db")
        )
        return di_container

    def test_library_service_is_registered(self, container):
        assert container.is_registered(ILibraryService)

    def test_resolves_to_implementation(self, container):
        assert isinstance(container.resolve(ILibraryService), LibraryService)

    def test_usable_immediately_after_resolution(self, container):
        """Migrations run behind the repository, so this must not raise."""
        assert container.resolve(ILibraryService).track_count() == 0

    def test_round_trip_through_container(self, container):
        """Written via the repository, read back through the service."""
        container.resolve(ITrackRepository).add(_track("42", title="Round Trip"))

        library = container.resolve(ILibraryService)

        assert library.track_count() == 1
        assert library.find_by_rekordbox_id("42").title == "Round Trip"
        assert library.is_empty() is False
