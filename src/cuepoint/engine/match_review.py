#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where each track of a review stands, and whether it will be synced (the Review tab).

After a match the person goes through *every* track of a playlist (or a past
search) in one plain table: what was found for it, what differs, and a tick that
says whether its Beatport values go into the files. This module is the rule for
the words and the ticks, so the renderer does not repeat it:

- **matched**: a match the matcher is sure of (accepted without asking), or one
  the person confirmed by choosing it.
- **to_check**: a match is proposed but the matcher is not sure of it.
- **search_failed**: the track's latest attempt could not finish (an error).
  That says the search failed, not that the track is not on Beatport.
- **not_found**: the search ran and found nothing for it.

**The tick is the decision.** A row is ticked when its Beatport values are to be
synced. Nothing the person has said means the default: a sure match is ticked, a
proposal is ticked when its guards passed, and a track with no match is not. Once
the person ticks or unticks a row it is their decision and it is stored as one
(ticked is an *accepted* match, unticked a *rejected* one), so it survives a
re-match and stays in the match history. Unticking a match keeps the candidate it
refused, so ticking it again brings the same one back and the row keeps its status.

Pure: it reads values it is handed and answers plain values, so every branch is
a unit test, and the handler's only job is to fetch the rows.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

STATUS_TO_CHECK = "to_check"
STATUS_NOT_FOUND = "not_found"
STATUS_SEARCH_FAILED = "search_failed"
STATUS_MATCHED = "matched"

#: In the order the page names them.
STATUSES = (
    STATUS_MATCHED,
    STATUS_TO_CHECK,
    STATUS_NOT_FOUND,
    STATUS_SEARCH_FAILED,
)

#: A candidate this sure, with its guards passed, is "matched" rather than "to check".
#: It is :data:`cuepoint.services.match_state.AUTO_ACCEPT_SCORE`, which a test holds in step.
SURE_SCORE = 95

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


def is_sure(candidate: Optional[Any]) -> bool:
    """Whether a candidate is one the matcher would accept on its own."""
    return (
        candidate is not None
        and bool(candidate.guard_ok)
        and candidate.score >= SURE_SCORE
    )


def status_of(
    match: Optional[Any], attempt: Optional[Any], candidate: Optional[Any] = None
) -> str:
    """Where one track stands.

    ``candidate`` is the one the track's state points at. It only matters for a
    refusal, which keeps the candidate it refused: the row then reads as it did
    before it was refused (sure, or to check) instead of as a track nothing was
    found for.
    """
    if match is not None:
        # A decision a newer search disagrees with is to be looked at again, however it was
        # ticked: the tick stays the person's, and the row says it is Check.
        if is_disputed(match) or match.state == "needs_review":
            return STATUS_TO_CHECK
        if match.state == "accepted":
            return STATUS_MATCHED
        if match.state == "rejected" and candidate is not None:
            return STATUS_MATCHED if is_sure(candidate) else STATUS_TO_CHECK
    if search_failed(attempt):
        return STATUS_SEARCH_FAILED
    return STATUS_NOT_FOUND


def is_disputed(match: Optional[Any]) -> bool:
    """Whether a newer attempt disagrees with a decision of the person's."""
    return (
        match is not None
        and getattr(match, "newer_attempt_id", None) is not None
        and decided_by_user(match)
    )


def decided_by_user(match: Optional[Any]) -> bool:
    """Whether the person ticked or unticked this track: a decision of theirs."""
    return (
        match is not None
        and match.decided_by == "user"
        and match.state in ("accepted", "rejected")
    )


def is_tickable(status: str, candidate: Optional[Any]) -> bool:
    """Whether a row has a Beatport match whose values could be synced."""
    return candidate is not None and status in (STATUS_MATCHED, STATUS_TO_CHECK)


def ticked_of(match: Optional[Any], status: str, candidate: Optional[Any]) -> bool:
    """Whether a row's Beatport values go into the files.

    The person's own tick or untick is final. Otherwise a sure match is ticked,
    a proposal is ticked when its guards passed, and nothing else is.
    """
    if not is_tickable(status, candidate):
        return False
    if decided_by_user(match):
        return bool(match.state == "accepted")
    if status == STATUS_MATCHED:
        return True
    return bool(candidate.guard_ok)


def count_by_status(statuses: Iterable[str]) -> Dict[str, int]:
    """How many tracks hold each status, every status present."""
    counts = {status: 0 for status in STATUSES}
    for status in statuses:
        counts[status] += 1
    return counts


def cursor_of(rank: int, track_id: int) -> str:
    """The cursor a row hands back to read on from it.

    A track's place is its stable rank (its plan position in a run, its id
    otherwise) and its id to break a tie: nothing in it changes when a tick
    changes, another track is renamed, matched or deleted, so a cursor never
    skips a row.
    """
    return f"{rank}:{track_id}"


def parse_cursor(text: str) -> Optional[tuple]:
    """A cursor as a place in the listing, or None when it is not one."""
    parts = str(text).split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return None
    return (int(parts[0]), int(parts[1]))
