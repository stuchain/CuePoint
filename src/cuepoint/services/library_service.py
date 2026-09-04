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
from typing import Iterable, List, Optional

from cuepoint.models.filter_rule import Facet, FacetRange, RuleSet, field_spec
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.references import NO_REFERENCES, ReferenceSummary
from cuepoint.persistence.track_query import (
    BROWSE_LIMIT_DEFAULT,
    DEFAULT_SORT,
    BrowseQuery,
    clamp_ids_limit,
    clamp_limit,
    clamp_offset,
)
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


@dataclass(frozen=True)
class LibraryBrowseResult:
    """One window of the library, and what was asked for to get it.

    The request is echoed back — scope, sort, direction — so a renderer can
    tell a late response from a current one by what it *answers* rather than by
    bookkeeping it has to keep in step (LIBUI-05). ``total`` is the full match
    count, so a table can size its scrollbar without reading every row.

    ``track_ids`` is populated instead of ``tracks`` when only ids were asked
    for; both are never populated at once, because a caller asking for ids does
    not want the rows and one that wants rows has them.
    """

    query: str
    tracks: List[LibraryTrack]
    total: int
    limit: int
    offset: int
    playlist_id: Optional[int] = None
    sort: str = DEFAULT_SORT
    direction: str = "asc"
    track_ids: Optional[List[int]] = None


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

    def browse_tracks(
        self,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional[RuleSet] = None,
        sort: str = DEFAULT_SORT,
        direction: str = "asc",
        limit: int = BROWSE_LIMIT_DEFAULT,
        offset: int = 0,
    ) -> LibraryBrowseResult:
        """Return one window of the library, with the unpaged total (DEC-040).

        Unlike :meth:`search_tracks`, a blank query means *everything in
        scope*: a table with an empty search box shows the library, while an
        empty search box is not a request to read one. That difference is the
        only thing separating the two, and it lives here rather than in two
        query paths (DEC-023).

        Raises:
            BrowseQueryError: If the sort or direction is not one that exists.
            FilterRuleError: If a filter rule cannot be honoured as written.
        """
        browse = BrowseQuery(
            query=query or "",
            playlist_id=playlist_id,
            sort=sort or DEFAULT_SORT,
            direction=direction or "asc",
            rules=rules or RuleSet(),
        ).validated()
        safe_limit = clamp_limit(limit)
        safe_offset = clamp_offset(offset)
        return LibraryBrowseResult(
            query=browse.query,
            tracks=self._tracks.browse(browse, limit=safe_limit, offset=safe_offset),
            total=self._tracks.browse_count(browse),
            limit=safe_limit,
            offset=safe_offset,
            playlist_id=browse.playlist_id,
            sort=browse.sort,
            direction=browse.direction,
        )

    def browse_track_ids(
        self,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional[RuleSet] = None,
        sort: str = DEFAULT_SORT,
        direction: str = "asc",
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> LibraryBrowseResult:
        """Return the ids of one window, in the same order as the rows.

        What a selection that crosses unloaded rows is built from (DEC-045).
        The result carries ``track_ids`` and an empty ``tracks``.
        """
        browse = BrowseQuery(
            query=query or "",
            playlist_id=playlist_id,
            sort=sort or DEFAULT_SORT,
            direction=direction or "asc",
            rules=rules or RuleSet(),
        ).validated()
        safe_limit = clamp_ids_limit(limit)
        safe_offset = clamp_offset(offset)
        return LibraryBrowseResult(
            query=browse.query,
            tracks=[],
            total=self._tracks.browse_count(browse),
            limit=safe_limit,
            offset=safe_offset,
            playlist_id=browse.playlist_id,
            sort=browse.sort,
            direction=browse.direction,
            track_ids=self._tracks.browse_ids(
                browse, limit=safe_limit, offset=safe_offset
            ),
        )

    def facet(
        self,
        field: str,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional[RuleSet] = None,
        limit: int = 0,
    ) -> Facet:
        """Return the values a field takes in the current view (DEC-043).

        Computed over the scope, the text query and every *other* filter, so
        choosing one genre leaves the rest choosable.
        """
        browse = BrowseQuery(
            query=query or "",
            playlist_id=playlist_id,
            rules=rules or RuleSet(),
        )
        return self._tracks.facet_values(browse, field_spec(field).name, limit)

    def facet_range(
        self,
        field: str,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional[RuleSet] = None,
    ) -> FacetRange:
        """Return the span of a numeric field in the current view."""
        browse = BrowseQuery(
            query=query or "",
            playlist_id=playlist_id,
            rules=rules or RuleSet(),
        )
        return self._tracks.facet_range(browse, field_spec(field).name)

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

    def references_for(self, track_ids: Iterable[int]) -> ReferenceSummary:
        """Return what else is holding on to these tracks (DEC-011).

        Called before a refresh deletes anything, so the user can be told that
        "N tracks removed from Rekordbox are used in M Collections and Sets"
        rather than finding out afterwards — DEC-003's deletion takes the
        CuePoint-side data with it and cannot be undone.

        **Zero is the true answer today, not a stub.** Collections arrive in
        Phase 6 and Sets in Phase 10; until then nothing in this build can
        reference a track, so nothing does. The question is asked now because
        DEC-032 chose to build the seam rather than reshape the refresh flow
        later, and because a caller that already consults it needs no change
        when the answer becomes interesting.

        Phase 6 replaces the body — this signature, this return type, and every
        existing caller stay as they are.

        Args:
            track_ids: Library ids of the tracks about to be deleted. An empty
                iterable is valid and answers zero.

        Returns:
            A :class:`~cuepoint.models.references.ReferenceSummary`.
        """
        # Consumed rather than ignored: a caller passing a generator should not
        # find it silently untouched when this starts doing work, and passing
        # something unconsumable should fail here rather than in Phase 6.
        list(track_ids)
        return NO_REFERENCES
