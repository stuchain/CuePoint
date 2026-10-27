#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Which words set one title apart from the others (M152, D18).

A duplicate group puts several tracks together because a signal says they are
one recording. When their titles differ ("Touch Me (Hotlap Remix)" and "Touch
Me (Original Mix)"), the words that differ are what a person needs to see, so
the table can light them and say the group may be different mixes. Pure: no
I/O, and nothing here decides whether tracks are duplicates.
"""

from __future__ import annotations

import re
from typing import List, Optional, Sequence

_WORD = re.compile(r"[^\W_]+(?:['’][^\W_]+)*", re.UNICODE)

#: What a title with no mix named is: Beatport calls the plain version this.
ORIGINAL_MIX = "original mix"


def _words(title: Optional[str]) -> List[str]:
    return _WORD.findall(title or "")


def differing_words(titles: Sequence[Optional[str]]) -> List[List[str]]:
    """Return, for each title, its words that not every title has.

    Words are compared without regard to case. Order and spelling are the
    title's own, and a word said twice in one title is listed once. When every
    title has the same words, each answer is empty.
    """
    folded = [{w.casefold() for w in _words(title)} for title in titles]
    if not folded:
        return []
    shared = set.intersection(*folded)
    answers: List[List[str]] = []
    for title in titles:
        seen = set()
        own: List[str] = []
        for word in _words(title):
            key = word.casefold()
            if key not in shared and key not in seen:
                seen.add(key)
                own.append(word)
        answers.append(own)
    return answers


def mixes_differ(mixes: Sequence[Optional[str]]) -> bool:
    """True when the mixes (``None`` for none named) are not all the same one.

    A title with no mix named is the original mix, so ``None`` and
    ``"Original Mix"`` agree.
    """
    named = {(mix or ORIGINAL_MIX).strip().casefold() for mix in mixes}
    return len(named) > 1
