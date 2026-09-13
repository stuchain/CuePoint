#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where a track's artwork comes from (CLEAN-01, DEC-076).

The type over ``track_artwork``. It records *provenance and a cache key*, never
image bytes: the thumbnails live in a bounded cache outside the database and
outside the backup (DEC-076 as amended), and a table of blobs would make every
backup carry what a scan can rebuild.

``embedded`` has three answers, and "unknown" is one of them. A track whose
file has not been read yet is not a track with no artwork, and a user deciding
whether to embed Beatport's art into it needs to know which of the two it is.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from cuepoint.models.row_values import one_of, required_id

#: The file has not been read.
EMBEDDED_UNKNOWN = "unknown"

#: The file was read and carries no picture.
EMBEDDED_NONE = "none"

#: The file was read and carries a picture.
EMBEDDED_PRESENT = "present"

EMBEDDED_STATES = (EMBEDDED_UNKNOWN, EMBEDDED_NONE, EMBEDDED_PRESENT)


@dataclass(frozen=True)
class TrackArtwork:
    """What CuePoint knows about one track's artwork.

    Attributes:
        track_id: The library track. Also the primary key.
        embedded: One of :data:`EMBEDDED_STATES`.
        embedded_hash: A hash of the embedded picture, so a changed picture is
            noticed. Only a picture that is present has one.
        beatport_url: Beatport's artwork for the accepted match, if any.
        cache_key: The key of the cached thumbnail, if one was made.
        checked_at: When the file was last read. Required once the answer is
            anything but "unknown": an answer has to have been found at some
            moment.
    """

    track_id: int
    embedded: str = EMBEDDED_UNKNOWN
    embedded_hash: Optional[str] = None
    beatport_url: Optional[str] = None
    cache_key: Optional[str] = None
    checked_at: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the record and the relationships between its columns."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.embedded, EMBEDDED_STATES, "embedded")
        if self.embedded_hash is not None and self.embedded != EMBEDDED_PRESENT:
            raise ValueError("Only an embedded picture that is present has a hash")
        if self.embedded != EMBEDDED_UNKNOWN and not (self.checked_at or "").strip():
            raise ValueError("A file that was read must say when it was read")

    @property
    def has_embedded(self) -> bool:
        """True when the file is known to carry a picture."""
        return self.embedded == EMBEDDED_PRESENT

    @property
    def needs_embedding(self) -> bool:
        """True when the file is known to carry none (DEC-076: only these).

        "Unknown" is not "none": a file nobody has read might already have art,
        and embedding over it is exactly what DEC-076 rules out.
        """
        return self.embedded == EMBEDDED_NONE

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "track_id": self.track_id,
            "embedded": self.embedded,
            "embedded_hash": self.embedded_hash,
            "beatport_url": self.beatport_url,
            "cache_key": self.cache_key,
            "checked_at": self.checked_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "TrackArtwork":
        """Build a record from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            track_id=data["track_id"],
            embedded=data.get("embedded") or EMBEDDED_UNKNOWN,
            embedded_hash=data.get("embedded_hash"),
            beatport_url=data.get("beatport_url"),
            cache_key=data.get("cache_key"),
            checked_at=data.get("checked_at"),
        )
