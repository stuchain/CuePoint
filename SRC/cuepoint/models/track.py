#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Track data model.

Represents a track with all its metadata.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Track:
    """Represents a track from a playlist.

    Attributes:
        title: Track title.
        artist: Track artist.
        album: Album name (optional).
        duration: Track duration in seconds (optional).
        bpm: Track BPM (optional).
        key: Musical key (optional).
        year: Release year (optional).
        genre: Genre (optional).
        label: Record label (optional).
        position: Position in playlist (optional).
        file_path: Path to audio file (optional).
        track_id: Unique track identifier (optional).
    """

    title: str
    artist: str
    album: Optional[str] = None
    duration: Optional[float] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    label: Optional[str] = None
    position: Optional[int] = None
    file_path: Optional[str] = None
    track_id: Optional[str] = None

    def __post_init__(self) -> None:
        """Validate track data after initialization."""
        if not self.title or not self.title.strip():
            raise ValueError("Track title cannot be empty")
        if not self.artist or not self.artist.strip():
            raise ValueError("Track artist cannot be empty")
        if self.duration is not None and self.duration < 0:
            raise ValueError("Track duration cannot be negative")
        if self.bpm is not None and (self.bpm < 0 or self.bpm > 300):
            raise ValueError("Track BPM must be between 0 and 300")
        if self.year is not None and (self.year < 1900 or self.year > datetime.now().year + 1):
            raise ValueError(f"Track year must be between 1900 and {datetime.now().year + 1}")

    def to_dict(self) -> dict:
        """Convert track to dictionary.

        Returns:
            Dictionary representation of track.
        """
        return {
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "duration": self.duration,
            "bpm": self.bpm,
            "key": self.key,
            "year": self.year,
            "genre": self.genre,
            "label": self.label,
            "position": self.position,
            "file_path": self.file_path,
            "track_id": self.track_id,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Track":
        """Create track from dictionary.

        Args:
            data: Dictionary with track data.

        Returns:
            Track instance.
        """
        return cls(
            title=data.get("title", ""),
            artist=data.get("artist", ""),
            album=data.get("album"),
            duration=data.get("duration"),
            bpm=data.get("bpm"),
            key=data.get("key"),
            year=data.get("year"),
            genre=data.get("genre"),
            label=data.get("label"),
            position=data.get("position"),
            file_path=data.get("file_path"),
            track_id=data.get("track_id"),
        )

    def __str__(self) -> str:
        """String representation."""
        return f"{self.artist} - {self.title}"

    def __repr__(self) -> str:
        """Developer representation."""
        return f"Track(title={self.title!r}, artist={self.artist!r}, bpm={self.bpm}, year={self.year})"

