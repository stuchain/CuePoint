#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One operation over a selection that may be the whole library (ORG-07).

DEC-045 made a selection a *description* — the current query, possibly 47,913
rows — precisely so this phase could tag all of them. DEC-063 says what happens
next: below a threshold the operation applies inline, above it the same work
runs as a cancellable job, and either way every changed field writes its own
``track_history`` row under one shared batch id.

The selection is resolved once
-----------------------------
:meth:`BatchService.resolve` turns a selection into an id set at the start and
nothing re-reads it afterwards. A job that re-evaluated its query would report a
count that drifted underneath it: tag every track matching "no genre", and the
tracks stop matching as the tag lands. The id set is the batch's target, and the
count it reports is the size of that target.

Chunked transactions, and why they are not a nicety
---------------------------------------------------
ORG-02 measured the difference: a metadata write through the ordinary path costs
1.95 ms per track because each write is its own commit, and 0.014 ms inside an
open transaction — **144×**, or a hundred seconds against under a second for a
47,913-track batch. Every write service opens its transaction with
``join_existing=True``, so a batch opens one per chunk and the existing calls do
the rest. One transaction for the whole batch would be faster still and is the
wrong shape: a cancel could then only be honoured by throwing away everything
already applied, and 47,913 rows would sit in one journal.

What a chunk buys, therefore, is a cancel that is honoured within one chunk and
a failure that costs at most one chunk. What it costs is stated rather than
hidden: **a cancelled batch leaves applied work applied** (DEC-063), and the
activity event records how far it got.

A chunk is applied set-shaped, and retried one track at a time
--------------------------------------------------------------
Tagging five hundred tracks is one INSERT, not five hundred; asking a Collection
to take five hundred tracks reads its membership once rather than five hundred
times. But a set-shaped call cannot say *which* track a foreign-key violation
came from, and a track deleted while the batch runs must cost one failure rather
than five hundred. So a chunk that raises is rolled back and re-applied one
track at a time, which is the only path where the counts and the cost differ
from the fast one — and it is the path a deleted track takes.

What is recorded
----------------
One activity event per batch, carrying the operation and the counts (DEC-029) —
not one per track. The per-track detail is the history rows, which is where a
user looks for it, and every one of them carries the batch id that makes "revert
this batch" buildable later without an undo stack (DEC-008, DEC-063).

Collection membership is the exception, and deliberately so: it is not a field
of a track. ORG-04 records membership as an entry row with its own identity
(DEC-058) and writes no history for it, by any path — a drag, a menu, or this.
Writing history here alone would mean the same user action was recorded when it
came from the toolbar and not when it came from a drag, which is worse than the
gap. If membership belongs in the History tab, it belongs in
:class:`~cuepoint.services.collection_service.CollectionService`, where both
paths would get it.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, replace
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from cuepoint.models.track_metadata import normalize_rating
from cuepoint.persistence.id_chunks import chunked, unique_ids
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services.interfaces import (
    IActivityService,
    IBatchService,
    ICollectionService,
    IDatabaseService,
    IMetadataService,
    ITagService,
    ITrackRepository,
)

_logger = logging.getLogger(__name__)

#: The six things a batch can do. One vocabulary, so ORG-11's context menu and
#: its selection toolbar do not each invent their own verbs.
OPERATION_SET_RATING = "set_rating"
OPERATION_SET_FAVORITE = "set_favorite"
OPERATION_ADD_TAG = "add_tag"
OPERATION_REMOVE_TAG = "remove_tag"
OPERATION_ADD_TO_COLLECTION = "add_to_collection"
OPERATION_REMOVE_FROM_COLLECTION = "remove_from_collection"

BATCH_OPERATIONS: Tuple[str, ...] = (
    OPERATION_SET_RATING,
    OPERATION_SET_FAVORITE,
    OPERATION_ADD_TAG,
    OPERATION_REMOVE_TAG,
    OPERATION_ADD_TO_COLLECTION,
    OPERATION_REMOVE_FROM_COLLECTION,
)

#: The activity event a batch records (DEC-029, DEC-063). One per batch,
#: carrying the counts; the per-track detail lives in ``track_history``.
EVENT_BATCH_APPLIED = "library.batch"

#: Above this many tracks the operation runs as a background job rather than
#: inline (DEC-063). A named constant this step fixes, not a setting: it is a
#: statement about how long a request may block, and it is measured rather than
#: guessed. At 50,000 tracks the most expensive operation — a rating, which is
#: four statements a track — settles at **62 microseconds a track**, so a
#: thousand of them is **61 ms**: about as long as a click may take before it
#: needs a progress bar instead of a result.
BATCH_JOB_THRESHOLD = 1_000

#: Tracks per committed transaction. This number is the cancel latency and the
#: size of one journal, and it is not a speed dial: over 10,000 tracks the same
#: work takes 882 ms in chunks of 100, 561 ms in 500, 546 ms in 1,000, 524 ms in
#: 2,000 and 521 ms in 5,000. Everything past 500 is within a few per cent of
#: everything else, so the size is chosen for the cancel — measured at **41 ms**
#: between ticks while tagging 50,000 tracks — rather than for the clock.
BATCH_CHUNK_SIZE = 1_000

#: Ids per query while a selection is resolved. Paging is not an optimization:
#: ``browse_ids`` caps one request at 50,000, so an unpaged read would silently
#: batch the first page of a larger library and report it as the whole answer.
SELECTION_PAGE_SIZE = 10_000


@dataclass(frozen=True)
class BatchSelection:
    """The tracks a batch applies to: ids, or the query that names them.

    Exactly one of the two is set, and the constructor refuses anything else.
    Both would leave two answers to "what is this batch about" with nothing
    saying which wins; neither would leave a batch with no target that still
    reads as a valid request.

    A selection of 47,913 tracks never crosses the wire as 47,913 numbers
    (DEC-045); it crosses as :attr:`query` and is resolved here, once.
    """

    track_ids: Optional[Sequence[int]] = None
    query: Optional[BrowseQuery] = None

    def __post_init__(self) -> None:
        if (self.track_ids is None) == (self.query is None):
            raise ValueError(
                "A selection is either tracks or a query, never both and never neither"
            )

    @classmethod
    def of_ids(cls, track_ids: Sequence[int]) -> "BatchSelection":
        """The tracks a user actually has in front of them."""
        return cls(track_ids=list(track_ids))

    @classmethod
    def matching(cls, query: BrowseQuery) -> "BatchSelection":
        """Everything matching a query, however many that turns out to be."""
        return cls(query=query)


@dataclass(frozen=True)
class BatchOperation:
    """What to do to each track: one verb and its value.

    :meth:`validated` normalizes the value into the form it will be stored in,
    using the same functions the single-track path uses, so a batch and an
    Inspector edit cannot disagree about what ``"4"`` means.
    """

    kind: str
    value: Any = None

    def validated(self) -> "BatchOperation":
        """Return a normalized copy, or raise.

        Raises:
            ValueError: If the verb is not one of :data:`BATCH_OPERATIONS`, or
                its value is not something that verb can be given.
        """
        kind = (self.kind or "").strip()
        if kind not in BATCH_OPERATIONS:
            known = ", ".join(BATCH_OPERATIONS)
            raise ValueError(
                f"Unknown batch operation {self.kind!r}. Known operations: {known}"
            )

        if kind == OPERATION_SET_RATING:
            return replace(self, kind=kind, value=normalize_rating(self.value))
        if kind == OPERATION_SET_FAVORITE:
            if not isinstance(self.value, bool):
                # Not coerced: ``bool("false")`` is True, and a batch that
                # favorited 47,913 tracks because the word arrived as text is
                # not a mistake worth being lenient about.
                raise ValueError(f"Favorite must be true or false, not {self.value!r}")
            return replace(self, kind=kind, value=self.value)
        return replace(self, kind=kind, value=_as_id(self.value, kind))


@dataclass(frozen=True)
class BatchResult:
    """What a batch did, in the numbers a user is owed.

    ``changed`` and ``unchanged`` are separate because they are different
    sentences: "tagged 40 tracks (12 already had it)" is true and "tagged 52
    tracks" is not. ``failed`` is the tracks that could not be touched at all —
    a track deleted while the batch ran — which is counted and reported rather
    than fatal.

    The constructor refuses a result whose parts do not add up. A batch that ran
    to the end accounts for every track it resolved; only a cancelled one stops
    short, and then it says so.
    """

    batch_id: str
    operation: str
    target: str
    total: int
    changed: int = 0
    unchanged: int = 0
    failed: int = 0
    cancelled: bool = False

    def __post_init__(self) -> None:
        if self.completed > self.total:
            raise ValueError(
                f"A batch cannot account for {self.completed} of {self.total} tracks"
            )
        if not self.cancelled and self.completed != self.total:
            raise ValueError(
                f"A batch that was not cancelled accounts for every track it "
                f"resolved: {self.completed} of {self.total}"
            )

    @property
    def completed(self) -> int:
        """How many tracks the batch reached, however it went for them."""
        return self.changed + self.unchanged + self.failed

    def to_dict(self) -> Dict[str, Any]:
        """The counts as a payload, for a job result and ORG-08's response."""
        return {
            "batch_id": self.batch_id,
            "operation": self.operation,
            "target": self.target,
            "total": self.total,
            "changed": self.changed,
            "unchanged": self.unchanged,
            "failed": self.failed,
            "cancelled": self.cancelled,
        }


#: Called with (completed, total) as a batch works through its chunks.
BatchProgressCallback = Callable[[int, int], None]

#: Asked between chunks. Returning True stops the batch where it is.
BatchCancelCallback = Callable[[], bool]


class BatchService(IBatchService):
    """Applies one operation to a selection of any size (ORG-07, DEC-063).

    Owns no rules of its own about ratings, tags or Collections: each operation
    is delegated to the service that owns it, so a batch and a single-track edit
    validate identically and record identically. What lives here is the part
    neither of them has — resolving a selection once, moving through it in
    committed chunks, honouring a cancel, counting what happened, and saying so
    once in the activity feed.
    """

    def __init__(
        self,
        metadata_service: IMetadataService,
        tag_service: ITagService,
        collection_service: ICollectionService,
        track_repository: ITrackRepository,
        activity_service: IActivityService,
        database_service: IDatabaseService,
    ) -> None:
        """Initialize the service.

        Args:
            metadata_service: Ratings and favorites, with their history.
            tag_service: Tag assignment, with its history.
            collection_service: Collection membership.
            track_repository: Resolves a query selection to ids, through the
                same projection the table itself pages (DEC-045).
            activity_service: Where the one event per batch is recorded.
            database_service: Used only to open the transaction a chunk shares.
                No SQL is run here.
        """
        self._metadata = metadata_service
        self._tags = tag_service
        self._collections = collection_service
        self._tracks = track_repository
        self._activity = activity_service
        self._db = database_service

    def resolve(self, selection: BatchSelection) -> List[int]:
        """Turn a selection into the ids it names, once.

        Ids are deduplicated: the same track named twice is one track, and
        counting it twice would report a number no user could reconcile with
        what they selected.

        Raises:
            ValueError: If the selection names no tracks at all. A batch over
                nothing is a request that cannot be honoured, not a batch that
                did nothing — and refusing it here means a job is never started
                for work that does not exist.
            BrowseQueryError: If the query cannot be built.
        """
        if selection.track_ids is not None:
            found = unique_ids(selection.track_ids)
        else:
            query = selection.query
            assert query is not None  # guaranteed by BatchSelection
            found = self._matching_ids(query.validated())

        if not found:
            raise ValueError(
                "That selection names no tracks, so there is nothing to apply "
                "the change to"
            )
        return found

    def check(self, operation: BatchOperation) -> str:
        """Refuse an operation that cannot be applied, and name what it targets.

        Everything :meth:`apply_batch` would refuse before its first write, in
        the one place a caller can ask about it without applying anything: the
        verb, its value, and whether the tag or Collection it names is still
        there. The engine asks before it decides whether to start a job, so a
        request that cannot be honoured comes back as a refusal rather than as
        a job that starts and fails.

        Raises:
            ValueError: If the operation is unknown, its value is wrong for it,
                or its target does not exist.

        Returns:
            The name of what it applies — a tag's name, a Collection's name, or
            the value itself for a rating or a favorite.
        """
        return self._applier_for(operation.validated()).target()

    def apply_batch(
        self,
        selection: BatchSelection,
        operation: BatchOperation,
        *,
        on_progress: Optional[BatchProgressCallback] = None,
        should_cancel: Optional[BatchCancelCallback] = None,
    ) -> BatchResult:
        """Apply one operation to every track a selection names.

        Args:
            selection: Ids, or the query that names them.
            operation: The verb and its value.
            on_progress: Called with (completed, total) after each chunk, and
                once with (0, total) before the first.
            should_cancel: Asked before each chunk. Work already applied stays
                applied (DEC-063), and the result says how far it got.

        Raises:
            ValueError: If the operation is not one this service knows, its
                value is wrong for it, its target does not exist, or the
                selection names no tracks. Every one of those is refused before
                anything is written.

        Returns:
            What happened, in counts.
        """
        wanted = operation.validated()
        track_ids = self.resolve(selection)
        applier = self._applier_for(wanted)
        # Before the first write, and outside every transaction: a tag or a
        # Collection that is not there refuses the batch by name once, rather
        # than failing 47,913 times and reporting that as the answer.
        target = applier.target()
        applier.begin()

        batch_id = str(uuid.uuid4())
        total = len(track_ids)
        changed = unchanged = failed = 0
        cancelled = False
        completed = 0
        _report(on_progress, 0, total)

        for chunk in chunked(track_ids, BATCH_CHUNK_SIZE):
            if should_cancel is not None and should_cancel():
                cancelled = True
                break
            chunk_changed, chunk_unchanged, chunk_failed = self._apply_chunk(
                applier, chunk, batch_id
            )
            changed += chunk_changed
            unchanged += chunk_unchanged
            failed += chunk_failed
            completed += len(chunk)
            _report(on_progress, completed, total)

        result = BatchResult(
            batch_id=batch_id,
            operation=wanted.kind,
            target=target,
            total=total,
            changed=changed,
            unchanged=unchanged,
            failed=failed,
            cancelled=cancelled,
        )
        self._record(result, applier)
        return result

    # --------------------------------------------------------------- helpers

    def _apply_chunk(
        self, applier: "_Applier", chunk: Sequence[int], batch_id: str
    ) -> Tuple[int, int, int]:
        """Apply one chunk in one transaction, returning its three counts.

        The fast path is one set-shaped call. When it raises — a track deleted
        while the batch ran is the case that matters — the chunk has rolled
        back and written nothing, so it is re-applied one track at a time to
        find out which one it was. That costs the chunk twice, on the only path
        where the alternative is five hundred tracks reported as failures
        because one of them was.
        """
        try:
            with self._db.transaction():
                applied = applier.apply(chunk, batch_id)
            return applied, len(chunk) - applied, 0
        except (ValueError, sqlite3.Error) as exc:
            _logger.warning(
                "[batch] %s: a chunk of %d could not be applied together (%s); "
                "retrying one track at a time",
                applier.operation,
                len(chunk),
                exc,
            )

        changed = unchanged = failed = 0
        with self._db.transaction():
            for track_id in chunk:
                try:
                    applied = applier.apply((track_id,), batch_id)
                except (ValueError, sqlite3.Error) as exc:
                    _logger.info("[batch] track %s skipped: %s", track_id, exc)
                    failed += 1
                else:
                    changed += applied
                    unchanged += 1 - applied
        return changed, unchanged, failed

    def _matching_ids(self, query: BrowseQuery) -> List[int]:
        """Read every id a query matches, a page at a time."""
        found: List[int] = []
        while True:
            page = self._tracks.browse_ids(
                query, limit=SELECTION_PAGE_SIZE, offset=len(found)
            )
            found.extend(page)
            if len(page) < SELECTION_PAGE_SIZE:
                return found

    def _applier_for(self, operation: BatchOperation) -> "_Applier":
        """Return the thing that knows how to do this operation."""
        if operation.kind == OPERATION_SET_RATING:
            return _SetRating(self._metadata, operation.value)
        if operation.kind == OPERATION_SET_FAVORITE:
            return _SetFavorite(self._metadata, operation.value)
        if operation.kind == OPERATION_ADD_TAG:
            return _Tagging(self._tags, operation.value, adding=True)
        if operation.kind == OPERATION_REMOVE_TAG:
            return _Tagging(self._tags, operation.value, adding=False)
        if operation.kind == OPERATION_ADD_TO_COLLECTION:
            return _AddToCollection(self._collections, operation.value)
        # The last one rather than an else-raise: ``validated`` has already
        # refused everything that is not in the vocabulary, and a branch no
        # test can reach is a branch that is not there.
        return _RemoveFromCollection(self._collections, operation.value)

    def _record(self, result: BatchResult, applier: "_Applier") -> None:
        """Record the one event a batch writes (DEC-029, DEC-063).

        Written after the chunks rather than inside one, because it describes
        all of them — including a cancelled run, where saying how far it got is
        the whole point.
        """
        self._activity.record_event(
            EVENT_BATCH_APPLIED,
            _summarize(applier.describe(result), result),
            result.to_dict(),
        )


# ---------------------------------------------------------------------------
# The six operations
# ---------------------------------------------------------------------------


class _Applier(ABC):
    """One verb, applied to a set of tracks at a time.

    Each delegates to the service that owns the rule it is applying. None of
    them opens a transaction: :class:`BatchService` opens one per chunk and
    every service call joins it, which is what makes a chunk one commit.
    """

    #: The vocabulary word this applier is, for logs and the event.
    operation: str

    @abstractmethod
    def target(self) -> str:
        """Check what this applies to exists, and return its name.

        Cheap, and separate from :meth:`begin` on purpose: it is what decides
        whether an operation can be honoured at all, and the engine asks it
        before it decides whether to start a job — so a tag deleted a moment
        ago is a refusal rather than a job that fails.

        Raises:
            ValueError: If the tag or Collection is not there, or cannot hold
                what is being asked of it.
        """

    def begin(self) -> None:
        """Read whatever the operation needs before its first chunk.

        Nothing, for most of them. Overridden where the operation needs a
        snapshot of something, which is then taken once — like the id set, and
        for the same reason.
        """

    @abstractmethod
    def apply(self, track_ids: Sequence[int], batch_id: str) -> int:
        """Apply to these tracks, returning how many actually changed."""

    @abstractmethod
    def describe(self, result: BatchResult) -> str:
        """Say what this did, in a sentence an activity feed can show."""


class _SetRating(_Applier):
    """Set or clear CuePoint's rating (DEC-034, DEC-057)."""

    operation = OPERATION_SET_RATING

    def __init__(self, metadata: IMetadataService, rating: Optional[int]) -> None:
        self._metadata = metadata
        self._rating = rating

    def target(self) -> str:
        return "no rating" if self._rating is None else f"{self._rating}"

    def apply(self, track_ids: Sequence[int], batch_id: str) -> int:
        # One read for the whole chunk rather than one per track: the stored
        # value is what decides whether this is a change, and it is the same
        # value ``record_field_change`` compares against.
        before = self._metadata.get_many(track_ids)
        changed = 0
        for track_id in track_ids:
            record = before.get(int(track_id))
            self._metadata.set_rating(int(track_id), self._rating, batch_id)
            if (record.rating if record else None) != self._rating:
                changed += 1
        return changed

    def describe(self, result: BatchResult) -> str:
        tracks = _tracks(result.changed)
        if self._rating is None:
            return f"Cleared the rating on {tracks}"
        stars = "star" if self._rating == 1 else "stars"
        return f"Rated {tracks} {self._rating} {stars}"


class _SetFavorite(_Applier):
    """Set or clear the favorite flag."""

    operation = OPERATION_SET_FAVORITE

    def __init__(self, metadata: IMetadataService, favorite: bool) -> None:
        self._metadata = metadata
        self._favorite = favorite

    def target(self) -> str:
        return "favorite" if self._favorite else "not favorite"

    def apply(self, track_ids: Sequence[int], batch_id: str) -> int:
        before = self._metadata.get_many(track_ids)
        changed = 0
        for track_id in track_ids:
            record = before.get(int(track_id))
            self._metadata.set_favorite(int(track_id), self._favorite, batch_id)
            if bool(record.favorite if record else False) != self._favorite:
                changed += 1
        return changed

    def describe(self, result: BatchResult) -> str:
        tracks = _tracks(result.changed)
        return f"Favorited {tracks}" if self._favorite else f"Unfavorited {tracks}"


class _Tagging(_Applier):
    """Put a tag on tracks, or take it off (ORG-03).

    One class for both directions: they are the same operation with the same
    target, the same idempotence and the same history entry inverted, and two
    classes would be the same code twice.
    """

    def __init__(self, tags: ITagService, tag_id: int, *, adding: bool) -> None:
        self._tags = tags
        self._tag_id = tag_id
        self._adding = adding
        self.operation = OPERATION_ADD_TAG if adding else OPERATION_REMOVE_TAG

    def target(self) -> str:
        # The vocabulary read, rather than a lookup of our own: it answers both
        # questions at once — whether the tag is there, and what it is called,
        # which the event has to say.
        for usage in self._tags.list_all():
            if usage.tag.id == self._tag_id:
                return usage.tag.name
        raise ValueError(f"No such tag: {self._tag_id}")

    def apply(self, track_ids: Sequence[int], batch_id: str) -> int:
        if self._adding:
            return len(self._tags.assign(track_ids, self._tag_id, batch_id))
        return len(self._tags.unassign(track_ids, self._tag_id, batch_id))

    def describe(self, result: BatchResult) -> str:
        tracks = _tracks(result.changed)
        if self._adding:
            return f"Tagged {tracks} as {result.target!r}"
        return f"Removed {result.target!r} from {tracks}"


class _AddToCollection(_Applier):
    """Append tracks to a Collection, skipping the ones already there."""

    operation = OPERATION_ADD_TO_COLLECTION

    def __init__(self, collections: ICollectionService, collection_id: int) -> None:
        self._collections = collections
        self._collection_id = collection_id

    def target(self) -> str:
        return _require_collection_named(self._collections, self._collection_id)

    def apply(self, track_ids: Sequence[int], batch_id: str) -> int:
        # No batch id: membership is an entry row rather than a field of a
        # track, and ORG-04 writes no history for it by any path.
        return self._collections.add_tracks(self._collection_id, track_ids).added

    def describe(self, result: BatchResult) -> str:
        return f"Added {_tracks(result.changed)} to {result.target!r}"


class _RemoveFromCollection(_Applier):
    """Take tracks out of a Collection, entries and all (DEC-058).

    A track a user put in a Collection twice has two entries, and "remove it"
    means both: the alternative is a removal that leaves the track visibly
    still there.
    """

    operation = OPERATION_REMOVE_FROM_COLLECTION

    def __init__(self, collections: ICollectionService, collection_id: int) -> None:
        self._collections = collections
        self._collection_id = collection_id
        self._entries: Dict[int, List[int]] = {}

    def target(self) -> str:
        return _require_collection_named(self._collections, self._collection_id)

    def begin(self) -> None:
        # Membership is read once, like the selection itself, and for the same
        # reason: what the batch is about is decided at the start.
        for entry in self._collections.entries(self._collection_id):
            if entry.id is not None:
                self._entries.setdefault(int(entry.track_id), []).append(int(entry.id))

    def apply(self, track_ids: Sequence[int], batch_id: str) -> int:
        holding = [
            int(track_id) for track_id in track_ids if self._entries.get(int(track_id))
        ]
        entry_ids = [
            entry_id for track_id in holding for entry_id in self._entries[track_id]
        ]
        if not entry_ids:
            return 0
        self._collections.remove_entries(entry_ids)
        return len(holding)

    def describe(self, result: BatchResult) -> str:
        return f"Removed {_tracks(result.changed)} from {result.target!r}"


# ---------------------------------------------------------------------------
# Small shared pieces
# ---------------------------------------------------------------------------


def _require_collection_named(
    collections: ICollectionService, collection_id: int
) -> str:
    """Return a Collection's name, refusing anything that cannot hold tracks.

    The refusal is the tree service's own: adding *no* tracks validates the node
    and writes nothing, so which kinds hold tracks stays one rule in one place
    (ORG-04, DEC-061) rather than a second copy that could drift from it.
    """
    node = collections.get(int(collection_id))
    if node is None:
        raise ValueError(f"No such collection: {collection_id}")
    collections.add_tracks(int(collection_id), ())
    return node.name


def _as_id(value: Any, kind: str) -> int:
    """Read an identifier out of a request, refusing what is not one."""
    if isinstance(value, bool):
        raise ValueError(f"{kind} needs an id, not {value!r}")
    try:
        identifier = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{kind} needs an id, not {value!r}") from None
    if identifier <= 0:
        raise ValueError(f"{kind} needs an id, not {value!r}")
    return identifier


def _tracks(count: int) -> str:
    """``"1 track"`` or ``"40 tracks"``."""
    return f"{count} track" if count == 1 else f"{count} tracks"


def _summarize(sentence: str, result: BatchResult) -> str:
    """Add what the sentence leaves out: the tracks it did not change.

    "Tagged 40 tracks" is the answer to what happened; "12 already had it" is
    the answer to why the number is not 52, and a user who selected 52 tracks
    will ask.
    """
    notes = []
    if result.unchanged:
        notes.append(f"{result.unchanged} unchanged")
    if result.failed:
        notes.append(f"{result.failed} could not be changed")
    if result.cancelled:
        notes.append(f"cancelled after {result.completed} of {result.total}")
    if not notes:
        return sentence
    return f"{sentence} — {', '.join(notes)}"


def _report(
    callback: Optional[BatchProgressCallback], completed: int, total: int
) -> None:
    """Report progress, if anyone is listening."""
    if callback is not None:
        callback(completed, total)
