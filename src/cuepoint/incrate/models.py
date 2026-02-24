"""inCrate data models: in-memory and persisted shapes for inventory."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=False)
class CollectionTrack:
    """In-memory track shape from Rekordbox COLLECTION XML.

    Attributes:
        track_id: Rekordbox TrackID.
        title: Track title.
        artist: Artist string.
        remix_version: From Remixer attribute or parsed from title.
        label: From XML Label attribute; None if unknown.
    """

    track_id: str
    title: str
    artist: str
    remix_version: str
    label: Optional[str] = None


@dataclass
class InventoryRecord:
    """Row shape for persisted inventory (SQLite)."""

    track_key: str
    track_id: str
    artist: str
    title: str
    remix_version: str
    label: Optional[str]
    beatport_track_id: Optional[str] = None
    beatport_url: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
