#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Collections, folders and Smart Collections (ORG-01).

One type for all three, discriminated by ``kind`` — the same shape
``RekordboxPlaylist`` uses for its mirrored tree, on purpose: DEC-059 files
Collections in folders from day one, and one pane component is meant to render
both trees.

The resemblance stops at the shape. That tree is a **mirror**, rebuilt from the
XML on every import and read-only by DEC-031. This one is the user's, edited in
place, and rebuilt by nothing. Two types rather than one shared table because a
user edit landing in a table the next import overwrites is the single worst bug
this area could have.

The three kinds
---------------
- ``folder`` holds other nodes and no tracks.
- ``collection`` holds tracks, in an order the user chose, and may hold the
  same track more than once (DEC-058).
- ``smart`` holds a saved rule set and **no membership at all**: DEC-061
  evaluates it live, every time, so there is nothing stored to go stale.

Why a Collection is ordered, and may repeat a track
---------------------------------------------------
DEC-058 chose consistency with DEC-017's rule for Sets: a DJ who can repeat a
track in a Set and not in a Collection has to learn a rule with no reason
behind it. Ordering is not optional either way, because Phase 8 exports a
Collection into a Rekordbox playlist, which is ordered.

The consequence is in :class:`CollectionEntry`: membership is a row with its own
id, not a ``(collection, track)`` pair. "Remove the track" is not a well-formed
request when the track is in there twice; "remove this entry" always is.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from cuepoint.models.library_track import utc_now_iso

#: A node that holds other nodes.
KIND_FOLDER = "folder"

#: A node that holds an ordered list of tracks.
KIND_COLLECTION = "collection"

#: A node that holds a rule set and evaluates it live (DEC-061).
KIND_SMART = "smart"

KINDS = (KIND_FOLDER, KIND_COLLECTION, KIND_SMART)

#: A name is a label in a tree, not a description.
MAX_COLLECTION_NAME_LENGTH = 120

#: How deep the tree may go. Deliberately generous — a DJ's filing is nobody
#: else's business — but bounded, because an unbounded depth is an unbounded
#: recursion in every reader of the tree.
MAX_COLLECTION_DEPTH = 8


@dataclass
class Collection:
    """One folder, Collection or Smart Collection in CuePoint's own tree.

    Attributes:
        name: What the user called it, trimmed.
        kind: One of :data:`KINDS`.
        position: Index among siblings, from 0. Order in a tree is data.
        depth: Distance from the top, from 0. Stored rather than derived so the
            pane can indent without walking parents, exactly as the mirrored
            tree does.
        parent_id: The containing folder, or ``None`` at the top.
        id: Database primary key; ``None`` until persisted.
        rules_json: The saved rule set, for a Smart Collection only. Stored as
            the serialized DEC-043 rule set — the same structure the Library
            filter bar holds unsaved.
        sort_field: The sort a Smart Collection was saved with, or ``None``.
        sort_dir: Its direction, or ``None``.
        frozen_from_id: The Smart Collection this Collection was frozen from,
            if it was (DEC-061). A record of what happened, not a live link:
            the source may be gone, and this stays true.
        frozen_at: When that freeze happened.
        created_at: When the node was made.
        updated_at: When it last changed.
    """

    name: str
    kind: str
    position: int = 0
    depth: int = 0
    parent_id: Optional[int] = None
    id: Optional[int] = None
    rules_json: Optional[str] = None
    sort_field: Optional[str] = None
    sort_dir: Optional[str] = None
    frozen_from_id: Optional[int] = None
    frozen_at: Optional[str] = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Normalize and validate the node and its coordinates."""
        if self.kind not in KINDS:
            raise ValueError(f"kind must be one of {KINDS}, got {self.kind!r}")

        self.name = normalize_collection_name(self.name)
        self.position = _non_negative(self.position, "position")
        self.depth = _non_negative(self.depth, "depth")
        if self.depth > MAX_COLLECTION_DEPTH:
            raise ValueError(
                f"A collection tree may be at most {MAX_COLLECTION_DEPTH} deep, "
                f"got {self.depth}"
            )

        # Two invariants are worth holding here, and a third is deliberately
        # not. A smart node without rules is not a smart node; a folder with
        # rules is a folder pretending to be one. But a *collection* carrying
        # rules is left legal, because a frozen Collection remembering the
        # rules it came from is a plausible thing to want, and this is the
        # layer where that can change — which is exactly why m0009 did not
        # write it into a CHECK constraint it could never drop.
        if self.kind == KIND_SMART and not self.rules_json:
            raise ValueError("A smart collection needs a rule set")
        if self.kind == KIND_FOLDER and self.rules_json:
            raise ValueError("A folder cannot hold a rule set")

    @property
    def is_folder(self) -> bool:
        """True when this node holds other nodes."""
        return self.kind == KIND_FOLDER

    @property
    def is_smart(self) -> bool:
        """True when membership is a rule set evaluated live (DEC-061)."""
        return self.kind == KIND_SMART

    @property
    def holds_tracks(self) -> bool:
        """True when membership is stored rows this node owns.

        False for a folder (it holds nodes) and for a smart collection (it
        holds a question). The one property every membership operation should
        be asking about, rather than testing ``kind`` in five places.
        """
        return self.kind == KIND_COLLECTION

    @property
    def was_frozen(self) -> bool:
        """True when this Collection came from freezing a Smart Collection."""
        return self.frozen_from_id is not None

    def touch(self) -> None:
        """Mark the node as updated now."""
        self.updated_at = utc_now_iso()

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "parent_id": self.parent_id,
            "kind": self.kind,
            "name": self.name,
            "position": self.position,
            "depth": self.depth,
            "rules_json": self.rules_json,
            "sort_field": self.sort_field,
            "sort_dir": self.sort_dir,
            "frozen_from_id": self.frozen_from_id,
            "frozen_at": self.frozen_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "Collection":
        """Build a node from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            parent_id=data.get("parent_id"),
            kind=data["kind"],
            name=data.get("name") or "",
            position=int(data.get("position") or 0),
            depth=int(data.get("depth") or 0),
            rules_json=data.get("rules_json"),
            sort_field=data.get("sort_field"),
            sort_dir=data.get("sort_dir"),
            frozen_from_id=data.get("frozen_from_id"),
            frozen_at=data.get("frozen_at"),
            created_at=data.get("created_at") or utc_now_iso(),
            updated_at=data.get("updated_at") or utc_now_iso(),
        )


@dataclass
class CollectionEntry:
    """One track's place in one Collection.

    A row with its own identity rather than a ``(collection, track)`` pair,
    because DEC-058 lets a track appear in a Collection twice. Everything that
    removes or moves membership addresses :attr:`id`; nothing addresses a track.

    Attributes:
        collection_id: The Collection this entry belongs to.
        track_id: The library track it points at.
        position: Index within the Collection, from 0. Contiguity is the
            repository's responsibility (ORG-04), not a database constraint —
            ``m0009_organization`` explains why the index is not unique.
        id: Database primary key; ``None`` until persisted.
        added_at: When the track was put here.
    """

    collection_id: int
    track_id: int
    position: int = 0
    id: Optional[int] = None
    added_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Normalize and validate the coordinates."""
        self.collection_id = int(self.collection_id)
        self.track_id = int(self.track_id)
        self.position = _non_negative(self.position, "position")

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "collection_id": self.collection_id,
            "track_id": self.track_id,
            "position": self.position,
            "added_at": self.added_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "CollectionEntry":
        """Build an entry from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            collection_id=int(data["collection_id"]),
            track_id=int(data["track_id"]),
            position=int(data.get("position") or 0),
            added_at=data.get("added_at") or utc_now_iso(),
        )


def _non_negative(value: Any, name: str) -> int:
    """Return a whole, non-negative coordinate.

    Raises:
        ValueError: If it is neither.
    """
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a number, got {value!r}")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number, got {value!r}") from None
    if number < 0:
        raise ValueError(f"{name} cannot be negative: {number}")
    return number


def normalize_collection_name(value: Any) -> str:
    """Return a usable node name.

    Raises:
        ValueError: If the name is empty or too long. An unnamed node in a tree
            is a row the user cannot point at.
    """
    name = "" if value is None else str(value).strip()
    if not name:
        raise ValueError("A collection needs a name")
    if len(name) > MAX_COLLECTION_NAME_LENGTH:
        raise ValueError(
            f"A collection name may be at most {MAX_COLLECTION_NAME_LENGTH} "
            f"characters, got {len(name)}"
        )
    return name


@dataclass(frozen=True)
class AddResult:
    """What adding a set of tracks to a Collection actually did (DEC-058).

    ``add`` appends the tracks that are not already there and skips the ones
    that are, so the two numbers differ whenever a user drops a selection that
    overlaps what the Collection already holds. Both are reported, because
    "added 40 tracks (12 were already here)" is a different sentence from
    "added 52 tracks", and only one of them is true.

    A deliberate duplicate is made with ``insert_at``, not by calling this twice.

    Attributes:
        added_track_ids: The tracks that were appended, in the order given.
        skipped_track_ids: The tracks already in the Collection, left alone.
    """

    added_track_ids: Tuple[int, ...] = ()
    skipped_track_ids: Tuple[int, ...] = ()

    @property
    def added(self) -> int:
        """How many tracks were appended."""
        return len(self.added_track_ids)

    @property
    def skipped(self) -> int:
        """How many were already there."""
        return len(self.skipped_track_ids)


@dataclass(frozen=True)
class SubtreeSummary:
    """What deleting a node would take with it (ORG-04, for ORG-09's confirm).

    A folder delete cascades, and a confirmation that cannot say what it is
    about to destroy is a confirmation nobody can give meaningfully. So the
    service answers this *before* the delete, and the dialog reads it out.

    The node itself is counted here along with its descendants: "delete this
    folder — 3 folders, 11 Collections and 1,204 entries" includes the folder
    being deleted, which is what a person reading the sentence expects.

    Attributes:
        folders: Folder nodes that would go.
        collections: Collections that would go.
        smart_collections: Smart Collections that would go.
        entries: Membership rows across all of them. Tracks are never counted
            here, because no track is deleted by any of this.
    """

    folders: int = 0
    collections: int = 0
    smart_collections: int = 0
    entries: int = 0

    @property
    def nodes(self) -> int:
        """Every node that would be removed."""
        return self.folders + self.collections + self.smart_collections

    @property
    def is_empty(self) -> bool:
        """True when there is nothing to warn about."""
        return self.nodes == 0 and self.entries == 0
