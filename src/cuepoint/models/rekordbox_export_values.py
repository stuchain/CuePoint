#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The two layers an export resolves, for one track (EXPORT-04, DEC-079).

An export writes the *effective* value of six fields: CuePoint's own where the
user has one, otherwise the value the import read out of the XML. That rule is
not restated here — :func:`effective_value` and :func:`effective_rating` in
``models/track_metadata.py`` are its only implementation, and this type calls
them. What it adds is the pairing: one row carrying both layers for one track,
so the export resolves each field in one place instead of joining two reads at
every call site.

Why it is not resolved in SQL
-----------------------------
The browse query mirrors the same rule as ``COALESCE(override, imported)``, and
a third spelling of it inside the export's own SELECT would be a third thing to
keep in step — with the symptom being a file a user loads into Rekordbox that
disagrees with the table they exported it from. DEC-057 warned about two
implementations; this is the place where the cost of a disagreement is highest,
so the values arrive unresolved and Python resolves them.

Why the identity is checked and the values are not
--------------------------------------------------
``track_id`` and ``rekordbox_track_id`` are what the export keys on: a blank one
would silently patch nothing, or patch the wrong element. Both are refused here.
The six values are not re-validated, because both layers are already constrained
where they are written — ``_rating_to_stars`` on import, :class:`TrackMetadata`
on override — and a row that somehow holds an odd value should cost that track
its attribute rather than cost the user their export. The writer is built for
that: a rating outside 0-5 renders as nothing rather than as a rating nobody
gave.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from cuepoint.models.row_values import required_id, required_text
from cuepoint.models.track_metadata import effective_rating, effective_value

#: The columns :meth:`ExportTrackValues.from_row` reads, in the order the export
#: query selects them. Kept as data so a test can assert the query and this type
#: name the same things.
EXPORT_VALUE_COLUMNS = (
    "id",
    "rekordbox_track_id",
    "key",
    "bpm",
    "genre",
    "label",
    "year",
    "rating",
    "override_key",
    "override_bpm",
    "override_genre",
    "override_label",
    "override_year",
    "cuepoint_rating",
)


@dataclass(frozen=True)
class ExportTrackValues:
    """One track's imported values beside CuePoint's, unresolved.

    Attributes:
        track_id: The library id, which the Collections point at.
        rekordbox_track_id: The ``TrackID`` the source file carries, which the
            patch matches elements on.
        key: The key the import read, or ``None``.
        bpm: The BPM the import read, or ``None``.
        genre: The genre the import read, or ``None``.
        label: The label the import read, or ``None``.
        year: The year the import read, or ``None``.
        rating: Rekordbox's rating in stars, or ``None``.
        override_key: CuePoint's key, or ``None`` for no override.
        override_bpm: CuePoint's BPM, or ``None``.
        override_genre: CuePoint's genre, or ``None``.
        override_label: CuePoint's label, or ``None``.
        override_year: CuePoint's year, or ``None``.
        cuepoint_rating: CuePoint's rating in stars, or ``None``. Zero is a
            rating a user gave, not the absence of one (DEC-034).
    """

    track_id: int
    rekordbox_track_id: str
    key: Optional[str] = None
    bpm: Optional[float] = None
    genre: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None
    rating: Optional[int] = None
    override_key: Optional[str] = None
    override_bpm: Optional[float] = None
    override_genre: Optional[str] = None
    override_label: Optional[str] = None
    override_year: Optional[int] = None
    cuepoint_rating: Optional[int] = None

    def __post_init__(self) -> None:
        """Refuse a row the export could not key on."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        object.__setattr__(
            self,
            "rekordbox_track_id",
            required_text(self.rekordbox_track_id, "rekordbox_track_id"),
        )

    @property
    def effective_key(self) -> Optional[str]:
        """The key to export, in whatever notation it is stored in.

        Rendering into the export's chosen notation is ``key_text``'s job a
        layer up (DEC-089); this is which of the two keys it renders.
        """
        value: Optional[str] = effective_value(self.key, self.override_key)
        return value

    @property
    def effective_bpm(self) -> Optional[float]:
        """The BPM to export."""
        value: Optional[float] = effective_value(self.bpm, self.override_bpm)
        return value

    @property
    def effective_genre(self) -> Optional[str]:
        """The genre to export."""
        value: Optional[str] = effective_value(self.genre, self.override_genre)
        return value

    @property
    def effective_label(self) -> Optional[str]:
        """The label to export."""
        value: Optional[str] = effective_value(self.label, self.override_label)
        return value

    @property
    def effective_year(self) -> Optional[int]:
        """The year to export."""
        value: Optional[int] = effective_value(self.year, self.override_year)
        return value

    @property
    def effective_stars(self) -> Optional[int]:
        """The rating to export, in stars.

        Named for stars rather than for the ``Rating`` attribute, because the
        multiples-of-51 encoding Rekordbox writes is the writer's business and
        every layer above it counts in stars.
        """
        return effective_rating(self.rating, self.cuepoint_rating)

    @classmethod
    def from_row(cls, row: Any) -> "ExportTrackValues":
        """Build one track's two layers from a row of the export query."""
        data = dict(row)
        return cls(
            track_id=data["id"],
            rekordbox_track_id=data["rekordbox_track_id"],
            key=data.get("key"),
            bpm=data.get("bpm"),
            genre=data.get("genre"),
            label=data.get("label"),
            year=data.get("year"),
            rating=data.get("rating"),
            override_key=data.get("override_key"),
            override_bpm=data.get("override_bpm"),
            override_genre=data.get("override_genre"),
            override_label=data.get("override_label"),
            override_year=data.get("override_year"),
            cuepoint_rating=data.get("cuepoint_rating"),
        )


__all__ = ("EXPORT_VALUE_COLUMNS", "ExportTrackValues")
