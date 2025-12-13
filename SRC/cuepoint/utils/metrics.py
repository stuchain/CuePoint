#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Metrics Collection Utility

Provides optional metrics collection for tracking application success criteria.
Implements privacy-first approach: all metrics are local-only by default.
Structured for future telemetry (opt-in only).

This utility tracks:
- Installation success rate
- Processing success rate
- Error recovery rate
- Update adoption rate
- Performance metrics
"""

import json
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

from cuepoint.services.interfaces import ILoggingService


@dataclass
class InstallationMetrics:
    """Metrics for installation operations."""

    total_attempts: int = 0
    successful_installs: int = 0
    failed_installs: int = 0
    success_rate: float = 0.0

    def calculate_success_rate(self) -> float:
        """Calculate installation success rate."""
        if self.total_attempts == 0:
            return 0.0
        return (self.successful_installs / self.total_attempts) * 100.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_attempts": self.total_attempts,
            "successful_installs": self.successful_installs,
            "failed_installs": self.failed_installs,
            "success_rate": self.calculate_success_rate(),
        }


@dataclass
class ProcessingMetrics:
    """Metrics for track processing operations."""

    total_tracks_processed: int = 0
    successful_matches: int = 0
    failed_matches: int = 0
    total_processing_time: float = 0.0
    average_processing_time: float = 0.0
    success_rate: float = 0.0
    processing_times: List[float] = field(default_factory=list)

    def add_processing_time(self, duration: float) -> None:
        """Add a processing time measurement."""
        self.processing_times.append(duration)
        self.total_processing_time += duration
        if len(self.processing_times) > 0:
            self.average_processing_time = self.total_processing_time / len(
                self.processing_times
            )

    def calculate_success_rate(self) -> float:
        """Calculate processing success rate."""
        total = self.total_tracks_processed
        if total == 0:
            return 0.0
        return (self.successful_matches / total) * 100.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_tracks_processed": self.total_tracks_processed,
            "successful_matches": self.successful_matches,
            "failed_matches": self.failed_matches,
            "total_processing_time": self.total_processing_time,
            "average_processing_time": self.average_processing_time,
            "success_rate": self.calculate_success_rate(),
            "processing_times_count": len(self.processing_times),
        }


@dataclass
class ErrorMetrics:
    """Metrics for error handling and recovery."""

    total_errors: int = 0
    recovered_errors: int = 0
    unrecovered_errors: int = 0
    error_types: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    recovery_rate: float = 0.0

    def calculate_recovery_rate(self) -> float:
        """Calculate error recovery rate."""
        if self.total_errors == 0:
            return 0.0
        return (self.recovered_errors / self.total_errors) * 100.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_errors": self.total_errors,
            "recovered_errors": self.recovered_errors,
            "unrecovered_errors": self.unrecovered_errors,
            "error_types": dict(self.error_types),
            "recovery_rate": self.calculate_recovery_rate(),
        }


@dataclass
class UpdateMetrics:
    """Metrics for update operations."""

    total_update_checks: int = 0
    updates_available: int = 0
    updates_installed: int = 0
    updates_skipped: int = 0
    adoption_rate: float = 0.0

    def calculate_adoption_rate(self) -> float:
        """Calculate update adoption rate."""
        total_available = self.updates_available
        if total_available == 0:
            return 0.0
        return (self.updates_installed / total_available) * 100.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_update_checks": self.total_update_checks,
            "updates_available": self.updates_available,
            "updates_installed": self.updates_installed,
            "updates_skipped": self.updates_skipped,
            "adoption_rate": self.calculate_adoption_rate(),
        }


@dataclass
class ApplicationMetrics:
    """Complete application metrics collection."""

    installation: InstallationMetrics = field(default_factory=InstallationMetrics)
    processing: ProcessingMetrics = field(default_factory=ProcessingMetrics)
    errors: ErrorMetrics = field(default_factory=ErrorMetrics)
    updates: UpdateMetrics = field(default_factory=UpdateMetrics)
    session_count: int = 0
    first_launch_date: Optional[str] = None
    last_launch_date: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "installation": self.installation.to_dict(),
            "processing": self.processing.to_dict(),
            "errors": self.errors.to_dict(),
            "updates": self.updates.to_dict(),
            "session_count": self.session_count,
            "first_launch_date": self.first_launch_date,
            "last_launch_date": self.last_launch_date,
        }


class MetricsCollector:
    """Thread-safe metrics collector.

    Collects application metrics for tracking success criteria.
    All metrics are stored locally. No telemetry is sent unless explicitly enabled.

    Attributes:
        metrics: ApplicationMetrics object storing all metrics.
        metrics_file: Path to metrics storage file.
        logging_service: Optional logging service for metrics logging.
        enabled: Whether metrics collection is enabled.
        lock: Thread lock for thread-safe operations.
    """

    def __init__(
        self,
        metrics_file: Optional[Path] = None,
        logging_service: Optional[ILoggingService] = None,
        enabled: bool = True,
    ):
        """Initialize metrics collector.

        Args:
            metrics_file: Path to metrics storage file. If None, uses default location.
            logging_service: Optional logging service for metrics logging.
            enabled: Whether metrics collection is enabled (default: True).
        """
        self.metrics = ApplicationMetrics()
        self.metrics_file = metrics_file
        self.logging_service = logging_service
        self.enabled = enabled
        self.lock = Lock()

        # Load existing metrics if file exists
        if self.metrics_file and self.metrics_file.exists():
            try:
                self._load_metrics()
            except Exception as e:
                if self.logging_service:
                    self.logging_service.warning(
                        f"Failed to load metrics from {self.metrics_file}: {e}"
                    )

    def _load_metrics(self) -> None:
        """Load metrics from file."""
        if not self.metrics_file or not self.metrics_file.exists():
            return

        with open(self.metrics_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Restore metrics from JSON
        if "installation" in data:
            self.metrics.installation = InstallationMetrics(**data["installation"])
        if "processing" in data:
            proc_data = data["processing"].copy()
            # Don't restore processing_times list (too large)
            proc_data.pop("processing_times", None)
            proc_data.pop("processing_times_count", None)
            self.metrics.processing = ProcessingMetrics(**proc_data)
        if "errors" in data:
            self.metrics.errors = ErrorMetrics(**data["errors"])
        if "updates" in data:
            self.metrics.updates = UpdateMetrics(**data["updates"])

        self.metrics.session_count = data.get("session_count", 0)
        self.metrics.first_launch_date = data.get("first_launch_date")
        self.metrics.last_launch_date = data.get("last_launch_date")

    def _save_metrics(self) -> None:
        """Save metrics to file."""
        if not self.enabled or not self.metrics_file:
            return

        try:
            # Ensure directory exists
            self.metrics_file.parent.mkdir(parents=True, exist_ok=True)

            # Save metrics as JSON
            with open(self.metrics_file, "w", encoding="utf-8") as f:
                json.dump(self.metrics.to_dict(), f, indent=2)

        except Exception as e:
            if self.logging_service:
                self.logging_service.warning(
                    f"Failed to save metrics to {self.metrics_file}: {e}"
                )

    def record_installation_attempt(self, success: bool) -> None:
        """Record an installation attempt.

        Args:
            success: Whether installation was successful.
        """
        if not self.enabled:
            return

        with self.lock:
            self.metrics.installation.total_attempts += 1
            if success:
                self.metrics.installation.successful_installs += 1
            else:
                self.metrics.installation.failed_installs += 1

            self._save_metrics()

            if self.logging_service:
                self.logging_service.info(
                    f"Installation metrics: {self.metrics.installation.to_dict()}"
                )

    def record_processing(
        self, tracks_processed: int, matches_found: int, processing_time: float
    ) -> None:
        """Record track processing metrics.

        Args:
            tracks_processed: Number of tracks processed.
            matches_found: Number of successful matches.
            processing_time: Total processing time in seconds.
        """
        if not self.enabled:
            return

        with self.lock:
            self.metrics.processing.total_tracks_processed += tracks_processed
            self.metrics.processing.successful_matches += matches_found
            self.metrics.processing.failed_matches += (
                tracks_processed - matches_found
            )
            self.metrics.processing.add_processing_time(processing_time)

            self._save_metrics()

            if self.logging_service:
                self.logging_service.debug(
                    f"Processing metrics: {self.metrics.processing.to_dict()}"
                )

    def record_error(
        self, error_type: str, recovered: bool = False
    ) -> None:
        """Record an error occurrence.

        Args:
            error_type: Type/category of error.
            recovered: Whether the error was recovered from.
        """
        if not self.enabled:
            return

        with self.lock:
            self.metrics.errors.total_errors += 1
            self.metrics.errors.error_types[error_type] += 1

            if recovered:
                self.metrics.errors.recovered_errors += 1
            else:
                self.metrics.errors.unrecovered_errors += 1

            self._save_metrics()

            if self.logging_service:
                self.logging_service.debug(
                    f"Error metrics: {self.metrics.errors.to_dict()}"
                )

    def record_update_check(self, update_available: bool) -> None:
        """Record an update check.

        Args:
            update_available: Whether an update was available.
        """
        if not self.enabled:
            return

        with self.lock:
            self.metrics.updates.total_update_checks += 1
            if update_available:
                self.metrics.updates.updates_available += 1

            self._save_metrics()

    def record_update_action(self, installed: bool) -> None:
        """Record an update action (install or skip).

        Args:
            installed: Whether update was installed (True) or skipped (False).
        """
        if not self.enabled:
            return

        with self.lock:
            if installed:
                self.metrics.updates.updates_installed += 1
            else:
                self.metrics.updates.updates_skipped += 1

            self._save_metrics()

            if self.logging_service:
                self.logging_service.info(
                    f"Update metrics: {self.metrics.updates.to_dict()}"
                )

    def record_session_start(self) -> None:
        """Record application session start."""
        if not self.enabled:
            return

        with self.lock:
            self.metrics.session_count += 1
            current_date = datetime.now().isoformat()

            if not self.metrics.first_launch_date:
                self.metrics.first_launch_date = current_date

            self.metrics.last_launch_date = current_date

            self._save_metrics()

    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get summary of all metrics.

        Returns:
            Dictionary containing all metrics summaries.
        """
        with self.lock:
            return self.metrics.to_dict()

    def get_success_criteria_status(self) -> Dict[str, Any]:
        """Get status of success criteria from product statement.

        Returns:
            Dictionary with success criteria status:
            - installation_success_rate: Should be > 95%
            - processing_success_rate: Should be > 98%
            - error_recovery_rate: Should be > 90%
            - update_adoption_rate: Should be > 80%
        """
        with self.lock:
            return {
                "installation_success_rate": self.metrics.installation.calculate_success_rate(),
                "target": 95.0,
                "meets_target": self.metrics.installation.calculate_success_rate() >= 95.0,
                "processing_success_rate": self.metrics.processing.calculate_success_rate(),
                "target": 98.0,
                "meets_target": self.metrics.processing.calculate_success_rate() >= 98.0,
                "error_recovery_rate": self.metrics.errors.calculate_recovery_rate(),
                "target": 90.0,
                "meets_target": self.metrics.errors.calculate_recovery_rate() >= 90.0,
                "update_adoption_rate": self.metrics.updates.calculate_adoption_rate(),
                "target": 80.0,
                "meets_target": self.metrics.updates.calculate_adoption_rate() >= 80.0,
            }

    def clear_metrics(self) -> None:
        """Clear all metrics (for testing or privacy)."""
        with self.lock:
            self.metrics = ApplicationMetrics()
            if self.metrics_file and self.metrics_file.exists():
                try:
                    self.metrics_file.unlink()
                except Exception as e:
                    if self.logging_service:
                        self.logging_service.warning(
                            f"Failed to delete metrics file: {e}"
                        )

    def export_metrics(self, filepath: Path) -> None:
        """Export metrics to a JSON file.

        Args:
            filepath: Path to export file.
        """
        with self.lock:
            try:
                filepath.parent.mkdir(parents=True, exist_ok=True)
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(self.metrics.to_dict(), f, indent=2)

                if self.logging_service:
                    self.logging_service.info(f"Metrics exported to {filepath}")

            except Exception as e:
                if self.logging_service:
                    self.logging_service.error(
                        f"Failed to export metrics: {e}", exc_info=e
                    )
                raise
