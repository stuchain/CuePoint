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

Five more overrides (CLEAN-01, DEC-068)
---------------------------------------
Phase 7 adds key, BPM, genre, label and year to the same record, on the same
terms: each is ``None`` for "no override", in which case Rekordbox's value shows
through, and a value when a match was applied or the user typed one. This type
refuses what is not that kind of value at all — a BPM that is not a number, a
year that is not a whole one — and stores blank text as no override. The
vocabulary rules (a BPM's range, a key's notation, a genre's length) belong to
CLEAN-05, which owns writing them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from cuepoint.models.library_track import utc_now_iso

#: Ratings are stars, as ``_rating_to_stars`` already produces at import.
MIN_RATING = 0
MAX_RATING = 5

#: What :func:`rating_source` answers with. Stable identifiers rather than
#: display text: the renderer labels them, and DEC-057's "yours" versus
#: "from Rekordbox" is wording, not data.
SOURCE_CUEPOINT_RATING = "cuepoint"
SOURCE_REKORDBOX_RATING = "rekordbox"

#: A note is a note, not a document. The cap exists so that an accidental paste
#: is refused with a sentence rather than discovered later as a row that makes
#: every read of the track slow.
MAX_NOTES_LENGTH = 10_000

#: The fields CuePoint can override (DEC-068), named as the ``tracks`` columns
#: they sit beside.
OVERRIDE_FIELDS = ("key", "bpm", "genre", "label", "year")


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
        key: The key override, or ``None``.
        bpm: The BPM override, or ``None``.
        genre: The genre override, or ``None``.
        label: The label override, or ``None``.
        year: The year override, or ``None``.
    """

    track_id: int
    rating: Optional[int] = None
    favorite: bool = False
    notes: Optional[str] = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)
    key: Optional[str] = None
    bpm: Optional[float] = None
    genre: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None

    def __post_init__(self) -> None:
        """Normalize and validate, refusing anything that is not this data."""
        self.track_id = int(self.track_id)
        self.rating = normalize_rating(self.rating)
        self.favorite = bool(self.favorite)
        self.notes = normalize_notes(self.notes)
        self.key = normalize_override_text(self.key, "key")
        self.bpm = normalize_override_bpm(self.bpm)
        self.genre = normalize_override_text(self.genre, "genre")
        self.label = normalize_override_text(self.label, "label")
        self.year = normalize_override_year(self.year)

    @property
    def has_overrides(self) -> bool:
        """True when any of :data:`OVERRIDE_FIELDS` holds a value."""
        return any(getattr(self, name) is not None for name in OVERRIDE_FIELDS)

    @property
    def is_empty(self) -> bool:
        """True when this record says nothing.

        The state a row should not be kept in: nothing to show, nothing to
        resolve against, and one more row to read on every browse.
        """
        return (
            self.rating is None
            and not self.favorite
            and not self.notes
            and not self.has_overrides
        )

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
            "key": self.key,
            "bpm": self.bpm,
            "genre": self.genre,
            "label": self.label,
            "year": self.year,
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
            key=data.get("key"),
            bpm=data.get("bpm"),
            genre=data.get("genre"),
            label=data.get("label"),
            year=data.get("year"),
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


def normalize_override_text(value: Any, name: str) -> Optional[str]:
    """Return a text override trimmed, or ``None`` for no override.

    Blank is no override, for :func:`normalize_notes`'s reason: ``""`` and
    ``NULL`` would read differently in the table and identically to a user —
    and here the difference would matter, because an empty override would hide
    Rekordbox's value behind nothing.

    Raises:
        ValueError: If the value is not text. A key of ``8`` is a mistake
            upstream, not the key "8".
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"The {name} override must be text, got {value!r}")
    text = value.strip()
    return text or None


def normalize_override_bpm(value: Any) -> Optional[float]:
    """Return a BPM override as a number, or ``None`` for no override.

    Raises:
        ValueError: If the value is not a finite number.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"The bpm override must be a number, got {value!r}")
    try:
        bpm = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"The bpm override must be a number, got {value!r}") from None
    if not math.isfinite(bpm):
        raise ValueError(f"The bpm override must be a finite number, got {value!r}")
    return bpm


def normalize_override_year(value: Any) -> Optional[int]:
    """Return a year override as a whole number, or ``None`` for no override.

    Raises:
        ValueError: If the value is not a whole number.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"The year override must be a whole number, got {value!r}")
    try:
        year = int(value)
        whole = year == float(value)
    except (TypeError, ValueError, OverflowError):
        whole = False
    if not whole:
        raise ValueError(f"The year override must be a whole number, got {value!r}")
    return year


def effective_value(imported: Any, override: Any) -> Any:
    """Return the value to show for an overridable field (DEC-068).

    The override when there is one, otherwise what Rekordbox imported. The rule
    ``effective_rating`` states for a rating, stated once for the other five, and
    the one the SQL coalesce in ``models/filter_rule.py`` mirrors.
    """
    return imported if override is None else override


def overridden_fields(record: Optional["TrackMetadata"]) -> Tuple[str, ...]:
    """The override fields a record holds a value for, in :data:`OVERRIDE_FIELDS` order."""
    if record is None:
        return ()
    return tuple(name for name in OVERRIDE_FIELDS if getattr(record, name) is not None)


def effective_rating(
    rekordbox_rating: Optional[int], cuepoint_rating: Optional[int]
) -> Optional[int]:
    """Return the rating to show, resolving DEC-057's two layers.

    CuePoint's value wins when there is one; otherwise Rekordbox's shows
    through; and when neither exists the track has no rating, which is not the
    same as having none of them.

    **This is the only implementation of that rule.** The browse query, the
    track-detail read and the Inspector all resolve a rating, and two
    implementations would disagree the day one of them is edited — with the
    symptom being a table and a panel showing different stars for the same
    track, which reads as data corruption rather than as a bug.

    ``0`` from either layer is a rating and is returned as one: a user who
    deliberately rated something zero stars has said something, and DEC-034
    already keeps that distinct from a field Rekordbox never wrote.

    Args:
        rekordbox_rating: What the import stored on ``tracks.rating``.
        cuepoint_rating: What the user set, or ``None`` for no override.

    Returns:
        The effective rating, or ``None`` when neither layer has one.
    """
    if cuepoint_rating is not None:
        return cuepoint_rating
    return rekordbox_rating


def rating_source(
    rekordbox_rating: Optional[int], cuepoint_rating: Optional[int]
) -> Optional[str]:
    """Return where :func:`effective_rating` took its answer from.

    DEC-057 requires the UI to say which layer it is showing, and asking that
    question anywhere other than beside the resolution itself is how the label
    and the value drift apart.

    Returns:
        :data:`SOURCE_CUEPOINT_RATING`, :data:`SOURCE_REKORDBOX_RATING`, or
        ``None`` when there is no rating to attribute.
    """
    if cuepoint_rating is not None:
        return SOURCE_CUEPOINT_RATING
    if rekordbox_rating is not None:
        return SOURCE_REKORDBOX_RATING
    return None
