#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What fits at a point in a Set, as the engine serializes it (PREP-04, DEC-105).

The rule is ``core.similarity.fit``; this is what a caller receives. It follows
Similar Tracks' answer (``models/similar_tracks.py``) on purpose, so the
renderer's reason words (``similarReasons.ts``) serve both:

- each suggestion's reasons are the same wire objects, kept **per side**: what
  the candidate shares with the track before the gap, and with the track after
  it;
- ``in_set`` says how many times a suggested track is already in the Set, which
  is marked and never hidden (DEC-105, DEC-017);
- ``no_fit`` explains an empty answer whose cause is the neighbours themselves:
  their tempos are too far apart for anything to pass both gates. It carries the
  gap in percent and the key relation between them, and the gate is never
  loosened to fill the list;
- ``bpm_range`` says when the chapter's BPM range narrowed the pool.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional, Tuple

from cuepoint.models.row_values import non_negative, optional_id, required_id

#: The two sides of a gap, as the answer names them.
SIDE_BEFORE = "before"
SIDE_AFTER = "after"
SIDES: Tuple[str, ...] = (SIDE_BEFORE, SIDE_AFTER)


@dataclass(frozen=True)
class SideFit:
    """A candidate against one neighbour: DEC-096's score and its reasons.

    Attributes:
        score: The candidate's score against this neighbour; 0 when that
            neighbour has no BPM and shares nothing with it.
        reasons: Each reason as its wire object, in component order.
    """

    score: float
    reasons: Tuple[Mapping[str, Any], ...]

    def to_dict(self) -> Dict[str, Any]:
        """The side on the wire."""
        return {"score": self.score, "reasons": [dict(r) for r in self.reasons]}


@dataclass(frozen=True)
class SlotSuggestion:
    """One track suggested for a gap.

    Attributes:
        track_id: The library track suggested.
        score: The mean of the fitted sides' scores.
        in_set: How many times the track is already in the Set; 0 when it is
            not.
        before: The fit against the track before the gap, or None when that
            side was not fitted.
        after: The fit against the track after it, likewise.
    """

    track_id: int
    score: float
    in_set: int
    before: Optional[SideFit]
    after: Optional[SideFit]

    def to_dict(self) -> Dict[str, Any]:
        """The suggestion on the wire."""
        return {
            "track_id": self.track_id,
            "score": self.score,
            "in_set": self.in_set,
            SIDE_BEFORE: None if self.before is None else self.before.to_dict(),
            SIDE_AFTER: None if self.after is None else self.after.to_dict(),
        }


@dataclass(frozen=True)
class NoFit:
    """Why nothing can fit a gap: its neighbours' tempos are too far apart.

    Attributes:
        from_bpm: The effective BPM of the track before the gap.
        to_bpm: The effective BPM of the track after it.
        gap_percent: How far apart they are, as heard, in percent of the first
            (``core.similarity.tempo_gap``).
        from_key: The key before, in the library's notation, or None.
        to_key: The key after, likewise.
        key_relation: How the two keys relate on the wheel (``same``,
            ``adjacent`` or ``relative``), or None when they do not or either
            is unknown.
    """

    from_bpm: float
    to_bpm: float
    gap_percent: float
    from_key: Optional[str]
    to_key: Optional[str]
    key_relation: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        """The explanation on the wire."""
        return {
            "tempo": {
                "from": self.from_bpm,
                "to": self.to_bpm,
                "gap_percent": self.gap_percent,
            },
            "key": None
            if self.from_key is None or self.to_key is None
            else {
                "from": self.from_key,
                "to": self.to_key,
                "relation": self.key_relation,
            },
        }


@dataclass(frozen=True)
class BpmRange:
    """The chapter's BPM range that narrowed the pool (DEC-103, DEC-105).

    Attributes:
        chapter_id: The chapter whose range it is.
        low: The lowest tempo, or None when open.
        high: The highest tempo, or None when open.
    """

    chapter_id: int
    low: Optional[float]
    high: Optional[float]

    def holds(self, bpm: Optional[float]) -> bool:
        """True when a tempo is inside the range; an unknown tempo never is."""
        if bpm is None:
            return False
        return (self.low is None or bpm >= self.low) and (
            self.high is None or bpm <= self.high
        )

    def to_dict(self) -> Dict[str, Any]:
        """The range on the wire."""
        return {"chapter_id": self.chapter_id, "min": self.low, "max": self.high}


@dataclass(frozen=True)
class SetSuggestions:
    """What fits at one point in a Set, best first.

    Attributes:
        set_id: The Set.
        before_entry_id: The entry before the gap, or None at the start.
        after_entry_id: The entry after it, or None at the end.
        sides: The sides the candidates were fitted against, in order.
        chapter_id: The chapter an entry put in the gap would join.
        bpm_range: The chapter's range when it narrowed the pool, or None.
        notation: The key notation reasons are written in.
        unused: Per fitted side, the components that neighbour has no value
            for, which no suggestion can have scored on against it.
        considered: How many candidates were scored.
        duplicates_excluded: How many of the neighbours' duplicates (DEC-074)
            were left out.
        index_current: False while the credit index is being rebuilt, when
            shared artists may be missed.
        no_fit: Why the answer is empty when the neighbours cannot be bridged,
            or None.
        suggestions: The suggestions, by score and then by track id.
    """

    set_id: int
    before_entry_id: Optional[int]
    after_entry_id: Optional[int]
    sides: Tuple[str, ...]
    chapter_id: int
    bpm_range: Optional[BpmRange]
    notation: str
    unused: Mapping[str, Tuple[str, ...]]
    considered: int
    duplicates_excluded: int
    index_current: bool
    no_fit: Optional[NoFit]
    suggestions: Tuple[SlotSuggestion, ...]

    def __post_init__(self) -> None:
        """Validate the ids and counts."""
        required_id(self.set_id, "set_id")
        optional_id(self.before_entry_id, "before_entry_id")
        optional_id(self.after_entry_id, "after_entry_id")
        required_id(self.chapter_id, "chapter_id")
        non_negative(self.considered, "considered")
        non_negative(self.duplicates_excluded, "duplicates_excluded")
        if not self.sides or any(side not in SIDES for side in self.sides):
            raise ValueError(f"sides must be some of {SIDES}, got {self.sides!r}")
        if self.no_fit is not None and self.suggestions:
            raise ValueError("A gap nothing can fit has no suggestions")

    def to_dict(self) -> Dict[str, Any]:
        """The answer on the wire."""
        return {
            "set_id": self.set_id,
            "before_entry_id": self.before_entry_id,
            "after_entry_id": self.after_entry_id,
            "sides": list(self.sides),
            "chapter_id": self.chapter_id,
            "bpm_range": None if self.bpm_range is None else self.bpm_range.to_dict(),
            "notation": self.notation,
            "unused": {side: list(names) for side, names in self.unused.items()},
            "considered": self.considered,
            "duplicates_excluded": self.duplicates_excluded,
            "index_current": self.index_current,
            "no_fit": None if self.no_fit is None else self.no_fit.to_dict(),
            "suggestions": [s.to_dict() for s in self.suggestions],
        }


__all__ = (
    "SIDES",
    "SIDE_AFTER",
    "SIDE_BEFORE",
    "BpmRange",
    "NoFit",
    "SetSuggestions",
    "SideFit",
    "SlotSuggestion",
)
