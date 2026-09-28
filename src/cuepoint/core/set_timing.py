#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A Set's planned times and the running time they add up to (PREP-03, DEC-107).

No SQL and no I/O: whole seconds in, whole seconds out, so the rule can be
tested exhaustively and read in one place.

The rule, as DEC-107 decided it
-------------------------------
- **Times are typed.** A user types an in time and an out time for an entry, as
  ``m:ss`` or ``h:mm:ss``, in whole seconds, because
  ``tracks.duration_seconds`` is whole seconds and nothing finer is planned.
  :func:`parse_time` reads exactly those two forms and refuses everything else
  with the reason. :func:`format_time` writes a number of seconds back the
  shortest way, so a time typed as ``0:05:00`` reads back as ``5:00``.
- **An entry is timed when it has an out time.** An empty in time is the start
  of the track, so :func:`planned_seconds` is ``out - (in or 0)``.
- **An untimed entry counts as nothing.** :func:`running_time` sums the timed
  entries and says how many were left out, rather than guessing their length.
  That was the recommendation not taken: a running time is a sum of what the
  user planned.
- **"Starts at" stops at the first untimed entry.** :func:`starts_at` gives each
  entry the moment it starts, up to and including the first untimed one, whose
  start is still known. After it the clock is unknown, so every later entry
  starts at ``None`` rather than at a number that would be wrong.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Protocol, Sequence

#: The longest time :func:`parse_time` can return: 99:59:59, since its hours
#: have at most two digits and ``m:ss`` stops at 999:59. A track is never that
#: long, and the bound keeps a typing slip in a track of unknown length from
#: being stored as a time of years. A chapter's target is held to it too.
MAX_TIME_SECONDS = 99 * 3600 + 59 * 60 + 59

#: ``m:ss``: minutes, up to three digits, and two digits of seconds. Minutes
#: past 59 are allowed, because DJs write a long track as ``75:30`` as often as
#: ``1:15:30``, and both mean one thing.
_MINUTES_SECONDS = re.compile(r"([0-9]{1,3}):([0-9]{2})", re.ASCII)

#: ``h:mm:ss``: hours, up to two digits, then two digits each of minutes and
#: seconds.
_HOURS_MINUTES_SECONDS = re.compile(r"([0-9]{1,2}):([0-9]{2}):([0-9]{2})", re.ASCII)


class TimeFormatError(ValueError):
    """Text that is not a time as a Set's entries are planned in.

    A ``ValueError``, so every handler that already answers a refusal with its
    message answers this one too.
    """


class PlannedTimes(Protocol):
    """Anything carrying an entry's planned in and out times, in seconds."""

    @property
    def in_seconds(self) -> Optional[int]:
        """When the entry comes in; ``None`` is the start of the track."""
        ...

    @property
    def out_seconds(self) -> Optional[int]:
        """When it goes out; ``None`` means the entry is untimed."""
        ...


@dataclass(frozen=True)
class RunningTime:
    """How long a run of entries is planned to play (DEC-107).

    Attributes:
        seconds: The sum of the timed entries' planned lengths.
        timed: How many entries were counted.
        untimed: How many entries had no out time and so counted as nothing.
    """

    seconds: int = 0
    timed: int = 0
    untimed: int = 0

    @property
    def entries(self) -> int:
        """How many entries were looked at, timed or not."""
        return self.timed + self.untimed

    @property
    def is_complete(self) -> bool:
        """True when every entry is timed, so :attr:`seconds` is the whole run.

        An empty run is complete: it plays for no time, and that is known.
        """
        return self.untimed == 0

    def __add__(self, other: "RunningTime") -> "RunningTime":
        """Two runs played one after the other."""
        return RunningTime(
            seconds=self.seconds + other.seconds,
            timed=self.timed + other.timed,
            untimed=self.untimed + other.untimed,
        )


def parse_time(text: str) -> int:
    """Read ``m:ss`` or ``h:mm:ss`` into whole seconds.

    Surrounding whitespace is ignored. Nothing else is: not a bare number of
    seconds (``90`` could be a minute and a half or an hour and a half), not a
    fraction of a second, not a sign, not a unit, and not a field out of range.

    Raises:
        TimeFormatError: If the text is not a time in one of the two forms, or
            a field is out of range. The message says which.
    """
    if not isinstance(text, str):
        raise TimeFormatError(f"A time is text such as 3:45, not {text!r}")
    stripped = text.strip()
    if not stripped:
        raise TimeFormatError("A time cannot be empty")

    long_form = _HOURS_MINUTES_SECONDS.fullmatch(stripped)
    short_form = _MINUTES_SECONDS.fullmatch(stripped)
    if long_form is not None:
        hours, minutes, seconds = (int(part) for part in long_form.groups())
        if minutes > 59:
            raise TimeFormatError(
                f"{stripped!r} has {minutes} minutes: in h:mm:ss the minutes "
                "run from 00 to 59"
            )
    elif short_form is not None:
        hours = 0
        minutes, seconds = (int(part) for part in short_form.groups())
    else:
        raise TimeFormatError(
            f"{stripped!r} is not a time: type minutes and seconds as m:ss "
            "(3:45) or hours, minutes and seconds as h:mm:ss (1:03:45)"
        )
    if seconds > 59:
        raise TimeFormatError(
            f"{stripped!r} has {seconds} seconds: seconds run from 00 to 59"
        )

    return hours * 3600 + minutes * 60 + seconds


def parse_optional_time(text: Optional[str]) -> Optional[int]:
    """Read a time, or ``None`` for nothing typed.

    An empty or blank field clears a time, which is how a user takes an out
    time away and leaves the entry untimed.

    Raises:
        TimeFormatError: As :func:`parse_time`, for text that is not blank.
    """
    if text is None or (isinstance(text, str) and not text.strip()):
        return None
    return parse_time(text)


def format_time(seconds: int) -> str:
    """Write whole seconds as ``m:ss`` under an hour and ``h:mm:ss`` from one.

    The inverse of :func:`parse_time` for every number it can return.

    Raises:
        ValueError: If ``seconds`` is not a whole number, or is negative.
    """
    if isinstance(seconds, bool) or not isinstance(seconds, int):
        raise ValueError(f"A time is a whole number of seconds, not {seconds!r}")
    if seconds < 0:
        raise ValueError(f"A time cannot be negative: {seconds}")
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def planned_seconds(
    in_seconds: Optional[int], out_seconds: Optional[int]
) -> Optional[int]:
    """How long one entry is planned to play, or ``None`` when it is untimed.

    An empty in time is the start of the track (DEC-107).

    Raises:
        ValueError: If both are set and the entry would go out before it came
            in. The database and the model refuse such a row, so this is a
            caller's mistake rather than data to be tolerated.
    """
    if out_seconds is None:
        return None
    start = in_seconds or 0
    if start >= out_seconds:
        raise ValueError(
            f"An entry must come in before it goes out, got in {start}s and "
            f"out {out_seconds}s"
        )
    return out_seconds - start


def running_time(plans: Iterable[PlannedTimes]) -> RunningTime:
    """Sum the timed entries, and count the untimed ones (DEC-107)."""
    seconds = timed = untimed = 0
    for plan in plans:
        length = planned_seconds(plan.in_seconds, plan.out_seconds)
        if length is None:
            untimed += 1
        else:
            seconds += length
            timed += 1
    return RunningTime(seconds=seconds, timed=timed, untimed=untimed)


def starts_at(plans: Sequence[PlannedTimes]) -> List[Optional[int]]:
    """When each entry starts, counted from the start of the run.

    The first entry starts at 0. Each later one starts when the one before it
    ends, which is known only while every entry before it is timed. So the
    first untimed entry still has a start, and every entry after it has
    ``None`` (DEC-107).
    """
    starts: List[Optional[int]] = []
    clock: Optional[int] = 0
    for plan in plans:
        starts.append(clock)
        if clock is not None:
            length = planned_seconds(plan.in_seconds, plan.out_seconds)
            clock = None if length is None else clock + length
    return starts


__all__: Sequence[str] = (
    "MAX_TIME_SECONDS",
    "PlannedTimes",
    "RunningTime",
    "TimeFormatError",
    "format_time",
    "parse_optional_time",
    "parse_time",
    "planned_seconds",
    "running_time",
    "starts_at",
)
