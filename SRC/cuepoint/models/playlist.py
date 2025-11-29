#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Playlist data model.

Represents a playlist with tracks.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from cuepoint.models.track import Track


@dataclass
class Playlist:
    """Represents a playlist.

    Attributes:
        name: Playlist name.
        tracks: List of tracks in playlist.
        file_path: Path to playlist file (optional).
        created_date: Creation date (optional).
        modified_date: Last modification date (optional).
    """

    name: str
    tracks: List[Track] = field(default_factory=list)
    file_path: Optional[Path] = None
    created_date: Optional[str] = None
    modified_date: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate playlist data."""
        if not self.name or not self.name.strip():
            raise ValueError("Playlist name cannot be empty")

    def add_track(self, track: Track) -> None:
        """Add a track to the playlist.

        Args:
            track: Track to add.
        """
        if track.position is None:
            track.position = len(self.tracks) + 1
        self.tracks.append(track)

    def remove_track(self, track: Track) -> None:
        """Remove a track from the playlist.

        Args:
            track: Track to remove.
        """
        if track in self.tracks:
            self.tracks.remove(track)
            # Update positions
            for i, t in enumerate(self.tracks, start=1):
                t.position = i

    def get_track_count(self) -> int:
        """Get number of tracks in playlist.

        Returns:
            Number of tracks.
        """
        return len(self.tracks)

    def to_dict(self) -> dict:
        """Convert playlist to dictionary.

        Returns:
            Dictionary representation of playlist.
        """
        return {
            "name": self.name,
            "tracks": [t.to_dict() for t in self.tracks],
            "file_path": str(self.file_path) if self.file_path else None,
            "created_date": self.created_date,
            "modified_date": self.modified_date,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Playlist":
        """Create playlist from dictionary.

        Args:
            data: Dictionary with playlist data.

        Returns:
            Playlist instance.
        """
        tracks = [Track.from_dict(t) for t in data.get("tracks", [])]
        file_path = None
        if data.get("file_path"):
            file_path = Path(data["file_path"])

        return cls(
            name=data.get("name", ""),
            tracks=tracks,
            file_path=file_path,
            created_date=data.get("created_date"),
            modified_date=data.get("modified_date"),
        )

    def __str__(self) -> str:
        """String representation."""
        return f"Playlist: {self.name} ({len(self.tracks)} tracks)"

    def __repr__(self) -> str:
        """Developer representation."""
        return f"Playlist(name={self.name!r}, track_count={len(self.tracks)})"

