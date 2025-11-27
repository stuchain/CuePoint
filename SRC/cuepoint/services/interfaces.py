#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Service Interfaces

Abstract base classes defining the contracts for all services.
These interfaces enable dependency injection and testability.
"""

from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional, Tuple

from cuepoint.data.rekordbox import RBTrack
from cuepoint.ui.gui_interface import ProcessingController, ProgressCallback, TrackResult


class ILoggingService(ABC):
    """Interface for logging service."""

    @abstractmethod
    def debug(self, message: str, **kwargs: Any) -> None:
        """Log debug message."""
        pass

    @abstractmethod
    def info(self, message: str, **kwargs: Any) -> None:
        """Log info message."""
        pass

    @abstractmethod
    def warning(self, message: str, **kwargs: Any) -> None:
        """Log warning message."""
        pass

    @abstractmethod
    def error(self, message: str, exc_info=None, **kwargs: Any) -> None:
        """Log error message."""
        pass

    @abstractmethod
    def critical(self, message: str, **kwargs: Any) -> None:
        """Log critical message."""
        pass


class ICacheService(ABC):
    """Interface for caching service."""

    @abstractmethod
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        pass

    @abstractmethod
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional TTL."""
        pass

    @abstractmethod
    def clear(self) -> None:
        """Clear all cache entries."""
        pass


class IConfigService(ABC):
    """Interface for configuration management service."""

    @abstractmethod
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value."""
        pass

    @abstractmethod
    def set(self, key: str, value: Any) -> None:
        """Set configuration value."""
        pass

    @abstractmethod
    def save(self) -> None:
        """Save configuration to persistent storage."""
        pass

    @abstractmethod
    def load(self) -> None:
        """Load configuration from persistent storage."""
        pass


class IExportService(ABC):
    """Interface for export operations."""

    @abstractmethod
    def export_to_csv(
        self, results: List[TrackResult], filepath: str, delimiter: str = ","
    ) -> None:
        """Export results to CSV file."""
        pass

    @abstractmethod
    def export_to_json(self, results: List[TrackResult], filepath: str) -> None:
        """Export results to JSON file."""
        pass

    @abstractmethod
    def export_to_excel(self, results: List[TrackResult], filepath: str) -> None:
        """Export results to Excel file."""
        pass


class IMatcherService(ABC):
    """Interface for track matching service."""

    @abstractmethod
    def find_best_match(
        self,
        idx: int,
        track_title: str,
        track_artists_for_scoring: str,
        title_only_mode: bool,
        queries: List[str],
        input_year: Optional[int] = None,
        input_key: Optional[str] = None,
        input_mix: Optional[Dict[str, object]] = None,
        input_generic_phrases: Optional[List[str]] = None,
    ) -> Tuple[Any, List[Any], List[Any], int]:
        """Find best Beatport match for a track.
        
        Executes search queries, fetches candidate data, scores candidates,
        and returns the best match along with all candidates and query audit trail.
        
        Args:
            idx: Track index (1-based) for logging.
            track_title: Track title to match.
            track_artists_for_scoring: Artist string for scoring (may differ from title).
            title_only_mode: If True, only match on title (ignore artist).
            queries: List of search queries to execute.
            input_year: Optional input year for bonus scoring.
            input_key: Optional input key for bonus scoring.
            input_mix: Optional mix flags dictionary.
            input_generic_phrases: Optional list of generic phrases from title.
        
        Returns:
            Tuple containing:
            - best_candidate: Best matching BeatportCandidate or None if no match
            - all_candidates: List of all evaluated BeatportCandidate objects
            - queries_audit: List of query execution audit tuples (query_index, query_text, candidate_count, elapsed_ms)
            - last_query_index: Index of last query executed (0-based)
        """
        pass


class IBeatportService(ABC):
    """Interface for Beatport API access."""

    @abstractmethod
    def search_tracks(self, query: str, max_results: int = 50) -> List[str]:
        """Search for tracks on Beatport and return URLs."""
        pass

    @abstractmethod
    def fetch_track_data(self, url: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed track data from Beatport URL."""
        pass


class IProcessorService(ABC):
    """Interface for track processing service."""

    @abstractmethod
    def process_track(
        self, idx: int, track: RBTrack, settings: Optional[Dict[str, Any]] = None
    ) -> TrackResult:
        """Process a single track and return result."""
        pass

    @abstractmethod
    def process_playlist(
        self, tracks: List[RBTrack], settings: Optional[Dict[str, Any]] = None
    ) -> List[TrackResult]:
        """Process a playlist of tracks."""
        pass

    @abstractmethod
    def process_playlist_from_xml(
        self,
        xml_path: str,
        playlist_name: str,
        settings: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[ProgressCallback] = None,
        controller: Optional[ProcessingController] = None,
        auto_research: bool = False,
    ) -> List[TrackResult]:
        """Process playlist from XML file with GUI-friendly interface.

        This method processes all tracks in a playlist from a Rekordbox XML file
        and returns structured results. It supports progress callbacks, cancellation,
        and auto-research of unmatched tracks.

        Args:
            xml_path: Path to Rekordbox XML export file.
            playlist_name: Name of playlist to process (must exist in XML).
            settings: Optional settings override dictionary.
            progress_callback: Optional callback for progress updates.
            controller: Optional controller for cancellation support.
            auto_research: If True, automatically re-search unmatched tracks with
                enhanced settings.

        Returns:
            List of TrackResult objects (one per track).

        Raises:
            ProcessingError: If XML file not found, playlist not found, or parsing
                errors occur.
        """
        pass
