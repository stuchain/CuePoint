#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The playlist list and the Save bar's count (G4 2.1, 2.2).

The numbers come from ``persistence/match_status_repository``; this service
adds what is not SQL: the way to each playlist through its folders, the tree
order the person sees in Rekordbox, and which playlists a running match job
covers.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

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

    def playlists(self, running_job_id: Optional[str] = None) -> PlaylistStatuses:
        """Return every playlist's status, in the order Rekordbox lists them."""
        with self._repository.snapshot():
            counts, library = self._repository.counts()
            written = self._repository.last_written()
            running: Dict[int, Tuple[int, int]] = {}
            whole_running: Optional[RunningMatch] = None
            if running_job_id is not None:
                running, (done, total) = self._repository.running(running_job_id)
                if total:
                    whole_running = RunningMatch(running_job_id, done, total)
            statuses: List[PlaylistStatus] = []
            for node, path in _in_tree_order(self._repository.tree()):
                if node.kind != KIND_PLAYLIST:
                    continue
                progress = running.get(node.id)
                statuses.append(
                    PlaylistStatus(
                        id=node.id,
                        name=node.name,
                        path=path,
                        counts=counts.get(node.id, StatusCounts()),
                        last_written_at=written.get(node.id),
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
