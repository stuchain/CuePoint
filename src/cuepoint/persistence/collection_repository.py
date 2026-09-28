#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for CuePoint's own collection tree and its membership (ORG-04).

Two tables. ``collections`` is a tree of folders, Collections and Smart
Collections (DEC-059); ``collection_tracks`` is the ordered, duplicate-allowing
membership DEC-058 chose.

It is deliberately the same *shape* as ``playlist_repository`` and deliberately
not the same thing. That one mirrors Rekordbox — rebuilt wholesale on every
import, read-only by DEC-031, with no rename, move or reorder to speak of. This
one is the user's, edited in place, and never rebuilt from anything.

Positions are contiguous, and that is this module's job
-------------------------------------------------------
Every mutation leaves ``0, 1, 2, …`` with no gaps and no repeats, among a
node's siblings and among a Collection's entries. The guarantee lives here
rather than in the service because it is a property of the statements: a
service can only assert it, while these methods are what make it true.

**Reordering is arithmetic, not a rewrite.** Moving an entry from position 40 to
position 3 shifts the eight rows between them by one and sets the moved row —
three statements, touching only the affected range, rather than renumbering
five thousand rows in a loop. That is possible only because ORG-01 declined to
put a unique index on ``(collection_id, position)``: halfway through the shift
two rows briefly share a position, which a unique index would refuse. The
decision was argued there on exactly this ground, and this is the payoff.

Removal is the one case that cannot be arithmetic — several holes can open at
once — so it renumbers the collection with one windowed ``UPDATE`` rather than
a Python loop.

Depth is stored, and maintained on move
---------------------------------------
Mirroring ``rekordbox_playlists`` so a pane can indent without walking parents.
Moving a subtree shifts every descendant's depth by the same delta, in one
recursive statement.

A Set's entries are planned in the same transaction that writes them (PREP-02)
------------------------------------------------------------------------------
A Set (DEC-102) holds its entries in ``collection_tracks`` like a Collection,
and every one of them needs a ``set_entries`` row naming its chapter from the
moment it exists (DEC-103). This module is the only writer of
``collection_tracks``, so it is the one place that can promise that: every
method that writes an entry into a Set writes its plan row in the same
transaction, and a batch job, a drag, a freeze and a duplicate all pass through
here. Doing it in a service would leave one path that forgets.

Where a new entry goes:

- **Appended** entries go into the last chapter.
- **Inserted** entries go into the chapter of the entry before them, or the
  first chapter at position 0.
- A **moved** entry keeps its chapter when the chapter still reaches the new
  position, which is inside it or at one of its edges, and otherwise follows
  the insert rule. Reordering within a chapter, even to its first place, never
  moves an entry into the chapter before.
- A caller may **name a chapter** instead, for an insert or a move, and the name
  is refused unless the chapter reaches the position.

After every write to a Set, :meth:`CollectionRepository._check_set` reads the
Set back: at least one chapter, every entry planned, and chapter positions that
never decrease in entry order. A violation raises
:class:`~cuepoint.models.set_plan.SetIntegrityError` and the transaction rolls
back, because it is a bug in this module and not something a user sent.

**A Set holds at most** :data:`~cuepoint.models.set_plan.MAX_SET_ENTRIES`
entries, and an add that would pass it is refused with the numbers before
anything is written.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from cuepoint.models.collection import (
    KIND_COLLECTION,
    KIND_FOLDER,
    KIND_SET,
    KIND_SMART,
    AddResult,
    Collection,
    CollectionEntry,
    SubtreeSummary,
    normalize_collection_name,
)
from cuepoint.models.library_track import utc_now_iso
from cuepoint.models.set_plan import (
    MAX_SET_ENTRIES,
    SetAcknowledgement,
    SetChapter,
    SetDetails,
    SetEntryPlan,
    SetIntegrityError,
    SetLimitError,
)
from cuepoint.persistence.id_chunks import chunked, unique_ids
from cuepoint.services.interfaces import ICollectionRepository, IDatabaseService

_NODE_COLUMNS = (
    "id",
    "parent_id",
    "kind",
    "name",
    "position",
    "depth",
    "rules_json",
    "sort_field",
    "sort_dir",
    "frozen_from_id",
    "frozen_at",
    "created_at",
    "updated_at",
)

_SELECT_NODE = f"SELECT {', '.join(_NODE_COLUMNS)} FROM collections"

#: One query for the whole tree, in the order a pane draws it: parents before
#: children, siblings in their own order, ties broken by id so the result is
#: stable across calls.
_TREE_ORDER = " ORDER BY depth, position, id"

_SELECT_ENTRY = (
    "SELECT id, collection_id, track_id, position, added_at FROM collection_tracks"
)

_SELECT_CHAPTER = (
    "SELECT id, collection_id, position, name, notes, target_seconds, bpm_min,"
    " bpm_max, created_at, updated_at FROM set_chapters"
)

#: One Set's plan rows, in the Set's own entry order.
_SELECT_PLANS = (
    "SELECT se.entry_id, se.collection_id, se.chapter_id, se.in_seconds,"
    " se.out_seconds, se.note FROM set_entries se"
    " JOIN collection_tracks ct ON ct.id = se.entry_id"
    " WHERE se.collection_id = ? ORDER BY ct.position, ct.id"
)

_SELECT_ACKNOWLEDGEMENTS = (
    "SELECT id, collection_id, from_entry_id, to_entry_id, warning,"
    " compared_json, created_at FROM set_acknowledgements"
)

#: Where a node sits for the two statements between leaving one parent and
#: taking its place under another. Past the end of any real sibling list, so
#: closing the old parent's gap and opening the new parent's cannot touch it.
_PARKED_POSITION = 1_000_000

#: Walks a node and everything under it. ``UNION`` rather than ``UNION ALL`` so
#: a malformed tree cannot loop forever — the service refuses cycles, but a
#: recursive query that can hang is not worth the microsecond.
_SUBTREE_CTE = (
    "WITH RECURSIVE subtree(id) AS ("
    "  SELECT id FROM collections WHERE id = ?"
    "  UNION"
    "  SELECT c.id FROM collections c JOIN subtree ON c.parent_id = subtree.id"
    ")"
)


class CollectionRepository(ICollectionRepository):
    """Persistence for the collection tree and its membership."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads and writes through."""
        self._db = database_service

    # -------------------------------------------------------------- tree read

    def get(self, node_id: int) -> Optional[Collection]:
        """Return one node, or ``None``."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT_NODE} WHERE id = ?", (int(node_id),))
            .fetchone()
        )
        return None if row is None else Collection.from_row(row)

    def tree(self) -> List[Collection]:
        """Return every node, parents before children, siblings in order.

        One query, as the playlist pane already reads its tree: a tree built
        from one ordered list is a tree that cannot disagree with itself, and
        200 nodes is not worth 200 round trips.
        """
        rows = self._db.connect().execute(f"{_SELECT_NODE}{_TREE_ORDER}").fetchall()
        return [Collection.from_row(row) for row in rows]

    def children_of(self, parent_id: Optional[int]) -> List[Collection]:
        """Return a node's children in sibling order, or the top level."""
        connection = self._db.connect()
        if parent_id is None:
            rows = connection.execute(
                f"{_SELECT_NODE} WHERE parent_id IS NULL ORDER BY position, id"
            ).fetchall()
        else:
            rows = connection.execute(
                f"{_SELECT_NODE} WHERE parent_id = ? ORDER BY position, id",
                (int(parent_id),),
            ).fetchall()
        return [Collection.from_row(row) for row in rows]

    def subtree_ids(self, node_id: int) -> List[int]:
        """Return the node's id and every descendant's, in no particular order.

        What a cycle check and a delete preview are both built from.
        """
        rows = (
            self._db.connect()
            .execute(f"{_SUBTREE_CTE} SELECT id FROM subtree", (int(node_id),))
            .fetchall()
        )
        return [int(row["id"]) for row in rows]

    def subtree_summary(self, node_id: int) -> SubtreeSummary:
        """Return what deleting this node would remove (for ORG-09's confirm)."""
        ids = self.subtree_ids(node_id)
        if not ids:
            return SubtreeSummary()

        kinds: Dict[str, int] = {
            KIND_FOLDER: 0,
            KIND_COLLECTION: 0,
            KIND_SMART: 0,
            KIND_SET: 0,
        }
        entries = 0
        connection = self._db.connect()
        for chunk in chunked(ids):
            placeholders = ", ".join("?" for _ in chunk)
            for row in connection.execute(
                f"SELECT kind, count(*) AS n FROM collections"
                f" WHERE id IN ({placeholders}) GROUP BY kind",
                tuple(chunk),
            ):
                kinds[str(row["kind"])] = kinds.get(str(row["kind"]), 0) + int(row["n"])
            row = connection.execute(
                "SELECT count(*) AS n FROM collection_tracks"
                f" WHERE collection_id IN ({placeholders})",
                tuple(chunk),
            ).fetchone()
            entries += int(row["n"]) if row is not None else 0

        return SubtreeSummary(
            folders=kinds[KIND_FOLDER],
            collections=kinds[KIND_COLLECTION],
            smart_collections=kinds[KIND_SMART],
            entries=entries,
            sets=kinds[KIND_SET],
        )

    def max_depth_in_subtree(self, node_id: int) -> int:
        """Return the deepest ``depth`` under and including this node.

        What a move needs to know before it agrees to reparent something: a
        two-deep subtree dropped six levels down would put its leaves past the
        cap even though the node being moved would land inside it.
        """
        row = (
            self._db.connect()
            .execute(
                f"{_SUBTREE_CTE}"
                " SELECT max(depth) AS d FROM collections WHERE id IN"
                " (SELECT id FROM subtree)",
                (int(node_id),),
            )
            .fetchone()
        )
        return 0 if row is None or row["d"] is None else int(row["d"])

    def count(self) -> int:
        """Return how many nodes exist, folders included."""
        row = (
            self._db.connect()
            .execute("SELECT count(*) AS n FROM collections")
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    # ------------------------------------------------------------- tree write

    def create(self, node: Collection) -> Collection:
        """Insert a node at the end of its parent's children.

        ``position`` and ``depth`` are computed here rather than taken from the
        caller: they are facts about where the node is going, and a caller that
        could get them wrong is a caller that could corrupt the ordering.

        A Set is made with its details row and one unnamed chapter in the same
        transaction (DEC-103), so no Set exists, even for a statement, that an
        entry could not be planned into.
        """
        with self._db.transaction(join_existing=True) as conn:
            self._insert_node(conn, node)
            if node.kind == KIND_SET:
                set_id = int(node.id or 0)
                now = utc_now_iso()
                self._insert_details(conn, set_id, None, now)
                conn.execute(
                    "INSERT INTO set_chapters"
                    " (collection_id, position, name, created_at, updated_at)"
                    " VALUES (?, 0, '', ?, ?)",
                    (set_id, now, now),
                )
        return node

    def rename(self, node_id: int, name: str) -> Optional[Collection]:
        """Rename a node. Nothing else about it changes."""
        return self._update(node_id, {"name": normalize_collection_name(name)})

    def set_rules(
        self,
        node_id: int,
        rules_json: Optional[str],
        sort_field: Optional[str] = None,
        sort_dir: Optional[str] = None,
    ) -> Optional[Collection]:
        """Write a Smart Collection's saved rule set and sort (ORG-06 uses this)."""
        return self._update(
            node_id,
            {"rules_json": rules_json, "sort_field": sort_field, "sort_dir": sort_dir},
        )

    def move(
        self, node_id: int, parent_id: Optional[int], position: Optional[int] = None
    ) -> Optional[Collection]:
        """Reparent a node, keeping both sibling lists contiguous.

        The old parent's children close up behind it and the new parent's open
        to let it in, and every descendant's depth shifts by the same delta.
        Refusing cycles is the service's job — by the time a move reaches here
        it is a legal move.

        **A move that does not change the parent is a reorder**, and is handled
        as one. What that branch decides is what a *position-less* move means:
        moving a node to the parent it already has, without saying where, leaves
        it exactly where it is. The reparenting path would read the same call as
        "append", quietly sending the node to the end of its own sibling list —
        which is not what a caller re-dropping something on its current parent
        meant.
        """
        node_id = int(node_id)
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                "SELECT parent_id, position, depth FROM collections WHERE id = ?",
                (node_id,),
            ).fetchone()
            if row is None:
                return None

            old_parent = row["parent_id"]
            old_position = int(row["position"])
            old_depth = int(row["depth"])

            same_parent = (old_parent is None and parent_id is None) or (
                old_parent is not None
                and parent_id is not None
                and int(old_parent) == int(parent_id)
            )
            if same_parent:
                if position is not None:
                    self._shift_siblings(
                        conn, old_parent, old_position, int(position), node_id
                    )
                    conn.execute(
                        "UPDATE collections SET updated_at = ? WHERE id = ?",
                        (utc_now_iso(), node_id),
                    )
                return self.get(node_id)

            new_depth = self._depth_for(conn, parent_id)
            target = self._next_position(conn, parent_id, excluding=node_id)
            if position is not None:
                target = max(0, min(int(position), target))

            # Into the new list at a position past its end first, so the two
            # sibling lists are never counted together and the old one can be
            # closed up without the node in it.
            conn.execute(
                "UPDATE collections SET parent_id = ?, position = ? WHERE id = ?",
                (parent_id, _PARKED_POSITION, node_id),
            )
            self._close_gap(conn, old_parent)
            self._open_gap(conn, parent_id, target)
            conn.execute(
                "UPDATE collections SET position = ?, depth = ?,"
                " updated_at = ? WHERE id = ?",
                (target, new_depth, utc_now_iso(), node_id),
            )

            delta = new_depth - old_depth
            if delta:
                conn.execute(
                    f"{_SUBTREE_CTE}"
                    " UPDATE collections SET depth = depth + ?"
                    " WHERE id IN (SELECT id FROM subtree) AND id != ?",
                    (node_id, delta, node_id),
                )
        return self.get(node_id)

    def reorder(self, node_id: int, position: int) -> Optional[Collection]:
        """Move a node among its own siblings."""
        node_id = int(node_id)
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                "SELECT parent_id, position FROM collections WHERE id = ?", (node_id,)
            ).fetchone()
            if row is None:
                return None
            self._shift_siblings(
                conn, row["parent_id"], int(row["position"]), int(position), node_id
            )
        return self.get(node_id)

    def delete(self, node_id: int) -> bool:
        """Delete a node and everything under it. Deletes no tracks.

        The subtree goes by cascade (``m0009``); the siblings it leaves behind
        are closed up here so the ordering stays contiguous.
        """
        node_id = int(node_id)
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                "SELECT parent_id FROM collections WHERE id = ?", (node_id,)
            ).fetchone()
            if row is None:
                return False
            parent_id = row["parent_id"]
            conn.execute("DELETE FROM collections WHERE id = ?", (node_id,))
            self._close_gap(conn, parent_id)
        return True

    # ------------------------------------------------------------- membership

    def entries(
        self,
        collection_id: int,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> List[CollectionEntry]:
        """Return a Collection's entries in its own order, a window at a time."""
        sql = f"{_SELECT_ENTRY} WHERE collection_id = ? ORDER BY position, id"
        params: Tuple[object, ...] = (int(collection_id),)
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            params = (*params, int(limit), max(0, int(offset)))
        rows = self._db.connect().execute(sql, params).fetchall()
        return [CollectionEntry.from_row(row) for row in rows]

    def track_ids(self, collection_id: int) -> List[int]:
        """Return the track ids in a Collection's order, repeats included."""
        rows = (
            self._db.connect()
            .execute(
                "SELECT track_id FROM collection_tracks WHERE collection_id = ?"
                " ORDER BY position, id",
                (int(collection_id),),
            )
            .fetchall()
        )
        return [int(row["track_id"]) for row in rows]

    def all_counts(self) -> Dict[int, Tuple[int, int]]:
        """Return ``(entries, distinct tracks)`` for every Collection, in one query.

        The whole tree at once rather than two counts per node. A pane drawing
        two hundred Collections would otherwise run four hundred statements to
        put a number beside each name — the same N+1 ORG-03 measured away for
        the tag list, met here for the same reason and answered the same way.

        Collections holding nothing are absent rather than zero: they have no
        rows to group, and a caller reading a count for a node has to default
        anyway for one that was created a moment ago.
        """
        rows = self._db.connect().execute(
            "SELECT collection_id, count(*) AS entries,"
            " count(DISTINCT track_id) AS tracks"
            " FROM collection_tracks GROUP BY collection_id"
        )
        return {
            int(row["collection_id"]): (int(row["entries"]), int(row["tracks"]))
            for row in rows
        }

    def entry_count(self, collection_id: int) -> int:
        """Return how many rows a Collection holds, duplicates counted."""
        row = (
            self._db.connect()
            .execute(
                "SELECT count(*) AS n FROM collection_tracks WHERE collection_id = ?",
                (int(collection_id),),
            )
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    def track_count(self, collection_id: int) -> int:
        """Return how many *distinct* tracks a Collection holds (DEC-058)."""
        row = (
            self._db.connect()
            .execute(
                "SELECT count(DISTINCT track_id) AS n FROM collection_tracks"
                " WHERE collection_id = ?",
                (int(collection_id),),
            )
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    def add(self, collection_id: int, track_ids: Iterable[int]) -> AddResult:
        """Append tracks that are not already there, and report what was skipped.

        DEC-058 allows a track in a Collection twice, but not by accident: a
        dropped selection that overlaps what is already there adds the new ones
        and says how many it left alone. :meth:`insert_at` is how a deliberate
        duplicate is made.

        Into a Set, the new entries join its last chapter, and an add that
        would take it past :data:`~cuepoint.models.set_plan.MAX_SET_ENTRIES` is
        refused before anything is written. Only the tracks that would actually
        be added count against the limit.

        Raises:
            SetLimitError: If the node is a Set and the tracks would not fit.
        """
        collection_id = int(collection_id)
        wanted = unique_ids(track_ids)
        if not wanted:
            return AddResult()

        with self._db.transaction(join_existing=True):
            present = set(self.track_ids(collection_id))
            adding = [track_id for track_id in wanted if track_id not in present]
            skipped = tuple(track_id for track_id in wanted if track_id in present)
            if adding:
                self._append(collection_id, adding)
        return AddResult(added_track_ids=tuple(adding), skipped_track_ids=skipped)

    def append(self, collection_id: int, track_ids: Iterable[int]) -> AddResult:
        """Append tracks exactly as given, repeats and all.

        What copying a running order needs (PREP-02's "New Set from…"): a
        Collection's entries with the track it holds twice held twice, in the
        order they were in. :meth:`add` is the gesture a person makes, and skips
        what is already there; this is a copy, and skips nothing.

        Raises:
            SetLimitError: If the node is a Set and the tracks would not fit.
        """
        adding = [int(track_id) for track_id in track_ids]
        if adding:
            with self._db.transaction(join_existing=True):
                self._append(int(collection_id), adding)
        return AddResult(added_track_ids=tuple(adding))

    def insert_at(
        self,
        collection_id: int,
        track_id: int,
        position: int,
        chapter_id: Optional[int] = None,
    ) -> CollectionEntry:
        """Put a track at a given place, even if it is already in the Collection.

        The deliberate-duplicate path (DEC-058), and what a drop between two
        rows calls.

        Into a Set, the entry joins the chapter of the entry before it, or the
        first chapter at position 0, unless ``chapter_id`` names one. Naming one
        settles which side of a chapter boundary a drop lands on.

        Raises:
            SetLimitError: If the node is a Set that is full.
            ValueError: If ``chapter_id`` is given for a node that is not a Set,
                names a chapter of another Set, or names one the position is
                not inside or at the edge of.
        """
        collection_id = int(collection_id)
        with self._db.transaction(join_existing=True) as conn:
            is_set = self._kind_of(conn, collection_id) == KIND_SET
            if chapter_id is not None and not is_set:
                raise ValueError("Only an entry in a Set belongs to a chapter")
            if is_set:
                self._check_room(conn, collection_id, 1)
            end = self._next_entry_position(conn, collection_id)
            target = max(0, min(int(position), end))
            conn.execute(
                "UPDATE collection_tracks SET position = position + 1"
                " WHERE collection_id = ? AND position >= ?",
                (collection_id, target),
            )
            cursor = conn.execute(
                "INSERT INTO collection_tracks"
                " (collection_id, track_id, position, added_at) VALUES (?, ?, ?, ?)",
                (collection_id, int(track_id), target, utc_now_iso()),
            )
            entry_id = int(cursor.lastrowid or 0)
            if is_set:
                chapter = self._chapter_for_slot(
                    conn, collection_id, entry_id, target, chapter_id
                )
                conn.execute(
                    "INSERT INTO set_entries (entry_id, collection_id, chapter_id)"
                    " VALUES (?, ?, ?)",
                    (entry_id, collection_id, chapter),
                )
                self._check_set(conn, collection_id)
            row = conn.execute(f"{_SELECT_ENTRY} WHERE id = ?", (entry_id,)).fetchone()
        return CollectionEntry.from_row(row)

    def remove_entries(self, entry_ids: Iterable[int]) -> int:
        """Remove specific entries and close the gaps they leave.

        Entries, not tracks: a track in a Collection twice has two entries and
        "remove the track" is not a well-formed request (DEC-058).
        """
        wanted = unique_ids(entry_ids)
        if not wanted:
            return 0

        removed = 0
        with self._db.transaction(join_existing=True) as conn:
            affected: set = set()
            for chunk in chunked(wanted):
                placeholders = ", ".join("?" for _ in chunk)
                for row in conn.execute(
                    "SELECT DISTINCT collection_id FROM collection_tracks"
                    f" WHERE id IN ({placeholders})",
                    tuple(chunk),
                ):
                    affected.add(int(row["collection_id"]))
                cursor = conn.execute(
                    f"DELETE FROM collection_tracks WHERE id IN ({placeholders})",
                    tuple(chunk),
                )
                removed += int(cursor.rowcount or 0)
            for collection_id in affected:
                self._renumber_entries(conn, collection_id)
                # A removal cannot break a Set: the plan rows and any
                # acknowledgement naming the entries go by cascade, and what is
                # left is still in order. The check is cheap and makes that a
                # fact rather than an argument.
                if self._kind_of(conn, collection_id) == KIND_SET:
                    self._check_set(conn, collection_id)
        return removed

    def reorder_entry(
        self, entry_id: int, position: int, chapter_id: Optional[int] = None
    ) -> Optional[CollectionEntry]:
        """Move one entry within its Collection.

        Arithmetic on the affected range rather than a rewrite of the whole
        list — see the module docstring for why that is possible here.

        In a Set, the entry keeps its chapter when that still reaches the new
        position, and otherwise joins the chapter of the entry now before it,
        or the first chapter at position 0; ``chapter_id`` overrides both. A
        move to where the entry already is changes nothing unless a chapter is
        named, so naming one there moves the entry across a chapter boundary
        without moving it in the list.

        Raises:
            ValueError: If ``chapter_id`` is given for an entry that is not in a
                Set, names a chapter of another Set, or names one the position
                is not inside or at the edge of.
        """
        entry_id = int(entry_id)
        with self._db.transaction(join_existing=True) as conn:
            row = conn.execute(
                "SELECT collection_id, position FROM collection_tracks WHERE id = ?",
                (entry_id,),
            ).fetchone()
            if row is None:
                return None

            collection_id = int(row["collection_id"])
            is_set = self._kind_of(conn, collection_id) == KIND_SET
            if chapter_id is not None and not is_set:
                raise ValueError("Only an entry in a Set belongs to a chapter")
            current = int(row["position"])
            end = self._next_entry_position(conn, collection_id) - 1
            target = max(0, min(int(position), end))
            if target == current and chapter_id is None:
                return CollectionEntry.from_row(
                    conn.execute(
                        f"{_SELECT_ENTRY} WHERE id = ?", (entry_id,)
                    ).fetchone()
                )

            if target > current:
                conn.execute(
                    "UPDATE collection_tracks SET position = position - 1"
                    " WHERE collection_id = ? AND position > ? AND position <= ?",
                    (collection_id, current, target),
                )
            elif target < current:
                conn.execute(
                    "UPDATE collection_tracks SET position = position + 1"
                    " WHERE collection_id = ? AND position >= ? AND position < ?",
                    (collection_id, target, current),
                )
            conn.execute(
                "UPDATE collection_tracks SET position = ? WHERE id = ?",
                (target, entry_id),
            )
            if is_set:
                planned = conn.execute(
                    "SELECT chapter_id FROM set_entries WHERE entry_id = ?",
                    (entry_id,),
                ).fetchone()
                chapter = self._chapter_for_slot(
                    conn,
                    collection_id,
                    entry_id,
                    target,
                    chapter_id,
                    keep=None if planned is None else int(planned["chapter_id"]),
                )
                conn.execute(
                    "UPDATE set_entries SET chapter_id = ? WHERE entry_id = ?",
                    (chapter, entry_id),
                )
                self._check_set(conn, collection_id)
            row = conn.execute(f"{_SELECT_ENTRY} WHERE id = ?", (entry_id,)).fetchone()
        return CollectionEntry.from_row(row)

    def clear(self, collection_id: int) -> int:
        """Remove every entry from a Collection. Deletes no tracks."""
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                "DELETE FROM collection_tracks WHERE collection_id = ?",
                (int(collection_id),),
            )
            return int(cursor.rowcount or 0)

    # ------------------------------------------------------- reverse lookups

    def collection_ids_for_track(self, track_id: int) -> List[int]:
        """Return the Collections a track is in, lowest id first.

        ``DISTINCT`` because a track in a Collection twice is still in one
        Collection — the reason ``collection_tracks`` carries an index on
        ``track_id``.
        """
        rows = (
            self._db.connect()
            .execute(
                "SELECT DISTINCT collection_id FROM collection_tracks"
                " WHERE track_id = ? ORDER BY collection_id",
                (int(track_id),),
            )
            .fetchall()
        )
        return [int(row["collection_id"]) for row in rows]

    def references_for(
        self, track_ids: Iterable[int], kind: str = KIND_COLLECTION
    ) -> Tuple[List[int], List[int]]:
        """Return ``(node ids, referenced track ids)`` for a set of tracks.

        What DEC-011's warning is built from. Both lists are distinct: a
        Collection holding three of the doomed tracks is one Collection a user
        would find changed, and a track held twice by two Collections is one
        track that is referenced.

        One kind at a time (PREP-02): Collections by default, as every caller
        written before Sets existed meant, and Sets when asked, so the warning
        can state them as their own kind.
        """
        wanted = unique_ids(track_ids)
        if not wanted:
            return [], []

        nodes: set = set()
        tracks: set = set()
        connection = self._db.connect()
        for chunk in chunked(wanted):
            placeholders = ", ".join("?" for _ in chunk)
            for row in connection.execute(
                "SELECT DISTINCT ct.collection_id, ct.track_id"
                " FROM collection_tracks ct"
                " JOIN collections c ON c.id = ct.collection_id"
                f" WHERE c.kind = ? AND ct.track_id IN ({placeholders})",
                (kind, *chunk),
            ):
                nodes.add(int(row["collection_id"]))
                tracks.add(int(row["track_id"]))
        return sorted(nodes), sorted(tracks)

    # -------------------------------------------------------------- sets

    def set_details(self, set_id: int) -> Optional[SetDetails]:
        """Return a Set's details row, or ``None`` when the node is not a Set."""
        row = (
            self._db.connect()
            .execute(
                "SELECT collection_id, notes, created_at, updated_at"
                " FROM set_details WHERE collection_id = ?",
                (int(set_id),),
            )
            .fetchone()
        )
        return None if row is None else SetDetails.from_row(row)

    def chapters(self, set_id: int) -> List[SetChapter]:
        """Return a Set's chapters in their own order."""
        rows = (
            self._db.connect()
            .execute(
                f"{_SELECT_CHAPTER} WHERE collection_id = ? ORDER BY position, id",
                (int(set_id),),
            )
            .fetchall()
        )
        return [SetChapter.from_row(row) for row in rows]

    def entry_plans(self, set_id: int) -> List[SetEntryPlan]:
        """Return every entry's plan row, in the Set's own entry order."""
        rows = self._db.connect().execute(_SELECT_PLANS, (int(set_id),)).fetchall()
        return [SetEntryPlan.from_row(row) for row in rows]

    def acknowledgements(self, set_id: int) -> List[SetAcknowledgement]:
        """Return the transition warnings a Set's user has accepted, oldest first."""
        rows = (
            self._db.connect()
            .execute(
                f"{_SELECT_ACKNOWLEDGEMENTS} WHERE collection_id = ? ORDER BY id",
                (int(set_id),),
            )
            .fetchall()
        )
        return [SetAcknowledgement.from_row(row) for row in rows]

    def duplicate_set(self, set_id: int, name: str) -> Optional[Collection]:
        """Copy a Set whole, under a new name, beside the original.

        How last week's set becomes this week's (PREP-02): the chapters with
        their names, notes and targets, the entries in order with their repeats,
        each entry's chapter, times and note, the Set's notes, and every
        acknowledged warning, pointed at the new entries. An acknowledgement
        keeps the moment it was made, because the user did accept that
        transition then; everything else is new now.

        One transaction, so a copy is whole or absent. Positions are written
        from 0, so the copy is contiguous whatever the original was.

        Returns:
            The new Set, or ``None`` if there is no Set with that id.
        """
        set_id = int(set_id)
        with self._db.transaction(join_existing=True) as conn:
            source = self.get(set_id)
            details = self.set_details(set_id)
            if source is None or not source.is_set or details is None:
                return None

            copy = Collection(name=name, kind=KIND_SET, parent_id=source.parent_id)
            self._insert_node(conn, copy)
            copy_id = int(copy.id or 0)
            now = utc_now_iso()
            self._insert_details(conn, copy_id, details.notes, now)

            chapters: Dict[int, int] = {}
            for index, chapter in enumerate(self.chapters(set_id)):
                cursor = conn.execute(
                    "INSERT INTO set_chapters"
                    " (collection_id, position, name, notes, target_seconds,"
                    "  bpm_min, bpm_max, created_at, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        copy_id,
                        index,
                        chapter.name,
                        chapter.notes,
                        chapter.target_seconds,
                        chapter.bpm_min,
                        chapter.bpm_max,
                        now,
                        now,
                    ),
                )
                chapters[int(chapter.id or 0)] = int(cursor.lastrowid or 0)

            plans = {plan.entry_id: plan for plan in self.entry_plans(set_id)}
            entries: Dict[int, int] = {}
            for index, entry in enumerate(self.entries(set_id)):
                plan = plans.get(int(entry.id or 0))
                if plan is None:
                    raise SetIntegrityError(
                        f"Entry {entry.id} of Set {set_id} has no chapter"
                    )
                cursor = conn.execute(
                    "INSERT INTO collection_tracks"
                    " (collection_id, track_id, position, added_at)"
                    " VALUES (?, ?, ?, ?)",
                    (copy_id, entry.track_id, index, now),
                )
                copied = int(cursor.lastrowid or 0)
                entries[int(entry.id or 0)] = copied
                conn.execute(
                    "INSERT INTO set_entries"
                    " (entry_id, collection_id, chapter_id, in_seconds,"
                    "  out_seconds, note) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        copied,
                        copy_id,
                        chapters[plan.chapter_id],
                        plan.in_seconds,
                        plan.out_seconds,
                        plan.note,
                    ),
                )

            conn.executemany(
                "INSERT INTO set_acknowledgements"
                " (collection_id, from_entry_id, to_entry_id, warning,"
                "  compared_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (
                        copy_id,
                        entries[ack.from_entry_id],
                        entries[ack.to_entry_id],
                        ack.warning,
                        ack.compared_json,
                        ack.created_at,
                    )
                    for ack in self.acknowledgements(set_id)
                ],
            )
            self._check_set(conn, copy_id)
        return self.get(copy_id)

    # --------------------------------------------------------------- helpers

    @classmethod
    def _insert_node(cls, conn, node: Collection) -> None:
        """Insert one ``collections`` row at the end of its parent's children.

        Fills in the node's id, position and depth.
        """
        now = utc_now_iso()
        depth = cls._depth_for(conn, node.parent_id)
        position = cls._next_position(conn, node.parent_id)
        cursor = conn.execute(
            "INSERT INTO collections"
            " (parent_id, kind, name, position, depth, rules_json, sort_field,"
            "  sort_dir, frozen_from_id, frozen_at, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                node.parent_id,
                node.kind,
                normalize_collection_name(node.name),
                position,
                depth,
                node.rules_json,
                node.sort_field,
                node.sort_dir,
                node.frozen_from_id,
                node.frozen_at,
                node.created_at or now,
                now,
            ),
        )
        node.id = int(cursor.lastrowid or 0)
        node.position = position
        node.depth = depth

    @staticmethod
    def _insert_details(conn, set_id: int, notes: Optional[str], now: str) -> None:
        """Write the row that makes a node a Set; the database fills its kind."""
        conn.execute(
            "INSERT INTO set_details (collection_id, notes, created_at, updated_at)"
            " VALUES (?, ?, ?, ?)",
            (set_id, notes, now, now),
        )

    @staticmethod
    def _kind_of(conn, node_id: int) -> Optional[str]:
        """Return a node's kind, or ``None`` when there is no such node."""
        row = conn.execute(
            "SELECT kind FROM collections WHERE id = ?", (int(node_id),)
        ).fetchone()
        return None if row is None else str(row["kind"])

    def _append(self, collection_id: int, track_ids: Sequence[int]) -> None:
        """Append entries in the order given; plan them if the node is a Set.

        The one place new entries are appended, for :meth:`add` and
        :meth:`append`. Into a Set they join its last chapter, after the limit
        has been checked and before anything is written.
        """
        now = utc_now_iso()
        with self._db.transaction(join_existing=True) as conn:
            is_set = self._kind_of(conn, collection_id) == KIND_SET
            if is_set:
                self._check_room(conn, collection_id, len(track_ids))
            start = self._next_entry_position(conn, collection_id)
            conn.executemany(
                "INSERT INTO collection_tracks"
                " (collection_id, track_id, position, added_at) VALUES (?, ?, ?, ?)",
                [
                    (collection_id, int(track_id), start + offset, now)
                    for offset, track_id in enumerate(track_ids)
                ],
            )
            if not is_set:
                return
            last = conn.execute(
                "SELECT id FROM set_chapters WHERE collection_id = ?"
                " ORDER BY position DESC, id DESC LIMIT 1",
                (collection_id,),
            ).fetchone()
            if last is None:
                raise SetIntegrityError(f"Set {collection_id} has no chapter")
            # The new rows are exactly those at or past ``start``: the positions
            # before them were contiguous, and nothing else has written since.
            conn.execute(
                "INSERT INTO set_entries (entry_id, collection_id, chapter_id)"
                " SELECT id, collection_id, ? FROM collection_tracks"
                " WHERE collection_id = ? AND position >= ?",
                (int(last["id"]), collection_id, start),
            )
            self._check_set(conn, collection_id)

    @staticmethod
    def _check_room(conn, set_id: int, adding: int) -> None:
        """Refuse entries that would take a Set past its limit.

        Raises:
            SetLimitError: If they would, naming the Set and the numbers.
        """
        row = conn.execute(
            "SELECT c.name AS name, (SELECT count(*) FROM collection_tracks ct"
            "  WHERE ct.collection_id = c.id) AS n"
            " FROM collections c WHERE c.id = ?",
            (int(set_id),),
        ).fetchone()
        holding = int(row["n"]) if row is not None else 0
        if holding + int(adding) > MAX_SET_ENTRIES:
            name = str(row["name"]) if row is not None else f"Set {set_id}"
            raise SetLimitError(name, holding, int(adding))

    @staticmethod
    def _neighbour_chapter(conn, set_id: int, entry_id: int, position: int):
        """The chapter of the entry at ``position`` other than ``entry_id``."""
        if position < 0:
            return None
        return conn.execute(
            "SELECT ch.id, ch.position, ch.name FROM collection_tracks ct"
            " JOIN set_entries se ON se.entry_id = ct.id"
            " JOIN set_chapters ch ON ch.id = se.chapter_id"
            " WHERE ct.collection_id = ? AND ct.position = ? AND ct.id != ?",
            (set_id, position, entry_id),
        ).fetchone()

    def _chapter_for_slot(
        self,
        conn,
        set_id: int,
        entry_id: int,
        position: int,
        named: Optional[int],
        keep: Optional[int] = None,
    ) -> int:
        """Return the chapter an entry now at ``position`` belongs in.

        A chapter *reaches* a position when it is at or after the chapter of
        the entry before, and at or before the chapter of the entry after.

        - A chapter the caller **named** is used, once it is known to be this
          Set's and to reach the position.
        - A moved entry **keeps** its chapter when that still reaches the new
          position, so reordering within a chapter, even to its first place,
          never moves an entry into the chapter before.
        - Otherwise the entry before decides, or the first chapter at position
          0 (the module docstring's rule).

        Raises:
            ValueError: If the named chapter is another Set's or does not reach
                the position.
            SetIntegrityError: If the Set has no chapter at all.
        """
        before = self._neighbour_chapter(conn, set_id, entry_id, position - 1)
        if named is None and keep is not None:
            current = conn.execute(
                "SELECT position FROM set_chapters WHERE id = ?", (int(keep),)
            ).fetchone()
            after = self._neighbour_chapter(conn, set_id, entry_id, position + 1)
            if current is not None and _reaches(current, before, after):
                return int(keep)
        if named is None:
            if before is not None:
                return int(before["id"])
            first = conn.execute(
                "SELECT id FROM set_chapters WHERE collection_id = ?"
                " ORDER BY position, id LIMIT 1",
                (set_id,),
            ).fetchone()
            if first is None:
                raise SetIntegrityError(f"Set {set_id} has no chapter")
            return int(first["id"])

        chapter = conn.execute(
            "SELECT id, position, name FROM set_chapters"
            " WHERE id = ? AND collection_id = ?",
            (int(named), set_id),
        ).fetchone()
        if chapter is None:
            raise ValueError(f"Chapter {named} is not a chapter of this Set")
        after = self._neighbour_chapter(conn, set_id, entry_id, position + 1)
        if not _reaches(chapter, before, after):
            too_early = before is not None and chapter["position"] < before["position"]
            neighbour = before if too_early else after
            raise ValueError(
                f"{_chapter_label(chapter)} does not reach position {position + 1}: "
                f"the entry {'before' if too_early else 'after'} it is in "
                f"{_chapter_label(neighbour)}, and a chapter's entries stay "
                "together"
            )
        return int(chapter["id"])

    @staticmethod
    def _check_set(conn, set_id: int) -> None:
        """Hold DEC-103 after a write: chapters exist, entries planned, in order.

        Raises:
            SetIntegrityError: If the write broke any of the three. The caller's
                transaction rolls back.
        """
        row = conn.execute(
            "SELECT"
            " (SELECT count(*) FROM set_chapters WHERE collection_id = :set)"
            "   AS chapters,"
            " (SELECT count(*) FROM collection_tracks ct"
            "   WHERE ct.collection_id = :set AND NOT EXISTS"
            "   (SELECT 1 FROM set_entries se WHERE se.entry_id = ct.id))"
            "   AS unplanned,"
            " (SELECT count(*) FROM ("
            "   SELECT ch.position AS here,"
            "    lag(ch.position) OVER (ORDER BY ct.position, ct.id) AS before"
            "   FROM collection_tracks ct"
            "   JOIN set_entries se ON se.entry_id = ct.id"
            "   JOIN set_chapters ch ON ch.id = se.chapter_id"
            "   WHERE ct.collection_id = :set"
            " ) WHERE here < before) AS backwards",
            {"set": int(set_id)},
        ).fetchone()
        if not int(row["chapters"]):
            raise SetIntegrityError(f"Set {set_id} has no chapter")
        if int(row["unplanned"]):
            raise SetIntegrityError(
                f"{row['unplanned']} entries of Set {set_id} have no chapter"
            )
        if int(row["backwards"]):
            raise SetIntegrityError(
                f"Set {set_id}'s chapters are out of order in its entries"
            )

    def _update(self, node_id: int, values: Dict[str, object]) -> Optional[Collection]:
        """Write named columns on one node and return it.

        Column names come from this module's own calls; values are bound.
        """
        node_id = int(node_id)
        assignments = ", ".join(f"{column} = ?" for column in values)
        with self._db.transaction(join_existing=True) as conn:
            cursor = conn.execute(
                f"UPDATE collections SET {assignments}, updated_at = ? WHERE id = ?",
                (*values.values(), utc_now_iso(), node_id),
            )
            if not cursor.rowcount:
                return None
        return self.get(node_id)

    @staticmethod
    def _depth_for(conn, parent_id: Optional[int]) -> int:
        """Return the depth a child of this parent would sit at."""
        if parent_id is None:
            return 0
        row = conn.execute(
            "SELECT depth FROM collections WHERE id = ?", (int(parent_id),)
        ).fetchone()
        return 0 if row is None else int(row["depth"]) + 1

    @staticmethod
    def _next_position(
        conn, parent_id: Optional[int], excluding: Optional[int] = None
    ) -> int:
        """Return the position one past the last child of this parent."""
        sql = "SELECT count(*) AS n FROM collections WHERE parent_id IS ?"
        params: Tuple[object, ...] = (parent_id,)
        if excluding is not None:
            sql += " AND id != ?"
            params = (*params, int(excluding))
        row = conn.execute(sql, params).fetchone()
        return int(row["n"]) if row is not None else 0

    @staticmethod
    def _next_entry_position(conn, collection_id: int) -> int:
        """Return the position one past a Collection's last entry."""
        row = conn.execute(
            "SELECT count(*) AS n FROM collection_tracks WHERE collection_id = ?",
            (int(collection_id),),
        ).fetchone()
        return int(row["n"]) if row is not None else 0

    @staticmethod
    def _close_gap(conn, parent_id: Optional[int]) -> None:
        """Renumber a parent's children so their positions are contiguous.

        The same join as :meth:`_renumber_entries`, for the same reason. A
        folder's children are a list a person made and will never be fifty
        thousand long, so this one is not slow today — but a statement whose
        cost is quadratic in its input is left alone only until something
        hands it a bigger input, and having one of each shape in one file is
        how the wrong one gets copied next.
        """
        conn.execute(
            "WITH ordered AS ("
            "  SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS rn"
            "  FROM collections WHERE parent_id IS ?"
            ")"
            " UPDATE collections SET position = ordered.rn"
            " FROM ordered WHERE ordered.id = collections.id",
            (parent_id,),
        )

    @staticmethod
    def _open_gap(conn, parent_id: Optional[int], position: int) -> None:
        """Make room at ``position`` among a parent's children."""
        conn.execute(
            "UPDATE collections SET position = position + 1"
            " WHERE parent_id IS ? AND position >= ?",
            (parent_id, int(position)),
        )

    @staticmethod
    def _shift_siblings(
        conn, parent_id: Optional[int], current: int, target: int, node_id: int
    ) -> None:
        """Move one node within its sibling list by shifting the range it crosses."""
        row = conn.execute(
            "SELECT count(*) AS n FROM collections WHERE parent_id IS ?", (parent_id,)
        ).fetchone()
        end = (int(row["n"]) if row is not None else 1) - 1
        target = max(0, min(int(target), end))
        if target == current:
            return

        if target > current:
            conn.execute(
                "UPDATE collections SET position = position - 1"
                " WHERE parent_id IS ? AND position > ? AND position <= ?",
                (parent_id, current, target),
            )
        else:
            conn.execute(
                "UPDATE collections SET position = position + 1"
                " WHERE parent_id IS ? AND position >= ? AND position < ?",
                (parent_id, target, current),
            )
        conn.execute(
            "UPDATE collections SET position = ? WHERE id = ?", (target, node_id)
        )

    @staticmethod
    def _renumber_entries(conn, collection_id: int) -> None:
        """Close every gap in a Collection's entry positions, in one statement.

        The one operation that cannot be arithmetic: removing several entries
        opens several holes at once, and a Python loop over five thousand rows
        would be five thousand statements.

        ``UPDATE ... FROM`` rather than a scalar subquery per row, which is a
        correctness matter at scale rather than a preference. The subquery form
        is correlated, so SQLite rebuilds the numbering for *every* row it
        updates: 2,000 entries took 1.24 s, 10,000 took 30.9 s, and 20,000 took
        123 s — quadratic, which put a 50,000-entry Collection at about a
        quarter of an hour for one call. The joined form builds the numbering
        once and reads it: the same three sizes are 3.5 ms, 18.1 ms and 37.0 ms.
        Found by ORG-07, which removes entries a thousand at a time and was the
        first thing to ask this of a Collection that big.
        """
        conn.execute(
            "WITH ordered AS ("
            "  SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS rn"
            "  FROM collection_tracks WHERE collection_id = ?"
            ")"
            " UPDATE collection_tracks SET position = ordered.rn"
            " FROM ordered WHERE ordered.id = collection_tracks.id",
            (int(collection_id),),
        )


def _reaches(chapter, before, after) -> bool:
    """True when ``chapter`` may hold an entry between these two neighbours.

    Each argument is a row with a chapter ``position``; a missing neighbour
    (the top or the end of the Set) bounds nothing.
    """
    here = int(chapter["position"])
    return (before is None or here >= int(before["position"])) and (
        after is None or here <= int(after["position"])
    )


def _chapter_label(row) -> str:
    """How a refusal names a chapter: its name, or its place when unnamed."""
    name = str(row["name"] or "")
    return repr(name) if name else f"chapter {int(row['position']) + 1}"


__all__: Sequence[str] = ("CollectionRepository",)
