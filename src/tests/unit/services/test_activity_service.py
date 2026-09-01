#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for recording activity and reverting track fields (DEC-008)."""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import (
    SOURCE_BEATPORT,
    ActivityRepository,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import (
    EVENT_FIELD_REVERTED,
    ActivityService,
)
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IActivityService
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def tracks(db) -> TrackRepository:
    return TrackRepository(db)


@pytest.fixture
def activity(db) -> ActivityRepository:
    return ActivityRepository(db)


@pytest.fixture
def service(activity, tracks) -> ActivityService:
    return ActivityService(activity_repository=activity, track_repository=tracks)


@pytest.fixture
def track(tracks) -> LibraryTrack:
    return tracks.add(
        LibraryTrack(
            rekordbox_track_id="1",
            title="Original",
            artist="Artist",
            file_path="/music/a.mp3",
            bpm=124.0,
        )
    )


@pytest.mark.unit
class TestInterface:
    def test_implements_interface(self):
        assert issubclass(ActivityService, IActivityService)

    def test_no_unimplemented_abstract_methods(self):
        assert not getattr(ActivityService, "__abstractmethods__", frozenset())


@pytest.mark.unit
class TestRecording:
    def test_record_event(self, service):
        service.record_event("rekordbox_refresh", "42 tracks added", {"added": 42})
        events = service.recent_events()
        assert events[0].summary == "42 tracks added"
        assert events[0].detail["added"] == 42

    def test_record_field_change(self, service, track):
        change = service.record_field_change(track.id, "title", "Old", "New")
        assert change is not None
        assert service.track_history(track.id)[0].new_value == "New"

    def test_unchanged_value_records_nothing(self, service, track):
        """ "title: Song → Song" is noise in a log meant to be read."""
        assert service.record_field_change(track.id, "title", "Same", "Same") is None
        assert service.track_history(track.id) == []


@pytest.mark.unit
class TestApplyFieldChange:
    def test_writes_the_value_and_records_it(self, service, tracks, track):
        change = service.apply_field_change(track, "title", "Updated")

        assert change is not None
        assert tracks.get(track.id).title == "Updated"
        assert service.track_history(track.id)[0].old_value == "Original"

    def test_records_the_source(self, service, track):
        service.apply_field_change(track, "label", "Defected", source=SOURCE_BEATPORT)
        assert service.track_history(track.id)[0].source == SOURCE_BEATPORT

    def test_numeric_field(self, service, tracks, track):
        service.apply_field_change(track, "bpm", 128.0)
        assert tracks.get(track.id).bpm == 128.0
        assert service.track_history(track.id)[0].old_value == 124.0

    def test_no_change_writes_nothing(self, service, track):
        assert service.apply_field_change(track, "title", "Original") is None
        assert service.track_history(track.id) == []

    def test_identity_fields_are_not_editable(self, service, track):
        """Editing identity would corrupt the refresh rules of DEC-002."""
        for protected in ("rekordbox_track_id", "normalized_path", "id"):
            with pytest.raises(ValueError, match="not editable"):
                service.apply_field_change(track, protected, "anything")

    def test_unsaved_track_is_rejected(self, service):
        unsaved = LibraryTrack(
            rekordbox_track_id="99", title="T", artist="A", file_path="/x.mp3"
        )
        with pytest.raises(ValueError, match="no id"):
            service.apply_field_change(unsaved, "title", "New")


@pytest.mark.unit
class TestRevert:
    def test_restores_the_previous_value(self, service, tracks, track):
        change = service.apply_field_change(track, "title", "Changed")
        service.revert_field_change(change.id)
        assert tracks.get(track.id).title == "Original"

    def test_revert_is_appended_not_a_rewrite(self, service, activity, track):
        """A history that can be edited is not evidence of anything."""
        change = service.apply_field_change(track, "title", "Changed")
        service.revert_field_change(change.id)

        assert activity.history_count(track.id) == 2, "revert should append an entry"
        original = activity.get_field_change(change.id)
        assert original is not None, "the original entry was deleted"
        assert original.old_value == "Original"
        assert original.new_value == "Changed", "the original entry was rewritten"

    def test_revert_entry_describes_the_restore(self, service, track):
        change = service.apply_field_change(track, "title", "Changed")
        reverted = service.revert_field_change(change.id)

        assert reverted.old_value == "Changed"
        assert reverted.new_value == "Original"

    def test_revert_logs_an_activity_event(self, service, track):
        change = service.apply_field_change(track, "title", "Changed")
        service.revert_field_change(change.id)

        events = service.recent_events(event_type=EVENT_FIELD_REVERTED)
        assert len(events) == 1
        assert events[0].detail["reverted_change_id"] == change.id

    def test_revert_is_itself_revertable(self, service, tracks, track):
        change = service.apply_field_change(track, "title", "Changed")
        reverted = service.revert_field_change(change.id)

        service.revert_field_change(reverted.id)

        assert tracks.get(track.id).title == "Changed"

    def test_reverting_a_numeric_field_restores_the_number(
        self, service, tracks, track
    ):
        change = service.apply_field_change(track, "bpm", 130.0)
        service.revert_field_change(change.id)

        restored = tracks.get(track.id).bpm
        assert restored == 124.0
        assert isinstance(restored, float)

    def test_unknown_change_is_rejected(self, service):
        with pytest.raises(ValueError, match="Unknown field change"):
            service.revert_field_change(9999)

    def test_revert_after_track_deleted_is_rejected(self, service, tracks, track):
        change = service.apply_field_change(track, "title", "Changed")
        # Read the id before the cascade removes the history row.
        change_id = change.id
        tracks.delete(track.id)

        with pytest.raises(ValueError):
            service.revert_field_change(change_id)
