#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A followed Beatport artist or label (Discover's Following tab)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from cuepoint.models.beatport_cache import ENTITY_KINDS, MAX_BEATPORT_ID
from cuepoint.models.row_values import (
    one_of,
    optional_iso_date,
    required_id,
    required_text,
)

#: How many days back a new follow's "new" window starts.
FOLLOW_LOOKBACK_DAYS = 30


@dataclass(frozen=True)
class Follow:
    """One follow.

    Attributes:
        kind: ``artist`` or ``label``.
        beatport_id: The Beatport id followed.
        name: The name shown, as it was when followed.
        followed_at: When it was followed, ISO-8601 UTC.
        seen_through: ISO date; releases after it are new.
    """

    kind: str
    beatport_id: int
    name: str
    followed_at: str
    seen_through: str

    def __post_init__(self) -> None:
        """Validate the row."""
        one_of(self.kind, ENTITY_KINDS, "kind")
        beatport_id = required_id(self.beatport_id, "beatport_id")
        if beatport_id > MAX_BEATPORT_ID:
            raise ValueError(f"beatport_id is beyond {MAX_BEATPORT_ID}")
        object.__setattr__(self, "beatport_id", beatport_id)
        object.__setattr__(self, "name", required_text(self.name, "name").strip())
        required_text(self.followed_at, "followed_at")
        required_text(self.seen_through, "seen_through")
        optional_iso_date(self.seen_through, "seen_through")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API."""
        return {
            "kind": self.kind,
            "beatport_id": self.beatport_id,
            "name": self.name,
            "followed_at": self.followed_at,
            "seen_through": self.seen_through,
        }
