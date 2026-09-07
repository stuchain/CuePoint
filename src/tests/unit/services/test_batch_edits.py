#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One operation over a whole selection (ORG-07, DEC-063, DEC-045).

Five claims, and each of them is a bug that only shows at scale or only shows
once, which is why they are asserted here rather than watched for.

**The selection is fixed once.** A job that re-read its query would report a
number that drifted underneath it — and the queries a user actually batches are
the self-defeating kind, "everything with no rating", where applying the change
is what makes the rows stop matching. Two tests move the library while the batch
runs: one adds rows that must not be picked up, one removes the very property
the selection was built on.

**Ids and a query naming the same tracks are the same batch.** DEC-045 lets a
selection cross the wire as a description; the way that stops being true is a
second resolution path, so the two are asserted equal down to the counts and the
rows they touched.

**Every changed field is in the history, under one batch id.** DEC-008 chose
per-field history instead of an undo stack and DEC-063 chose a shared id instead
of a summary row, and both are only worth anything if the rows are actually
written. The tests count them against the service's own ``changed`` — two
definitions of "a change" that must not be allowed to drift apart.

**Cancelling stops promptly and keeps what it did.** The uncomfortable half is
deliberate (DEC-063): a cancelled batch is not rolled back. So the tests assert
the applied work is still applied, and that the event says how far it got.

**A track that is gone is one failure, not five hundred.** A chunk is applied
set-shaped for the speed of it, which means one bad row can take the whole chunk
down; the retry path is what stops that being the user's problem, and it has its
own tests because nothing else would notice it disappearing.
"""

from __future__ import annotations

import json
import threading
from typing import List

import pytest

from cuepoint.exceptions.cuepoint_exceptions import DatabaseError

from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery, BrowseQueryError
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.batch_service import (
    BATCH_OPERATIONS,
    EVENT_BATCH_APPLIED,
    OPERATION_ADD_TAG,
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_REMOVE_FROM_COLLECTION,
    OPERATION_REMOVE_TAG,
    OPERATION_SET_FAVORITE,
    OPERATION_SET_RATING,
    BatchOperation,
    BatchResult,
    BatchSelection,
    BatchService,
)
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IBatchService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import TagService

TRACK_COUNT = 40


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    repo = TrackRepository(db)
    repo.add_many(
        [
            LibraryTrack(
                rekordbox_track_id=str(i),
                file_path=f"/music/{i:03d}.mp3",
                title=f"Track {i:03d}",
                artist=f"Artist {i % 4}",
                genre="House" if i % 2 else "Techno",
                bpm=120.0 + i,
            )
            for i in range(1, TRACK_COUNT + 1)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks):
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def activity(db, tracks) -> ActivityService:
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def metadata(db, tracks, activity) -> MetadataService:
    return MetadataService(TrackMetadataRepository(db), tracks, activity, db)


@pytest.fixture
def tags(db, activity) -> TagService:
    return TagService(TagRepository(db), activity, db)


@pytest.fixture
def collections(db, tracks, activity) -> CollectionService:
    return CollectionService(CollectionRepository(db), db, tracks, activity)


@pytest.fixture
def service(db, metadata, tags, collections, tracks, activity) -> BatchService:
    return BatchService(metadata, tags, collections, tracks, activity, db)


@pytest.fixture
def peak(tags):
    return tags.create_or_get("Peak time")


@pytest.fixture
def warmups(collections):
    return collections.create_collection("Warmups")


# --------------------------------------------------------------------- probes


def _changes(rows):
    """Decode the history rows into (field, old, new) triples.

    The values are stored as JSON so a reverted field comes back with the type
    it went in with (m0004), which is exactly the property several of these
    tests are about — so they read the column rather than a service that has
    already hidden it.
    """
    return [
        (
            row["field"],
            json.loads(row["old_value_json"]) if row["old_value_json"] else None,
            json.loads(row["new_value_json"]) if row["new_value_json"] else None,
        )
        for row in rows
    ]


def history_rows(db, batch_id: str):
    """Every history row written under one batch id."""
    return (
        db.connect()
        .execute(
            "SELECT * FROM track_history WHERE batch_id = ? ORDER BY id", (batch_id,)
        )
        .fetchall()
    )


def history_for(db, track_id: int):
    return (
        db.connect()
        .execute(
            "SELECT * FROM track_history WHERE track_id = ? ORDER BY id", (track_id,)
        )
        .fetchall()
    )


def all_history(db):
    return db.connect().execute("SELECT * FROM track_history ORDER BY id").fetchall()


def batch_events(activity):
    return [
        event
        for event in activity.recent_events(limit=100)
        if event.type == EVENT_BATCH_APPLIED
    ]


def rated(db):
    """Every track carrying a CuePoint rating, and what it is."""
    return {
        int(row["track_id"]): row["rating"]
        for row in db.connect().execute(
            "SELECT track_id, rating FROM track_metadata WHERE rating IS NOT NULL"
        )
    }


def tagged(db, tag_id: int):
    return {
        int(row["track_id"])
        for row in db.connect().execute(
            "SELECT track_id FROM track_tags WHERE tag_id = ?", (tag_id,)
        )
    }


def members(db, collection_id: int):
    return [
        int(row["track_id"])
        for row in db.connect().execute(
            "SELECT track_id FROM collection_tracks WHERE collection_id = ?"
            " ORDER BY position",
            (collection_id,),
        )
    ]


class Refuses:
    """An activity service that will not record anything."""

    def record_event(self, *args, **kwargs):
        raise RuntimeError("the feed is unavailable")

    def record_field_change(self, *args, **kwargs):
        raise RuntimeError("the feed is unavailable")


# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestTheSelection:
    def test_ids_and_the_query_naming_them_are_one_batch(self, service, db, ids, peak):
        """DEC-045's promise, end to end.

        The point of letting a selection be a description is that it means the
        same thing as the ids it stands for. A second resolution path is how
        that stops being true, so the two are compared on everything a caller
        can see: the count, the counts, and the rows that moved.
        """
        techno = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        )
        expected = service.resolve(BatchSelection.matching(techno))

        by_query = service.apply_batch(
            BatchSelection.matching(techno), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert tagged(db, peak.id) == set(expected)

        # Undo it, and do the same thing again by id.
        service.apply_batch(
            BatchSelection.of_ids(expected),
            BatchOperation(OPERATION_REMOVE_TAG, peak.id),
        )
        by_ids = service.apply_batch(
            BatchSelection.of_ids(expected), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )

        assert tagged(db, peak.id) == set(expected)
        assert (by_query.total, by_query.changed) == (by_ids.total, by_ids.changed)

    def test_the_same_track_named_twice_is_one_track(self, service, ids):
        result = service.apply_batch(
            BatchSelection.of_ids([ids[0], ids[1], ids[0]]),
            BatchOperation(OPERATION_SET_RATING, 3),
        )
        assert result.total == 2
        assert result.changed == 2

    def test_a_selection_keeps_the_order_the_query_gave_it(self, service, ids):
        query = BrowseQuery(sort="title", direction="desc")
        found = service.resolve(BatchSelection.matching(query))
        assert found == list(reversed(ids))

    def test_a_selection_is_ids_or_a_query_never_both(self):
        with pytest.raises(ValueError, match="never both and never neither"):
            BatchSelection(track_ids=[1], query=BrowseQuery())

    def test_a_selection_is_ids_or_a_query_never_neither(self):
        with pytest.raises(ValueError, match="never both and never neither"):
            BatchSelection()

    def test_a_selection_of_no_tracks_is_refused(self, service):
        with pytest.raises(ValueError, match="names no tracks"):
            service.resolve(BatchSelection.of_ids([]))

    def test_a_query_matching_nothing_is_refused(self, service):
        nothing = BrowseQuery(query="there is no track called this")
        with pytest.raises(ValueError, match="names no tracks"):
            service.resolve(BatchSelection.matching(nothing))

    def test_a_query_that_cannot_be_built_is_refused_as_a_query(self, service):
        with pytest.raises(BrowseQueryError):
            service.resolve(BatchSelection.matching(BrowseQuery(sort="loudness")))

    def test_nothing_is_applied_when_the_selection_is_refused(self, service, db):
        with pytest.raises(ValueError):
            service.apply_batch(
                BatchSelection.of_ids([]), BatchOperation(OPERATION_SET_RATING, 3)
            )
        assert rated(db) == {}
        assert all_history(db) == []

    def test_a_selection_larger_than_one_page_is_read_whole(
        self, service, tracks, monkeypatch
    ):
        """``browse_ids`` caps a request at 50,000; the pages are not optional.

        Driven by shrinking the page rather than by building a library of
        50,001 tracks, which is the same loop under a clock nobody wants to
        wait for. Compared against the unpaged read of the same query, so it
        pins the order as well as the membership: a loop that read the pages
        and then sorted them would pass an assertion about a set.
        """
        query = BrowseQuery()
        unpaged = tracks.browse_ids(query)
        monkeypatch.setattr("cuepoint.services.batch_service.SELECTION_PAGE_SIZE", 7)
        assert service.resolve(BatchSelection.matching(query)) == unpaged
        assert len(unpaged) == TRACK_COUNT

    def test_a_selection_exactly_one_page_long_is_still_complete(
        self, service, tracks, monkeypatch
    ):
        """The boundary the page loop is most likely to get wrong."""
        query = BrowseQuery()
        unpaged = tracks.browse_ids(query)
        monkeypatch.setattr(
            "cuepoint.services.batch_service.SELECTION_PAGE_SIZE", TRACK_COUNT
        )
        assert service.resolve(BatchSelection.matching(query)) == unpaged


@pytest.mark.unit
class TestTheTargetIsFixedOnce:
    def test_tracks_that_stop_matching_are_still_acted_on(
        self, service, db, monkeypatch, ids
    ):
        """The self-defeating query, which is the one users actually batch.

        "Everything with no rating", rated. Each chunk that lands makes its
        tracks stop matching, so a job that re-read its query would rate the
        first chunk and then find nothing left to do — and report that as the
        answer.
        """
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 5)
        unrated = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("cuepoint_rating", "is_empty", None),))
        )
        result = service.apply_batch(
            BatchSelection.matching(unrated), BatchOperation(OPERATION_SET_RATING, 4)
        )
        assert result.total == TRACK_COUNT
        assert result.changed == TRACK_COUNT
        assert len(rated(db)) == TRACK_COUNT

    def test_tracks_arriving_mid_batch_are_not_swept_up(
        self, service, tracks, monkeypatch, db, peak
    ):
        """A library that grows under a running batch does not grow the batch."""
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 5)
        techno = BrowseQuery(
            rules=RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        )
        before = service.resolve(BatchSelection.matching(techno))

        def add_one(completed, total):
            if completed == 5:
                tracks.add_many(
                    [
                        LibraryTrack(
                            rekordbox_track_id="late",
                            file_path="/music/late.mp3",
                            title="Arrived late",
                            artist="Latecomer",
                            genre="Techno",
                        )
                    ]
                )

        result = service.apply_batch(
            BatchSelection.matching(techno),
            BatchOperation(OPERATION_ADD_TAG, peak.id),
            on_progress=add_one,
        )
        assert result.total == len(before)
        assert tagged(db, peak.id) == set(before)


@pytest.mark.unit
class TestTheVocabulary:
    def test_every_operation_is_one_of_six(self):
        assert BATCH_OPERATIONS == (
            OPERATION_SET_RATING,
            OPERATION_SET_FAVORITE,
            OPERATION_ADD_TAG,
            OPERATION_REMOVE_TAG,
            OPERATION_ADD_TO_COLLECTION,
            OPERATION_REMOVE_FROM_COLLECTION,
        )

    def test_an_unknown_operation_is_refused_by_name(self, service, ids):
        with pytest.raises(ValueError, match="delete_track"):
            service.apply_batch(
                BatchSelection.of_ids(ids), BatchOperation("delete_track", 1)
            )

    def test_an_unknown_operation_says_which_are_known(self):
        with pytest.raises(ValueError, match=OPERATION_ADD_TO_COLLECTION):
            BatchOperation("nonsense").validated()

    def test_a_rating_is_stored_in_the_type_the_column_holds(self, service, db, ids):
        """``"4"`` from the wire has to be the integer 4 in the history row.

        The same rule ORG-02 found the hard way: a history entry recording the
        value that was *typed* would restore a string into an integer column
        when a later phase reverts it.
        """
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_RATING, "4")
        )
        assert set(rated(db).values()) == {4}
        assert _changes(history_rows(db, result.batch_id)) == [
            ("cuepoint_rating", None, 4),
            ("cuepoint_rating", None, 4),
        ]
        assert rated(db)[ids[0]] == 4

    def test_a_rating_out_of_range_is_refused(self, service, ids):
        with pytest.raises(ValueError, match="Rating"):
            service.apply_batch(
                BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_RATING, 9)
            )

    def test_a_rating_of_zero_is_a_rating(self, service, db, ids):
        """DEC-034: zero stars is a value, not the absence of one."""
        service.apply_batch(
            BatchSelection.of_ids(ids[:3]), BatchOperation(OPERATION_SET_RATING, 0)
        )
        assert rated(db) == {ids[0]: 0, ids[1]: 0, ids[2]: 0}

    def test_clearing_a_rating_is_not_rating_it_zero(self, service, db, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:3]), BatchOperation(OPERATION_SET_RATING, 5)
        )
        service.apply_batch(
            BatchSelection.of_ids(ids[:3]), BatchOperation(OPERATION_SET_RATING, None)
        )
        assert rated(db) == {}

    def test_favorite_will_not_take_the_word_true(self, service, ids):
        """``bool("false")`` is True, which is why nothing is coerced here."""
        with pytest.raises(ValueError, match="true or false"):
            service.apply_batch(
                BatchSelection.of_ids(ids),
                BatchOperation(OPERATION_SET_FAVORITE, "false"),
            )

    def test_favorite_will_not_take_a_number(self, service, ids):
        with pytest.raises(ValueError, match="true or false"):
            service.apply_batch(
                BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_FAVORITE, 1)
            )

    @pytest.mark.parametrize("value", [0, -3, "seven", None, True])
    def test_a_tag_needs_an_id(self, value):
        with pytest.raises(ValueError, match="needs an id"):
            BatchOperation(OPERATION_ADD_TAG, value).validated()

    def test_the_verb_is_trimmed_rather_than_rejected(self):
        assert BatchOperation(" add_tag ", 3).validated().kind == OPERATION_ADD_TAG


@pytest.mark.unit
class TestApplyingEachOperation:
    def test_rating(self, service, db, ids):
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_SET_RATING, 3)
        )
        assert result.changed == 6
        assert set(rated(db)) == set(ids[:6])

    def test_favorite(self, service, db, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_SET_FAVORITE, True)
        )
        rows = db.connect().execute(
            "SELECT track_id FROM track_metadata WHERE favorite = 1"
        )
        assert {int(row["track_id"]) for row in rows} == set(ids[:6])

    def test_adding_a_tag(self, service, db, ids, peak):
        service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert tagged(db, peak.id) == set(ids[:6])

    def test_removing_a_tag(self, service, db, tags, ids, peak):
        tags.assign(ids, peak.id)
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]),
            BatchOperation(OPERATION_REMOVE_TAG, peak.id),
        )
        assert result.changed == 6
        assert tagged(db, peak.id) == set(ids[6:])

    def test_adding_to_a_collection(self, service, db, ids, warmups):
        service.apply_batch(
            BatchSelection.of_ids(ids[:6]),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, warmups.id),
        )
        assert members(db, warmups.id) == ids[:6]

    def test_removing_from_a_collection(self, service, db, collections, ids, warmups):
        collections.add_tracks(warmups.id, ids)
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, warmups.id),
        )
        assert result.changed == 6
        assert members(db, warmups.id) == ids[6:]

    def test_a_track_in_a_collection_twice_leaves_with_both_entries(
        self, service, db, collections, ids, warmups
    ):
        """DEC-058 allows the duplicate; a removal that left one behind would
        look to a user like it had not worked."""
        collections.add_tracks(warmups.id, ids[:3])
        collections.insert_track(warmups.id, ids[0], 0)
        assert members(db, warmups.id).count(ids[0]) == 2

        result = service.apply_batch(
            BatchSelection.of_ids([ids[0]]),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, warmups.id),
        )
        assert result.changed == 1
        assert ids[0] not in members(db, warmups.id)

    def test_a_track_already_in_the_collection_is_unchanged_not_added_again(
        self, service, db, collections, ids, warmups
    ):
        collections.add_tracks(warmups.id, ids[:3])
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, warmups.id),
        )
        assert (result.changed, result.unchanged) == (3, 3)
        assert members(db, warmups.id) == ids[:6]

    def test_a_tag_a_track_already_has_is_unchanged(self, service, tags, ids, peak):
        tags.assign(ids[:3], peak.id)
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert (result.changed, result.unchanged) == (3, 3)

    def test_removing_a_tag_nothing_carries_changes_nothing(self, service, ids, peak):
        result = service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_REMOVE_TAG, peak.id)
        )
        assert (result.changed, result.unchanged) == (0, TRACK_COUNT)

    def test_removing_from_a_collection_a_track_is_not_in(
        self, service, ids, warmups, collections
    ):
        collections.add_tracks(warmups.id, ids[:2])
        result = service.apply_batch(
            BatchSelection.of_ids(ids[2:5]),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, warmups.id),
        )
        assert (result.changed, result.unchanged) == (0, 3)

    def test_a_mixed_selection_counts_only_what_was_actually_removed(
        self, service, db, ids, warmups, collections
    ):
        """Three of the six are in the Collection, and three were never there.

        The batch reports what the write did rather than what it was asked to
        do — a distinction that only shows when a chunk holds both kinds, and
        the gesture that produces one is selecting a page of the table and
        choosing "remove from this Collection".
        """
        collections.add_tracks(warmups.id, ids[:3])
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, warmups.id),
        )
        assert (result.changed, result.unchanged) == (3, 3)
        assert members(db, warmups.id) == []


@pytest.mark.unit
class TestTheTargetMustExist:
    def test_a_missing_tag_refuses_the_batch_rather_than_every_track(
        self, service, db, ids
    ):
        """One refusal, before anything is written.

        The alternative is what happens without the check: the tag service
        raises on every track, and 47,913 failures are reported as the answer
        to a question that should never have started.
        """
        with pytest.raises(ValueError, match="No such tag"):
            service.apply_batch(
                BatchSelection.of_ids(ids), BatchOperation(OPERATION_ADD_TAG, 4242)
            )
        assert all_history(db) == []

    def test_a_missing_collection_refuses_the_batch(self, service, ids):
        with pytest.raises(ValueError, match="No such collection"):
            service.apply_batch(
                BatchSelection.of_ids(ids),
                BatchOperation(OPERATION_ADD_TO_COLLECTION, 4242),
            )

    def test_a_folder_cannot_be_added_to(self, service, collections, ids):
        folder = collections.create_folder("Sets")
        with pytest.raises(ValueError):
            service.apply_batch(
                BatchSelection.of_ids(ids),
                BatchOperation(OPERATION_ADD_TO_COLLECTION, folder.id),
            )

    def test_a_smart_collection_cannot_be_added_to(self, service, collections, ids):
        """DEC-061: it holds a question, and rows against it are a second
        answer to it. The refusal is the tree service's own."""
        smart = collections.create_smart(
            "Techno", RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        )
        with pytest.raises(ValueError):
            service.apply_batch(
                BatchSelection.of_ids(ids),
                BatchOperation(OPERATION_ADD_TO_COLLECTION, smart.id),
            )

    def test_a_smart_collection_cannot_be_removed_from(self, service, collections, ids):
        smart = collections.create_smart(
            "Techno", RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        )
        with pytest.raises(ValueError):
            service.apply_batch(
                BatchSelection.of_ids(ids),
                BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, smart.id),
            )

    def test_a_frozen_collection_can_be_added_to(self, service, db, collections, ids):
        """It is rows rather than a question, so it takes tracks like any
        other Collection (ORG-06)."""
        smart = collections.create_smart(
            "Techno", RuleSet(rules=(FilterRule("genre", "is", "Techno"),))
        )
        frozen = collections.freeze(smart.id).collection
        result = service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, frozen.id),
        )
        assert result.changed + result.unchanged == TRACK_COUNT


@pytest.mark.unit
class TestHistory:
    def test_every_changed_field_writes_one_row(self, service, db, ids):
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_SET_RATING, 2)
        )
        rows = history_rows(db, result.batch_id)
        assert len(rows) == 6
        assert {int(row["track_id"]) for row in rows} == set(ids[:6])

    def test_the_rows_of_one_run_share_one_batch_id(self, service, db, ids, peak):
        result = service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        rows = all_history(db)
        assert len(rows) == TRACK_COUNT
        assert {row["batch_id"] for row in rows} == {result.batch_id}

    def test_the_rows_of_one_run_share_one_batch_id_across_chunks(
        self, service, db, monkeypatch, ids, peak
    ):
        """A batch id made per chunk would pass every single-chunk test."""
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 4)
        result = service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert len(history_rows(db, result.batch_id)) == TRACK_COUNT

    def test_two_batches_are_two_batch_ids(self, service, ids, peak):
        first = service.apply_batch(
            BatchSelection.of_ids(ids[:3]), BatchOperation(OPERATION_SET_RATING, 1)
        )
        second = service.apply_batch(
            BatchSelection.of_ids(ids[:3]), BatchOperation(OPERATION_SET_RATING, 2)
        )
        assert first.batch_id != second.batch_id

    def test_a_no_op_writes_no_row(self, service, db, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_SET_RATING, 2)
        )
        again = service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_SET_RATING, 2)
        )
        assert again.changed == 0
        assert history_rows(db, again.batch_id) == []

    def test_the_changed_count_is_the_number_of_history_rows(
        self, service, db, tags, ids, peak
    ):
        """Two definitions of "a change", pinned to each other.

        ``changed`` is computed by this service and the rows are written by
        ``record_field_change``; nothing but this test stops them drifting
        apart, and a count that disagrees with the History tab is worse than
        no count.
        """
        tags.assign(ids[:10], peak.id)
        result = service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert result.changed == len(history_rows(db, result.batch_id))
        assert result.changed == TRACK_COUNT - 10

    def test_a_removal_is_recorded_as_the_inverse(self, service, db, tags, ids, peak):
        tags.assign(ids[:2], peak.id)
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:2]),
            BatchOperation(OPERATION_REMOVE_TAG, peak.id),
        )
        assert _changes(history_rows(db, result.batch_id)) == [
            ("tag", "Peak time", None),
            ("tag", "Peak time", None),
        ]

    def test_the_previous_value_is_recorded(self, service, db, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_RATING, 1)
        )
        second = service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_RATING, 5)
        )
        assert _changes(history_rows(db, second.batch_id)) == [
            ("cuepoint_rating", 1, 5),
            ("cuepoint_rating", 1, 5),
        ]

    def test_collection_membership_writes_no_history(
        self, service, db, ids, warmups, collections
    ):
        """The decision, asserted rather than assumed (ORG-04).

        Membership is an entry row rather than a field of a track, and no path
        records it — not a drag, not a menu, not this. Recording it here alone
        would mean the same action was in the History tab when it came from the
        toolbar and absent when it came from a drag.
        """
        collections.add_tracks(warmups.id, ids[:4])
        added = service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, warmups.id),
        )
        removed = service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, warmups.id),
        )
        assert history_rows(db, added.batch_id) == []
        assert history_rows(db, removed.batch_id) == []
        assert all_history(db) == []

    def test_a_batch_id_is_never_written_to_a_single_track_edit(
        self, service, metadata, db, ids
    ):
        """The id has to mean "one of these", or reverting a batch later takes
        edits that were not part of it."""
        metadata.set_rating(ids[0], 3)
        assert [row["batch_id"] for row in history_for(db, ids[0])] == [None]


@pytest.mark.unit
class TestTheActivityEvent:
    def test_one_event_per_batch_not_one_per_track(
        self, service, activity, monkeypatch, ids, peak
    ):
        """DEC-029 wants one event for one user action; the chunks are an
        implementation detail and must not each announce themselves."""
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 4)
        service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert len(batch_events(activity)) == 1

    def test_the_event_carries_the_counts_and_the_batch_id(
        self, service, activity, tags, ids, peak
    ):
        tags.assign(ids[:10], peak.id)
        result = service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        detail = batch_events(activity)[0].detail
        assert detail["batch_id"] == result.batch_id
        assert detail["operation"] == OPERATION_ADD_TAG
        assert detail["total"] == TRACK_COUNT
        assert detail["changed"] == TRACK_COUNT - 10
        assert detail["unchanged"] == 10
        assert detail["failed"] == 0
        assert detail["cancelled"] is False

    def test_the_summary_names_what_happened_and_to_how_many(
        self, service, activity, ids, peak
    ):
        service.apply_batch(
            BatchSelection.of_ids(ids[:5]), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert batch_events(activity)[0].summary == "Tagged 5 tracks as 'Peak time'"

    def test_the_summary_counts_one_track_as_one_track(
        self, service, activity, ids, warmups
    ):
        service.apply_batch(
            BatchSelection.of_ids(ids[:1]),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, warmups.id),
        )
        assert batch_events(activity)[0].summary.endswith("1 track to 'Warmups'")

    def test_the_summary_counts_what_changed_not_what_was_selected(
        self, service, activity, ids
    ):
        """ "Rated 5 tracks" when nothing changed is a feed that lies.

        The number in the sentence is ``changed``, and the tracks that were
        already like that are the note after the dash — which is the only
        reading a user can reconcile with what they see afterwards.
        """
        service.apply_batch(
            BatchSelection.of_ids(ids[:5]), BatchOperation(OPERATION_SET_RATING, 4)
        )
        service.apply_batch(
            BatchSelection.of_ids(ids[:5]), BatchOperation(OPERATION_SET_RATING, 4)
        )
        assert (
            batch_events(activity)[0].summary == "Rated 0 tracks 4 stars — 5 unchanged"
        )

    def test_the_summary_says_what_it_did_not_change(self, service, activity, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:5]), BatchOperation(OPERATION_SET_RATING, 4)
        )
        service.apply_batch(
            BatchSelection.of_ids(ids[:5]), BatchOperation(OPERATION_SET_RATING, 4)
        )
        assert batch_events(activity)[0].summary.endswith("5 unchanged")

    def test_the_summary_says_a_rating_of_one_star(self, service, activity, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_RATING, 1)
        )
        assert batch_events(activity)[0].summary == "Rated 2 tracks 1 star"

    def test_the_summary_of_a_cleared_rating_says_so(self, service, activity, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_RATING, 3)
        )
        service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_RATING, None)
        )
        assert batch_events(activity)[0].summary == "Cleared the rating on 2 tracks"

    def test_unfavoriting_and_favoriting_read_differently(self, service, activity, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_FAVORITE, True)
        )
        assert batch_events(activity)[0].summary == "Favorited 2 tracks"
        service.apply_batch(
            BatchSelection.of_ids(ids[:2]),
            BatchOperation(OPERATION_SET_FAVORITE, False),
        )
        assert batch_events(activity)[0].summary == "Unfavorited 2 tracks"

    def test_removing_a_tag_reads_as_a_removal(
        self, service, activity, tags, ids, peak
    ):
        tags.assign(ids[:3], peak.id)
        service.apply_batch(
            BatchSelection.of_ids(ids[:3]),
            BatchOperation(OPERATION_REMOVE_TAG, peak.id),
        )
        assert batch_events(activity)[0].summary == "Removed 'Peak time' from 3 tracks"

    def test_a_removal_from_a_collection_names_it(
        self, service, activity, collections, ids, warmups
    ):
        collections.add_tracks(warmups.id, ids[:3])
        service.apply_batch(
            BatchSelection.of_ids(ids[:3]),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, warmups.id),
        )
        assert batch_events(activity)[0].summary == "Removed 3 tracks from 'Warmups'"

    def test_a_batch_that_changed_nothing_still_says_it_happened(
        self, service, activity, ids
    ):
        """A user who picked the rating tracks already had did do something,
        and a feed that stayed silent would look like a lost click."""
        service.apply_batch(
            BatchSelection.of_ids(ids[:3]), BatchOperation(OPERATION_SET_RATING, 4)
        )
        service.apply_batch(
            BatchSelection.of_ids(ids[:3]), BatchOperation(OPERATION_SET_RATING, 4)
        )
        assert len(batch_events(activity)) == 2


@pytest.mark.unit
class TestCancelling:
    def test_a_cancel_stops_within_one_chunk(self, service, db, monkeypatch, ids):
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 5)
        asked = {"n": 0}

        def should_cancel():
            asked["n"] += 1
            return asked["n"] > 2

        result = service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_SET_RATING, 4),
            should_cancel=should_cancel,
        )
        assert result.cancelled is True
        assert result.completed == 10
        assert len(rated(db)) == 10

    def test_what_was_applied_stays_applied(self, service, db, monkeypatch, ids, peak):
        """DEC-063 says so out loud rather than leaving a user to discover it:
        a batch is not one transaction across 47,913 tracks."""
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 5)
        calls = {"n": 0}

        def should_cancel():
            calls["n"] += 1
            return calls["n"] > 3

        service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_ADD_TAG, peak.id),
            should_cancel=should_cancel,
        )
        assert tagged(db, peak.id) == set(ids[:15])

    def test_a_cancelled_batch_reports_how_far_it_got(
        self, service, activity, monkeypatch, ids
    ):
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 5)
        calls = {"n": 0}

        def should_cancel():
            calls["n"] += 1
            return calls["n"] > 1

        result = service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_SET_RATING, 4),
            should_cancel=should_cancel,
        )
        assert (result.completed, result.total) == (5, TRACK_COUNT)
        event = batch_events(activity)[0]
        assert event.detail["cancelled"] is True
        assert event.detail["changed"] == 5
        assert "cancelled after 5 of 40" in event.summary

    def test_a_cancel_before_the_first_chunk_applies_nothing(
        self, service, db, activity, ids
    ):
        result = service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_SET_RATING, 4),
            should_cancel=lambda: True,
        )
        assert (result.completed, result.changed) == (0, 0)
        assert rated(db) == {}
        assert len(batch_events(activity)) == 1

    def test_a_batch_nobody_cancels_runs_to_the_end(self, service, db, ids):
        result = service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_RATING, 4)
        )
        assert result.cancelled is False
        assert result.completed == TRACK_COUNT


@pytest.mark.unit
class TestProgress:
    def test_progress_starts_at_zero_and_reaches_the_total(
        self, service, monkeypatch, ids
    ):
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 10)
        ticks = []
        service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_SET_RATING, 4),
            on_progress=lambda done, total: ticks.append((done, total)),
        )
        assert ticks[0] == (0, TRACK_COUNT)
        assert ticks[-1] == (TRACK_COUNT, TRACK_COUNT)
        assert ticks == [(n, TRACK_COUNT) for n in (0, 10, 20, 30, 40)]

    def test_progress_is_reported_per_chunk_not_per_track(
        self, service, monkeypatch, ids
    ):
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 20)
        ticks = []
        service.apply_batch(
            BatchSelection.of_ids(ids),
            BatchOperation(OPERATION_SET_RATING, 4),
            on_progress=lambda done, total: ticks.append(done),
        )
        assert ticks == [0, 20, 40]

    def test_a_batch_without_a_listener_still_runs(self, service, db, ids):
        service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_RATING, 4)
        )
        assert len(rated(db)) == TRACK_COUNT


@pytest.mark.unit
class TestOneCommitPerChunk:
    def test_a_chunk_is_one_transaction(self, service, db, monkeypatch, ids):
        """The 144× that makes a 47,913-track batch possible (ORG-02).

        Counted rather than timed: a per-track commit is a second slower per
        thousand tracks and nothing but the clock would notice, which is
        exactly the kind of regression a test has to be able to see.
        """
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 10)
        connection = db.connect()
        statements = []
        connection.set_trace_callback(statements.append)
        try:
            service.apply_batch(
                BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_RATING, 3)
            )
        finally:
            connection.set_trace_callback(None)

        begins = [s for s in statements if s.startswith("BEGIN")]
        commits = [s for s in statements if s.startswith("COMMIT")]
        # Four chunks, plus the one the activity event is written in.
        assert len(begins) == 5
        assert len(commits) == 5

    def test_a_chunk_that_fails_leaves_the_chunks_before_it_applied(
        self, service, db, monkeypatch, ids
    ):
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 10)
        gone = ids[15]
        db.connect().execute("DELETE FROM tracks WHERE id = ?", (gone,))
        db.connect().commit()

        result = service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_RATING, 3)
        )
        assert result.failed == 1
        assert result.changed == TRACK_COUNT - 1
        assert len(rated(db)) == TRACK_COUNT - 1


@pytest.mark.unit
class TestATrackThatIsGone:
    def test_it_is_counted_and_the_batch_completes(self, service, db, ids):
        gone = ids[3]
        db.connect().execute("DELETE FROM tracks WHERE id = ?", (gone,))
        db.connect().commit()

        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_SET_RATING, 2)
        )
        assert (result.changed, result.failed) == (5, 1)
        assert gone not in rated(db)

    def test_the_rest_of_its_chunk_is_still_applied(self, service, db, ids, peak):
        """The retry path, which is the whole reason it exists: a set-shaped
        insert cannot say which row the foreign key complained about."""
        gone = ids[3]
        db.connect().execute("DELETE FROM tracks WHERE id = ?", (gone,))
        db.connect().commit()

        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert (result.changed, result.failed) == (5, 1)
        assert tagged(db, peak.id) == set(ids[:6]) - {gone}

    def test_a_selection_of_nothing_but_missing_tracks_completes(self, service):
        result = service.apply_batch(
            BatchSelection.of_ids([900_001, 900_002]),
            BatchOperation(OPERATION_SET_RATING, 2),
        )
        assert (result.total, result.failed, result.changed) == (2, 2, 0)

    def test_a_failure_is_not_recorded_as_a_change(self, service, db, ids, peak):
        gone = ids[3]
        db.connect().execute("DELETE FROM tracks WHERE id = ?", (gone,))
        db.connect().commit()
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:6]), BatchOperation(OPERATION_ADD_TAG, peak.id)
        )
        assert len(history_rows(db, result.batch_id)) == result.changed


@pytest.mark.unit
class TestTheResult:
    def test_a_batch_that_ran_to_the_end_accounts_for_every_track(self):
        with pytest.raises(ValueError, match="accounts for every track"):
            BatchResult(
                batch_id="b", operation="set_rating", target="4", total=10, changed=4
            )

    def test_a_batch_cannot_account_for_more_than_it_resolved(self):
        with pytest.raises(ValueError, match="cannot account for"):
            BatchResult(
                batch_id="b", operation="set_rating", target="4", total=2, changed=3
            )

    def test_a_cancelled_batch_may_stop_short(self):
        result = BatchResult(
            batch_id="b",
            operation="set_rating",
            target="4",
            total=10,
            changed=4,
            cancelled=True,
        )
        assert result.completed == 4

    def test_every_count_is_in_the_payload(self, service, ids):
        result = service.apply_batch(
            BatchSelection.of_ids(ids[:2]), BatchOperation(OPERATION_SET_RATING, 4)
        )
        assert result.to_dict() == {
            "batch_id": result.batch_id,
            "operation": OPERATION_SET_RATING,
            "target": "4",
            "total": 2,
            "changed": 2,
            "unchanged": 0,
            "failed": 0,
            "cancelled": False,
        }


@pytest.mark.unit
class TestNothingHalfDone:
    def test_a_batch_whose_event_cannot_be_written_fails_loudly(
        self, db, metadata, tags, collections, tracks, ids, warmups
    ):
        """The event is the last thing a batch writes, and it is not optional.

        It cannot be atomic with the work, and that is the trade DEC-063 made
        deliberately: the chunks commit one at a time so a cancel can keep what
        it applied, which means no single transaction spans them. So a feed
        that refuses is a batch that *raises* rather than one that returns
        counts nothing recorded — the caller finds out that the library moved
        and the record of it did not.
        """
        broken = BatchService(metadata, tags, collections, tracks, Refuses(), db)
        with pytest.raises(RuntimeError, match="feed is unavailable"):
            broken.apply_batch(
                BatchSelection.of_ids(ids[:3]),
                BatchOperation(OPERATION_ADD_TO_COLLECTION, warmups.id),
            )
        assert members(db, warmups.id) == ids[:3]

    def test_a_transaction_is_never_left_open(self, service, db, ids):
        """Every path out of a chunk closes its transaction, including the
        retry one — a leaked transaction locks the next writer out."""
        gone = ids[2]
        db.connect().execute("DELETE FROM tracks WHERE id = ?", (gone,))
        db.connect().commit()
        service.apply_batch(
            BatchSelection.of_ids(ids[:5]), BatchOperation(OPERATION_SET_RATING, 1)
        )
        assert db.connect().in_transaction is False


@pytest.mark.unit
class TestTheAppStaysResponsive:
    """The DoD's last clause, which is a property of the chunks.

    A batch is not one long transaction, and the database is in WAL mode, so a
    reader never waits for it. Both halves are asserted: the mode, because it
    is the reason, and a reader actually running against a batch in flight,
    because a reason is not a result.
    """

    def test_the_database_is_in_wal_mode(self, db):
        row = db.connect().execute("PRAGMA journal_mode").fetchone()
        assert str(row[0]).lower() == "wal"

    def test_a_reader_is_not_blocked_by_a_batch_in_flight(
        self, service, db, monkeypatch, ids
    ):
        """One track per chunk, so the batch is in a transaction almost all of
        the time it is running, and a second connection reads throughout."""
        monkeypatch.setattr("cuepoint.services.batch_service.BATCH_CHUNK_SIZE", 1)
        reads: List[int] = []
        failures: List[Exception] = []
        stop = threading.Event()

        def keep_reading() -> None:
            reader = DatabaseService(db_path=db.db_path)
            try:
                while not stop.is_set():
                    row = (
                        reader.connect()
                        .execute("SELECT count(*) AS n FROM tracks")
                        .fetchone()
                    )
                    reads.append(int(row["n"]))
            except Exception as exc:  # noqa: BLE001 — the point of the test
                failures.append(exc)
            finally:
                reader.close_all()

        watcher = threading.Thread(target=keep_reading, daemon=True)
        watcher.start()
        try:
            service.apply_batch(
                BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_RATING, 4)
            )
        finally:
            stop.set()
            watcher.join(timeout=10)

        assert failures == []
        assert reads and set(reads) == {TRACK_COUNT}


@pytest.mark.unit
class TestTheContract:
    def test_every_operation_is_declared_on_the_interface(self):
        declared = {
            name
            for name, value in vars(IBatchService).items()
            if getattr(value, "__isabstractmethod__", False)
        }
        offered = {
            name
            for name, value in vars(BatchService).items()
            if not name.startswith("_") and callable(value)
        }
        assert offered == declared

    def test_the_service_is_the_interface(self, service):
        assert isinstance(service, IBatchService)


@pytest.mark.unit
class TestTheDatabaseStaysHonest:
    def test_no_rekordbox_column_is_written(self, service, db, ids):
        """DEC-057: CuePoint's values live in a sibling table, and a batch is
        the operation most able to overwrite a library at speed."""
        before = (
            db.connect()
            .execute("SELECT id, rating, comment FROM tracks ORDER BY id")
            .fetchall()
        )
        service.apply_batch(
            BatchSelection.of_ids(ids), BatchOperation(OPERATION_SET_RATING, 5)
        )
        after = (
            db.connect()
            .execute("SELECT id, rating, comment FROM tracks ORDER BY id")
            .fetchall()
        )
        assert [tuple(row) for row in before] == [tuple(row) for row in after]

    def test_no_track_is_deleted_by_any_operation(
        self, service, db, ids, peak, warmups, collections
    ):
        collections.add_tracks(warmups.id, ids)
        for operation in (
            BatchOperation(OPERATION_SET_RATING, 2),
            BatchOperation(OPERATION_SET_FAVORITE, True),
            BatchOperation(OPERATION_ADD_TAG, peak.id),
            BatchOperation(OPERATION_REMOVE_TAG, peak.id),
            BatchOperation(OPERATION_ADD_TO_COLLECTION, warmups.id),
            BatchOperation(OPERATION_REMOVE_FROM_COLLECTION, warmups.id),
        ):
            service.apply_batch(BatchSelection.of_ids(ids), operation)
        count = db.connect().execute("SELECT count(*) AS n FROM tracks").fetchone()
        assert int(count["n"]) == TRACK_COUNT

    def test_foreign_keys_are_on_which_is_what_makes_a_gone_track_fail(self, db):
        """Guards the guard: without enforcement, a batch would happily write
        rows pointing at tracks that are not there, and the failure tests above
        would pass by never failing."""
        row = db.connect().execute("PRAGMA foreign_keys").fetchone()
        assert int(row[0]) == 1

    def test_a_batch_cannot_be_run_inside_someone_elses_transaction(
        self, service, db, ids
    ):
        """It owns its chunk boundaries; joining one would mean a cancel could
        not keep what it applied, which is the property DEC-063 chose."""
        with db.transaction():
            with pytest.raises(DatabaseError) as refused:
                service.apply_batch(
                    BatchSelection.of_ids(ids[:2]),
                    BatchOperation(OPERATION_SET_RATING, 1),
                )
        assert refused.value.error_code == "DB_NESTED_TRANSACTION"
