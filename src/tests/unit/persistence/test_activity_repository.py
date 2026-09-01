#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the activity feed and per-track field history stores."""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.activity_repository import (
    SOURCE_BEATPORT,
    SOURCE_CUEPOINT,
    ActivityEvent,
    ActivityRepository,
    TrackFieldChange,
)
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IActivityRepository
from cuepoint.services.migration_runner import MigrationRunner


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> ActivityRepository:
    return ActivityRepository(db)


@pytest.fixture
def track(db) -> LibraryTrack:
    return TrackRepository(db).add(
        LibraryTrack(
            rekordbox_track_id="1",
            title="Song",
            artist="Artist",
            file_path="/music/a.mp3",
        )
    )


def _change(track_id: int, **kwargs) -> TrackFieldChange:
    return TrackFieldChange(
        track_id=track_id,
        field_name=kwargs.get("field_name", "title"),
        old_value=kwargs.get("old_value", "Old"),
        new_value=kwargs.get("new_value", "New"),
        source=kwargs.get("source", SOURCE_CUEPOINT),
        changed_at=kwargs.get("changed_at", "2026-01-01T00:00:00+00:00"),
    )


@pytest.mark.unit
class TestInterface:
    def test_implements_interface(self):
        assert issubclass(ActivityRepository, IActivityRepository)

    def test_no_unimplemented_abstract_methods(self):
        assert not getattr(ActivityRepository, "__abstractmethods__", frozenset())


@pytest.mark.unit
class TestActivityEvents:
    def test_add_and_read_back(self, repo):
        repo.add_event(
            ActivityEvent(
                type="rekordbox_refresh",
                summary="Rekordbox refresh — 42 added",
                detail={"added": 42},
                created_at="2026-01-01T00:00:00+00:00",
            )
        )
        events = repo.recent_events()
        assert len(events) == 1
        assert events[0].summary == "Rekordbox refresh — 42 added"
        assert events[0].detail["added"] == 42

    def test_add_returns_assigned_id(self, repo):
        stored = repo.add_event(
            ActivityEvent(type="t", summary="s", created_at="2026-01-01T00:00:00+00:00")
        )
        assert stored.id is not None

    def test_newest_first(self, repo):
        for day, summary in ((1, "first"), (3, "third"), (2, "second")):
            repo.add_event(
                ActivityEvent(
                    type="t",
                    summary=summary,
                    created_at=f"2026-01-0{day}T00:00:00+00:00",
                )
            )
        assert [e.summary for e in repo.recent_events()] == [
            "third",
            "second",
            "first",
        ]

    def test_limit_and_type_filter(self, repo):
        for i in range(3):
            repo.add_event(
                ActivityEvent(
                    type="match",
                    summary=f"m{i}",
                    created_at=f"2026-01-0{i + 1}T00:00:00+00:00",
                )
            )
        repo.add_event(
            ActivityEvent(
                type="refresh", summary="r", created_at="2026-01-09T00:00:00+00:00"
            )
        )

        assert len(repo.recent_events(limit=2)) == 2
        assert [e.summary for e in repo.recent_events(event_type="refresh")] == ["r"]
        assert repo.event_count() == 4

    def test_event_without_detail(self, repo):
        repo.add_event(
            ActivityEvent(type="t", summary="s", created_at="2026-01-01T00:00:00+00:00")
        )
        assert repo.recent_events()[0].detail == {}

    def test_empty(self, repo):
        assert repo.recent_events() == []
        assert repo.event_count() == 0


@pytest.mark.unit
class TestTrackHistory:
    def test_add_and_read_back(self, repo, track):
        repo.add_field_change(_change(track.id))
        history = repo.history_for_track(track.id)
        assert len(history) == 1
        assert history[0].field_name == "title"
        assert history[0].old_value == "Old"
        assert history[0].new_value == "New"

    def test_values_keep_their_type(self, repo, track):
        """A reverted number must come back a number, not a string."""
        repo.add_field_change(
            _change(track.id, field_name="bpm", old_value=124.5, new_value=128.0)
        )
        stored = repo.history_for_track(track.id)[0]
        assert stored.old_value == 124.5
        assert isinstance(stored.old_value, float)

    def test_none_values_round_trip(self, repo, track):
        repo.add_field_change(
            _change(track.id, field_name="label", old_value=None, new_value="Label")
        )
        stored = repo.history_for_track(track.id)[0]
        assert stored.old_value is None
        assert stored.new_value == "Label"

    def test_source_is_recorded(self, repo, track):
        repo.add_field_change(_change(track.id, source=SOURCE_BEATPORT))
        assert repo.history_for_track(track.id)[0].source == SOURCE_BEATPORT

    def test_newest_first_and_limit(self, repo, track):
        for day in (1, 3, 2):
            repo.add_field_change(
                _change(
                    track.id,
                    new_value=f"v{day}",
                    changed_at=f"2026-01-0{day}T00:00:00+00:00",
                )
            )
        history = repo.history_for_track(track.id)
        assert [h.new_value for h in history] == ["v3", "v2", "v1"]
        assert len(repo.history_for_track(track.id, limit=2)) == 2

    def test_get_field_change(self, repo, track):
        stored = repo.add_field_change(_change(track.id))
        assert repo.get_field_change(stored.id).field_name == "title"
        assert repo.get_field_change(9999) is None

    def test_history_is_per_track(self, repo, db, track):
        other = TrackRepository(db).add(
            LibraryTrack(
                rekordbox_track_id="2",
                title="Other",
                artist="Artist",
                file_path="/music/b.mp3",
            )
        )
        repo.add_field_change(_change(track.id))
        repo.add_field_change(_change(other.id))

        assert repo.history_count(track.id) == 1
        assert repo.history_count() == 2

    def test_history_is_removed_with_its_track(self, repo, db, track):
        """DEC-003 deletes tracks outright; their history must not be orphaned."""
        repo.add_field_change(_change(track.id))
        assert repo.history_count(track.id) == 1

        TrackRepository(db).delete(track.id)

        assert repo.history_count(track.id) == 0, (
            "history outlived its track; the foreign key cascade is not active"
        )
