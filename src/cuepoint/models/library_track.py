#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Persistent library track.

``LibraryTrack`` is the durable entity stored in the CuePoint library database:
the thing tags, ratings, notes, collection membership and match decisions attach
to, and the thing that must survive a Rekordbox re-import.

It is deliberately **not** named ``Track``. ``cuepoint.models.track.Track`` is
the ephemeral, per-run type the matching pipeline parses out of an XML file and
throws away. Two different classes called ``Track`` would repeat the
``TrackResult`` problem, where the same name meant two shapes depending on the
import and objects leaked into a place that could not handle them.

Identity (DEC-002)
------------------
Rekordbox ``TrackID`` is the primary identity. If a track's TrackID is absent
from a later import, CuePoint falls back to matching on the normalized file
path, and records that the identity was **re-linked** rather than doing it
silently. This matters because Rekordbox can reassign TrackIDs (for example
after a library rebuild), and without the fallback a user would lose every tag,
rating and collection membership attached to those tracks.
"""

from __future__ import annotations

import posixpath
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(tz=timezone.utc).isoformat()


def normalize_path(file_path: Optional[str]) -> str:
    """Return a comparable form of a file path.

    Normalization is deliberately **platform-independent**: separators become
    ``/``, redundant segments are collapsed, and the result is case-folded. A
    per-platform scheme (``os.path.normcase``) would make a database
    non-portable between machines, and CuePoint's database is a single file a
    user may well copy or restore onto a different computer.

    The tradeoff: on a case-sensitive filesystem, two files differing only in
    case (``Track.mp3`` and ``track.mp3`` in one folder) compare equal here.
    That is vanishingly rare in a music library, and this value is only ever
    consulted as a *fallback* after Rekordbox TrackID lookup has already failed.

    Returns an empty string for empty input, which never matches anything.
    """
    if not file_path:
        return ""

    candidate = str(file_path).strip()
    if not candidate:
        return ""

    candidate = candidate.replace("\\", "/")
    # Collapse "." and duplicate separators; posixpath is used explicitly so
    # the result does not depend on the host platform.
    candidate = posixpath.normpath(candidate)
    if len(candidate) > 1:
        candidate = candidate.rstrip("/")

    return candidate.casefold()


@dataclass
class LibraryTrack:
    """A track in the persistent CuePoint library.

    Attributes:
        id: Database primary key; ``None`` until the track has been persisted.
        rekordbox_track_id: Rekordbox ``TrackID``; the primary identity.
        file_path: Path as it appeared in the Rekordbox export, preserved
            verbatim so the original value can always be shown to the user.
        normalized_path: Comparable form of ``file_path``, kept as a column so
            the fallback lookup can be indexed.
        title: Track title.
        artist: Track artist.
        remixer: Remixer, when the export or title provides one.
        album: Album/release name.
        label: Record label.
        genre: Genre.
        key: Musical key, as written by Rekordbox.
        bpm: Beats per minute.
        year: Release year.
        duration_seconds: Track length in seconds, imported from Rekordbox's
            ``TotalTime`` (DEC-038). One column rather than two for the same
            quantity, so nothing downstream has to decide which is authoritative.
        rating: Star rating, 0-5. ``None`` when the export carried no rating,
            which is not the same as an explicit zero. Rekordbox's raw 0-255
            encoding is converted at the parser boundary, never stored here.
        play_count: Rekordbox play count; ``None`` when unknown.
        colour: Rekordbox colour label, as written by Rekordbox.
        date_added: Date the track was added to Rekordbox, kept as the export's
            own string rather than reformatted.
        comment: Rekordbox comments field.
        bitrate: Bitrate in kbps.
        created_at: When CuePoint first saw this track (ISO-8601, UTC).
        updated_at: When CuePoint last updated it (ISO-8601, UTC).
    """

    rekordbox_track_id: str
    title: str
    artist: str
    file_path: str = ""
    normalized_path: str = ""
    id: Optional[int] = None
    remixer: Optional[str] = None
    album: Optional[str] = None
    label: Optional[str] = None
    genre: Optional[str] = None
    key: Optional[str] = None
    bpm: Optional[float] = None
    year: Optional[int] = None
    duration_seconds: Optional[int] = None
    rating: Optional[int] = None
    play_count: Optional[int] = None
    colour: Optional[str] = None
    date_added: Optional[str] = None
    comment: Optional[str] = None
    bitrate: Optional[int] = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)

    def __post_init__(self) -> None:
        """Validate and derive fields."""
        if not str(self.rekordbox_track_id).strip():
            raise ValueError("rekordbox_track_id cannot be empty")
        self.rekordbox_track_id = str(self.rekordbox_track_id).strip()

        # normalized_path is derived, never supplied by callers, so it cannot
        # drift out of step with file_path.
        self.normalized_path = normalize_path(self.file_path)

        if self.bpm is not None:
            self.bpm = float(self.bpm)
            if not 0 < self.bpm <= 300:
                raise ValueError(f"bpm out of range: {self.bpm}")

        if self.year is not None:
            self.year = int(self.year)

        if self.rating is not None:
            self.rating = int(self.rating)
            # Rekordbox writes 0/51/102/153/204/255 in its XML. Rejecting
            # anything outside 0-5 here is what stops a raw value reaching the
            # database, where it would silently read as a nonsense rating
            # instead of failing at the boundary that should have converted it.
            if not 0 <= self.rating <= 5:
                raise ValueError(f"rating must be a star count 0-5, got {self.rating}")

        for name in ("play_count", "duration_seconds", "bitrate"):
            value = getattr(self, name)
            if value is not None:
                setattr(self, name, int(value))

    def touch(self) -> None:
        """Mark the track as updated now."""
        self.updated_at = utc_now_iso()

    def to_dict(self) -> Dict[str, Any]:
        """Return a plain dict, suitable for persistence or serialization."""
        return {
            "id": self.id,
            "rekordbox_track_id": self.rekordbox_track_id,
            "file_path": self.file_path,
            "normalized_path": self.normalized_path,
            "title": self.title,
            "artist": self.artist,
            "remixer": self.remixer,
            "album": self.album,
            "label": self.label,
            "genre": self.genre,
            "key": self.key,
            "bpm": self.bpm,
            "year": self.year,
            "duration_seconds": self.duration_seconds,
            "rating": self.rating,
            "play_count": self.play_count,
            "colour": self.colour,
            "date_added": self.date_added,
            "comment": self.comment,
            "bitrate": self.bitrate,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: Any) -> "LibraryTrack":
        """Build a track from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=data.get("id"),
            rekordbox_track_id=data["rekordbox_track_id"],
            file_path=data.get("file_path") or "",
            title=data.get("title") or "",
            artist=data.get("artist") or "",
            remixer=data.get("remixer"),
            album=data.get("album"),
            label=data.get("label"),
            genre=data.get("genre"),
            key=data.get("key"),
            bpm=data.get("bpm"),
            year=data.get("year"),
            duration_seconds=data.get("duration_seconds"),
            rating=data.get("rating"),
            play_count=data.get("play_count"),
            colour=data.get("colour"),
            date_added=data.get("date_added"),
            comment=data.get("comment"),
            bitrate=data.get("bitrate"),
            created_at=data.get("created_at") or utc_now_iso(),
            updated_at=data.get("updated_at") or utc_now_iso(),
        )


@dataclass(frozen=True)
class IdentityMatch:
    """How an incoming track was matched to one already in the library.

    Attributes:
        track: The existing library track that was matched.
        matched_by: ``"rekordbox_id"`` for a primary-identity hit, ``"path"``
            when the normalized-path fallback was used.
        relinked: True when the match was made on path and the incoming
            Rekordbox TrackID differs from the stored one — the track is the
            same file, but Rekordbox has renumbered it. Surfaced so the change
            can be reported rather than applied silently.
    """

    track: LibraryTrack
    matched_by: str
    relinked: bool


def resolve_identity(
    rekordbox_track_id: str,
    file_path: Optional[str],
    find_by_rekordbox_id: Callable[[str], Optional[LibraryTrack]],
    find_by_normalized_path: Callable[[str], Optional[LibraryTrack]],
) -> Optional[IdentityMatch]:
    """Find the existing library track an incoming track refers to (DEC-002).

    Order matters: Rekordbox TrackID is authoritative, and the path fallback is
    consulted only when it misses. Doing it the other way round would re-link
    tracks whenever two entries happened to share a path.

    Args:
        rekordbox_track_id: TrackID from the incoming Rekordbox export.
        file_path: File path from the incoming export, if any.
        find_by_rekordbox_id: Lookup by Rekordbox TrackID.
        find_by_normalized_path: Lookup by normalized path.

    Returns:
        An :class:`IdentityMatch`, or ``None`` when this is a new track.
    """
    track_id = str(rekordbox_track_id).strip()
    if track_id:
        existing = find_by_rekordbox_id(track_id)
        if existing is not None:
            return IdentityMatch(
                track=existing, matched_by="rekordbox_id", relinked=False
            )

    normalized = normalize_path(file_path)
    if not normalized:
        return None

    existing = find_by_normalized_path(normalized)
    if existing is None:
        return None

    return IdentityMatch(
        track=existing,
        matched_by="path",
        relinked=existing.rekordbox_track_id != track_id,
    )


@dataclass(frozen=True)
class QueueTrack:
    """The part of a track a playback queue needs (PLAYER-05).

    Five fields, not twenty. DEC-012 loads *the current view* as the queue, and
    a view can be tens of thousands of rows; ratings, labels, colours and the
    rest are the Inspector's business and would multiply the payload for
    nothing. What is here is what a queue entry has to have: which track it is,
    what to show for it, how long it runs, and the file to open.

    Frozen because a queue entry is a snapshot of the library at the moment the
    queue was built, not a live view of the row.
    """

    id: int
    title: str
    artist: str
    duration_seconds: Optional[int]
    file_path: str

    @classmethod
    def from_row(cls, row: Any) -> "QueueTrack":
        """Build a queue entry from a database row (``sqlite3.Row`` or mapping)."""
        data = dict(row)
        return cls(
            id=int(data["id"]),
            title=data.get("title") or "",
            artist=data.get("artist") or "",
            duration_seconds=data.get("duration_seconds"),
            file_path=data.get("file_path") or "",
        )
