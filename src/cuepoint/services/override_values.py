#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What an override may hold, and how a Beatport value becomes one (CLEAN-05).

DEC-069 leaves the vocabulary to the phase specification, and the specification
fixes it here, engine-side, so a renderer never builds a value the engine will
refuse (DEC-060's rule, reapplied). Pure: no database, no network.

The five fields
---------------
- **Key** — accepted in classic (``Am``, ``F#``), Camelot (``8A``), short
  (``Amin``, ``Gmaj``) or spelled-out (``A minor``, Beatport's ``A min``)
  notation, with ♯ and ♭ as well as ``#`` and ``b``, and stored in one notation.
- **BPM** — 20 to 300, at most two decimals.
- **Year** — a whole number, 1900 to next year.
- **Genre** and **label** — trimmed text of 1 to 200 characters.

Clearing an override is ``None``. A blank value is refused rather than read as a
clear: a caller that sent ``""`` for a genre believes it set one, and silently
clearing it instead would show Rekordbox's genre in its place.

One key notation, and which one
-------------------------------
A key is stored in **the notation the library's imported keys already use**.
Rekordbox writes ``Tonality`` in the notation its user chose — ``8A`` for a
Camelot user, ``Am`` for a classic one — and CuePoint keeps that column as
imported. An override stored in the other notation would make the plain ``key``
field, which means the effective value (DEC-068), hold ``8A`` for one track and
``Am`` for the same key on the next: a facet would count one key as two, and a
filter for ``8A`` would miss every override. :func:`key_notation_of` decides the
notation from the imported keys, classic when there are none to go by.

Enharmonic spellings are one key: ``G#m`` and ``Abm`` are stored as the same
value, spelled as Rekordbox's classic display spells it, because two spellings
of one key are two facet entries a user has to reconcile by hand. Display and
tag-writing formats are choices at the edge (CLEAN-10, CLEAN-13), never stored
variants.

A candidate's value
-------------------
:func:`candidate_value` reads what "apply" copies from a decided candidate. A
value Beatport left empty, or one that is not a usable override — a BPM outside
the range, a key that is not a key — is *no value*, and applying it is refused
by the caller rather than writing ``None`` over an override the user already has.
"""

from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any, Dict, Iterable, Optional, Tuple

from cuepoint.data.rekordbox import _CAMELOT_TO_CLASSIC
from cuepoint.models.match_attempt import MatchCandidate
from cuepoint.models.track_metadata import OVERRIDE_FIELDS

#: Key notations an override can be stored in.
NOTATION_CLASSIC = "classic"
NOTATION_CAMELOT = "camelot"
KEY_NOTATIONS = (NOTATION_CLASSIC, NOTATION_CAMELOT)

MIN_BPM = 20.0
MAX_BPM = 300.0

#: A BPM's precision. Beatport and Rekordbox both show two decimals, and a
#: third is noise a hand edit should not be able to store.
BPM_DECIMALS = 2

EARLIEST_YEAR = 1900

#: A genre or label longer than this is a paste gone wrong, not a genre.
MAX_TEXT_LENGTH = 200

_NOTE_PITCHES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_ACCIDENTALS = {"#": 1, "b": -1}

_CAMELOT = re.compile(r"^(1[0-2]|[1-9])\s*([AB])$", re.IGNORECASE)


def _parse_classic(text: str) -> Optional[Tuple[int, bool]]:
    """``(pitch class, minor)`` for a classic, short or spelled-out key."""
    if not text or text[0].upper() not in _NOTE_PITCHES:
        return None
    pitch = _NOTE_PITCHES[text[0].upper()]
    rest = text[1:].replace("♯", "#").replace("♭", "b")
    if rest[:1] in _ACCIDENTALS:
        pitch += _ACCIDENTALS[rest[0]]
        rest = rest[1:]
    mode = rest.strip()
    if mode in ("m", "M") or mode.lower() in ("min", "minor"):
        # "M" is read as minor on purpose: nobody writes "AM" for A major, and
        # a Rekordbox-style "Am" typed with caps lock on is still A minor.
        minor = True
    elif mode.lower() in ("maj", "major", ""):
        minor = False
    else:
        return None
    return pitch % 12, minor


def _classic_by_key() -> Dict[Tuple[int, bool], Tuple[str, str]]:
    found: Dict[Tuple[int, bool], Tuple[str, str]] = {}
    for code, classic in _CAMELOT_TO_CLASSIC.items():
        parsed = _parse_classic(classic)
        assert parsed is not None, classic
        found[parsed] = (code, classic)
    return found


#: ``(pitch class, minor)`` → ``(Camelot code, classic spelling)`` for all 24 keys.
_KEYS = _classic_by_key()


def parse_key(value: str) -> Optional[Tuple[int, bool]]:
    """Return ``(pitch class, minor)`` for a key in any accepted notation, or None."""
    text = value.strip()
    camelot = _CAMELOT.match(text)
    if camelot:
        classic = _CAMELOT_TO_CLASSIC[
            f"{int(camelot.group(1))}{camelot.group(2).upper()}"
        ]
        return _parse_classic(classic)
    return _parse_classic(text)


def format_key(pitch: int, minor: bool, notation: str) -> str:
    """Spell a key in a notation."""
    if notation not in KEY_NOTATIONS:
        raise ValueError(f"Unknown key notation {notation!r}")
    code, classic = _KEYS[(pitch % 12, minor)]
    return code if notation == NOTATION_CAMELOT else classic


def key_notation_of(keys: Iterable[Optional[str]]) -> str:
    """The notation most of a library's imported keys are written in.

    Classic when there is nothing to go by or the two tie, because classic is
    Rekordbox's default display and what a key column holds before anyone
    changes a setting.
    """
    camelot = classic = 0
    for key in keys:
        if not key:
            continue
        text = key.strip()
        if _CAMELOT.match(text):
            camelot += 1
        elif text:
            classic += 1
    return notation_from_counts(camelot, classic)


def notation_from_counts(camelot: int, other: int) -> str:
    """The notation a library uses, from how many of its keys are Camelot.

    ``other`` is every other non-blank key. The rule :func:`key_notation_of`
    applies, stated once so the database can count and this can decide.
    """
    return NOTATION_CAMELOT if camelot > other else NOTATION_CLASSIC


def normalize_key(value: Any, notation: str) -> Optional[str]:
    """Return a key override in ``notation``, or ``None`` to clear.

    Raises:
        ValueError: If the value is blank, not text, or not a key.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"key must be text, not {value!r}")
    if not value.strip():
        raise ValueError("key cannot be blank; clear an override with null")
    parsed = parse_key(value)
    if parsed is None:
        raise ValueError(
            f"key {value!r} is not a key in classic (Am), Camelot (8A) or short"
            " (Amin) notation"
        )
    return format_key(*parsed, notation)


def normalize_bpm(value: Any) -> Optional[float]:
    """Return a BPM override, or ``None`` to clear.

    Raises:
        ValueError: If the value is not a number, is outside 20–300, or has
            more than two decimals.
    """
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"bpm must be a number, not {value!r}")
    bpm = float(value)
    if not math.isfinite(bpm) or not MIN_BPM <= bpm <= MAX_BPM:
        raise ValueError(
            f"bpm must be between {MIN_BPM:g} and {MAX_BPM:g}, not {value!r}"
        )
    rounded = round(bpm, BPM_DECIMALS)
    if abs(rounded - bpm) > 1e-9:
        raise ValueError(f"bpm may have at most {BPM_DECIMALS} decimals, not {value!r}")
    return rounded


def latest_year() -> int:
    """The latest year an override may name: next year, as ``Track`` allows."""
    return datetime.now().year + 1


def normalize_year(value: Any) -> Optional[int]:
    """Return a year override, or ``None`` to clear.

    Raises:
        ValueError: If the value is not a whole number from 1900 to next year.
    """
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"year must be a whole number, not {value!r}")
    if isinstance(value, float) and (
        not math.isfinite(value) or not value.is_integer()
    ):
        raise ValueError(f"year must be a whole number, not {value!r}")
    year = int(value)
    if not EARLIEST_YEAR <= year <= latest_year():
        raise ValueError(
            f"year must be between {EARLIEST_YEAR} and {latest_year()}, not {value!r}"
        )
    return year


def normalize_text(value: Any, field: str) -> Optional[str]:
    """Return a genre or label override trimmed, or ``None`` to clear.

    Raises:
        ValueError: If the value is not text, is blank, or is longer than 200
            characters once trimmed.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text, not {value!r}")
    text = value.strip()
    if not text:
        raise ValueError(f"{field} cannot be blank; clear an override with null")
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(
            f"{field} may be at most {MAX_TEXT_LENGTH} characters, not {len(text)}"
        )
    return text


def require_field(field: Any) -> str:
    """Return an override field's name, or refuse one that is not.

    Raises:
        ValueError: Naming the fields that exist. Title, artist, remixer and
            album are not among them, by DEC-069.
    """
    if not isinstance(field, str) or field not in OVERRIDE_FIELDS:
        raise ValueError(
            f"{field!r} cannot be overridden. Fields: {', '.join(OVERRIDE_FIELDS)}"
        )
    return field


def normalize_override(field: str, value: Any, notation: str) -> Any:
    """Return a value for an override field, or ``None`` to clear it.

    Raises:
        ValueError: If the field cannot be overridden or the value is not one
            it can hold. The message names the field.
    """
    name = require_field(field)
    if name == "key":
        return normalize_key(value, notation)
    if name == "bpm":
        return normalize_bpm(value)
    if name == "year":
        return normalize_year(value)
    return normalize_text(value, name)


def candidate_value(candidate: MatchCandidate, field: str, notation: str) -> Any:
    """The value "apply" would copy from a candidate, or ``None`` when it has none.

    A value that could not be stored as an override — an empty field, a key
    that is not a key, a BPM outside the range — is no value.
    """
    name = require_field(field)
    raw = {
        "key": candidate.key,
        "bpm": candidate.bpm,
        "genre": candidate.genre,
        "label": candidate.label,
        "year": candidate.release_year,
    }[name]
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    if name == "bpm" and isinstance(raw, float):
        raw = round(raw, BPM_DECIMALS)
    try:
        return normalize_override(name, raw, notation)
    except ValueError:
        return None


__all__ = (
    "BPM_DECIMALS",
    "EARLIEST_YEAR",
    "KEY_NOTATIONS",
    "MAX_BPM",
    "MAX_TEXT_LENGTH",
    "MIN_BPM",
    "NOTATION_CAMELOT",
    "NOTATION_CLASSIC",
    "candidate_value",
    "format_key",
    "key_notation_of",
    "latest_year",
    "notation_from_counts",
    "normalize_bpm",
    "normalize_key",
    "normalize_override",
    "normalize_text",
    "normalize_year",
    "parse_key",
    "require_field",
)
