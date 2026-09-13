#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Groups of tracks that look like the same recording (CLEAN-01, DEC-074).

The types over ``duplicate_groups``, ``duplicate_members`` and
``duplicate_dismissals``. A group is a *signal* — why these tracks were put
together — and a *key* the signal produced. Nothing here deletes a track or a
file; a group is a question for the user, and a dismissal is their answer.

A dismissal remembers who was in the group
------------------------------------------
"These are not duplicates" is an answer about particular tracks. If the same
signal and key later gather a track that was not there when the user answered,
the answer does not cover it, and the group has to be shown again. So a
dismissal stores :func:`member_hash` of the member ids it was given, and
:meth:`DuplicateDismissal.covers` compares against the group as it is now.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional

from cuepoint.models.row_values import one_of, optional_id, required_id, required_text

#: The same file path, spelled the same after normalization.
SIGNAL_PATH = "path"

#: The same accepted Beatport track.
SIGNAL_BEATPORT = "beatport"

#: The same normalized artist, title and mix.
SIGNAL_TEXT = "text"

SIGNALS = (SIGNAL_PATH, SIGNAL_BEATPORT, SIGNAL_TEXT)


def member_hash(track_ids: Iterable[int]) -> str:
    """Return a stable fingerprint of a group's membership.

    Order and repetition do not change it — the same tracks are the same group
    however they were listed — and any added or removed track does.

    Raises:
        ValueError: If there are no members, or an id is not a track id. A
            fingerprint of nobody would match every other fingerprint of nobody.
    """
    ids = sorted({required_id(track_id, "track_id") for track_id in track_ids})
    if not ids:
        raise ValueError("A duplicate group needs members to fingerprint")
    joined = ",".join(str(track_id) for track_id in ids)
    return hashlib.sha256(joined.encode("ascii")).hexdigest()


@dataclass(frozen=True)
class DuplicateGroup:
    """Tracks one signal put together under one key.

    Attributes:
        signal: One of :data:`SIGNALS`.
        group_key: What the signal produced — unique per signal.
        computed_at: When the group was last computed.
        id: Database primary key; ``None`` until persisted.
    """

    signal: str
    group_key: str
    computed_at: str
    id: Optional[int] = None

    def __post_init__(self) -> None:
        """Validate the group."""
        object.__setattr__(self, "id", optional_id(self.id, "id"))
        one_of(self.signal, SIGNALS, "signal")
        required_text(self.group_key, "group_key")
        required_text(self.computed_at, "computed_at")

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "id": self.id,
            "signal": self.signal,
            "group_key": self.group_key,
            "computed_at": self.computed_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "DuplicateGroup":
        """Build a group from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            signal=data["signal"],
            group_key=data["group_key"],
            computed_at=data["computed_at"],
        )


@dataclass(frozen=True)
class DuplicateMember:
    """One track in one group.

    Attributes:
        group_id: The group.
        track_id: The library track.
    """

    group_id: int
    track_id: int

    def __post_init__(self) -> None:
        """Validate the membership."""
        object.__setattr__(self, "group_id", required_id(self.group_id, "group_id"))
        object.__setattr__(self, "track_id", required_id(self.track_id, "track_id"))

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {"group_id": self.group_id, "track_id": self.track_id}

    @classmethod
    def from_row(cls, row: Any) -> "DuplicateMember":
        """Build a membership from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(group_id=data["group_id"], track_id=data["track_id"])


@dataclass(frozen=True)
class DuplicateDismissal:
    """A user's "these are not duplicates", for the members they saw.

    Keyed by signal and key rather than by group id, because groups are
    recomputed and a dismissal has to outlive the row it was made against.

    Attributes:
        signal: One of :data:`SIGNALS`.
        group_key: The key of the group that was dismissed.
        member_hash: :func:`member_hash` of the members it had then.
        dismissed_at: When.
    """

    signal: str
    group_key: str
    member_hash: str
    dismissed_at: str

    def __post_init__(self) -> None:
        """Validate the dismissal."""
        one_of(self.signal, SIGNALS, "signal")
        required_text(self.group_key, "group_key")
        required_text(self.member_hash, "member_hash")
        required_text(self.dismissed_at, "dismissed_at")

    def covers(self, group: DuplicateGroup, track_ids: Iterable[int]) -> bool:
        """True when this dismissal still answers for the group as it is now.

        It does only for the same signal, the same key, and exactly the same
        members. A group that gained or lost a track is a different question.
        """
        if (group.signal, group.group_key) != (self.signal, self.group_key):
            return False
        return member_hash(track_ids) == self.member_hash

    def to_dict(self) -> Dict[str, Any]:
        """Return the persisted row."""
        return {
            "signal": self.signal,
            "group_key": self.group_key,
            "member_hash": self.member_hash,
            "dismissed_at": self.dismissed_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "DuplicateDismissal":
        """Build a dismissal from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            signal=data["signal"],
            group_key=data["group_key"],
            member_hash=data["member_hash"],
            dismissed_at=data["dismissed_at"],
        )
