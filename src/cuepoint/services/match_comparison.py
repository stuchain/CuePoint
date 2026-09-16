#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A track beside a Beatport candidate, field by field (CLEAN-12).

The Clean page draws a track's imported values beside every candidate its
matcher scored and marks where they differ. Whether two values differ is a
rule, and the rules it needs already live in Python: key notations and
enharmonic spellings (``override_values.parse_key``), text normalization
(``core.text_processing``) and mix parsing (``core.mix_parser``). A renderer
that compared ``8A`` with ``A Minor`` as text would mark every Camelot user's
keys as different, so the comparison is answered here and sent with the
candidate.

Nothing here scores anything. The matcher is an input to this module, not
something it changes: it reads a stored track and a stored candidate, and says
for each field whether they agree.

Each answer is one of three
---------------------------
- ``False``: both sides have a value, and they agree.
- ``True``: both sides have a value, and they do not.
- ``None``: one side has nothing to compare. A track Rekordbox gave no genre is
  not "different" from Beatport's genre, and marking it so would drown the
  differences a person has to look at.

How each field is compared
--------------------------
- **Title**: the words, without the bracketed parts, normalized as the matcher
  normalizes text. The mix is its own field.
- **Artists** and **remixers**: the set of names, so order and separators
  (``&``, ``,``, ``feat.``) do not count as a difference.
- **Mix**: what kind of version it is — extended, radio, remix, dub, and so on.
  A plain title and "Original Mix" are the same version.
- **Label** and **genre**: normalized text, without bracketed parts, so
  Beatport's "Techno (Peak Time / Driving)" agrees with "Techno".
- **Key**: the same key in any notation, enharmonics included.
- **BPM**: the same whole number. Beatport publishes whole BPMs, and a
  Rekordbox analysis of 127.98 is the same tempo.
- **Year**: the track's year against the candidate's release year.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple

from cuepoint.core.mix_parser import _extract_original_mix_phrases, _parse_mix_flags
from cuepoint.core.text_processing import normalize_text, split_artists
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.match_attempt import MatchCandidate
from cuepoint.services.override_values import parse_key

#: The fields a comparison answers, in the order the page draws them. A public
#: shape: a field may be added, never renamed.
COMPARED_FIELDS: Tuple[str, ...] = (
    "title",
    "artists",
    "mix",
    "remixers",
    "label",
    "genre",
    "key",
    "bpm",
    "year",
)

_BRACKETED = re.compile(r"\(([^)]{1,64})\)|\[([^\]]{1,64})\]")
_FEATURING = re.compile(r"^\s*(feat\.?|ft\.?|featuring)\b", re.IGNORECASE)
_NUMERIC = re.compile(r"^[\d\s:\-/]+$")

#: The mix flags that make a version something other than the plain one.
#: ``is_original`` is left out on purpose: "Original Mix" is the plain version.
_VERSION_FLAGS: Tuple[str, ...] = (
    "is_extended",
    "is_club",
    "is_radio",
    "is_edit",
    "is_remix",
    "is_dub",
    "is_guitar",
    "is_vip",
    "is_rework",
    "is_refire",
    "is_acapella",
    "is_instrumental",
)


def _blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _without_brackets(text: str) -> str:
    return _BRACKETED.sub(" ", text)


def mix_of(title: Optional[str]) -> Optional[str]:
    """The version a title names, as written: ``"Extended Mix"``, or None.

    Every bracketed phrase that is not a featuring clause or a number, and a
    bare "Original Mix" at the end of a title. Joined with `` / `` when a title
    carries more than one.
    """
    if _blank(title):
        return None
    text = str(title)
    phrases: List[str] = []
    for match in _BRACKETED.finditer(text):
        phrase = re.sub(r"\s+", " ", (match.group(1) or match.group(2) or "").strip())
        if not phrase or _FEATURING.match(phrase) or _NUMERIC.match(phrase):
            continue
        phrases.append(phrase)
    if not phrases:
        phrases.extend(_extract_original_mix_phrases(text))
    seen: Set[str] = set()
    unique: List[str] = []
    for phrase in phrases:
        if phrase.lower() not in seen:
            seen.add(phrase.lower())
            unique.append(phrase)
    return " / ".join(unique) if unique else None


def _version(title: str) -> Tuple[str, ...]:
    flags = _parse_mix_flags(title)
    return tuple(flag for flag in _VERSION_FLAGS if flags.get(flag))


def _names(text: Optional[str]) -> Set[str]:
    return set(split_artists(text or ""))


def _text(value: Optional[str]) -> str:
    return normalize_text(_without_brackets(value or ""))


def _differs_text(a: Optional[str], b: Optional[str]) -> Optional[bool]:
    left, right = _text(a), _text(b)
    if not left or not right:
        return None
    return left != right


def _differs_names(a: Optional[str], b: Optional[str]) -> Optional[bool]:
    left, right = _names(a), _names(b)
    if not left or not right:
        return None
    return left != right


def _differs_key(a: Optional[str], b: Optional[str]) -> Optional[bool]:
    if _blank(a) or _blank(b):
        return None
    left, right = parse_key(str(a)), parse_key(str(b))
    if left is not None and right is not None:
        return left != right
    # A value that is not a key in any notation is compared as text, so two
    # identical oddities agree and an oddity never matches a real key.
    return normalize_text(str(a)) != normalize_text(str(b))


def _whole(value: float) -> int:
    # Half up, not Python's round-half-to-even: 127.5 is 128 to a DJ.
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


def _differs_bpm(a: Optional[float], b: Optional[float]) -> Optional[bool]:
    if a is None or b is None:
        return None
    return _whole(float(a)) != _whole(float(b))


def _differs_year(a: Optional[int], b: Optional[int]) -> Optional[bool]:
    if a is None or b is None:
        return None
    return int(a) != int(b)


def _differs_mix(a: Optional[str], b: Optional[str]) -> Optional[bool]:
    if _blank(a) or _blank(b):
        return None
    return _version(str(a)) != _version(str(b))


def compared_track(track: LibraryTrack) -> Dict[str, Any]:
    """A track's imported values, as the comparison reads them.

    Imported, not effective (DEC-068): the comparison is between what Rekordbox
    holds and what Beatport says, which is what applying would change.
    """
    return {
        "title": track.title,
        "artist": track.artist,
        "mix": mix_of(track.title),
        "remixer": track.remixer,
        "album": track.album,
        "label": track.label,
        "genre": track.genre,
        "key": track.key,
        "bpm": track.bpm,
        "year": track.year,
    }


def differences(
    track: LibraryTrack, candidate: MatchCandidate
) -> Dict[str, Optional[bool]]:
    """For each of :data:`COMPARED_FIELDS`, whether the two differ, or None."""
    return {
        "title": _differs_text(track.title, candidate.title),
        "artists": _differs_names(track.artist, candidate.artists),
        "mix": _differs_mix(track.title, candidate.title),
        "remixers": _differs_names(track.remixer, candidate.remixers),
        "label": _differs_text(track.label, candidate.label),
        "genre": _differs_text(track.genre, candidate.genre),
        "key": _differs_key(track.key, candidate.key),
        "bpm": _differs_bpm(track.bpm, candidate.bpm),
        "year": _differs_year(track.year, candidate.release_year),
    }


__all__ = (
    "COMPARED_FIELDS",
    "compared_track",
    "differences",
    "mix_of",
)
