#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Shared processing types used by CLI, engine, and legacy GUI code.

These were historically housed under ``cuepoint.ui.gui_interface`` even though
they do not depend on Qt. Phase 10 extracts them so non-GUI code no longer
imports from the UI package.
"""

import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class ReliabilityState:
    """Processing reliability states for UX."""

    IDLE = "idle"
    PREFLIGHT = "preflight"
    RUNNING = "running"
    RETRYING = "retrying"
    PAUSED = "paused"
    RESUMING = "resuming"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ProgressInfo:
    completed_tracks: int
    total_tracks: int
    matched_count: int
    unmatched_count: int
    current_track: Dict[str, str] = field(default_factory=dict)
    elapsed_time: float = 0.0
    eta_seconds: Optional[float] = None
    status_message: Optional[str] = None
    reliability_state: Optional[str] = None

    def __post_init__(self):
        if self.total_tracks > 0:
            self.percentage = (self.completed_tracks / self.total_tracks) * 100.0
        else:
            self.percentage = 0.0


ProgressCallback = Callable[[ProgressInfo], None]


@dataclass
class TrackResult:
    playlist_index: int
    title: str
    artist: str
    matched: bool
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
    confidence: Optional[str] = None
    search_query_index: Optional[str] = None
    search_stop_query_index: Optional[str] = None
    candidate_index: Optional[str] = None
    candidates: List[Dict[str, Any]] = field(default_factory=list)
    queries: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, str]:
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


class ProcessingController:
    """Thread-safe controller for processing operations with cancellation and pause support."""

    def __init__(self):
        self._cancelled = False
        self._paused = False
        self._lock = threading.Lock()
        self._pause_event = threading.Event()
        self._pause_event.set()

    def cancel(self):
        with self._lock:
            self._cancelled = True

    def is_cancelled(self) -> bool:
        with self._lock:
            return self._cancelled

    def request_pause(self):
        with self._lock:
            self._paused = True
            self._pause_event.clear()

    def resume(self):
        with self._lock:
            self._paused = False
            self._pause_event.set()

    def is_paused(self) -> bool:
        with self._lock:
            return self._paused

    def wait_if_paused(self) -> None:
        while True:
            with self._lock:
                if not self._paused or self._cancelled:
                    return
            self._pause_event.wait(timeout=0.5)

    def reset(self):
        with self._lock:
            self._cancelled = False
            self._paused = False
            self._pause_event.set()


class ErrorType(Enum):
    FILE_NOT_FOUND = "file_not_found"
    PLAYLIST_NOT_FOUND = "playlist_not_found"
    XML_PARSE_ERROR = "xml_parse_error"
    NETWORK_ERROR = "network_error"
    PROCESSING_ERROR = "processing_error"
    VALIDATION_ERROR = "validation_error"
    CIRCUIT_OPEN = "circuit_open"


@dataclass
class ProcessingError(Exception):
    error_type: ErrorType
    message: str
    details: Optional[str] = None
    suggestions: List[str] = field(default_factory=list)
    recoverable: bool = False

    def __str__(self) -> str:
        return self.message

