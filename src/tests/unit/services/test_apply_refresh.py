#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for applying a refresh (LIBRARY-09).

This is the only operation in Phase 3 that destroys user data. DEC-003 deletes
a track that has left Rekordbox and takes its tags, ratings, history and
playlist membership with it, and nothing brings those back. So the tests here
are weighted towards the two things that would make that unacceptable:

**A failure must leave the library exactly as it was.** Not "mostly", and in
particular not "the tracks are already gone". Several tests induce a failure at
a different point of the apply and assert the whole database is byte-for-byte
what it was before — the same rows, the same ``updated_at`` values.

**The apply must do exactly what the preview promised.** DEC-032's whole point
is that a user confirms a number. Every test that applies a diff computed it
first and compares the two.
"""

from __future__ import annotations

import pytest

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError, ValidationError
from cuepoint.models.references import NO_REFERENCES, ReferenceSummary
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import (
    EVENT_LIBRARY_REFRESHED,
    ImportCancelled,
    LibraryImportService,
    RefreshSummary,
)
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.services.test_refresh_diff import (
    BASE_PLAYLISTS,
    BASE_TRACKS,
    track_xml,
    write_export,
)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db):
    return TrackRepository(db)


@pytest.fixture
def playlists(db):
    return PlaylistRepository(db)


@pytest.fixture
def sources(db):
    return LibrarySourceRepository(db)


@pytest.fixture
def service(db, tracks, playlists, sources):
    return LibraryImportService(tracks, playlists, sources, db)


@pytest.fixture
def imported(service, tmp_path):
    """A library imported from the base export, and the file it came from."""
    export = write_export(tmp_path, BASE_TRACKS, BASE_PLAYLISTS, name="base.xml")
    service.import_rekordbox_xml(export)
    return export


def snapshot(db):
    """Everything a rolled-back refresh must leave untouched.

    Includes ``updated_at`` on purpose: an apply that rolled its deletions back
    but committed its updates would otherwise pass with the row counts intact.
    """
    connection = db.connect()
    return {
        "tracks": [
            tuple(row)
            for row in connection.execute(
                "SELECT id, rekordbox_track_id, title, artist, file_path, "
                "rating, updated_at FROM tracks ORDER BY id"
            )
        ],
        "playlists": [
            tuple(row)
            for row in connection.execute(
                "SELECT id, name, kind, rekordbox_path, position "
                "FROM rekordbox_playlists ORDER BY id"
            )
        ],
        "entries": [
            tuple(row)
            for row in connection.execute(
                "SELECT playlist_id, position, track_id "
                "FROM rekordbox_playlist_tracks ORDER BY playlist_id, position"
            )
        ],
        "source": [
            tuple(row)
            for row in connection.execute(
                "SELECT xml_path, track_count, playlist_count FROM library_source"
            )
        ],
    }


def logical_state(db):
    """What the library *means*, ignoring row identity for the playlist mirror.

    A refresh rewrites the mirror wholesale (LIBRARY-03), so its primary keys
    change even when the tree did not. Track ids are kept — those are the
    identity DEC-002 promises to preserve, and a refresh that churned them would
    be a bug — but playlists are compared by path and membership by the
    Rekordbox ids of the tracks in them.
    """
    connection = db.connect()
    return {
        "tracks": [
            tuple(row)
            for row in connection.execute(
                "SELECT id, rekordbox_track_id, title, artist, file_path, rating "
                "FROM tracks ORDER BY id"
            )
        ],
        "playlists": [
            tuple(row)
            for row in connection.execute(
                "SELECT name, kind, rekordbox_path, position, depth "
                "FROM rekordbox_playlists ORDER BY rekordbox_path, position"
            )
        ],
        "entries": [
            tuple(row)
            for row in connection.execute(
                "SELECT p.rekordbox_path, e.position, t.rekordbox_track_id "
                "FROM rekordbox_playlist_tracks e "
                "JOIN rekordbox_playlists p ON p.id = e.playlist_id "
                "JOIN tracks t ON t.id = e.track_id "
                "ORDER BY p.rekordbox_path, e.position"
            )
        ],
    }


@pytest.mark.unit
class TestTheApplyMatchesThePreview:
    """DEC-032: a user confirms a number, so the apply owes them that number."""

    def test_it_applies_additions_changes_and_removals(
        self, service, tracks, imported, tmp_path
    ):
        edited = write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One", "A"),
                track_xml("2", "/m/two.mp3", "Two RENAMED", "B"),
                track_xml("4", "/m/four.mp3", "Four", "D"),
            ],
            BASE_PLAYLISTS,
            name="edited.xml",
        )

        diff = service.compute_refresh_diff(edited)
        assert (diff.added.count, diff.changed.count, diff.removed.count) == (1, 1, 1)

        summary = service.apply_refresh(diff)

        assert summary.tracks_inserted == diff.added.count
        assert summary.tracks_deleted == diff.removed.count
        assert summary.tracks_updated == 2
        assert tracks.count() == 3
        assert {track.rekordbox_track_id for track in tracks.list_all(limit=10)} == {
            "1",
            "2",
            "4",
        }
        assert tracks.find_by_rekordbox_id("2").title == "Two RENAMED"
        assert tracks.find_by_rekordbox_id("3") is None

    def test_a_diff_with_nothing_in_it_changes_nothing(
        self, service, db, imported, tracks
    ):
        before_rows = snapshot(db)
        before = logical_state(db)
        diff = service.compute_refresh_diff(imported)
        assert diff.is_empty

        summary = service.apply_refresh(diff)

        assert summary.tracks_deleted == 0
        assert summary.tracks_inserted == 0
        assert logical_state(db) == before
        assert snapshot(db)["tracks"] != before_rows["tracks"], (
            "an apply rewrites every track row, so updated_at moves; if it did "
            "not, the rollback tests below would be proving nothing"
        )

    def test_applying_the_same_diff_twice_is_harmless(
        self, service, tracks, imported, tmp_path
    ):
        """A user who clicks twice, or a job retried after a timeout."""
        edited = write_export(
            tmp_path,
            [track_xml("1", "/m/one.mp3", "One", "A")],
            BASE_PLAYLISTS,
            name="edited.xml",
        )
        diff = service.compute_refresh_diff(edited)

        first = service.apply_refresh(diff)
        second = service.apply_refresh(diff)

        assert first.tracks_deleted == 2
        assert second.tracks_deleted == 0, "the second apply had nothing left to remove"
        assert second.tracks_inserted == 0
        assert second.tracks_updated == 1
        assert tracks.count() == 1

    def test_an_emptied_collection_removes_everything(
        self, service, tracks, playlists, imported, tmp_path
    ):
        """The extreme case, and the one an off-by-one would hide."""
        empty = write_export(tmp_path, [], name="empty.xml")
        diff = service.compute_refresh_diff(empty)
        assert diff.removed.count == 3

        summary = service.apply_refresh(diff)

        assert summary.tracks_deleted == 3
        assert tracks.count() == 0
        assert playlists.count() == 0

    def test_the_source_record_follows_the_refreshed_file(
        self, service, sources, imported, tmp_path
    ):
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3")], name="edited.xml"
        )
        summary = service.apply_refresh(service.compute_refresh_diff(edited))

        assert summary.source.xml_path == edited
        assert sources.get().xml_path == edited
        assert sources.get().track_count == 1


@pytest.mark.unit
class TestDeletionsTakeWhatIsAttachedToThem:
    def test_a_deleted_track_loses_its_playlist_membership(
        self, service, db, tracks, imported, tmp_path
    ):
        """LIBRARY-03's cascading foreign key, exercised through a real refresh.

        Membership is rewritten wholesale by every refresh, so a cascade that
        silently stopped working would not show up there. Asserted directly
        against the row the deleted track used to occupy.
        """
        doomed_id = tracks.find_by_rekordbox_id("3").id
        connection = db.connect()
        assert (
            connection.execute(
                "SELECT count(*) FROM rekordbox_playlist_tracks WHERE track_id = ?",
                (doomed_id,),
            ).fetchone()[0]
            == 1
        )

        edited = write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One", "A"),
                track_xml("2", "/m/two.mp3", "Two", "B"),
            ],
            BASE_PLAYLISTS,
            name="edited.xml",
        )
        service.apply_refresh(service.compute_refresh_diff(edited))

        assert (
            connection.execute(
                "SELECT count(*) FROM rekordbox_playlist_tracks WHERE track_id = ?",
                (doomed_id,),
            ).fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM rekordbox_playlist_tracks"
            ).fetchone()[0]
            == 2
        )

    def test_a_relinked_track_keeps_its_row_rather_than_being_deleted(
        self, service, tracks, imported, tmp_path
    ):
        """DEC-002: a Rekordbox renumbering must not read as a mass deletion."""
        original_id = tracks.find_by_rekordbox_id("1").id
        renumbered = write_export(
            tmp_path,
            [
                track_xml("101", "/m/one.mp3", "One", "A"),
                track_xml("102", "/m/two.mp3", "Two", "B"),
                track_xml("103", "/m/three.mp3", "Three", "C"),
            ],
            BASE_PLAYLISTS,
            name="renumbered.xml",
        )

        summary = service.apply_refresh(service.compute_refresh_diff(renumbered))

        assert summary.tracks_deleted == 0
        assert summary.relinked_count == 3
        assert tracks.count() == 3
        assert tracks.find_by_rekordbox_id("101").id == original_id


@pytest.mark.unit
class TestAFailureLeavesTheLibraryAsItWas:
    """The property the whole step exists for.

    Each test breaks the apply at a different point, then asserts the database
    is exactly what it was before — including ``updated_at``, so a partial
    commit of the upserts cannot hide behind unchanged row counts.
    """

    @staticmethod
    def _edited(tmp_path):
        return write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One CHANGED", "A"),
                track_xml("4", "/m/four.mp3", "Four", "D"),
            ],
            BASE_PLAYLISTS,
            name="edited.xml",
        )

    def test_a_failure_after_the_deletions_rolls_them_back(
        self, service, db, tracks, imported, tmp_path
    ):
        """The worst case: deletions committed, then the refresh dies."""
        before = snapshot(db)
        diff = service.compute_refresh_diff(self._edited(tmp_path))
        assert diff.removed.count == 2

        real_replace_tree = service._playlists.replace_tree

        def explode(nodes):
            # Fails after the upserts and the deletions, before the mirror.
            raise RuntimeError("disk gave up")

        service._playlists.replace_tree = explode
        with pytest.raises(RuntimeError, match="disk gave up"):
            service.apply_refresh(diff)
        service._playlists.replace_tree = real_replace_tree

        assert snapshot(db) == before
        assert tracks.count() == 3

    def test_a_failure_writing_the_source_record_rolls_everything_back(
        self, service, db, imported, tmp_path
    ):
        """The last write in the transaction, so the most of it is at risk."""
        before = snapshot(db)
        diff = service.compute_refresh_diff(self._edited(tmp_path))

        def explode(record):
            raise RuntimeError("no room left")

        service._source.replace = explode
        with pytest.raises(RuntimeError, match="no room left"):
            service.apply_refresh(diff)

        assert snapshot(db) == before

    def test_a_failure_part_way_through_the_tracks_rolls_back(
        self, service, db, imported, tmp_path
    ):
        """Fails inside the streaming upsert, where most of the time is spent."""
        before = snapshot(db)
        diff = service.compute_refresh_diff(self._edited(tmp_path))

        real_delete_many = service._tracks.delete_many

        def explode(ids):
            raise RuntimeError("cable unplugged")

        service._tracks.delete_many = explode
        with pytest.raises(RuntimeError, match="cable unplugged"):
            service.apply_refresh(diff)
        service._tracks.delete_many = real_delete_many

        assert snapshot(db) == before

    def test_cancelling_mid_apply_applies_nothing(
        self, service, db, imported, tmp_path
    ):
        before = snapshot(db)
        diff = service.compute_refresh_diff(self._edited(tmp_path))
        seen = {"count": 0}

        def cancel_after_one():
            seen["count"] += 1
            return seen["count"] > 1

        with pytest.raises(ImportCancelled):
            service.apply_refresh(diff, should_cancel=cancel_after_one)

        assert snapshot(db) == before

    def test_cancelling_before_it_starts_applies_nothing(
        self, service, db, imported, tmp_path
    ):
        before = snapshot(db)
        diff = service.compute_refresh_diff(self._edited(tmp_path))

        with pytest.raises(ImportCancelled, match="before the refresh began"):
            service.apply_refresh(diff, should_cancel=lambda: True)

        assert snapshot(db) == before

    def test_a_file_that_is_not_a_collection_is_refused_before_anything(
        self, service, db, imported, tmp_path
    ):
        before = snapshot(db)
        bad = tmp_path / "not-a-collection.xml"
        bad.write_text("<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>", encoding="utf-8")
        diff = service.compute_refresh_diff(imported)
        diff.xml_path = str(bad)

        with pytest.raises(ValidationError) as excinfo:
            service.apply_refresh(diff)

        assert excinfo.value.error_code == "LIBRARY_XML_NO_COLLECTION"
        assert snapshot(db) == before

    def test_the_rollback_is_real_and_not_an_empty_transaction(
        self, service, db, imported, tmp_path
    ):
        """Guards the guard.

        The tests above would all pass against an apply that wrote nothing at
        all. This one proves the same edited export does change the library when
        it is allowed to finish, so the assertions above are about a rollback
        rather than about an apply that never did anything.
        """
        before = snapshot(db)
        diff = service.compute_refresh_diff(self._edited(tmp_path))

        service.apply_refresh(diff)

        assert snapshot(db) != before


@pytest.mark.unit
class TestTheApplyAsksTheSeam:
    """DEC-011, and the claim ``DELETION_CALLERS_ALLOWED`` makes on its behalf."""

    def test_it_asks_about_exactly_the_ids_it_deletes(
        self, db, tracks, playlists, sources, imported, tmp_path
    ):
        asked = []

        class Recording(LibraryService):
            def references_for(self, track_ids):
                asked.append(sorted(track_ids))
                return NO_REFERENCES

        service = LibraryImportService(
            tracks, playlists, sources, db, library_service=Recording(tracks)
        )
        doomed = sorted(tracks.find_by_rekordbox_id(rid).id for rid in ("2", "3"))
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )

        summary = service.apply_refresh(service.compute_refresh_diff(edited))

        assert asked[-1] == doomed, "the seam was not asked about what was deleted"
        assert summary.tracks_deleted == 2

    def test_it_asks_while_the_tracks_are_still_there(
        self, db, tracks, playlists, sources, imported, tmp_path
    ):
        """Order, not just occurrence — and it is not a stylistic preference.

        Deleting cascades. If the delete ran first, the Collection membership
        Phase 6 will count would already have been cascaded away and the seam
        would answer zero every time, from inside a transaction that then
        happily commits. The refusal would be dead code and nobody would notice
        until a user lost a Collection.

        Asserted by having the seam look at the library at the moment it is
        asked, which is the only way to see the order from outside.
        """
        present = []

        class Looking(LibraryService):
            def references_for(self, track_ids):
                ids = list(track_ids)
                present.append(
                    db.connect()
                    .execute(
                        "SELECT count(*) FROM tracks WHERE id IN "
                        f"({','.join('?' * len(ids))})",
                        ids,
                    )
                    .fetchone()[0]
                )
                return NO_REFERENCES

        service = LibraryImportService(
            tracks, playlists, sources, db, library_service=Looking(tracks)
        )
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )
        diff = service.compute_refresh_diff(edited)
        present.clear()

        service.apply_refresh(diff)

        assert present == [2], (
            "the seam was asked after the tracks were already deleted, so from "
            "Phase 6 it would answer zero for every refresh"
        )

    def test_it_does_not_ask_when_nothing_would_be_deleted(
        self, db, tracks, playlists, sources, imported
    ):
        """An unnecessary prompt is how a user learns to click through them."""
        asked = []

        class Recording(LibraryService):
            def references_for(self, track_ids):
                asked.append(sorted(track_ids))
                return NO_REFERENCES

        service = LibraryImportService(
            tracks, playlists, sources, db, library_service=Recording(tracks)
        )
        diff = service.compute_refresh_diff(imported)
        asked.clear()  # LIBRARY-07's preview asks too; this is about the apply.

        service.apply_refresh(diff)

        assert asked == []

    def test_references_without_confirmation_refuse_and_delete_nothing(
        self, db, tracks, playlists, sources, imported, tmp_path
    ):
        """The Phase 6 path, exercised now with a seam that answers.

        Unreachable in this build — nothing can reference a track — which is why
        it is worth pinning: the refusal, its error code and the rollback that
        goes with it are all in place before there is anything to refuse.
        """
        before = snapshot(db)

        class Holding(LibraryService):
            def references_for(self, track_ids):
                return ReferenceSummary(
                    collection_count=2,
                    set_count=1,
                    referenced_track_ids=tuple(track_ids),
                )

        service = LibraryImportService(
            tracks, playlists, sources, db, library_service=Holding(tracks)
        )
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )
        diff = service.compute_refresh_diff(edited)

        with pytest.raises(ValidationError) as excinfo:
            service.apply_refresh(diff)

        assert excinfo.value.error_code == "LIBRARY_REFRESH_NEEDS_CONFIRMATION"
        assert excinfo.value.context["collection_count"] == 2
        assert excinfo.value.context["set_count"] == 1
        assert excinfo.value.context["referenced_track_count"] == 2
        assert snapshot(db) == before, "a refused refresh must change nothing"

    def test_confirmation_lets_it_through_and_reports_what_was_held(
        self, db, tracks, playlists, sources, imported, tmp_path
    ):
        class Holding(LibraryService):
            def references_for(self, track_ids):
                return ReferenceSummary(
                    collection_count=2,
                    set_count=1,
                    referenced_track_ids=tuple(track_ids),
                )

        service = LibraryImportService(
            tracks, playlists, sources, db, library_service=Holding(tracks)
        )
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )
        diff = service.compute_refresh_diff(edited)

        summary = service.apply_refresh(diff, confirm_references=True)

        assert summary.tracks_deleted == 2
        assert summary.references.collection_count == 2
        assert tracks.count() == 1

    def test_a_service_without_the_seam_still_deletes(
        self, service, tracks, imported, tmp_path
    ):
        """The seam is optional wiring; the refresh is not."""
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )
        summary = service.apply_refresh(service.compute_refresh_diff(edited))

        assert summary.tracks_deleted == 2
        assert summary.references == NO_REFERENCES


@pytest.mark.unit
class TestRemovalsAreRecomputedNotReplayed:
    def test_a_track_that_came_back_since_the_preview_is_not_deleted(
        self, service, tracks, imported, tmp_path
    ):
        """The preview said "remove 3"; by apply time the file has it again.

        Replaying the diff's list would delete a track the export still
        contains, and DEC-003 makes that unrecoverable. Recomputing from the
        file the apply actually reads cannot.
        """
        without_three = write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One", "A"),
                track_xml("2", "/m/two.mp3", "Two", "B"),
            ],
            name="edited.xml",
        )
        diff = service.compute_refresh_diff(without_three)
        assert diff.removed.count == 1

        # The user re-exports before confirming, and track 3 is back.
        write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One", "A"),
                track_xml("2", "/m/two.mp3", "Two", "B"),
                track_xml("3", "/m/three.mp3", "Three", "C"),
            ],
            name="edited.xml",
        )

        summary = service.apply_refresh(diff)

        assert summary.tracks_deleted == 0
        assert tracks.find_by_rekordbox_id("3") is not None
        assert tracks.count() == 3


@pytest.mark.unit
class TestTheActivityFeedRecordsIt:
    def test_a_refresh_records_what_it_did(
        self, db, tracks, playlists, sources, imported, tmp_path
    ):
        activity = ActivityService(ActivityRepository(db), tracks)
        service = LibraryImportService(
            tracks, playlists, sources, db, activity_service=activity
        )
        edited = write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One", "A"),
                track_xml("9", "/m/nine.mp3", "Nine", "N"),
            ],
            name="edited.xml",
        )

        service.apply_refresh(service.compute_refresh_diff(edited))

        (event,) = [
            item
            for item in ActivityRepository(db).recent_events(limit=20)
            if item.type == EVENT_LIBRARY_REFRESHED
        ]
        assert event.detail["deleted"] == 2
        assert event.detail["inserted"] == 1
        assert event.detail["xml_path"] == edited
        assert "removed" in event.summary

    def test_a_failing_feed_does_not_fail_a_committed_refresh(
        self, db, tracks, playlists, sources, imported, tmp_path
    ):
        """The deletions are already committed; failing now would be a lie."""

        class Broken:
            def record_event(self, *args, **kwargs):
                raise RuntimeError("feed is down")

        service = LibraryImportService(
            tracks, playlists, sources, db, activity_service=Broken()
        )
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )

        summary = service.apply_refresh(service.compute_refresh_diff(edited))

        assert summary.tracks_deleted == 2
        assert tracks.count() == 1


@pytest.mark.unit
class TestProgressAndSummary:
    def test_progress_reports_both_phases(self, service, imported, tmp_path):
        seen = []
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )
        service.apply_refresh(
            service.compute_refresh_diff(edited),
            on_progress=lambda done, total, phase: seen.append(phase),
        )

        assert "tracks" in seen
        assert seen[-1] == "playlists"

    def test_the_summary_line_names_the_removals(self):
        summary = RefreshSummary(
            source=None,
            tracks_inserted=1,
            tracks_updated=5,
            tracks_deleted=2,
            relinked=(),
            playlists=None,
            references=NO_REFERENCES,
            duration_seconds=0.5,
        )
        line = summary.summary_line()

        assert line.startswith("Library refreshed")
        assert "2 removed" in line
        assert "1 added" in line
        assert "6 tracks now" in line

    def test_a_quiet_refresh_still_says_something(self):
        summary = RefreshSummary(
            source=None,
            tracks_inserted=0,
            tracks_updated=3,
            tracks_deleted=0,
            relinked=(),
            playlists=None,
            references=NO_REFERENCES,
            duration_seconds=0.1,
        )
        assert summary.summary_line() == "Library refreshed — 3 updated, 3 tracks now"


@pytest.mark.unit
class TestTheImportAndTheRefreshShareTheWrite:
    """LIBRARY-09's backward-compatibility requirement, asserted rather than said."""

    def test_an_import_is_a_refresh_that_deletes_nothing(
        self, service, tracks, imported, tmp_path
    ):
        """Same file, both paths: identical library, different deletion policy."""
        edited = write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One", "A"),
                track_xml("4", "/m/four.mp3", "Four", "D"),
            ],
            name="edited.xml",
        )

        imported_summary = service.import_rekordbox_xml(edited)

        assert imported_summary.tracks_inserted == 1
        assert tracks.count() == 4, "an import never removes what the file dropped"

        summary = service.apply_refresh(service.compute_refresh_diff(edited))

        assert summary.tracks_deleted == 2
        assert tracks.count() == 2

    def test_a_failed_import_now_rolls_back_too(
        self, service, db, tracks, playlists, sources, tmp_path
    ):
        """A bonus of sharing the write, and worth pinning so it is not lost.

        Before LIBRARY-09 an import that failed after its tracks were committed
        left them behind, and relied on withholding the source record to make
        the library *describe* itself as un-imported. Now there is nothing to
        withhold.
        """
        export = write_export(tmp_path, BASE_TRACKS, BASE_PLAYLISTS, name="base.xml")

        def explode(nodes):
            raise RuntimeError("disk gave up")

        service._playlists.replace_tree = explode
        with pytest.raises(RuntimeError, match="disk gave up"):
            service.import_rekordbox_xml(export)

        assert tracks.count() == 0, "a failed import left tracks behind"
        assert sources.get() is None

    def test_the_writes_are_one_transaction(self, service, imported, tmp_path):
        """Proves the transaction is real, not that the code merely says so.

        ``DatabaseService.transaction()`` refuses to nest, so opening one from
        inside the apply is only possible if the apply has not opened its own.
        """
        edited = write_export(
            tmp_path, [track_xml("1", "/m/one.mp3", "One", "A")], name="edited.xml"
        )
        diff = service.compute_refresh_diff(edited)
        opened = []

        real_replace_tree = service._playlists.replace_tree

        def check_then_replace(nodes):
            try:
                with service._db.transaction():
                    opened.append("no transaction was open")
            except DatabaseError as exc:
                opened.append(exc.error_code)
            return real_replace_tree(nodes)

        service._playlists.replace_tree = check_then_replace
        service.apply_refresh(diff)
        service._playlists.replace_tree = real_replace_tree

        assert opened == ["DB_NESTED_TRANSACTION"]
