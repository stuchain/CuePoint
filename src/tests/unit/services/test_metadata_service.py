#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Editing CuePoint's own metadata (ORG-02, DEC-057, DEC-008).

The service layer, where a write becomes a write *and* its history entry. Three
properties carry most of the weight:

**Every change is recorded, and nothing else is.** DEC-008 chose per-field
history instead of an undo stack, which only means something if the writes
record themselves — and only stays readable if a no-op writes nothing. Both
halves are tested, because the second is the one that erodes.

**The effective rating is resolved in one place.** A table and a panel showing
different stars for the same track reads as corruption rather than as a bug, so
the service resolves through the same function every other reader uses, over all
four combinations of the two layers.

**Rekordbox's columns are never written.** Asserted directly: the imported
rating and comment are read back after every kind of edit.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.metadata_service import (
    FIELD_FAVORITE,
    FIELD_NOTES,
    FIELD_RATING,
    SOURCE_USER,
    MetadataService,
)
from cuepoint.services.migration_runner import MigrationRunner


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
            # One with a Rekordbox rating, one without: DEC-057's two layers
            # need both to be interesting.
            LibraryTrack(
                rekordbox_track_id="1",
                file_path="/m/1.mp3",
                title="Rated",
                artist="A",
                rating=3,
                comment="from rekordbox",
            ),
            LibraryTrack(
                rekordbox_track_id="2",
                file_path="/m/2.mp3",
                title="Unrated",
                artist="B",
            ),
        ]
    )
    return repo


@pytest.fixture
def activity(db):
    return ActivityService(ActivityRepository(db), TrackRepository(db))


@pytest.fixture
def service(db, tracks, activity):
    return MetadataService(TrackMetadataRepository(db), tracks, activity)


@pytest.fixture
def rated(db, tracks) -> int:
    """The id of the track Rekordbox rated three stars."""
    return int(tracks.find_by_rekordbox_id("1").id)


@pytest.fixture
def unrated(db, tracks) -> int:
    """The id of the track Rekordbox did not rate."""
    return int(tracks.find_by_rekordbox_id("2").id)


def history(activity, track_id):
    return activity.track_history(track_id)


class TestTheEffectiveRating:
    def test_neither_layer_has_one(self, service, unrated):
        assert service.effective_rating_for(unrated) is None

    def test_only_rekordbox_has_one(self, service, rated):
        assert service.effective_rating_for(rated) == 3

    def test_only_cuepoint_has_one(self, service, unrated):
        service.set_rating(unrated, 5)
        assert service.effective_rating_for(unrated) == 5

    def test_cuepoint_wins_over_rekordbox(self, service, rated):
        service.set_rating(rated, 1)
        assert service.effective_rating_for(rated) == 1

    def test_clearing_falls_back_rather_than_zeroing(self, service, rated):
        service.set_rating(rated, 1)
        service.set_rating(rated, None)
        # The distinction DEC-034 and DEC-047 both turn on.
        assert service.effective_rating_for(rated) == 3

    def test_zero_stars_overrides_rather_than_falls_back(self, service, rated):
        service.set_rating(rated, 0)
        assert service.effective_rating_for(rated) == 0

    def test_a_track_that_is_not_there_is_refused(self, service):
        with pytest.raises(ValueError, match="No such track"):
            service.effective_rating_for(999_999)


class TestRekordboxIsNeverWritten:
    def test_rating_a_track_leaves_the_imported_rating_alone(
        self, service, tracks, rated
    ):
        service.set_rating(rated, 5)
        assert tracks.get(rated).rating == 3

    def test_writing_a_note_leaves_the_imported_comment_alone(
        self, service, tracks, rated
    ):
        service.set_notes(rated, "mine")
        assert tracks.get(rated).comment == "from rekordbox"

    def test_favoriting_changes_nothing_on_the_track_row(self, service, tracks, rated):
        before = tracks.get(rated).to_dict()
        service.set_favorite(rated, True)
        after = tracks.get(rated).to_dict()
        # Including updated_at: the imported record was not touched at all.
        assert after == before


class TestHistory:
    def test_a_rating_is_recorded(self, service, activity, rated):
        service.set_rating(rated, 5)
        entry = history(activity, rated)[0]
        assert entry.field_name == FIELD_RATING
        assert (entry.old_value, entry.new_value) == (None, 5)
        assert entry.source == SOURCE_USER

    def test_a_favorite_is_recorded(self, service, activity, rated):
        service.set_favorite(rated, True)
        entry = history(activity, rated)[0]
        assert entry.field_name == FIELD_FAVORITE
        assert (entry.old_value, entry.new_value) == (False, True)

    def test_a_note_is_recorded(self, service, activity, rated):
        service.set_notes(rated, "late")
        entry = history(activity, rated)[0]
        assert entry.field_name == FIELD_NOTES
        assert (entry.old_value, entry.new_value) == (None, "late")

    def test_the_previous_value_is_recorded_not_just_the_new_one(
        self, service, activity, rated
    ):
        service.set_rating(rated, 2)
        service.set_rating(rated, 4)
        assert (
            history(activity, rated)[0].old_value,
            history(activity, rated)[0].new_value,
        ) == (2, 4)

    def test_a_no_op_writes_no_history(self, service, activity, rated):
        service.set_rating(rated, 4)
        service.set_rating(rated, 4)
        service.set_notes(rated, "x")
        service.set_notes(rated, "x")
        # Two changes happened; two entries exist.
        assert len(history(activity, rated)) == 2

    def test_clearing_an_override_is_itself_history(self, service, activity, rated):
        service.set_rating(rated, 4)
        service.set_rating(rated, None)
        entry = history(activity, rated)[0]
        assert (entry.old_value, entry.new_value) == (4, None)

    def test_clear_records_what_was_lost(self, service, activity, rated):
        service.set_rating(rated, 4)
        service.set_favorite(rated, True)
        service.set_notes(rated, "gone")
        service.clear(rated)

        recorded = {
            (e.field_name, e.old_value, e.new_value) for e in history(activity, rated)
        }
        assert (FIELD_RATING, 4, None) in recorded
        assert (FIELD_FAVORITE, True, False) in recorded
        assert (FIELD_NOTES, "gone", None) in recorded

    def test_clearing_a_track_with_nothing_on_it_writes_no_history(
        self, service, activity, rated
    ):
        assert service.clear(rated) is False
        assert history(activity, rated) == []

    def test_a_batch_id_is_carried_onto_the_entry(self, service, activity, rated):
        # DEC-063 needs this to exist before ORG-07 can group anything by it.
        service.set_rating(rated, 5, batch_id="batch-7")
        assert history(activity, rated)[0].batch_id == "batch-7"

    def test_an_ordinary_edit_is_not_part_of_a_batch(self, service, activity, rated):
        service.set_rating(rated, 5)
        assert history(activity, rated)[0].batch_id is None


class TestHistoryRecordsWhatWasStored:
    """The reason this layer validates as well as the store below it.

    A mutation run found the service's own ``normalize_rating`` call was
    redundant: removing it left every test passing, because the repository
    validates too. It is not redundant — the service writes the history entry,
    and it has to write *the value that was stored*, not the value that was
    typed. A history saying ``"4"`` where the library holds ``4`` is a log that
    disagrees with the data it describes, and a later revert would restore a
    string into an integer column.
    """

    def test_a_rating_from_a_query_string_is_recorded_as_a_number(
        self, service, activity, rated
    ):
        service.set_rating(rated, "4")
        entry = history(activity, rated)[0]
        assert entry.new_value == 4
        assert isinstance(entry.new_value, int)
        assert service.get(rated).rating == 4

    def test_a_trimmed_note_is_recorded_as_trimmed(self, service, activity, rated):
        service.set_notes(rated, "  late  ")
        entry = history(activity, rated)[0]
        assert entry.new_value == "late"
        assert service.get(rated).notes == "late"

    def test_an_emptied_note_is_recorded_as_cleared(self, service, activity, rated):
        service.set_notes(rated, "late")
        service.set_notes(rated, "   ")
        entry = history(activity, rated)[0]
        # "   " means "no note", so the history says the note was removed
        # rather than set to whitespace.
        assert (entry.old_value, entry.new_value) == ("late", None)

    def test_a_no_op_written_untrimmed_is_still_a_no_op(self, service, activity, rated):
        # Without normalizing first, "  late  " would look different from
        # "late" and every re-save would write a history entry.
        service.set_notes(rated, "late")
        service.set_notes(rated, "  late  ")
        assert len(history(activity, rated)) == 1


class TestRefusals:
    @pytest.mark.parametrize("rating", [-1, 6, "four", True])
    def test_a_bad_rating_is_refused_and_nothing_is_written(
        self, service, activity, rated, rating
    ):
        with pytest.raises(ValueError):
            service.set_rating(rated, rating)
        assert service.get(rated) is None
        assert history(activity, rated) == []

    def test_a_note_that_is_too_long_is_refused(self, service, rated):
        with pytest.raises(ValueError, match="10000"):
            service.set_notes(rated, "x" * 10_001)
        assert service.get(rated) is None

    @pytest.mark.parametrize(
        "call",
        [
            lambda s: s.set_rating(999_999, 3),
            lambda s: s.set_favorite(999_999, True),
            lambda s: s.set_notes(999_999, "x"),
            lambda s: s.clear(999_999),
        ],
    )
    def test_a_track_that_is_not_there_is_refused_by_name(self, service, call):
        # A message naming what was asked about, rather than an IntegrityError
        # from two layers down.
        with pytest.raises(ValueError, match="No such track"):
            call(service)


class TestReading:
    def test_get_returns_nothing_for_an_untouched_track(self, service, rated):
        assert service.get(rated) is None

    def test_get_many_covers_a_window(self, service, rated, unrated):
        service.set_favorite(rated, True)
        found = service.get_many([rated, unrated])
        assert list(found) == [rated]
        assert found[rated].favorite is True

    def test_what_was_written_is_what_comes_back(self, service, rated):
        service.set_rating(rated, 2)
        service.set_favorite(rated, True)
        service.set_notes(rated, "  trimmed  ")

        record = service.get(rated)
        assert (record.rating, record.favorite, record.notes) == (2, True, "trimmed")
