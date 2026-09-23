#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What CuePoint has read from the Beatport catalog (DISCOVER-02).

The three types over ``m0021_discover``'s catalog cache:

- :class:`CachedBeatportTrack` — one ``beatport_tracks`` row, DISCOVER-01's
  ``CatalogTrack`` as stored, with when it was read.
- :class:`CachedBeatportCredit` — one ``beatport_track_artists`` row: a name
  credited on that track, with its Beatport artist id when Beatport gave one.
- :class:`BeatportNameLookup` — one ``beatport_name_lookups`` row: what a name
  search answered, including "nothing" (DEC-091).

A model imports from ``cuepoint.models`` and from nowhere else, so the mapping
from ``CatalogTrack`` lives with the code that writes these rows (DISCOVER-04,
DISCOVER-05), not here.

Every value here came from Beatport
-----------------------------------
So every value is untrusted, and each is checked where the row is built: ids
are positive, the track's ``url`` is an ``https://`` link because the desktop
app opens it, a release date is ``YYYY-MM-DD`` so that sorting it as text is
sorting it by date, and a BPM is a positive finite number.

A label name and its key travel together
----------------------------------------
``label_key`` is DISCOVER-03's normalization of ``label_name``, stored so a
label's tracks are found by index. A key without a name, or a name without a
key, is a row a label page would either miss or be unable to title, so each is
refused without the other.

"Searched, not found" is an answer
----------------------------------
A :class:`BeatportNameLookup` with no ``beatport_id`` records that Beatport was
asked and knew no such name, which is what stops a second run asking again. It
therefore carries no ``beatport_name`` either: a name for a result that does
not exist would be a guess.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from cuepoint.models.row_values import (
    https_url,
    non_negative,
    one_of,
    optional_id,
    optional_iso_date,
    optional_number,
    optional_text,
    required_id,
    required_text,
)
from cuepoint.models.track_credit import CREDIT_ROLES

#: A name lookup, or a page, about an artist.
ENTITY_ARTIST = "artist"

#: A name lookup, or a page, about a label.
ENTITY_LABEL = "label"

#: What a name can be looked up as (DEC-095).
ENTITY_KINDS = (ENTITY_ARTIST, ENTITY_LABEL)


@dataclass(frozen=True)
class CachedBeatportTrack:
    """A Beatport catalog track as CuePoint last read it.

    Attributes:
        beatport_track_id: Beatport's id, the row's primary key.
        title: The track's name, without its mix.
        url: The track's page on the Beatport website.
        fetched_at: When it was read, ISO-8601 UTC. A re-read updates it.
        mix_name: "Original Mix", "Extended Mix" and so on.
        label_id: Beatport's label id.
        label_name: The label's name.
        label_key: ``label_name`` normalized for identity (DISCOVER-03).
        release_id: Beatport's release id.
        release_name: The release's name.
        release_date: ``YYYY-MM-DD``.
        bpm: Tempo, positive.
        key: Classic notation ("Ebm"), converted by DISCOVER-01's parser.
        genre_id: Beatport's genre id.
        genre_name: The genre's name.
    """

    beatport_track_id: int
    title: str
    url: str
    fetched_at: str
    mix_name: Optional[str] = None
    label_id: Optional[int] = None
    label_name: Optional[str] = None
    label_key: Optional[str] = None
    release_id: Optional[int] = None
    release_name: Optional[str] = None
    release_date: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    genre_id: Optional[int] = None
    genre_name: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(
            self,
            "beatport_track_id",
            required_id(self.beatport_track_id, "beatport_track_id"),
        )
        required_text(self.title, "title")
        https_url(self.url, "url")
        required_text(self.fetched_at, "fetched_at")
        for name in (
            "mix_name",
            "label_name",
            "label_key",
            "release_name",
            "key",
            "genre_name",
        ):
            optional_text(getattr(self, name), name)
        for name in ("label_id", "release_id", "genre_id"):
            object.__setattr__(self, name, optional_id(getattr(self, name), name))
        optional_iso_date(self.release_date, "release_date")
        bpm = optional_number(self.bpm, "bpm")
        if bpm is not None and bpm <= 0:
            raise ValueError(f"bpm must be positive, got {bpm}")
        object.__setattr__(self, "bpm", bpm)
        if (self.label_name is None) != (self.label_key is None):
            raise ValueError("label_name and label_key are stored together")

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "beatport_track_id": self.beatport_track_id,
            "title": self.title,
            "mix_name": self.mix_name,
            "url": self.url,
            "label_id": self.label_id,
            "label_name": self.label_name,
            "label_key": self.label_key,
            "release_id": self.release_id,
            "release_name": self.release_name,
            "release_date": self.release_date,
            "bpm": self.bpm,
            "key": self.key,
            "genre_id": self.genre_id,
            "genre_name": self.genre_name,
            "fetched_at": self.fetched_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "CachedBeatportTrack":
        """Build a track from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            beatport_track_id=data["beatport_track_id"],
            title=data["title"],
            url=data["url"],
            fetched_at=data["fetched_at"],
            mix_name=data.get("mix_name"),
            label_id=data.get("label_id"),
            label_name=data.get("label_name"),
            label_key=data.get("label_key"),
            release_id=data.get("release_id"),
            release_name=data.get("release_name"),
            release_date=data.get("release_date"),
            bpm=data.get("bpm"),
            key=data.get("key"),
            genre_id=data.get("genre_id"),
            genre_name=data.get("genre_name"),
        )


@dataclass(frozen=True)
class CachedBeatportCredit:
    """One name credited on a cached Beatport track.

    Attributes:
        beatport_track_id: The track. Its row cascades.
        role: One of :data:`~cuepoint.models.track_credit.CREDIT_ROLES`.
        position: Its place among that role's names, from zero, in Beatport's
            order.
        name: The name as Beatport spells it.
        name_key: ``name`` normalized for identity (DISCOVER-03).
        artist_id: Beatport's artist id, when the credit carried one. This is
            what makes an Artist page an id page rather than a name page
            (DEC-095).
    """

    beatport_track_id: int
    role: str
    position: int
    name: str
    name_key: str
    artist_id: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(
            self,
            "beatport_track_id",
            required_id(self.beatport_track_id, "beatport_track_id"),
        )
        one_of(self.role, CREDIT_ROLES, "role")
        object.__setattr__(self, "position", non_negative(self.position, "position"))
        required_text(self.name, "name")
        required_text(self.name_key, "name_key")
        object.__setattr__(self, "artist_id", optional_id(self.artist_id, "artist_id"))

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "beatport_track_id": self.beatport_track_id,
            "role": self.role,
            "position": self.position,
            "artist_id": self.artist_id,
            "name": self.name,
            "name_key": self.name_key,
        }

    @classmethod
    def from_row(cls, row: Any) -> "CachedBeatportCredit":
        """Build a credit from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            beatport_track_id=data["beatport_track_id"],
            role=data["role"],
            position=data["position"],
            name=data["name"],
            name_key=data["name_key"],
            artist_id=data.get("artist_id"),
        )


@dataclass(frozen=True)
class BeatportNameLookup:
    """What Beatport answered when a name was searched for.

    Attributes:
        kind: One of :data:`ENTITY_KINDS`.
        name_key: The normalized name that was searched for (DISCOVER-03).
        looked_up_at: When, ISO-8601 UTC.
        beatport_id: What it resolved to, or ``None`` for "searched, not
            found".
        beatport_name: The name Beatport gave the result, which may be spelled
            differently from the library's. ``None`` when nothing was found.
    """

    kind: str
    name_key: str
    looked_up_at: str
    beatport_id: Optional[int] = None
    beatport_name: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate the row."""
        one_of(self.kind, ENTITY_KINDS, "kind")
        required_text(self.name_key, "name_key")
        required_text(self.looked_up_at, "looked_up_at")
        object.__setattr__(
            self, "beatport_id", optional_id(self.beatport_id, "beatport_id")
        )
        optional_text(self.beatport_name, "beatport_name")
        if self.beatport_id is None and self.beatport_name is not None:
            raise ValueError("A search that found nothing has no result name")

    @property
    def found(self) -> bool:
        """True when Beatport knew the name."""
        return self.beatport_id is not None

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "kind": self.kind,
            "name_key": self.name_key,
            "beatport_id": self.beatport_id,
            "beatport_name": self.beatport_name,
            "looked_up_at": self.looked_up_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "BeatportNameLookup":
        """Build a lookup from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            kind=data["kind"],
            name_key=data["name_key"],
            looked_up_at=data["looked_up_at"],
            beatport_id=data.get("beatport_id"),
            beatport_name=data.get("beatport_name"),
        )
