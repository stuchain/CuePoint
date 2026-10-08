#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What fits at a point in a Set (PREP-04, DEC-105).

DEC-096's rule asked a second question. Similar Tracks asks "what is like this
track"; a Set Builder asks "what goes between these two", and the answer is the
same rule applied to each neighbour (``core.similarity.fit``). This service
feeds it a Set's gap and a pool, and writes the answer down. It reads, and
never writes.

The insertion point is two entries, not a position
--------------------------------------------------
A caller names the gap by the entry before it and the entry after it, either of
which may be None at an end of the Set. A position would silently aim at a
different gap once the Set changed under a view. Two entry ids either still
name adjacent entries, in that order, or the request is refused as stale
(:class:`InsertionPointError`), and the view reloads. An empty Set has nothing
to fit against, and a gap with no neighbour named is not a gap: both are
refused with a reason.

How an answer is made
---------------------
1. **The neighbours** are read as the values a user sees (DEC-068), as a seed
   is for Similar Tracks.
2. **The sides fitted.** Both neighbours present, by default. ``against``
   fits one side only, which is how DEC-105's "offers each side's own list"
   is asked for when the two sides cannot be bridged.
3. **No fit.** When both fitted sides have a BPM and no tempo passes both
   gates (``core.similarity.fit_tempo_ranges`` is empty), the answer is
   empty and says why: the tempo gap in percent and how the two keys relate.
   The gate is never loosened to fill the list.
4. **The chapter's BPM range** narrows the pool when the chapter the gap is in
   has one, and the answer says so. The chapter is the one an entry dropped
   there would join (PREP-02's rule), or the one the caller names, which must
   reach the gap as it would for an insert.
5. **The neighbours' tracks and their duplicates** (DEC-074) are left out.
   Every other track already in the Set is kept and carries how many times it
   is there (DEC-105, DEC-017).
6. **Candidates are pre-selected in SQL** by the intersection of the sides'
   tempo windows, or by what the sides share when neither has a BPM
   (``similarity_service.read_candidates``). **Every candidate is scored in
   Python** by ``core.similarity.rank_fits``, which decides the edges.
7. **Reasons are written** per side, as Similar Tracks writes a seed's, so
   the renderer's words serve both.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from cuepoint.core.entity_names import ENTITY_NAMES_VERSION
from cuepoint.core.similarity import (
    FitSuggestion,
    Similarity,
    Traits,
    fit_tempo_ranges,
    key_relation,
    rank_fits,
    tempo_gap,
    unused_components,
)
from cuepoint.models.set_plan import SetChapter, SetEntryRow
from cuepoint.models.set_suggestions import (
    SIDE_AFTER,
    SIDE_BEFORE,
    SIDES,
    BpmRange,
    NoFit,
    SetSuggestions,
    SideFit,
    SlotSuggestion,
)
from cuepoint.models.similar_tracks import (
    DEFAULT_SIMILAR_LIMIT,
    MAX_SIMILAR_LIMIT,
    TraitRow,
)
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.services.interfaces import (
    ICollectionRepository,
    ISetRepository,
    ISetSuggestionService,
    ISimilarityRepository,
    ITrackCreditRepository,
    ITrackRepository,
)
from cuepoint.services.override_values import (
    BPM_DECIMALS,
    format_key,
    NOTATION_CAMELOT,
)
from cuepoint.services.similarity_service import (
    ReasonWriter,
    read_candidates,
    traits_of,
)

#: Why an insertion point is refused, as :attr:`InsertionPointError.reason`.
EMPTY_SET = "empty_set"
NO_NEIGHBOUR = "no_neighbour"
STALE = "stale"
INSERTION_POINT_REASONS: Tuple[str, ...] = (EMPTY_SET, NO_NEIGHBOUR, STALE)

#: The budget for the worst case: both neighbours in the densest tempo band of
#: a 50,000-track library, the whole library as the pool (DISCOVER-08's
#: budget, which PREP-04 keeps). PREP-04's outcome records the measurement.
DENSE_GAP_BUDGET_SECONDS = 0.5


class InsertionPointError(ValueError):
    """A gap that cannot be fitted as named.

    A ``ValueError``, so every handler that answers a refusal with its message
    answers this one; :attr:`reason` lets the wire give it a code a view can
    act on, and a stale one is the view's cue to reload.

    Attributes:
        reason: One of :data:`INSERTION_POINT_REASONS`.
    """

    def __init__(self, reason: str, message: str) -> None:
        if reason not in INSERTION_POINT_REASONS:
            raise ValueError(f"Unknown insertion point reason: {reason!r}")
        self.reason = reason
        super().__init__(message)


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


def _entry_id(value: Any, name: str) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"{name} must be an entry id, got {value!r}")
    return int(value)


class _Side:
    """One neighbour of the gap: its entry, its values, and how to write it."""

    def __init__(self, entry: SetEntryRow, row: TraitRow, writer: ReasonWriter):
        self.entry = entry
        self.row = row
        self.traits: Traits = traits_of(row)
        self.writer = writer

    def written(self, similarity: Optional[Similarity]) -> Optional[SideFit]:
        if similarity is None:
            return None
        return SideFit(
            score=similarity.score,
            reasons=tuple(self.writer.reason(r) for r in similarity.reasons),
        )


class SetSuggestionService(ISetSuggestionService):
    """Suggestions for a gap in a Set: deterministic, explained, read only."""

    def __init__(
        self,
        collection_repository: ICollectionRepository,
        set_repository: ISetRepository,
        similarity_repository: ISimilarityRepository,
        credits: ITrackCreditRepository,
        tracks: ITrackRepository,
    ) -> None:
        """Wire the service to what it reads.

        Args:
            collection_repository: The Set's node and its chapters.
            set_repository: The Set's entries with their chapters.
            similarity_repository: Neighbours' values, candidates, spellings
                and duplicates, as Similar Tracks reads them.
            credits: The neighbours' credited artists, and whether the credit
                index is current.
            tracks: The library's key notation.
        """
        self._collections = collection_repository
        self._sets = set_repository
        self._similarity = similarity_repository
        self._credits = credits
        self._tracks = tracks

    def suggest(
        self,
        set_id: int,
        *,
        before_entry_id: Optional[int] = None,
        after_entry_id: Optional[int] = None,
        pool: Optional[BrowseQuery] = None,
        chapter_id: Optional[int] = None,
        against: Optional[str] = None,
        limit: int = DEFAULT_SIMILAR_LIMIT,
    ) -> SetSuggestions:
        """What fits between two adjacent entries of a Set, best first.

        Args:
            set_id: The Set.
            before_entry_id: The entry before the gap, or None at the start.
            after_entry_id: The entry after the gap, or None at the end.
            pool: The tracks to choose from, as the Library would show them:
                the whole library when None, or a Collection, a Smart
                Collection's rules or a Rekordbox playlist.
            chapter_id: The chapter the gap is in, for a gap on a chapter
                boundary; by default the chapter an insert there would join.
            against: ``"before"`` or ``"after"`` to fit one side only; both
                present sides when None.
            limit: How many suggestions at most, 1 to
                :data:`~cuepoint.models.similar_tracks.MAX_SIMILAR_LIMIT`.

        Raises:
            InsertionPointError: If the Set is empty, no neighbour is named, or
                the two named are no longer adjacent in that order.
            ValueError: If there is no such Set, the node is not one, an id,
                the limit or ``against`` is not one, the chapter named is not
                one the gap can be in, or the pool is refused as a browse of
                it would be.
        """
        wanted = _limit(limit)
        before_id = _entry_id(before_entry_id, "before_entry_id")
        after_id = _entry_id(after_entry_id, "after_entry_id")
        if against is not None and against not in SIDES:
            raise ValueError(f"against must be one of {SIDES} or None, got {against!r}")

        node = self._collections.get(int(set_id))
        if node is None:
            raise ValueError(f"No such Set: {set_id}")
        if not node.is_set:
            raise ValueError(f"{node.name!r} is a {node.kind}, not a Set")
        scope = self._similarity.check_scope(pool or BrowseQuery())

        rows = self._sets.entry_rows(int(set_id))
        chapters = self._collections.chapters(int(set_id))
        before, after = _neighbours(node.name, rows, before_id, after_id)
        if against == SIDE_BEFORE and before is None:
            raise ValueError("There is no entry before this gap to fit against")
        if against == SIDE_AFTER and after is None:
            raise ValueError("There is no entry after this gap to fit against")
        chapter = _chapter_of_gap(node.name, chapters, before, after, chapter_id)

        # Keys show in Camelot everywhere (DEC-201), whatever the imported file used.
        notation = NOTATION_CAMELOT
        sides: Dict[str, _Side] = {}
        for name, entry in ((SIDE_BEFORE, before), (SIDE_AFTER, after)):
            if entry is not None and against in (None, name):
                sides[name] = self._side(entry, notation)
        fitted_before = sides.get(SIDE_BEFORE)
        fitted_after = sides.get(SIDE_AFTER)

        neighbours = {e.track_id for e in (before, after) if e is not None}
        duplicates = self._duplicates(neighbours)
        bpm_range = (
            BpmRange(int(chapter.id or 0), chapter.bpm_min, chapter.bpm_max)
            if chapter.has_bpm_range
            else None
        )
        first = fitted_before.traits if fitted_before is not None else None
        second = fitted_after.traits if fitted_after is not None else None
        windows = _windows(first, second)

        no_fit: Optional[NoFit] = None
        suggestions: List[FitSuggestion] = []
        considered = 0
        if windows == () and fitted_before is not None and fitted_after is not None:
            no_fit = _no_fit(fitted_before, fitted_after, notation)
        else:
            suggestions, considered = self._ranked(
                scope,
                first,
                second,
                sorted(neighbours | duplicates),
                windows,
                bpm_range,
                wanted,
            )

        in_set = Counter(row.track_id for row in rows)
        return SetSuggestions(
            set_id=int(set_id),
            before_entry_id=before.entry_id if before is not None else None,
            after_entry_id=after.entry_id if after is not None else None,
            sides=tuple(sides),
            chapter_id=int(chapter.id or 0),
            bpm_range=bpm_range,
            notation=notation,
            unused={
                name: unused_components(side.traits) for name, side in sides.items()
            },
            considered=considered,
            duplicates_excluded=len(duplicates),
            index_current=self._credits.is_current(ENTITY_NAMES_VERSION),
            no_fit=no_fit,
            suggestions=tuple(
                SlotSuggestion(
                    track_id=s.track_id,
                    score=s.score,
                    in_set=in_set.get(s.track_id, 0),
                    before=_written(fitted_before, s.fit.before),
                    after=_written(fitted_after, s.fit.after),
                )
                for s in suggestions
            ),
        )

    def _duplicates(self, neighbours: Set[int]) -> Set[int]:
        """The tracks shown in a duplicate group with either neighbour (DEC-074)."""
        found: Set[int] = set()
        for track_id in sorted(neighbours):
            found.update(self._similarity.duplicates_of(track_id))
        return found - neighbours

    def _ranked(
        self,
        scope: BrowseQuery,
        first: Optional[Traits],
        second: Optional[Traits],
        exclude: List[int],
        windows: Optional[Tuple[Tuple[float, float], ...]],
        bpm_range: Optional[BpmRange],
        wanted: int,
    ) -> Tuple[List[FitSuggestion], int]:
        """The best fits in the pool, and how many candidates were scored.

        The pre-selection reads the tempo windows narrowed to the chapter's
        range, and the range itself is applied to every row read, because a
        pre-selection by what the sides share cannot narrow by tempo in SQL.
        """
        if windows is not None and bpm_range is not None:
            windows = _clipped(windows, bpm_range)
        considered = 0

        def counted(found: Iterable[TraitRow]) -> Iterable[Tuple[int, Traits]]:
            nonlocal considered
            for candidate in found:
                traits = traits_of(candidate)
                if bpm_range is not None and not bpm_range.holds(traits.bpm):
                    continue
                considered += 1
                yield candidate.track_id, traits

        seeds = [t for t in (first, second) if t is not None]
        found = read_candidates(self._similarity, scope, seeds, exclude, windows)
        ranked = rank_fits(first, second, counted(found), wanted, exclude=exclude)
        return ranked, considered

    def _side(self, entry: SetEntryRow, notation: str) -> _Side:
        """Read one neighbour as a seed, with the writer for its reasons."""
        row = self._similarity.seed(entry.track_id)
        if row is None:  # the entry's track is gone: the Set changed under us
            raise InsertionPointError(
                STALE, "The Set changed while it was read: reload it and try again"
            )
        names: Dict[str, str] = {}
        for credit in self._credits.credits(entry.track_id):
            names.setdefault(credit.name_key, credit.name)
        return _Side(entry, row, ReasonWriter(row, notation, names))


def _written(
    side: Optional[_Side], similarity: Optional[Similarity]
) -> Optional[SideFit]:
    """One side of a suggestion as the wire carries it, or None when not fitted."""
    return None if side is None else side.written(similarity)


def _windows(
    first: Optional[Traits], second: Optional[Traits]
) -> Optional[Tuple[Tuple[float, float], ...]]:
    """The tempos a candidate may have, or None when tempo does not restrict.

    None when no fitted side has a BPM. Empty when two sides have BPMs that no
    tempo can bridge, which is a gap nothing fits.
    """
    bpms = [t.bpm if t is not None else None for t in (first, second)]
    if all(bpm is None for bpm in bpms):
        return None
    return fit_tempo_ranges(bpms[0], bpms[1])


def _neighbours(
    name: str,
    rows: Sequence[SetEntryRow],
    before_id: Optional[int],
    after_id: Optional[int],
) -> Tuple[Optional[SetEntryRow], Optional[SetEntryRow]]:
    """The two entries around the gap, held to still being around it.

    Raises:
        InsertionPointError: If the Set is empty, no entry is named, an entry
            is no longer in the Set, or the two are no longer adjacent in that
            order, or no longer at the end they were named at.
    """
    if not rows:
        raise InsertionPointError(
            EMPTY_SET, f"{name!r} is empty: there is nothing to fit a track against"
        )
    if before_id is None and after_id is None:
        raise InsertionPointError(
            NO_NEIGHBOUR,
            "Name the entry before the gap, the entry after it, or both",
        )
    by_id = {row.entry_id: index for index, row in enumerate(rows)}
    stale = InsertionPointError(
        STALE, f"{name!r} has changed since this gap was chosen: reload it"
    )
    before_index = by_id.get(before_id) if before_id is not None else None
    after_index = by_id.get(after_id) if after_id is not None else None
    if (before_id is not None and before_index is None) or (
        after_id is not None and after_index is None
    ):
        raise stale
    if before_index is not None and after_index is not None:
        if after_index != before_index + 1:
            raise stale
    elif before_index is not None:
        if before_index != len(rows) - 1:
            raise stale
    elif after_index != 0:
        raise stale
    return (
        rows[before_index] if before_index is not None else None,
        rows[after_index] if after_index is not None else None,
    )


def _chapter_of_gap(
    name: str,
    chapters: Sequence[SetChapter],
    before: Optional[SetEntryRow],
    after: Optional[SetEntryRow],
    named: Optional[int],
) -> SetChapter:
    """The chapter an entry put in the gap would join (PREP-02's rule).

    The chapter of the entry before, or the Set's first chapter at the start;
    or the chapter named, which must reach the gap: at or after the chapter
    before it, and at or before the chapter after it.

    Raises:
        ValueError: If the named chapter is another Set's or does not reach the
            gap.
        InsertionPointError: If a neighbour's chapter is not among the Set's
            chapters, which a write between the two reads could cause.
    """
    by_id = {int(c.id or 0): c for c in chapters}
    try:
        low = by_id[before.plan.chapter_id] if before is not None else None
        high = by_id[after.plan.chapter_id] if after is not None else None
    except KeyError:
        raise InsertionPointError(
            STALE, "The Set changed while it was read: reload it and try again"
        ) from None
    if named is None:
        if low is not None:
            return low
        return min(chapters, key=lambda c: c.position)
    chapter = by_id.get(int(named))
    if chapter is None:
        raise ValueError(f"Chapter {named} is not a chapter of {name!r}")
    if (low is not None and chapter.position < low.position) or (
        high is not None and chapter.position > high.position
    ):
        raise ValueError(
            f"{chapter.label} does not reach this gap: a chapter's entries stay "
            "together"
        )
    return chapter


def _clipped(
    windows: Sequence[Tuple[float, float]], bpm_range: BpmRange
) -> Tuple[Tuple[float, float], ...]:
    """The tempo windows narrowed to a chapter's range; empty ones dropped."""
    low = bpm_range.low if bpm_range.low is not None else 0.0
    high = bpm_range.high if bpm_range.high is not None else float("inf")
    return tuple(
        (max(start, low), min(end, high))
        for start, end in windows
        if max(start, low) <= min(end, high)
    )


def _no_fit(before: _Side, after: _Side, notation: str) -> NoFit:
    """Why nothing bridges two neighbours: their tempo gap, and their keys."""
    first, second = before.traits, after.traits
    assert first.bpm is not None and second.bpm is not None
    from_key = to_key = relation = None
    if first.key is not None:
        from_key = format_key(first.key.pitch, first.key.minor, notation)
    if second.key is not None:
        to_key = format_key(second.key.pitch, second.key.minor, notation)
    if first.key is not None and second.key is not None:
        relation = key_relation(first.key, second.key)
    return NoFit(
        from_bpm=round(first.bpm, BPM_DECIMALS),
        to_bpm=round(second.bpm, BPM_DECIMALS),
        gap_percent=tempo_gap(first.bpm, second.bpm),
        from_key=from_key,
        to_key=to_key,
        key_relation=relation,
    )


__all__ = (
    "DENSE_GAP_BUDGET_SECONDS",
    "EMPTY_SET",
    "INSERTION_POINT_REASONS",
    "NO_NEIGHBOUR",
    "STALE",
    "InsertionPointError",
    "SetSuggestionService",
)
