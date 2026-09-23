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

Reading the list
----------------
:class:`WantlistRow` is one entry as the list shows it: the entry, its cached
catalog track and credits, and whether the library owns it now. A
:class:`WantlistPage` is a window of those with the counts the list needs. Its
two filters are independent, since bought and owned are (DEC-093): each is
``all``, ``only`` or ``hide``, the words a run's owned filter uses
(DISCOVER-05), so "bought and not owned yet" is ``bought="only"`` with
``owned="hide"``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from cuepoint.models.beatport_cache import CachedBeatportTrack
from cuepoint.models.discovery_run import (
    OWNED_ALL,
    OWNED_HIDE,
    OWNED_ONLY,
    SORT_ARTIST,
    SORT_RELEASE_DATE,
    SORT_TITLE,
)
from cuepoint.models.row_values import (
    non_negative,
    optional_id,
    optional_text,
    required_id,
    required_text,
)

#: The longest note an entry keeps. A note is a reminder ("the dub, not the
#: original"), and a bound keeps text from outside the engine from growing a
#: row without limit.
MAX_NOTE_LENGTH = 1000

#: Every entry, bought or not.
BOUGHT_ALL = OWNED_ALL

#: Only the entries marked bought.
BOUGHT_ONLY = OWNED_ONLY

#: Only the entries not marked bought.
BOUGHT_HIDE = OWNED_HIDE

#: How the list treats bought entries: the owned filter's three words.
BOUGHT_FILTERS = (BOUGHT_ALL, BOUGHT_ONLY, BOUGHT_HIDE)

#: The list in the order entries were added.
SORT_ADDED = "added_at"

#: What the list can be sorted by.
WANTLIST_SORTS = (SORT_ADDED, SORT_RELEASE_DATE, SORT_ARTIST, SORT_TITLE)


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
        if self.note is not None and len(self.note) > MAX_NOTE_LENGTH:
            raise ValueError(
                f"A note is at most {MAX_NOTE_LENGTH} characters, got {len(self.note)}"
            )
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


@dataclass(frozen=True)
class WantlistRow:
    """One entry as the list shows it.

    Attributes:
        entry: The entry.
        track: Its cached catalog track.
        artists: The track's artists' names, in Beatport's order.
        remixers: Its remixers' names, in Beatport's order.
        owned: Whether the library owns it now (DEC-092), computed when read.
    """

    entry: WantlistEntry
    track: CachedBeatportTrack
    artists: Tuple[str, ...] = ()
    remixers: Tuple[str, ...] = ()
    owned: bool = False

    def __post_init__(self) -> None:
        """Validate the row."""
        if self.entry.beatport_track_id != self.track.beatport_track_id:
            raise ValueError("A row's track is its entry's")


@dataclass(frozen=True)
class WantlistPage:
    """A window of the wantlist, and the counts every response carries.

    Attributes:
        rows: The window.
        total: Entries under the filters; the window is a slice of these.
        entries: Every entry on the list.
        owned: How many of those the library owns now.
        bought: How many of those are marked bought.
    """

    rows: Tuple[WantlistRow, ...]
    total: int
    entries: int
    owned: int
    bought: int

    def __post_init__(self) -> None:
        """Validate the counts."""
        for name in ("total", "entries", "owned", "bought"):
            object.__setattr__(self, name, non_negative(getattr(self, name), name))
        if max(self.total, self.owned, self.bought) > self.entries:
            raise ValueError("The list's counts cannot exceed its entries")
        if len(self.rows) > self.total:
            raise ValueError("A window cannot hold more rows than its list")
