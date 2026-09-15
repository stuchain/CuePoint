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
``REVERTABLE_FIELDS`` and they take this path instead. Reverting one takes it
too: CLEAN-06's ``revert_service`` writes the old value back through these same
methods, so a revert validates and records exactly as the edit it undoes did.

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

That boundary joins an outer one when there is one (ORG-07). A batch edit
commits a chunk of a thousand tracks at a time, and a write that insisted on its
own transaction could not be part of one — it would raise inside the batch's,
and each of the thousand would be its own commit if it did not. With no
transaction open, which is every caller outside a batch, nothing changes.

A no-op is not history
----------------------
Re-saving the same note writes nothing. ``record_field_change`` already returns
``None`` when a value did not change, and this service leans on that rather than
comparing again — a history whose entries include "notes: 'x' → 'x'" is a log
nobody reads twice.
"""

from __future__ import annotations

from typing import Dict, Iterable, Mapping, Optional, Tuple

from cuepoint.models.track_metadata import (
    TrackMetadata,
    effective_rating,
    normalize_notes,
    normalize_rating,
)
from cuepoint.persistence.activity_repository import SOURCE_BEATPORT, SOURCE_CUEPOINT
from cuepoint.services.override_values import (
    NOTATION_CLASSIC,
    normalize_override,
    notation_from_counts,
    require_field,
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

#: The override fields (DEC-068), named the way ``cuepoint_rating`` is and for
#: its reason: ``tracks.key`` is Rekordbox's, and a history calling both "key"
#: would be unreadable beside an import that changed the other one.
FIELD_KEY = "cuepoint_key"
FIELD_BPM = "cuepoint_bpm"
FIELD_GENRE = "cuepoint_genre"
FIELD_LABEL = "cuepoint_label"
FIELD_YEAR = "cuepoint_year"

#: Each override column on :class:`TrackMetadata` and the history field it is
#: recorded under. One table, so ``clear`` cannot forget a column it was never
#: told about.
OVERRIDE_HISTORY_FIELDS: Tuple[Tuple[str, str], ...] = (
    ("key", FIELD_KEY),
    ("bpm", FIELD_BPM),
    ("genre", FIELD_GENRE),
    ("label", FIELD_LABEL),
    ("year", FIELD_YEAR),
)

#: Who made the change, as ``track_history.source`` records it. The import
#: writes its own source, so a History tab can tell "you changed this" from
#: "the last refresh changed this" (DEC-008).
SOURCE_USER = "cuepoint"

#: Where an override can come from (DEC-068, DEC-069): a value applied from a
#: Beatport match, or one a user typed. The Inspector reads which from the
#: latest history row for the field, so history is the only record of it.
OVERRIDE_SOURCES = (SOURCE_BEATPORT, SOURCE_CUEPOINT)

_HISTORY_FIELD_FOR = dict(OVERRIDE_HISTORY_FIELDS)


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

        with self._db.transaction(join_existing=True):
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

        with self._db.transaction(join_existing=True):
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

        with self._db.transaction(join_existing=True):
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

    def set_override(
        self,
        track_id: int,
        field: str,
        value: object,
        source: str = SOURCE_USER,
        batch_id: Optional[str] = None,
        notation: Optional[str] = None,
    ) -> TrackMetadata:
        """Set or clear one of the five overrides, recording who supplied it.

        ``None`` clears the override and Rekordbox's value shows through again.
        A value that changes nothing writes nothing: no row, no history.

        Args:
            track_id: The track.
            field: ``key``, ``bpm``, ``genre``, ``label`` or ``year``.
            value: The value, validated by ``override_values``.
            source: ``beatport`` for an applied match, ``cuepoint`` for a hand
                edit. History records it under ``cuepoint_<field>``.
            batch_id: Set when this is one of many writes from one action.
            notation: The key notation to store in, when the caller has already
                asked :meth:`key_notation` — a batch asks once, not per track.

        Raises:
            ValueError: If the track does not exist, the field cannot be
                overridden, the source is not one of the two, or the value is
                not one the field can hold. The message names the field.
        """
        track_id = int(track_id)
        self._require_track(track_id)
        name = require_field(field)
        if source not in OVERRIDE_SOURCES:
            raise ValueError(
                f"An override comes from {' or '.join(OVERRIDE_SOURCES)}, not {source!r}"
            )
        if name == "key":
            wanted = normalize_override(name, value, notation or self.key_notation())
        else:
            wanted = normalize_override(name, value, NOTATION_CLASSIC)

        with self._db.transaction(join_existing=True):
            before = self._metadata.get(track_id)
            previous = getattr(before, name) if before is not None else None
            if previous == wanted:
                return (
                    before if before is not None else TrackMetadata(track_id=track_id)
                )
            record = self._metadata.set_override(track_id, name, wanted)
            self._record(
                track_id, _HISTORY_FIELD_FOR[name], previous, wanted, batch_id, source
            )
        return record

    def set_overrides(
        self,
        track_id: int,
        values: Mapping[str, object],
        source: str = SOURCE_USER,
        batch_id: Optional[str] = None,
    ) -> TrackMetadata:
        """Set or clear several of one track's overrides as one edit (CLEAN-11).

        One transaction for every field named, so a refused value leaves the
        others unwritten too: an Inspector that sent a BPM and a key has not
        half-saved when the key is refused. The library's key notation is asked
        once. Each field records its own history row, as :meth:`set_override`
        does.

        Raises:
            ValueError: If nothing is named, or as :meth:`set_override` for any
                field. Nothing is written.
        """
        if not values:
            raise ValueError("Name at least one field to set")
        names = [require_field(name) for name in values]
        notation = self.key_notation() if "key" in names else None
        record: Optional[TrackMetadata] = None
        with self._db.transaction(join_existing=True):
            for name in names:
                record = self.set_override(
                    track_id,
                    name,
                    values[name],
                    source=source,
                    batch_id=batch_id,
                    notation=notation,
                )
        assert record is not None  # at least one field was named
        return record

    def key_notation(self) -> str:
        """The notation key overrides are stored in: the one the library uses."""
        camelot, other = self._tracks.key_notation_counts()
        return notation_from_counts(camelot, other)

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

        with self._db.transaction(join_existing=True):
            before = self._metadata.get(track_id)
            removed = self._metadata.clear(track_id)
            if before is not None:
                self._record(track_id, FIELD_RATING, before.rating, None, batch_id)
                self._record(
                    track_id, FIELD_FAVORITE, bool(before.favorite), False, batch_id
                )
                self._record(track_id, FIELD_NOTES, before.notes, None, batch_id)
                # One row per override that was set; an unset one is a no-op
                # and ``record_field_change`` writes nothing for it.
                for column, history_field in OVERRIDE_HISTORY_FIELDS:
                    self._record(
                        track_id, history_field, getattr(before, column), None, batch_id
                    )
        return removed

    # --------------------------------------------------------------- helpers

    def _record(
        self,
        track_id: int,
        field: str,
        old_value: object,
        new_value: object,
        batch_id: Optional[str],
        source: str = SOURCE_USER,
    ) -> None:
        """Append one history entry, unless nothing actually changed."""
        self._activity.record_field_change(
            track_id=track_id,
            field_name=field,
            old_value=old_value,
            new_value=new_value,
            source=source,
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
