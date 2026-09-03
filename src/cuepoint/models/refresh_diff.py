#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
What a refresh would do, computed without doing any of it (DEC-032).

DEC-003 deletes tracks that have left Rekordbox, and that is irreversible: the
tags, ratings and Collection membership attached to them go too. A preview is
what turns that into a decision rather than a surprise, so this describes the
change before anything is written.

Reporting shape
---------------
Counts are exact; the per-item detail is capped. A first refresh after a
Rekordbox rebuild can legitimately touch every track in a fifty-thousand-track
library, and a preview does not need fifty thousand rows to say so — it needs
the number, and enough examples to be believable. Every category therefore
carries a count, a bounded sample, and a flag saying whether the sample is all
of it.

The classification must match what an import would actually do
--------------------------------------------------------------
The diff resolves identity with the same
:func:`~cuepoint.models.library_track.resolve_identity` the import uses, and
applies the same rule about a library row being claimed only once. If the two
ever disagreed the preview would be a lie — it would promise one thing and the
apply would do another, which is worse than having no preview at all.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

#: Track fields compared to decide whether Rekordbox changed something.
#:
#: Identity (``rekordbox_track_id``), derived values (``normalized_path``) and
#: library bookkeeping (``id``, ``created_at``, ``updated_at``) are excluded:
#: the first is what a match is *decided by*, and the others are CuePoint's own
#: and would report a change on every refresh.
COMPARED_FIELDS: Tuple[str, ...] = (
    "title",
    "artist",
    "remixer",
    "album",
    "label",
    "genre",
    "key",
    "bpm",
    "year",
    "duration_seconds",
    "rating",
    "play_count",
    "colour",
    "date_added",
    "comment",
    "bitrate",
    "file_path",
)

#: Fields that change on their own, without anyone editing anything.
#:
#: Playing a track in Rekordbox increments its play count. A refresh that
#: announced "1,200 tracks changed" after a weekend of DJing would be telling
#: the truth and saying nothing useful, so a track whose only difference is one
#: of these is still ``changed`` — the library will store the new value — but is
#: not counted as *notable*. Deciding this here rather than in the UI is the
#: point: the rule belongs with the comparison, not with one of its readers.
INCIDENTAL_FIELDS: Tuple[str, ...] = ("play_count",)

#: How many examples each category keeps. Enough to fill a preview list without
#: holding a second copy of the library in memory.
DEFAULT_DETAIL_LIMIT = 500


@dataclass(frozen=True)
class TrackSummary:
    """Enough of a track to recognize it in a preview."""

    rekordbox_track_id: str
    title: str
    artist: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rekordbox_track_id": self.rekordbox_track_id,
            "title": self.title,
            "artist": self.artist,
        }


@dataclass(frozen=True)
class TrackChange:
    """A track that exists in both, with the fields that differ.

    Attributes:
        fields: Names of the fields whose values differ, in
            :data:`COMPARED_FIELDS` order so two runs read the same way.
    """

    rekordbox_track_id: str
    title: str
    artist: str
    fields: Tuple[str, ...]

    @property
    def is_notable(self) -> bool:
        """True when something other than an incidental field changed."""
        return any(name not in INCIDENTAL_FIELDS for name in self.fields)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rekordbox_track_id": self.rekordbox_track_id,
            "title": self.title,
            "artist": self.artist,
            "fields": list(self.fields),
            "notable": self.is_notable,
        }


@dataclass(frozen=True)
class PlaylistChange:
    """A mirrored playlist that differs, and how.

    Attributes:
        change: ``"membership"`` when the tracks differ, ``"kind"`` when a name
            became a folder or the reverse.
        track_count: Entries the export now declares for it.
        previous_track_count: Entries the library holds for it.
    """

    rekordbox_path: str
    kind: str
    change: str
    track_count: int = 0
    previous_track_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rekordbox_path": self.rekordbox_path,
            "kind": self.kind,
            "change": self.change,
            "track_count": self.track_count,
            "previous_track_count": self.previous_track_count,
        }


@dataclass(frozen=True)
class PlaylistSummary:
    """A mirrored playlist node, named the way a preview would show it."""

    rekordbox_path: str
    kind: str
    track_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rekordbox_path": self.rekordbox_path,
            "kind": self.kind,
            "track_count": self.track_count,
        }


@dataclass
class Category:
    """An exact count with a bounded sample of what is in it."""

    count: int = 0
    items: List[Any] = field(default_factory=list)
    limit: int = DEFAULT_DETAIL_LIMIT

    def add(self, item: Any) -> None:
        self.count += 1
        if len(self.items) < self.limit:
            self.items.append(item)

    @property
    def truncated(self) -> bool:
        """True when the sample is smaller than the count."""
        return self.count > len(self.items)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "count": self.count,
            "items": [item.to_dict() for item in self.items],
            "truncated": self.truncated,
        }


@dataclass
class RefreshDiff:
    """What a refresh of ``xml_path`` would change, having changed nothing.

    Attributes:
        xml_path: The export this was computed against.
        added: Tracks the export has that the library does not.
        changed: Tracks in both whose Rekordbox fields differ.
        removed: Library tracks the export no longer has. **These are the
            deletions DEC-003 makes irreversible**, and the reason this preview
            exists.
        relinked: Tracks matched by path because Rekordbox renumbered them
            (DEC-002). They are *not* removals, and reporting them as such would
            describe destroying data that is actually being kept.
        playlists_added / playlists_changed / playlists_removed: The same for
            the mirrored tree.
        references: How many Collections or Sets hold the removed tracks
            (DEC-011). Zero until Phase 6 fills the seam; carried here so the
            flow does not change shape when it does.
    """

    xml_path: str
    added: Category = field(default_factory=Category)
    changed: Category = field(default_factory=Category)
    removed: Category = field(default_factory=Category)
    relinked: Category = field(default_factory=Category)
    playlists_added: Category = field(default_factory=Category)
    playlists_changed: Category = field(default_factory=Category)
    playlists_removed: Category = field(default_factory=Category)
    references: Optional[Any] = None
    duration_seconds: float = 0.0

    @property
    def is_empty(self) -> bool:
        """True when a refresh would change nothing at all.

        The case that has to be both fast and silent: re-reading an untouched
        export must not report noise, or a user learns to ignore the preview.
        """
        return not any(
            (
                self.added.count,
                self.changed.count,
                self.removed.count,
                self.relinked.count,
                self.playlists_added.count,
                self.playlists_changed.count,
                self.playlists_removed.count,
            )
        )

    @property
    def notable_changed_count(self) -> int:
        """Changed tracks whose difference is more than an incidental field.

        Only counts what is in the sample, so it is a floor when ``changed`` is
        truncated — a preview should not claim precision it did not compute.
        """
        return sum(1 for change in self.changed.items if change.is_notable)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the API. A public shape; extend rather than rename."""
        return {
            "xml_path": self.xml_path,
            "is_empty": self.is_empty,
            "duration_seconds": self.duration_seconds,
            "tracks": {
                "added": self.added.to_dict(),
                "changed": self.changed.to_dict(),
                "removed": self.removed.to_dict(),
                "relinked": self.relinked.to_dict(),
                "notable_changed_count": self.notable_changed_count,
            },
            "playlists": {
                "added": self.playlists_added.to_dict(),
                "changed": self.playlists_changed.to_dict(),
                "removed": self.playlists_removed.to_dict(),
            },
            "references": self.references.to_dict()
            if self.references is not None
            else None,
        }


def changed_fields(stored: Any, incoming: Any) -> Tuple[str, ...]:
    """Return the names of the fields that differ, in a stable order.

    Plain equality, including for ``bpm``. A tolerance was written for it first,
    on the theory that ``"124.00"`` and a stored float might not compare equal —
    and then removed, because they always do: the parser turns both ``"124.00"``
    and ``"124.000"`` into ``124.0``, and SQLite stores and returns that double
    unchanged. Nothing could distinguish the tolerance from its absence, and
    code no test can reach is worse than no code.
    """
    return tuple(
        name
        for name in COMPARED_FIELDS
        if getattr(stored, name, None) != getattr(incoming, name, None)
    )


def summarize(track: Any) -> TrackSummary:
    """Build the preview summary for a track."""
    return TrackSummary(
        rekordbox_track_id=track.rekordbox_track_id,
        title=track.title,
        artist=track.artist,
    )


def playlist_summaries(nodes: Iterable[Any]) -> List[PlaylistSummary]:
    """Build preview summaries for playlist nodes."""
    return [
        PlaylistSummary(
            rekordbox_path=node.rekordbox_path,
            kind=node.kind,
            track_count=node.track_count,
        )
        for node in nodes
    ]
