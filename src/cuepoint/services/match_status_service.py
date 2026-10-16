#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The playlist list and the Save bar's count (G4 2.1, 2.2).

The numbers come from ``persistence/match_status_repository``; this service
adds what is not SQL: the way to each playlist through its folders, the tree
order the person sees in Rekordbox, and which playlist a running match job is
working on (only those it was started for).
"""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from cuepoint.models.match_status import (
    PlaylistNode,
    PlaylistStatus,
    PlaylistStatuses,
    RunningMatch,
    StatusCounts,
)
from cuepoint.services.interfaces import IMatchStatusRepository, IMatchStatusService

#: What joins a playlist's folders in its path.
PATH_SEPARATOR = " / "

KIND_PLAYLIST = "playlist"


class MatchStatusService(IMatchStatusService):
    """Reads where each playlist stands, and what is waiting to be saved."""

    def __init__(self, match_status_repository: IMatchStatusRepository) -> None:
        """Store the repository the numbers come from."""
        self._repository = match_status_repository

    def playlists(
        self,
        running_job_id: Optional[str] = None,
        scope_playlist_ids: Optional[Sequence[int]] = None,
    ) -> PlaylistStatuses:
        """Return every playlist's status, in the order Rekordbox lists them."""
        with self._repository.snapshot():
            counts, library = self._repository.counts()
            written = self._repository.last_written()
            running: Dict[int, Tuple[int, int]] = {}
            active: Optional[int] = None
            queued: set[int] = set()
            whole_running: Optional[RunningMatch] = None
            if running_job_id is not None:
                running, (done, total) = self._repository.running(running_job_id)
                # A run for chosen playlists is those playlists' business: the
                # whole library row shows a run only when the run is the whole
                # library (or its scope is unknown).
                if total and not scope_playlist_ids:
                    whole_running = RunningMatch(running_job_id, done, total)
                # Only the playlists the match was started for, each counted from
                # its own tracks: the first not finished is the one being worked
                # on, the others are waiting their turn.
                for playlist_id in scope_playlist_ids or ():
                    progress = running.get(playlist_id)
                    if progress is None or progress[0] >= progress[1]:
                        continue
                    if active is None:
                        active = playlist_id
                    else:
                        queued.add(playlist_id)
            statuses: List[PlaylistStatus] = []
            for node, path in _in_tree_order(self._repository.tree()):
                if node.kind != KIND_PLAYLIST:
                    continue
                progress = running.get(node.id) if node.id == active else None
                statuses.append(
                    PlaylistStatus(
                        id=node.id,
                        name=node.name,
                        path=path,
                        counts=counts.get(node.id, StatusCounts()),
                        last_written_at=written.get(node.id),
                        queued=node.id in queued,
                        running=(
                            RunningMatch(running_job_id, progress[0], progress[1])
                            if running_job_id is not None and progress is not None
                            else None
                        ),
                    )
                )
            return PlaylistStatuses(
                playlists=tuple(statuses),
                whole_library=library,
                whole_library_running=whole_running,
            )

    def in_tree_order(self, playlist_ids: Sequence[int]) -> Tuple[int, ...]:
        """Return these playlists in the order the tree lists them, once each."""
        wanted = set(playlist_ids)
        return tuple(
            node.id
            for node, _ in _in_tree_order(self._repository.tree())
            if node.kind == KIND_PLAYLIST and node.id in wanted
        )


def _in_tree_order(nodes: List[PlaylistNode]) -> List[Tuple[PlaylistNode, str]]:
    """Each node with the names of the folders above it, depth first.

    Walks ``parent_id``, never a path string: a name may contain the separator
    (migration 0006), so a path cannot be split back into folders.
    """
    children: Dict[Optional[int], List[PlaylistNode]] = {}
    for node in nodes:
        children.setdefault(node.parent_id, []).append(node)
    ordered: List[Tuple[PlaylistNode, str]] = []
    stack: List[Tuple[PlaylistNode, Tuple[str, ...]]] = [
        (node, ()) for node in reversed(children.get(None, []))
    ]
    while stack:
        node, above = stack.pop()
        ordered.append((node, PATH_SEPARATOR.join(above)))
        stack.extend(
            (child, (*above, node.name))
            for child in reversed(children.get(node.id, []))
        )
    return ordered
