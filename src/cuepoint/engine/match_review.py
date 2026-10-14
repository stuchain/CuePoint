#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where each track of a run stands, for the review list (the Review tab).

After a match the person goes through *every* track of the run, not only the
ones that need a yes or no: what was found for it, what differs, and one click
to decide. This module is the rule for the words the list uses, so the renderer
does not repeat it:

- **to_check**: a match is proposed and waits for a yes or no, or a decision a
  newer attempt disagrees with. A disputed decision is to be looked at again,
  so it is checked first and never reads as done.
- **done**: the person decided it (accepted a match, or said it is not this
  track). A decision is theirs and survives a re-match.
- **matched**: a match the matcher is sure of, accepted without asking.
- **search_failed**: the track's latest attempt could not finish (an error).
  That says the search failed, not that the track is not on Beatport.
- **not_found**: the search ran and found nothing for it.

Pure: it reads values it is handed and answers plain values, so every branch is
a unit test, and the handler's only job is to fetch the rows.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

STATUS_TO_CHECK = "to_check"
STATUS_NOT_FOUND = "not_found"
STATUS_SEARCH_FAILED = "search_failed"
STATUS_MATCHED = "matched"
STATUS_DONE = "done"

#: In the order the list's chips and bar draw them.
STATUSES = (
    STATUS_TO_CHECK,
    STATUS_NOT_FOUND,
    STATUS_SEARCH_FAILED,
    STATUS_MATCHED,
    STATUS_DONE,
)

#: Two more ways to look at the same tracks: what the person refused, and what a
#: newer search disagrees with them about.
FILTER_REJECTED = "rejected"
FILTER_DISPUTED = "disputed"
FILTER_ALL = "all"
FILTERS = (FILTER_ALL, *STATUSES, FILTER_REJECTED, FILTER_DISPUTED)

#: What a comparison's field is called in the list, where it is not its own name.
_DIFFERING_NAMES = {"artists": "artist", "mix": "remix", "remixers": "remixer"}

#: The order the list names what differs: what a DJ looks at first.
_DIFFERING_ORDER = (
    "title",
    "artist",
    "remix",
    "remixer",
    "key",
    "bpm",
    "genre",
    "label",
    "year",
)


def search_failed(attempt: Optional[Any]) -> bool:
    """Whether a track's latest attempt failed rather than finding nothing."""
    return attempt is not None and getattr(attempt, "outcome", None) == "error"


def differing(differs: Optional[Dict[str, Optional[bool]]]) -> List[str]:
    """The names of the fields that differ, as the list says them."""
    if not differs:
        return []
    named = {
        _DIFFERING_NAMES.get(field, field) for field, value in differs.items() if value
    }
    return [name for name in _DIFFERING_ORDER if name in named]


def is_disputed(match: Optional[Any]) -> bool:
    """Whether a newer attempt disagrees with what the track stands on."""
    return match is not None and match.newer_attempt_id is not None


def status_of(match: Optional[Any], attempt: Optional[Any]) -> str:
    """Where one track stands: its state, and the latest attempt for a track without one."""
    if match is not None:
        # First: a decision a newer search disagrees with is not finished.
        if is_disputed(match) or match.state == "needs_review":
            return STATUS_TO_CHECK
        if match.decided_by == "user" and match.state in ("accepted", "rejected"):
            return STATUS_DONE
        if match.state == "accepted":
            return STATUS_MATCHED
        if match.state == "rejected":
            return STATUS_DONE
    if search_failed(attempt):
        return STATUS_SEARCH_FAILED
    return STATUS_NOT_FOUND


def decision_of(match: Optional[Any]) -> Optional[str]:
    """What the person decided, or None."""
    if (
        match is not None
        and match.decided_by == "user"
        and match.state in ("accepted", "rejected")
    ):
        return str(match.state)
    return None


def count_by_status(statuses: Iterable[str]) -> Dict[str, int]:
    """How many tracks hold each status, every status present."""
    counts = {status: 0 for status in STATUSES}
    for status in statuses:
        counts[status] += 1
    return counts


def matches_filter(
    name: str, status: str, decision: Optional[str], disputed: bool
) -> bool:
    """Whether a track belongs under one of :data:`FILTERS`."""
    if name == FILTER_ALL:
        return True
    if name == FILTER_REJECTED:
        return decision == "rejected"
    if name == FILTER_DISPUTED:
        return disputed
    return status == name


def undecided_first(statuses: List[str]) -> List[int]:
    """The order to list tracks in: those still to look at, then the decided, each in plan order."""
    open_ = [i for i, status in enumerate(statuses) if status != STATUS_DONE]
    done = [i for i, status in enumerate(statuses) if status == STATUS_DONE]
    return open_ + done


def cursor_key(status: str, rank: int, track_id: int) -> tuple:
    """A track's place in the listing: the ones still to look at, then the decided.

    Within each, by the track's stable rank (its plan position in a run, its id
    otherwise) and its id to break a tie: nothing in it changes when another
    track is renamed, matched or deleted, so a cursor never skips a row.
    """
    return (1 if status == STATUS_DONE else 0, rank, track_id)


def cursor_of(status: str, rank: int, track_id: int) -> str:
    """The cursor a row hands back to read on from it."""
    group, place, ident = cursor_key(status, rank, track_id)
    return f"{group}:{place}:{ident}"


def parse_cursor(text: str) -> Optional[tuple]:
    """A cursor as a place in the listing, or None when it is not one."""
    parts = str(text).split(":")
    if len(parts) != 3 or parts[0] not in ("0", "1"):
        return None
    if not (parts[1].isdigit() and parts[2].isdigit()):
        return None
    return (int(parts[0]), int(parts[1]), int(parts[2]))
