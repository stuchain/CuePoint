#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The repository of each track's cue points and beat grid (WAVE-04).

What it must get right: a replacement is whole (a track keeps nothing it was
not given, and no other track is touched), it joins the caller's transaction
so marks commit with their tracks or not at all, its fingerprints are the
reader's own, and ``library.marks_read`` says which reader read them.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.track_marks import (
    EMPTY_FINGERPRINT,
    MARKS_INDEX,
    MARKS_VERSION,
    TrackMarks,
    marks_fingerprint,
)
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_marks_repository import TrackMarksRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner

pytestmark = pytest.mark.unit

CUES = (
    ("cue", None, 25, None, "Intro", None),
    ("cue", 0, 64025, None, "Drop", "#28e214"),
    ("loop", 2, 120025, 127525, "Build loop", "#ff8c00"),
)
GRID = ((120, 121.0, "4/4", 1), (60120, 122.5, "4/4", 3))


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def ids(db):
    TrackRepository(db).add_many(
        LibraryTrack(rekordbox_track_id=n, file_path=f"/m/{n}.mp3", title=n, artist="A")
        for n in ("1", "2", "3")
    )
    return [
        int(r[0]) for r in db.connect().execute("SELECT id FROM tracks ORDER BY id")
    ]


@pytest.fixture
def repo(db):
    return TrackMarksRepository(db)


class TestReplacing:
    def test_it_writes_marks_and_reads_them_back_in_order(self, repo, ids):
        assert repo.replace_many([(ids[0], CUES, GRID)]) == (3, 2)
        marks = repo.get(ids[0])
        assert marks == TrackMarks.from_values(ids[0], CUES, GRID)

    def test_a_replacement_is_whole(self, repo, ids):
        repo.replace_many([(ids[0], CUES, GRID)])
        repo.replace_many([(ids[0], CUES[:1], ())])
        marks = repo.get(ids[0])
        assert [c.values() for c in marks.cues] == list(CUES[:1])
        assert marks.grid == ()

    def test_a_track_given_nothing_loses_what_it_had(self, repo, ids):
        repo.replace_many([(ids[0], CUES, GRID)])
        repo.replace_many([(ids[0], (), ())])
        assert repo.get(ids[0]) == TrackMarks(track_id=ids[0])
        assert repo.counts() == (0, 0)

    def test_it_touches_no_track_it_was_not_given(self, repo, ids):
        repo.replace_many([(ids[0], CUES, GRID), (ids[1], CUES[1:], GRID[:1])])
        repo.replace_many([(ids[0], (), ())])
        assert len(repo.get(ids[1]).cues) == 2

    def test_it_writes_many_tracks_across_batches(self, repo, db):
        TrackRepository(db).add_many(
            LibraryTrack(
                rekordbox_track_id=f"x{n}",
                file_path=f"/x/{n}.mp3",
                title="t",
                artist="a",
            )
            for n in range(1203)
        )
        every = [int(r[0]) for r in db.connect().execute("SELECT id FROM tracks")]
        assert repo.replace_many((i, CUES[:1], GRID[:1]) for i in every) == (1203, 1203)
        assert repo.counts() == (1203, 1203)

    def test_it_joins_the_caller_s_transaction(self, repo, db, ids):
        with pytest.raises(RuntimeError):
            with db.transaction():
                repo.replace_many([(ids[0], CUES, GRID)])
                repo.mark_read("2026-10-05T00:00:00+00:00")
                raise RuntimeError("the import failed after its marks")
        assert repo.counts() == (0, 0)
        assert repo.is_read() is False

    def test_nothing_to_write_writes_nothing(self, repo):
        assert repo.replace_many([]) == (0, 0)


class TestFingerprints:
    def test_each_track_s_is_the_reader_s(self, repo, ids):
        repo.replace_many(
            [(ids[0], CUES, GRID), (ids[1], (), GRID[:1]), (ids[2], CUES[:1], ())]
        )
        assert repo.fingerprints() == {
            ids[0]: marks_fingerprint(CUES, GRID),
            ids[1]: marks_fingerprint((), GRID[:1]),
            ids[2]: marks_fingerprint(CUES[:1], ()),
        }

    def test_a_track_without_marks_is_absent(self, repo, ids):
        repo.replace_many([(ids[1], CUES, ())])
        prints = repo.fingerprints()
        assert ids[0] not in prints
        assert prints.get(ids[0], EMPTY_FINGERPRINT) == marks_fingerprint((), ())

    def test_they_match_the_model_s(self, repo, ids):
        repo.replace_many([(ids[0], CUES, GRID)])
        assert repo.fingerprints()[ids[0]] == repo.get(ids[0]).fingerprint


class TestMarksRead:
    def test_a_new_library_has_not_read_them(self, repo):
        assert repo.is_read() is False
        assert repo.read_record() is None

    def test_reading_them_is_recorded_with_its_version(self, repo):
        repo.mark_read("2026-10-05T00:00:00+00:00")
        record = repo.read_record()
        assert record is not None
        assert (record.name, record.version) == (MARKS_INDEX, MARKS_VERSION)
        assert repo.is_read() is True

    def test_another_version_s_reading_does_not_count(self, repo, db):
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO derived_indexes (name, version, built_at) VALUES (?, ?, ?)",
                (MARKS_INDEX, MARKS_VERSION + 1, "2026-10-05T00:00:00+00:00"),
            )
        assert repo.is_read() is False

    def test_it_leaves_the_name_index_s_records_alone(self, repo, db):
        credits = TrackCreditRepository(db)
        credits.mark_built(1, "2026-10-01T00:00:00+00:00")
        repo.mark_read("2026-10-05T00:00:00+00:00")
        assert credits.is_current(1)
        assert {r.name for r in credits.built()} == {"label_keys", "track_credits"}


class TestManyTracks:
    """A waveform batch reads 200 tracks' marks at once (WAVE-05)."""

    def test_each_track_s_marks_as_one_read_gives_them(self, repo, ids):
        repo.replace_many([(ids[0], CUES, GRID), (ids[2], CUES[:1], ())])

        found = repo.get_many(ids)

        assert set(found) == set(ids)
        for track_id in ids:
            assert found[track_id] == repo.get(track_id)
        assert found[ids[1]] == TrackMarks(track_id=ids[1])

    def test_unknown_and_repeated_ids_answer_once_each(self, repo, ids):
        repo.replace_many([(ids[0], CUES, GRID)])

        found = repo.get_many([ids[0], 999_999, ids[0]])

        assert list(found) == [ids[0], 999_999]
        assert found[999_999] == TrackMarks(track_id=999_999)

    def test_nothing_asked_reads_nothing(self, repo):
        assert repo.get_many([]) == {}

    def test_more_tracks_than_one_query_takes(self, repo, db):
        TrackRepository(db).add_many(
            LibraryTrack(
                rekordbox_track_id=f"m{n}",
                file_path=f"/m/m{n}.mp3",
                title=f"m{n}",
                artist="A",
            )
            for n in range(1_100)
        )
        every = [int(r[0]) for r in db.connect().execute("SELECT id FROM tracks")]
        repo.replace_many((track_id, CUES[:1], GRID[:1]) for track_id in every)

        found = repo.get_many(every)

        assert len(found) == len(every)
        assert all(len(marks.cues) == 1 for marks in found.values())
        assert all(len(marks.grid) == 1 for marks in found.values())
