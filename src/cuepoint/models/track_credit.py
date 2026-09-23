#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A library track's credits, one name per row (DISCOVER-02, DEC-094).

The two types over ``m0021_discover``'s library side. ``tracks.artist`` holds
"A, B & C" as Rekordbox wrote it, and a rule that says "tracks by B" cannot be
written against that text without also finding "Bb" and "Bob B". A
:class:`TrackCredit` is one name out of it, with its role, its place in the
credit and its normalized key; DISCOVER-03 splits the credit and computes the
key, and this module only says what a stored row must be.

The credit roles are shared
---------------------------
:data:`CREDIT_ROLES` is the vocabulary of both ``track_credits`` and
``beatport_track_artists``, so a library credit and a Beatport one say
"remixer" the same way and DISCOVER-04 can compare them. It is defined once,
here, and :mod:`cuepoint.models.beatport_cache` imports it.

The index is derived, and says which rule derived it
----------------------------------------------------
Every ``track_credits`` row can be rebuilt from ``tracks``. A
:class:`DerivedIndex` row records which version of the splitting and
normalization rule built it, so changing that rule is a version bump that
rebuilds the index (DISCOVER-03) rather than a migration that rewrites it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from cuepoint.models.row_values import (
    non_negative,
    one_of,
    required_id,
    required_text,
    whole_number,
)

#: Credited as an artist: ``tracks.artist``, or Beatport's ``artists``.
ROLE_ARTIST = "artist"

#: Credited as a remixer: ``tracks.remixer``, or Beatport's ``remixers``.
ROLE_REMIXER = "remixer"

#: How a name is credited on a track, library and Beatport alike.
CREDIT_ROLES = (ROLE_ARTIST, ROLE_REMIXER)

#: The ``derived_indexes`` name of the credit index.
TRACK_CREDITS_INDEX = "track_credits"

#: The ``derived_indexes`` name of the label keys beside each layer of a
#: track's label (DISCOVER-03, migration 0022). Built by the same rule, and so
#: rebuilt with the credits whenever that rule's version changes.
LABEL_KEYS_INDEX = "label_keys"

#: Every derived index the library's name rule builds, in the order a rebuild
#: records them.
NAME_INDEXES = (TRACK_CREDITS_INDEX, LABEL_KEYS_INDEX)


@dataclass(frozen=True)
class TrackCredit:
    """One name credited on one library track.

    Attributes:
        track_id: The library track. Its row cascades.
        role: One of :data:`CREDIT_ROLES`.
        position: Its place among that role's names on the track, from zero.
        name: The name as the credit spelled it.
        name_key: The name normalized for identity (DISCOVER-03's
            ``name_key``); what a rule compares.
    """

    track_id: int
    role: str
    position: int
    name: str
    name_key: str

    def __post_init__(self) -> None:
        """Validate the row."""
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))
        one_of(self.role, CREDIT_ROLES, "role")
        object.__setattr__(self, "position", non_negative(self.position, "position"))
        required_text(self.name, "name")
        required_text(self.name_key, "name_key")

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "track_id": self.track_id,
            "role": self.role,
            "position": self.position,
            "name": self.name,
            "name_key": self.name_key,
        }

    @classmethod
    def from_row(cls, row: Any) -> "TrackCredit":
        """Build a credit from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            track_id=data["track_id"],
            role=data["role"],
            position=data["position"],
            name=data["name"],
            name_key=data["name_key"],
        )


@dataclass(frozen=True)
class DerivedIndex:
    """Which version of a derived index was last built, and when.

    Attributes:
        name: The index, such as :data:`TRACK_CREDITS_INDEX`.
        version: The version of the rule that built it, from one.
        built_at: When the build finished, ISO-8601 UTC.
    """

    name: str
    version: int
    built_at: str

    def __post_init__(self) -> None:
        """Validate the row."""
        required_text(self.name, "name")
        version = whole_number(self.version, "version")
        if version < 1:
            raise ValueError(f"version starts at 1, got {version}")
        object.__setattr__(self, "version", version)
        required_text(self.built_at, "built_at")

    def is_current(self, version: int) -> bool:
        """True when this build was made by exactly the rule at ``version``.

        Exactly, not "at least": a rule compares a value normalized by the
        running engine's rule with keys the index holds, so an index built by
        any other version — newer ones included, after a downgrade — answers
        wrongly until it is rebuilt.
        """
        return self.version == version

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {"name": self.name, "version": self.version, "built_at": self.built_at}

    @classmethod
    def from_row(cls, row: Any) -> "DerivedIndex":
        """Build a record from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            name=data["name"], version=data["version"], built_at=data["built_at"]
        )
