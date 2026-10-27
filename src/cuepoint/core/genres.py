#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Beatport genre strings, read as the list they are (M95).

A matched track's genre arrives as one string that joined several shapes:
``"Indie Dance, House, Indie Dance|Dark Disco"`` is a comma-joined list of
genres plus a ``Genre|Sub-genre`` pair, with ``Indie Dance`` said twice. A
table cell cannot show that, so this module splits it, drops the repeats, and
names the first genre as the primary one a narrow column shows.

The raw string is never changed: callers keep it as the stored value and add
what this returns beside it (the response shapes only grow).
"""

from __future__ import annotations

import re
from typing import List, Optional

#: What separates genres in a string: a comma, a pipe or a semicolon. A slash
#: and an ampersand do not: "Drum & Bass" and "Hard Dance / Hardcore" are one
#: genre each.
_SEPARATORS = re.compile(r"[,|;]")


def split_genres(raw: Optional[str]) -> List[str]:
    """Return the genres a string names, each once, in the order it names them.

    Repeats are found without regard to case or spacing, and the first spelling
    is kept. A blank or missing string names none.
    """
    if not raw:
        return []
    seen = set()
    genres: List[str] = []
    for part in _SEPARATORS.split(raw):
        name = " ".join(part.split())
        key = name.casefold()
        if name and key not in seen:
            seen.add(key)
            genres.append(name)
    return genres


def primary_genre(raw: Optional[str]) -> Optional[str]:
    """Return the first genre a string names, or ``None`` when it names none."""
    genres = split_genres(raw)
    return genres[0] if genres else None
