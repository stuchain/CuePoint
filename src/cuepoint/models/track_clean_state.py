#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What a row of the Library says about Clean (CLEAN-11).

Four answers a table row carries beside the imported record, so the Library and
the Clean page can mark a track without a second request per row: where it
stands with Beatport, whether a newer attempt disagrees with a user's decision,
what the last file check found, and what artwork would be shown.

Each is read through the rule vocabulary's own SQL expression
(``models/filter_rule.py``), so a row that says "needs review" is exactly a row
the filter ``match_state is needs_review`` finds. There is no second definition
to keep in step.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from cuepoint.models.filter_rule import ARTWORK_UNKNOWN, ARTWORK_VALUES
from cuepoint.models.file_status import FILE_NOT_CHECKED, FILE_STATUSES
from cuepoint.models.match_attempt import MATCH_STATES, STATE_NOT_MATCHED
from cuepoint.models.row_values import flag, one_of, required_id


@dataclass(frozen=True)
class TrackCleanState:
    """One track's Clean answers, as the vocabulary reads them.

    Attributes:
        track_id: The library track.
        match_state: One of the stored states, or ``not_matched``.
        match_disputed: True when a newer attempt disagrees with a user's decision.
        file_status: What the check found for the path the track has now, or
            ``not_checked``.
        artwork: ``embedded``, ``beatport``, ``none`` or ``unknown``.
    """

    track_id: int
    match_state: str = STATE_NOT_MATCHED
    match_disputed: bool = False
    file_status: str = FILE_NOT_CHECKED
    artwork: str = ARTWORK_UNKNOWN

    def __post_init__(self) -> None:
        """Refuse an answer the vocabulary could not have given."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.match_state, MATCH_STATES + (STATE_NOT_MATCHED,), "match_state")
        object.__setattr__(
            self, "match_disputed", flag(self.match_disputed, "match_disputed")
        )
        one_of(self.file_status, FILE_STATUSES + (FILE_NOT_CHECKED,), "file_status")
        one_of(self.artwork, ARTWORK_VALUES, "artwork")

    def to_dict(self) -> Dict[str, Any]:
        """The four answers under the names a row carries them."""
        return {
            "match_state": self.match_state,
            "match_disputed": self.match_disputed,
            "file_status": self.file_status,
            "artwork": self.artwork,
        }

    @classmethod
    def from_row(cls, row: Any) -> "TrackCleanState":
        """Build the answers from a row of :func:`build_clean_states`."""
        data = dict(row)
        return cls(
            track_id=data["id"],
            match_state=data["match_state"],
            match_disputed=bool(data["match_disputed"]),
            file_status=data["file_status"],
            artwork=data["artwork"],
        )


__all__ = ("TrackCleanState",)
