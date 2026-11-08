#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""``TrackRepository.ids_by_rekordbox_id``: which library id each TrackID has.

The import's marks write asks it about a thousand ids at a time, and the
backfill asks about every track, so both of its paths are held to one answer.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence import track_repository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

STORED = 6_000


@pytest.fixture(scope="module")
def stored_repo(tmp_path_factory):
    service = DatabaseService(db_path=tmp_path_factory.mktemp("ids") / "cuepoint.db")
    MigrationRunner(service).migrate()
    repo = TrackRepository(service)
    with service.transaction():
        repo.add_many(
            LibraryTrack(
                rekordbox_track_id=str(n),
                title=f"T{n}",
                artist="A",
                file_path=f"/m/{n}.mp3",
            )
            for n in range(STORED)
        )
    yield repo
    service.close_all()


def expected(repo: TrackRepository, wanted):
    return {
        str(row[1]): int(row[0])
        for row in repo._db.connect().execute(
            "SELECT id, rekordbox_track_id FROM tracks"
        )
        if str(row[1]) in set(wanted)
    }


class TestIdsByRekordboxId:
    def test_nothing_asked_is_an_empty_answer(self, stored_repo):
        assert stored_repo.ids_by_rekordbox_id([]) == {}
        assert stored_repo.ids_by_rekordbox_id(iter(())) == {}

    def test_a_few_ids_are_found(self, stored_repo):
        found = stored_repo.ids_by_rekordbox_id(["3", "10"])
        assert found == expected(stored_repo, ["3", "10"])
        assert set(found) == {"3", "10"}

    def test_more_than_one_batch_of_ids_is_found(self, stored_repo):
        wanted = [str(n) for n in range(501)]
        found = stored_repo.ids_by_rekordbox_id(wanted)
        assert len(found) == 501
        assert found == expected(stored_repo, wanted)

    def test_more_than_the_lookup_limit_reads_the_table_and_answers_the_same(
        self, stored_repo
    ):
        wanted = [str(n) for n in range(track_repository._LOOKUP_BELOW + 1)]
        found = stored_repo.ids_by_rekordbox_id(wanted)
        assert len(found) == len(wanted)
        assert found == expected(stored_repo, wanted)

    def test_a_repeated_id_counts_once(self, stored_repo):
        found = stored_repo.ids_by_rekordbox_id(["7", "7", "7", "8"])
        assert set(found) == {"7", "8"}

    def test_ids_that_are_not_stored_are_left_out(self, stored_repo):
        for wanted in (
            ["nope", "5", str(STORED + 1)],
            ["nope", "5"]
            + [f"missing-{n}" for n in range(track_repository._LOOKUP_BELOW + 1)],
        ):
            found = stored_repo.ids_by_rekordbox_id(wanted)
            assert set(found) == {"5"}

    def test_a_generator_is_accepted(self, stored_repo):
        found = stored_repo.ids_by_rekordbox_id(str(n) for n in range(3))
        assert set(found) == {"0", "1", "2"}
