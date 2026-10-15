"""Where each playlist stands, per status (G4 2.2).

Counts are of distinct tracks; ``waiting`` is the Match tab's number (needs
review plus changed since decided); a running match job is shared by every
playlist that holds a track of its plan.
"""

from __future__ import annotations

import pytest

from cuepoint.persistence.match_status_repository import MatchStatusRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_status_service import MatchStatusService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.persistence.match_status_support import (
    add_job_plan,
    add_playlist,
    add_track,
    set_state,
)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def service(db) -> MatchStatusService:
    return MatchStatusService(MatchStatusRepository(db))


def status_of(statuses, playlist_id):
    [found] = [p for p in statuses.playlists if p.id == playlist_id]
    return found


@pytest.mark.unit
class TestStatusCounts:
    def test_each_status_is_counted_and_a_track_has_one(self, db, service):
        tracks = [add_track(db, f"/m/{i}.mp3") for i in range(7)]
        set_state(db, tracks[0], "accepted")
        set_state(db, tracks[1], "rejected")
        set_state(db, tracks[2], "no_match")
        set_state(db, tracks[3], "needs_review")
        # tracks[4], tracks[5] never matched; tracks[6] is in no playlist
        playlist = add_playlist(db, "All", tracks[:6])

        counts = status_of(service.playlists(), playlist).counts

        assert (
            counts.track_count,
            counts.not_matched,
            counts.waiting,
            counts.accepted,
            counts.rejected,
            counts.no_match,
        ) == (6, 2, 1, 1, 1, 1)

    def test_waiting_adds_the_tracks_changed_since_you_decided(self, db, service):
        review, disputed, plain = (add_track(db, f"/m/{i}.mp3") for i in range(3))
        set_state(db, review, "needs_review")
        set_state(db, disputed, "accepted", disputed=True)
        set_state(db, plain, "accepted")
        playlist = add_playlist(db, "P", [review, disputed, plain])

        counts = status_of(service.playlists(), playlist).counts

        assert counts.waiting == 2
        assert counts.accepted == 2  # a disputed accept is still accepted

    def test_waiting_is_the_two_counts_the_match_tab_adds(self):
        # sectionCounts: count("needs_review") + count("disputed").
        from cuepoint.services.health_service import HEALTH_RULES

        assert {"needs_review", "disputed"} <= {rule.id for rule in HEALTH_RULES}

    def test_unsaved_is_counted_per_playlist(self, db, service):
        a, b = add_track(db, "/m/a.mp3"), add_track(db, "/m/b.mp3")
        TrackMetadataRepository(db).set_override(a, "genre", "Techno")
        first = add_playlist(db, "First", [a, b])
        second = add_playlist(db, "Second", [b])

        statuses = service.playlists()

        assert status_of(statuses, first).counts.unsaved == 1
        assert status_of(statuses, second).counts.unsaved == 0
        assert statuses.whole_library.unsaved == 1

    def test_an_empty_playlist_counts_nothing(self, db, service):
        add_track(db)
        empty = add_playlist(db, "Empty")

        found = status_of(service.playlists(), empty)

        assert found.counts == type(found.counts)()
        assert found.running is None

    def test_a_track_in_a_playlist_twice_is_one_track(self, db, service):
        a = add_track(db)
        playlist = add_playlist(db, "Twice", [a, a])
        counts = status_of(service.playlists(), playlist).counts
        assert (counts.track_count, counts.not_matched) == (1, 1)

    def test_the_whole_library_counts_tracks_in_no_playlist_too(self, db, service):
        a, b = add_track(db, "/m/a.mp3"), add_track(db, "/m/b.mp3")
        set_state(db, b, "accepted")
        add_playlist(db, "P", [a])

        whole = service.playlists().whole_library

        assert (whole.track_count, whole.not_matched, whole.accepted) == (2, 1, 1)


@pytest.mark.unit
class TestWhichPlaylists:
    def test_a_folder_is_not_listed_and_its_name_is_in_the_path(self, db, service):
        a = add_track(db)
        folder = add_playlist(db, "Gigs", kind="folder")
        inner = add_playlist(db, "2026", kind="folder", parent=folder)
        playlist = add_playlist(db, "Friday", [a], parent=inner)
        top = add_playlist(db, "Top", [a], position=1)

        statuses = service.playlists()

        assert {p.id for p in statuses.playlists} == {playlist, top}
        assert status_of(statuses, playlist).path == "Gigs / 2026"
        assert status_of(statuses, top).path == ""

    def test_a_name_with_a_slash_does_not_split_the_path(self, db, service):
        folder = add_playlist(db, "A/B", kind="folder")
        playlist = add_playlist(db, "C", parent=folder)
        assert status_of(service.playlists(), playlist).path == "A/B"

    def test_the_order_is_the_tree_in_document_order(self, db, service):
        late = add_playlist(db, "Late", position=2)
        folder = add_playlist(db, "Folder", kind="folder", position=1)
        inside = add_playlist(db, "Inside", parent=folder)
        early = add_playlist(db, "Early", position=0)
        assert [p.id for p in service.playlists().playlists] == [
            early,
            inside,
            late,
        ]

    def test_no_playlists_is_an_empty_list_and_a_library(self, db, service):
        add_track(db)
        statuses = service.playlists()
        assert statuses.playlists == ()
        assert statuses.whole_library.track_count == 1


@pytest.mark.unit
class TestRunning:
    def test_no_job_means_null_everywhere(self, db, service):
        a = add_track(db)
        add_playlist(db, "P", [a])
        statuses = service.playlists()
        assert statuses.playlists[0].running is None
        assert statuses.whole_library_running is None

    def test_a_job_shared_by_two_playlists_reports_to_both(self, db, service):
        a, b, c = (add_track(db, f"/m/{i}.mp3") for i in range(3))
        one = add_playlist(db, "One", [a, b])
        two = add_playlist(db, "Two", [b, c])
        other = add_playlist(db, "Other", [c])
        add_job_plan(db, "job-1", {a: True, b: False})

        statuses = service.playlists("job-1")

        first = status_of(statuses, one).running
        second = status_of(statuses, two).running
        assert (first.job_id, first.done, first.total) == ("job-1", 1, 2)
        assert (second.job_id, second.done, second.total) == ("job-1", 0, 1)
        assert status_of(statuses, other).running is None
        whole = statuses.whole_library_running
        assert (whole.done, whole.total) == (1, 2)

    def test_another_job_s_plan_is_not_counted(self, db, service):
        a = add_track(db)
        playlist = add_playlist(db, "P", [a])
        add_job_plan(db, "old", {a: True})
        assert status_of(service.playlists("new"), playlist).running is None


@pytest.mark.unit
class TestOneSnapshot:
    def test_the_list_is_read_in_one_transaction_that_ends_with_it(self, db, service):
        a = add_track(db)
        add_playlist(db, "P", [a])
        seen = []
        original = MatchStatusRepository.counts

        def watching(self):
            seen.append(db.connect().in_transaction)
            return original(self)

        MatchStatusRepository.counts = watching
        try:
            service.playlists()
        finally:
            MatchStatusRepository.counts = original

        assert seen == [True]
        assert not db.connect().in_transaction

    def test_it_joins_a_transaction_that_is_open_and_leaves_it_open(self, db):
        repository = MatchStatusRepository(db)
        with db.transaction():
            with repository.snapshot():
                pass
            assert db.connect().in_transaction
