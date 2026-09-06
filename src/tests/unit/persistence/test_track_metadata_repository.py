#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The CuePoint metadata store (ORG-02, DEC-057).

Storage-level tests for the layer that holds a user's own rating, favorite and
note. The distinctions worth pinning here are the ones that look like details
and are not:

**A row appears on first write and not before.** An untouched library costs no
storage, so ``get`` answering ``None`` is the normal case rather than a
failure, and ``get_many`` leaves absent tracks absent instead of inventing
empty records for them.

**Clearing a rating is not deleting the record.** ``set_rating(None)`` removes
the override and leaves the favorite and the note alone; ``clear()`` is the
one that forgets everything. Conflating them would quietly lose a note when a
user unrated a track.

**Writing one field does not disturb another.** Every write is an upsert of a
single column, and the test for it is the one that catches an ``INSERT OR
REPLACE`` written in a hurry.
"""

from __future__ import annotations

import sqlite3

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.track_metadata import TrackMetadata
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db):
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/m/{i}.mp3",
                title=f"T{i}",
                artist="An Artist",
                rating=i,
            )
            for i in range(1, 6)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks):
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def repo(db, tracks):
    return TrackMetadataRepository(db)


class TestNothingUntilSomethingIsSaid:
    def test_an_untouched_track_has_no_record(self, repo, ids):
        assert repo.get(ids[0]) is None

    def test_an_untouched_library_stores_nothing(self, repo):
        assert repo.count() == 0

    def test_get_many_leaves_absent_tracks_absent(self, repo, ids):
        repo.set_favorite(ids[1], True)
        found = repo.get_many(ids)
        assert list(found) == [ids[1]]

    def test_get_many_of_nothing_is_empty(self, repo):
        assert repo.get_many([]) == {}

    def test_the_first_write_creates_the_row(self, repo, ids):
        repo.set_rating(ids[0], 4)
        assert repo.count() == 1


class TestWritesDoNotDisturbEachOther:
    def test_rating_favorite_and_notes_coexist(self, repo, ids):
        repo.set_rating(ids[0], 3)
        repo.set_favorite(ids[0], True)
        repo.set_notes(ids[0], "late")

        record = repo.get(ids[0])
        assert (record.rating, record.favorite, record.notes) == (3, True, "late")

    def test_rewriting_one_field_leaves_the_others(self, repo, ids):
        repo.set_rating(ids[0], 3)
        repo.set_notes(ids[0], "late")
        repo.set_rating(ids[0], 5)

        record = repo.get(ids[0])
        assert record.rating == 5
        assert record.notes == "late"

    def test_two_tracks_do_not_share_a_record(self, repo, ids):
        repo.set_rating(ids[0], 1)
        repo.set_rating(ids[1], 5)
        assert repo.get(ids[0]).rating == 1
        assert repo.get(ids[1]).rating == 5

    def test_created_at_survives_an_update(self, repo, ids):
        first = repo.set_rating(ids[0], 1)
        second = repo.set_rating(ids[0], 2)
        assert second.created_at == first.created_at


class TestClearingIsNotZeroing:
    def test_clearing_a_rating_leaves_the_note(self, repo, ids):
        repo.set_notes(ids[0], "keep me")
        repo.set_rating(ids[0], 4)
        repo.set_rating(ids[0], None)

        record = repo.get(ids[0])
        assert record.rating is None
        assert record.notes == "keep me"

    def test_zero_stars_is_not_no_rating(self, repo, ids):
        repo.set_rating(ids[0], 0)
        assert repo.get(ids[0]).rating == 0

        repo.set_rating(ids[0], None)
        assert repo.get(ids[0]).rating is None

    def test_clear_removes_the_whole_record(self, repo, ids):
        repo.set_rating(ids[0], 4)
        repo.set_notes(ids[0], "gone")
        assert repo.clear(ids[0]) is True
        assert repo.get(ids[0]) is None

    def test_clearing_nothing_says_so(self, repo, ids):
        assert repo.clear(ids[0]) is False

    def test_an_empty_note_is_stored_as_no_note(self, repo, ids):
        repo.set_notes(ids[0], "   ")
        assert repo.get(ids[0]).notes is None


class TestRefusals:
    @pytest.mark.parametrize("rating", [-1, 6, "four", 4.5])
    def test_a_bad_rating_never_reaches_the_database(self, repo, ids, rating):
        with pytest.raises(ValueError):
            repo.set_rating(ids[0], rating)
        assert repo.count() == 0

    def test_a_note_that_is_too_long_never_reaches_the_database(self, repo, ids):
        with pytest.raises(ValueError):
            repo.set_notes(ids[0], "x" * 10_001)
        assert repo.count() == 0

    def test_metadata_cannot_be_written_for_a_track_that_is_not_there(self, repo):
        # The foreign key from ORG-01, reached through the repository.
        with pytest.raises(sqlite3.IntegrityError):
            repo.set_rating(999_999, 4)


class TestReadingMany:
    def test_it_returns_what_was_written(self, repo, ids):
        repo.set_rating(ids[0], 1)
        repo.set_favorite(ids[2], True)

        found = repo.get_many(ids)
        assert found[ids[0]].rating == 1
        assert found[ids[2]].favorite is True

    def test_duplicate_ids_are_asked_about_once(self, repo, ids):
        repo.set_rating(ids[0], 2)
        found = repo.get_many([ids[0], ids[0], ids[0]])
        assert list(found) == [ids[0]]

    def test_it_asks_in_chunks_rather_than_one_huge_statement(self, db, repo, ids):
        """Counted, not inferred.

        The first version of this test passed 2,000 ids and asserted the
        answer — which proved nothing: this SQLite build accepts far more
        parameters than that, so an unchunked query would have passed too.
        Older builds cap it at 999, and a user's library is not the place to
        discover which build they have. So the queries are counted.
        """
        repo.set_rating(ids[0], 5)
        connection = db.connect()
        statements = []
        connection.set_trace_callback(statements.append)
        try:
            found = repo.get_many([ids[0]] + list(range(10_000, 11_200)))
        finally:
            connection.set_trace_callback(None)

        reads = [sql for sql in statements if "FROM track_metadata" in sql]
        assert len(reads) > 1
        assert list(found) == [ids[0]]

    def test_a_chunked_read_still_finds_everything(self, repo, ids):
        # The other half: chunking must not lose a row that falls on a
        # boundary. Every track has metadata, and every one comes back.
        for index, track_id in enumerate(ids):
            repo.set_rating(track_id, index % 6)
        found = repo.get_many(ids)
        assert sorted(found) == sorted(ids)

    def test_the_result_is_keyed_by_track_id(self, repo, ids):
        repo.set_notes(ids[3], "x")
        found = repo.get_many(ids)
        assert isinstance(found[ids[3]], TrackMetadata)
        assert found[ids[3]].track_id == ids[3]


class TestDeletingATrackTakesItsMetadata:
    def test_a_deleted_track_leaves_no_orphan(self, db, tracks, repo, ids):
        repo.set_rating(ids[0], 4)
        TrackRepository(db).delete(ids[0])
        assert repo.count() == 0
