#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What the library analysis may open, and in which order (WAVE-03).

Two reads of the library database, never of a file:

- :meth:`WaveformWorkRepository.present_files` answers every track the last
  file check found present at its current path (fact 6), with the size that
  check recorded. Ordered, it is the analysis's order: entries of Sets first,
  then of Collections, then the rest, newest first. The tracks a user is
  preparing get their waveforms first.
- :meth:`WaveformWorkRepository.library_paths` answers every track's path, so
  a run that drained the library can prune the store rows no track has.

"Newest" is the date Rekordbox says the track was added, then the newest
import, because a library imported from a source without dates still has an
order. A track with no date comes after every track with one.
"""

from __future__ import annotations

from typing import Dict, List, Set

from cuepoint.models.file_status import FILE_PRESENT
from cuepoint.models.waveform_analysis import PresentFile
from cuepoint.services.interfaces import IDatabaseService, IWaveformWorkRepository

#: Where a track's file comes in the analysis.
RANK_SET = 0
RANK_COLLECTION = 1
RANK_REST = 2

_PRESENT = (
    "SELECT t.id AS id, t.file_path AS path, f.size_bytes AS size_bytes,"
    " t.date_added AS date_added"
    " FROM tracks AS t JOIN track_files AS f"
    " ON f.track_id = t.id AND f.checked_path = t.file_path"
    " WHERE f.status = ? AND t.file_path IS NOT NULL AND t.file_path <> ''"
)

# One row per track that is in any Collection or Set, with whether any is a Set.
# Smart Collections have no member rows: they are rules, and resolving every
# one of them to order a background job would cost more than the order is worth.
_MEMBERSHIP = (
    "SELECT ct.track_id AS track_id, max(c.kind = 'set') AS in_set"
    " FROM collection_tracks AS ct JOIN collections AS c ON c.id = ct.collection_id"
    " GROUP BY ct.track_id"
)


class WaveformWorkRepository(IWaveformWorkRepository):
    """The analysis job's reads of the library database."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads through."""
        self._db = database_service

    def present_files(self, *, ordered: bool = True) -> List[PresentFile]:
        """Every track the last check found present at its current path.

        Args:
            ordered: Answer in the analysis's order. Without it the order is
                the database's, and counting costs one query rather than two.
        """
        connection = self._db.connect()
        rows = connection.execute(_PRESENT, (FILE_PRESENT,)).fetchall()
        files = [
            (
                PresentFile(
                    track_id=int(row["id"]),
                    path=str(row["path"]),
                    size_bytes=None
                    if row["size_bytes"] is None
                    else int(row["size_bytes"]),
                ),
                str(row["date_added"] or ""),
            )
            for row in rows
        ]
        if not ordered:
            return [present for present, _ in files]

        ranks: Dict[int, int] = {
            int(row["track_id"]): RANK_SET if row["in_set"] else RANK_COLLECTION
            for row in connection.execute(_MEMBERSHIP)
        }
        # Newest first, then by rank: Python's sort is stable, so the second
        # sort keeps the first's order within each rank. A missing date sorts
        # as the empty string, after every real one.
        files.sort(key=lambda item: (item[1], item[0].track_id), reverse=True)
        files.sort(key=lambda item: ranks.get(item[0].track_id, RANK_REST))
        return [present for present, _ in files]

    def library_paths(self) -> Set[str]:
        """Every path a library track has, present or not."""
        rows = self._db.connect().execute(
            "SELECT DISTINCT file_path FROM tracks"
            " WHERE file_path IS NOT NULL AND file_path <> ''"
        )
        return {str(row[0]) for row in rows}


__all__: List[str] = [
    "RANK_COLLECTION",
    "RANK_REST",
    "RANK_SET",
    "WaveformWorkRepository",
]
