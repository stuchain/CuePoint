#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What makes one track similar to another (DISCOVER-08, DEC-096).

The rule and nothing else: no SQL, no I/O, no notation. A caller reads each
track's effective values into :class:`Traits`, and :func:`score` answers how
similar a candidate is to a seed, with every reason it scored. Phase 9's
Similar Tracks list and Phase 10's Set Builder call the same two functions, so
"similar" means one thing wherever CuePoint says it.

The components
--------------
Each is a named constant below, not a setting, for DEC-067's reason: a rule
whose weights move is a rule nobody can review.

- **Tempo.** A candidate within :data:`TEMPO_WINDOW_PERCENT` of the seed's BPM
  scores by closeness, from :data:`TEMPO_POINTS_MAX` at the same tempo down to
  :data:`TEMPO_POINTS_MIN` at the window's edge. Half and double time are
  counted as close — a track at 64 is two bars of 128 — and say so.
- **Key**, on the Camelot wheel: the same key; one step either way in the same
  mode; or the relative major or minor. Each is its own reason, because "one
  step on the wheel" is a different mix from "the same key".
- **Genre**, **label** and **shared artist**, each compared by name key
  (``core.entity_names``), so two spellings of one label are one label.

The gate
--------
When the seed has a BPM, tempo is not only a component but the condition: a
candidate outside the window, or with no BPM, is not a suggestion however much
else it shares. A DJ asking what goes with a 124 BPM track is not asking for a
track at 90 on the same label. When the seed has no BPM, the gate is having any
reason at all, and :func:`unused_components` says what the seed could not
offer — DEC-096's "and says so".

A service may pre-select candidates in SQL (by :func:`tempo_ranges`, or by
what the seed shares), but this module decides: a candidate a pre-selection
let through is scored here, and one this module refuses is not suggested.

The order
---------
:func:`rank` orders by score, highest first, then by track id, so the same
library gives the same list every time (DEC-096). Scores are rounded to
:data:`SCORE_DECIMALS` places, the precision a person reads, so two candidates
a person would call equal tie and fall to their ids rather than to the
thirteenth decimal of a float.

This module imports nothing from CuePoint, so every layer can use it.
"""

from __future__ import annotations

import heapq
import math
from functools import cached_property
from dataclasses import dataclass, field
from typing import FrozenSet, Iterable, List, Optional, Sequence, Tuple, Union

# --------------------------------------------------------------- vocabulary

#: The components, in the order a reason list is written in.
COMPONENT_TEMPO = "tempo"
COMPONENT_KEY = "key"
COMPONENT_GENRE = "genre"
COMPONENT_LABEL = "label"
COMPONENT_ARTIST = "artist"
COMPONENTS: Tuple[str, ...] = (
    COMPONENT_TEMPO,
    COMPONENT_KEY,
    COMPONENT_GENRE,
    COMPONENT_LABEL,
    COMPONENT_ARTIST,
)

#: Tempo details: the same BPM, a close one, or half or double time.
TEMPO_SAME = "same"
TEMPO_CLOSE = "close"
TEMPO_HALF = "half"
TEMPO_DOUBLE = "double"

#: Key details: the same key, one step on the wheel, or the relative key.
KEY_SAME = "same"
KEY_ADJACENT = "adjacent"
KEY_RELATIVE = "relative"

#: The detail of a genre or label in common.
SAME = "same"

#: The detail of an artist in common.
SHARED = "shared"

#: Every reason :func:`score` can give, as ``(component, detail)``. The renderer
#: has words for each (``similarReasons.ts``), and a test holds the two lists
#: together from both sides, so a reason added here without words fails.
REASONS: Tuple[Tuple[str, str], ...] = (
    (COMPONENT_TEMPO, TEMPO_SAME),
    (COMPONENT_TEMPO, TEMPO_CLOSE),
    (COMPONENT_TEMPO, TEMPO_HALF),
    (COMPONENT_TEMPO, TEMPO_DOUBLE),
    (COMPONENT_KEY, KEY_SAME),
    (COMPONENT_KEY, KEY_ADJACENT),
    (COMPONENT_KEY, KEY_RELATIVE),
    (COMPONENT_GENRE, SAME),
    (COMPONENT_LABEL, SAME),
    (COMPONENT_ARTIST, SHARED),
)

# ------------------------------------------------------------------ weights

#: How far from the seed's BPM a candidate may be, as a percentage of it. Six
#: per cent is a turntable's classic pitch range: what a DJ can reach without
#: the track sounding like a different track.
TEMPO_WINDOW_PERCENT = 6.0

#: Points for a candidate at the seed's tempo, and at the window's edge. The
#: edge still scores: it is in the window, which is a reason.
TEMPO_POINTS_MAX = 30.0
TEMPO_POINTS_MIN = 10.0

#: Points for each key relation. The same key mixes cleanest; a step on the
#: wheel and the relative key are the two moves harmonic mixing calls safe.
KEY_POINTS = {KEY_SAME: 25.0, KEY_ADJACENT: 20.0, KEY_RELATIVE: 20.0}

#: Points for a genre, a label and at least one artist in common. An artist is
#: counted once however many are shared: a remix by the same two people is one
#: connection, not two.
GENRE_POINTS = 20.0
LABEL_POINTS = 10.0
ARTIST_POINTS = 15.0

#: The largest score the components can add up to.
MAX_SCORE = (
    TEMPO_POINTS_MAX
    + max(KEY_POINTS.values())
    + GENRE_POINTS
    + LABEL_POINTS
    + ARTIST_POINTS
)

#: The precision of a score and of each reason's points.
SCORE_DECIMALS = 1

#: Two BPMs this close are the same tempo: Rekordbox and Beatport both show
#: two decimals, so a difference below the third is not one anyone can see.
SAME_TEMPO_BPM = 0.005


# -------------------------------------------------------------------- keys


@dataclass(frozen=True, order=True)
class MusicalKey:
    """A key as a pitch class and a mode.

    Attributes:
        pitch: The tonic's pitch class, 0 (C) to 11 (B).
        minor: True for a minor key.
    """

    pitch: int
    minor: bool

    def __post_init__(self) -> None:
        """Refuse a pitch class that is not one."""
        if (
            isinstance(self.pitch, bool)
            or not isinstance(self.pitch, int)
            or not 0 <= self.pitch <= 11
        ):
            raise ValueError(f"pitch must be a pitch class 0-11, got {self.pitch!r}")
        if not isinstance(self.minor, bool):
            raise ValueError(f"minor must be True or False, got {self.minor!r}")

    @cached_property
    def camelot(self) -> Tuple[int, str]:
        """The key's place on the Camelot wheel: ``(1…12, "A" or "B")``.

        The wheel is the circle of fifths: a step is seven semitones, and 8A is
        A minor, 8B C major. Seven is its own inverse modulo twelve, which is
        why one multiplication walks the wheel in either direction.
        """
        tonic = 9 if self.minor else 0
        return (((self.pitch - tonic) * 7) % 12 + 7) % 12 + 1, (
            "A" if self.minor else "B"
        )

    @classmethod
    def from_camelot(cls, number: int, letter: str) -> "MusicalKey":
        """The key at a place on the wheel."""
        if not 1 <= number <= 12 or letter not in ("A", "B"):
            raise ValueError(f"{number}{letter} is not a Camelot code")
        minor = letter == "A"
        tonic = 9 if minor else 0
        return cls(((number - 8) * 7 + tonic) % 12, minor)


def key_relation(seed: MusicalKey, candidate: MusicalKey) -> Optional[str]:
    """How two keys are related on the wheel, or None when they are not.

    One step either way wraps: 12A and 1A are neighbours.
    """
    seed_number, seed_letter = seed.camelot
    number, letter = candidate.camelot
    if seed == candidate:
        return KEY_SAME
    if letter == seed_letter and (number - seed_number) % 12 in (1, 11):
        return KEY_ADJACENT
    if number == seed_number:
        return KEY_RELATIVE
    return None


def compatible_keys(key: MusicalKey) -> Tuple[MusicalKey, ...]:
    """Every key :func:`key_relation` relates to ``key``, the key itself first."""
    number, letter = key.camelot
    other = "B" if letter == "A" else "A"
    return (
        key,
        MusicalKey.from_camelot(number % 12 + 1, letter),
        MusicalKey.from_camelot((number - 2) % 12 + 1, letter),
        MusicalKey.from_camelot(number, other),
    )


# ------------------------------------------------------------------ traits


@dataclass(frozen=True)
class Traits:
    """What the rule reads of one track: its effective values (DEC-068).

    Attributes:
        bpm: The tempo, or None when the track has none. Zero, which is how an
            unanalysed track often arrives, is none.
        key: The key, or None.
        genre_key: The genre's name key, or None.
        label_key: The label's name key, or None.
        artist_keys: The name keys of every artist the track credits.
    """

    bpm: Optional[float] = None
    key: Optional[MusicalKey] = None
    genre_key: Optional[str] = None
    label_key: Optional[str] = None
    artist_keys: FrozenSet[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        """Read "no value" one way, and refuse a tempo that is not one.

        Written to cost little when there is nothing to change, because a
        dense tempo band builds tens of thousands of these: each field is
        rewritten only when it is not already in its one form.
        """
        bpm = self.bpm
        if bpm is not None:
            if type(bpm) is not float:
                if isinstance(bpm, bool) or not isinstance(bpm, (int, float)):
                    raise ValueError(f"bpm must be a number, got {bpm!r}")
                bpm = float(bpm)
            if not math.isfinite(bpm) or bpm < 0:
                raise ValueError(f"bpm must be a finite tempo, got {self.bpm!r}")
            if bpm == 0:
                bpm = None
            if bpm is not self.bpm:
                object.__setattr__(self, "bpm", bpm)
        if self.key is not None and type(self.key) is not MusicalKey:
            raise ValueError(f"key must be a MusicalKey, got {self.key!r}")
        if not self.genre_key and self.genre_key is not None:
            object.__setattr__(self, "genre_key", None)
        if not self.label_key and self.label_key is not None:
            object.__setattr__(self, "label_key", None)
        keys = self.artist_keys
        if type(keys) is not frozenset or "" in keys:
            object.__setattr__(self, "artist_keys", frozenset(k for k in keys if k))


def unused_components(seed: Traits) -> Tuple[str, ...]:
    """The components a seed has no value for, in :data:`COMPONENTS` order."""
    has = {
        COMPONENT_TEMPO: seed.bpm is not None,
        COMPONENT_KEY: seed.key is not None,
        COMPONENT_GENRE: seed.genre_key is not None,
        COMPONENT_LABEL: seed.label_key is not None,
        COMPONENT_ARTIST: bool(seed.artist_keys),
    }
    return tuple(name for name in COMPONENTS if not has[name])


def tempo_ranges(bpm: float) -> Tuple[Tuple[float, float], ...]:
    """The BPMs a candidate may have for a seed at ``bpm``: close, half, double.

    For a pre-selection, which should widen them by a hair so a float at the
    edge is not lost to rounding; :func:`score` decides the edge.
    """
    low = bpm * (1 - TEMPO_WINDOW_PERCENT / 100)
    high = bpm * (1 + TEMPO_WINDOW_PERCENT / 100)
    return ((low, high), (low / 2, high / 2), (low * 2, high * 2))


# ------------------------------------------------------------------ reasons

#: What a reason carries about the seed and the candidate: a BPM, a key, or
#: the shared artists' keys.
ReasonValue = Union[float, MusicalKey, Tuple[str, ...], None]


@dataclass(frozen=True)
class Reason:
    """One thing a candidate has in common with the seed.

    Data, not prose (DEC-096): the renderer turns it into words, in the
    library's key notation, and the service fills in names.

    Attributes:
        component: One of :data:`COMPONENTS`.
        detail: What the component found; ``(component, detail)`` is one of
            :data:`REASONS`.
        points: What it added to the score.
        seed_value: The seed's BPM or key; for an artist, the shared keys.
        candidate_value: The candidate's BPM or key.
    """

    component: str
    detail: str
    points: float
    seed_value: ReasonValue = None
    candidate_value: ReasonValue = None


@dataclass(frozen=True)
class Similarity:
    """How similar a candidate is to a seed, and why.

    ``score`` is the sum of the reasons' points, and the reasons are in
    :data:`COMPONENTS` order.
    """

    score: float
    reasons: Tuple[Reason, ...]


@dataclass(frozen=True)
class Suggestion:
    """A scored candidate, as :func:`rank` returns it."""

    track_id: int
    similarity: Similarity

    @property
    def score(self) -> float:
        """The candidate's score."""
        return self.similarity.score


def _points(value: float) -> float:
    return round(value, SCORE_DECIMALS)


#: One component's match before it is a :class:`Reason`: ``(component,
#: detail, points, seed value, candidate value)``. A plain tuple, because
#: :func:`rank` finds one for every candidate and keeps only a few.
_Match = Tuple[str, str, float, ReasonValue, ReasonValue]


def _tempo(seed: float, candidate: float) -> Optional[_Match]:
    """Tempo's match, or None when the candidate is outside every window."""
    window = TEMPO_WINDOW_PERCENT / 100
    for detail, heard in (
        (TEMPO_CLOSE, candidate),
        (TEMPO_HALF, candidate * 2),
        (TEMPO_DOUBLE, candidate / 2),
    ):
        distance = abs(heard - seed) / seed
        if distance > window:
            continue
        if detail == TEMPO_CLOSE and abs(candidate - seed) < SAME_TEMPO_BPM:
            detail = TEMPO_SAME
        points = TEMPO_POINTS_MIN + (TEMPO_POINTS_MAX - TEMPO_POINTS_MIN) * (
            1 - distance / window
        )
        return COMPONENT_TEMPO, detail, _points(points), seed, candidate
    return None


def _matches(seed: Traits, candidate: Traits) -> Optional[List[_Match]]:
    """Every component the two have in common, or None when not a suggestion.

    The rule, stated once: :func:`score` and :func:`rank` both read it.
    """
    matches: List[_Match] = []
    if seed.bpm is not None:
        if candidate.bpm is None:
            return None
        tempo = _tempo(seed.bpm, candidate.bpm)
        if tempo is None:
            return None
        matches.append(tempo)
    if seed.key is not None and candidate.key is not None:
        relation = key_relation(seed.key, candidate.key)
        if relation is not None:
            matches.append(
                (COMPONENT_KEY, relation, KEY_POINTS[relation], seed.key, candidate.key)
            )
    if seed.genre_key is not None and seed.genre_key == candidate.genre_key:
        matches.append((COMPONENT_GENRE, SAME, GENRE_POINTS, None, None))
    if seed.label_key is not None and seed.label_key == candidate.label_key:
        matches.append((COMPONENT_LABEL, SAME, LABEL_POINTS, None, None))
    if candidate.artist_keys:
        shared = seed.artist_keys & candidate.artist_keys
        if shared:
            matches.append(
                (COMPONENT_ARTIST, SHARED, ARTIST_POINTS, tuple(sorted(shared)), None)
            )
    return matches or None


def _total(matches: Sequence[_Match]) -> float:
    return _points(sum(match[2] for match in matches))


def _similarity(matches: Sequence[_Match]) -> Similarity:
    return Similarity(_total(matches), tuple(Reason(*match) for match in matches))


def score(seed: Traits, candidate: Traits) -> Optional[Similarity]:
    """How similar ``candidate`` is to ``seed``, or None when it is not a suggestion.

    None when the seed has a BPM and the candidate is outside the tempo window
    (the gate), or when nothing at all is in common.
    """
    matches = _matches(seed, candidate)
    return None if matches is None else _similarity(matches)


def rank(
    seed: Traits,
    candidates: Iterable[Tuple[int, Traits]],
    limit: int,
    *,
    exclude: Sequence[int] = (),
) -> List[Suggestion]:
    """The ``limit`` best suggestions among ``candidates``, by score then id.

    ``exclude`` names tracks that are never suggestions, whatever they score:
    the seed itself and its duplicates, for a caller that has not already left
    them out. Each suggestion is exactly what :func:`score` answers for it;
    only the ones kept are turned into reasons.

    Raises:
        ValueError: If ``limit`` is not a positive whole number.
    """
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise ValueError(f"limit must be a positive whole number, got {limit!r}")
    left_out = frozenset(exclude)

    def totals() -> Iterable[Tuple[float, int, List[_Match]]]:
        for track_id, traits in candidates:
            if track_id in left_out:
                continue
            matches = _matches(seed, traits)
            if matches is not None:
                yield -_total(matches), track_id, matches

    best = heapq.nsmallest(limit, totals(), key=lambda kept: (kept[0], kept[1]))
    return [Suggestion(track_id, _similarity(matches)) for _, track_id, matches in best]


__all__ = (
    "ARTIST_POINTS",
    "COMPONENTS",
    "COMPONENT_ARTIST",
    "COMPONENT_GENRE",
    "COMPONENT_KEY",
    "COMPONENT_LABEL",
    "COMPONENT_TEMPO",
    "GENRE_POINTS",
    "KEY_ADJACENT",
    "KEY_POINTS",
    "KEY_RELATIVE",
    "KEY_SAME",
    "LABEL_POINTS",
    "MAX_SCORE",
    "REASONS",
    "SAME",
    "SAME_TEMPO_BPM",
    "SCORE_DECIMALS",
    "SHARED",
    "TEMPO_CLOSE",
    "TEMPO_DOUBLE",
    "TEMPO_HALF",
    "TEMPO_POINTS_MAX",
    "TEMPO_POINTS_MIN",
    "TEMPO_SAME",
    "TEMPO_WINDOW_PERCENT",
    "MusicalKey",
    "Reason",
    "Similarity",
    "Suggestion",
    "Traits",
    "compatible_keys",
    "key_relation",
    "rank",
    "score",
    "tempo_ranges",
    "unused_components",
)
