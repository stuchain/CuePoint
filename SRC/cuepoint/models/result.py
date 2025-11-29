#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Track result data model.

Represents the result of processing a track.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.track import Track


@dataclass
class TrackResult:
    """Represents the result of processing a track.

    This model provides a structured representation of processing results,
    including the original track, best match, all candidates, and metadata.

    Attributes:
        playlist_index: Index of track in playlist.
        title: Original track title.
        artist: Original track artist.
        matched: Whether a match was found.
        best_match: The best matching Beatport candidate (optional).
        candidates: List of all candidate matches.
        beatport_url: URL of best match (optional).
        beatport_title: Title of best match (optional).
        beatport_artists: Artists of best match (optional).
        beatport_key: Key of best match (optional).
        beatport_key_camelot: Camelot key of best match (optional).
        beatport_year: Year of best match (optional).
        beatport_bpm: BPM of best match (optional).
        beatport_label: Label of best match (optional).
        beatport_genres: Genres of best match (optional).
        beatport_release: Release name of best match (optional).
        beatport_release_date: Release date of best match (optional).
        beatport_track_id: Track ID of best match (optional).
        match_score: Match score (optional).
        title_sim: Title similarity score (optional).
        artist_sim: Artist similarity score (optional).
        confidence: Confidence level: "high", "medium", "low" (optional).
        search_query_index: Index of query that found match (optional).
        search_stop_query_index: Index of query where search stopped (optional).
        candidate_index: Index of candidate in results (optional).
        processing_time: Time taken to process in seconds (optional).
        error: Error message if processing failed (optional).
        candidates_data: List of candidate dictionaries for export (optional).
        queries_data: List of query dictionaries for export (optional).
    """

    playlist_index: int
    title: str
    artist: str
    matched: bool
    best_match: Optional[BeatportCandidate] = None
    candidates: List[BeatportCandidate] = field(default_factory=list)
    beatport_url: Optional[str] = None
    beatport_title: Optional[str] = None
    beatport_artists: Optional[str] = None
    beatport_key: Optional[str] = None
    beatport_key_camelot: Optional[str] = None
    beatport_year: Optional[str] = None
    beatport_bpm: Optional[str] = None
    beatport_label: Optional[str] = None
    beatport_genres: Optional[str] = None
    beatport_release: Optional[str] = None
    beatport_release_date: Optional[str] = None
    beatport_track_id: Optional[str] = None
    match_score: Optional[float] = None
    title_sim: Optional[float] = None
    artist_sim: Optional[float] = None
    confidence: Optional[str] = None  # "high", "medium", "low"
    search_query_index: Optional[str] = None
    search_stop_query_index: Optional[str] = None
    candidate_index: Optional[str] = None
    processing_time: Optional[float] = None
    error: Optional[str] = None
    candidates_data: List[Dict[str, Any]] = field(default_factory=list)
    queries_data: List[Dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Validate result data."""
        if not self.title or not self.title.strip():
            raise ValueError("Track title cannot be empty")
        if not self.artist or not self.artist.strip():
            raise ValueError("Track artist cannot be empty")
        # Clamp negative scores to 0 instead of raising error
        if self.match_score is not None and self.match_score < 0:
            self.match_score = 0.0
        if self.title_sim is not None and not 0.0 <= self.title_sim <= 100.0:
            raise ValueError("Title similarity must be between 0.0 and 100.0")
        if self.artist_sim is not None and not 0.0 <= self.artist_sim <= 100.0:
            raise ValueError("Artist similarity must be between 0.0 and 100.0")
        if self.confidence is not None and self.confidence not in ("high", "medium", "low"):
            raise ValueError('Confidence must be "high", "medium", or "low"')

        # If best_match is provided, ensure it's in candidates
        if self.best_match and self.best_match not in self.candidates:
            self.candidates.insert(0, self.best_match)

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary for CSV export.

        Returns:
            Dictionary representation matching old format for backward compatibility.
        """
        return {
            "playlist_index": str(self.playlist_index),
            "original_title": self.title,
            "original_artists": self.artist,
            "beatport_title": self.beatport_title or "",
            "beatport_artists": self.beatport_artists or "",
            "beatport_key": self.beatport_key or "",
            "beatport_key_camelot": self.beatport_key_camelot or "",
            "beatport_year": self.beatport_year or "",
            "beatport_bpm": self.beatport_bpm or "",
            "beatport_label": self.beatport_label or "",
            "beatport_genres": self.beatport_genres or "",
            "beatport_release": self.beatport_release or "",
            "beatport_release_date": self.beatport_release_date or "",
            "beatport_track_id": self.beatport_track_id or "",
            "beatport_url": self.beatport_url or "",
            "title_sim": str(self.title_sim) if self.title_sim is not None else "0",
            "artist_sim": str(self.artist_sim) if self.artist_sim is not None else "0",
            "match_score": f"{self.match_score:.1f}" if self.match_score is not None else "0.0",
            "confidence": self.confidence or "low",
            "search_query_index": self.search_query_index or "0",
            "search_stop_query_index": self.search_stop_query_index or "0",
            "candidate_index": self.candidate_index or "0",
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TrackResult":
        """Create result from dictionary.

        Args:
            data: Dictionary with result data.

        Returns:
            TrackResult instance.
        """
        # Parse match_score
        match_score = None
        if "match_score" in data:
            match_score_str = str(data["match_score"])
            try:
                match_score = float(match_score_str)
            except (ValueError, TypeError):
                pass

        # Parse title_sim and artist_sim
        title_sim = None
        if "title_sim" in data:
            try:
                title_sim = float(data["title_sim"])
            except (ValueError, TypeError):
                pass

        artist_sim = None
        if "artist_sim" in data:
            try:
                artist_sim = float(data["artist_sim"])
            except (ValueError, TypeError):
                pass

        return cls(
            playlist_index=int(data.get("playlist_index", 0)),
            title=data.get("original_title", data.get("title", "")),
            artist=data.get("original_artists", data.get("artist", "")),
            matched=bool(data.get("matched", False)),
            beatport_url=data.get("beatport_url"),
            beatport_title=data.get("beatport_title"),
            beatport_artists=data.get("beatport_artists"),
            beatport_key=data.get("beatport_key"),
            beatport_key_camelot=data.get("beatport_key_camelot"),
            beatport_year=data.get("beatport_year"),
            beatport_bpm=data.get("beatport_bpm"),
            beatport_label=data.get("beatport_label"),
            beatport_genres=data.get("beatport_genres"),
            beatport_release=data.get("beatport_release"),
            beatport_release_date=data.get("beatport_release_date"),
            beatport_track_id=data.get("beatport_track_id"),
            match_score=match_score,
            title_sim=title_sim,
            artist_sim=artist_sim,
            confidence=data.get("confidence"),
            search_query_index=data.get("search_query_index"),
            search_stop_query_index=data.get("search_stop_query_index"),
            candidate_index=data.get("candidate_index"),
            processing_time=data.get("processing_time"),
            error=data.get("error"),
            candidates_data=data.get("candidates", []),
            queries_data=data.get("queries", []),
        )

    def is_successful(self) -> bool:
        """Check if processing was successful.

        Returns:
            True if no error and match was found.
        """
        return self.error is None and self.matched

    def has_high_confidence(self, threshold: float = 0.7) -> bool:
        """Check if result has high confidence based on match score.

        Args:
            threshold: Confidence threshold (default 0.7).

        Returns:
            True if match_score >= threshold.
        """
        if self.match_score is None:
            return False
        return self.match_score >= threshold

    def __str__(self) -> str:
        """String representation."""
        if self.matched:
            return f"{self.artist} - {self.title} → {self.beatport_artists} - {self.beatport_title}"
        return f"{self.artist} - {self.title} (No match)"

    def __repr__(self) -> str:
        """Developer representation."""
        return (
            f"TrackResult(playlist_index={self.playlist_index}, "
            f"title={self.title!r}, matched={self.matched}, "
            f"match_score={self.match_score})"
        )

