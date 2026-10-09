#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Statistics: the plays behind the Statistics page (STATS-02, Phase 15).

The page asks one question of this module, "what do I play most", and gets the top
tracks, artists and labels with never played and unknown counted, all time or since
a date or a read, in a scope. The SQL is :class:`StatisticsRepository`'s; this
module decides what is asked of it and what each number opens.

Every number carries its rules
------------------------------
Never played, unknown, and each artist and label come back with the
:class:`~cuepoint.models.filter_rule.RuleSet` that opens them in the Library: the
scope's own rules, then the bucket's (rule sets are AND-only, so they add). All
time, a row's rules select exactly the tracks it counted. Since a date or a read no
rule can say "played since", so an artist or label row opens all of its played
tracks and says so (``opens_more``).

The scope
---------
``library`` is no rules. A Collection or a Set is the ``collection`` rule on its id
(a Set is a Collection kind, ADR-008); a Smart Collection is its own saved rules,
read as the Library reads them; a Rekordbox playlist is Phase 14's "In playlist"
rule, a folder counting everything under it. A scope that names nothing, or a
folder, is :class:`ScopeNotFoundError`.

Since a date
------------
The date is the user's local day: ``utc_offset`` turns ``since`` at local midnight
into an instant, and the plays are counted from the first read at or after it. A date
before the first read is clamped to it (``since_clamped``); one after the last read
counts nothing. With no history at all, every "since" answers zero plays.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.models.collection import KIND_COLLECTION, KIND_SET, KIND_SMART
from cuepoint.models.filter_rule import (
    OP_ANY_OF,
    OP_GT,
    OP_IN_COLLECTION,
    OP_IS,
    OP_IS_EMPTY,
    SOURCE_PLAYLIST,
    FilterRule,
    RuleSet,
)
from cuepoint.persistence.statistics_repository import PlayedName, PlayedTrack
from cuepoint.services.interfaces import (
    ICollectionService,
    IPlaylistRepository,
    IStatisticsRepository,
    IStatisticsService,
)

SCOPE_LIBRARY = "library"
SCOPE_COLLECTION = "collection"
SCOPE_PLAYLIST = "playlist"

#: The rows a list holds when the caller does not say.
DEFAULT_LIMIT = 10


class ScopeNotFoundError(LookupError):
    """A Collection or playlist the scope names is not there."""


class ReadNotFoundError(LookupError):
    """A read the request counts from is not in the history."""


@dataclass(frozen=True)
class PlaysScope:
    """Which tracks the numbers are about: the library, a Collection or a playlist.

    Attributes:
        kind: ``library``, ``collection`` (a Collection, a Set or a Smart
            Collection) or ``playlist`` (a Rekordbox playlist or folder).
        id: The Collection's or playlist's id; ``None`` for the library.
    """

    kind: str = SCOPE_LIBRARY
    id: Optional[int] = None


LIBRARY_SCOPE = PlaysScope()


@dataclass(frozen=True)
class PlaysCount:
    """A count of tracks and the rules that open them."""

    count: int
    rules: RuleSet

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {"count": self.count, "rules": self.rules.to_dict()}


@dataclass(frozen=True)
class PlaysRow:
    """An artist or a label and the plays counted for it.

    Attributes:
        name: The first spelling alphabetically.
        key: The identity plays were grouped by.
        plays: The plays of its tracks, all time or in the window.
        tracks: How many of its tracks had at least one play.
        rules: What opens it in the Library.
        opens_more: True when ``rules`` open more tracks than were counted.
    """

    name: str
    key: str
    plays: int
    tracks: int
    rules: RuleSet
    opens_more: bool

    def to_dict(self, key_field: str) -> Dict[str, Any]:
        """Serialize for the API; the identity is ``name_key`` or ``label_key``."""
        return {
            "name": self.name,
            key_field: self.key,
            "plays": self.plays,
            "tracks": self.tracks,
            "rules": self.rules.to_dict(),
            "opens_more": self.opens_more,
        }


@dataclass(frozen=True)
class PlaysReport:
    """The answer to the plays route.

    Attributes:
        since: The date counted from, as asked; ``None`` all time or since a read.
        since_clamped: True when that date was before the history began.
        history_from: When the first read happened; ``None`` with no history.
        last_read: When the last read happened; ``None`` with no history.
        tracks: The most played tracks.
        artists: The artists with the most plays.
        labels: The labels with the most plays.
        never_played: Tracks whose count is zero.
        unknown: Tracks with no count.
    """

    since: Optional[str]
    since_clamped: bool
    history_from: Optional[str]
    last_read: Optional[str]
    tracks: List[PlayedTrack]
    artists: List[PlaysRow]
    labels: List[PlaysRow]
    never_played: PlaysCount
    unknown: PlaysCount

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {
            "since": self.since,
            "since_clamped": self.since_clamped,
            "history_from": self.history_from,
            "last_read": self.last_read,
            "tracks": [
                {"id": t.id, "title": t.title, "artist": t.artist, "plays": t.plays}
                for t in self.tracks
            ],
            "artists": [row.to_dict("name_key") for row in self.artists],
            "labels": [row.to_dict("label_key") for row in self.labels],
            "never_played": self.never_played.to_dict(),
            "unknown": self.unknown.to_dict(),
        }


def _instant(text: str) -> datetime:
    """A stored ``read_at`` as an aware instant; one with no zone is UTC."""
    moment = datetime.fromisoformat(text)
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


class StatisticsService(IStatisticsService):
    """Answers the Statistics page's plays from the history and the library."""

    def __init__(
        self,
        repository: IStatisticsRepository,
        collection_service: ICollectionService,
        playlist_repository: IPlaylistRepository,
    ) -> None:
        self._repository = repository
        self._collections = collection_service
        self._playlists = playlist_repository

    def scope_rules(self, scope: PlaysScope) -> RuleSet:
        """The rules a scope stands for.

        Raises:
            ScopeNotFoundError: If the Collection or playlist is not there, or
                is a folder of Collections, which holds no tracks.
            BrokenRuleError: If a Smart Collection's rules cannot run.
        """
        if scope.kind == SCOPE_COLLECTION and scope.id is not None:
            node = self._collections.get(scope.id)
            if node is None or node.kind not in (
                KIND_COLLECTION,
                KIND_SET,
                KIND_SMART,
            ):
                raise ScopeNotFoundError(f"No Collection with id {scope.id}")
            if node.kind == KIND_SMART:
                return self._collections.resolve(scope.id).require_query().rules
            return RuleSet(
                rules=(FilterRule("collection", OP_IN_COLLECTION, scope.id),)
            ).validated()
        if scope.kind == SCOPE_PLAYLIST and scope.id is not None:
            if self._playlists.get(scope.id) is None:
                raise ScopeNotFoundError(f"No playlist with id {scope.id}")
            source = {"kind": SOURCE_PLAYLIST, "id": scope.id}
            return RuleSet(
                rules=(FilterRule("in_playlist", OP_ANY_OF, [source]),)
            ).validated()
        return RuleSet()

    def plays(
        self,
        *,
        limit: int = DEFAULT_LIMIT,
        since: Optional[date] = None,
        utc_offset: Optional[timedelta] = None,
        since_read: Optional[int] = None,
        scope: Optional[PlaysScope] = None,
    ) -> PlaysReport:
        """The top tracks, artists and labels, and what is not played.

        Args:
            limit: Rows in each list.
            since: Count plays from the start of this local day; ``utc_offset``
                says whose. Not with ``since_read``.
            utc_offset: The user's offset from UTC; none means UTC.
            since_read: Count the plays recorded at this read and after it.
            scope: Which tracks the numbers are about; the library by default.

        Raises:
            ScopeNotFoundError: If the scope names a Collection or playlist that
                is not there.
            ReadNotFoundError: If ``since_read`` is no read in the history.
        """
        rules = self.scope_rules(scope or LIBRARY_SCOPE)
        reads = self._repository.reads()
        history_from = reads[0][1] if reads else None
        last_read = reads[-1][1] if reads else None

        clamped = False
        windowed = since is not None or since_read is not None
        from_read: Optional[int] = None
        if since_read is not None:
            if since_read not in {read_id for read_id, _ in reads}:
                raise ReadNotFoundError(f"No read with id {since_read}")
            from_read = since_read
        elif since is not None:
            from_read, clamped = self._first_read_after(
                reads, since, utc_offset or timedelta(0)
            )

        counted = not windowed or from_read is not None
        tracks: List[PlayedTrack] = []
        artists: List[PlaysRow] = []
        labels: List[PlaysRow] = []
        if counted:
            tracks = self._repository.top_tracks(rules, limit, from_read)
            artists = self._rows(
                self._repository.top_artists(rules, limit, from_read),
                rules,
                "artist_name",
                windowed,
            )
            labels = self._rows(
                self._repository.top_labels(rules, limit, from_read),
                rules,
                "label_name",
                windowed,
            )
        never, unknown = self._repository.unplayed(rules)
        return PlaysReport(
            since=since.isoformat() if since is not None else None,
            since_clamped=clamped,
            history_from=history_from,
            last_read=last_read,
            tracks=tracks,
            artists=artists,
            labels=labels,
            never_played=PlaysCount(
                never, self._with(rules, FilterRule("play_count", OP_IS, 0))
            ),
            unknown=PlaysCount(
                unknown, self._with(rules, FilterRule("play_count", OP_IS_EMPTY))
            ),
        )

    # --------------------------------------------------------------- helpers

    @staticmethod
    def _first_read_after(
        reads: List[Tuple[int, str]], since: date, utc_offset: timedelta
    ) -> Tuple[Optional[int], bool]:
        """The first read at or after the start of ``since`` locally, and whether it was clamped.

        A date before the history began counts from the first read, which is the
        baseline and rises from nothing. ``None`` when
        no read is after the date, which counts nothing.
        """
        if not reads:
            return None, False
        start = datetime.combine(
            since, time.min, tzinfo=timezone(utc_offset)
        ).astimezone(timezone.utc)
        first = _instant(reads[0][1])
        clamped = start < first
        if clamped:
            start = first
        # The lowest id among the reads at or after the start, whatever order the
        # ids and the clock fell in: a read stamped at local midnight is that day's.
        after = [read_id for read_id, read_at in reads if _instant(read_at) >= start]
        return (min(after) if after else None), clamped

    @staticmethod
    def _with(scope: RuleSet, *clauses: FilterRule) -> RuleSet:
        """The scope's rules, then the bucket's: what opens the bucket in the scope."""
        return RuleSet(rules=(*scope.rules, *clauses)).validated()

    def _rows(
        self, found: List[PlayedName], scope: RuleSet, field: str, windowed: bool
    ) -> List[PlaysRow]:
        return [
            PlaysRow(
                name=row.name,
                key=row.key,
                plays=row.plays,
                tracks=row.tracks,
                rules=self._with(
                    scope,
                    FilterRule(field, OP_IS, row.name),
                    FilterRule("play_count", OP_GT, 0),
                ),
                opens_more=windowed,
            )
            for row in found
        ]
