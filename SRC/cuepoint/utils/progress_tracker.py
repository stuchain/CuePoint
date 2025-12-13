#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Progress Tracker Utility

Provides progress tracking and estimation for long-running operations.
Implements the "Transparency Principle" from the UX philosophy.
"""

import time
from typing import Callable, Dict, Optional


class ProgressTracker:
    """Progress indication for processing operations.

    Tracks progress, elapsed time, and estimates remaining time.
    Provides formatted progress messages for UI display.

    Attributes:
        total: Total number of items to process.
        current: Current number of items processed.
        start_time: Timestamp when tracking started.
        callback: Optional callback function for progress updates.
        track_times: List of processing times per track (for ETA calculation).
    """

    def __init__(self, total: int, callback: Optional[Callable[[Dict], None]] = None):
        """Initialize progress tracker.

        Args:
            total: Total number of items to process.
            callback: Optional callback function that receives progress info dict.
        """
        self.total = total
        self.current = 0
        self.start_time = time.perf_counter()
        self.callback = callback
        self.track_times: list[float] = []
        self.last_update_time = 0.0  # Initialize to 0 so first update always passes throttling
        self.current_track_name = ""  # Store current track name for get_progress_message

    def update(
        self, current: int, track_name: str = "", force_update: bool = False
    ) -> Dict[str, any]:
        """Update progress and return progress information.

        Args:
            current: Current number of items processed.
            track_name: Optional name of current item being processed.
            force_update: If True, update even if less than 250ms since last update.

        Returns:
            Dictionary containing progress information:
            - current: Current count
            - total: Total count
            - percentage: Completion percentage (0-100)
            - elapsed: Elapsed time in seconds
            - remaining: Estimated remaining time in seconds (or None)
            - track_name: Current track name
            - rate: Processing rate (items per second)
        """
        self.current = current
        self.current_track_name = track_name  # Store track name
        elapsed = time.perf_counter() - self.start_time

        # Throttle updates to max once per 250ms (unless forced)
        if not force_update:
            time_since_last_update = time.perf_counter() - self.last_update_time
            if time_since_last_update < 0.25:
                # Return cached info without calling callback
                return self._get_progress_info(elapsed, track_name)

        self.last_update_time = time.perf_counter()

        # Calculate remaining time
        estimated_remaining = None
        if current > 0:
            avg_time_per_item = elapsed / current
            remaining_items = self.total - current
            estimated_remaining = avg_time_per_item * remaining_items

        # Calculate percentage
        percentage = (current / self.total * 100) if self.total > 0 else 0

        # Calculate rate
        rate = current / elapsed if elapsed > 0 else 0

        # Build progress info
        progress_info = {
            "current": current,
            "total": self.total,
            "percentage": percentage,
            "elapsed": elapsed,
            "remaining": estimated_remaining,
            "track_name": track_name,
            "rate": rate,
        }

        # Call callback if provided
        if self.callback:
            try:
                self.callback(progress_info)
            except Exception:
                # Don't let callback errors break processing
                pass

        return progress_info

    def _get_progress_info(self, elapsed: float, track_name: str) -> Dict[str, any]:
        """Get progress info without triggering callback (for throttled updates).

        Args:
            elapsed: Elapsed time.
            track_name: Current track name.

        Returns:
            Progress info dictionary.
        """
        estimated_remaining = None
        if self.current > 0:
            avg_time_per_item = elapsed / self.current
            remaining_items = self.total - self.current
            estimated_remaining = avg_time_per_item * remaining_items

        percentage = (self.current / self.total * 100) if self.total > 0 else 0
        rate = self.current / elapsed if elapsed > 0 else 0

        return {
            "current": self.current,
            "total": self.total,
            "percentage": percentage,
            "elapsed": elapsed,
            "remaining": estimated_remaining,
            "track_name": track_name,
            "rate": rate,
        }

    def get_progress_message(self) -> str:
        """Get formatted progress message for display.

        Returns:
            Formatted string like "Processing: 5/10 (50.0%) - ETA: 30s"
        """
        info = self.get_current_info()
        message = f"Processing: {info['current']}/{info['total']} ({info['percentage']:.1f}%)"
        if info["remaining"]:
            message += f" - ETA: {info['remaining']:.0f}s"
        if info["track_name"]:
            message += f"\nCurrent: {info['track_name']}"
        return message

    def get_current_info(self) -> Dict[str, any]:
        """Get current progress information.

        Returns:
            Dictionary with current progress info.
        """
        elapsed = time.perf_counter() - self.start_time
        return self._get_progress_info(elapsed, self.current_track_name)

    def increment(self, track_name: str = "") -> Dict[str, any]:
        """Increment progress by 1 and return progress info.

        Args:
            track_name: Optional name of current item.

        Returns:
            Progress info dictionary.
        """
        return self.update(self.current + 1, track_name)

    def finish(self) -> Dict[str, any]:
        """Mark progress as complete and return final info.

        Returns:
            Final progress info dictionary.
        """
        return self.update(self.total, "", force_update=True)
