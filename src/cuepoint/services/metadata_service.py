#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Editing CuePoint's own track metadata (ORG-02, DEC-057, DEC-008).

The first writable data in CuePoint. Everything before this phase either read
Rekordbox's export or wrote CuePoint's own bookkeeping; a rating set here exists
nowhere else in the world and cannot be re-derived from anything.

Three things this layer owns, and one it deliberately does not
--------------------------------------------------------------
It owns **validation** — a rating is 0–5 or nothing, a note has a length — so a
refusal happens before a write rather than as a database error afterwards. It
owns **history**: every change writes a ``track_history`` row, because DEC-008
chose per-field history over an undo stack and that promise is only worth
something if the writes actually record themselves. And it owns **resolution**,
reading the effective rating through the one function that decides what that
means.

It does not own the Rekordbox layer. Nothing here writes ``tracks.rating`` or
``tracks.comment``, and there is no method that could: those columns belong to
the import, and DEC-057 keeps both values so Phase 8's export can choose between
them rather than finding one of them gone.

Why the write path is not ``apply_field_change``
------------------------------------------------
``ActivityService.apply_field_change`` and ``revert_field_change`` already
write-and-record, and they are not reused here on purpose: both work by setting
an attribute on a ``LibraryTrack`` and calling ``TrackRepository.update``, which
writes every column of the imported record. CuePoint's fields are not on that
record — that is the whole point of DEC-057 — so they are not added to
``REVERTABLE_FIELDS`` and they take this path instead. Reverting one is
therefore not possible yet, and says so rather than half-working; ORG-10 shows
the history and a later phase gives it its own revert.

The write and its record are one transaction
-------------------------------------------
A rating stored with no history entry — because the entry failed after the
value had already committed — is a library that quietly disagrees with its own
log. So each write opens a transaction and both the repository and the history
writer join it. This service runs no SQL of its own; it holds the boundary, the
way ``library_import_service`` does for a refresh, which is why the persistence
boundary test lists it by name.

It arrived a step late. ORG-02 wrote and then recorded, in two transactions;
ORG-03 found the gap while making a twelve-thousand-track tagging atomic, and
closed it here at the same time.

A no-op is not history
----------------------
Re-saving the same note writes nothing. ``record_field_change`` already returns
``None`` when a value did not change, and this service leans on that rather than
comparing again — a history whose entries include "notes: 'x' → 'x'" is a log
nobody reads twice.
"""

from __future__ import annotations

from typing import Dict, Iterable, Optional

from cuepoint.models.track_metadata import (
    TrackMetadata,
    effective_rating,
    normalize_notes,
    normalize_rating,
)
from cuepoint.services.interfaces import (
    IActivityService,
    IDatabaseService,
    IMetadataService,
    ITrackMetadataRepository,
    ITrackRepository,
)

#: History field names. ``cuepoint_rating`` rather than ``rating`` because
#: ``tracks.rating`` is Rekordbox's and a history that called both "rating"
#: would be unreadable exactly where it matters — beside an import that changed
#: the other one.
FIELD_RATING = "cuepoint_rating"
FIELD_FAVORITE = "favorite"
FIELD_NOTES = "notes"

#: Who made the change, as ``track_history.source`` records it. The import
#: writes its own source, so a History tab can tell "you changed this" from
#: "the last refresh changed this" (DEC-008).
SOURCE_USER = "cuepoint"


class MetadataService(IMetadataService):
    """Reads and writes the CuePoint metadata layer, recording every change."""

    def __init__(
        self,
        metadata_repository: ITrackMetadataRepository,
        track_repository: ITrackRepository,
        activity_service: IActivityService,
        database_service: IDatabaseService,
    ) -> None:
        """Wire the layer to its store, the imported record, and the history log.

        Args:
            metadata_repository: Where CuePoint's own values live.
            track_repository: The imported record — read only, to resolve an
                effective rating and to refuse a write against a track that does
                not exist.
            activity_service: Where each change is recorded (DEC-008).
            database_service: Used only to open the transaction a write and its
                history entry share. No SQL is run here.
        """
        self._metadata = metadata_repository
        self._tracks = track_repository
        self._activity = activity_service
        self._db = database_service

    # ------------------------------------------------------------------ read

    def get(self, track_id: int) -> Optional[TrackMetadata]:
        """Return one track's CuePoint metadata, or ``None`` if it has none."""
        return self._metadata.get(int(track_id))

    def get_many(self, track_ids: Iterable[int]) -> Dict[int, TrackMetadata]:
        """Return metadata for the tracks that have any, keyed by track id.

        Tracks with nothing recorded are absent rather than present and empty,
        which is what a window of rows wants: the absence *is* the answer.
        """
        return self._metadata.get_many(track_ids)

    def effective_rating_for(self, track_id: int) -> Optional[int]:
        """Return the rating to show for a track, resolving DEC-057's layers.

        Raises:
            ValueError: If the track does not exist. A rating for a track that
                is not there is not a question with a null answer.
        """
        track = self._require_track(int(track_id))
        record = self._metadata.get(int(track_id))
        return effective_rating(track.rating, record.rating if record else None)

    # ----------------------------------------------------------------- write

    def set_rating(
        self, track_id: int, rating: Optional[int], batch_id: Optional[str] = None
    ) -> TrackMetadata:
        """Set or clear the CuePoint rating, recording the change.

        ``None`` clears the override and the effective rating falls back to
        Rekordbox's; ``0`` is a rating of zero stars that does not. They are
        different requests and they are stored differently.

        Raises:
            ValueError: If the rating is not 0–5 or ``None``, or the track does
                not exist.
        """
        track_id = int(track_id)
        self._require_track(track_id)
        wanted = normalize_rating(rating)

        with self._db.transaction():
            before = self._metadata.get(track_id)
            record = self._metadata.set_rating(track_id, wanted)
            self._record(
                track_id,
                FIELD_RATING,
                before.rating if before else None,
                wanted,
                batch_id,
            )
        return record

    def set_favorite(
        self, track_id: int, favorite: bool, batch_id: Optional[str] = None
    ) -> TrackMetadata:
        """Set the favorite flag, recording the change.

        Raises:
            ValueError: If the track does not exist.
        """
        track_id = int(track_id)
        self._require_track(track_id)
        wanted = bool(favorite)

        with self._db.transaction():
            before = self._metadata.get(track_id)
            record = self._metadata.set_favorite(track_id, wanted)
            self._record(
                track_id,
                FIELD_FAVORITE,
                bool(before.favorite) if before else False,
                wanted,
                batch_id,
            )
        return record

    def set_notes(
        self, track_id: int, notes: Optional[str], batch_id: Optional[str] = None
    ) -> TrackMetadata:
        """Set or clear the note, recording the change.

        Raises:
            ValueError: If the note is too long, or the track does not exist.
        """
        track_id = int(track_id)
        self._require_track(track_id)
        wanted = normalize_notes(notes)

        with self._db.transaction():
            before = self._metadata.get(track_id)
            record = self._metadata.set_notes(track_id, wanted)
            self._record(
                track_id,
                FIELD_NOTES,
                before.notes if before else None,
                wanted,
                batch_id,
            )
        return record

    def clear(self, track_id: int, batch_id: Optional[str] = None) -> bool:
        """Forget everything CuePoint knows about a track.

        Each value that was actually set is recorded as its own change, so the
        history says what was lost rather than that something was. A track with
        nothing recorded is a no-op and writes no history.

        Raises:
            ValueError: If the track does not exist.

        Returns:
            True when there was something to forget.
        """
        track_id = int(track_id)
        self._require_track(track_id)

        with self._db.transaction():
            before = self._metadata.get(track_id)
            removed = self._metadata.clear(track_id)
            if before is not None:
                self._record(track_id, FIELD_RATING, before.rating, None, batch_id)
                self._record(
                    track_id, FIELD_FAVORITE, bool(before.favorite), False, batch_id
                )
                self._record(track_id, FIELD_NOTES, before.notes, None, batch_id)
        return removed

    # --------------------------------------------------------------- helpers

    def _record(
        self,
        track_id: int,
        field: str,
        old_value: object,
        new_value: object,
        batch_id: Optional[str],
    ) -> None:
        """Append one history entry, unless nothing actually changed."""
        self._activity.record_field_change(
            track_id=track_id,
            field_name=field,
            old_value=old_value,
            new_value=new_value,
            source=SOURCE_USER,
            batch_id=batch_id,
        )

    def _require_track(self, track_id: int):
        """Return the imported record, or refuse the write.

        The foreign key would refuse it anyway, as an ``IntegrityError`` from
        two layers down. This turns that into a message naming what was asked
        about, and it is what stops a batch from writing metadata against ids a
        refresh deleted while it was running (DEC-063).
        """
        track = self._tracks.get(track_id)
        if track is None:
            raise ValueError(f"No such track: {track_id}")
        return track
