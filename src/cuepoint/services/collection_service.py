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

Deleting says what it will take
-------------------------------
:meth:`CollectionService.delete_preview` answers before anything happens, so
ORG-09's confirmation can name the folders, Collections and entries at risk
rather than asking an abstract question. Deleting never removes a track.
"""

from __future__ import annotations

from typing import Iterable, List, Optional, Tuple

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    MAX_COLLECTION_DEPTH,
    AddResult,
    Collection,
    CollectionEntry,
    SubtreeSummary,
    normalize_collection_name,
)
from cuepoint.services.interfaces import (
    ICollectionRepository,
    ICollectionService,
    IDatabaseService,
)


class CollectionService(ICollectionService):
    """Owns what a legal collection tree is, and keeps it that way."""

    def __init__(
        self,
        collection_repository: ICollectionRepository,
        database_service: IDatabaseService,
    ) -> None:
        """Wire the tree to its store and to transactions.

        Args:
            collection_repository: Where the tree and its membership live.
            database_service: Used only to open the transaction a multi-statement
                operation runs in. No SQL is run here.
        """
        self._collections = collection_repository
        self._db = database_service

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
        with self._db.transaction():
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
        with self._db.transaction():
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

    # --------------------------------------------------------------- helpers

    def _create(self, kind: str, name: str, parent_id: Optional[int]) -> Collection:
        """Validate a new node's destination and insert it."""
        wanted = normalize_collection_name(name)
        with self._db.transaction():
            # The depth cap is checked by ``Collection`` itself, which refuses
            # to exist past it. A second check here read as belt and braces and
            # was neither: a mutation run removed it and every test still
            # passed, because the model was doing the work. One rule, in the
            # type that carries the value.
            depth = self._depth_under(parent_id)
            return self._collections.create(
                Collection(name=wanted, kind=kind, parent_id=parent_id, depth=depth)
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
