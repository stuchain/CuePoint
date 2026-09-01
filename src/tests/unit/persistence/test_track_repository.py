#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the library track repository.

Every test runs against a temporary database; the user's real
``~/.cuepoint/cuepoint.db`` is never opened.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import ITrackRepository
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> TrackRepository:
    return TrackRepository(db)


def _track(track_id: str = "1", path: str = "/music/a.mp3", **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", "Title")
    kwargs.setdefault("artist", "Artist")
    return LibraryTrack(rekordbox_track_id=track_id, file_path=path, **kwargs)


@pytest.mark.unit
class TestInterface:
    def test_implements_interface(self):
        assert issubclass(TrackRepository, ITrackRepository)

    def test_no_unimplemented_abstract_methods(self):
        assert not getattr(TrackRepository, "__abstractmethods__", frozenset())


@pytest.mark.unit
class TestCreateAndRead:
    def test_add_assigns_id(self, repo):
        track = repo.add(_track())
        assert track.id is not None

    def test_get_returns_stored_track(self, repo):
        added = repo.add(_track(title="Song", artist="Someone"))
        found = repo.get(added.id)
        assert found is not None
        assert found.title == "Song"
        assert found.artist == "Someone"

    def test_get_unknown_returns_none(self, repo):
        assert repo.get(999) is None

    def test_all_fields_round_trip(self, repo):
        added = repo.add(
            _track(
                track_id="42",
                path=r"C:\Music\Song.flac",
                title="Song",
                artist="Someone",
                remixer="Remixer",
                album="Album",
                label="Label",
                genre="House",
                key="8A",
                bpm=124.5,
                year=2021,
                duration_seconds=360,
            )
        )
        found = repo.get(added.id)
        assert found.to_dict() == added.to_dict()

    def test_count(self, repo):
        assert repo.count() == 0
        repo.add(_track("1", "/a.mp3"))
        repo.add(_track("2", "/b.mp3"))
        assert repo.count() == 2

    def test_exists(self, repo):
        repo.add(_track("1"))
        assert repo.exists("1") is True
        assert repo.exists("2") is False

    def test_duplicate_rekordbox_id_rejected(self, repo):
        repo.add(_track("1", "/a.mp3"))
        with pytest.raises(sqlite3.IntegrityError):
            repo.add(_track("1", "/b.mp3"))


@pytest.mark.unit
class TestBulkInsert:
    def test_add_many(self, repo):
        inserted = repo.add_many(
            [_track(str(i), f"/music/{i}.mp3") for i in range(100)]
        )
        assert inserted == 100
        assert repo.count() == 100

    def test_add_many_empty_is_a_no_op(self, repo):
        assert repo.add_many([]) == 0
        assert repo.count() == 0

    def test_failed_batch_inserts_nothing(self, repo):
        """One transaction for the batch: a bad import leaves no partial state."""
        tracks = [_track("1", "/a.mp3"), _track("2", "/b.mp3"), _track("1", "/c.mp3")]
        with pytest.raises(sqlite3.IntegrityError):
            repo.add_many(tracks)
        assert repo.count() == 0, "partial batch was committed"


@pytest.mark.unit
class TestUpdateAndDelete:
    def test_update_persists_changes(self, repo):
        track = repo.add(_track(title="Before"))
        track.title = "After"
        repo.update(track)
        assert repo.get(track.id).title == "After"

    def test_update_refreshes_updated_at(self, repo):
        track = repo.add(_track())
        track.updated_at = "2000-01-01T00:00:00+00:00"
        repo.update(track)
        assert repo.get(track.id).updated_at != "2000-01-01T00:00:00+00:00"

    def test_update_without_id_is_rejected(self, repo):
        with pytest.raises(ValueError, match="no id"):
            repo.update(_track())

    def test_delete(self, repo):
        track = repo.add(_track())
        assert repo.delete(track.id) is True
        assert repo.get(track.id) is None

    def test_delete_unknown_returns_false(self, repo):
        assert repo.delete(999) is False

    def test_delete_by_rekordbox_ids(self, repo):
        """DEC-003: tracks absent from a refreshed export are removed."""
        repo.add_many([_track(str(i), f"/music/{i}.mp3") for i in range(5)])
        deleted = repo.delete_by_rekordbox_ids(["1", "3"])
        assert deleted == 2
        assert repo.count() == 3
        assert repo.exists("1") is False
        assert repo.exists("2") is True

    def test_delete_by_rekordbox_ids_ignores_blanks_and_unknowns(self, repo):
        repo.add(_track("1"))
        assert repo.delete_by_rekordbox_ids([]) == 0
        assert repo.delete_by_rekordbox_ids(["", "   "]) == 0
        assert repo.delete_by_rekordbox_ids(["nope"]) == 0
        assert repo.count() == 1


@pytest.mark.unit
class TestIdentityLookups:
    def test_find_by_rekordbox_id(self, repo):
        repo.add(_track("7", title="Seven"))
        assert repo.find_by_rekordbox_id("7").title == "Seven"

    def test_find_by_rekordbox_id_unknown_or_blank(self, repo):
        assert repo.find_by_rekordbox_id("nope") is None
        assert repo.find_by_rekordbox_id("") is None

    def test_find_by_path_normalizes_input(self, repo):
        repo.add(_track("1", r"C:\Music\Song.mp3"))
        assert repo.find_by_path("c:/music/SONG.MP3") is not None

    def test_find_by_normalized_path_blank_returns_none(self, repo):
        repo.add(_track("1", ""))
        assert repo.find_by_normalized_path("") is None

    def test_duplicate_paths_resolve_deterministically(self, repo):
        """Two rows can share a path; the choice must not be arbitrary."""
        first = repo.add(_track("1", "/music/same.mp3"))
        repo.add(_track("2", "/music/same.mp3"))
        for _ in range(3):
            assert repo.find_by_normalized_path("/music/same.mp3").id == first.id


@pytest.mark.unit
class TestResolveIdentity:
    """DEC-002 through the repository, against real rows."""

    def test_matches_by_rekordbox_id(self, repo):
        repo.add(_track("1", "/music/a.mp3"))
        match = repo.resolve_identity("1", "/somewhere/else.mp3")
        assert match is not None
        assert match.matched_by == "rekordbox_id"
        assert match.relinked is False

    def test_falls_back_to_path_and_flags_relink(self, repo):
        repo.add(_track("1", "/music/a.mp3"))
        match = repo.resolve_identity("999", "/music/a.mp3")
        assert match is not None
        assert match.matched_by == "path"
        assert match.relinked is True

    def test_new_track_returns_none(self, repo):
        assert repo.resolve_identity("1", "/music/a.mp3") is None


@pytest.mark.unit
class TestUpsertFromRekordbox:
    def test_inserts_new_track(self, repo):
        track, action, relinked = repo.upsert_from_rekordbox(_track("1"))
        assert action == "inserted"
        assert relinked is False
        assert track.id is not None

    def test_updates_existing_by_rekordbox_id(self, repo):
        repo.add(_track("1", "/music/a.mp3", title="Old"))
        _, action, relinked = repo.upsert_from_rekordbox(
            _track("1", "/music/a.mp3", title="New")
        )
        assert action == "updated"
        assert relinked is False
        assert repo.count() == 1
        assert repo.find_by_rekordbox_id("1").title == "New"

    def test_relinks_renumbered_track_without_duplicating(self, repo):
        """Rekordbox renumbered the file; CuePoint must not create a second row."""
        original = repo.add(_track("1", "/music/a.mp3", title="Song"))
        track, action, relinked = repo.upsert_from_rekordbox(
            _track("999", "/music/a.mp3", title="Song")
        )
        assert action == "updated"
        assert relinked is True
        assert repo.count() == 1
        assert track.id == original.id
        assert repo.get(original.id).rekordbox_track_id == "999"

    def test_preserves_created_at_on_update(self, repo):
        """created_at belongs to the library row, not to the incoming export."""
        original = repo.add(_track("1", "/music/a.mp3"))
        original_created = repo.get(original.id).created_at

        repo.upsert_from_rekordbox(_track("1", "/music/a.mp3", title="Changed"))

        assert repo.get(original.id).created_at == original_created

    def test_moved_file_keeps_identity_and_updates_path(self, repo):
        original = repo.add(_track("1", "/old/a.mp3"))
        repo.upsert_from_rekordbox(_track("1", "/new/a.mp3"))

        stored = repo.get(original.id)
        assert repo.count() == 1
        assert stored.file_path == "/new/a.mp3"
        assert stored.normalized_path == "/new/a.mp3"


@pytest.mark.unit
class TestListing:
    def test_list_all_orders_by_artist_then_title(self, repo):
        repo.add(_track("1", "/1.mp3", artist="Zed", title="A"))
        repo.add(_track("2", "/2.mp3", artist="alpha", title="B"))
        repo.add(_track("3", "/3.mp3", artist="alpha", title="A"))

        listed = [(t.artist, t.title) for t in repo.list_all()]
        assert listed == [("alpha", "A"), ("alpha", "B"), ("Zed", "A")]

    def test_list_all_is_case_insensitive_on_order(self, repo):
        repo.add(_track("1", "/1.mp3", artist="beta", title="T"))
        repo.add(_track("2", "/2.mp3", artist="Alpha", title="T"))
        assert [t.artist for t in repo.list_all()] == ["Alpha", "beta"]

    def test_limit_and_offset(self, repo):
        repo.add_many(
            [_track(str(i), f"/{i}.mp3", artist=f"A{i:02d}") for i in range(10)]
        )
        page = repo.list_all(limit=3, offset=3)
        assert [t.artist for t in page] == ["A03", "A04", "A05"]

    def test_empty_library(self, repo):
        assert repo.list_all() == []
