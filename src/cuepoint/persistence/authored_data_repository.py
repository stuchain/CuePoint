#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Which tracks carry work a user did, and could lose (CLEAN-05, DEC-011).

A refresh deletes the tracks Rekordbox no longer has (DEC-003), and everything
CuePoint stored against them goes too, by cascade. DEC-011, as amended, warns
first when that includes anything the user authored and nothing could recompute:

- **rated** — a CuePoint rating, a favorite or a note (DEC-057);
- **tagged** — any tag (DEC-015);
- **reviewed** — a match decision a *user* made (DEC-067);
- **edited** — any override, applied from a match or typed (DEC-068, DEC-069).

Collection membership, the fifth kind, is the collection repository's question
and stays there. What is deliberately not asked about is what matching or a scan
re-derives — attempts, automatic states, file status, duplicate groups, artwork
— because losing it costs time, not work.

One query per kind over :mod:`~cuepoint.persistence.id_chunks`, so a refresh
deleting 20,000 tracks asks four questions per chunk of 500 rather than one per
track; an empty request asks nothing at all.
"""

from __future__ import annotations

from typing import Iterable, List, NamedTuple, Sequence, Set, Tuple

from cuepoint.persistence.id_chunks import CHUNK_SIZE, chunked, unique_ids
from cuepoint.services.interfaces import IAuthoredDataRepository, IDatabaseService

#: What makes a track "rated" and "edited", as SQL over ``track_metadata``.
_RATED = "(rating IS NOT NULL OR favorite = 1 OR notes IS NOT NULL)"
_EDITED = (
    "(key IS NOT NULL OR bpm IS NOT NULL OR genre IS NOT NULL"
    " OR label IS NOT NULL OR year IS NOT NULL)"
)

_QUERIES: Tuple[Tuple[str, str], ...] = (
    ("rated", f"SELECT track_id FROM track_metadata WHERE {_RATED} AND track_id IN "),
    ("tagged", "SELECT DISTINCT track_id FROM track_tags WHERE track_id IN "),
    (
        "reviewed",
        "SELECT track_id FROM track_match WHERE decided_by = 'user' AND track_id IN ",
    ),
    ("edited", f"SELECT track_id FROM track_metadata WHERE {_EDITED} AND track_id IN "),
)


class AuthoredTracks(NamedTuple):
    """The tracks, among those asked about, carrying each kind of user work.

    Each tuple is sorted and distinct.
    """

    rated: Tuple[int, ...] = ()
    tagged: Tuple[int, ...] = ()
    reviewed: Tuple[int, ...] = ()
    edited: Tuple[int, ...] = ()

    @property
    def track_ids(self) -> Tuple[int, ...]:
        """Every track carrying any of the four, once each, sorted."""
        return tuple(sorted({*self.rated, *self.tagged, *self.reviewed, *self.edited}))


class AuthoredDataRepository(IAuthoredDataRepository):
    """Reads which tracks carry a user's own work."""

    def __init__(self, database_service: IDatabaseService) -> None:
        """Store the database service this repository reads through."""
        self._db = database_service

    def tracks_carrying(self, track_ids: Iterable[int]) -> AuthoredTracks:
        """Return which of ``track_ids`` carry each kind of user work."""
        wanted = unique_ids(track_ids)
        if not wanted:
            return AuthoredTracks()

        found: dict = {kind: set() for kind, _ in _QUERIES}
        connection = self._db.connect()
        for chunk in chunked(wanted, CHUNK_SIZE):
            placeholders = f"({', '.join('?' for _ in chunk)})"
            for kind, sql in _QUERIES:
                bucket: Set[int] = found[kind]
                bucket.update(
                    int(row[0]) for row in connection.execute(sql + placeholders, chunk)
                )
        return AuthoredTracks(**{kind: _sorted(ids) for kind, ids in found.items()})


def _sorted(ids: Set[int]) -> Tuple[int, ...]:
    ordered: List[int] = sorted(ids)
    return tuple(ordered)


__all__: Sequence[str] = ("AuthoredDataRepository", "AuthoredTracks")
