#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What an artist or a label *is*, by name (DISCOVER-03, DEC-094, DEC-095).

Two pure functions the whole of Phase 9 shares, so that "tracks by B" means one
thing on an Artist page, in a filter, in a saved Smart Collection and in a
discovery run:

- :func:`name_key` — the identity of a name: "Âme", "AME" and "Ame" are one
  artist, and "Mara Veil" is not "Mara-Veil Sound".
- :func:`split_credit` — the artists in a credit: "A, B feat. C" is three, and
  "Above & Beyond" is one.

Neither is the matcher's normalization, on purpose
--------------------------------------------------
``core.text_processing`` normalizes for *scoring*, and is right to: it drops
every non-Latin character and strips mix words, and ``split_artists`` splits on
``&``, ``and``, ``x``, ``vs`` and ``/``. For *identity* each of those is wrong.
A Cyrillic artist would get an empty key and collide with every other one; an
artist called "Dub Phizix" would lose a word; "Above & Beyond" and "Chase &
Status" would each become two people.

Which way they err
------------------
DEC-095 settles it: by not grouping. A key folds case, Latin accents and
punctuation, and nothing else — it does not strip "Records" or "Music", which
would merge labels that differ. A credit is split only where Beatport and
Rekordbox separate artists, and a duo joined by ``&`` stays one act. Two
spellings the key does not unite are two pages; one key that united two
artists would be a page that lies.

The version
-----------
:data:`ENTITY_NAMES_VERSION` is the version of these two rules together. The
credit index records the version that built it (``derived_indexes``), and a
change to either function is a bump of this number, which rebuilds the index
rather than needing a migration. Change the rules, change the number: a test
holds a table of keys and splits to the current version, so an edit that
forgets fails there.

This module imports nothing from CuePoint, so every layer can use it.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import List, Tuple

#: The version of :func:`name_key` and :func:`split_credit` together. Bump it
#: whenever either changes what it returns for any input.
ENTITY_NAMES_VERSION = 1

# A featuring marker: "feat.", "feat", "ft." and "featuring", as a word, in any
# case, optionally opening a bracket. "ft" without its dot is not one — it is
# too often part of a name. The marker is dropped; what follows it is another
# artist.
_FEATURING = re.compile(
    r"\s*[(\[]?\s*\b(?:feat\.?|ft\.|featuring)(?=\s|$)\s*",
    re.IGNORECASE,
)

# Where a credit separates artists: a comma, or a semicolon (the separator tag
# editors write for several values). Not "&", "and", "x", "vs" or "/", which
# join the members of one act as often as they separate two.
_SEPARATOR = re.compile(r"[,;]")

# The bracket pairs a featuring marker is written inside: "A (feat. B)".
_BRACKETS = (("(", ")"), ("[", "]"), ("{", "}"))

_WHITESPACE = re.compile(r"\s+")


def _trim(part: str) -> str:
    """A part of a credit without whitespace or a bracket left unpaired.

    Taking the marker out of "A (feat. B)" leaves "B)", whose bracket closes
    nothing; "Artist (UK)" keeps both of its own. Only a bracket with no partner
    at the end it sits on is removed.
    """
    text = _WHITESPACE.sub(" ", part).strip()
    changed = True
    while changed and text:
        changed = False
        for opening, closing in _BRACKETS:
            if text.endswith(closing) and text.count(closing) > text.count(opening):
                text, changed = text[:-1].rstrip(), True
            if text.startswith(opening) and text.count(opening) > text.count(closing):
                text, changed = text[1:].lstrip(), True
    return text


#: Distinct names remembered by :func:`name_key`, and credits by
#: :func:`split_credit`. A library of 50,000 tracks
#: credits a few thousand names, each tens or hundreds of times, so the cache
#: turns nearly every call into a lookup; the bound keeps a pathological
#: library from holding more than a few megabytes.
NAME_KEY_CACHE_SIZE = 65_536


@lru_cache(maxsize=4096)
def _is_latin(char: str) -> bool:
    """True for a letter of the Latin script, accented or not."""
    try:
        return unicodedata.name(char).startswith("LATIN ")
    except ValueError:
        return False


def _fold_latin_accents(text: str) -> str:
    """Drop the accents on Latin letters, and only those.

    "Âme" is "Ame" to everyone who types it without the accent, which is what
    DEC-095 asks the key to unite. The same step applied to every script would
    merge what is not the same: a Japanese "ガ" decomposes into "カ" and a
    voicing mark, and "й" into "и" and a breve, and each pair is two different
    letters to a reader. So a combining mark goes only when the letter it sits
    on is Latin, and everything else is composed back as it was.
    """
    if text.isascii():
        # Nothing to decompose and no mark to drop: the common case, answered
        # without walking the string.
        return text
    kept: List[str] = []
    base_is_latin = False
    for char in unicodedata.normalize("NFKD", text):
        if unicodedata.combining(char):
            if base_is_latin:
                continue
        else:
            base_is_latin = _is_latin(char)
        kept.append(char)
    return unicodedata.normalize("NFC", "".join(kept))


def _is_punctuation(char: str) -> bool:
    """True for punctuation and symbols: what a key reads as a space."""
    return unicodedata.category(char)[0] in ("P", "S")


@lru_cache(maxsize=NAME_KEY_CACHE_SIZE)
def _cached_name_key(name: str) -> str:
    folded = _fold_latin_accents(name).casefold()
    spaced = "".join(" " if _is_punctuation(char) else char for char in folded)
    key = _WHITESPACE.sub(" ", spaced).strip()
    if key:
        return key
    return _WHITESPACE.sub(" ", folded).strip()


def name_key(name: str) -> str:
    """The identity of an artist's or a label's name.

    Compatibility forms folded (full-width letters are letters), accents on
    Latin letters dropped, case folded, punctuation and symbols read as spaces,
    whitespace collapsed. Every script is kept, so a Cyrillic or a Japanese
    name has a key of its own.

    It never answers an empty key for a name that has any character in it: a
    name made only of punctuation — the band "!!!" — keeps its punctuation,
    because a key of "" would make every such name one artist.

    Returns:
        The key, or ``""`` for a name that is empty or only whitespace.
    """
    if not isinstance(name, str):
        raise TypeError(f"name_key needs text, got {type(name).__name__}")
    # Pure, so remembered: an import computes the same few thousand keys tens
    # of thousands of times (measured in DISCOVER-03's outcome).
    return _cached_name_key(name)


def _featuring_chunks(credit: str) -> List[str]:
    """The credit cut at each featuring marker that has an artist on both sides.

    A marker with nothing before it or nothing after it is part of a name — an
    act called "Feat Lux", or one called "Soft Feat" — not a separator, so the
    credit is not cut there.
    """
    chunks: List[str] = []
    start = 0
    for marker in _FEATURING.finditer(credit):
        before = credit[start : marker.start()]
        after = credit[marker.end() :]
        if not _trim(before) or not _trim(after):
            continue
        chunks.append(before)
        start = marker.end()
    chunks.append(credit[start:])
    return chunks


def split_credit(credit: str) -> List[str]:
    """The artists named in a credit, in order.

    "A, B feat. C" is ``["A", "B", "C"]``; "Above & Beyond" is
    ``["Above & Beyond"]``; "A (feat. B)" is ``["A", "B"]``. Each name is kept
    as the credit spelled it, trimmed. A name that appears twice — by its key —
    is kept once, where it first appears, because a credit that lists an artist
    twice credits one artist.

    Returns:
        The names; an empty list for a blank credit.
    """
    if not isinstance(credit, str):
        raise TypeError(f"split_credit needs text, got {type(credit).__name__}")
    # A new list each time: the remembered answer is a tuple nobody can edit.
    return list(_cached_split_credit(credit))


@lru_cache(maxsize=NAME_KEY_CACHE_SIZE)
def _cached_split_credit(credit: str) -> Tuple[str, ...]:
    names: List[str] = []
    seen = set()
    for chunk in _featuring_chunks(credit):
        for part in _SEPARATOR.split(chunk):
            name = _trim(part)
            if not name:
                continue
            key = name_key(name)
            if key in seen:
                continue
            seen.add(key)
            names.append(name)
    return tuple(names)


__all__ = ["ENTITY_NAMES_VERSION", "name_key", "split_credit"]
