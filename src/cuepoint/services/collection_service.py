#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The rules of the collection tree (ORG-04, DEC-006, DEC-058, DEC-059).

The repository knows how to write a tree; this knows what a legal tree is.

Four rules, and each of them is a bug somebody has shipped before
------------------------------------------------------------------
**Only a folder may be a parent.** A Collection holds tracks and a Smart
Collection holds a question; neither holds nodes, and letting one appear to
would make the pane draw something the data cannot represent.

**A node may not be moved into its own subtree.** The classic tree bug: drag a
folder into its own child and the pair disappears from the tree, still in the
database, unreachable from the root. Refused here, with a test that tries it at
every depth.

**The tree has a maximum depth**, and a move is checked against the depth of the
*whole subtree* being moved rather than the node itself. A two-deep subtree
dropped six levels down puts its leaves past the cap while the node being
dragged lands comfortably inside it.

**A Smart Collection cannot be given membership.** DEC-061 makes it a saved rule
set evaluated live; rows stored against it would be a second answer to the same
question. ORG-06 builds the rules, but the refusal belongs with the other tree
rules rather than arriving a step later.

Nothing here writes track history
---------------------------------
Adding a track to a Collection is not a change to the track — the track is what
it was, and it is now also filed somewhere. DEC-008's per-field history is about
a track's own fields, and an entry saying "collection: null → Warmups" on three
hundred tracks would bury the rating and tag changes that the History tab exists
to show. What a Collection holds is visible in the Collection.

ORG-07's batch path holds to that rather than making an exception of itself: a
selection added to a Collection from the toolbar records the same nothing a drag
does. Membership recorded on one path and not the other would be worse than the
gap, and if it belongs in the History tab it belongs here, where both paths pass.

:meth:`CollectionService.add_tracks` and :meth:`CollectionService.remove_entries`
join an outer transaction when one is open, so a batch can commit a thousand
tracks' membership at a time; with none open they behave exactly as before.

Deleting says what it will take
-------------------------------
:meth:`CollectionService.delete_preview` answers before anything happens, so
ORG-09's confirmation can name the folders, Collections and entries at risk
rather than asking an abstract question. Deleting never removes a track.

A Smart Collection is a saved query, and stays one (ORG-06, DEC-061)
--------------------------------------------------------------------
:meth:`CollectionService.create_smart` writes a rule set to a column and
:meth:`CollectionService.resolve` reads it back as the browse query it always
was. There is no membership table for it, no cache, no invalidation and nothing
to recompute — editing the rules of a Smart Collection standing for forty
thousand tracks writes one row. DEC-061 argued that at length; what this module
adds is that there is no code here that *could* materialize it.

The one thing that turns a saved question into stored rows is a **freeze**, and
it does so by making something else: a plain Collection holding today's answer,
carrying ``frozen_from_id`` and ``frozen_at``. It is a copy. Nothing keeps the
two in step afterwards, and ORG-12's UI says so at the moment of freezing
rather than in a tooltip later.

Rules are checked when they are saved, and again when they are read
-------------------------------------------------------------------
Saving refuses a rule set that names a tag or Collection which is already gone,
or one that names another Smart Collection (DEC-060) — while the user is
looking at the thing they just built, which is the only moment a refusal is
cheap. Reading cannot refuse, because the row already exists and the tag may
have been deleted since; so :meth:`CollectionService.resolve` reports the
problem instead of raising, and ORG-09 draws that state in the tree.

What resolving never does is return the whole library. A resolution is *either*
a query or a problem: rules that cannot be read would otherwise come back as an
empty rule set, and an empty rule set does not match nothing — it matches
everything. That is the failure this shape makes unrepresentable rather than
unlikely.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    KIND_SMART,
    MAX_COLLECTION_DEPTH,
    MAX_COLLECTION_NAME_LENGTH,
    AddResult,
    Collection,
    CollectionEntry,
    SubtreeSummary,
    normalize_collection_name,
)
from cuepoint.models.filter_rule import FilterRuleError, RuleSet
from cuepoint.models.library_track import utc_now_iso
from cuepoint.persistence.rule_references import BrokenRuleError, check_rule_references
from cuepoint.persistence.track_query import (
    DEFAULT_SORT,
    DIRECTIONS,
    SCOPED_SORTS,
    SORTABLE_COLUMNS,
    BrowseQuery,
    BrowseQueryError,
)
from cuepoint.services.interfaces import (
    IActivityService,
    ICollectionRepository,
    ICollectionService,
    IDatabaseService,
    ITrackRepository,
)

#: The activity event a freeze records (DEC-029, DEC-061). One event for the
#: whole freeze, carrying the count: the per-track detail is the Collection it
#: produced, which the user can open.
EVENT_COLLECTION_FROZEN = "collection.frozen"

#: Ids per query while a freeze collects what it is about to store. Paging is
#: not an optimization here — ``browse_ids`` caps one request at 50,000, so this
#: is what keeps a freeze correct on a library larger than one page.
FREEZE_PAGE_SIZE = 10_000


@dataclass(frozen=True)
class SmartResolution:
    """What a Smart Collection stands for right now (ORG-06).

    Exactly one of :attr:`query` and :attr:`problem` is set, and the constructor
    refuses anything else. That is not tidiness: the alternative is a resolution
    carrying an empty rule set because its rules could not be read, and an empty
    rule set is not "no tracks" — it is *every* track. A broken Smart Collection
    that quietly resolved to the whole library is the one outcome here worth
    making impossible to express rather than merely unlikely.

    Attributes:
        collection_id: The Smart Collection this answers for.
        name: What it is called, so a refusal can name it.
        query: The browse query its rules and saved sort come to, or ``None``.
        problem: Why it cannot be run, in the words a user needs, or ``None``.
    """

    collection_id: int
    name: str
    query: Optional[BrowseQuery] = None
    problem: Optional[str] = None

    def __post_init__(self) -> None:
        """Refuse a resolution that is neither an answer nor a reason."""
        if (self.query is None) == (self.problem is None):
            raise ValueError(
                "A resolution is either a query or a problem, never both and "
                "never neither"
            )

    @property
    def is_broken(self) -> bool:
        """True when the rules cannot be run as they stand."""
        return self.problem is not None

    def require_query(self) -> BrowseQuery:
        """Return the query, or raise the reason there is not one.

        Raises:
            BrokenRuleError: If the Smart Collection is broken. A subclass of
                ``FilterRuleError``, so every handler that already maps one to
                "that request does not make sense" answers this with the clause
                named rather than with a stack trace.
        """
        if self.query is None:
            raise BrokenRuleError(f"{self.name!r} cannot be shown: {self.problem}")
        return self.query


@dataclass(frozen=True)
class FreezeResult:
    """What a freeze produced (DEC-061).

    The count is reported rather than left to be counted again, because ORG-07
    runs a large freeze as a job and a job has to say what it did.

    Attributes:
        collection: The new Collection, already carrying its provenance.
        source_id: The Smart Collection it was frozen from.
        source_name: What that was called at the time. The source can be
            deleted afterwards, and this stays true.
        track_count: How many tracks were stored.
    """

    collection: Collection
    source_id: int
    source_name: str
    track_count: int


class CollectionService(ICollectionService):
    """Owns what a legal collection tree is, and keeps it that way."""

    def __init__(
        self,
        collection_repository: ICollectionRepository,
        database_service: IDatabaseService,
        track_repository: ITrackRepository,
        activity_service: IActivityService,
    ) -> None:
        """Wire the tree to its store, the library, the feed and transactions.

        The last two arrived with ORG-06 and are both there for one operation.
        A freeze has to *run* a Smart Collection's rules to find out what it is
        storing, which is a library query and not a tree question; and DEC-029
        wants one activity event for it, because a Collection appearing in the
        tree with forty thousand tracks in it should be something the user can
        see they did.

        Args:
            collection_repository: Where the tree and its membership live.
            database_service: Used to open the transaction a multi-statement
                operation runs in, and to hand a connection to the persistence
                function that checks what a rule names. No SQL is written here.
            track_repository: The library, read only, and only by a freeze:
                the ids a rule set matches, in the order it saved.
            activity_service: Where a freeze is recorded (DEC-029).
        """
        self._collections = collection_repository
        self._db = database_service
        self._tracks = track_repository
        self._activity = activity_service

    # -------------------------------------------------------------- the tree

    def create_folder(self, name: str, parent_id: Optional[int] = None) -> Collection:
        """Create a folder under an existing folder, or at the top level.

        Raises:
            ValueError: If the name is unusable, the parent does not exist or
                is not a folder, or the folder would sit past the depth cap.
        """
        return self._create(KIND_FOLDER, name, parent_id)

    def create_collection(
        self, name: str, parent_id: Optional[int] = None
    ) -> Collection:
        """Create a Collection under an existing folder, or at the top level.

        Raises:
            ValueError: As :meth:`create_folder`.
        """
        return self._create(KIND_COLLECTION, name, parent_id)

    def rename(self, node_id: int, name: str) -> Collection:
        """Rename a node.

        Two nodes may share a name, deliberately: they are told apart by where
        they are, the same way two folders on a disk can both be called "2024".

        Raises:
            ValueError: If there is no such node, or the name is unusable.
        """
        self._require_node(node_id)
        renamed = self._collections.rename(node_id, normalize_collection_name(name))
        assert renamed is not None  # it existed a statement ago
        return renamed

    def move(
        self, node_id: int, parent_id: Optional[int], position: Optional[int] = None
    ) -> Collection:
        """Reparent a node, or reposition it under the parent it already has.

        Raises:
            ValueError: If there is no such node, the destination is not a
                folder, the destination is the node itself or inside it, or the
                subtree would end up deeper than the cap allows.
        """
        node = self._require_node(node_id)
        with self._db.transaction():
            self._check_destination(node, parent_id)
            moved = self._collections.move(node_id, parent_id, position)
        assert moved is not None
        return moved

    def reorder(self, node_id: int, position: int) -> Collection:
        """Move a node among its siblings.

        Raises:
            ValueError: If there is no such node, or the position is negative.
        """
        self._require_node(node_id)
        if int(position) < 0:
            raise ValueError(f"A position cannot be negative: {position}")
        moved = self._collections.reorder(node_id, int(position))
        assert moved is not None
        return moved

    def delete_preview(self, node_id: int) -> SubtreeSummary:
        """Return what deleting this node would remove, without removing it.

        Raises:
            ValueError: If there is no such node.
        """
        self._require_node(node_id)
        return self._collections.subtree_summary(node_id)

    def delete(self, node_id: int) -> SubtreeSummary:
        """Delete a node and everything under it, returning what went.

        Deletes no tracks — a Collection is a way of filing tracks, not a place
        they live.

        Raises:
            ValueError: If there is no such node.
        """
        self._require_node(node_id)
        with self._db.transaction():
            summary = self._collections.subtree_summary(node_id)
            self._collections.delete(node_id)
        return summary

    def tree(self) -> List[Collection]:
        """Return the whole tree in draw order: parents first, siblings in order."""
        return self._collections.tree()

    def get(self, node_id: int) -> Optional[Collection]:
        """Return one node, or ``None``."""
        return self._collections.get(node_id)

    # ------------------------------------------------------------ membership

    def add_tracks(self, collection_id: int, track_ids: Iterable[int]) -> AddResult:
        """Append tracks that are not already in the Collection (DEC-058).

        Tracks already there are skipped and reported rather than added again:
        bulk-adding is the gesture most likely to create duplicates by accident
        and the one where a user can least easily see it happen. Use
        :meth:`insert_track` to make one on purpose.

        Raises:
            ValueError: If there is no such node, or it does not hold tracks.
        """
        self._require_collection(collection_id)
        with self._db.transaction(join_existing=True):
            return self._collections.add(collection_id, track_ids)

    def insert_track(
        self, collection_id: int, track_id: int, position: int
    ) -> CollectionEntry:
        """Put a track at a position, even if the Collection already holds it.

        The deliberate-duplicate path DEC-058 allows, and what a drop between
        two rows calls.

        Raises:
            ValueError: If there is no such node, it does not hold tracks, or
                the position is negative.
        """
        self._require_collection(collection_id)
        if int(position) < 0:
            raise ValueError(f"A position cannot be negative: {position}")
        with self._db.transaction():
            return self._collections.insert_at(collection_id, track_id, int(position))

    def remove_entries(self, entry_ids: Iterable[int]) -> int:
        """Remove entries by their own ids, closing the gaps they leave.

        Entries rather than tracks, because a track in a Collection twice has
        two of them and "remove the track" would be ambiguous (DEC-058).
        """
        with self._db.transaction(join_existing=True):
            return self._collections.remove_entries(entry_ids)

    def reorder_entry(self, entry_id: int, position: int) -> CollectionEntry:
        """Move one entry within its Collection.

        Raises:
            ValueError: If there is no such entry, or the position is negative.
        """
        if int(position) < 0:
            raise ValueError(f"A position cannot be negative: {position}")
        with self._db.transaction():
            moved = self._collections.reorder_entry(entry_id, int(position))
        if moved is None:
            raise ValueError(f"No such entry: {entry_id}")
        return moved

    def entries(
        self, collection_id: int, offset: int = 0, limit: Optional[int] = None
    ) -> List[CollectionEntry]:
        """Return a Collection's entries in its own order, a window at a time."""
        return self._collections.entries(collection_id, offset=offset, limit=limit)

    def counts(self, collection_id: int) -> Tuple[int, int]:
        """Return ``(entries, distinct tracks)`` for a Collection.

        Both, because DEC-058 lets them differ and a "412 tracks" label that
        means 412 entries is a small lie that costs trust.
        """
        return (
            self._collections.entry_count(collection_id),
            self._collections.track_count(collection_id),
        )

    def all_counts(self) -> Dict[int, Tuple[int, int]]:
        """Return ``(entries, distinct tracks)`` for every Collection at once.

        What a pane drawing the whole tree needs, in one statement rather than
        two per node (ORG-08). A Collection holding nothing is absent, which a
        caller reads as the zero it is.
        """
        return self._collections.all_counts()

    # ----------------------------------------------------- smart collections

    def create_smart(
        self,
        name: str,
        rules: RuleSet,
        parent_id: Optional[int] = None,
        sort: Optional[str] = None,
        direction: Optional[str] = None,
    ) -> Collection:
        """Save a rule set as a Smart Collection (DEC-061).

        Called ``create_smart`` rather than ``save`` so it reads beside
        :meth:`create_folder` and :meth:`create_collection`: all three make a
        node in the same tree, and one of them being called something else
        would leave a reader looking for the difference.

        The rules are checked now, not at the first browse. A Smart Collection
        saved against a tag someone deletes next week is a broken row the user
        has to be told about; one saved against a tag that was *already* gone is
        a mistake that could simply have been refused while they were still
        looking at the filter they built.

        Raises:
            ValueError: If the name is unusable, or the parent does not exist or
                is not a folder.
            FilterRuleError: If the rule set is empty, malformed, names a tag or
                Collection that is gone, or names another Smart Collection
                (DEC-060).
            BrowseQueryError: If the saved order is not one the library can be
                read in.
        """
        rules_json = self._encoded_rules(rules)
        sort_field, sort_dir = _checked_sort(sort, direction)
        return self._create(
            KIND_SMART,
            name,
            parent_id,
            rules_json=rules_json,
            sort_field=sort_field,
            sort_dir=sort_dir,
        )

    def update_rules(
        self,
        node_id: int,
        rules: RuleSet,
        sort: Optional[str] = None,
        direction: Optional[str] = None,
    ) -> Collection:
        """Replace a Smart Collection's saved question.

        Nothing is invalidated and nothing is recomputed, because nothing was
        stored: DEC-061's point is that the answer *is* the query. Editing the
        rules of a Smart Collection standing for forty thousand tracks writes
        one row, and the next browse is the first time anything is counted.

        Raises:
            ValueError: If there is no such node, or it is not a Smart
                Collection.
            FilterRuleError: As :meth:`create_smart`.
            BrowseQueryError: As :meth:`create_smart`.
        """
        node = self._require_smart(node_id)
        rules_json = self._encoded_rules(rules)
        sort_field, sort_dir = _checked_sort(sort, direction)
        updated = self._collections.set_rules(
            int(node.id or 0), rules_json, sort_field, sort_dir
        )
        assert updated is not None  # it existed a statement ago
        return updated

    def duplicate(self, node_id: int, name: Optional[str] = None) -> Collection:
        """Copy a Smart Collection's rules and order under a new name.

        It links nothing. The copy is a second saved question that happens to
        start out identical, and editing either leaves the other alone — which
        is the whole reason to duplicate rather than to reference.

        The copy is appended under the same parent rather than slotted in beside
        the original: where a node sits is a tree gesture, and ORG-09 owns those.

        Rules are copied **verbatim**, without being re-checked. Re-validating
        here would refuse to copy a Smart Collection at exactly the moment its
        rules are broken, which is one of the times a user most wants a copy to
        repair.

        Raises:
            ValueError: If there is no such node, or it is not a Smart
                Collection.
        """
        node = self._require_smart(node_id)
        return self._create(
            KIND_SMART,
            name if name is not None else _suffixed_name(node.name, "copy"),
            node.parent_id,
            rules_json=node.rules_json,
            sort_field=node.sort_field,
            sort_dir=node.sort_dir,
        )

    def resolve(self, node_id: int) -> SmartResolution:
        """Return the query a Smart Collection stands for, or why it cannot run.

        This is the whole of DEC-061's live evaluation: a rule set out of a
        column and a :class:`BrowseQuery` built from it. There is no second
        query path for a Smart Collection — the caller runs the same statement
        the filter bar runs, which is what makes "a saved rule set finds exactly
        what the unsaved one finds" a fact about the code rather than a promise
        in a document.

        It does not raise for a broken rule set, because the row exists whether
        or not its rules still do, and ORG-09 has to draw it either way. The
        refusal happens when someone tries to *run* it — see
        :meth:`SmartResolution.require_query`.

        Raises:
            ValueError: If there is no such node, or it is not a Smart
                Collection. Those are wrong questions, not broken rows.
        """
        return self._resolution_for(self._require_smart(node_id))

    def freeze(self, node_id: int, name: Optional[str] = None) -> FreezeResult:
        """Store a Smart Collection's current answer as a Collection (DEC-061).

        A sibling of ``kind='collection'``, holding the tracks the rules match
        right now, in the order the Smart Collection was saved with, carrying
        ``frozen_from_id`` and ``frozen_at``. It also keeps a copy of the rules
        it came from: ``frozen_from_id`` is deliberately not a foreign key
        (``m0009`` argues why), so the source can be deleted, and provenance
        that says "frozen from #7" with no #7 left says nothing.

        **It is a copy, and the two never speak again.** A track that starts
        matching the rules tomorrow joins the Smart Collection and not this. That
        is the point of freezing, and ORG-12 says so at the moment it happens
        rather than in a tooltip afterwards.

        One transaction: the Collection, its entries and the activity event are
        all of it or none of it. A half-frozen Collection is a worse outcome
        than a slow freeze, and ORG-07 is what keeps a large one off the UI
        thread — this method reports its count so a job has something to say.

        Raises:
            ValueError: If there is no such node, or it is not a Smart
                Collection.
            BrokenRuleError: If its rules cannot be run. Freezing a broken Smart
                Collection would store "no tracks" as though that were the
                answer.
        """
        source = self._require_smart(node_id)
        source_id = int(source.id or 0)
        query = self._resolution_for(source).require_query()

        with self._db.transaction():
            track_ids = self._matching_ids(query)
            frozen = self._create(
                KIND_COLLECTION,
                name if name is not None else _suffixed_name(source.name, "(frozen)"),
                source.parent_id,
                rules_json=source.rules_json,
                frozen_from_id=source_id,
                frozen_at=utc_now_iso(),
            )
            stored = self._collections.add(int(frozen.id or 0), track_ids)
            result = FreezeResult(
                collection=frozen,
                source_id=source_id,
                source_name=source.name,
                track_count=stored.added,
            )
            self._record_freeze(result)
        return result

    # --------------------------------------------------------------- helpers

    def _create(
        self,
        kind: str,
        name: str,
        parent_id: Optional[int],
        *,
        rules_json: Optional[str] = None,
        sort_field: Optional[str] = None,
        sort_dir: Optional[str] = None,
        frozen_from_id: Optional[int] = None,
        frozen_at: Optional[str] = None,
    ) -> Collection:
        """Validate a new node's destination and insert it.

        The transaction joins an open one rather than refusing it, because a
        freeze creates its Collection and fills it inside a single boundary that
        it owns.
        """
        wanted = normalize_collection_name(name)
        with self._db.transaction(join_existing=True):
            # The depth cap is checked by ``Collection`` itself, which refuses
            # to exist past it. A second check here read as belt and braces and
            # was neither: a mutation run removed it and every test still
            # passed, because the model was doing the work. One rule, in the
            # type that carries the value.
            depth = self._depth_under(parent_id)
            return self._collections.create(
                Collection(
                    name=wanted,
                    kind=kind,
                    parent_id=parent_id,
                    depth=depth,
                    rules_json=rules_json,
                    sort_field=sort_field,
                    sort_dir=sort_dir,
                    frozen_from_id=frozen_from_id,
                    frozen_at=frozen_at,
                )
            )

    def _depth_under(self, parent_id: Optional[int]) -> int:
        """Return the depth a child of this parent would sit at.

        Raises:
            ValueError: If the parent does not exist or is not a folder.
        """
        if parent_id is None:
            return 0
        parent = self._require_node(parent_id)
        if not parent.is_folder:
            raise ValueError(
                f"{parent.name!r} is a {parent.kind}, and only a folder can "
                "contain other collections"
            )
        return parent.depth + 1

    def _check_destination(self, node: Collection, parent_id: Optional[int]) -> None:
        """Refuse a move that would break the tree.

        Raises:
            ValueError: If the destination is the node itself, is inside it, is
                not a folder, or would push the subtree past the depth cap.
        """
        if parent_id is not None and int(parent_id) == int(node.id or 0):
            raise ValueError(f"{node.name!r} cannot contain itself")

        new_depth = self._depth_under(parent_id)

        if parent_id is not None and int(parent_id) in set(
            self._collections.subtree_ids(int(node.id or 0))
        ):
            # The bug that loses a subtree: the pair stays in the database and
            # disappears from every walk that starts at the root.
            raise ValueError(f"{node.name!r} cannot be moved inside itself")

        height = self._collections.max_depth_in_subtree(int(node.id or 0)) - node.depth
        if new_depth + height > MAX_COLLECTION_DEPTH:
            raise ValueError(
                f"That would put part of {node.name!r} deeper than "
                f"{MAX_COLLECTION_DEPTH} levels"
            )

    def _require_smart(self, node_id: int) -> Collection:
        """Return a Smart Collection, or say what the node is instead.

        Raises:
            ValueError: If there is no such node, or it is a folder or a
                Collection. A Collection's membership is rows, and rows are
                edited with :meth:`add_tracks` rather than with a rule set.
        """
        node = self._require_node(node_id)
        if not node.is_smart:
            raise ValueError(
                f"{node.name!r} is a {node.kind}, not a smart collection: its "
                "membership is rows rather than a rule set"
            )
        return node

    def _resolution_for(self, node: Collection) -> SmartResolution:
        """Turn one Smart Collection row into a query, or into a reason.

        Both refusals are caught, and they are different things: the rules may
        be unreadable or no longer legal (``FilterRuleError``), or the saved
        order may not be one the library can be read in (``BrowseQueryError``).
        A row can arrive in either state without anyone doing anything wrong
        today — a tag was deleted, a field left the vocabulary — so neither is
        an exception to throw at whoever happened to open the tree.
        """
        identifier = int(node.id or 0)
        try:
            rules = _decode_rules(node.rules_json)
            check_rule_references(self._db.connect(), rules)
            query = BrowseQuery(
                rules=rules,
                sort=node.sort_field or DEFAULT_SORT,
                direction=node.sort_dir or "asc",
            ).validated()
        except (FilterRuleError, BrowseQueryError) as problem:
            return SmartResolution(identifier, node.name, problem=str(problem))
        return SmartResolution(identifier, node.name, query=query)

    def _encoded_rules(self, rules: RuleSet) -> str:
        """Check a rule set and return the text its column stores.

        Sorted keys and no spaces: the stored form is compared in tests and read
        in bug reports, and saving the same rules twice should produce the same
        bytes.

        Raises:
            FilterRuleError: If the set is empty, malformed, names a tag or
                Collection that is gone, or names another Smart Collection
                (DEC-060).
        """
        valid = rules.validated()
        if not valid.rules:
            raise FilterRuleError(
                "A smart collection needs at least one rule: a filter with none "
                "matches the whole library, which is the Library page"
            )
        check_rule_references(self._db.connect(), valid)
        return json.dumps(valid.to_dict(), separators=(",", ":"), sort_keys=True)

    def _matching_ids(self, query: BrowseQuery) -> List[int]:
        """Every track a query matches, in the query's own order.

        Paged, because ``browse_ids`` caps one request and a library can hold
        more than a cap — an unpaged read would freeze the first 50,000 tracks
        of a larger library and call it the answer. Read inside the freeze's
        transaction, so the answer cannot move between the first page and the
        last.
        """
        found: List[int] = []
        while True:
            page = self._tracks.browse_ids(
                query, limit=FREEZE_PAGE_SIZE, offset=len(found)
            )
            found.extend(page)
            if len(page) < FREEZE_PAGE_SIZE:
                return found

    def _record_freeze(self, result: FreezeResult) -> None:
        """Record the one event a freeze writes (DEC-029).

        One, not one per track: a freeze is something a user did once, and the
        per-track detail is the Collection it produced, which they can open.
        Inside the freeze's own transaction, so a freeze that is not in the feed
        is also not in the tree.
        """
        tracks = result.track_count
        plural = "" if tracks == 1 else "s"
        self._activity.record_event(
            EVENT_COLLECTION_FROZEN,
            f"Froze {result.source_name!r} into {result.collection.name!r} — "
            f"{tracks} track{plural}",
            {
                "collection_id": result.collection.id,
                "collection_name": result.collection.name,
                "smart_collection_id": result.source_id,
                "smart_collection_name": result.source_name,
                "tracks": tracks,
            },
        )

    def _require_node(self, node_id: int) -> Collection:
        """Return the node, or refuse the operation by name.

        Raises:
            ValueError: If there is no such node.
        """
        node = self._collections.get(int(node_id))
        if node is None:
            raise ValueError(f"No such collection: {node_id}")
        return node

    def _require_collection(self, node_id: int) -> Collection:
        """Return a node that can hold tracks, or say why it cannot.

        Raises:
            ValueError: If there is no such node, or it is a folder or a Smart
                Collection.
        """
        node = self._require_node(node_id)
        if not node.holds_tracks:
            if node.is_smart:
                raise ValueError(
                    f"{node.name!r} is a smart collection: its membership comes "
                    "from its rules, so tracks cannot be put in it by hand"
                )
            raise ValueError(f"{node.name!r} is a folder and does not hold tracks")
        return node


def _decode_rules(text: Optional[str]) -> RuleSet:
    """Read a saved rule set back, or say why it cannot be read.

    The empty check is not redundant with :meth:`CollectionService._encoded_rules`
    refusing to write one. That guards what this process saves; this guards what
    the file holds, and the two are not the same claim once a database has been
    opened by a different version, restored from a backup, or edited by hand. An
    empty rule set read back as "no filters" would show the whole library under
    a name the user chose for a handful of tracks.

    Raises:
        FilterRuleError: If the column does not hold a rule set this build can
            run.
    """
    try:
        payload: Any = json.loads(text or "")
    except ValueError:
        raise FilterRuleError(
            "its saved rules are not readable — the stored filter is not valid JSON"
        ) from None
    # Anything that is not an object is refused by ``RuleSet.from_dict``, which
    # already names it. A second check here could only change the wording, and a
    # branch no test can tell from its absence is a branch that is not there.
    parsed = RuleSet.from_dict(payload).validated()
    if not parsed.rules:
        raise FilterRuleError(
            "its saved rules are empty, and a filter with no rules is the whole "
            "library rather than none of it"
        )
    return parsed


def _checked_sort(
    sort: Optional[str], direction: Optional[str]
) -> Tuple[Optional[str], Optional[str]]:
    """Return the order to store on a Smart Collection, or refuse it.

    ``(None, None)`` when neither was asked for. A Smart Collection with no
    saved order opens in whatever order the Library page is already showing,
    which is a different thing from one saved with the default and would
    therefore override it.

    Raises:
        BrowseQueryError: If the ordering is not one the library can be read in,
            or is one that only means something inside a playlist.
    """
    if sort is None and direction is None:
        return None, None

    field = (sort or DEFAULT_SORT).strip()
    if field not in SORTABLE_COLUMNS:
        valid = ", ".join(SORTABLE_COLUMNS)
        raise BrowseQueryError(f"Cannot sort by {field!r}. Sortable columns: {valid}")
    if field in SCOPED_SORTS:
        # Caught here rather than left to the first browse, which would refuse
        # it too — with a message about a missing playlist, against a Smart
        # Collection the user saved days ago and cannot now open.
        raise BrowseQueryError(
            f"Cannot save {field!r} as a smart collection's order: it is a "
            "position inside a playlist, and a smart collection is a question "
            "about the library rather than a place in one"
        )

    way = (direction or "asc").strip().lower()
    if way not in DIRECTIONS:
        raise BrowseQueryError(
            f"Sort direction must be 'asc' or 'desc', not {direction!r}"
        )
    return field, way


def _suffixed_name(name: str, suffix: str) -> str:
    """Return ``name`` with a suffix, trimmed to fit a collection name.

    Trimmed rather than allowed to overflow, because otherwise duplicating a
    node whose name is already at the limit fails with a message about name
    length — for something the user did not type.
    """
    tail = f" {suffix}"
    room = MAX_COLLECTION_NAME_LENGTH - len(tail)
    return f"{name[:room].rstrip()}{tail}"
