#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""All SQL for where playlists stand: waiting, ready to save, matching (G4 2.1, 2.2).

Read-only. Two questions, each answered from the database alone:

- **What is not in the files yet?** The definition is one SQL constant,
  :data:`~cuepoint.models.filter_rule.UNSAVED_VALUES_SQL`, which the
  ``unsaved_values`` filter field reads too, so the Save bar's number and the
  rows its Save window opens on cannot disagree.
- **What does each playlist need?** One statement over the playlist tree, its
  membership, the match states and the unsaved tracks, grouped by playlist.

A playlist is counted by its **distinct tracks**: a track that sits twice in a
playlist (Rekordbox allows it) is one track to match and one to save.

``waiting`` is the Match tab's number: tracks that need review plus tracks
changed since the person decided (``services/health_service.py``'s
``needs_review`` and ``disputed`` counts, added as ``sectionCounts`` adds them).
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import replace
from typing import Dict, Iterator, List, Tuple

from cuepoint.models.filter_rule import (
    UNSAVED_VALUES_SQL,
)
from cuepoint.models.match_attempt import (
    STATE_ACCEPTED,
    STATE_NEEDS_REVIEW,
    STATE_NO_MATCH,
    STATE_REJECTED,
)
from cuepoint.models.match_status import PlaylistNode, StatusCounts
from cuepoint.services.interfaces import IDatabaseService, IMatchStatusRepository

#: The tracks of each playlist, once each.
_MEMBERS = "SELECT DISTINCT playlist_id, track_id FROM rekordbox_playlist_tracks"

#: One group's counts over ``track_match`` as ``tm``: a track with no row there
#: is not matched. ``unsaved`` is filled in by the caller, from a statement of
#: its own.
_TALLY = (
    "COUNT(*) AS track_count,"
    " COALESCE(SUM(tm.track_id IS NULL), 0) AS not_matched,"
    f" COALESCE(SUM(tm.state = '{STATE_NEEDS_REVIEW}'), 0)"
    " + COALESCE(SUM(tm.newer_attempt_id IS NOT NULL), 0) AS waiting,"
    f" COALESCE(SUM(tm.state = '{STATE_ACCEPTED}'), 0) AS accepted,"
    f" COALESCE(SUM(tm.state = '{STATE_REJECTED}'), 0) AS rejected,"
    f" COALESCE(SUM(tm.state = '{STATE_NO_MATCH}'), 0) AS no_match,"
    " 0 AS unsaved"
)

#: The counts of every playlist that holds a track; an empty one has no row.
_PLAYLIST_COUNTS = (
    f"SELECT m.playlist_id AS id, {_TALLY} FROM ({_MEMBERS}) AS m"
    " LEFT JOIN track_match AS tm ON tm.track_id = m.track_id"
    " GROUP BY m.playlist_id"
)

#: The unsaved tracks, found once: the library's number (the row with no
#: playlist) and each playlist's, reached through the membership's track index
#: so the memberships are not walked for them.
_UNSAVED_COUNTS = (
    f"WITH un AS MATERIALIZED (SELECT track_id FROM ({UNSAVED_VALUES_SQL}))"
    " SELECT NULL AS playlist_id, COUNT(DISTINCT track_id) AS n FROM un UNION ALL"
    " SELECT playlist_id, COUNT(*) FROM (SELECT DISTINCT pt.playlist_id AS playlist_id,"
    " pt.track_id AS track_id FROM un JOIN rekordbox_playlist_tracks AS pt"
    " ON pt.track_id = un.track_id) GROUP BY playlist_id"
)

#: The whole library from the match table alone: a track with no row there is
#: not matched, so the count of tracks less the rows is that many.
_LIBRARY_MATCH_COUNTS = (
    "SELECT"
    " (SELECT COUNT(*) FROM tracks) AS track_count,"
    " COUNT(*) AS matched,"
    f" COALESCE(SUM(state = '{STATE_NEEDS_REVIEW}'), 0) AS needs_review,"
    " COALESCE(SUM(newer_attempt_id IS NOT NULL), 0) AS disputed,"
    f" COALESCE(SUM(state = '{STATE_ACCEPTED}'), 0) AS accepted,"
    f" COALESCE(SUM(state = '{STATE_REJECTED}'), 0) AS rejected,"
    f" COALESCE(SUM(state = '{STATE_NO_MATCH}'), 0) AS no_match"
    " FROM track_match"
)

#: The playlists that are in the files, and when. A playlist is in the files when
#: it has accepted matches and every one of them has a standing write made by a
#: Clean sync: a file write that was neither undone nor still pending, whose job
#: also recorded the track's change history under its batch (Sync copies the
#: written values in as one batch named for its write job; the Library's "Save
#: to files" records no such batch). Written per track first (the file_writes
#: track index), then once per playlist: no track is walked in Python. The time
#: is the latest of those writes.
_WRITTEN_BY_PLAYLIST = (
    "WITH w AS (SELECT fw.track_id AS track_id, MAX(fw.written_at) AS at"
    " FROM file_writes AS fw"
    " WHERE fw.outcome = 'written' AND fw.pending = 0 AND fw.track_id IS NOT NULL"
    " AND NOT EXISTS (SELECT 1 FROM file_writes AS r WHERE r.restore_of = fw.id"
    " AND r.outcome = 'restored' AND r.pending = 0)"
    " AND EXISTS (SELECT 1 FROM track_history AS th WHERE th.batch_id = fw.job_id"
    " AND th.track_id = fw.track_id)"
    " GROUP BY fw.track_id)"
    " SELECT m.playlist_id AS playlist_id, MAX(w.at) AS at"
    f" FROM ({_MEMBERS}) AS m"
    f" JOIN track_match AS tm ON tm.track_id = m.track_id AND tm.state = '{STATE_ACCEPTED}'"
    " LEFT JOIN w ON w.track_id = m.track_id"
    " GROUP BY m.playlist_id"
    " HAVING COUNT(w.track_id) = COUNT(*)"
)

#: A running job's progress per playlist: the plan's tracks that sit in it, once each.
#: Every playlist holding a planned track has a row; the service keeps only the
#: ones the match was started for.
_RUNNING_BY_PLAYLIST = (
    "SELECT playlist_id, COUNT(*) AS total, COALESCE(SUM(done), 0) AS done"
    " FROM (SELECT DISTINCT pt.playlist_id AS playlist_id, j.track_id AS track_id,"
    " j.done AS done FROM match_job_tracks AS j"
    " JOIN rekordbox_playlist_tracks AS pt ON pt.track_id = j.track_id"
    " WHERE j.job_id = ?) GROUP BY playlist_id"
)

_RUNNING_WHOLE = (
    "SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done"
    " FROM match_job_tracks WHERE job_id = ?"
)


def _counts(row: sqlite3.Row) -> StatusCounts:
    return StatusCounts(
        track_count=int(row["track_count"]),
        not_matched=int(row["not_matched"]),
        waiting=int(row["waiting"]),
        accepted=int(row["accepted"]),
        rejected=int(row["rejected"]),
        no_match=int(row["no_match"]),
        unsaved=int(row["unsaved"]),
    )


class MatchStatusRepository(IMatchStatusRepository):
    """Persistence reads for playlist status and unsaved values."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads through."""
        self._db = database_service

    @contextmanager
    def snapshot(self) -> Iterator[None]:
        """Read everything inside the block as of one moment.

        A deferred transaction: in WAL mode the first read fixes the snapshot,
        and a writer committing meanwhile is not seen. Joins one already open.
        """
        connection = self._db.connect()
        if connection.in_transaction:
            yield
            return
        connection.execute("BEGIN")
        try:
            yield
        finally:
            connection.execute("ROLLBACK")

    def tree(self) -> List[PlaylistNode]:
        """Return every folder and playlist, in order within each parent."""
        return [
            PlaylistNode(
                id=int(row["id"]),
                parent_id=None if row["parent_id"] is None else int(row["parent_id"]),
                name=str(row["name"]),
                kind=str(row["kind"]),
                position=int(row["position"]),
            )
            for row in self._db.connect().execute(
                "SELECT id, parent_id, name, kind, position FROM rekordbox_playlists"
                " ORDER BY parent_id, position, id"
            )
        ]

    def counts(self) -> Tuple[Dict[int, StatusCounts], StatusCounts]:
        """Return each playlist's counts and the whole library's.

        A playlist with no tracks has no entry. The unsaved tracks are found
        once, for the playlists and the library together.
        """
        connection = self._db.connect()
        in_playlists: Dict[int, int] = {}
        unsaved = 0
        for row in connection.execute(_UNSAVED_COUNTS):
            if row["playlist_id"] is None:
                unsaved = int(row["n"])
            else:
                in_playlists[int(row["playlist_id"])] = int(row["n"])
        playlists = {
            int(row["id"]): replace(
                _counts(row), unsaved=in_playlists.get(int(row["id"]), 0)
            )
            for row in connection.execute(_PLAYLIST_COUNTS)
        }
        whole = connection.execute(_LIBRARY_MATCH_COUNTS).fetchone()
        library = StatusCounts(
            track_count=int(whole["track_count"]),
            not_matched=int(whole["track_count"]) - int(whole["matched"]),
            waiting=int(whole["needs_review"]) + int(whole["disputed"]),
            accepted=int(whole["accepted"]),
            rejected=int(whole["rejected"]),
            no_match=int(whole["no_match"]),
            unsaved=unsaved,
        )
        return playlists, library

    def last_written(self) -> Dict[int, str]:
        """Return, per playlist, when a Clean sync last wrote it into the files.

        A playlist has an entry only when it has accepted matches and each of
        them has a standing Clean-sync write (an undone one does not count, nor
        a write only another playlist's sync or the Library's save made).
        """
        return {
            int(row["playlist_id"]): str(row["at"])
            for row in self._db.connect().execute(_WRITTEN_BY_PLAYLIST)
            if row["at"] is not None
        }

    def running(
        self, job_id: str
    ) -> Tuple[Dict[int, Tuple[int, int]], Tuple[int, int]]:
        """Return a match job's ``(done, total)`` per playlist and overall."""
        connection = self._db.connect()
        per_playlist = {
            int(row["playlist_id"]): (int(row["done"]), int(row["total"]))
            for row in connection.execute(_RUNNING_BY_PLAYLIST, (job_id,))
        }
        whole = connection.execute(_RUNNING_WHOLE, (job_id,)).fetchone()
        return per_playlist, (int(whole["done"]), int(whole["total"]))
