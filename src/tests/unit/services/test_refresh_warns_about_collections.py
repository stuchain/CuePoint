#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""DEC-011's warning, finally answering something (ORG-04).

Since Phase 3 the refresh has asked, before deleting anything, what else is
holding on to the tracks it is about to remove — and the answer has always been
zero, because nothing in the build could reference a track. LIBRARY-08 built the
question anyway so that Phase 6 would have one method to implement and no
callers to find.

This is that method's first real answer, tested end to end through the actual
refresh rather than through the seam alone:

* a track filed in a Collection makes the preview say so,
* applying that refresh without confirmation is refused,
* confirming it deletes the track and its Collection entry and nothing else,
* and a removal nothing has filed still goes through without a prompt, which is
  the case that must not become noisy now that the question has teeth.
"""

from __future__ import annotations

import pytest

from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import LibraryImportService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.services.test_refresh_diff import track_xml, write_export

EMPTY_PLAYLISTS = '<NODE Name="ROOT" Type="0"></NODE>'


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
def collections(db, tracks):
    return CollectionService(CollectionRepository(db), db)


@pytest.fixture
def library(db, tracks):
    return LibraryService(
        track_repository=tracks, collection_repository=CollectionRepository(db)
    )


@pytest.fixture
def importer(db, tracks, library):
    return LibraryImportService(
        tracks,
        PlaylistRepository(db),
        LibrarySourceRepository(db),
        db,
        library_service=library,
    )


@pytest.fixture
def three_tracks(tmp_path):
    return write_export(
        tmp_path,
        [
            track_xml("1", "/m/one.mp3", "One", "A"),
            track_xml("2", "/m/two.mp3", "Two", "B"),
            track_xml("3", "/m/three.mp3", "Three", "C"),
        ],
        EMPTY_PLAYLISTS,
        name="base.xml",
    )


@pytest.fixture
def two_tracks(tmp_path):
    """The same export with track 3 gone."""
    return write_export(
        tmp_path,
        [
            track_xml("1", "/m/one.mp3", "One", "A"),
            track_xml("2", "/m/two.mp3", "Two", "B"),
        ],
        EMPTY_PLAYLISTS,
        name="shrunk.xml",
    )


@pytest.fixture
def imported(importer, three_tracks):
    importer.import_rekordbox_xml(three_tracks)
    return three_tracks


@pytest.fixture
def filed(importer, tracks, collections, imported):
    """Track 3 — the one the next refresh removes — filed in a Collection."""
    doomed = int(tracks.find_by_rekordbox_id("3").id)
    warmups = collections.create_collection("Warmups")
    collections.add_tracks(warmups.id, [doomed])
    return {"track": doomed, "collection": warmups.id}


class TestThePreviewSaysSo:
    def test_a_filed_track_is_reported(self, importer, filed, two_tracks):
        diff = importer.compute_refresh_diff(two_tracks)
        assert diff.references.has_references is True
        assert diff.references.collection_count == 1
        assert diff.references.referenced_track_ids == (filed["track"],)

    def test_an_unfiled_removal_still_warns_about_nothing(
        self, importer, imported, two_tracks
    ):
        # The case that must not become noisy: nothing has filed track 3, so
        # the refresh is the uneventful one it has always been.
        diff = importer.compute_refresh_diff(two_tracks)
        assert diff.removed.count == 1
        assert diff.references.has_references is False

    def test_a_track_filed_twice_in_one_collection_counts_once(
        self, importer, collections, filed, two_tracks
    ):
        collections.insert_track(filed["collection"], filed["track"], 0)
        diff = importer.compute_refresh_diff(two_tracks)
        assert diff.references.collection_count == 1
        assert diff.references.referenced_track_count == 1

    def test_two_collections_holding_it_count_twice(
        self, importer, collections, filed, two_tracks
    ):
        second = collections.create_collection("Closers")
        collections.add_tracks(second.id, [filed["track"]])
        diff = importer.compute_refresh_diff(two_tracks)
        assert diff.references.collection_count == 2
        assert diff.references.referenced_track_count == 1

    def test_only_the_filed_track_is_named(
        self, importer, tracks, collections, filed, tmp_path
    ):
        """Two tracks removed, one of them filed: the summary names one.

        Reporting everything it was asked about would read the same in the
        common case where every removed track is filed, and would overstate the
        loss in every other.
        """
        also_doomed = int(tracks.find_by_rekordbox_id("2").id)
        export = write_export(
            tmp_path,
            [track_xml("1", "/m/one.mp3", "One", "A")],
            EMPTY_PLAYLISTS,
            name="one-left.xml",
        )

        diff = importer.compute_refresh_diff(export)

        assert diff.removed.count == 2
        assert diff.references.referenced_track_ids == (filed["track"],)
        assert also_doomed not in diff.references.referenced_track_ids

    def test_one_collection_holding_both_removed_tracks_counts_once(
        self, importer, tracks, collections, filed, tmp_path
    ):
        collections.add_tracks(
            filed["collection"], [int(tracks.find_by_rekordbox_id("2").id)]
        )
        export = write_export(
            tmp_path,
            [track_xml("1", "/m/one.mp3", "One", "A")],
            EMPTY_PLAYLISTS,
            name="one-left.xml",
        )

        diff = importer.compute_refresh_diff(export)

        assert diff.references.collection_count == 1
        assert diff.references.referenced_track_count == 2

    def test_a_collection_holding_only_surviving_tracks_is_not_reported(
        self, importer, tracks, collections, imported, two_tracks
    ):
        safe = collections.create_collection("Safe")
        collections.add_tracks(safe.id, [int(tracks.find_by_rekordbox_id("1").id)])
        diff = importer.compute_refresh_diff(two_tracks)
        assert diff.references.has_references is False


class TestApplyingIt:
    def test_it_is_refused_without_confirmation(self, importer, filed, two_tracks):
        diff = importer.compute_refresh_diff(two_tracks)
        with pytest.raises(Exception) as raised:
            importer.apply_refresh(diff)
        assert "1" in str(raised.value)

    def test_a_refused_apply_deletes_nothing(
        self, importer, tracks, collections, filed, two_tracks
    ):
        diff = importer.compute_refresh_diff(two_tracks)
        with pytest.raises(Exception):
            importer.apply_refresh(diff)

        assert tracks.find_by_rekordbox_id("3") is not None
        assert collections.counts(filed["collection"]) == (1, 1)

    def test_confirming_deletes_the_track_and_its_entry(
        self, importer, tracks, collections, filed, two_tracks
    ):
        diff = importer.compute_refresh_diff(two_tracks)
        importer.apply_refresh(diff, confirm_references=True)

        assert tracks.find_by_rekordbox_id("3") is None
        assert collections.counts(filed["collection"]) == (0, 0)

    def test_the_collection_itself_survives(
        self, importer, collections, filed, two_tracks
    ):
        # DEC-003 takes the CuePoint-side data belonging to the *track*. The
        # Collection is not one of the track's belongings.
        diff = importer.compute_refresh_diff(two_tracks)
        importer.apply_refresh(diff, confirm_references=True)
        assert collections.get(filed["collection"]) is not None

    def test_an_unfiled_removal_needs_no_confirmation(
        self, importer, tracks, imported, two_tracks
    ):
        diff = importer.compute_refresh_diff(two_tracks)
        importer.apply_refresh(diff)
        assert tracks.find_by_rekordbox_id("3") is None
