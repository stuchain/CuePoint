#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Every repository migrates before it reads (LIBUI-03).

A bug this pins, found by the playlists endpoint: ``create_track_repository``
ran the migrations, and the playlist and source repositories did not. Nothing
noticed, because every path that had ever touched them resolved something else
first — the import service, or the summary endpoint's library service — so the
tables existed by accident of ordering.

The playlists endpoint resolves only the playlist repository. On a fresh
install, which is exactly when a user first opens the Library page, that was a
500 with no table.

The fix is that resolving any repository migrates first. These tests resolve
each one **on its own**, against a database nothing else has opened, which is
the condition the old code got wrong.
"""

from __future__ import annotations

import pytest

from cuepoint.services import database_service as database_service_module
from cuepoint.utils.di_container import get_container, reset_container


@pytest.fixture
def fresh_container(tmp_path, monkeypatch):
    """A DI container over a database file that does not exist yet."""
    from cuepoint.services.bootstrap import bootstrap_services

    db_path = tmp_path / "cuepoint.db"
    monkeypatch.setattr(
        database_service_module, "default_database_path", lambda: db_path
    )
    reset_container()
    bootstrap_services()
    yield get_container()
    reset_container()


@pytest.mark.unit
class TestResolvingOneRepositoryIsEnough:
    def test_the_playlist_repository_can_read_a_fresh_database(self, fresh_container):
        from cuepoint.services.interfaces import IPlaylistRepository

        playlists = fresh_container.resolve(IPlaylistRepository)

        # The call the endpoint makes. Before the fix this raised
        # "no such table: rekordbox_playlists".
        assert playlists.list_all() == []
        assert playlists.count() == 0
        assert playlists.count_entries() == 0

    def test_the_source_repository_can_read_a_fresh_database(self, fresh_container):
        from cuepoint.services.interfaces import ILibrarySourceRepository

        sources = fresh_container.resolve(ILibrarySourceRepository)

        assert sources.get() is None

    def test_the_track_repository_can_read_a_fresh_database(self, fresh_container):
        # The one that always did migrate; asserted alongside the others so the
        # rule reads as a rule rather than as a fix to one factory.
        from cuepoint.services.interfaces import ITrackRepository

        assert fresh_container.resolve(ITrackRepository).count() == 0

    def test_the_activity_repository_can_read_a_fresh_database(self, fresh_container):
        from cuepoint.services.interfaces import IActivityRepository

        assert fresh_container.resolve(IActivityRepository).recent_events(limit=1) == []

    def test_the_job_repository_can_read_a_fresh_database(self, fresh_container):
        from cuepoint.services.interfaces import IJobRepository

        assert fresh_container.resolve(IJobRepository).list_recent(limit=1) == []
