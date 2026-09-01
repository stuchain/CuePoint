#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Service Interfaces

Abstract base classes defining the contracts for all services.
These interfaces enable dependency injection and testability.
"""

import sqlite3
from abc import ABC, abstractmethod
from contextlib import AbstractContextManager
from datetime import date
from pathlib import Path
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Tuple,
)

from cuepoint.models.preflight import PreflightResult
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.compat.gui_types import ProcessingController, ProgressCallback

if TYPE_CHECKING:
    # Imported for typing only: these modules import their interface from this
    # module, so a runtime import here would create a circular import.
    # Annotations referencing them are quoted forward references.
    from cuepoint.incrate.beatport_api_models import DiscoveredTrack
    from cuepoint.migrations import Migration
    from cuepoint.models.library_track import IdentityMatch, LibraryTrack
    from cuepoint.persistence.job_repository import JobRecord
    from cuepoint.services.library_service import LibraryStats
    from cuepoint.services.checkpoint_service import CheckpointData
    from cuepoint.services.onboarding_service import OnboardingState
    from cuepoint.services.privacy_service import PrivacyPreferences
    from cuepoint.services.security_service import SecurityCheckResult


class ILoggingService(ABC):
    """Interface for logging service.

    Supports standard logging format: info("msg %s", arg) for %-style interpolation.
    """

    @abstractmethod
    def debug(self, message: str, *args: Any, **kwargs: Any) -> None:
        """Log debug message.

        Args:
            message: Message (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        pass

    @abstractmethod
    def info(self, message: str, *args: Any, **kwargs: Any) -> None:
        """Log info message.

        Args:
            message: Message (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        pass

    @abstractmethod
    def warning(self, message: str, *args: Any, **kwargs: Any) -> None:
        """Log warning message.

        Args:
            message: Message (may contain %s, %d placeholders).
            *args: Format args for message interpolation.
            **kwargs: extra, exc_info, etc.
        """
        pass

    @abstractmethod
    def error(self, message: str, exc_info=None, *args: Any, **kwargs: Any) -> None:
        """Log error message."""
        pass

    @abstractmethod
    def critical(self, message: str, *args: Any, **kwargs: Any) -> None:
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
        """Get configuration value by key (supports dot notation).

        Args:
            key: Configuration key. Supports dot notation (e.g., "beatport.timeout").
            default: Default value if key not found.

        Returns:
            Configuration value or default.
        """
        pass

    @abstractmethod
    def set(self, key: str, value: Any) -> None:
        """Set configuration value by key (supports dot notation).

        Args:
            key: Configuration key in dot notation (e.g., "beatport.timeout").
            value: Value to set.
        """
        pass

    @abstractmethod
    def save(self) -> None:
        """Save configuration to persistent storage."""
        pass

    @abstractmethod
    def load(self) -> None:
        """Load configuration from persistent storage."""
        pass

    @abstractmethod
    def reset_to_defaults(self) -> None:
        """Reset configuration to defaults."""
        pass

    @abstractmethod
    def validate(self) -> List[str]:
        """Validate configuration.

        Returns:
            List of validation errors (empty if valid).
        """
        pass

    @abstractmethod
    def register_change_callback(
        self, callback: Callable[[str, Any, Any], None]
    ) -> None:
        """Register a callback to be notified when configuration changes.

        Args:
            callback: Function that will be called with (key: str, old_value: Any, new_value: Any)
                     when a configuration value changes.
        """
        pass

    @abstractmethod
    def unregister_change_callback(
        self, callback: Callable[[str, Any, Any], None]
    ) -> None:
        """Unregister a configuration change callback.

        Args:
            callback: Callback function to remove.
        """
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


class ITelemetryService(ABC):
    """Interface for opt-in telemetry (Step 14)."""

    @abstractmethod
    def track(
        self, event_name: str, properties: Optional[Dict[str, Any]] = None
    ) -> None:
        """Track a telemetry event. No-op if disabled."""
        pass

    @abstractmethod
    def flush(self) -> None:
        """Flush queued events."""
        pass

    @abstractmethod
    def delete_local_data(self) -> None:
        """Delete local telemetry data (on opt-out)."""
        pass


class IProcessorService(ABC):
    """Interface for track processing service."""

    @abstractmethod
    def run_preflight(
        self,
        xml_path: str,
        playlist_name: str,
        output_dir: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None,
        force: bool = False,
    ) -> PreflightResult:
        """Run preflight validation for a run request."""
        pass

    @abstractmethod
    def process_track(
        self, idx: int, track: Track, settings: Optional[Dict[str, Any]] = None
    ) -> TrackResult:
        """Process a single track and return result."""
        pass

    @abstractmethod
    def process_playlist(
        self, tracks: List[Track], settings: Optional[Dict[str, Any]] = None
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

    @abstractmethod
    def process_playlist_from_m3u(
        self,
        m3u_path: str,
        settings: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[ProgressCallback] = None,
        controller: Optional[ProcessingController] = None,
    ) -> Tuple[List[TrackResult], Optional[str]]:
        """Process tracks from an M3U/M3U8 playlist file.

        Returns:
            Tuple of (list of TrackResult, optional warning message e.g. 'X of Y files found').
        """
        ...


class IDatabaseService(ABC):
    """Interface for the CuePoint library database.

    Owns connection lifecycle for the persistent library store: tracks,
    playlists, match decisions and CuePoint-owned metadata.
    """

    @property
    @abstractmethod
    def db_path(self) -> Path:
        """Path to the SQLite database file."""
        ...

    @abstractmethod
    def connect(self) -> "sqlite3.Connection":
        """Return this thread's connection, opening it if needed.

        The connection is owned by the service; callers must not close it.
        """
        ...

    @abstractmethod
    def transaction(self) -> "AbstractContextManager[sqlite3.Connection]":
        """Context manager running a unit of work in a transaction.

        Commits on success, rolls back on exception.
        """
        ...

    @abstractmethod
    def execute_script(self, script: str) -> None:
        """Execute a multi-statement SQL script (used by migrations)."""
        ...

    @abstractmethod
    def close(self) -> None:
        """Close this thread's connection, if open."""
        ...

    @abstractmethod
    def close_all(self) -> None:
        """Close every connection opened by this service, across all threads."""
        ...


class IJobRepository(ABC):
    """Interface for durable background-job records (DEC-007)."""

    @abstractmethod
    def save(self, record: "JobRecord") -> None:
        """Insert or update a job record."""
        ...

    @abstractmethod
    def get(self, job_id: str) -> Optional["JobRecord"]:
        """Return a job record by id, or None."""
        ...

    @abstractmethod
    def list_recent(self, limit: int = 50) -> List["JobRecord"]:
        """Return the most recent job records, newest first."""
        ...

    @abstractmethod
    def count(self) -> int:
        """Return the number of stored job records."""
        ...

    @abstractmethod
    def mark_interrupted(self, updated_at: str) -> int:
        """Close out jobs left running by a previous process."""
        ...


class ILibraryService(ABC):
    """Interface for the persistent library entry point.

    Engine handlers, the CLI and the renderer call this rather than reaching
    for repositories directly.
    """

    @abstractmethod
    def get_track(self, track_id: int) -> Optional["LibraryTrack"]:
        """Return a track by its library id, or None."""
        ...

    @abstractmethod
    def find_by_rekordbox_id(self, rekordbox_track_id: str) -> Optional["LibraryTrack"]:
        """Return the track with this Rekordbox TrackID, or None."""
        ...

    @abstractmethod
    def list_tracks(
        self, limit: Optional[int] = None, offset: int = 0
    ) -> List["LibraryTrack"]:
        """Return tracks ordered by artist then title."""
        ...

    @abstractmethod
    def track_count(self) -> int:
        """Return the number of tracks in the library."""
        ...

    @abstractmethod
    def is_empty(self) -> bool:
        """Return True when no tracks have been imported yet."""
        ...

    @abstractmethod
    def stats(self) -> "LibraryStats":
        """Return a summary of the library."""
        ...


class ITrackRepository(ABC):
    """Interface for library track persistence.

    Implementations own all SQL against the ``tracks`` table, including the
    DEC-002 identity lookups a Rekordbox refresh depends on.
    """

    @abstractmethod
    def add(self, track: "LibraryTrack") -> "LibraryTrack":
        """Insert a track and return it with its assigned id."""
        ...

    @abstractmethod
    def add_many(self, tracks: Iterable["LibraryTrack"]) -> int:
        """Insert many tracks in one transaction; returns the count inserted."""
        ...

    @abstractmethod
    def update(self, track: "LibraryTrack") -> "LibraryTrack":
        """Persist changes to an existing track."""
        ...

    @abstractmethod
    def delete(self, track_id: int) -> bool:
        """Delete a track by id; True if a row was removed."""
        ...

    @abstractmethod
    def delete_by_rekordbox_ids(self, rekordbox_track_ids: Iterable[str]) -> int:
        """Delete tracks by Rekordbox TrackID; returns the count deleted."""
        ...

    @abstractmethod
    def get(self, track_id: int) -> Optional["LibraryTrack"]:
        """Return a track by primary key, or None."""
        ...

    @abstractmethod
    def find_by_rekordbox_id(self, rekordbox_track_id: str) -> Optional["LibraryTrack"]:
        """Return the track with this Rekordbox TrackID, or None."""
        ...

    @abstractmethod
    def find_by_normalized_path(self, normalized: str) -> Optional["LibraryTrack"]:
        """Return a track whose normalized path matches, or None."""
        ...

    @abstractmethod
    def find_by_path(self, file_path: str) -> Optional["LibraryTrack"]:
        """Return a track matching this path, normalizing it first."""
        ...

    @abstractmethod
    def resolve_identity(
        self, rekordbox_track_id: str, file_path: Optional[str]
    ) -> Optional["IdentityMatch"]:
        """Find the library track an incoming Rekordbox track refers to."""
        ...

    @abstractmethod
    def list_all(
        self, limit: Optional[int] = None, offset: int = 0
    ) -> List["LibraryTrack"]:
        """Return tracks ordered by artist then title."""
        ...

    @abstractmethod
    def count(self) -> int:
        """Return the number of tracks in the library."""
        ...

    @abstractmethod
    def exists(self, rekordbox_track_id: str) -> bool:
        """Return True if a track with this Rekordbox TrackID is stored."""
        ...

    @abstractmethod
    def upsert_from_rekordbox(
        self, track: "LibraryTrack"
    ) -> Tuple["LibraryTrack", str, bool]:
        """Insert or update an incoming Rekordbox track, applying DEC-002."""
        ...


class IMigrationRunner(ABC):
    """Interface for applying library database schema migrations."""

    @property
    @abstractmethod
    def target_version(self) -> int:
        """Schema version this build of CuePoint expects."""
        ...

    @abstractmethod
    def current_version(self) -> int:
        """Return the database's schema version (0 if no migration applied)."""
        ...

    @abstractmethod
    def pending_migrations(self) -> List["Migration"]:
        """Return migrations not yet applied, in order."""
        ...

    @abstractmethod
    def migrate(self) -> List["Migration"]:
        """Apply all pending migrations, returning those applied."""
        ...


class IPrivacyService(ABC):
    """Interface for privacy preferences and privacy actions (Step 8.4)."""

    @abstractmethod
    def get_preferences(self) -> "PrivacyPreferences":
        """Return the currently persisted privacy preferences."""
        ...

    @abstractmethod
    def set_preferences(self, prefs: "PrivacyPreferences") -> None:
        """Persist the given privacy preferences."""
        ...

    @abstractmethod
    def set_clear_cache_on_exit(self, enabled: bool) -> None:
        """Enable/disable clearing the cache when the application exits."""
        ...

    @abstractmethod
    def set_clear_logs_on_exit(self, enabled: bool) -> None:
        """Enable/disable clearing logs when the application exits."""
        ...

    @abstractmethod
    def apply_exit_policies(self) -> None:
        """Apply configured privacy policies on exit (best-effort; never raises)."""
        ...


class IOnboardingService(ABC):
    """Interface for onboarding state and first-run detection (Step 9.4)."""

    @abstractmethod
    def get_state(self) -> "OnboardingState":
        """Get current persisted onboarding state."""
        ...

    @abstractmethod
    def is_first_run(self) -> bool:
        """Return True if onboarding has never been completed."""
        ...

    @abstractmethod
    def should_show_onboarding(self) -> bool:
        """Return True if onboarding should be shown now."""
        ...

    @abstractmethod
    def mark_first_run_complete(
        self, *, onboarding_version: Optional[str] = None
    ) -> None:
        """Mark onboarding as completed (does not set dismissed)."""
        ...

    @abstractmethod
    def dismiss_onboarding(self, *, dont_show_again: bool) -> None:
        """Dismiss onboarding, optionally never show again."""
        ...

    @abstractmethod
    def reset_onboarding(self) -> None:
        """Reset onboarding state."""
        ...


class IInventoryService(ABC):
    """Interface for the inCrate inventory facade (import, enrich, query)."""

    @property
    @abstractmethod
    def db_path(self) -> str:
        """Path to the SQLite inventory database."""
        ...

    @abstractmethod
    def reset_database(self) -> None:
        """Clear all inventory rows."""
        ...

    @abstractmethod
    def import_from_xml(
        self,
        xml_path: str,
        enrich: bool = True,
        progress_callback: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Import COLLECTION from Rekordbox XML and optionally enrich empty labels.

        Returns:
            Dict with imported (int), enriched (int), errors (list).
        """
        ...

    @abstractmethod
    def get_library_artists(self) -> List[str]:
        """Return distinct library artist names, sorted."""
        ...

    @abstractmethod
    def get_library_labels(self) -> List[str]:
        """Return distinct library labels, sorted."""
        ...

    @abstractmethod
    def has_artist(self, name: str) -> bool:
        """Return True if any track has the given artist (case-insensitive)."""
        ...

    @abstractmethod
    def get_inventory_stats(self) -> Dict[str, int]:
        """Return total and with_label counts."""
        ...

    @abstractmethod
    def list_inventory(
        self, limit: int = 5000, search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return inventory rows for UI."""
        ...


class IIncrateDiscoveryService(ABC):
    """Interface for inCrate discovery (charts + label new releases)."""

    @abstractmethod
    def run_discovery(
        self,
        genre_ids: Optional[List[int]] = None,
        charts_from_date: Optional[date] = None,
        charts_to_date: Optional[date] = None,
        new_releases_days: Optional[int] = None,
        progress_callback: Optional[Callable[[str, int, int], None]] = None,
        library_artist_names: Optional[List[str]] = None,
        library_label_names: Optional[List[str]] = None,
    ) -> List["DiscoveredTrack"]:
        """Run discovery; use config for defaults when args are None.

        Returns:
            Deduplicated list of DiscoveredTrack.
        """
        ...


class ISecurityService(ABC):
    """Interface for security checks and invariants (Step 8.1-8.3)."""

    @abstractmethod
    def validate_https_url(self, url: str) -> "SecurityCheckResult":
        """Validate that the given URL uses HTTPS."""
        ...

    @abstractmethod
    def validate_system_ssl(self) -> "SecurityCheckResult":
        """Check that a default SSL context can be created."""
        ...


class ICheckpointService(ABC):
    """Interface for run checkpointing and resume (Design 5.27, 5.29, 5.30)."""

    @abstractmethod
    def checkpoint_path(self) -> Path:
        """Return the path of the checkpoint file."""
        ...

    @abstractmethod
    def save(
        self,
        run_id: str,
        playlist: str,
        xml_path: str,
        xml_hash: str,
        last_track_index: int,
        last_track_id: str,
        output_paths: Dict[str, str],
    ) -> None:
        """Write checkpoint to disk (atomic write via temp file)."""
        ...

    @abstractmethod
    def load(self) -> Optional["CheckpointData"]:
        """Load checkpoint from disk. Returns None if missing or invalid."""
        ...

    @abstractmethod
    def can_resume(self, checkpoint: "CheckpointData", xml_path: str) -> bool:
        """Return True if the checkpoint is valid for the given XML."""
        ...

    @abstractmethod
    def validate_and_load(self, xml_path: str) -> Optional["CheckpointData"]:
        """Load a checkpoint only if it is resumable for the given XML."""
        ...

    @abstractmethod
    def discard(self) -> None:
        """Delete the checkpoint file."""
        ...

    @abstractmethod
    def exists(self) -> bool:
        """Return True if a checkpoint file exists."""
        ...
