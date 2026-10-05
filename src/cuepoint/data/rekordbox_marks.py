#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reading a ``COLLECTION/TRACK``'s cue points and beat grid (WAVE-04, DEC-118).

``POSITION_MARK`` and ``TEMPO`` are children of the track element, so
:func:`read_track_marks` is handed the element at its end event, before the
streaming reader clears it, and returns the marks beside the
:class:`~cuepoint.models.library_track.LibraryTrack` rather than inside it, so
nothing that reads tracks changes.

What is read, and what is refused
---------------------------------
``POSITION_MARK``:

- ``Type`` 0–4 are ``cue``, ``fade_in``, ``fade_out``, ``load`` and ``loop``.
- ``Num`` −1 is a memory cue, and 0–7 are hot cues A–H.
- ``Start`` and ``End`` are seconds, stored as whole milliseconds, rounded half
  up. Rekordbox writes three decimals, which convert exactly; any other form is
  converted through :class:`~decimal.Decimal`, never through a float, so the
  rounding is the same on every machine.
- ``Red``, ``Green`` and ``Blue``, when all three are present and each is
  0–255, become ``#rrggbb``. A colour that cannot be read is left off; the cue
  is still kept.
- ``Name`` is kept as written. Rekordbox writes ``Name=""`` on an unnamed mark,
  and that is no name.

A mark is **refused**, skipped and counted, never raised, when its ``Type`` or
``Num`` is one CuePoint does not know, its ``Start`` is missing or unreadable,
a time is negative or past :data:`~cuepoint.models.track_marks.MAX_MARK_MS`,
or its ``End`` is not after its ``Start`` once both are whole milliseconds.

``TEMPO``: ``Inizio`` becomes ``start_ms``, ``Bpm`` ``bpm``, ``Metro``
``meter`` and ``Battito`` ``beat``. Several are a variable grid, kept in order.
One with a missing, unreadable or non-positive ``Bpm``, an unreadable
``Inizio``, or a ``Battito`` outside 1–4 is refused.

Why it is written for speed
---------------------------
A 50,000-track collection carries hundreds of thousands of marks, and reading
them must cost no more than a tenth of reading the tracks alone (WAVE-04's
tests). So a mark becomes one plain tuple, a ``Type``, ``Num`` or colour is a
dictionary lookup, and a time in Rekordbox's own form is two string operations
and one ``int``.
"""

from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Callable, Dict, List, Optional, Tuple
from xml.etree.ElementTree import Element

from cuepoint.models.track_marks import (
    CUE_KINDS,
    HOT_CUE_LETTERS,
    MAX_MARK_MS,
    NO_MARKS,
    CueValues,
    GridValues,
    ReadMarks,
)

TAG_POSITION_MARK = "POSITION_MARK"
TAG_TEMPO = "TEMPO"

#: ``Type`` as Rekordbox writes it, to the kind it is.
_KIND_BY_TYPE: Dict[str, str] = {str(i): kind for i, kind in enumerate(CUE_KINDS)}

#: ``Num`` as Rekordbox writes it. −1 is a memory cue, stored as no slot.
_MEMORY = -1
_NUMS: Dict[str, int] = {str(i): i for i in range(_MEMORY, len(HOT_CUE_LETTERS))}

#: ``Battito`` to the beat of the bar.
_BEATS: Dict[str, int] = {str(i): i for i in range(1, 5)}

#: Colours already formatted. A library uses a handful of cue colours, so this
#: stays small; it is bounded all the same.
_COLORS: Dict[Tuple[Optional[str], ...], Optional[str]] = {}
_MAX_CACHED_COLORS = 4096

_INFINITY = math.inf

_THOUSAND = Decimal(1000)
_WHOLE = Decimal(1)

Getter = Callable[[str], Optional[str]]


def seconds_to_ms(text: Optional[str]) -> Optional[int]:
    """Convert a time in seconds to whole milliseconds, or None if refused.

    Rounded half up. Refused: no value, an unreadable one, a negative one, and
    one past :data:`~cuepoint.models.track_marks.MAX_MARK_MS`.

    Rekordbox's own form, three decimals ("64.025"), goes through a float: the
    float is within a millionth of a millisecond of the exact value at any time
    up to the limit, so adding a half and truncating is exact. Every other form
    goes through ``Decimal``. :func:`read_track_marks` repeats the first branch
    inline, and a test holds the two equal.
    """
    if text is None:
        return None
    if len(text) - text.find(".") == 4:
        try:
            ms = float(text) * 1000.0
        except ValueError:
            return None
        return int(ms + 0.5) if 0.0 <= ms <= MAX_MARK_MS else None
    return _seconds_to_ms_exactly(text)


def _seconds_to_ms_exactly(text: str) -> Optional[int]:
    """:func:`seconds_to_ms` for any other form, through ``Decimal``."""
    try:
        seconds = Decimal(text)
        if not seconds.is_finite() or seconds < 0:
            return None
        ms = int((seconds * _THOUSAND).quantize(_WHOLE, rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, OverflowError):
        return None
    return ms if ms <= MAX_MARK_MS else None


def _whole(text: str) -> Optional[str]:
    """A whole number written another way ("0.0", " 1") in canonical form."""
    try:
        value = float(text)
    except ValueError:
        return None
    if not math.isfinite(value) or value != int(value):
        return None
    return str(int(value))


def _code(table: Dict[str, int], text: Optional[str]) -> Optional[int]:
    """Look up a ``Num`` or ``Battito``, or None when it is not one."""
    if text is None:
        return None
    found = table.get(text)
    if found is None:
        canonical = _whole(text)
        found = None if canonical is None else table.get(canonical)
    return found


def _kind(text: Optional[str]) -> Optional[str]:
    """The kind a ``Type`` names, or None when it is not one CuePoint knows."""
    if text is None:
        return None
    kind = _KIND_BY_TYPE.get(text)
    if kind is None:
        canonical = _whole(text)
        kind = None if canonical is None else _KIND_BY_TYPE.get(canonical)
    return kind


def _channel(text: str) -> Optional[int]:
    try:
        value = int(text)
    except ValueError:
        return None
    return value if 0 <= value <= 255 else None


def _color(
    red: Optional[str], green: Optional[str], blue: Optional[str]
) -> Optional[str]:
    """``#rrggbb`` from Rekordbox's three channels, or None."""
    if red is None or green is None or blue is None:
        return None
    key = (red, green, blue)
    if key in _COLORS:
        return _COLORS[key]
    r, g, b = _channel(red), _channel(green), _channel(blue)
    color = None if r is None or g is None or b is None else f"#{r:02x}{g:02x}{b:02x}"
    if len(_COLORS) < _MAX_CACHED_COLORS:
        _COLORS[key] = color
    return color


def read_cue(get: Getter) -> Optional[CueValues]:
    """One ``POSITION_MARK``'s values, or None when it is refused."""
    kind = _kind(get("Type"))
    if kind is None:
        return None
    num = _code(_NUMS, get("Num"))
    if num is None:
        return None
    start = seconds_to_ms(get("Start"))
    if start is None:
        return None
    end_text = get("End")
    end: Optional[int] = None
    if end_text:
        end = seconds_to_ms(end_text)
        if end is None or end <= start:
            return None
    return (
        kind,
        None if num == _MEMORY else num,
        start,
        end,
        get("Name") or None,
        _color(get("Red"), get("Green"), get("Blue")),
    )


def read_tempo(get: Getter) -> Optional[GridValues]:
    """One ``TEMPO``'s values, or None when it is refused."""
    start = seconds_to_ms(get("Inizio"))
    if start is None:
        return None
    bpm_text = get("Bpm")
    if not bpm_text:
        return None
    try:
        bpm = float(bpm_text)
    except ValueError:
        return None
    if not 0 < bpm < math.inf:
        return None
    beat_text = get("Battito")
    beat: Optional[int] = None
    if beat_text:
        beat = _code(_BEATS, beat_text)
        if beat is None:
            return None
    return (start, bpm, get("Metro") or None, beat)


def read_track_marks(elem: Element) -> ReadMarks:
    """Every mark on one ``COLLECTION/TRACK`` element, in document order.

    Called at the element's end event, when its children are complete and
    before it is cleared. Never raises on what a mark holds: a refused mark is
    counted in :attr:`~cuepoint.models.track_marks.ReadMarks.skipped`.

    A cue without an ``End``, and a grid marker, in exactly the form Rekordbox
    writes are read inline; anything else, loops included, goes through
    :func:`read_cue` or :func:`read_tempo`, which decide it by the full rules.
    The inline paths accept only what those would read to the same values, and
    a test holds that.
    """
    if not len(elem):
        return NO_MARKS
    cues: List[CueValues] = []
    grid: List[GridValues] = []
    skipped = 0
    kinds = _KIND_BY_TYPE
    nums = _NUMS
    beats = _BEATS
    colors = _COLORS
    for child in elem:
        tag = child.tag
        if tag == TAG_POSITION_MARK:
            attrs = child.attrib
            get = attrs.get
            kind = kinds.get(get("Type", ""))
            num = nums.get(get("Num", ""))
            start = get("Start")
            if (
                kind is not None
                and num is not None
                and start is not None
                and "End" not in attrs
                and len(start) - start.find(".") == 4
            ):
                try:
                    ms = float(start) * 1000.0
                except ValueError:
                    ms = -1.0
                if 0.0 <= ms <= MAX_MARK_MS:
                    red = get("Red")
                    if red is None:
                        color = None
                    else:
                        channels = (red, get("Green"), get("Blue"))
                        color = colors.get(channels) or _color(*channels)
                    cues.append(
                        (
                            kind,
                            None if num == _MEMORY else num,
                            int(ms + 0.5),
                            None,
                            get("Name") or None,
                            color,
                        )
                    )
                    continue
            cue = read_cue(get)
            if cue is None:
                skipped += 1
            else:
                cues.append(cue)
        elif tag == TAG_TEMPO:
            get = child.attrib.get
            start = get("Inizio")
            bpm_text = get("Bpm")
            beat_text = get("Battito")
            beat = beats.get(beat_text) if beat_text else None
            if (
                start is not None
                and bpm_text
                and (beat is not None or not beat_text)
                and len(start) - start.find(".") == 4
            ):
                try:
                    ms = float(start) * 1000.0
                    bpm = float(bpm_text)
                except ValueError:
                    ms = bpm = -1.0
                if 0.0 <= ms <= MAX_MARK_MS and 0.0 < bpm < _INFINITY:
                    grid.append((int(ms + 0.5), bpm, get("Metro") or None, beat))
                    continue
            marker = read_tempo(get)
            if marker is None:
                skipped += 1
            else:
                grid.append(marker)
    if not cues and not grid and not skipped:
        return NO_MARKS
    return ReadMarks(tuple(cues), tuple(grid), skipped)


__all__ = [
    "TAG_POSITION_MARK",
    "TAG_TEMPO",
    "read_cue",
    "read_tempo",
    "read_track_marks",
    "seconds_to_ms",
]
