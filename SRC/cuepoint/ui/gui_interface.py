#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Interface Module - Data structures and interfaces for GUI integration

This module defines all data structures and interfaces needed for GUI integration:
- ProgressInfo: Progress updates for GUI
- TrackResult: Result for a single track
- ProcessingController: Cancellation support
- ProcessingError: Structured error handling
- ErrorType: Error type enumeration
"""

import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

# ============================================================================
# Reliability State Machine (Design 5.24, 5.25)
# ============================================================================


class ReliabilityState:
    """Processing reliability states for UX (Design 5.24, 5.25)."""

    IDLE = "idle"
    PREFLIGHT = "preflight"
    RUNNING = "running"
    RETRYING = "retrying"
    PAUSED = "paused"
    RESUMING = "resuming"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# Progress Reporting
# ============================================================================


@dataclass
class ProgressInfo:
    """
    Progress information for GUI updates.

    This is passed to progress callbacks to update GUI progress bars and status.
    Design 5.12, 5.40: status_message can show "Retrying...", "Paused", etc.
    """

    completed_tracks: int
    total_tracks: int
    matched_count: int
    unmatched_count: int
    current_track: Dict[str, str] = field(default_factory=dict)  # {'title': str, 'artists': str}
    elapsed_time: float = 0.0
    eta_seconds: Optional[float] = None  # Design 6.36: ETA based on avg time per track
    status_message: Optional[str] = None  # e.g. "Retrying...", "Saving progress..."
    reliability_state: Optional[str] = None  # Design 5.24: idle, running, retrying, paused, etc.

    def __post_init__(self):
        """Calculate percentage if not provided"""
        if self.total_tracks > 0:
            self.percentage = (self.completed_tracks / self.total_tracks) * 100.0
        else:
            self.percentage = 0.0


# Type alias for progress callback function
ProgressCallback = Callable[[ProgressInfo], None]


# ============================================================================
# Track Results
# ============================================================================


@dataclass
class TrackResult:
    """
    Result for a single track processing operation.

    This replaces the old tuple return (main_row, cand_rows, queries_rows)
    with a structured object that's easier to work with.
    """

    playlist_index: int
    title: str
    artist: str
    matched: bool

    # Match information (only if matched=True)
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

    # Scoring information
    match_score: Optional[float] = None
    title_sim: Optional[float] = None
    artist_sim: Optional[float] = None
    confidence: Optional[str] = None  # "high", "medium", "low"

    # Search metadata
    search_query_index: Optional[str] = None
    search_stop_query_index: Optional[str] = None
    candidate_index: Optional[str] = None

    # Detailed data (for CSV export)
    candidates: List[Dict[str, Any]] = field(default_factory=list)
    queries: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, str]:
        """
        Convert to dictionary format for CSV export.

        This matches the old format from process_track() for backward compatibility.
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


# ============================================================================
# Cancellation Support
# ============================================================================


class ProcessingController:
    """
    Thread-safe controller for processing operations with cancellation and pause support.

    Design 5.12, 5.25: Supports cancel, pause, and resume for reliability UX.
    """

    def __init__(self):
        """Initialize controller with cancellation and pause state."""
        self._cancelled = False
        self._paused = False
        self._lock = threading.Lock()
        self._pause_event = threading.Event()
        self._pause_event.set()  # Not paused initially

    def cancel(self):
        """Request cancellation of processing operation."""
        with self._lock:
            self._cancelled = True

    def is_cancelled(self) -> bool:
        """Check if cancellation was requested (thread-safe)."""
        with self._lock:
            return self._cancelled

    def request_pause(self):
        """Request pause (Design 5.12, 5.25). Processor will block until resume()."""
        with self._lock:
            self._paused = True
            self._pause_event.clear()

    def resume(self):
        """Resume from pause (Design 5.12, 5.25)."""
        with self._lock:
            self._paused = False
            self._pause_event.set()

    def is_paused(self) -> bool:
        """Check if pause was requested (thread-safe)."""
        with self._lock:
            return self._paused

    def wait_if_paused(self) -> None:
        """Block until not paused (or cancelled). Call from processor loop."""
        while True:
            with self._lock:
                if not self._paused or self._cancelled:
                    return
            self._pause_event.wait(timeout=0.5)

    def reset(self):
        """Reset cancellation and pause state (for new operation)."""
        with self._lock:
            self._cancelled = False
            self._paused = False
            self._pause_event.set()


# ============================================================================
# Error Handling
# ============================================================================


class ErrorType(Enum):
    """Types of errors that can occur during processing"""

    FILE_NOT_FOUND = "file_not_found"
    PLAYLIST_NOT_FOUND = "playlist_not_found"
    XML_PARSE_ERROR = "xml_parse_error"
    NETWORK_ERROR = "network_error"
    PROCESSING_ERROR = "processing_error"
    VALIDATION_ERROR = "validation_error"
    CIRCUIT_OPEN = "circuit_open"  # Design 5.38: circuit breaker tripped


@dataclass
class ProcessingError(Exception):
    """
    Structured error for GUI display.

    This replaces print_error() calls with structured errors that GUI can display
    in user-friendly dialogs.
    """

    error_type: ErrorType
    message: str
    details: Optional[str] = None
    suggestions: List[str] = field(default_factory=list)
    recoverable: bool = False

    def __str__(self) -> str:
        """String representation of error"""
        return self.message
