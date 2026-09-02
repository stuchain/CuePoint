#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Activity service: records what CuePoint did, and lets a field be put back.

Two jobs, per DEC-008 and the activity feed:

- **Record.** A metadata change writes a per-field history entry, so a track's
  History shows what changed, from what, to what, and who did it.
- **Revert.** A single field can be restored to a previous value. The revert is
  itself recorded as a new change; nothing in the log is ever rewritten.

Activity events are user-readable ("Rekordbox refresh — 42 added"). Debug logs
stay in files and are a separate concern.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from cuepoint.models.library_track import LibraryTrack, utc_now_iso
from cuepoint.persistence.activity_repository import (
    SOURCE_CUEPOINT,
    ActivityEvent,
    TrackFieldChange,
)
from cuepoint.services.interfaces import (
    IActivityRepository,
    IActivityService,
    ITrackRepository,
)

# Event types. Strings rather than an enum so adding one needs no migration.
EVENT_FIELD_CHANGED = "track_field_changed"
EVENT_FIELD_REVERTED = "track_field_reverted"

# Fields a user may revert. Identity and bookkeeping columns are excluded:
# reverting rekordbox_track_id or normalized_path would corrupt the identity
# rules a refresh depends on (DEC-002).
REVERTABLE_FIELDS = frozenset(
    {
        "title",
        "artist",
        "remixer",
        "album",
        "label",
        "genre",
        "key",
        "bpm",
        "year",
        "duration_seconds",
    }
)


class ActivityService(IActivityService):
    """Records activity and track field history, and reverts single fields."""

    def __init__(
        self,
        activity_repository: IActivityRepository,
        track_repository: ITrackRepository,
    ) -> None:
        self._activity = activity_repository
        self._tracks = track_repository

    # ---------------------------------------------------------------- record

    def record_event(
        self,
        event_type: str,
        summary: str,
        detail: Optional[Dict[str, Any]] = None,
    ) -> ActivityEvent:
        """Append a user-readable activity event."""
        return self._activity.add_event(
            ActivityEvent(
                type=event_type,
                summary=summary,
                detail=detail or {},
                created_at=utc_now_iso(),
            )
        )

    def record_field_change(
        self,
        track_id: int,
        field_name: str,
        old_value: Any,
        new_value: Any,
        source: str = SOURCE_CUEPOINT,
    ) -> Optional[TrackFieldChange]:
        """Record a change to one track field.

        Returns:
            The recorded change, or ``None`` when the value did not actually
            change — writing "title: Song → Song" would be noise in a log whose
            whole value is being readable.
        """
        if old_value == new_value:
            return None

        return self._activity.add_field_change(
            TrackFieldChange(
                track_id=track_id,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
                source=source,
                changed_at=utc_now_iso(),
            )
        )

    def apply_field_change(
        self,
        track: LibraryTrack,
        field_name: str,
        new_value: Any,
        source: str = SOURCE_CUEPOINT,
    ) -> Optional[TrackFieldChange]:
        """Set a field on a track, persist it, and record the change.

        The write and its history entry belong together; doing them separately
        is how a log drifts out of step with the data it describes.

        Raises:
            ValueError: If the field is not one that may be changed this way.
        """
        if field_name not in REVERTABLE_FIELDS:
            raise ValueError(f"Field is not editable through history: {field_name}")
        if track.id is None:
            raise ValueError("Cannot change a field on a track that has no id")

        old_value = getattr(track, field_name)
        if old_value == new_value:
            return None

        setattr(track, field_name, new_value)
        self._tracks.update(track)
        return self.record_field_change(
            track_id=track.id,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            source=source,
        )

    # ------------------------------------------------------------------ read

    def recent_events(
        self, limit: int = 50, event_type: Optional[str] = None
    ) -> List[ActivityEvent]:
        """Return recent activity, newest first."""
        return self._activity.recent_events(limit=limit, event_type=event_type)

    def event_count(self) -> int:
        """Return how many activity events have been recorded in total.

        Delegated rather than exposed from the repository directly: engine
        handlers call this service, not repositories, and a caller showing one
        page should be able to say how many events exist without a second seam.
        """
        return self._activity.event_count()

    def track_history(
        self, track_id: int, limit: Optional[int] = None
    ) -> List[TrackFieldChange]:
        """Return a track's field history, newest first."""
        return self._activity.history_for_track(track_id, limit=limit)

    # ---------------------------------------------------------------- revert

    def revert_field_change(self, change_id: int) -> TrackFieldChange:
        """Restore the value a field held before a recorded change.

        The restore is appended as a new history entry and a new activity event;
        the original entry is left exactly as it was. A history that can be
        rewritten is not evidence of anything.

        Raises:
            ValueError: If the change is unknown, its track is gone, or the
                field is not revertable.
        """
        change = self._activity.get_field_change(change_id)
        if change is None:
            raise ValueError(f"Unknown field change: {change_id}")
        if change.field_name not in REVERTABLE_FIELDS:
            raise ValueError(f"Field is not revertable: {change.field_name}")

        track = self._tracks.get(change.track_id)
        if track is None:
            raise ValueError(f"Track no longer exists: {change.track_id}")

        current_value = getattr(track, change.field_name)
        setattr(track, change.field_name, change.old_value)
        self._tracks.update(track)

        reverted = self._activity.add_field_change(
            TrackFieldChange(
                track_id=change.track_id,
                field_name=change.field_name,
                old_value=current_value,
                new_value=change.old_value,
                source=SOURCE_CUEPOINT,
                changed_at=utc_now_iso(),
            )
        )
        self.record_event(
            EVENT_FIELD_REVERTED,
            f"Reverted {change.field_name} on {track.artist} - {track.title}",
            {
                "track_id": change.track_id,
                "field": change.field_name,
                "reverted_change_id": change_id,
                "restored_value": change.old_value,
            },
        )
        return reverted
