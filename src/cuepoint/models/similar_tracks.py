#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Similar Tracks answer, as the engine serializes it (DISCOVER-08, DEC-096).

The rule is ``core.similarity``; this is what a caller receives: the seed, the
suggestions in order, each with its score and its reasons as data, and what
the seed could not offer. Suggestions are library track ids: fact 5 of the
phase specification has the renderer read their rows through the track-detail
path it already has, because a score is not a filter and the Library's browse
cannot order by one.

A reason on the wire
--------------------
A ``{component, detail, points}`` object and whatever its component carries,
keys spelled in the library's notation (``key_notation_of``):

- ``tempo`` — ``from`` and ``to``, the seed's and the candidate's BPM;
- ``key`` — ``from`` and ``to``, the two keys (``"8A"``, ``"9A"``);
- ``genre``, ``label`` — ``name``, the seed's own spelling;
- ``artist`` — ``names``, the shared artists as the seed credits them.

The renderer turns each into words (``similarReasons.ts``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, NamedTuple, Optional, Tuple

from cuepoint.models.row_values import non_negative, required_id

#: How many suggestions a list holds unless asked for fewer, and at most.
DEFAULT_SIMILAR_LIMIT = 50
MAX_SIMILAR_LIMIT = 200


class TraitRow(NamedTuple):
    """One track's effective values as the database holds them, unparsed.

    What the repository reads for a seed and for each candidate; the service
    parses it into ``core.similarity.Traits``. A tuple rather than a validated
    dataclass because a dense tempo band is tens of thousands of these, and
    each is read once and discarded.

    Attributes:
        track_id: The library track.
        bpm: The effective BPM (DEC-068), as stored.
        key: The effective key, in whatever notation it was written.
        genre: The effective genre.
        label: The effective label.
        artist_keys: The name keys of the credited artists and remixers: every
            one for a seed, and for a candidate the ones it shares with the
            seed, which is all the rule reads of it.
    """

    track_id: int
    bpm: Optional[float]
    key: Optional[str]
    genre: Optional[str]
    label: Optional[str]
    artist_keys: Tuple[str, ...]


@dataclass(frozen=True)
class SimilarTrack:
    """One suggestion.

    Attributes:
        track_id: The library track suggested.
        score: Its score, the sum of its reasons' points.
        reasons: Each reason as its wire object, in component order.
    """

    track_id: int
    score: float
    reasons: Tuple[Mapping[str, Any], ...]

    def to_dict(self) -> Dict[str, Any]:
        """The suggestion on the wire."""
        return {
            "track_id": self.track_id,
            "score": self.score,
            "reasons": [dict(reason) for reason in self.reasons],
        }


@dataclass(frozen=True)
class SimilarTracks:
    """A seed's suggestions, best first.

    Attributes:
        seed_id: The track the list is for.
        notation: The key notation the reasons are written in, ``classic`` or
            ``camelot``.
        unused: The components the seed has no value for, which no suggestion
            can have scored on.
        considered: How many candidates were scored.
        duplicates_excluded: How many of the seed's duplicates (DEC-074) were
            left out.
        index_current: False while the credit index is being rebuilt for a
            new name rule, when shared artists may be missed.
        suggestions: The suggestions, by score and then by track id.
    """

    seed_id: int
    notation: str
    unused: Tuple[str, ...]
    considered: int
    duplicates_excluded: int
    index_current: bool
    suggestions: Tuple[SimilarTrack, ...]

    def __post_init__(self) -> None:
        """Validate the counts."""
        required_id(self.seed_id, "seed_id")
        non_negative(self.considered, "considered")
        non_negative(self.duplicates_excluded, "duplicates_excluded")

    def to_dict(self) -> Dict[str, Any]:
        """The answer on the wire."""
        return {
            "seed_id": self.seed_id,
            "notation": self.notation,
            "unused": list(self.unused),
            "considered": self.considered,
            "duplicates_excluded": self.duplicates_excluded,
            "index_current": self.index_current,
            "suggestions": [track.to_dict() for track in self.suggestions],
        }


__all__ = (
    "DEFAULT_SIMILAR_LIMIT",
    "MAX_SIMILAR_LIMIT",
    "SimilarTrack",
    "SimilarTracks",
    "TraitRow",
)
