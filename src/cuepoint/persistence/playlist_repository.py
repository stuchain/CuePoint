#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Playlist repository: SQL for the mirrored Rekordbox playlist tree.

DEC-031 makes these tables read-only source data. This repository exposes no
rename, no move, no add-track and no remove-track — only :meth:`replace_tree`,
which rewrites the whole mirror from an export, and reads. The absence is the
enforcement: a Phase 6 Collection that a user can edit is a different concept in
different tables, and an edit that landed here would be silently destroyed by
the next refresh. ``tests/unit/persistence/test_playlist_read_only.py`` fails if
a mutating method appears.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from cuepoint.models.rekordbox_playlist import (
    KIND_PLAYLIST,
    PlaylistTreeWriteResult,
    RekordboxPlaylist,
)
from cuepoint.services.interfaces import IDatabaseService, IPlaylistRepository

_NODE_COLUMNS = (
    "parent_id",
    "name",
    "kind",
    "depth",
    "position",
    "rekordbox_path",
    "parent_path",
    "track_count",
)

_INSERT_NODE_SQL = (
    f"INSERT INTO rekordbox_playlists ({', '.join(_NODE_COLUMNS)}) "
    f"VALUES ({', '.join('?' for _ in _NODE_COLUMNS)})"
)

_INSERT_ENTRY_SQL = (
    "INSERT INTO rekordbox_playlist_tracks (playlist_id, track_id, position) "
    "VALUES (?, ?, ?)"
)

_SELECT_NODES = "SELECT * FROM rekordbox_playlists"

# Sibling order is data (DEC-031), so every listing is ordered by it rather than
# by insertion or by name.
_TREE_ORDER = "ORDER BY depth, position, id"


class PlaylistRepository(IPlaylistRepository):
    """Reads the mirrored Rekordbox playlist tree, and replaces it wholesale."""

    def __init__(self, database_service: IDatabaseService) -> None:
        self._db = database_service

    # ------------------------------------------------------------------ write

    def replace_tree(
        self, nodes: Iterable[RekordboxPlaylist]
    ) -> PlaylistTreeWriteResult:
        """Replace the entire mirror with ``nodes``, in one transaction.

        Replace rather than merge, because that is what a mirror is: the export
        is the truth, and a node that has vanished from it must vanish here. One
        transaction means a failed import leaves the previous tree intact rather
        than half of a new one.

        ``nodes`` must arrive parents-first — the contract
        :func:`~cuepoint.data.rekordbox.iter_playlist_nodes` guarantees — because
        a child's ``parent_id`` is resolved from the last node seen one level
        up. Resolution is by ``depth``, deliberately not by matching
        ``parent_path``: a playlist name may contain the path separator (a real
        export has ``COZMO_11/02``), so paths are neither reliably splittable
        nor guaranteed unique.

        Track references are resolved against the library in one pass rather
        than a query per entry — at the 50,000-track target a playlist tree
        holds hundreds of thousands of references, and a lookup each would turn
        an import into a scan storm. A reference naming a track the library does
        not hold is skipped and counted, never inserted: the foreign key would
        reject it, and one stale reference must not fail a whole import.

        Returns:
            A :class:`PlaylistTreeWriteResult` with what was written and what
            was skipped.

        Raises:
            ValueError: If a node arrives before its parent, which would mean
                the tree could not be rebuilt faithfully.
        """
        materialized = list(nodes)
        track_ids_by_rekordbox_id = self._track_id_map()

        folders = 0
        playlists = 0
        entries = 0
        missing: List[str] = []

        with self._db.transaction() as conn:
            # Membership first: it references the nodes.
            conn.execute("DELETE FROM rekordbox_playlist_tracks")
            conn.execute("DELETE FROM rekordbox_playlists")

            # depth -> id of the most recent node seen at that depth, which is
            # the parent of the next node one level deeper.
            parent_at_depth: Dict[int, int] = {}

            for node in materialized:
                parent_id: Optional[int] = None
                if node.depth > 0:
                    parent_id = parent_at_depth.get(node.depth - 1)
                    if parent_id is None:
                        raise ValueError(
                            f"playlist node {node.rekordbox_path!r} arrived at depth "
                            f"{node.depth} before any node at depth {node.depth - 1}; "
                            "nodes must be supplied parents-first"
                        )

                resolved: List[int] = []
                if node.kind == KIND_PLAYLIST:
                    for ref in node.track_refs:
                        track_id = track_ids_by_rekordbox_id.get(ref)
                        if track_id is None:
                            missing.append(ref)
                        else:
                            resolved.append(track_id)

                cursor = conn.execute(
                    _INSERT_NODE_SQL,
                    (
                        parent_id,
                        node.name,
                        node.kind,
                        node.depth,
                        node.position,
                        node.rekordbox_path,
                        node.parent_path,
                        len(resolved),
                    ),
                )
                node_id = int(cursor.lastrowid or 0)
                node.id = node_id
                node.parent_id = parent_id
                parent_at_depth[node.depth] = node_id
                # Anything deeper belonged to a subtree that has now ended, and
                # must not be mistaken for a parent of a later node.
                for deeper in [d for d in parent_at_depth if d > node.depth]:
                    del parent_at_depth[deeper]

                if node.kind == KIND_PLAYLIST:
                    if resolved:
                        conn.executemany(
                            _INSERT_ENTRY_SQL,
                            [
                                (node_id, track_id, position)
                                for position, track_id in enumerate(resolved)
                            ],
                        )
                        entries += len(resolved)
                    playlists += 1
                else:
                    folders += 1

        return PlaylistTreeWriteResult(
            folders=folders,
            playlists=playlists,
            entries=entries,
            missing_track_refs=tuple(missing),
        )

    def clear(self) -> None:
        """Remove the whole mirror. Used when a library is reset."""
        with self._db.transaction() as conn:
            conn.execute("DELETE FROM rekordbox_playlist_tracks")
            conn.execute("DELETE FROM rekordbox_playlists")

    # ------------------------------------------------------------------- read

    def _track_id_map(self) -> Dict[str, int]:
        """Map every Rekordbox TrackID in the library to its primary key."""
        rows = self._db.connect().execute("SELECT id, rekordbox_track_id FROM tracks")
        return {str(row["rekordbox_track_id"]): int(row["id"]) for row in rows}

    def get(self, playlist_id: int) -> Optional[RekordboxPlaylist]:
        """Return a node by primary key, or None."""
        row = (
            self._db.connect()
            .execute(f"{_SELECT_NODES} WHERE id = ?", (playlist_id,))
            .fetchone()
        )
        return RekordboxPlaylist.from_row(row) if row is not None else None

    def find_by_path(self, rekordbox_path: str) -> Optional[RekordboxPlaylist]:
        """Return the node at this path, or None.

        The path is not unique by construction, so the lowest id wins
        deterministically rather than leaving the choice to SQLite's row order.
        Callers that need certainty should walk the tree by ``parent_id``.
        """
        if not rekordbox_path:
            return None
        row = (
            self._db.connect()
            .execute(
                f"{_SELECT_NODES} WHERE rekordbox_path = ? ORDER BY id LIMIT 1",
                (rekordbox_path,),
            )
            .fetchone()
        )
        return RekordboxPlaylist.from_row(row) if row is not None else None

    def list_all(self) -> List[RekordboxPlaylist]:
        """Return every node, parents before children, siblings in order."""
        rows = self._db.connect().execute(f"{_SELECT_NODES} {_TREE_ORDER}").fetchall()
        return [RekordboxPlaylist.from_row(row) for row in rows]

    def children_of(self, playlist_id: Optional[int]) -> List[RekordboxPlaylist]:
        """Return the direct children of a node, or the roots for ``None``."""
        connection = self._db.connect()
        if playlist_id is None:
            rows = connection.execute(
                f"{_SELECT_NODES} WHERE parent_id IS NULL ORDER BY position, id"
            ).fetchall()
        else:
            rows = connection.execute(
                f"{_SELECT_NODES} WHERE parent_id = ? ORDER BY position, id",
                (playlist_id,),
            ).fetchall()
        return [RekordboxPlaylist.from_row(row) for row in rows]

    def track_ids_for(self, playlist_id: int) -> List[int]:
        """Return the library track ids in a playlist, in Rekordbox's order."""
        rows = (
            self._db.connect()
            .execute(
                "SELECT track_id FROM rekordbox_playlist_tracks "
                "WHERE playlist_id = ? ORDER BY position",
                (playlist_id,),
            )
            .fetchall()
        )
        return [int(row["track_id"]) for row in rows]

    def playlist_ids_for_track(self, track_id: int) -> List[int]:
        """Return the playlists a track appears in, lowest id first.

        The reverse lookup Phase 4's inspector wants, and the reason
        ``rekordbox_playlist_tracks`` carries an index on ``track_id``.
        """
        rows = (
            self._db.connect()
            .execute(
                "SELECT DISTINCT playlist_id FROM rekordbox_playlist_tracks "
                "WHERE track_id = ? ORDER BY playlist_id",
                (track_id,),
            )
            .fetchall()
        )
        return [int(row["playlist_id"]) for row in rows]

    def count(self) -> int:
        """Return the number of nodes, folders included."""
        row = (
            self._db.connect()
            .execute("SELECT count(*) AS n FROM rekordbox_playlists")
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0

    def count_entries(self) -> int:
        """Return the number of stored track references across all playlists."""
        row = (
            self._db.connect()
            .execute("SELECT count(*) AS n FROM rekordbox_playlist_tracks")
            .fetchone()
        )
        return int(row["n"]) if row is not None else 0
