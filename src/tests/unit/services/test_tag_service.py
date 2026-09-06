#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Building and applying tags (ORG-03, DEC-015, DEC-008).

The service layer, where the interesting question is *what counts as a change
to a track*. Renaming a tag changes a word; putting one on a track changes the
track. The first writes no track history and the second writes one entry per
track that actually changed, naming the tag — so a History tab reads "added
Peak-time" rather than "tags changed".

Three properties are load-bearing:

**Create-or-get, not create-or-fail.** Tags are made by typing them, so typing
a name that already exists in another case has to mean the tag you already
have.

**History follows the tracks, not the vocabulary.** A rename writes nothing; a
delete writes a removal for every track that carried the tag, because from that
track's side the tag is gone and nothing else would say where it went.

**One transaction per operation.** Tagging twelve thousand tracks and the
twelve thousand history entries recording it either both happen or neither
does. That is only possible because ORG-03 made the history writer join an open
transaction instead of demanding its own.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_service import FIELD_TAG, SOURCE_USER, TagService


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
            )
            for i in range(1, 8)
        ]
    )
    return repo


@pytest.fixture
def ids(db, tracks):
    rows = db.connect().execute("SELECT id FROM tracks ORDER BY id").fetchall()
    return [int(row["id"]) for row in rows]


@pytest.fixture
def activity(db, tracks):
    return ActivityService(ActivityRepository(db), tracks)


@pytest.fixture
def service(db, tracks, activity):
    return TagService(TagRepository(db), activity, db)


@pytest.fixture
def peak(service) -> int:
    return int(service.create_or_get("Peak-time").id)


@pytest.fixture
def warmup(service) -> int:
    return int(service.create_or_get("Warmup").id)


def history(activity, track_id):
    return activity.track_history(track_id)


def tag_events(activity, track_id):
    return [
        (entry.old_value, entry.new_value)
        for entry in history(activity, track_id)
        if entry.field_name == FIELD_TAG
    ]


class TestCreateOrGet:
    def test_a_new_name_makes_a_tag(self, service):
        tag = service.create_or_get("Dub")
        assert tag.id is not None
        assert tag.name == "Dub"

    def test_the_same_name_returns_the_same_tag(self, service, peak):
        assert service.create_or_get("Peak-time").id == peak

    def test_another_case_returns_the_same_tag(self, service, peak):
        # Typing "peak-time" when "Peak-time" exists means the tag you have.
        # An error about capitalization would be a worse answer.
        assert service.create_or_get("PEAK-TIME").id == peak

    def test_an_existing_tag_is_not_restyled(self, service, peak):
        service.set_colour(peak, "danger")
        again = service.create_or_get("peak-time", category="Mood", colour="info")
        assert (again.colour, again.category) == ("danger", None)

    def test_a_new_tag_takes_the_category_and_colour_given(self, service):
        tag = service.create_or_get("Dark", category="Mood", colour="info")
        assert (tag.category, tag.colour) == ("Mood", "info")

    @pytest.mark.parametrize("name", ["", "   ", None])
    def test_a_tag_needs_a_name(self, service, name):
        with pytest.raises(ValueError, match="needs a name"):
            service.create_or_get(name)

    def test_a_colour_outside_the_theme_tokens_is_refused(self, service):
        with pytest.raises(ValueError, match="must be one of"):
            service.create_or_get("Dark", colour="#ff0000")

    def test_a_refused_tag_is_not_created(self, service):
        with pytest.raises(ValueError):
            service.create_or_get("Dark", colour="#ff0000")
        assert service.list_all() == []


class TestTheVocabularyIsNotTheTracks:
    def test_renaming_writes_no_track_history(self, service, activity, peak, ids):
        service.assign(ids[:3], peak)
        before = len(history(activity, ids[0]))
        service.rename(peak, "Peaktime")
        # The track is the same track carrying the same tag, spelled better.
        assert len(history(activity, ids[0])) == before

    def test_renaming_keeps_the_assignments(self, service, peak, ids):
        service.assign(ids[:3], peak)
        service.rename(peak, "Peaktime")
        assert [t.name for t in service.tags_for_track(ids[0])] == ["Peaktime"]

    def test_recolouring_writes_no_track_history(self, service, activity, peak, ids):
        service.assign([ids[0]], peak)
        before = len(history(activity, ids[0]))
        service.set_colour(peak, "warning")
        service.set_category(peak, "Energy")
        assert len(history(activity, ids[0])) == before

    def test_renaming_to_the_same_name_is_a_no_op(self, service, peak):
        assert service.rename(peak, "Peak-time").id == peak

    def test_renaming_onto_another_tag_is_refused_and_says_what_to_do(
        self, service, peak, warmup
    ):
        with pytest.raises(ValueError, match="Merge the two tags"):
            service.rename(warmup, "peak-time")

    def test_renaming_onto_another_tag_changes_nothing(self, service, peak, warmup):
        with pytest.raises(ValueError):
            service.rename(warmup, "peak-time")
        assert service.list_all()[1].tag.name == "Warmup"

    @pytest.mark.parametrize(
        "call",
        [
            lambda s: s.rename(999_999, "X"),
            lambda s: s.set_colour(999_999, "info"),
            lambda s: s.set_category(999_999, "Mood"),
            lambda s: s.delete(999_999),
            lambda s: s.assign([1], 999_999),
            lambda s: s.unassign([1], 999_999),
        ],
    )
    def test_a_tag_that_is_not_there_is_refused_by_name(self, service, call):
        with pytest.raises(ValueError, match="No such tag"):
            call(service)


class TestAssignmentHistory:
    def test_adding_a_tag_is_recorded_by_name(self, service, activity, peak, ids):
        service.assign([ids[0]], peak)
        entry = history(activity, ids[0])[0]
        assert entry.field_name == FIELD_TAG
        assert (entry.old_value, entry.new_value) == (None, "Peak-time")
        assert entry.source == SOURCE_USER

    def test_removing_a_tag_is_the_inverse(self, service, activity, peak, ids):
        service.assign([ids[0]], peak)
        service.unassign([ids[0]], peak)
        assert tag_events(activity, ids[0])[0] == ("Peak-time", None)

    def test_every_track_that_changed_is_recorded(self, service, activity, peak, ids):
        service.assign(ids[:3], peak)
        assert all(len(tag_events(activity, i)) == 1 for i in ids[:3])
        assert tag_events(activity, ids[3]) == []

    def test_a_track_that_already_had_it_records_nothing(
        self, service, activity, peak, ids
    ):
        service.assign([ids[0]], peak)
        service.assign(ids[:2], peak)
        assert len(tag_events(activity, ids[0])) == 1
        assert len(tag_events(activity, ids[1])) == 1

    def test_unassigning_what_was_not_there_records_nothing(
        self, service, activity, peak, ids
    ):
        service.unassign(ids[:3], peak)
        assert tag_events(activity, ids[0]) == []

    def test_a_batch_id_is_carried_onto_every_entry(self, service, activity, peak, ids):
        service.assign(ids[:3], peak, batch_id="batch-9")
        assert all(
            entry.batch_id == "batch-9"
            for track_id in ids[:3]
            for entry in history(activity, track_id)
        )

    def test_an_ordinary_assignment_is_not_part_of_a_batch(
        self, service, activity, peak, ids
    ):
        service.assign([ids[0]], peak)
        assert history(activity, ids[0])[0].batch_id is None

    def test_the_name_is_recorded_not_the_id(self, service, activity, peak, ids):
        # A history entry has to stay readable after the tag is gone.
        service.assign([ids[0]], peak)
        service.delete(peak)
        assert tag_events(activity, ids[0])[-1] == (None, "Peak-time")


class TestDeleting:
    def test_it_records_a_removal_for_every_track_that_had_it(
        self, service, activity, peak, ids
    ):
        service.assign(ids[:3], peak)
        assert service.delete(peak) == 3
        for track_id in ids[:3]:
            assert tag_events(activity, track_id)[0] == ("Peak-time", None)

    def test_it_deletes_no_tracks(self, service, tracks, peak, ids):
        service.assign(ids, peak)
        service.delete(peak)
        assert tracks.count() == len(ids)

    def test_deleting_an_unused_tag_records_nothing(self, service, activity, peak, ids):
        assert service.delete(peak) == 0
        assert tag_events(activity, ids[0]) == []


class TestMerging:
    def test_the_tracks_end_up_on_the_target(self, service, peak, warmup, ids):
        service.assign(ids[:3], warmup)
        service.merge(warmup, peak)
        assert [t.name for t in service.tags_for_track(ids[0])] == ["Peak-time"]

    def test_it_reports_how_many_tracks_gained_the_target(
        self, service, peak, warmup, ids
    ):
        service.assign(ids[:2], peak)
        service.assign(ids[1:4], warmup)
        assert service.merge(warmup, peak) == 2

    def test_a_moved_track_records_both_halves(
        self, service, activity, peak, warmup, ids
    ):
        service.assign([ids[0]], warmup)
        service.merge(warmup, peak)
        assert set(tag_events(activity, ids[0])) == {
            (None, "Warmup"),
            ("Warmup", None),
            (None, "Peak-time"),
        }

    def test_a_track_that_had_both_records_only_the_loss(
        self, service, activity, peak, warmup, ids
    ):
        # It keeps the tag it already had, so there is nothing gained to
        # record — but the tag it was carrying really is gone.
        service.assign([ids[0]], peak)
        service.assign([ids[0]], warmup)
        service.merge(warmup, peak)

        events = tag_events(activity, ids[0])
        assert events.count(("Warmup", None)) == 1
        assert events.count((None, "Peak-time")) == 1  # the original assignment

    def test_merging_a_tag_into_itself_is_refused(self, service, peak):
        with pytest.raises(ValueError, match="into itself"):
            service.merge(peak, peak)

    def test_merging_a_tag_that_is_not_there_is_refused(self, service, peak):
        with pytest.raises(ValueError, match="No such tag"):
            service.merge(999_999, peak)
        with pytest.raises(ValueError, match="No such tag"):
            service.merge(peak, 999_999)

    def test_a_batch_id_reaches_both_halves(self, service, activity, peak, warmup, ids):
        service.assign([ids[0]], warmup)
        service.merge(warmup, peak, batch_id="merge-1")
        merged = [e for e in history(activity, ids[0]) if e.batch_id == "merge-1"]
        assert len(merged) == 2


class TestOneTransaction:
    def test_a_failure_leaves_neither_the_tags_nor_the_history(
        self, db, service, activity, peak, ids, monkeypatch
    ):
        """The property the whole transaction argument rests on.

        History used to be written in its own transaction, which meant it
        committed even when the work it described was rolled back. This asserts
        the opposite: a failure part-way through an assignment leaves no tag on
        any track and no entry claiming there is one.
        """
        real = service._activity.record_field_change
        calls = {"n": 0}

        def explode(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] > 1:
                raise RuntimeError("boom")
            return real(*args, **kwargs)

        monkeypatch.setattr(service._activity, "record_field_change", explode)

        with pytest.raises(RuntimeError):
            service.assign(ids[:3], peak)

        assert service.tags_for_tracks(ids) == {}
        assert all(tag_events(activity, track_id) == [] for track_id in ids[:3])

    def test_tagging_many_tracks_is_one_transaction(self, db, service, peak, ids):
        connection = db.connect()
        statements = []
        connection.set_trace_callback(statements.append)
        try:
            service.assign(ids, peak)
        finally:
            connection.set_trace_callback(None)
        # One BEGIN and one COMMIT, however many rows were written.
        assert len([s for s in statements if s.startswith("BEGIN")]) == 1
        assert len([s for s in statements if s.startswith("COMMIT")]) == 1


class TestReading:
    def test_listing_carries_usage_counts(self, service, peak, warmup, ids):
        service.assign(ids[:4], peak)
        counts = {u.tag.name: u.track_count for u in service.list_all()}
        assert counts == {"Peak-time": 4, "Warmup": 0}

    def test_categories_in_use_come_from_the_tags(self, service, peak, warmup):
        service.set_category(peak, "Energy")
        assert service.categories_in_use() == ["Energy"]

    def test_tags_for_tracks_covers_a_window(self, service, peak, warmup, ids):
        service.assign([ids[0]], peak)
        service.assign([ids[0], ids[1]], warmup)
        found = service.tags_for_tracks(ids)
        assert [t.name for t in found[ids[0]]] == ["Peak-time", "Warmup"]
        assert [t.name for t in found[ids[1]]] == ["Warmup"]
        assert ids[2] not in found

    def test_one_track_and_many_tracks_agree(self, service, peak, ids):
        service.assign([ids[0]], peak)
        assert [t.name for t in service.tags_for_track(ids[0])] == [
            t.name for t in service.tags_for_tracks([ids[0]])[ids[0]]
        ]
