#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A refresh warns before deleting anything the user authored (DEC-011, CLEAN-05).

DEC-011 as amended counts every removed track carrying work that cannot be
recomputed. The tests are the specification's, over the real import and refresh
pipeline:

- **Each kind alone reports that kind alone** and makes the refresh ask first.
- **What matching or a scan re-derives is not counted**: attempts, automatic
  states, file status, artwork — and a row that says nothing any more.
- **A track carrying several kinds is one referenced track.**
- **The Collection-only answer is unchanged** in every field it already had.
- **A refresh deleting none of it still applies without a prompt.**
"""

from __future__ import annotations

from typing import Dict, List

import pytest

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.references import ReferenceSummary
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.library_source_repository import LibrarySourceRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.library_import_service import (
    LibraryImportService,
    _kinds_of_work,
)
from cuepoint.services.library_service import LibraryService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService
from tests.unit.services.test_refresh_diff import track_xml, write_export

EMPTY_PLAYLISTS = '<NODE Name="ROOT" Type="0"></NODE>'
NOW = "2026-09-13T12:00:00+00:00"

COUNTS = (
    "collection_track_count",
    "rated_track_count",
    "tagged_track_count",
    "reviewed_track_count",
    "edited_track_count",
)


# --------------------------------------------------------------------- setup


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
def activity(db, tracks):
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def work(db, tracks, activity) -> Dict[str, object]:
    """Every service a user authors with."""
    matches = MatchRepository(db)
    return {
        "metadata": MetadataService(TrackMetadataRepository(db), tracks, activity, db),
        "tags": TagService(TagRepository(db), activity, db),
        "collections": CollectionService(
            CollectionRepository(db), db, tracks, activity
        ),
        "matches": matches,
        "states": MatchStateService(matches, tracks, activity, db),
    }


@pytest.fixture
def library(db, tracks):
    return LibraryService(
        track_repository=tracks,
        collection_repository=CollectionRepository(db),
        metadata_repository=TrackMetadataRepository(db),
        authored_repository=AuthoredDataRepository(db),
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
def exports(tmp_path):
    base = write_export(
        tmp_path,
        [
            track_xml("1", "/m/one.mp3", "One", "A"),
            track_xml("2", "/m/two.mp3", "Two", "B"),
            track_xml("3", "/m/three.mp3", "Three", "C"),
        ],
        EMPTY_PLAYLISTS,
        name="base.xml",
    )
    shrunk = write_export(
        tmp_path,
        [track_xml("1", "/m/one.mp3", "One", "A")],
        EMPTY_PLAYLISTS,
        name="shrunk.xml",
    )
    return {"base": base, "shrunk": shrunk}


@pytest.fixture
def doomed(importer, tracks, exports) -> List[int]:
    """Tracks "2" and "3", which the shrunk export removes."""
    importer.import_rekordbox_xml(exports["base"])
    return [int(tracks.find_by_rekordbox_id(rid).id) for rid in ("2", "3")]


def attempt(work, track_id: int):
    best = BeatportCandidate(
        url=f"https://www.beatport.com/track/x/{track_id}",
        title="T",
        artists="A",
        label=None,
        release_date=None,
        bpm=None,
        key=None,
        genre=None,
        score=80.0,
        title_sim=90,
        artist_sim=90,
        query_index=1,
        query_text="q",
        candidate_index=1,
        base_score=80.0,
        bonus_year=0,
        bonus_key=0,
        guard_ok=True,
        reject_reason="",
        elapsed_ms=1,
        is_winner=True,
        release_year=None,
        release_name=None,
    )
    stored = work["matches"].add_attempt(
        track_id,
        "job",
        TrackResult(
            1, "T", "A", True, best_match=best, candidates=[best], match_score=80.0
        ),
        Track(title="T", artist="A"),
    )
    work["states"].apply_attempt(stored)
    return stored


def rate(work, track_id):
    work["metadata"].set_rating(track_id, 4)


def favorite(work, track_id):
    work["metadata"].set_favorite(track_id, True)


def note(work, track_id):
    work["metadata"].set_notes(track_id, "closing track")


def tag(work, track_id):
    peak = work["tags"].create_or_get("Peak time")
    work["tags"].assign([track_id], peak.id)


def review(work, track_id):
    attempt(work, track_id)
    work["states"].reject(track_id)


def edit(work, track_id):
    work["metadata"].set_override(track_id, "bpm", 125)


def collect(work, track_id):
    crate = work["collections"].create_collection("Warmups")
    work["collections"].add_tracks(crate.id, [track_id])


KINDS: Dict[str, tuple] = {
    "rating": (rate, "rated_track_count"),
    "favorite": (favorite, "rated_track_count"),
    "note": (note, "rated_track_count"),
    "tag": (tag, "tagged_track_count"),
    "decision": (review, "reviewed_track_count"),
    "override": (edit, "edited_track_count"),
    "collection": (collect, "collection_track_count"),
}


# --------------------------------------------------------------------- tests


class TestEachKindAlone:
    @pytest.mark.parametrize("kind", sorted(KINDS))
    def test_it_reports_that_kind_alone_and_asks_first(
        self, library, work, doomed, kind
    ):
        author, counted = KINDS[kind]
        author(work, doomed[1])

        summary = library.references_for(doomed)

        assert {name: getattr(summary, name) for name in COUNTS} == {
            name: (1 if name == counted else 0) for name in COUNTS
        }
        assert summary.referenced_track_ids == (doomed[1],)
        assert summary.has_references is True

    @pytest.mark.parametrize(
        "field, value",
        [
            ("key", "Am"),
            ("bpm", 125),
            ("genre", "Dub"),
            ("label", "Mine"),
            ("year", 1999),
        ],
    )
    def test_an_override_of_any_one_field_is_an_edit(
        self, library, work, doomed, field, value
    ):
        work["metadata"].set_override(doomed[0], field, value)

        summary = library.references_for(doomed)

        assert summary.edited_track_count == 1
        assert summary.referenced_track_ids == (doomed[0],)
        assert summary.has_references is True


class TestWhatIsNotCounted:
    def test_an_attempt_and_an_automatic_state(self, library, work, doomed):
        attempt(work, doomed[0])
        assert work["matches"].get_match(doomed[0]).decided_by == "auto"
        assert library.references_for(doomed).has_references is False

    def test_a_decision_cleared_back_to_automatic(self, library, work, doomed):
        review(work, doomed[0])
        work["states"].clear_decision(doomed[0])
        assert library.references_for(doomed).has_references is False

    def test_file_status_and_artwork(self, db, library, doomed):
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO track_files (track_id, status, checked_path, checked_at)"
                " VALUES (?, 'missing', '/m/two.mp3', ?)",
                (doomed[0], NOW),
            )
            conn.execute(
                "INSERT INTO track_artwork (track_id, embedded, checked_at)"
                " VALUES (?, 'present', ?)",
                (doomed[1], NOW),
            )
        assert library.references_for(doomed).has_references is False

    def test_a_metadata_row_that_no_longer_says_anything(self, library, work, doomed):
        metadata = work["metadata"]
        metadata.set_rating(doomed[0], 4)
        metadata.set_rating(doomed[0], None)
        metadata.set_override(doomed[1], "genre", "Dub")
        metadata.set_override(doomed[1], "genre", None)
        assert library.references_for(doomed).has_references is False

    def test_a_tag_a_track_no_longer_carries(self, library, work, doomed):
        tag(work, doomed[0])
        peak = work["tags"].create_or_get("Peak time")
        work["tags"].unassign([doomed[0]], peak.id)
        assert library.references_for(doomed).has_references is False


class TestSeveralKinds:
    def test_a_track_carrying_everything_is_one_referenced_track(
        self, library, work, doomed
    ):
        for author, _ in KINDS.values():
            author(work, doomed[0])
        tag(work, doomed[1])

        summary = library.references_for(doomed)

        assert summary.referenced_track_ids == tuple(sorted(doomed))
        assert summary.referenced_track_count == 2
        assert (
            summary.collection_track_count,
            summary.rated_track_count,
            summary.tagged_track_count,
            summary.reviewed_track_count,
            summary.edited_track_count,
        ) == (1, 1, 2, 1, 1)

    def test_only_the_tracks_asked_about_are_counted(
        self, library, work, doomed, tracks
    ):
        survivor = int(tracks.find_by_rekordbox_id("1").id)
        rate(work, survivor)
        assert library.references_for(doomed).has_references is False


class TestTheCollectionOnlyShapeIsUnchanged:
    def test_every_field_it_already_had_says_what_it_said(self, library, work, doomed):
        collect(work, doomed[1])
        payload = library.references_for(doomed).to_dict()
        crate = payload["collection_ids"]

        assert {
            key: payload[key]
            for key in (
                "collection_count",
                "set_count",
                "referenced_track_count",
                "referenced_track_ids",
                "collection_ids",
                "has_references",
            )
        } == {
            "collection_count": 1,
            "set_count": 0,
            "referenced_track_count": 1,
            "referenced_track_ids": [doomed[1]],
            "collection_ids": crate,
            "has_references": True,
        }
        assert list(payload)[:6] == [
            "collection_count",
            "set_count",
            "referenced_track_count",
            "referenced_track_ids",
            "collection_ids",
            "has_references",
        ]


class TestTheRefresh:
    def test_a_rated_only_deletion_is_refused_without_confirmation(
        self, importer, tracks, work, doomed, exports
    ):
        rate(work, doomed[0])
        diff = importer.compute_refresh_diff(exports["shrunk"])
        assert diff.references.rated_track_count == 1

        with pytest.raises(Exception) as refused:
            importer.apply_refresh(diff)

        assert refused.value.error_code == "LIBRARY_REFRESH_NEEDS_CONFIRMATION"
        assert refused.value.message.startswith(
            "1 track removed from Rekordbox carries your own work: 1 rated or noted."
        )
        assert refused.value.context["rated_track_count"] == 1
        assert tracks.get(doomed[0]) is not None

    @pytest.mark.parametrize(
        "summary, words",
        [
            (
                ReferenceSummary(
                    collection_count=1,
                    referenced_track_ids=(1, 2),
                    collection_track_count=2,
                ),
                "2 in 1 Collection",
            ),
            (
                ReferenceSummary(
                    collection_count=2,
                    set_count=1,
                    referenced_track_ids=(1, 2, 3),
                    collection_track_count=3,
                    tagged_track_count=1,
                    edited_track_count=2,
                ),
                "3 in 2 Collections, in 1 Set, 1 tagged, 2 edited",
            ),
            (
                ReferenceSummary(
                    set_count=2,
                    referenced_track_ids=(4,),
                    reviewed_track_count=1,
                ),
                "in 2 Sets, 1 reviewed",
            ),
        ],
    )
    def test_the_refusal_names_each_kind_with_its_noun_agreeing(self, summary, words):
        assert _kinds_of_work(summary) == words

    def test_confirming_deletes_the_tracks_and_their_work(
        self, importer, tracks, work, doomed, exports, db
    ):
        edit(work, doomed[0])
        diff = importer.compute_refresh_diff(exports["shrunk"])

        importer.apply_refresh(diff, confirm_references=True)

        assert tracks.get(doomed[0]) is None
        rows = db.connect().execute("SELECT count(*) FROM track_metadata").fetchone()[0]
        assert rows == 0

    def test_a_deletion_carrying_nothing_applies_without_a_prompt(
        self, importer, tracks, work, doomed, exports
    ):
        attempt(work, doomed[0])  # recomputable, so not a reason to ask
        diff = importer.compute_refresh_diff(exports["shrunk"])
        assert diff.references.has_references is False

        importer.apply_refresh(diff)

        assert tracks.get(doomed[0]) is None


class TestTheQuestions:
    def test_an_empty_request_asks_nothing(self, db):
        statements: List[str] = []
        connection = db.connect()
        connection.set_trace_callback(statements.append)
        try:
            found = AuthoredDataRepository(db).tracks_carrying([])
        finally:
            connection.set_trace_callback(None)
        assert statements == [] and found.track_ids == ()

    def test_more_tracks_than_one_statement_can_carry(self, db, tracks, work):
        from cuepoint.models.library_track import LibraryTrack

        tracks.add_many(
            [
                LibraryTrack(rekordbox_track_id=f"x{i}", title=f"X{i}", artist="A")
                for i in range(1_234)
            ]
        )
        every = [int(row[0]) for row in db.connect().execute("SELECT id FROM tracks")]
        for track_id in every[::100]:
            rate(work, track_id)

        found = AuthoredDataRepository(db).tracks_carrying(every)

        assert found.rated == tuple(sorted(every[::100]))

    def test_four_questions_per_chunk(self, db, tracks, work):
        from cuepoint.models.library_track import LibraryTrack

        tracks.add_many(
            [
                LibraryTrack(rekordbox_track_id=f"y{i}", title=f"Y{i}", artist="A")
                for i in range(20)
            ]
        )
        every = [int(row[0]) for row in db.connect().execute("SELECT id FROM tracks")]
        statements: List[str] = []
        connection = db.connect()
        connection.set_trace_callback(statements.append)
        try:
            AuthoredDataRepository(db).tracks_carrying(every)
        finally:
            connection.set_trace_callback(None)
        assert len(statements) == 4
