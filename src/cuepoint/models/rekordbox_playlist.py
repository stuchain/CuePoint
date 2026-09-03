#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
A node in the mirrored Rekordbox playlist tree.

``RekordboxPlaylist`` is named for whose playlist it is, deliberately. DEC-031
mirrors Rekordbox's tree as **read-only source data**, refreshed with the
collection; DEC-006's Collections in Phase 6 are CuePoint's own, editable, and
live in their own tables. Two types called ``Playlist`` would invite exactly the
confusion that matters most here — a user edit landing in a table the next
import overwrites.

It is also not :class:`cuepoint.models.playlist.Playlist`, which is the
ephemeral per-run object the matching pipeline builds out of an XML file and
throws away, the same distinction ``LibraryTrack`` draws against ``Track``.

Identity in the tree
--------------------
``depth`` plus yield order is what locates a node, not its path. A playlist name
may contain the path separator — one real export has ``stoa w/ deer`` and
``COZMO_11/02`` — so ``rekordbox_path`` cannot always be split back into
segments, and two different trees can produce the same path string.
``rekordbox_path`` is therefore a derived convenience value: it is what the CLI
and ``parse_playlist_tree()`` already speak, and it is fine for display and
lookup, but nothing structural may depend on it being unique or parseable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

#: A node that holds other nodes.
KIND_FOLDER = "folder"

#: A node that holds track references.
KIND_PLAYLIST = "playlist"

KINDS = (KIND_FOLDER, KIND_PLAYLIST)

#: Separator used to build ``rekordbox_path``. Matches ``parse_playlist_tree()``
#: so a path means the same thing everywhere in CuePoint, ambiguity included.
PATH_SEPARATOR = "/"


@dataclass
class RekordboxPlaylist:
    """One folder or playlist in the mirrored Rekordbox tree.

    Attributes:
        name: Node name as Rekordbox wrote it, trimmed of surrounding
            whitespace — a real export contains ``"peak "`` and ``"electro "``,
            and ``parse_playlist_tree()`` already trims, so paths agree across
            CuePoint.
        kind: :data:`KIND_FOLDER` or :data:`KIND_PLAYLIST`.
        depth: Distance from the top of the ``PLAYLISTS`` element; the ``ROOT``
            node Rekordbox always writes is depth 0. This is what resolves a
            child to its parent during import, because a path cannot be relied
            on to do it.
        position: Index among siblings, from 0, in document order. A DJ's
            playlist order is data, not presentation.
        rekordbox_path: Full path from the top, e.g.
            ``ROOT/GENRES/Afro House/afro house (25)``. Derived, and not
            guaranteed unique.
        parent_path: Path of the containing node; ``None`` at the top.
        track_count: Number of track references Rekordbox declared for a
            playlist; always 0 for a folder.
        track_refs: Rekordbox TrackIDs in playlist order. Populated by the
            parser and consumed by the repository, which stores membership in
            its own table; it is not part of the persisted row and comes back
            empty from :meth:`from_row`.
        id: Database primary key; ``None`` until persisted.
        parent_id: Database id of the containing node; ``None`` at the top.
    """

    name: str
    kind: str
    depth: int
    position: int
    rekordbox_path: str
    parent_path: Optional[str] = None
    track_count: int = 0
    track_refs: List[str] = field(default_factory=list)
    id: Optional[int] = None
    parent_id: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the discriminator and the tree coordinates."""
        if self.kind not in KINDS:
            raise ValueError(f"kind must be one of {KINDS}, got {self.kind!r}")

        self.name = str(self.name).strip()
        self.depth = int(self.depth)
        self.position = int(self.position)
        if self.depth < 0:
            raise ValueError(f"depth cannot be negative: {self.depth}")
        if self.position < 0:
            raise ValueError(f"position cannot be negative: {self.position}")

        if self.kind == KIND_FOLDER and self.track_refs:
            raise ValueError("a folder cannot hold track references")

        self.track_count = int(self.track_count)

    @property
    def is_folder(self) -> bool:
        """True when this node holds other nodes rather than tracks."""
        return self.kind == KIND_FOLDER

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row, without ``track_refs``.

        Membership is a table of its own, so a node's dict is deliberately not a
        complete description of a playlist. Including the refs here would make
        it easy to write one representation and read back the other.
        """
        return {
            "id": self.id,
            "parent_id": self.parent_id,
            "name": self.name,
            "kind": self.kind,
            "depth": self.depth,
            "position": self.position,
            "rekordbox_path": self.rekordbox_path,
            "parent_path": self.parent_path,
            "track_count": self.track_count,
        }

    @classmethod
    def from_row(cls, row: Any) -> "RekordboxPlaylist":
        """Build a node from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            parent_id=data.get("parent_id"),
            name=data.get("name") or "",
            kind=data["kind"],
            depth=int(data.get("depth") or 0),
            position=int(data.get("position") or 0),
            rekordbox_path=data.get("rekordbox_path") or "",
            parent_path=data.get("parent_path"),
            track_count=int(data.get("track_count") or 0),
        )


@dataclass(frozen=True)
class PlaylistTreeWriteResult:
    """What one rewrite of the mirrored tree actually wrote.

    Attributes:
        folders: Folder nodes stored.
        playlists: Playlist nodes stored.
        entries: Track references stored across every playlist.
        missing_track_refs: Rekordbox TrackIDs a playlist referenced that the
            library does not hold, in the order they were met and including
            repeats. Reported rather than stored: the foreign key would reject
            them, and one stale reference must not fail a whole import — but a
            mirror quietly holding fewer entries than the export is exactly the
            kind of thing the import should be able to say out loud.
    """

    folders: int = 0
    playlists: int = 0
    entries: int = 0
    missing_track_refs: Tuple[str, ...] = ()

    @property
    def nodes(self) -> int:
        """Total nodes written."""
        return self.folders + self.playlists

    @property
    def missing_count(self) -> int:
        """How many references named a track the library does not hold."""
        return len(self.missing_track_refs)


def build_path(parent_path: Optional[str], name: str) -> str:
    """Join a parent path and a node name the way CuePoint already does.

    Matches ``parse_playlist_tree()`` exactly, ambiguity included: a name
    containing the separator produces a path that cannot be split back apart.
    That is a property of the existing convention rather than something this
    function should quietly fix, because ``--playlist`` and
    ``resolve_playlist_key()`` depend on it meaning the same thing.
    """
    cleaned = str(name).strip()
    if not parent_path:
        return cleaned
    return f"{parent_path}{PATH_SEPARATOR}{cleaned}"
