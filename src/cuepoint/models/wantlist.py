#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One wantlist entry: a Beatport track the user wants (DISCOVER-02, DEC-093).

The type over ``m0021_discover``'s ``wantlist`` table. An entry references a
cached Beatport track, not a library track: a track the user does not have has
no ``tracks`` row, and nothing in this phase invents one. So an entry is not a
Collection entry, is not in the Library's left pane and is not exported.

Bought is the user's word; owned is the library's
-------------------------------------------------
:attr:`WantlistEntry.bought_at` is the user saying they bought it. Whether the
library *owns* it is computed when the list is read, from Clean's accepted
matches (DEC-092), and is not stored here at all. The two differ exactly when it
matters — bought yesterday, not imported yet — which is why neither is derived
from the other, and why nothing removes an entry when it becomes owned.

Where it came from is a courtesy
--------------------------------
:attr:`~WantlistEntry.added_from_run_id` names the discovery run the track was
added from, and becomes ``None`` if that run is deleted: the entry is the
user's, and the run was only where they saw the track.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from cuepoint.models.row_values import (
    optional_id,
    optional_text,
    required_id,
    required_text,
)


@dataclass(frozen=True)
class WantlistEntry:
    """A Beatport track on the wantlist.

    Attributes:
        beatport_track_id: The cached catalog track; one entry per track.
        added_at: When it was added, ISO-8601 UTC.
        note: The user's note. ``None`` is no note; blank text is refused, so
            "is there a note?" has one answer.
        bought_at: When the user marked it bought, or ``None``.
        added_from_run_id: The run it was added from, while that run exists.
    """

    beatport_track_id: int
    added_at: str
    note: Optional[str] = None
    bought_at: Optional[str] = None
    added_from_run_id: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the entry."""
        object.__setattr__(
            self,
            "beatport_track_id",
            required_id(self.beatport_track_id, "beatport_track_id"),
        )
        required_text(self.added_at, "added_at")
        optional_text(self.note, "note")
        optional_text(self.bought_at, "bought_at")
        object.__setattr__(
            self,
            "added_from_run_id",
            optional_id(self.added_from_run_id, "added_from_run_id"),
        )

    @property
    def is_bought(self) -> bool:
        """True when the user has marked it bought."""
        return self.bought_at is not None

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "beatport_track_id": self.beatport_track_id,
            "added_at": self.added_at,
            "note": self.note,
            "bought_at": self.bought_at,
            "added_from_run_id": self.added_from_run_id,
        }

    @classmethod
    def from_row(cls, row: Any) -> "WantlistEntry":
        """Build an entry from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            beatport_track_id=data["beatport_track_id"],
            added_at=data["added_at"],
            note=data.get("note"),
            bought_at=data.get("bought_at"),
            added_from_run_id=data.get("added_from_run_id"),
        )
