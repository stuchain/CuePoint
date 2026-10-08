#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Beatport's key is the key (PAGES-15, DEC-201).

A track's key is the user's correction, else the key of its accepted Beatport
match, else none. Rekordbox's key is never the fallback. This module is that
rule in Python, for every reader that resolves a key from values it already
holds; ``models/filter_rule.py`` is the same rule in SQL (``KEY_RAW_SQL``,
``KEY_SQL``), for every reader that asks the database.

What counts
-----------
- An **accepted** match (``track_match.state = 'accepted'``), automatic or the
  user's (DEC-202), supplies its candidate's key. A rejected, no-match or
  needs-review state supplies none.
- A **correction** is an override key whose latest History row is not
  Beatport's. A key applied from a match before this change is Beatport's
  (DEC-203): it follows the match, and a later reject takes it away. With no
  History row at all, an override is a correction.
- Both are read with :func:`parse_key`. A key that cannot be read is no key,
  and is logged once.

The app shows Camelot ("8A"); Track details adds the name ("A minor").
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Optional

from cuepoint.models.filter_rule import KEY_SOURCE_BEATPORT, KEY_SOURCE_YOURS
from cuepoint.services.override_values import (
    NOTATION_CAMELOT,
    NOTATION_CLASSIC,
    format_key,
    parse_key,
)

logger = logging.getLogger(__name__)

#: The History source of a value applied from a match (``SOURCE_BEATPORT``).
HISTORY_SOURCE_BEATPORT = "beatport"

#: Spellings remembered by ``_parse``.
_CACHE_SIZE = 4096


@dataclass(frozen=True)
class ResolvedKey:
    """A track's key as the app uses it.

    Attributes:
        camelot: The Camelot code ("8A"), or None when the track has no key.
        name: The key's name ("A minor"), or None.
        source: ``yours``, ``beatport`` or None.
    """

    camelot: Optional[str] = None
    name: Optional[str] = None
    source: Optional[str] = None


#: A track with no key.
NO_KEY = ResolvedKey()

#: The 24 Camelot codes in wheel order: 1A, 1B, 2A ... 12B (a number before its
#: letter, so 2A comes before 10A, which the alphabet would not do).
CAMELOT_ORDER = tuple(f"{number}{letter}" for number in range(1, 13) for letter in "AB")


def key_name(pitch: int, minor: bool) -> str:
    """A key's name, as a person says it: ``A minor``, ``F♯ major``."""
    classic = format_key(pitch, minor, NOTATION_CLASSIC)
    letter, rest = classic[0], classic[1:]
    if rest.endswith("m"):
        rest = rest[:-1]
    accidental = {"#": "♯", "b": "♭"}.get(rest, "")
    return f"{letter}{accidental} {'minor' if minor else 'major'}"


@lru_cache(maxsize=_CACHE_SIZE)
def _parse(text: str) -> Optional[ResolvedKey]:
    """What a text names, remembered: a library holds a few dozen spellings of
    its keys and SQL asks about every row, so each is read once. A text that is
    not a key is reported here, which is once per text while it stays cached."""
    parsed = parse_key(text)
    if parsed is None:
        logger.info("Not a key, so the track has none: %r", text)
        return None
    return ResolvedKey(
        camelot=format_key(*parsed, NOTATION_CAMELOT), name=key_name(*parsed)
    )


def _read(text: Any) -> Optional[ResolvedKey]:
    """The key a text names, as a resolved key without a source."""
    if not isinstance(text, str) or not text.strip():
        return None
    return _parse(text)


def camelot_of(text: Any) -> Optional[str]:
    """The Camelot code of a key in any notation, or None when it is not one."""
    found = _read(text)
    return None if found is None else found.camelot


def wheel_rank(text: Any) -> Optional[int]:
    """Where a key sits on the wheel, for sorting: 1A, 1B, 2A, ... 12B.

    The number first, then the letter, so a set of keys reads round the wheel.
    None for a text that is not a key, which sorts last.
    """
    found = camelot_of(text)
    if found is None:
        return None
    return int(found[:-1]) * 2 + (1 if found[-1] == "B" else 0)


def is_correction(override_key: Optional[str], override_source: Optional[str]) -> bool:
    """Whether an override key is the user's own (DEC-203)."""
    return override_key is not None and override_source != HISTORY_SOURCE_BEATPORT


def resolve_key(
    override_key: Optional[str],
    override_source: Optional[str],
    beatport_key: Optional[str],
) -> ResolvedKey:
    """The track's key: the user's correction, else Beatport's, else none.

    Args:
        override_key: The override layer's key, or None.
        override_source: The latest History source for that key (``beatport``
            or ``cuepoint``), or None when there is no row.
        beatport_key: The key of the track's accepted match, or None when the
            match is not accepted or has no key.
    """
    if is_correction(override_key, override_source):
        found = _read(override_key)
        if found is None:
            return NO_KEY
        return ResolvedKey(found.camelot, found.name, KEY_SOURCE_YOURS)
    found = _read(beatport_key)
    if found is None:
        return NO_KEY
    return ResolvedKey(found.camelot, found.name, KEY_SOURCE_BEATPORT)


def register_sql_functions(connection: sqlite3.Connection) -> None:
    """Teach a connection ``cp_camelot(text)`` (a key's Camelot code, or NULL) and
    ``cp_wheel(text)`` (its place on the wheel, or NULL)."""
    connection.create_function("cp_camelot", 1, camelot_of, deterministic=True)
    connection.create_function("cp_wheel", 1, wheel_rank, deterministic=True)


__all__ = (
    "CAMELOT_ORDER",
    "NO_KEY",
    "ResolvedKey",
    "camelot_of",
    "is_correction",
    "key_name",
    "register_sql_functions",
    "resolve_key",
    "wheel_rank",
)
