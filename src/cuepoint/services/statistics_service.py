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

Spreads and health (STATS-03)
-----------------------------
:meth:`StatisticsService.spreads` answers six fields at once, each as buckets, an
unknown line and a total, and :meth:`StatisticsService.health` the scope's tracks
by file state, Beatport match and analysis. A bucket that a rule can say carries
the scope's rules plus its own, so it opens exactly the tracks it counted (the
tests run every one through ``browse_count``). Where no rule can say it (a top-N
remainder, a malformed date, a loudness) the rules are ``None`` and the number is
the page's alone. The fields' buckets and their unknown lines sum to the scope.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from cuepoint.models.collection import KIND_COLLECTION, KIND_SET, KIND_SMART
from cuepoint.data.audio_decode import LOUDNESS_VERSION
from cuepoint.models.filter_rule import (
    FILE_STATUS_CHOICES,
    OP_ANY_OF,
    OP_BETWEEN,
    OP_GT,
    OP_GTE,
    OP_IN_COLLECTION,
    OP_IS,
    OP_IS_EMPTY,
    OP_LT,
    SOURCE_PLAYLIST,
    FilterRule,
    RuleSet,
)
from cuepoint.persistence.statistics_repository import PlayedName, PlayedTrack
from cuepoint.persistence.waveform_store import WaveformStore, WaveformStoreError
from cuepoint.services.interfaces import (
    ICollectionService,
    IPlaylistRepository,
    IStatisticsRepository,
    IStatisticsService,
    IWaveformAnalysisService,
)

_logger = logging.getLogger(__name__)

SCOPE_LIBRARY = "library"
SCOPE_COLLECTION = "collection"
SCOPE_PLAYLIST = "playlist"

#: The rows a list holds when the caller does not say.
DEFAULT_LIMIT = 10

#: Genres a spread names before the rest are one **Other** bucket.
GENRE_LIMIT = 20

#: Stars a rating spread always shows, even where a scale step has no track.
RATING_STARS = (0, 1, 2, 3, 4, 5)

#: The states health counts, in the order the page reads them; they are the
#: filter's own choices, which the health tests hold them to.
FILE_STATES = tuple(state for state, _ in FILE_STATUS_CHOICES)
BEATPORT_STATES = (
    "accepted",
    "needs_review",
    "rejected",
    "no_match",
    "not_matched",
)

LABEL_OTHER = "Other"
LABEL_NO_GENRE = "No genre"
LABEL_NO_TEMPO = "No tempo"
LABEL_NO_YEAR = "No year"
LABEL_UNKNOWN_DATE = "Unknown date"
LABEL_UNRATED = "Unrated"
LABEL_NOT_MEASURED = "Not measured"
LABEL_NO_FILE = "No file"


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


def scope_name(scope: PlaysScope) -> str:
    """A scope as the routes spell it: ``library``, ``collection:7`` or ``playlist:7``."""
    if scope.id is None or scope.kind == SCOPE_LIBRARY:
        return SCOPE_LIBRARY
    return f"{scope.kind}:{scope.id}"


@dataclass(frozen=True)
class SpreadBucket:
    """One bar of a spread.

    Attributes:
        label: What the bar is called.
        value: The number or text the bucket stands for (a tempo, a year, a
            ``YYYY-MM``, a genre, a loudness floor); ``None`` for **Other**.
        count: The scope's tracks in it.
        rules: What opens it in the Library, or ``None`` when no rule can say it.
    """

    label: str
    value: Any
    count: int
    rules: Optional[RuleSet]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "label": self.label,
            "value": self.value,
            "count": self.count,
            "rules": None if self.rules is None else self.rules.to_dict(),
        }


@dataclass(frozen=True)
class SpreadLine:
    """A line beside the buckets: tracks with no value, or no file."""

    label: str
    count: int
    rules: Optional[RuleSet]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "label": self.label,
            "count": self.count,
            "rules": None if self.rules is None else self.rules.to_dict(),
        }


@dataclass(frozen=True)
class Spread:
    """One field's spread: its buckets, the tracks it cannot place, and their sum.

    Attributes:
        buckets: In the order the field reads: commonest first for genre,
            ascending for the rest.
        unknown: The scope's tracks the buckets do not hold.
        total: The buckets, ``unknown`` and ``no_file`` together: the scope.
        no_file: Loudness only: tracks with no present file. ``None`` elsewhere.
    """

    buckets: List[SpreadBucket]
    unknown: SpreadLine
    total: int
    no_file: Optional[SpreadLine] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API; ``no_file`` is there for loudness alone."""
        out: Dict[str, Any] = {
            "buckets": [bucket.to_dict() for bucket in self.buckets],
            "unknown": self.unknown.to_dict(),
        }
        if self.no_file is not None:
            out["no_file"] = self.no_file.to_dict()
        out["total"] = self.total
        return out


@dataclass(frozen=True)
class SpreadsReport:
    """The answer to the spreads route: six fields over one scope."""

    scope: str
    total: int
    genre: Spread
    tempo: Spread
    year: Spread
    date_added: Spread
    rating: Spread
    loudness: Spread

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {
            "scope": self.scope,
            "total": self.total,
            "genre": self.genre.to_dict(),
            "tempo": self.tempo.to_dict(),
            "year": self.year.to_dict(),
            "date_added": self.date_added.to_dict(),
            "rating": self.rating.to_dict(),
            "loudness": self.loudness.to_dict(),
        }


@dataclass(frozen=True)
class StatisticsHealth:
    """The answer to the health route.

    Attributes:
        scope: The scope as asked.
        total: The scope's tracks.
        files: Each file state and the tracks in it, with the rules that open it.
        beatport: Each match state likewise.
        analyzed: Analyzed, failed, waiting and no file, over the scope's tracks.
            Counts only: no rule can say "analyzed".
        checked_at: When the last file check of these tracks was made, or ``None``.
    """

    scope: str
    total: int
    files: Dict[str, PlaysCount]
    beatport: Dict[str, PlaysCount]
    analyzed: Dict[str, int]
    checked_at: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {
            "scope": self.scope,
            "total": self.total,
            "files": {name: row.to_dict() for name, row in self.files.items()},
            "beatport": {name: row.to_dict() for name, row in self.beatport.items()},
            "analyzed": dict(self.analyzed),
            "checked_at": self.checked_at,
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
        *,
        waveform_store: Optional[WaveformStore] = None,
        analysis_service: Optional[IWaveformAnalysisService] = None,
        loudness_version: int = LOUDNESS_VERSION,
    ) -> None:
        self._repository = repository
        self._collections = collection_service
        self._playlists = playlist_repository
        # STATS-03: loudness and analysis live in waveforms.db. Without them
        # nothing is measured and nothing is analysed, which is true to say.
        self._store = waveform_store
        self._analysis = analysis_service
        self._loudness_version = int(loudness_version)

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

    # ----------------------------------------------------------- spreads

    def spreads(self, scope: Optional[PlaysScope] = None) -> SpreadsReport:
        """How the scope's tracks spread by genre, tempo, year, date added, rating and loudness.

        Raises:
            ScopeNotFoundError: If the scope names a Collection or playlist that
                is not there.
        """
        asked = scope or LIBRARY_SCOPE
        rules = self.scope_rules(asked)
        # One snapshot, so the total and every field count the same library.
        with self._repository.snapshot():
            total = self._repository.total(rules)
            return SpreadsReport(
                scope=scope_name(asked),
                total=total,
                genre=self._genre(rules),
                tempo=self._tempo(rules),
                year=self._year(rules),
                date_added=self._date_added(rules),
                rating=self._rating(rules),
                loudness=self._loudness(rules, total),
            )

    def _genre(self, scope: RuleSet) -> Spread:
        genres, none = self._repository.genre_spread(scope)
        kept = genres[:GENRE_LIMIT]
        buckets = [
            SpreadBucket(
                name, name, count, self._with(scope, FilterRule("genre", OP_IS, name))
            )
            for name, count in kept
        ]
        rest = sum(count for _, count in genres[GENRE_LIMIT:])
        if rest:
            buckets.append(SpreadBucket(LABEL_OTHER, None, rest, None))
        return self._spread(
            scope,
            buckets,
            none,
            LABEL_NO_GENRE,
            FilterRule("genre", OP_IS_EMPTY),
        )

    def _tempo(self, scope: RuleSet) -> Spread:
        tempos, none, not_positive = self._repository.tempo_spread(scope)
        buckets = [
            SpreadBucket(
                f"{n} BPM",
                n,
                count,
                self._with(
                    scope,
                    FilterRule("bpm", OP_GTE, n - 0.5),
                    FilterRule("bpm", OP_LT, n + 0.5),
                ),
            )
            for n, count in tempos
        ]
        # A BPM of zero or less is "no tempo" to a reader, but `bpm` *is empty*
        # finds only a missing one: with any such track present, no rule can say
        # the line, and it is counted only.
        return self._spread(
            scope,
            buckets,
            none + not_positive,
            LABEL_NO_TEMPO,
            None if not_positive else FilterRule("bpm", OP_IS_EMPTY),
        )

    def _year(self, scope: RuleSet) -> Spread:
        years, none, not_positive = self._repository.year_spread(scope)
        buckets = [
            SpreadBucket(
                str(n), n, count, self._with(scope, FilterRule("year", OP_IS, n))
            )
            for n, count in years
        ]
        return self._spread(
            scope,
            buckets,
            none + not_positive,
            LABEL_NO_YEAR,
            None if not_positive else FilterRule("year", OP_IS_EMPTY),
        )

    def _date_added(self, scope: RuleSet) -> Spread:
        months, unknown = self._repository.month_spread(scope)
        buckets = [
            SpreadBucket(
                month,
                month,
                count,
                self._with(
                    scope,
                    FilterRule(
                        "date_added", OP_BETWEEN, [f"{month}-01", f"{month}-31"]
                    ),
                ),
            )
            for month, count in months
        ]
        # No rule says "empty or malformed" (rule sets are AND-only): count only.
        return self._spread(scope, buckets, unknown, LABEL_UNKNOWN_DATE, None)

    def _rating(self, scope: RuleSet) -> Spread:
        found, unrated = self._repository.rating_spread(scope)
        counts = dict(found)
        stars = [*RATING_STARS, *sorted(set(counts) - set(RATING_STARS))]
        buckets = [
            SpreadBucket(
                f"{n} star" if n == 1 else f"{n} stars",
                n,
                counts.get(n, 0),
                self._with(scope, FilterRule("rating", OP_IS, n)),
            )
            for n in stars
        ]
        return self._spread(
            scope, buckets, unrated, LABEL_UNRATED, FilterRule("rating", OP_IS_EMPTY)
        )

    def _loudness(self, scope: RuleSet, total: int) -> Spread:
        """Integrated loudness in 1 LU buckets, from the store, for present files."""
        present = self._repository.present_files(scope)
        readings: Dict[str, Tuple[int, float]] = {}
        if self._store is not None and present:
            try:
                readings = self._store.readings(
                    {path for _, path, _ in present}, self._loudness_version
                )
            except WaveformStoreError as exc:
                _logger.warning("[statistics] The loudness could not be read: %s", exc)
        counts: Dict[int, int] = {}
        unmeasured = 0
        for _, path, size in present:
            reading = readings.get(path)
            # The same rule as the analysis's: a reading is of the file as the
            # last check saw it, so a changed size is a file measured no more.
            if reading is None or (size is not None and reading[0] != size):
                unmeasured += 1
                continue
            floor = math.floor(reading[1])
            counts[floor] = counts.get(floor, 0) + 1
        buckets = [
            SpreadBucket(f"{n} LUFS", n, counts[n], None) for n in sorted(counts)
        ]
        return Spread(
            buckets=buckets,
            unknown=SpreadLine(LABEL_NOT_MEASURED, unmeasured, None),
            total=total,
            no_file=SpreadLine(LABEL_NO_FILE, total - len(present), None),
        )

    def _spread(
        self,
        scope: RuleSet,
        buckets: List[SpreadBucket],
        unknown: int,
        label: str,
        clause: Optional[FilterRule],
    ) -> Spread:
        """A spread whose total is its buckets and its unknown line."""
        return Spread(
            buckets=buckets,
            unknown=SpreadLine(
                label,
                unknown,
                None if clause is None else self._with(scope, clause),
            ),
            total=sum(bucket.count for bucket in buckets) + unknown,
        )

    # ------------------------------------------------------------ health

    def health(self, scope: Optional[PlaysScope] = None) -> StatisticsHealth:
        """The scope's tracks by file state, Beatport match and analysis.

        Raises:
            ScopeNotFoundError: If the scope names a Collection or playlist that
                is not there.
        """
        asked = scope or LIBRARY_SCOPE
        rules = self.scope_rules(asked)
        with self._repository.snapshot():
            total = self._repository.total(rules)
            files = self._repository.file_states(rules)
            matches = self._repository.match_states(rules)
            return StatisticsHealth(
                scope=scope_name(asked),
                total=total,
                files=self._states(rules, "file_status", FILE_STATES, files),
                beatport=self._states(rules, "match_state", BEATPORT_STATES, matches),
                analyzed=self._analyzed(rules, total),
                checked_at=self._repository.last_checked(rules),
            )

    def _states(
        self,
        scope: RuleSet,
        field: str,
        states: Tuple[str, ...],
        found: Dict[str, int],
    ) -> Dict[str, PlaysCount]:
        return {
            state: PlaysCount(
                found.get(state, 0), self._with(scope, FilterRule(field, OP_IS, state))
            )
            for state in states
        }

    def _analyzed(self, scope: RuleSet, total: int) -> Dict[str, int]:
        """Analyzed, failed, waiting and no file, by ``plan()``'s own counting."""
        analyzed = failed = 0
        if self._analysis is None:
            files = waiting = len(self._repository.present_files(scope))
        else:
            # An empty scope is the whole library, which `plan` counts by itself;
            # reading its present files here too would be the same scan twice.
            track_ids = (
                {track for track, _, _ in self._repository.present_files(scope)}
                if scope
                else None
            )
            try:
                plan = self._analysis.plan(limit=0, ordered=False, track_ids=track_ids)
            except WaveformStoreError as exc:
                _logger.warning("[statistics] The analysis could not be read: %s", exc)
                files = waiting = len(self._repository.present_files(scope))
            else:
                analyzed, failed = plan.analysed, plan.failed
                waiting, files = plan.remaining, plan.present
        return {
            "analyzed": analyzed,
            "failed": failed,
            "waiting": waiting,
            "no_file": total - files,
        }

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
