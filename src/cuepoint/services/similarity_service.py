#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Similar Tracks over the library (DISCOVER-08, DEC-096).

The rule is ``core.similarity``; this service feeds it the library and writes
its answer down. It reads, and never writes: no token, no network, nothing in
the library tables (the phase's acceptance point 10).

How a list is made
------------------
1. **The seed** is read as the values a user sees (DEC-068): the effective
   BPM, key, genre and label, and the artists DISCOVER-03's credit index holds.
2. **Candidates are pre-selected in SQL.** A seed with a BPM gathers the tracks
   in its tempo windows — close, half and double time — because the rule
   refuses every other track anyway. A seed without one gathers the tracks
   that share its genre, label or an artist, or have a key compatible with its
   own: each compared by the spellings the library actually holds whose name
   key or parsed key is the seed's, so the pre-selection is exact and not
   a guess ``LIKE`` would make.
3. **The seed and its duplicates are left out**: the tracks in any duplicate
   group shown with the seed (DEC-074). "The same track again" is not a
   suggestion. A group the user dismissed is not a duplicate.
4. **Every candidate is scored** by ``core.similarity.rank``, which decides
   the edge of each window and orders by score, then by track id.
5. **Reasons are written as data**: keys in the library's own notation
   (``key_notation_of``, the notation overrides are stored in), and genres,
   labels and artists as the seed spells them.

A scope
-------
Optional, and the Library's: a ``BrowseQuery`` whose Collection, playlist,
rules and text narrow the candidates exactly as they narrow the table. Phase 10
passes one; Phase 9 draws the whole library. The seed need not be in the scope.

What was measured
-----------------
DISCOVER-08's outcome records the worst case, a seed in the densest tempo band
of a 50,000-track library, against :data:`DENSE_BAND_BUDGET_SECONDS`.
"""

from __future__ import annotations

import math
from functools import lru_cache
from typing import (
    Any,
    Callable,
    Dict,
    FrozenSet,
    Iterable,
    List,
    Mapping,
    Optional,
    Tuple,
)

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION, name_key
from cuepoint.core.similarity import (
    COMPONENT_ARTIST,
    COMPONENT_GENRE,
    COMPONENT_KEY,
    COMPONENT_LABEL,
    COMPONENT_TEMPO,
    MusicalKey,
    Reason,
    Suggestion,
    Traits,
    compatible_keys,
    rank,
    tempo_ranges,
    unused_components,
)
from cuepoint.models.similar_tracks import (
    DEFAULT_SIMILAR_LIMIT,
    MAX_SIMILAR_LIMIT,
    SimilarTrack,
    SimilarTracks,
    TraitRow,
)
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services.interfaces import (
    ISimilarityRepository,
    ISimilarityService,
    ITrackCreditRepository,
    ITrackRepository,
)
from cuepoint.services.override_values import (
    BPM_DECIMALS,
    format_key,
    notation_from_counts,
    parse_key,
)

#: How much wider than the rule's tempo windows the SQL pre-selection reads, in
#: BPM. A window's edge is a product of floats, and SQLite and Python may round
#: it one ulp apart; reading a hair more and letting the rule decide the edge
#: means the pre-selection can never lose a track the rule would keep.
TEMPO_SLACK_BPM = 0.01

#: The budget for the worst case: a Similar Tracks list for a seed in the
#: densest tempo band of a 50,000-track library, where the tempo window holds
#: most of the library. DISCOVER-08's outcome records the measurement.
DENSE_BAND_BUDGET_SECONDS = 0.5


@lru_cache(maxsize=1024)
def _parsed_key(text: str) -> Optional[MusicalKey]:
    """A key as the rule reads it, or None for text that is not a key.

    Remembered: a library writes its few dozen key spellings tens of thousands
    of times, and a dense band parses each of them once rather than per track.
    """
    parsed = parse_key(text)
    return None if parsed is None else MusicalKey(*parsed)


def _key(value: Any) -> Optional[MusicalKey]:
    return _parsed_key(value) if isinstance(value, str) else None


@lru_cache(maxsize=4096)
def _named(text: str) -> Optional[str]:
    return (name_key(text) or None) if text.strip() else None


def _name(value: Any) -> Optional[str]:
    """A genre's or label's name key, or None when it has none.

    Remembered for the reason keys are: a library has a few hundred genres and
    labels, each on hundreds of tracks.
    """
    return _named(value) if isinstance(value, str) else None


def _bpm(value: Any) -> Optional[float]:
    """A tempo the rule can read: a positive finite number, else none."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) and number > 0 else None


_NO_ARTISTS: FrozenSet[str] = frozenset()


def traits_of(row: TraitRow) -> Traits:
    """A row's values as the rule reads them.

    Anything that is not a value the rule can use — a BPM of zero, a key that
    is not a key, a blank genre — is no value, as it is to a person reading the
    row.
    """
    return Traits(
        bpm=_bpm(row.bpm),
        key=_key(row.key),
        genre_key=_name(row.genre),
        label_key=_name(row.label),
        artist_keys=frozenset(row.artist_keys) if row.artist_keys else _NO_ARTISTS,
    )


def _limit(limit: Any) -> int:
    if (
        isinstance(limit, bool)
        or not isinstance(limit, int)
        or not 1 <= limit <= MAX_SIMILAR_LIMIT
    ):
        raise ValueError(
            f"limit must be a whole number from 1 to {MAX_SIMILAR_LIMIT}, got {limit!r}"
        )
    return int(limit)


def _seed_id(track_id: Any) -> int:
    if isinstance(track_id, bool) or not isinstance(track_id, int) or track_id < 1:
        raise ValueError(f"A track id is a positive whole number, got {track_id!r}")
    return int(track_id)


class _Writer:
    """Writes a seed's reasons as their wire objects."""

    def __init__(self, seed: TraitRow, notation: str, names: Mapping[str, str]):
        self._seed = seed
        self._notation = notation
        self._names = names

    def _key(self, value: Any) -> str:
        assert isinstance(value, MusicalKey)
        return format_key(value.pitch, value.minor, self._notation)

    def reason(self, reason: Reason) -> Dict[str, Any]:
        wire: Dict[str, Any] = {
            "component": reason.component,
            "detail": reason.detail,
            "points": reason.points,
        }
        if reason.component == COMPONENT_TEMPO:
            assert isinstance(reason.seed_value, float)
            assert isinstance(reason.candidate_value, float)
            wire["from"] = round(reason.seed_value, BPM_DECIMALS)
            wire["to"] = round(reason.candidate_value, BPM_DECIMALS)
        elif reason.component == COMPONENT_KEY:
            wire["from"] = self._key(reason.seed_value)
            wire["to"] = self._key(reason.candidate_value)
        elif reason.component == COMPONENT_GENRE:
            wire["name"] = (self._seed.genre or "").strip()
        elif reason.component == COMPONENT_LABEL:
            wire["name"] = (self._seed.label or "").strip()
        elif reason.component == COMPONENT_ARTIST:
            assert isinstance(reason.seed_value, tuple)
            shared = set(reason.seed_value)
            wire["names"] = [name for key, name in self._names.items() if key in shared]
        return wire

    def suggestion(self, suggestion: Suggestion) -> SimilarTrack:
        return SimilarTrack(
            track_id=suggestion.track_id,
            score=suggestion.score,
            reasons=tuple(self.reason(r) for r in suggestion.similarity.reasons),
        )


class SimilarityService(ISimilarityService):
    """Similar Tracks: a deterministic, explained list from the library."""

    def __init__(
        self,
        repository: ISimilarityRepository,
        credits: ITrackCreditRepository,
        tracks: ITrackRepository,
    ) -> None:
        self._repository = repository
        self._credits = credits
        self._tracks = tracks

    def similar(
        self,
        track_id: int,
        *,
        scope: Optional[BrowseQuery] = None,
        limit: int = DEFAULT_SIMILAR_LIMIT,
    ) -> SimilarTracks:
        """A seed's suggestions, best first, each with its reasons.

        Args:
            track_id: The seed, a library track.
            scope: What the candidates are restricted to; the whole library
                when None.
            limit: How many suggestions at most, 1 to
                :data:`~cuepoint.models.similar_tracks.MAX_SIMILAR_LIMIT`.

        Raises:
            ValueError: If the id or the limit is not one, or the scope is
                refused as a browse of it would be.
            LookupError: If there is no such track.
        """
        seed_id = _seed_id(track_id)
        wanted = _limit(limit)
        row = self._repository.seed(seed_id)
        if row is None:
            raise LookupError(f"There is no track {seed_id} in the library")
        seed = traits_of(row)
        duplicates = self._repository.duplicates_of(seed_id)
        exclude = sorted({seed_id, *duplicates})

        considered = 0

        def counted(rows: Iterable[TraitRow]) -> Iterable[Tuple[int, Traits]]:
            nonlocal considered
            for candidate in rows:
                considered += 1
                yield candidate.track_id, traits_of(candidate)

        rows = self._candidates(scope or BrowseQuery(), seed, exclude)
        suggestions = rank(seed, counted(rows), wanted, exclude=exclude)

        notation = notation_from_counts(*self._tracks.key_notation_counts())
        names: Dict[str, str] = {}
        for credit in self._credits.credits(seed_id):
            names.setdefault(credit.name_key, credit.name)
        writer = _Writer(row, notation, names)
        return SimilarTracks(
            seed_id=seed_id,
            notation=notation,
            unused=unused_components(seed),
            considered=considered,
            duplicates_excluded=len(duplicates),
            index_current=self._credits.is_current(ENTITY_NAMES_VERSION),
            suggestions=tuple(writer.suggestion(s) for s in suggestions),
        )

    def _candidates(
        self, scope: BrowseQuery, seed: Traits, exclude: List[int]
    ) -> Iterable[TraitRow]:
        """The rows worth scoring for ``seed``: the pre-selection, in SQL."""
        if seed.bpm is not None:
            return self._repository.candidates(
                scope,
                tempo_ranges=[
                    (low - TEMPO_SLACK_BPM, high + TEMPO_SLACK_BPM)
                    for low, high in tempo_ranges(seed.bpm)
                ],
                credits_among=sorted(seed.artist_keys),
                exclude=exclude,
            )
        compatible = set(compatible_keys(seed.key)) if seed.key is not None else set()
        return self._repository.candidates(
            scope,
            genres=self._spelled("genre", lambda v: _name(v) == seed.genre_key)
            if seed.genre_key is not None
            else (),
            labels=self._spelled("label", lambda v: _name(v) == seed.label_key)
            if seed.label_key is not None
            else (),
            keys=self._spelled("key", lambda v: _key(v) in compatible)
            if compatible
            else (),
            artist_keys=sorted(seed.artist_keys),
            credits_among=sorted(seed.artist_keys),
            exclude=exclude,
        )

    def _spelled(self, field: str, wanted: Callable[[str], bool]) -> List[str]:
        """The library's spellings of ``field`` that ``wanted`` keeps."""
        return [value for value in self._repository.spellings(field) if wanted(value)]


__all__ = (
    "DENSE_BAND_BUDGET_SECONDS",
    "TEMPO_SLACK_BPM",
    "SimilarityService",
    "traits_of",
)
