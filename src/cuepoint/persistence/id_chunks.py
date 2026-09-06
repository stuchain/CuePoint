#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Asking about many ids at once, safely (ORG-02, ORG-03).

Two helpers shared by the repositories that take a set of track ids. They exist
because SQLite's parameter limit is not the same everywhere: builds before 3.32
cap a statement at 999 host parameters, newer ones at 32,766, and either can be
changed at compile time. A window is a hundred ids and a batch is forty
thousand, so the chunking belongs in one place rather than at every call site —
and a user's library is not where a build's limit should be discovered.
"""

from __future__ import annotations

from typing import Dict, Iterable, Iterator, List, Sequence, Tuple

#: Ids per statement. Comfortably under the oldest limit, large enough that a
#: window is one query and a forty-thousand-id batch is eighty rather than
#: forty thousand.
CHUNK_SIZE = 500


def unique_ids(ids: Iterable[int]) -> List[int]:
    """Return the ids once each, in the order first seen.

    Order is kept because it costs nothing and makes the SQL a caller sees in a
    trace predictable; the callers themselves are building lookups.
    """
    seen: Dict[int, None] = {}
    for value in ids:
        seen.setdefault(int(value), None)
    return list(seen)


def chunked(values: Sequence[int], size: int = CHUNK_SIZE) -> Iterator[Tuple[int, ...]]:
    """Yield ``values`` in tuples of at most ``size``."""
    for start in range(0, len(values), size):
        yield tuple(values[start : start + size])
