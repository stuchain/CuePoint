#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the batched DEC-002 upsert (LIBRARY-04).

``upsert_many_from_rekordbox`` exists because ``upsert_from_rekordbox`` cannot
be looped — it commits per track — but it must not become a second identity
rule. The test that matters most here runs both paths over the same data and
compares the result: if they ever diverge, someone's tags land on the wrong
track and nothing else notices.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
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
def repo(db):
    return TrackRepository(db)


def track(track_id, path="/m/a.mp3", title="T", artist="A", **kwargs):
    return LibraryTrack(
        rekordbox_track_id=track_id,
        title=title,
        artist=artist,
        file_path=path,
        **kwargs,
    )


def rows(db):
    return [
        (r["rekordbox_track_id"], r["file_path"], r["title"], r["created_at"])
        for r in db.connect().execute("SELECT * FROM tracks ORDER BY id")
    ]


@pytest.mark.unit
class TestInsertAndUpdate:
    def test_an_empty_import_writes_nothing(self, repo):
        result = repo.upsert_many_from_rekordbox([])
        assert (result.inserted, result.updated, result.relinked_count) == (0, 0, 0)
        assert repo.count() == 0

    def test_new_tracks_are_inserted(self, repo):
        result = repo.upsert_many_from_rekordbox(
            [track("1", "/m/1.mp3"), track("2", "/m/2.mp3")]
        )
        assert (result.inserted, result.updated) == (2, 0)
        assert result.total == 2
        assert repo.count() == 2

    def test_known_tracks_are_updated_not_duplicated(self, repo):
        repo.upsert_many_from_rekordbox([track("1", "/m/1.mp3", title="Old")])
        result = repo.upsert_many_from_rekordbox([track("1", "/m/1.mp3", title="New")])

        assert (result.inserted, result.updated) == (0, 1)
        assert repo.count() == 1
        assert repo.find_by_rekordbox_id("1").title == "New"

    def test_created_at_belongs_to_the_row_not_the_export(self, repo):
        repo.upsert_many_from_rekordbox([track("1", "/m/1.mp3")])
        first_seen = repo.find_by_rekordbox_id("1").created_at

        incoming = track("1", "/m/1.mp3", title="Renamed")
        incoming.created_at = "1999-01-01T00:00:00+00:00"
        repo.upsert_many_from_rekordbox([incoming])

        assert repo.find_by_rekordbox_id("1").created_at == first_seen

    def test_updated_at_moves_on_an_update(self, repo):
        repo.upsert_many_from_rekordbox([track("1", "/m/1.mp3")])
        before = repo.find_by_rekordbox_id("1").updated_at
        repo.find_by_rekordbox_id("1")

        incoming = track("1", "/m/1.mp3", title="Renamed")
        incoming.updated_at = "1999-01-01T00:00:00+00:00"
        repo.upsert_many_from_rekordbox([incoming])

        assert repo.find_by_rekordbox_id("1").updated_at >= before

    def test_a_mix_of_new_and_known(self, repo):
        repo.upsert_many_from_rekordbox([track("1", "/m/1.mp3")])
        result = repo.upsert_many_from_rekordbox(
            [track("1", "/m/1.mp3"), track("2", "/m/2.mp3"), track("3", "/m/3.mp3")]
        )
        assert (result.inserted, result.updated) == (2, 1)
        assert repo.count() == 3

    def test_every_dec034_field_survives_the_bulk_path(self, repo):
        repo.upsert_many_from_rekordbox(
            [
                track(
                    "1",
                    "/m/1.mp3",
                    rating=4,
                    play_count=7,
                    colour="0xFF007F",
                    date_added="2024-03-01",
                    comment="peak time",
                    duration_seconds=328,
                    bitrate=320,
                    bpm=122.0,
                    year=2022,
                    key="10B",
                    genre="House",
                    label="Anjunadeep",
                    album="Tataki",
                    remixer="Someone",
                )
            ]
        )
        stored = repo.find_by_rekordbox_id("1")
        assert (stored.rating, stored.play_count, stored.colour) == (4, 7, "0xFF007F")
        assert (stored.date_added, stored.comment) == ("2024-03-01", "peak time")
        assert (stored.duration_seconds, stored.bitrate) == (328, 320)
        assert (stored.bpm, stored.year, stored.key) == (122.0, 2022, "10B")


@pytest.mark.unit
class TestRelinking:
    """DEC-002: a renumbered TrackID with the same path keeps its row."""

    def test_a_renumbered_track_is_matched_by_path(self, repo):
        repo.upsert_many_from_rekordbox([track("100", "/m/song.mp3", title="Song")])
        original_id = repo.find_by_rekordbox_id("100").id

        result = repo.upsert_many_from_rekordbox(
            [track("200", "/m/song.mp3", title="Song")]
        )

        assert (result.inserted, result.updated) == (0, 1)
        assert result.relinked_count == 1
        assert repo.count() == 1, "not an insert and a delete"
        assert repo.find_by_rekordbox_id("200").id == original_id
        assert repo.find_by_rekordbox_id("100") is None

    def test_the_relink_is_reported_with_both_ids_and_the_path(self, repo):
        repo.upsert_many_from_rekordbox([track("100", "/m/song.mp3")])
        result = repo.upsert_many_from_rekordbox([track("200", "/m/song.mp3")])

        (relink,) = result.relinked
        assert relink.rekordbox_track_id == "200"
        assert relink.previous_rekordbox_track_id == "100"
        assert relink.file_path == "/m/song.mp3"

    def test_a_matching_track_id_is_not_a_relink(self, repo):
        repo.upsert_many_from_rekordbox([track("100", "/m/song.mp3")])
        result = repo.upsert_many_from_rekordbox([track("100", "/m/moved.mp3")])
        assert result.relinked_count == 0

    def test_paths_compare_across_platforms(self, repo):
        """A Windows-style path and its POSIX form are the same file."""
        repo.upsert_many_from_rekordbox([track("1", r"C:\Music\Song.mp3")])
        result = repo.upsert_many_from_rekordbox([track("2", "C:/Music/Song.mp3")])
        assert result.relinked_count == 1
        assert repo.count() == 1

    def test_a_track_with_no_path_cannot_relink(self, repo):
        repo.upsert_many_from_rekordbox([track("1", "")])
        result = repo.upsert_many_from_rekordbox([track("2", "")])
        assert (result.inserted, result.relinked_count) == (1, 0)
        assert repo.count() == 2


@pytest.mark.unit
class TestIdentityIsResolvedAgainstThePreImportState:
    """A row written by this import must never be matched again by it."""

    def test_two_incoming_tracks_sharing_a_path_stay_two_tracks(self, repo):
        """Rekordbox says they are two tracks, so the library must agree.

        Resolving against the live table instead would let the second one
        path-match the row the first had just inserted and overwrite it — the
        collection would silently lose a track.
        """
        result = repo.upsert_many_from_rekordbox(
            [
                track("1", "/m/same.mp3", title="First"),
                track("2", "/m/same.mp3", title="Second"),
            ]
        )
        assert (result.inserted, result.updated) == (2, 0)
        assert repo.count() == 2
        assert {r[2] for r in rows(repo._db)} == {"First", "Second"}

    def test_an_existing_row_is_claimed_only_once(self, repo):
        """Two renumbered tracks pointing at one row: one relinks, one inserts."""
        repo.upsert_many_from_rekordbox([track("100", "/m/song.mp3")])

        result = repo.upsert_many_from_rekordbox(
            [track("200", "/m/song.mp3"), track("300", "/m/song.mp3")]
        )

        assert (result.inserted, result.updated) == (1, 1)
        assert result.relinked_count == 1
        assert repo.count() == 2

    def test_a_shared_path_resolves_to_the_lowest_id(self, repo):
        """Matching find_by_normalized_path, which a single-track upsert uses.

        Two library rows can legitimately share a path, and the fallback has to
        pick the same one either way — otherwise a renumbered track lands on a
        different row depending on which code path ran, and its tags follow.
        """
        first = repo.add(track("10", "/m/same.mp3", title="First"))
        second = repo.add(track("11", "/m/same.mp3", title="Second"))
        assert first.id < second.id

        result = repo.upsert_many_from_rekordbox([track("99", "/m/same.mp3")])

        assert result.relinked_count == 1
        assert repo.find_by_rekordbox_id("99").id == first.id
        assert repo.find_by_rekordbox_id("11") is not None, "the other row is untouched"

    def test_a_shared_path_matches_what_the_single_track_path_picks(self, tmp_path):
        outcomes = []
        for mode in ("bulk", "single"):
            service = DatabaseService(db_path=tmp_path / f"shared-{mode}.db")
            try:
                MigrationRunner(service).migrate()
                repo = TrackRepository(service)
                repo.add(track("10", "/m/same.mp3"))
                repo.add(track("11", "/m/same.mp3"))
                if mode == "bulk":
                    repo.upsert_many_from_rekordbox([track("99", "/m/same.mp3")])
                else:
                    repo.upsert_from_rekordbox(track("99", "/m/same.mp3"))
                outcomes.append(repo.find_by_rekordbox_id("99").id)
            finally:
                service.close_all()
        assert outcomes[0] == outcomes[1]

    def test_order_within_the_import_does_not_change_the_counts(self, repo):
        repo.upsert_many_from_rekordbox([track("1", "/m/1.mp3")])
        forwards = repo.upsert_many_from_rekordbox(
            [track("1", "/m/1.mp3"), track("2", "/m/2.mp3")]
        )
        repo.delete_by_rekordbox_ids(["1", "2"])
        repo.upsert_many_from_rekordbox([track("1", "/m/1.mp3")])
        backwards = repo.upsert_many_from_rekordbox(
            [track("2", "/m/2.mp3"), track("1", "/m/1.mp3")]
        )
        assert (forwards.inserted, forwards.updated) == (
            backwards.inserted,
            backwards.updated,
        )


@pytest.mark.unit
class TestAgreesWithTheSingleTrackPath:
    """The guard against two identity rules drifting apart."""

    SCENARIOS = [
        pytest.param([("1", "/m/1.mp3")], [("1", "/m/1.mp3")], id="same-track"),
        pytest.param([("1", "/m/1.mp3")], [("2", "/m/1.mp3")], id="renumbered"),
        pytest.param([("1", "/m/1.mp3")], [("1", "/m/moved.mp3")], id="moved"),
        pytest.param([("1", "/m/1.mp3")], [("2", "/m/2.mp3")], id="new-track"),
        pytest.param([("1", "")], [("2", "")], id="no-path"),
        pytest.param(
            [("1", "/m/1.mp3"), ("2", "/m/2.mp3")],
            [("3", "/m/1.mp3"), ("2", "/m/2.mp3")],
            id="one-renumbered-one-not",
        ),
        pytest.param(
            [("1", r"C:\Music\A.mp3")], [("2", "c:/music/a.mp3")], id="path-case"
        ),
    ]

    @staticmethod
    def _state(repo):
        return sorted(
            (t.rekordbox_track_id, t.normalized_path, t.created_at)
            for t in repo.list_all()
        )

    @pytest.mark.parametrize("seed,second", SCENARIOS)
    def test_bulk_and_single_track_upserts_reach_the_same_state(
        self, tmp_path, seed, second
    ):
        outcomes = []
        for mode in ("bulk", "single"):
            service = DatabaseService(db_path=tmp_path / f"{mode}.db")
            try:
                MigrationRunner(service).migrate()
                repo = TrackRepository(service)
                for track_id, path in seed:
                    repo.add(track(track_id, path))
                if mode == "bulk":
                    result = repo.upsert_many_from_rekordbox(
                        [track(t, p) for t, p in second]
                    )
                    counts = (result.inserted, result.updated, result.relinked_count)
                else:
                    inserted = updated = relinked = 0
                    for track_id, path in second:
                        _, action, was_relinked = repo.upsert_from_rekordbox(
                            track(track_id, path)
                        )
                        inserted += action == "inserted"
                        updated += action == "updated"
                        relinked += bool(was_relinked)
                    counts = (inserted, updated, relinked)
                outcomes.append((counts, self._state(repo)))
            finally:
                service.close_all()

        bulk, single = outcomes
        assert bulk[0] == single[0], "counts differ between the two upsert paths"
        assert [row[:2] for row in bulk[1]] == [row[:2] for row in single[1]]


@pytest.mark.unit
class TestBatching:
    def test_a_batch_smaller_than_the_import_still_writes_everything(self, repo):
        result = repo.upsert_many_from_rekordbox(
            [track(str(i), f"/m/{i}.mp3") for i in range(250)], batch_size=7
        )
        assert result.inserted == 250
        assert repo.count() == 250

    def test_batching_does_not_change_update_counts(self, repo):
        incoming = [track(str(i), f"/m/{i}.mp3") for i in range(120)]
        repo.upsert_many_from_rekordbox(incoming, batch_size=5)
        again = repo.upsert_many_from_rekordbox(
            [track(str(i), f"/m/{i}.mp3") for i in range(120)], batch_size=5
        )
        assert (again.inserted, again.updated) == (0, 120)
        assert repo.count() == 120

    def test_the_whole_import_is_one_transaction(self, repo, db):
        """A failure part way must leave the table as it was.

        The second batch violates the unique index, so the statement raises
        after the first batch has already been sent — if each batch committed,
        the earlier rows would survive.
        """
        import sqlite3

        incoming = [track(str(i), f"/m/{i}.mp3") for i in range(10)]
        incoming.append(track("3", "/m/clash.mp3"))
        incoming[-1].rekordbox_track_id = "3"

        with pytest.raises(sqlite3.IntegrityError):
            repo.upsert_many_from_rekordbox(incoming, batch_size=4)

        assert repo.count() == 0, "a partial import was committed"
