#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Value checks shared by the models over CuePoint's own tables (CLEAN-01).

Written for the five models over the tables ``m0011_clean`` creates, and used
since by the export record (``m0020``) and Discover's tables (``m0021``). Each
of them has to refuse the same few kinds of wrong value: a word outside a closed
vocabulary, a count that is negative, a flag that is not a yes or a no. The
database refuses most of these too, with a CHECK — but as an
``IntegrityError`` from a statement far from the mistake. These say what was
wrong, where it was built.

A refused value is refused, never clamped or guessed at, for the reason
``normalize_rating`` gives: storing something other than what was asked for
tells the user their library holds something it does not.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any, Optional, Sequence


def one_of(value: Any, allowed: Sequence[str], name: str) -> str:
    """Return ``value`` when it is in the vocabulary.

    Raises:
        ValueError: If it is not, naming the field and what is allowed.
    """
    if not isinstance(value, str) or value not in allowed:
        raise ValueError(f"{name} must be one of {tuple(allowed)}, got {value!r}")
    return value


def whole_number(value: Any, name: str) -> int:
    """Return a whole number.

    ``bool`` is refused although Python counts it as an ``int``: a rank of
    ``True`` is a bug, not a rank of one.

    Raises:
        ValueError: If the value is not a whole number.
    """
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a whole number, got {value!r}")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a whole number, got {value!r}") from None
    try:
        exact = number == float(value)
    except (TypeError, ValueError):
        exact = False
    if not exact:
        raise ValueError(f"{name} must be a whole number, got {value!r}")
    return number


def optional_whole_number(value: Any, name: str) -> Optional[int]:
    """Return a whole number, or ``None`` for no value."""
    return None if value is None else whole_number(value, name)


def non_negative(value: Any, name: str) -> int:
    """Return a whole number that is zero or more.

    Raises:
        ValueError: If it is not a whole number, or is negative.
    """
    number = whole_number(value, name)
    if number < 0:
        raise ValueError(f"{name} cannot be negative: {number}")
    return number


def optional_non_negative(value: Any, name: str) -> Optional[int]:
    """Return a non-negative whole number, or ``None`` for no value."""
    return None if value is None else non_negative(value, name)


def optional_number(value: Any, name: str) -> Optional[float]:
    """Return a finite number, or ``None`` for no value.

    Raises:
        ValueError: If the value is not a number, or is NaN or infinite —
            SQLite stores neither faithfully, and neither is a score or a BPM.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a number, got {value!r}")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number, got {value!r}") from None
    if not math.isfinite(number):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    return number


def number(value: Any, name: str) -> float:
    """Return a finite number, refusing ``None``.

    Raises:
        ValueError: If there is no value, or it is not a finite number.
    """
    if value is None:
        raise ValueError(f"{name} is required")
    result = optional_number(value, name)
    assert result is not None
    return result


def flag(value: Any, name: str) -> bool:
    """Return a yes or no from ``True``/``False`` or SQLite's ``1``/``0``.

    Anything else is refused rather than read for truthiness: ``"no"`` is a
    truthy string, and a guard verdict of ``"no"`` stored as passed would be the
    opposite of what the matcher said.

    Raises:
        ValueError: If the value is not one of those four.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    raise ValueError(f"{name} must be true or false, got {value!r}")


def required_text(value: Any, name: str) -> str:
    """Return non-blank text as given.

    Not stripped: a file path or a URL is what it is, and a copy with its
    whitespace removed can name a different file.

    Raises:
        ValueError: If the value is not text, or is blank.
    """
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required, got {value!r}")
    return value


def optional_text(value: Any, name: str) -> Optional[str]:
    """Return non-blank text as given, or ``None`` for no value.

    Blank text is refused rather than read as "no value": ``None`` and ``""``
    are different facts, and a column that can hold both answers "is there a
    note?" two ways (DEC-068's reason for refusing an empty override).

    Raises:
        ValueError: If the value is not text, or is blank.
    """
    return None if value is None else required_text(value, name)


def optional_iso_date(value: Any, name: str) -> Optional[str]:
    """Return an ISO-8601 calendar date (``YYYY-MM-DD``) as given, or ``None``.

    Stored dates are compared and sorted as text, which orders them correctly
    only in exactly this form.

    Raises:
        ValueError: If the value is not a date in that form.
    """
    if value is None:
        return None
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError(f"{name} must be a YYYY-MM-DD date, got {value!r}")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"{name} must be a YYYY-MM-DD date, got {value!r}") from None
    return value


def https_url(value: Any, name: str) -> str:
    """Return an ``https://`` URL as given.

    A stored link is something the desktop app opens for the user, so a
    ``javascript:``, ``file:`` or plain ``http:`` value is refused where the row
    is built rather than trusted where it is clicked.

    Raises:
        ValueError: If the value is not text starting ``https://`` with a host.
    """
    text = required_text(value, name)
    if not text.startswith("https://") or len(text) <= len("https://"):
        raise ValueError(f"{name} must be an https:// URL, got {value!r}")
    return text


def optional_https_url(value: Any, name: str) -> Optional[str]:
    """Return an ``https://`` URL, or ``None`` for no value."""
    return None if value is None else https_url(value, name)


def optional_id(value: Any, name: str) -> Optional[int]:
    """Return a row id, or ``None`` when there is none.

    Raises:
        ValueError: If the value is not a positive whole number. SQLite never
            hands out id zero or a negative id, so one is a bug upstream.
    """
    if value is None:
        return None
    row_id = whole_number(value, name)
    if row_id < 1:
        raise ValueError(f"{name} must be a positive id, got {row_id}")
    return row_id


def required_id(value: Any, name: str) -> int:
    """Return a row id, refusing ``None``."""
    if value is None:
        raise ValueError(f"{name} is required")
    result = optional_id(value, name)
    assert result is not None
    return result
