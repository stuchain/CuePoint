#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""DEC-057's guard: a refresh cannot overwrite what the user wrote (ORG-02).

This is the test the schema was shaped around. `TrackRepository._UPDATE_SQL`
writes **every** column of a `LibraryTrack`, and both an import and a refresh
build those objects out of the XML — so CuePoint's own rating, favorite and note
living on `tracks` would be erased by the ordinary act of re-reading the export,
by three separate code paths, none of which looks destructive. They live in
`track_metadata` instead, and this is what says so.

**It is written to fail against the design it rejects.** Move the three fields
onto `tracks` and every assertion below breaks, because a re-import rebuilds
that row from the file. That is the point: the test does not check that the
import *chooses* not to touch CuePoint's values, it checks that re-reading the
whole library leaves them there.

The pipeline is real. These run the actual import and the actual refresh over
real XML files, using the fixtures the Phase 3 refresh tests already build from,
rather than mocking a repository and asserting it was not called — a mock would
happily pass while the shipped code overwrote everything.
"""

from __future__ import annotations

import pytest

from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.metadata_service import MetadataService
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
def metadata(db, tracks):
    return MetadataService(
        TrackMetadataRepository(db),
        tracks,
        ActivityService(ActivityRepository(db), tracks),
    )


@pytest.fixture
def importer(db, tracks):
    return LibraryImportService(
        tracks, PlaylistRepository(db), LibrarySourceRepository(db), db
    )


@pytest.fixture
def library(importer, tmp_path):
    """A library imported from the base export, and the file it came from."""
    export = write_export(tmp_path, BASE_TRACKS, BASE_PLAYLISTS, name="base.xml")
    importer.import_rekordbox_xml(export)
    return export


@pytest.fixture
def annotated(library, tracks, metadata):
    """Track "1", with everything a user can say about it said."""
    track_id = int(tracks.find_by_rekordbox_id("1").id)
    metadata.set_rating(track_id, 5)
    metadata.set_favorite(track_id, True)
    metadata.set_notes(track_id, "opener")
    return track_id


def cuepoint_values(metadata, track_id):
    record = metadata.get(track_id)
    return None if record is None else (record.rating, record.favorite, record.notes)


class TestReimportingTheSameFile:
    def test_the_users_values_survive(self, importer, metadata, library, annotated):
        importer.import_rekordbox_xml(library)
        assert cuepoint_values(metadata, annotated) == (5, True, "opener")

    def test_the_rekordbox_rating_is_re_imported_beside_them(
        self, importer, tracks, metadata, library, annotated
    ):
        # Both layers are still there, and they disagree — which is exactly the
        # state DEC-057 exists to make possible.
        importer.import_rekordbox_xml(library)
        assert tracks.get(annotated).rating == 4  # Rating="204" in the fixture
        assert metadata.get(annotated).rating == 5

    def test_the_effective_rating_is_still_the_users(
        self, importer, metadata, library, annotated
    ):
        importer.import_rekordbox_xml(library)
        assert metadata.effective_rating_for(annotated) == 5

    def test_importing_twice_more_changes_nothing(
        self, importer, metadata, library, annotated
    ):
        importer.import_rekordbox_xml(library)
        importer.import_rekordbox_xml(library)
        assert cuepoint_values(metadata, annotated) == (5, True, "opener")


class TestRefreshingFromAChangedFile:
    @pytest.fixture
    def changed(self, tmp_path):
        """The same three tracks, with everything Rekordbox owns different."""
        return write_export(
            tmp_path,
            [
                track_xml("1", "/m/one.mp3", "One Renamed", "A Renamed"),
                track_xml("2", "/m/two.mp3", "Two", "B"),
                track_xml("3", "/m/three.mp3", "Three", "C"),
            ],
            BASE_PLAYLISTS,
            name="changed.xml",
        )

    def test_the_users_values_survive_a_refresh(
        self, importer, metadata, annotated, changed
    ):
        diff = importer.compute_refresh_diff(changed)
        importer.apply_refresh(diff)
        assert cuepoint_values(metadata, annotated) == (5, True, "opener")

    def test_the_imported_fields_did_change(self, importer, tracks, annotated, changed):
        # Proves the refresh actually rewrote the track row — without this the
        # test above could pass because nothing happened at all.
        diff = importer.compute_refresh_diff(changed)
        importer.apply_refresh(diff)
        assert tracks.get(annotated).title == "One Renamed"

    def test_a_track_added_by_the_refresh_has_no_metadata(
        self, importer, tracks, metadata, annotated, tmp_path
    ):
        export = write_export(
            tmp_path,
            BASE_TRACKS + [track_xml("4", "/m/four.mp3", "Four", "D")],
            BASE_PLAYLISTS,
            name="grown.xml",
        )
        diff = importer.compute_refresh_diff(export)
        importer.apply_refresh(diff)

        added = int(tracks.find_by_rekordbox_id("4").id)
        assert metadata.get(added) is None
        assert cuepoint_values(metadata, annotated) == (5, True, "opener")


class TestARemovedTrackTakesItsMetadata:
    def test_deleting_a_track_removes_what_was_said_about_it(
        self, importer, db, metadata, annotated, tmp_path
    ):
        # DEC-003's deletion, and the loss DEC-011's warning exists to announce
        # first. The cascade must fire through the real refresh, not only
        # through a direct DELETE.
        export = write_export(
            tmp_path,
            [track_xml("2", "/m/two.mp3", "Two", "B")],
            '<NODE Name="ROOT" Type="0"></NODE>',
            name="shrunk.xml",
        )
        diff = importer.compute_refresh_diff(export)
        importer.apply_refresh(diff)

        assert metadata.get(annotated) is None
        assert TrackMetadataRepository(db).count() == 0


class TestSurvivingARestart:
    def test_the_values_are_still_there_when_the_database_is_reopened(
        self, db, annotated, tmp_path
    ):
        """The third thing the acceptance criterion asks about.

        Import and refresh are exercised above; this is the plain one — close
        the database and open it again, the way quitting and relaunching does.
        It would catch a value that only ever lived in a connection's cache or
        in an uncommitted transaction.
        """
        db.close_all()

        reopened = DatabaseService(db_path=tmp_path / "cuepoint.db")
        try:
            record = TrackMetadataRepository(reopened).get(annotated)
            assert (record.rating, record.favorite, record.notes) == (
                5,
                True,
                "opener",
            )
        finally:
            reopened.close_all()


class TestHistorySurvivesToo:
    def test_the_edits_are_still_in_the_history_after_a_refresh(
        self, importer, db, tracks, annotated, library
    ):
        importer.import_rekordbox_xml(library)
        activity = ActivityService(ActivityRepository(db), tracks)
        fields = {entry.field_name for entry in activity.track_history(annotated)}
        assert fields == {"cuepoint_rating", "favorite", "notes"}
