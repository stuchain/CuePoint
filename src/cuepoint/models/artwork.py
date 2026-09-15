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

#: Why a file's picture could not be used (CLEAN-09): its tags could not be
#: read, or the image guard refused the picture for one of its reasons.
REFUSED_TAGS = "tags"
IMAGE_REFUSALS = ("too_large", "format", "dimensions", "corrupt")
EMBEDDED_REFUSALS = (REFUSED_TAGS, *IMAGE_REFUSALS)

#: Why Beatport's image was refused. A download that failed is not one.
BEATPORT_REFUSALS = IMAGE_REFUSALS


@dataclass(frozen=True)
class TrackArtwork:
    """What CuePoint knows about one track's artwork.

    Attributes:
        track_id: The library track. Also the primary key.
        embedded: One of :data:`EMBEDDED_STATES`.
        embedded_hash: A hash of the embedded picture, so a changed picture is
            noticed. Only a picture that is present has one.
        beatport_url: Beatport's artwork for the accepted match, if any; ``""``
            when its page was read and names none.
        cache_key: Reserved by CLEAN-01 and not written: a thumbnail's key is
            derived from its source (CLEAN-09), so it cannot disagree with it.
        checked_at: When the file was last read. Required once the answer is
            anything but "unknown": an answer has to have been found at some
            moment.
        checked_path: The path that was read (CLEAN-09). An answer about
            another path is an answer about nothing; see :meth:`is_stale_for`.
        embedded_refused: Why the file's picture could not be used, from
            :data:`EMBEDDED_REFUSALS`: its tags could not be read (the answer
            then stays "unknown"), or the image guard refused a picture that
            is present.
        beatport_refused: Why Beatport's image at ``beatport_url`` was refused,
            from :data:`BEATPORT_REFUSALS`.
        beatport_page: The Beatport track page ``beatport_url`` was read from
            (CLEAN-09). An answer for another page is an answer for another
            candidate.
    """

    track_id: int
    embedded: str = EMBEDDED_UNKNOWN
    embedded_hash: Optional[str] = None
    beatport_url: Optional[str] = None
    cache_key: Optional[str] = None
    checked_at: Optional[str] = None
    checked_path: Optional[str] = None
    embedded_refused: Optional[str] = None
    beatport_refused: Optional[str] = None
    beatport_page: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the record and the relationships between its columns."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.embedded, EMBEDDED_STATES, "embedded")
        if self.embedded_hash is not None and self.embedded != EMBEDDED_PRESENT:
            raise ValueError("Only an embedded picture that is present has a hash")
        if self.embedded != EMBEDDED_UNKNOWN and not (self.checked_at or "").strip():
            raise ValueError("A file that was read must say when it was read")
        if self.embedded_refused is not None:
            one_of(self.embedded_refused, EMBEDDED_REFUSALS, "embedded_refused")
            if self.embedded_refused == REFUSED_TAGS:
                if self.embedded != EMBEDDED_UNKNOWN:
                    raise ValueError(
                        "A file whose tags could not be read has no answer"
                    )
            elif self.embedded != EMBEDDED_PRESENT:
                raise ValueError("Only a picture that is present can be refused")
        if self.beatport_refused is not None:
            one_of(self.beatport_refused, BEATPORT_REFUSALS, "beatport_refused")
            if not (self.beatport_url or "").strip():
                raise ValueError("A refused Beatport image must name its URL")

    @property
    def has_embedded(self) -> bool:
        """True when the file is known to carry a picture."""
        return self.embedded == EMBEDDED_PRESENT

    def is_stale_for(self, current_path: Optional[str]) -> bool:
        """True when the file answer was not read at the track's current path.

        A row from before CLEAN-09 recorded no path, and is stale for every one.
        """
        return self.checked_path is None or self.checked_path != (current_path or "")

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
            "checked_path": self.checked_path,
            "embedded_refused": self.embedded_refused,
            "beatport_refused": self.beatport_refused,
            "beatport_page": self.beatport_page,
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
            checked_path=data.get("checked_path"),
            embedded_refused=data.get("embedded_refused"),
            beatport_refused=data.get("beatport_refused"),
            beatport_page=data.get("beatport_page"),
        )
