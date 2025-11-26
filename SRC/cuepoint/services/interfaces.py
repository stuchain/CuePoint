#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Service Interfaces - Abstract base classes for dependency injection

This module defines all service interfaces using abstract base classes.
These interfaces enable dependency injection and make services easily testable
by allowing mock implementations.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from cuepoint.data.rekordbox import RBTrack
from cuepoint.ui.gui_interface import TrackResult


class IProcessorService(ABC):
    """Interface for track processing service.
    
    Defines the contract for services that process tracks and playlists,
    finding matches on Beatport and returning results.
    """
    
    @abstractmethod
    def process_track(
        self,
        idx: int,
        track: RBTrack,
        settings: Optional[Dict[str, Any]] = None
    ) -> TrackResult:
        """Process a single track and return match result.
        
        Args:
            idx: Track index (1-based).
            track: RBTrack object to process.
            settings: Optional settings override.
        
        Returns:
            TrackResult with match information.
        """
        pass
    
    @abstractmethod
    def process_playlist(
        self,
        tracks: List[RBTrack],
        settings: Optional[Dict[str, Any]] = None
    ) -> List[TrackResult]:
        """Process a playlist of tracks.
        
        Args:
            tracks: List of RBTrack objects.
            settings: Optional settings override.
        
        Returns:
            List of TrackResult objects.
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
        """Fetch track data from Beatport URL."""
        pass


class ICacheService(ABC):
    """Interface for caching service."""
    
    @abstractmethod
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        pass
    
    @abstractmethod
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache."""
        pass
    
    @abstractmethod
    def clear(self) -> None:
        """Clear all cache entries."""
        pass


class IExportService(ABC):
    """Interface for export operations."""
    
    @abstractmethod
    def export_to_csv(
        self,
        results: List[TrackResult],
        filepath: str,
        delimiter: str = ","
    ) -> None:
        """Export results to CSV file."""
        pass
    
    @abstractmethod
    def export_to_json(
        self,
        results: List[TrackResult],
        filepath: str
    ) -> None:
        """Export results to JSON file."""
        pass
    
    @abstractmethod
    def export_to_excel(
        self,
        results: List[TrackResult],
        filepath: str
    ) -> None:
        """Export results to Excel file."""
        pass


class IConfigService(ABC):
    """Interface for configuration management."""
    
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


class ILoggingService(ABC):
    """Interface for logging service."""
    
    @abstractmethod
    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        pass
    
    @abstractmethod
    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        pass
    
    @abstractmethod
    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        pass
    
    @abstractmethod
    def error(self, message: str, **kwargs) -> None:
        """Log error message."""
        pass
    
    @abstractmethod
    def critical(self, message: str, **kwargs) -> None:
        """Log critical message."""
        pass


class IMatcherService(ABC):
    """Interface for track matching service.
    
    Defines the contract for services that find best Beatport matches
    for tracks using search queries and scoring algorithms.
    """
    
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
    ) -> tuple:
        """Find best Beatport match for a track.
        
        Args:
            idx: Track index for logging.
            track_title: Clean track title.
            track_artists_for_scoring: Artist string for scoring.
            title_only_mode: True if no artists available.
            queries: List of search queries to execute.
            input_year: Optional year from Rekordbox.
            input_key: Optional key from Rekordbox.
            input_mix: Mix type flags.
            input_generic_phrases: Special parenthetical phrases.
        
        Returns:
            Tuple of (best_candidate, all_candidates, queries_audit, last_query_index).
        """
        pass
