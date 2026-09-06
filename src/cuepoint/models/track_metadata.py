#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""CuePoint's own opinion of a track (ORG-01, DEC-057).

A rating, a favorite and a note — the first data in CuePoint that Rekordbox did
not supply and cannot supply back. It is a separate type over a separate table
for the reason ``m0009_organization`` gives at length: ``LibraryTrack`` is the
*imported* record, rewritten wholesale from the XML on every refresh, and a
user's own rating must live somewhere that rewrite cannot reach.

Two ratings, and neither is the other
-------------------------------------
``LibraryTrack.rating`` is Rekordbox's, imported by DEC-034 and displayed
read-only since DEC-047. :class:`TrackMetadata.rating` is the user's, set in
CuePoint. DEC-057 keeps both and resolves an *effective* value at read time,
with the UI saying which one it is showing.

The resolution rule itself lives with the service that reads it (ORG-02), not
here: this type's job is to hold one of the two values and to refuse a value
that is not a rating at all.

Absent is not zero
------------------
``rating = None`` means "no CuePoint rating", and the effective value falls back
to Rekordbox's. ``rating = 0`` means the user gave it no stars, which is a
judgement rather than the absence of one. DEC-034 drew that distinction for the
imported columns and DEC-047 kept it in the Inspector; it holds here too, which
is why clearing an override is not the same call as rating something zero.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from cuepoint.models.library_track import utc_now_iso

#: Ratings are stars, as ``_rating_to_stars`` already produces at import.
MIN_RATING = 0
MAX_RATING = 5

#: A note is a note, not a document. The cap exists so that an accidental paste
#: is refused with a sentence rather than discovered later as a row that makes
#: every read of the track slow.
MAX_NOTES_LENGTH = 10_000


@dataclass
class TrackMetadata:
    """What CuePoint knows about a track that Rekordbox does not.

    Attributes:
        track_id: The library id of the track this describes. Also the primary
            key: there is one of these per track, or none at all.
        rating: 0–5 stars, or ``None`` for "no CuePoint rating" — which is a
            different fact from zero stars.
        favorite: A flag of its own, not five stars. "I love this" and "this is
            a five" are different statements, and a user who wants both should
            not have to spend one to get the other.
        notes: Free text, or ``None``. Beside Rekordbox's comment, never on top
            of it.
        created_at: When CuePoint first recorded anything about this track.
        updated_at: When it last changed.
    """

    track_id: int
    rating: Optional[int] = None
    favorite: bool = False
    notes: Optional[str] = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Normalize and validate, refusing anything that is not this data."""
        self.track_id = int(self.track_id)
        self.rating = normalize_rating(self.rating)
        self.favorite = bool(self.favorite)
        self.notes = normalize_notes(self.notes)

    @property
    def is_empty(self) -> bool:
        """True when this record says nothing.

        The state a row should not be kept in: nothing to show, nothing to
        resolve against, and one more row to read on every browse.
        """
        return self.rating is None and not self.favorite and not self.notes

    def touch(self) -> None:
        """Mark the record as updated now."""
        self.updated_at = utc_now_iso()

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row.

        ``favorite`` is stored as 0/1: SQLite has no boolean, and writing
        Python's ``True`` would store it as an integer anyway — done explicitly
        so a reader of the table sees what a reader of this code does.
        """
        return {
            "track_id": self.track_id,
            "rating": self.rating,
            "favorite": 1 if self.favorite else 0,
            "notes": self.notes,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "TrackMetadata":
        """Build a record from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        rating = data.get("rating")
        return cls(
            track_id=int(data["track_id"]),
            rating=None if rating is None else int(rating),
            favorite=bool(data.get("favorite")),
            notes=data.get("notes"),
            created_at=data.get("created_at") or utc_now_iso(),
            updated_at=data.get("updated_at") or utc_now_iso(),
        )


def normalize_rating(value: Any) -> Optional[int]:
    """Return a star rating, or ``None`` for no rating.

    Raises:
        ValueError: If the value is not a whole number of stars in range. A
            rating that cannot be honoured is refused rather than clamped:
            silently storing 5 for a request of 9 tells the user their library
            holds something it does not.
    """
    if value is None:
        return None

    if isinstance(value, bool):
        # bool is an int in Python, and "rated True" is not a rating.
        raise ValueError(f"Rating must be a number of stars, got {value!r}")

    try:
        stars = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"Rating must be a number of stars, got {value!r}") from None

    if stars != float(value):
        raise ValueError(f"Rating must be a whole number of stars, got {value!r}")
    if not MIN_RATING <= stars <= MAX_RATING:
        raise ValueError(
            f"Rating must be between {MIN_RATING} and {MAX_RATING} stars, got {stars}"
        )
    return stars


def normalize_notes(value: Any) -> Optional[str]:
    """Return a note, or ``None`` when there is nothing to say.

    An empty or whitespace-only note is ``None``: a row holding ``""`` and a row
    holding nothing would look different in the database and identical to a
    user, and one of them would have to be explained forever.

    Raises:
        ValueError: If the note is longer than :data:`MAX_NOTES_LENGTH`.
    """
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None
    if len(text) > MAX_NOTES_LENGTH:
        raise ValueError(
            f"A note may be at most {MAX_NOTES_LENGTH} characters, got {len(text)}"
        )
    return text
