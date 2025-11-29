#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Beatport candidate data model.

Represents a candidate match from Beatport with validation and serialization.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class BeatportCandidate:
    """Represents a candidate match from Beatport.

    Attributes:
        url: Beatport track URL.
        title: Track title.
        artists: Track artist(s).
        label: Record label.
        release_date: Release date string.
        bpm: Track BPM (as string or float).
        key: Musical key.
        genre: Genre.
        score: Match score (0.0 to 200.0+).
        title_sim: Title similarity score.
        artist_sim: Artist similarity score.
        query_index: Index of query that found this candidate.
        query_text: Query text that found this candidate.
        candidate_index: Index of candidate in query results.
        base_score: Base similarity score.
        bonus_year: Year match bonus.
        bonus_key: Key match bonus.
        guard_ok: Whether candidate passed guard checks.
        reject_reason: Reason for rejection if guard_ok=False.
        elapsed_ms: Time elapsed to fetch/process in milliseconds.
        is_winner: Whether this is the winning candidate.
        remixers: Remixers (optional).
        subgenre: Subgenre (optional).
        artwork_url: URL to artwork (optional).
        preview_url: URL to preview (optional).
        release_year: Release year as integer (optional).
        release_name: Release name (optional).
        raw_data: Raw data from API (optional, not in repr).
    """

    url: str
    title: str
    artists: str
    label: Optional[str]
    release_date: Optional[str]
    bpm: Optional[str]
    key: Optional[str]
    genre: Optional[str]
    score: float
    title_sim: int
    artist_sim: int
    query_index: int
    query_text: str
    candidate_index: int
    base_score: float
    bonus_year: int
    bonus_key: int
    guard_ok: bool
    reject_reason: str
    elapsed_ms: int
    is_winner: bool
    remixers: Optional[str] = None
    subgenre: Optional[str] = None
    artwork_url: Optional[str] = None
    preview_url: Optional[str] = None
    release_year: Optional[int] = None
    release_name: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = field(default=None, repr=False)

    def __post_init__(self) -> None:
        """Validate candidate data."""
        if not self.url:
            raise ValueError("Beatport candidate URL cannot be empty")
        # Clamp negative scores to 0 instead of raising error
        # This can happen during score calculation in edge cases
        if self.score < 0:
            self.score = 0.0
        if self.title_sim < 0 or self.title_sim > 100:
            raise ValueError("Title similarity must be between 0 and 100")
        if self.artist_sim < 0 or self.artist_sim > 100:
            raise ValueError("Artist similarity must be between 0 and 100")

    def to_dict(self) -> Dict[str, Any]:
        """Convert candidate to dictionary.

        Returns:
            Dictionary representation of candidate.
        """
        return {
            "url": self.url,
            "title": self.title,
            "artists": self.artists,
            "remixers": self.remixers,
            "label": self.label,
            "release_date": self.release_date,
            "release_year": self.release_year,
            "release_name": self.release_name,
            "bpm": self.bpm,
            "key": self.key,
            "genre": self.genre,
            "subgenre": self.subgenre,
            "artwork_url": self.artwork_url,
            "preview_url": self.preview_url,
            "score": self.score,
            "title_sim": self.title_sim,
            "artist_sim": self.artist_sim,
            "query_index": self.query_index,
            "query_text": self.query_text,
            "candidate_index": self.candidate_index,
            "base_score": self.base_score,
            "bonus_year": self.bonus_year,
            "bonus_key": self.bonus_key,
            "guard_ok": self.guard_ok,
            "reject_reason": self.reject_reason,
            "elapsed_ms": self.elapsed_ms,
            "is_winner": self.is_winner,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BeatportCandidate":
        """Create candidate from dictionary.

        Args:
            data: Dictionary with candidate data.

        Returns:
            BeatportCandidate instance.
        """
        return cls(
            url=data.get("url", ""),
            title=data.get("title", ""),
            artists=data.get("artists", ""),
            remixers=data.get("remixers"),
            label=data.get("label"),
            release_date=data.get("release_date"),
            release_year=data.get("release_year"),
            release_name=data.get("release_name"),
            bpm=data.get("bpm"),
            key=data.get("key"),
            genre=data.get("genre"),
            subgenre=data.get("subgenre"),
            artwork_url=data.get("artwork_url"),
            preview_url=data.get("preview_url"),
            score=float(data.get("score", 0.0)),
            title_sim=int(data.get("title_sim", 0)),
            artist_sim=int(data.get("artist_sim", 0)),
            query_index=int(data.get("query_index", 0)),
            query_text=data.get("query_text", ""),
            candidate_index=int(data.get("candidate_index", 0)),
            base_score=float(data.get("base_score", 0.0)),
            bonus_year=int(data.get("bonus_year", 0)),
            bonus_key=int(data.get("bonus_key", 0)),
            guard_ok=bool(data.get("guard_ok", False)),
            reject_reason=data.get("reject_reason", ""),
            elapsed_ms=int(data.get("elapsed_ms", 0)),
            is_winner=bool(data.get("is_winner", False)),
            raw_data=data.get("raw_data"),
        )

    def get_year(self) -> Optional[int]:
        """Extract year from release date.

        Returns:
            Year as integer, or None if cannot be extracted.
        """
        if self.release_year is not None:
            return self.release_year

        if not self.release_date:
            return None

        try:
            if "-" in self.release_date:
                return int(self.release_date.split("-")[0])
            if len(self.release_date) >= 4:
                return int(self.release_date[:4])
        except (ValueError, AttributeError):
            pass

        return None

    def __str__(self) -> str:
        """String representation."""
        return f"{self.artists} - {self.title} (Score: {self.score:.1f})"

    def __repr__(self) -> str:
        """Developer representation."""
        return (
            f"BeatportCandidate(url={self.url!r}, title={self.title!r}, "
            f"score={self.score:.1f}, guard_ok={self.guard_ok})"
        )

