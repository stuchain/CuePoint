#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""When an artist's or a label's recent Beatport tracks were last read (DISCOVER-07).

The type over ``m0024_beatport_listings``. A listing is complete as of
:attr:`BeatportListing.fetched_at` for releases from :attr:`~BeatportListing.since`
on: the Artist or Label page reads its tracks back from the catalog cache while
the listing is fresh, and asks Beatport again once it is not.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from cuepoint.models.beatport_cache import ENTITY_KINDS, MAX_BEATPORT_ID
from cuepoint.models.row_values import (
    non_negative,
    one_of,
    optional_iso_date,
    required_id,
    required_text,
)


@dataclass(frozen=True)
class BeatportListing:
    """One artist's or label's recent tracks, as last read whole.

    Attributes:
        kind: One of :data:`~cuepoint.models.beatport_cache.ENTITY_KINDS`.
        beatport_id: The artist's or label's Beatport id.
        since: The first release day the listing asked for, ``YYYY-MM-DD``.
        fetched_at: When it was read, ISO-8601 UTC.
        tracks: How many tracks the read returned; 0 is an answer.
    """

    kind: str
    beatport_id: int
    since: str
    fetched_at: str
    tracks: int = 0

    def __post_init__(self) -> None:
        """Validate the row."""
        one_of(self.kind, ENTITY_KINDS, "kind")
        beatport_id = required_id(self.beatport_id, "beatport_id")
        if beatport_id > MAX_BEATPORT_ID:
            raise ValueError(f"beatport_id is beyond {MAX_BEATPORT_ID}")
        object.__setattr__(self, "beatport_id", beatport_id)
        required_text(self.since, "since")
        optional_iso_date(self.since, "since")
        required_text(self.fetched_at, "fetched_at")
        object.__setattr__(self, "tracks", non_negative(self.tracks, "tracks"))

    def answers_for(self, since: str) -> bool:
        """True when this listing covers releases from ``since`` on."""
        return self.since <= since

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "kind": self.kind,
            "beatport_id": self.beatport_id,
            "since": self.since,
            "fetched_at": self.fetched_at,
            "tracks": self.tracks,
        }

    @classmethod
    def from_row(cls, row: Any) -> "BeatportListing":
        """Build a listing from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            kind=data["kind"],
            beatport_id=data["beatport_id"],
            since=data["since"],
            fetched_at=data["fetched_at"],
            tracks=data.get("tracks", 0),
        )
