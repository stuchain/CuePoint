#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Taking back CuePoint's own changes, one field or one batch (CLEAN-06, DEC-068).

Phase 6 deferred this and said why: ``ActivityService.revert_field_change``
reverts a field by setting it on the imported record, and CuePoint's fields are
not on that record. This is the second path it asked for, and it is a second
path on purpose rather than a wider ``REVERTABLE_FIELDS``.

What it reverts, and through what
---------------------------------
Every history field CuePoint owns maps to the service that writes it, so a
revert is validated, stored and recorded exactly as the edit it undoes was:

====================================  ==========================================
History field                         Written back through
====================================  ==========================================
``cuepoint_rating``                   ``MetadataService.set_rating``
``favorite``                          ``MetadataService.set_favorite``
``notes``                             ``MetadataService.set_notes``
``cuepoint_key`` … ``cuepoint_year``  ``MetadataService.set_override``
``match_state``                       ``MatchStateService.restore_decision``
``tag``                               ``TagService.assign`` / ``unassign``
====================================  ==========================================

Rekordbox's fields are refused here by name, and CuePoint's are refused by
``revert_field_change`` by name: neither path quietly ignores the other's.

A revert is a new change
------------------------
Nothing in history is rewritten (DEC-008). A revert appends a row whose old
value is what the field holds now and whose new value is what the reverted
change replaced — written by the owning service, so it is an ordinary change
in every respect. A single revert also records an activity event whose detail
names the change it reverted as ``revert_of``.

**A restored override keeps its provenance.** The Inspector reads where a value
came from off the latest history row for the field (CLEAN-05). Reverting a
hand edit that replaced a Beatport value puts the Beatport value back, so its
row says ``beatport``: the source is read from the change that set the value
being restored. Clearing an override is a user's act and says ``cuepoint``.

Stale reverts are refused
-------------------------
If a field has changed since the change being reverted, putting back the old
value would silently throw the later change away, which makes revert a second
way to lose data. So the current value is compared with the value the change
wrote, and a difference refuses the revert with both named
(:class:`StaleRevertError`). The user reverts the later change first, or edits
the field directly.

Two fields compare what a person owns rather than every byte:

- **A tag** is present or absent. A tag renamed from ``peaktime`` to
  ``Peaktime`` is still the tag the track carries.
- **A match decision** compares state, attempt and candidate. The dispute flag
  is the rule's, and an automatic state is re-derived by every re-match, so
  neither makes a person's decision stale (DEC-067).

Batches
-------
:meth:`RevertService.revert_batch` reverts every row carrying a batch id, newest
first, so a batch that changed one field twice unwinds in order. It runs under
a **new** batch id, which is what lets the revert itself be reverted, and in the
same committed chunks as ORG-07's batches for the same reasons: a cancel honoured
within a chunk, a failure that costs at most a chunk, and work already reverted
left reverted when a run is cancelled (DEC-063). A stale row is skipped and
counted rather than fatal. One activity event reports the counts.

Collection membership is refused, as the specification decided: membership is
addressed by entry and position (DEC-058), and although an "add" could be undone
by removing what it created, a "remove" cannot put tracks back at positions
later edits have shifted. A revert that is right only sometimes is worse than
saying no. Membership writes no history (ORG-04), so such a batch is recognised
by its activity event.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.models.tag import Tag
from cuepoint.persistence.activity_repository import SOURCE_CUEPOINT, TrackFieldChange
from cuepoint.persistence.id_chunks import chunked
from cuepoint.services.activity_service import (
    CUEPOINT_REVERTABLE_FIELDS,
    EVENT_FIELD_REVERTED,
    REVERTABLE_FIELDS,
)
from cuepoint.services.batch_service import (
    BATCH_CHUNK_SIZE,
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_REMOVE_FROM_COLLECTION,
    BatchCancelCallback,
    BatchProgressCallback,
)
from cuepoint.services.interfaces import (
    IActivityRepository,
    IActivityService,
    IDatabaseService,
    IMatchRepository,
    IMatchStateService,
    IMetadataService,
    IRevertService,
    ITagService,
    ITrackRepository,
)
from cuepoint.services.match_state import FIELD_MATCH_STATE, decision_value, user_part
from cuepoint.services.metadata_service import (
    FIELD_FAVORITE,
    FIELD_NOTES,
    FIELD_RATING,
    OVERRIDE_HISTORY_FIELDS,
    OVERRIDE_SOURCES,
)
from cuepoint.services.tag_service import FIELD_TAG

_logger = logging.getLogger(__name__)

#: The activity event a batch revert records: one per batch, with its counts.
EVENT_BATCH_REVERTED = "library.batch_reverted"

#: What a batch revert calls itself in its result, beside ORG-07's operations.
OPERATION_REVERT_BATCH = "revert_batch"

#: Batch operations a revert refuses, and the reason it gives.
MEMBERSHIP_OPERATIONS = frozenset(
    {OPERATION_ADD_TO_COLLECTION, OPERATION_REMOVE_FROM_COLLECTION}
)
MEMBERSHIP_REFUSAL = (
    "Adding tracks to or removing them from a Collection cannot be reverted."
    " Tracks hold positions in a Collection that later edits move, so putting"
    " them back would be right only sometimes. Add or remove the tracks again"
    " instead"
)

#: Each override's history field and the column it writes.
_OVERRIDE_COLUMN_FOR = {history: column for column, history in OVERRIDE_HISTORY_FIELDS}

#: How each field is named in an activity sentence. A tag names itself.
_FIELD_WORDS = {
    FIELD_RATING: "your rating",
    FIELD_FAVORITE: "the favorite",
    FIELD_NOTES: "the note",
    "cuepoint_key": "your key",
    "cuepoint_bpm": "your BPM",
    "cuepoint_genre": "your genre",
    "cuepoint_label": "your label",
    "cuepoint_year": "your year",
    FIELD_MATCH_STATE: "the Beatport decision",
}

#: The outcome of reverting one row inside a batch.
_REVERTED, _SKIPPED, _UNCHANGED = "reverted", "skipped", "unchanged"


class StaleRevertError(ValueError):
    """A field changed after the change being reverted, so reverting it is refused.

    Attributes:
        change: The change that was asked to be reverted.
        current: What the field holds now.
    """

    def __init__(self, change: TrackFieldChange, current: Any) -> None:
        self.change = change
        self.current = current
        super().__init__(
            f"{_field_words(change).capitalize()} on track {change.track_id} has"
            f" changed since change {change.id}: that change set it to"
            f" {_shown(change, change.new_value)}, and it is now"
            f" {_shown(change, current)}. Revert the later change first, or edit"
            " it directly"
        )


@dataclass(frozen=True)
class FieldRevert:
    """What reverting one change did.

    Attributes:
        change_id: The change that was reverted.
        track_id: Its track.
        field: Its history field.
        previous_value: What the field held before the revert.
        restored_value: What it holds after.
        changed: False when the field already held what the revert would
            write, so nothing was written and nothing recorded.
    """

    change_id: int
    track_id: int
    field: str
    previous_value: Any
    restored_value: Any
    changed: bool


@dataclass(frozen=True)
class BatchRevert:
    """What reverting a batch did, counted in changes rather than tracks.

    ``skipped`` is the rows refused as stale; ``unchanged`` the rows whose field
    already held the value; ``failed`` the rows that could not be written at
    all. The constructor refuses counts that do not add up, as
    :class:`~cuepoint.services.batch_service.BatchResult` does.
    """

    batch_id: str
    reverted_batch_id: str
    total: int
    reverted: int = 0
    skipped: int = 0
    unchanged: int = 0
    failed: int = 0
    cancelled: bool = False

    def __post_init__(self) -> None:
        if self.completed > self.total:
            raise ValueError(
                f"A revert cannot account for {self.completed} of {self.total} changes"
            )
        if not self.cancelled and self.completed != self.total:
            raise ValueError(
                "A revert that was not cancelled accounts for every change in the"
                f" batch: {self.completed} of {self.total}"
            )

    @property
    def completed(self) -> int:
        """How many changes the revert reached, however it went for them."""
        return self.reverted + self.skipped + self.unchanged + self.failed

    def to_dict(self) -> Dict[str, Any]:
        """The counts as a payload.

        ORG-07's batch result, field for field, so anything that reads a batch
        job's answer reads this one — ``changed`` is the changes reverted —
        plus ``skipped`` and ``revert_of``, the batch it reverted.
        """
        return {
            "batch_id": self.batch_id,
            "operation": OPERATION_REVERT_BATCH,
            "target": self.reverted_batch_id,
            "total": self.total,
            "changed": self.reverted,
            "unchanged": self.unchanged,
            "skipped": self.skipped,
            "failed": self.failed,
            "cancelled": self.cancelled,
            "revert_of": self.reverted_batch_id,
        }


class RevertService(IRevertService):
    """Reverts CuePoint-owned changes through the services that made them."""

    def __init__(
        self,
        activity_repository: IActivityRepository,
        activity_service: IActivityService,
        metadata_service: IMetadataService,
        tag_service: ITagService,
        match_state_service: IMatchStateService,
        match_repository: IMatchRepository,
        track_repository: ITrackRepository,
        database_service: IDatabaseService,
    ) -> None:
        """Initialize the service.

        Args:
            activity_repository: Reads the changes to revert. Nothing is written
                through it: every revert row is written by the owning service.
            activity_service: The activity events a revert records.
            metadata_service: Ratings, favorites, notes and overrides.
            tag_service: Tag assignment.
            match_state_service: Match decisions.
            match_repository: Reads a track's current decision.
            track_repository: Names the track in an activity sentence.
            database_service: The transaction a revert and its record share. No
                SQL is run here.
        """
        self._history = activity_repository
        self._activity = activity_service
        self._metadata = metadata_service
        self._tags = tag_service
        self._states = match_state_service
        self._matches = match_repository
        self._tracks = track_repository
        self._db = database_service

    # ------------------------------------------------------------- one change

    def revert_change(self, change_id: int) -> FieldRevert:
        """Revert one recorded change to a CuePoint field.

        The revert and its activity event are one transaction. A revert that
        finds the field already holding the value writes nothing.

        Raises:
            StaleRevertError: If the field changed after this change.
            ValueError: If the change is unknown, its field is Rekordbox's or
                not revertable, or the owning service refuses the value.
        """
        change = self._history.get_field_change(int(change_id))
        if change is None:
            raise ValueError(f"Unknown field change: {change_id}")
        require_cuepoint_field(change.field_name)

        with self._db.transaction(join_existing=True):
            outcome = self._revert(change, None, _Notation(self._metadata))
            if outcome.changed:
                self._activity.record_event(
                    EVENT_FIELD_REVERTED,
                    f"Reverted {_field_words(change)} on {self._track_name(change)}",
                    {
                        "track_id": change.track_id,
                        "field": change.field_name,
                        "revert_of": change.id,
                        "restored_value": outcome.restored_value,
                    },
                )
        return outcome

    # ---------------------------------------------------------------- batches

    def check_batch(self, batch_id: str) -> int:
        """Refuse a batch that cannot be reverted, and count its changes.

        Everything :meth:`revert_batch` refuses before its first write, so the
        engine can refuse a request rather than start a job that fails.

        Raises:
            ValueError: If no batch is named, the batch changed Collection
                membership, recorded nothing, is unknown, or changed a field
                this path cannot write.
        """
        wanted = _batch_name(batch_id)
        events = self._history.batch_events(wanted)
        if any(
            event.detail.get("operation") in MEMBERSHIP_OPERATIONS for event in events
        ):
            raise ValueError(MEMBERSHIP_REFUSAL)

        counts = self._history.batch_field_counts(wanted)
        if not counts:
            if events:
                raise ValueError(
                    f"Batch {wanted} changed nothing, so there is nothing to revert"
                )
            raise ValueError(f"No such batch: {wanted}")
        foreign = sorted(set(counts) - CUEPOINT_REVERTABLE_FIELDS)
        if foreign:
            raise ValueError(
                f"Batch {wanted} changed fields this revert cannot write:"
                f" {', '.join(foreign)}"
            )
        return sum(counts.values())

    def revert_batch(
        self,
        batch_id: str,
        *,
        on_progress: Optional[BatchProgressCallback] = None,
        should_cancel: Optional[BatchCancelCallback] = None,
    ) -> BatchRevert:
        """Revert every change a batch recorded, newest first, as a new batch.

        Args:
            batch_id: The batch to revert.
            on_progress: Called with (completed, total) changes after each
                chunk, and once with (0, total) before the first.
            should_cancel: Asked before each chunk. What was reverted stays
                reverted, and the result says how far it got.

        Raises:
            ValueError: Whatever :meth:`check_batch` refuses, before anything
                is written.
        """
        self.check_batch(batch_id)
        wanted = _batch_name(batch_id)
        change_ids = self._history.batch_change_ids(wanted)
        new_batch = str(uuid.uuid4())
        notation = _Notation(self._metadata)

        total = len(change_ids)
        counts = {_REVERTED: 0, _SKIPPED: 0, _UNCHANGED: 0, "failed": 0}
        cancelled = False
        completed = 0
        _report(on_progress, 0, total)

        for chunk in chunked(change_ids, BATCH_CHUNK_SIZE):
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            for key, value in self._revert_chunk(chunk, new_batch, notation).items():
                counts[key] += value
            completed += len(chunk)
            _report(on_progress, completed, total)

        result = BatchRevert(
            batch_id=new_batch,
            reverted_batch_id=wanted,
            total=total,
            reverted=counts[_REVERTED],
            skipped=counts[_SKIPPED],
            unchanged=counts[_UNCHANGED],
            failed=counts["failed"],
            cancelled=cancelled,
        )
        self._activity.record_event(
            EVENT_BATCH_REVERTED,
            self._summarize(result),
            result.to_dict(),
        )
        return result

    # ---------------------------------------------------------------- helpers

    def _revert_chunk(
        self, change_ids: Sequence[int], batch_id: str, notation: "_Notation"
    ) -> Dict[str, int]:
        """Revert one chunk in one transaction, returning its counts.

        A stale row is an answer, not an error, so it never aborts the chunk.
        Anything else that raises rolls the chunk back, and it is reverted again
        one row per transaction, so one bad row costs one row: in that path a
        row that fails part way is rolled back alone rather than committed half
        written with the rows around it.
        """
        counts = {_REVERTED: 0, _SKIPPED: 0, _UNCHANGED: 0, "failed": 0}
        try:
            with self._db.transaction():
                changes = self._history.get_field_changes(change_ids)
                for change in changes:
                    counts[self._revert_row(change, batch_id, notation)] += 1
            counts["failed"] += len(change_ids) - len(changes)
            return counts
        except (ValueError, sqlite3.Error) as exc:
            _logger.warning(
                "[revert] a chunk of %d changes could not be reverted together"
                " (%s); retrying one change at a time",
                len(change_ids),
                exc,
            )

        counts = {_REVERTED: 0, _SKIPPED: 0, _UNCHANGED: 0, "failed": 0}
        changes = self._history.get_field_changes(change_ids)
        counts["failed"] += len(change_ids) - len(changes)
        for change in changes:
            try:
                with self._db.transaction():
                    outcome = self._revert_row(change, batch_id, notation)
            except (ValueError, sqlite3.Error) as exc:
                _logger.info("[revert] change %s not reverted: %s", change.id, exc)
                counts["failed"] += 1
            else:
                counts[outcome] += 1
        return counts

    def _revert_row(
        self, change: TrackFieldChange, batch_id: str, notation: "_Notation"
    ) -> str:
        """Revert one row of a batch, answering reverted, skipped or unchanged."""
        try:
            outcome = self._revert(change, batch_id, notation)
        except StaleRevertError:
            return _SKIPPED
        return _REVERTED if outcome.changed else _UNCHANGED

    def _revert(
        self,
        change: TrackFieldChange,
        batch_id: Optional[str],
        notation: "_Notation",
    ) -> FieldRevert:
        """Check a change is not stale, write its old value back, and say so.

        Raises:
            StaleRevertError: Before anything is written.
            ValueError: If the field is not CuePoint's, or the owning service
                refuses the value.
        """
        require_cuepoint_field(change.field_name)
        current = self._current(change)
        if _is_stale(change, current):
            raise StaleRevertError(change, current)
        self._restore(change, batch_id, notation)
        after = self._current(change)
        return FieldRevert(
            change_id=int(change.id or 0),
            track_id=change.track_id,
            field=change.field_name,
            previous_value=current,
            restored_value=after,
            changed=after != current,
        )

    def _current(self, change: TrackFieldChange) -> Any:
        """What the change's field holds now, in the shape history records."""
        field = change.field_name
        track_id = change.track_id
        if field == FIELD_MATCH_STATE:
            return decision_value(self._matches.get_match(track_id))
        if field == FIELD_TAG:
            carried = self._carried_tag(change)
            return None if carried is None else carried.name

        record = self._metadata.get(track_id)
        if field == FIELD_FAVORITE:
            return bool(record.favorite) if record is not None else False
        if record is None:
            return None
        if field == FIELD_RATING:
            return record.rating
        if field == FIELD_NOTES:
            return record.notes
        return getattr(record, _OVERRIDE_COLUMN_FOR[field])

    def _restore(
        self, change: TrackFieldChange, batch_id: Optional[str], notation: "_Notation"
    ) -> None:
        """Write the change's old value back through the service that owns it."""
        field = change.field_name
        track_id = change.track_id
        old = change.old_value
        if field == FIELD_RATING:
            self._metadata.set_rating(track_id, old, batch_id)
        elif field == FIELD_FAVORITE:
            self._metadata.set_favorite(track_id, bool(old), batch_id)
        elif field == FIELD_NOTES:
            self._metadata.set_notes(track_id, old, batch_id)
        elif field == FIELD_MATCH_STATE:
            self._states.restore_decision(track_id, old, batch_id)
        elif field == FIELD_TAG:
            self._restore_tag(change, batch_id)
        else:
            column = _OVERRIDE_COLUMN_FOR[field]
            self._metadata.set_override(
                track_id,
                column,
                old,
                source=self._source_of(change),
                batch_id=batch_id,
                notation=notation.get() if column == "key" else None,
            )

    def _restore_tag(self, change: TrackFieldChange, batch_id: Optional[str]) -> None:
        """Take off a tag a change added, or put back one it removed.

        A removed tag that no longer exists — a delete or a merge removed it —
        is created again by name. Its category and colour are the vocabulary's,
        not the track's, and history does not hold them.
        """
        track_ids = (change.track_id,)
        if change.new_value is not None:
            carried = self._carried_tag(change)
            if carried is not None and carried.id is not None:
                self._tags.unassign(track_ids, carried.id, batch_id)
            return
        tag = self._tags.create_or_get(str(change.old_value))
        assert tag.id is not None  # a stored tag has an id
        self._tags.assign(track_ids, tag.id, batch_id)

    def _carried_tag(self, change: TrackFieldChange) -> Optional[Tag]:
        """The tag this change named, if the track carries it now."""
        name = str(
            change.new_value if change.new_value is not None else change.old_value
        )
        wanted = name.casefold()
        for tag in self._tags.tags_for_track(change.track_id):
            if tag.name.casefold() == wanted:
                return tag
        return None

    def _source_of(self, change: TrackFieldChange) -> str:
        """Where the value an override revert restores came from.

        The change that set it says, when it is the one just before this one
        for the same field. Clearing an override, and a value history does not
        explain, are recorded as the user's.
        """
        if change.old_value is None or change.id is None:
            return SOURCE_CUEPOINT
        before = self._history.previous_change(
            change.track_id, change.field_name, change.id
        )
        if (
            before is not None
            and before.new_value == change.old_value
            and before.source in OVERRIDE_SOURCES
        ):
            return before.source
        return SOURCE_CUEPOINT

    def _track_name(self, change: TrackFieldChange) -> str:
        track = self._tracks.get(change.track_id)
        if track is None:
            return f"track {change.track_id}"
        return f"{track.artist} - {track.title}"

    def _summarize(self, result: BatchRevert) -> str:
        """One sentence for the activity feed, naming the batch it reverted."""
        changes = _changes(result.reverted)
        # The event whose batch id is the one reverted: the batch's own, or
        # the event of the revert being reverted, which carries its new id.
        original = [
            event.summary
            for event in self._history.batch_events(result.reverted_batch_id)
        ]
        head = (
            f"Reverted {changes} of “{original[0]}”"
            if original
            else f"Reverted {changes} from a batch"
        )
        notes: List[str] = []
        if result.skipped:
            notes.append(f"{result.skipped} skipped because they changed since")
        if result.unchanged:
            notes.append(f"{result.unchanged} already as they were")
        if result.failed:
            notes.append(f"{result.failed} could not be reverted")
        if result.cancelled:
            notes.append(f"cancelled after {result.completed} of {result.total}")
        return f"{head} — {', '.join(notes)}" if notes else head


# ---------------------------------------------------------------------------
# Small shared pieces
# ---------------------------------------------------------------------------


def require_cuepoint_field(field: str) -> None:
    """Refuse a field this path does not revert, naming whose it is.

    Raises:
        ValueError: For Rekordbox's fields, by name, and for anything else.
    """
    if field in REVERTABLE_FIELDS:
        raise ValueError(
            f"Field is Rekordbox's, not CuePoint's: {field}. It is reverted as an"
            " imported field"
        )
    if field not in CUEPOINT_REVERTABLE_FIELDS:
        raise ValueError(f"Field is not revertable: {field}")


class _Notation:
    """The library's key notation, asked once and only if a key needs it."""

    def __init__(self, metadata: IMetadataService) -> None:
        self._metadata = metadata
        self._value: Optional[str] = None

    def get(self) -> str:
        if self._value is None:
            self._value = self._metadata.key_notation()
        return self._value


def _is_stale(change: TrackFieldChange, current: Any) -> bool:
    """True when the field no longer holds what the change wrote."""
    if change.field_name == FIELD_MATCH_STATE:
        return user_part(current) != user_part(change.new_value)
    if change.field_name == FIELD_TAG:
        return (current is None) != (change.new_value is None)
    return bool(current != change.new_value)


def _batch_name(batch_id: Any) -> str:
    wanted = str(batch_id or "").strip()
    if not wanted:
        raise ValueError("Name the batch to revert")
    return wanted


def _field_words(change: TrackFieldChange) -> str:
    if change.field_name == FIELD_TAG:
        name = change.new_value if change.new_value is not None else change.old_value
        return f"the tag {name!r}"
    return _FIELD_WORDS.get(change.field_name, change.field_name)


def _shown(change: TrackFieldChange, value: Any) -> str:
    """A value as a refusal names it."""
    field = change.field_name
    if field == FIELD_TAG:
        return "on the track" if value is not None else "off the track"
    if field == FIELD_MATCH_STATE:
        part = user_part(value)
        if part is None:
            return "automatic" if value is not None else "not matched"
        state, _, candidate = part
        return f"{state} by you" + (
            "" if candidate is None else f" (candidate {candidate})"
        )
    if field == FIELD_FAVORITE:
        return "favorite" if value else "not favorite"
    return "nothing" if value is None else repr(value)


def _changes(count: int) -> str:
    return f"{count:,} change" if count == 1 else f"{count:,} changes"


def _report(
    callback: Optional[Callable[[int, int], None]], completed: int, total: int
) -> None:
    if callback is not None:
        callback(completed, total)


__all__: Tuple[str, ...] = (
    "EVENT_BATCH_REVERTED",
    "MEMBERSHIP_OPERATIONS",
    "MEMBERSHIP_REFUSAL",
    "OPERATION_REVERT_BATCH",
    "BatchRevert",
    "FieldRevert",
    "RevertService",
    "StaleRevertError",
    "require_cuepoint_field",
)
