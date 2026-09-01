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
from typing import Callable, Dict, List, Optional

from cuepoint.models.result import TrackResult


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


# Re-exported, not redefined. This module used to declare a second, slightly
# different TrackResult: dicts instead of BeatportCandidate objects in
# ``candidates``, a ``queries`` field instead of ``queries_data``, and no
# validation. Engine code imported this one while the matching pipeline produced
# the other, so the same name meant two shapes depending on the import — which
# is how BeatportCandidate objects reached the JSON results payload and broke it.
# ``models.result.TrackResult`` is the single definition; ``queries`` remains
# available there as a read-only alias for ``queries_data``.
__all__ = [
    "ErrorType",
    "ProcessingController",
    "ProcessingError",
    "ProgressCallback",
    "ProgressInfo",
    "ReliabilityState",
    "TrackResult",
]


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
