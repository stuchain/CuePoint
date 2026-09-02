#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Library service: the entry point to CuePoint's persistent library.

This is the layer engine handlers, the CLI and (later) the renderer call. They
do not reach for repositories directly — repositories own SQL, this owns the
operations, and keeping that seam means later work (activity logging, background
jobs, cache invalidation) has one obvious home rather than being sprinkled
through API handlers.

It is intentionally thin right now: reads and counts only. Rekordbox import and
differential refresh are the Library phase's job, and adding empty stubs for
them here would be exactly the "no fake implementation" this project rules out.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from cuepoint.models.library_track import LibraryTrack
from cuepoint.services.interfaces import ILibraryService, ITrackRepository


@dataclass(frozen=True)
class LibraryStats:
    """A summary of what the library currently holds.

    Attributes:
        track_count: Number of tracks stored.
        is_empty: True when the library holds nothing yet, which is what
            first-launch flows key off — a database file exists as soon as
            anything opens it, so its presence says nothing about whether the
            user has actually imported a library.
    """

    track_count: int
    is_empty: bool


@dataclass(frozen=True)
class LibrarySearchResult:
    """One page of search results, plus how many matched in total.

    ``total`` is the full match count rather than the length of ``tracks``, so a
    caller can say "showing 20 of 340" without a second query — and so the
    renderer never has to guess whether more results exist.
    """

    query: str
    tracks: List[LibraryTrack]
    total: int
    limit: int
    offset: int


class LibraryService(ILibraryService):
    """Read access to the persistent library."""

    def __init__(self, track_repository: ITrackRepository) -> None:
        self._tracks = track_repository

    def get_track(self, track_id: int) -> Optional[LibraryTrack]:
        """Return a track by its library id, or None."""
        return self._tracks.get(track_id)

    def find_by_rekordbox_id(self, rekordbox_track_id: str) -> Optional[LibraryTrack]:
        """Return the track with this Rekordbox TrackID, or None."""
        return self._tracks.find_by_rekordbox_id(rekordbox_track_id)

    def list_tracks(
        self, limit: Optional[int] = None, offset: int = 0
    ) -> List[LibraryTrack]:
        """Return tracks ordered by artist then title.

        Callers rendering a list should pass ``limit``; an unbounded read of a
        large library materializes every row.
        """
        return self._tracks.list_all(limit=limit, offset=offset)

    # Bounds for a search page. The maximum is a real limit, not a formality:
    # 50,000 tracks is an explicit target, and an unbounded response would
    # materialize every matching row into JSON.
    SEARCH_LIMIT_DEFAULT = 50
    SEARCH_LIMIT_MAX = 200

    def search_tracks(
        self, query: str, limit: int = SEARCH_LIMIT_DEFAULT, offset: int = 0
    ) -> LibrarySearchResult:
        """Return tracks matching ``query``, with the unpaged total.

        A blank query returns nothing rather than the whole library: an empty
        search box should not be a request to read everything.

        ``limit`` and ``offset`` are clamped here rather than trusted, because
        this is reached from an HTTP handler and "the caller validated it" is
        not something a service should assume.
        """
        safe_limit = max(1, min(int(limit), self.SEARCH_LIMIT_MAX))
        safe_offset = max(0, int(offset))
        text = (query or "").strip()
        if not text:
            return LibrarySearchResult(
                query=text, tracks=[], total=0, limit=safe_limit, offset=safe_offset
            )
        return LibrarySearchResult(
            query=text,
            tracks=self._tracks.search(text, limit=safe_limit, offset=safe_offset),
            total=self._tracks.search_count(text),
            limit=safe_limit,
            offset=safe_offset,
        )

    def track_count(self) -> int:
        """Return the number of tracks in the library."""
        return self._tracks.count()

    def is_empty(self) -> bool:
        """Return True when no tracks have been imported yet."""
        return self._tracks.count() == 0

    def stats(self) -> LibraryStats:
        """Return a summary of the library."""
        count = self._tracks.count()
        return LibraryStats(track_count=count, is_empty=count == 0)
