#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A track's cue points and beat grid, imported read-only from Rekordbox (WAVE-04).

DEC-118: the importer reads each ``COLLECTION/TRACK``'s ``POSITION_MARK`` and
``TEMPO`` children, stores them beside the track in ``m0026_track_marks``'s two
tables, and nothing in CuePoint edits them or writes them anywhere. They are
copies of Rekordbox's, replaced whole by every import and refresh.

Two forms, for two kinds of reader
----------------------------------
- **Values**, plain tuples (:data:`CueValues`, :data:`GridValues`), are what
  the XML reader produces and the import writes. A 50,000-track collection
  holds hundreds of thousands of marks, and the reader's budget is a tenth of
  the time it takes to read the tracks alone (fact 3 of WAVE-04's tests), so
  nothing is allocated per mark beyond the tuple that carries it.
- **Models**, :class:`TrackCue`, :class:`BeatGridMarker` and
  :class:`TrackMarks`, are what one track's marks are read back as, validated
  like every other model over CuePoint's tables.

The two are the same values in the same order, which is what lets a refresh
compare what it reads with what is stored (:func:`marks_fingerprint`).

Rekordbox's vocabulary, guarded
-------------------------------
``Type`` 0–4 are a cue, a fade-in, a fade-out, a load point and a loop.
``Num`` −1 is a memory cue and 0–7 are hot cues A–H. Anything else is a mark
CuePoint does not know, and it is skipped and counted, never stored under a
guess (DEC-118). The tables' ``CHECK`` constraints say the same.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, NamedTuple, Optional, Sequence, Tuple

from cuepoint.models.row_values import (
    non_negative,
    number,
    one_of,
    optional_whole_number,
    required_id,
)

KIND_CUE = "cue"
KIND_FADE_IN = "fade_in"
KIND_FADE_OUT = "fade_out"
KIND_LOAD = "load"
KIND_LOOP = "loop"

#: Every kind of mark, indexed by Rekordbox's ``Type``.
CUE_KINDS: Tuple[str, ...] = (
    KIND_CUE,
    KIND_FADE_IN,
    KIND_FADE_OUT,
    KIND_LOAD,
    KIND_LOOP,
)

#: The hot cue slots, indexed by Rekordbox's ``Num``. A memory cue has none.
HOT_CUE_LETTERS = "ABCDEFGH"

#: The latest time a mark may sit at, in milliseconds: about 24.8 days, the
#: largest a signed 32-bit integer holds. Far past any track, and a value
#: every reader of the API can hold exactly.
MAX_MARK_MS = 2**31 - 1

#: The ``derived_indexes`` row that records the library's marks have been read
#: (``library.marks_read``). Written by an import, a refresh apply and the
#: backfill, in the transaction that writes the marks.
MARKS_INDEX = "track_marks"

#: The version of the reading rule. A change to what is read, or how, bumps it,
#: and a library read by another version has its marks read again from its
#: source, as one upgraded from before WAVE-04 does.
MARKS_VERSION = 1

#: One cue as the reader and the import carry it:
#: ``(kind, hot_cue, start_ms, end_ms, name, color)``.
CueValues = Tuple[str, Optional[int], int, Optional[int], Optional[str], Optional[str]]

#: One beat grid marker: ``(start_ms, bpm, meter, beat)``.
GridValues = Tuple[int, float, Optional[str], Optional[int]]


class ReadMarks(NamedTuple):
    """What the reader found on one ``TRACK``.

    Attributes:
        cues: Every ``POSITION_MARK`` kept, in document order.
        grid: Every ``TEMPO`` kept, in document order. Several are a variable
            grid.
        skipped: Marks refused as unknown or malformed. Counted for the import
            summary, never stored.
    """

    cues: Tuple[CueValues, ...] = ()
    grid: Tuple[GridValues, ...] = ()
    skipped: int = 0


#: A track with no marks. Shared, since most of what a reader sees is this.
NO_MARKS = ReadMarks()


def marks_fingerprint(cues: Sequence[CueValues], grid: Sequence[GridValues]) -> bytes:
    """A digest of a track's marks as the ordered list of their stored values.

    How a refresh tells whether a track's marks changed without holding every
    stored mark of a 50,000-track library in memory. ``repr`` is exact for every
    value here, floats included, and 128 bits make a false match between two
    different lists something no library will see.
    """
    return hashlib.blake2b(
        repr((tuple(cues), tuple(grid))).encode("utf-8"), digest_size=16
    ).digest()


#: The fingerprint of no marks at all, which a track without rows has.
EMPTY_FINGERPRINT = marks_fingerprint((), ())


def _optional_color(value: Any) -> Optional[str]:
    """``#rrggbb`` in lower case, or None."""
    if value is None:
        return None
    text = str(value)
    if (
        len(text) != 7
        or text[0] != "#"
        or any(c not in "0123456789abcdef" for c in text[1:])
    ):
        raise ValueError(f"color must be #rrggbb in lower case, got {value!r}")
    return text


def _optional_name(value: Any) -> Optional[str]:
    """The name as written, or None. An empty name is no name."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"name must be text, got {value!r}")
    return value or None


def _mark_ms(value: Any, name: str) -> int:
    ms = non_negative(value, name)
    if ms > MAX_MARK_MS:
        raise ValueError(f"{name} must be at most {MAX_MARK_MS}, got {ms!r}")
    return ms


@dataclass(frozen=True)
class TrackCue:
    """One ``POSITION_MARK``: a cue, a fade, a load point or a loop.

    Attributes:
        position: Its place among the track's kept marks, from zero, in the
            order Rekordbox wrote them.
        kind: One of :data:`CUE_KINDS`.
        hot_cue: The hot cue slot, 0–7 for A–H, or None for a memory cue.
        start_ms: Where it is, in whole milliseconds from the start.
        end_ms: Where a loop ends, after ``start_ms``, or None.
        name: Its name as Rekordbox wrote it, or None.
        color: ``#rrggbb``, or None when Rekordbox gave no colour.
    """

    position: int
    kind: str
    hot_cue: Optional[int]
    start_ms: int
    end_ms: Optional[int] = None
    name: Optional[str] = None
    color: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "position", non_negative(self.position, "position"))
        one_of(self.kind, CUE_KINDS, "kind")
        hot_cue = optional_whole_number(self.hot_cue, "hot_cue")
        if hot_cue is not None and not 0 <= hot_cue < len(HOT_CUE_LETTERS):
            raise ValueError(f"hot_cue must be 0-7 or None, got {hot_cue!r}")
        object.__setattr__(self, "hot_cue", hot_cue)
        start = _mark_ms(self.start_ms, "start_ms")
        object.__setattr__(self, "start_ms", start)
        if self.end_ms is not None:
            end = _mark_ms(self.end_ms, "end_ms")
            if end <= start:
                raise ValueError(f"end_ms must be after start_ms, got {end} <= {start}")
            object.__setattr__(self, "end_ms", end)
        object.__setattr__(self, "name", _optional_name(self.name))
        object.__setattr__(self, "color", _optional_color(self.color))

    @property
    def letter(self) -> Optional[str]:
        """The hot cue's letter, A–H, or None for a memory cue."""
        return None if self.hot_cue is None else HOT_CUE_LETTERS[self.hot_cue]

    def values(self) -> CueValues:
        """The stored values, in the order the reader produces them."""
        return (
            self.kind,
            self.hot_cue,
            self.start_ms,
            self.end_ms,
            self.name,
            self.color,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {
            "kind": self.kind,
            "hot_cue": self.hot_cue,
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "name": self.name,
            "color": self.color,
        }

    @classmethod
    def from_values(cls, position: int, values: CueValues) -> "TrackCue":
        """Build a cue from what the reader produced."""
        kind, hot_cue, start_ms, end_ms, name, color = values
        return cls(position, kind, hot_cue, start_ms, end_ms, name, color)

    @classmethod
    def from_row(cls, row: Any) -> "TrackCue":
        """Build a cue from a ``track_cues`` row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            position=data["position"],
            kind=data["kind"],
            hot_cue=data["hot_cue"],
            start_ms=data["start_ms"],
            end_ms=data["end_ms"],
            name=data["name"],
            color=data["color"],
        )


@dataclass(frozen=True)
class BeatGridMarker:
    """One ``TEMPO``: where a run of beats starts, and at what tempo.

    Attributes:
        position: Its place in the grid, from zero, in document order.
        start_ms: Where it is, in whole milliseconds (``Inizio``).
        bpm: The tempo from here on (``Bpm``), above zero.
        meter: The time signature as written (``Metro``), such as ``4/4``.
        beat: Which beat of the bar this is, 1–4 (``Battito``), or None.
    """

    position: int
    start_ms: int
    bpm: float
    meter: Optional[str] = None
    beat: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "position", non_negative(self.position, "position"))
        object.__setattr__(self, "start_ms", _mark_ms(self.start_ms, "start_ms"))
        bpm = number(self.bpm, "bpm")
        if not bpm > 0:
            raise ValueError(f"bpm must be above zero, got {bpm}")
        object.__setattr__(self, "bpm", bpm)
        object.__setattr__(self, "meter", _optional_name(self.meter))
        beat = optional_whole_number(self.beat, "beat")
        if beat is not None and not 1 <= beat <= 4:
            raise ValueError(f"beat must be 1-4 or None, got {beat!r}")
        object.__setattr__(self, "beat", beat)

    def values(self) -> GridValues:
        """The stored values, in the order the reader produces them."""
        return (self.start_ms, self.bpm, self.meter, self.beat)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {
            "start_ms": self.start_ms,
            "bpm": self.bpm,
            "meter": self.meter,
            "beat": self.beat,
        }

    @classmethod
    def from_values(cls, position: int, values: GridValues) -> "BeatGridMarker":
        """Build a marker from what the reader produced."""
        start_ms, bpm, meter, beat = values
        return cls(position, start_ms, bpm, meter, beat)

    @classmethod
    def from_row(cls, row: Any) -> "BeatGridMarker":
        """Build a marker from a ``track_beat_grid`` row."""
        data = dict(row)
        return cls(
            position=data["position"],
            start_ms=data["start_ms"],
            bpm=data["bpm"],
            meter=data["meter"],
            beat=data["beat"],
        )


@dataclass(frozen=True)
class TrackMarks:
    """Every cue and grid marker of one track, in order.

    Attributes:
        track_id: The library track. Its rows cascade with it.
        cues: In ``position`` order.
        grid: In ``position`` order.
    """

    track_id: int
    cues: Tuple[TrackCue, ...] = ()
    grid: Tuple[BeatGridMarker, ...] = ()

    def __post_init__(self) -> None:
        """Validate the track and the order."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        for name, items in (("cues", self.cues), ("grid", self.grid)):
            positions = [item.position for item in items]
            if positions != sorted(set(positions)):
                raise ValueError(f"{name} must be in position order, got {positions}")

    @property
    def hot_cue_count(self) -> int:
        """Marks in a hot cue slot, loops among them."""
        return sum(1 for cue in self.cues if cue.hot_cue is not None)

    @property
    def memory_cue_count(self) -> int:
        """Marks in no slot: memory cues and loops, fades and load points."""
        return sum(1 for cue in self.cues if cue.hot_cue is None)

    @property
    def bpms(self) -> Tuple[float, ...]:
        """Every marker's tempo, in grid order."""
        return tuple(marker.bpm for marker in self.grid)

    @property
    def is_variable(self) -> bool:
        """True when the grid changes tempo. Two markers at one tempo do not."""
        return len(set(self.bpms)) > 1

    @property
    def fingerprint(self) -> bytes:
        """The digest a refresh compares (:func:`marks_fingerprint`)."""
        return marks_fingerprint(
            [cue.values() for cue in self.cues],
            [marker.values() for marker in self.grid],
        )

    def summary(self, read: bool) -> Dict[str, Any]:
        """What ``GET /api/v1/library/tracks/{id}`` carries as ``marks``.

        Args:
            read: Whether the library's marks have been read at all
                (``library.marks_read``). When they have not, a track with none
                is waiting for the next refresh rather than without cues, and
                the Inspector says which.
        """
        bpms = self.bpms
        return {
            "read": read,
            "hot_cues": self.hot_cue_count,
            "memory_cues": self.memory_cue_count,
            "cues": [cue.to_dict() for cue in self.cues],
            "beat_grid": (
                {
                    "markers": len(self.grid),
                    "bpm": bpms[0],
                    "min_bpm": min(bpms),
                    "max_bpm": max(bpms),
                    "variable": self.is_variable,
                }
                if bpms
                else None
            ),
        }

    def drawing(self, read: bool) -> Dict[str, Any]:
        """What a waveform answer carries as ``marks`` (WAVE-05).

        Every cue, as the summary lists them, and every grid marker rather than
        the grid summed up: a drawing places a line at each bar, and a variable
        grid's bars come from all of its markers.

        Args:
            read: Whether the library's marks have been read at all.
        """
        return {
            "read": read,
            "cues": [cue.to_dict() for cue in self.cues],
            "grid": [marker.to_dict() for marker in self.grid],
        }

    @classmethod
    def from_values(
        cls,
        track_id: int,
        cues: Iterable[CueValues],
        grid: Iterable[GridValues],
    ) -> "TrackMarks":
        """Build one track's marks from what the reader produced."""
        return cls(
            track_id=track_id,
            cues=tuple(
                TrackCue.from_values(position, values)
                for position, values in enumerate(cues)
            ),
            grid=tuple(
                BeatGridMarker.from_values(position, values)
                for position, values in enumerate(grid)
            ),
        )

    @classmethod
    def from_rows(
        cls, track_id: int, cue_rows: Iterable[Any], grid_rows: Iterable[Any]
    ) -> "TrackMarks":
        """Build one track's marks from its rows, in any order."""
        cues: List[TrackCue] = sorted(
            (TrackCue.from_row(row) for row in cue_rows), key=lambda c: c.position
        )
        grid: List[BeatGridMarker] = sorted(
            (BeatGridMarker.from_row(row) for row in grid_rows),
            key=lambda m: m.position,
        )
        return cls(track_id=track_id, cues=tuple(cues), grid=tuple(grid))


__all__ = [
    "CUE_KINDS",
    "EMPTY_FINGERPRINT",
    "HOT_CUE_LETTERS",
    "KIND_CUE",
    "KIND_FADE_IN",
    "KIND_FADE_OUT",
    "KIND_LOAD",
    "KIND_LOOP",
    "MARKS_INDEX",
    "MARKS_VERSION",
    "MAX_MARK_MS",
    "NO_MARKS",
    "BeatGridMarker",
    "CueValues",
    "GridValues",
    "ReadMarks",
    "TrackCue",
    "TrackMarks",
    "marks_fingerprint",
]
