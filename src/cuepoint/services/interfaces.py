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
    from cuepoint.models.library_source import LibrarySource
    from cuepoint.models.references import ReferenceSummary
    from cuepoint.models.track_metadata import TrackMetadata
    from cuepoint.models.tag import Tag, TagUsage
    from cuepoint.models.collection import (
        AddResult,
        Collection,
        CollectionEntry,
        SubtreeSummary,
    )
    from cuepoint.models.refresh_diff import RefreshDiff
    from cuepoint.models.library_track import IdentityMatch, LibraryTrack, QueueTrack
    from cuepoint.models.filter_rule import Facet, FacetRange, RuleSet
    from cuepoint.persistence.track_query import BrowseQuery
    from cuepoint.persistence.track_repository import BulkUpsertResult
    from cuepoint.services.library_import_service import (
        ImportSummary,
        RefreshSummary,
    )
    from cuepoint.models.rekordbox_playlist import (
        PlaylistTreeWriteResult,
        RekordboxPlaylist,
    )
    from cuepoint.persistence.activity_repository import (
        ActivityEvent,
        TrackFieldChange,
    )
    from cuepoint.persistence.job_repository import JobRecord
    from cuepoint.services.backup_service import BackupInfo
    from cuepoint.services.batch_service import (
        BatchCancelCallback,
        BatchOperation,
        BatchProgressCallback,
        BatchResult,
        BatchSelection,
    )
    from cuepoint.services.collection_service import FreezeResult, SmartResolution
    from cuepoint.services.library_service import (
        LibraryBrowseResult,
        LibrarySearchResult,
        LibraryStats,
    )
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
    def transaction(
        self, join_existing: bool = False
    ) -> "AbstractContextManager[sqlite3.Connection]":
        """Context manager running a unit of work in a transaction.

        Commits on success, rolls back on exception.

        Args:
            join_existing: Participate in a transaction the caller already
                opened rather than refusing, doing nothing on the way out so
                that block still owns the commit or rollback. This is what lets
                several repositories succeed or fail together — a refresh that
                deletes tracks and then fails must undo the deletion.
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


class IBackupService(ABC):
    """Interface for library database backup and restore (DEC-009)."""

    @abstractmethod
    def create_backup(self, reason: str = "manual") -> "BackupInfo":
        """Write a consistent copy of the database and prune old ones."""
        ...

    @abstractmethod
    def backup_on_launch(self) -> Optional["BackupInfo"]:
        """Back up if enabled and the database changed since the last backup."""
        ...

    @abstractmethod
    def list_backups(self) -> List["BackupInfo"]:
        """Return backups, newest first."""
        ...

    @abstractmethod
    def prune(self, keep: Optional[int] = None) -> int:
        """Delete the oldest backups beyond the retention cap."""
        ...

    @abstractmethod
    def verify_backup(self, backup_path: Path) -> None:
        """Check a backup is a readable database before it is used."""
        ...

    @abstractmethod
    def restore(self, backup_path: Path) -> "BackupInfo":
        """Replace the library database with a backup."""
        ...


class IActivityRepository(ABC):
    """Interface for the activity feed and per-track field history.

    Both are append-only: implementations expose no update or delete.
    """

    @abstractmethod
    def add_event(self, event: "ActivityEvent") -> "ActivityEvent":
        """Append an activity event."""
        ...

    @abstractmethod
    def recent_events(
        self, limit: int = 50, event_type: Optional[str] = None
    ) -> List["ActivityEvent"]:
        """Return recent activity, newest first."""
        ...

    @abstractmethod
    def event_count(self) -> int:
        """Return the number of recorded activity events."""
        ...

    @abstractmethod
    def add_field_change(self, change: "TrackFieldChange") -> "TrackFieldChange":
        """Append a field change to a track's history."""
        ...

    @abstractmethod
    def history_for_track(
        self, track_id: int, limit: Optional[int] = None
    ) -> List["TrackFieldChange"]:
        """Return a track's field history, newest first."""
        ...

    @abstractmethod
    def get_field_change(self, change_id: int) -> Optional["TrackFieldChange"]:
        """Return one recorded field change, or None."""
        ...

    @abstractmethod
    def history_count(self, track_id: Optional[int] = None) -> int:
        """Return the number of recorded field changes."""
        ...


class IActivityService(ABC):
    """Interface for recording activity and reverting track fields (DEC-008)."""

    @abstractmethod
    def record_event(
        self,
        event_type: str,
        summary: str,
        detail: Optional[Dict[str, Any]] = None,
    ) -> "ActivityEvent":
        """Append a user-readable activity event."""
        ...

    @abstractmethod
    def record_field_change(
        self,
        track_id: int,
        field_name: str,
        old_value: Any,
        new_value: Any,
        source: str = "cuepoint",
        batch_id: Optional[str] = None,
    ) -> Optional["TrackFieldChange"]:
        """Record a change to one track field, optionally as part of a batch."""
        ...

    @abstractmethod
    def apply_field_change(
        self,
        track: "LibraryTrack",
        field_name: str,
        new_value: Any,
        source: str = "cuepoint",
    ) -> Optional["TrackFieldChange"]:
        """Set a field on a track, persist it, and record the change."""
        ...

    @abstractmethod
    def recent_events(
        self, limit: int = 50, event_type: Optional[str] = None
    ) -> List["ActivityEvent"]:
        """Return recent activity, newest first."""
        ...

    @abstractmethod
    def event_count(self) -> int:
        """Return how many activity events have been recorded in total."""
        ...

    @abstractmethod
    def track_history(
        self, track_id: int, limit: Optional[int] = None
    ) -> List["TrackFieldChange"]:
        """Return a track's field history, newest first."""
        ...

    @abstractmethod
    def revert_field_change(self, change_id: int) -> "TrackFieldChange":
        """Restore the value a field held before a recorded change."""
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
    def search_tracks(
        self, query: str, limit: int = 50, offset: int = 0
    ) -> "LibrarySearchResult":
        """Return tracks matching a query, with the unpaged total."""
        ...

    @abstractmethod
    def browse_tracks(
        self,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional["RuleSet"] = None,
        sort: str = "artist",
        direction: str = "asc",
        limit: int = 100,
        offset: int = 0,
    ) -> "LibraryBrowseResult":
        """Return one scoped, filtered, sorted window of the library."""
        ...

    @abstractmethod
    def browse_track_ids(
        self,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional["RuleSet"] = None,
        sort: str = "artist",
        direction: str = "asc",
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> "LibraryBrowseResult":
        """Return the ids of one window, in the same order as the rows."""
        ...

    @abstractmethod
    def browse_queue_tracks(
        self,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional["RuleSet"] = None,
        sort: str = "artist",
        direction: str = "asc",
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> "LibraryBrowseResult":
        """Return one window of the view as playable queue entries."""
        ...

    @abstractmethod
    def facet(
        self,
        field: str,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional["RuleSet"] = None,
        limit: int = 0,
    ) -> "Facet":
        """Return the values a field takes in the current view (DEC-043)."""
        ...

    @abstractmethod
    def facet_range(
        self,
        field: str,
        query: str = "",
        playlist_id: Optional[int] = None,
        rules: Optional["RuleSet"] = None,
    ) -> "FacetRange":
        """Return the span of a numeric field in the current view."""
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

    @abstractmethod
    def references_for(self, track_ids: Iterable[int]) -> "ReferenceSummary":
        """Return what Collections and Sets hold these tracks (DEC-011).

        Consulted before a refresh deletes anything. Answers zero until Phase 6
        builds Collections — which is the true answer, not a placeholder — and
        Phase 6's whole job here is replacing that one body.
        """
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
    def delete_many(self, track_ids: Iterable[int]) -> int:
        """Delete tracks by library id; returns the count deleted."""
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
    def search(
        self, query: str, limit: int = 50, offset: int = 0
    ) -> List["LibraryTrack"]:
        """Return tracks matching a case-insensitive substring query."""
        ...

    @abstractmethod
    def search_count(self, query: str) -> int:
        """Return how many tracks match a query, ignoring paging."""
        ...

    @abstractmethod
    def browse(
        self,
        query: Optional["BrowseQuery"] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> List["LibraryTrack"]:
        """Return one scoped, ordered, paged window of the library (DEC-040)."""
        ...

    @abstractmethod
    def browse_ids(
        self,
        query: Optional["BrowseQuery"] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> List[int]:
        """Return the ids of one window, in the same order as the rows."""
        ...

    @abstractmethod
    def browse_queue(
        self,
        query: Optional["BrowseQuery"] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> List["QueueTrack"]:
        """Return one window as playable queue entries, in the rows' order."""
        ...

    @abstractmethod
    def browse_count(self, query: Optional["BrowseQuery"] = None) -> int:
        """Return how many tracks a browse query matches, ignoring paging."""
        ...

    @abstractmethod
    def facet_values(
        self,
        query: Optional["BrowseQuery"] = None,
        field: str = "genre",
        limit: int = 0,
    ) -> "Facet":
        """Return the values a field takes in the current view (DEC-043)."""
        ...

    @abstractmethod
    def facet_range(
        self, query: Optional["BrowseQuery"] = None, field: str = "bpm"
    ) -> "FacetRange":
        """Return the span of a numeric field in the current view."""
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

    @abstractmethod
    def upsert_many_from_rekordbox(
        self, tracks: Iterable["LibraryTrack"], batch_size: int = 1000
    ) -> "BulkUpsertResult":
        """Insert or update a whole collection in one transaction (DEC-002)."""
        ...


class ITrackMetadataRepository(ABC):
    """Interface for CuePoint's own per-track metadata (DEC-057).

    Deliberately separate from :class:`ITrackRepository`. That one owns what
    Rekordbox wrote and rewrites every column of it on a refresh; this one owns
    what the user wrote, and nothing on either side can reach the other's
    columns. The separation is the mechanism behind "a refresh can never
    overwrite your rating", which is why it is two interfaces and not one with
    more methods.
    """

    @abstractmethod
    def get(self, track_id: int) -> Optional["TrackMetadata"]:
        """Return one track's metadata, or None when it has none."""
        ...

    @abstractmethod
    def get_many(self, track_ids: Iterable[int]) -> Dict[int, "TrackMetadata"]:
        """Return metadata for the tracks that have any, keyed by track id."""
        ...

    @abstractmethod
    def count(self) -> int:
        """Return how many tracks have any CuePoint metadata."""
        ...

    @abstractmethod
    def set_rating(self, track_id: int, rating: Optional[int]) -> "TrackMetadata":
        """Set or clear the CuePoint rating (None clears; 0 is a rating)."""
        ...

    @abstractmethod
    def set_favorite(self, track_id: int, favorite: bool) -> "TrackMetadata":
        """Set the favorite flag."""
        ...

    @abstractmethod
    def set_notes(self, track_id: int, notes: Optional[str]) -> "TrackMetadata":
        """Set or clear the note."""
        ...

    @abstractmethod
    def clear(self, track_id: int) -> bool:
        """Delete everything CuePoint knows about a track."""
        ...


class ICollectionRepository(ABC):
    """Interface for CuePoint's own collection tree and membership (DEC-058/059).

    The editable counterpart to :class:`IPlaylistRepository`. That one mirrors
    Rekordbox and has no rename, move or reorder because DEC-031 made it
    read-only; this one is all of those, and is never rebuilt from an import.
    """

    @abstractmethod
    def get(self, node_id: int) -> Optional["Collection"]:
        """Return one node, or None."""
        ...

    @abstractmethod
    def tree(self) -> List["Collection"]:
        """Return every node, parents before children, siblings in order."""
        ...

    @abstractmethod
    def children_of(self, parent_id: Optional[int]) -> List["Collection"]:
        """Return a node's children, or the top level."""
        ...

    @abstractmethod
    def subtree_ids(self, node_id: int) -> List[int]:
        """Return the node's id and every descendant's."""
        ...

    @abstractmethod
    def subtree_summary(self, node_id: int) -> "SubtreeSummary":
        """Return what deleting this node would remove."""
        ...

    @abstractmethod
    def max_depth_in_subtree(self, node_id: int) -> int:
        """Return the deepest depth under and including this node."""
        ...

    @abstractmethod
    def count(self) -> int:
        """Return how many nodes exist, folders included."""
        ...

    @abstractmethod
    def create(self, node: "Collection") -> "Collection":
        """Insert a node at the end of its parent's children."""
        ...

    @abstractmethod
    def rename(self, node_id: int, name: str) -> Optional["Collection"]:
        """Rename a node."""
        ...

    @abstractmethod
    def set_rules(
        self,
        node_id: int,
        rules_json: Optional[str],
        sort_field: Optional[str] = None,
        sort_dir: Optional[str] = None,
    ) -> Optional["Collection"]:
        """Write a Smart Collection's saved rule set and sort."""
        ...

    @abstractmethod
    def move(
        self, node_id: int, parent_id: Optional[int], position: Optional[int] = None
    ) -> Optional["Collection"]:
        """Reparent a node, keeping both sibling lists contiguous."""
        ...

    @abstractmethod
    def reorder(self, node_id: int, position: int) -> Optional["Collection"]:
        """Move a node among its own siblings."""
        ...

    @abstractmethod
    def delete(self, node_id: int) -> bool:
        """Delete a node and its subtree. Deletes no tracks."""
        ...

    @abstractmethod
    def entries(
        self, collection_id: int, offset: int = 0, limit: Optional[int] = None
    ) -> List["CollectionEntry"]:
        """Return a Collection's entries in its own order."""
        ...

    @abstractmethod
    def track_ids(self, collection_id: int) -> List[int]:
        """Return the track ids in a Collection's order, repeats included."""
        ...

    @abstractmethod
    def entry_count(self, collection_id: int) -> int:
        """Return how many rows a Collection holds, duplicates counted."""
        ...

    @abstractmethod
    def track_count(self, collection_id: int) -> int:
        """Return how many distinct tracks a Collection holds."""
        ...

    @abstractmethod
    def add(self, collection_id: int, track_ids: Iterable[int]) -> "AddResult":
        """Append tracks that are not already there; report what was skipped."""
        ...

    @abstractmethod
    def insert_at(
        self, collection_id: int, track_id: int, position: int
    ) -> "CollectionEntry":
        """Put a track at a given place, duplicates allowed (DEC-058)."""
        ...

    @abstractmethod
    def remove_entries(self, entry_ids: Iterable[int]) -> int:
        """Remove specific entries and close the gaps they leave."""
        ...

    @abstractmethod
    def reorder_entry(
        self, entry_id: int, position: int
    ) -> Optional["CollectionEntry"]:
        """Move one entry within its Collection."""
        ...

    @abstractmethod
    def clear(self, collection_id: int) -> int:
        """Remove every entry from a Collection. Deletes no tracks."""
        ...

    @abstractmethod
    def collection_ids_for_track(self, track_id: int) -> List[int]:
        """Return the Collections a track is in."""
        ...

    @abstractmethod
    def references_for(self, track_ids: Iterable[int]) -> Tuple[List[int], List[int]]:
        """Return (collection ids, referenced track ids) for a set of tracks."""
        ...


class ICollectionService(ABC):
    """Interface for editing the collection tree (DEC-006, DEC-058, DEC-059).

    Where the rules of the tree live: only a folder may be a parent, a node may
    not be moved into its own subtree, the tree has a maximum depth, and a
    Smart Collection holds a question rather than rows and so cannot be given
    membership.

    A Smart Collection's own operations (ORG-06, DEC-061) are here rather than
    in a service of their own, because every one of them is a node operation:
    saving one creates a node, duplicating one creates a node, and renaming,
    moving and deleting one are the methods above, unchanged. Only
    :meth:`freeze` reaches outside the tree, and what it reaches for is the
    library query it is about to store the answer to.
    """

    @abstractmethod
    def create_folder(self, name: str, parent_id: Optional[int] = None) -> "Collection":
        """Create a folder."""
        ...

    @abstractmethod
    def create_collection(
        self, name: str, parent_id: Optional[int] = None
    ) -> "Collection":
        """Create a Collection."""
        ...

    @abstractmethod
    def rename(self, node_id: int, name: str) -> "Collection":
        """Rename a node."""
        ...

    @abstractmethod
    def move(
        self, node_id: int, parent_id: Optional[int], position: Optional[int] = None
    ) -> "Collection":
        """Reparent a node, refusing cycles and over-deep destinations."""
        ...

    @abstractmethod
    def reorder(self, node_id: int, position: int) -> "Collection":
        """Move a node among its siblings."""
        ...

    @abstractmethod
    def delete_preview(self, node_id: int) -> "SubtreeSummary":
        """Return what deleting this node would remove, before it happens."""
        ...

    @abstractmethod
    def delete(self, node_id: int) -> "SubtreeSummary":
        """Delete a node and its subtree, returning what went."""
        ...

    @abstractmethod
    def tree(self) -> List["Collection"]:
        """Return the whole tree in draw order."""
        ...

    @abstractmethod
    def get(self, node_id: int) -> Optional["Collection"]:
        """Return one node, or ``None``."""
        ...

    @abstractmethod
    def add_tracks(self, collection_id: int, track_ids: Iterable[int]) -> "AddResult":
        """Append tracks not already there, skipping and reporting the rest."""
        ...

    @abstractmethod
    def insert_track(
        self, collection_id: int, track_id: int, position: int
    ) -> "CollectionEntry":
        """Put a track at a position, deliberately allowing a duplicate."""
        ...

    @abstractmethod
    def remove_entries(self, entry_ids: Iterable[int]) -> int:
        """Remove entries by their own ids."""
        ...

    @abstractmethod
    def reorder_entry(self, entry_id: int, position: int) -> "CollectionEntry":
        """Move one entry within its Collection."""
        ...

    @abstractmethod
    def entries(
        self, collection_id: int, offset: int = 0, limit: Optional[int] = None
    ) -> List["CollectionEntry"]:
        """Return a Collection's entries in order."""
        ...

    @abstractmethod
    def counts(self, collection_id: int) -> Tuple[int, int]:
        """Return ``(entry_count, distinct_track_count)`` for a Collection."""
        ...

    @abstractmethod
    def create_smart(
        self,
        name: str,
        rules: "RuleSet",
        parent_id: Optional[int] = None,
        sort: Optional[str] = None,
        direction: Optional[str] = None,
    ) -> "Collection":
        """Save a rule set as a Smart Collection, checking what it names."""
        ...

    @abstractmethod
    def update_rules(
        self,
        node_id: int,
        rules: "RuleSet",
        sort: Optional[str] = None,
        direction: Optional[str] = None,
    ) -> "Collection":
        """Replace a Smart Collection's saved question. Stores nothing else."""
        ...

    @abstractmethod
    def duplicate(self, node_id: int, name: Optional[str] = None) -> "Collection":
        """Copy a Smart Collection's rules and order, linked to nothing."""
        ...

    @abstractmethod
    def resolve(self, node_id: int) -> "SmartResolution":
        """Return the query a Smart Collection stands for, or why it cannot run."""
        ...

    @abstractmethod
    def freeze(self, node_id: int, name: Optional[str] = None) -> "FreezeResult":
        """Store a Smart Collection's current answer as a Collection (DEC-061)."""
        ...


class ITagRepository(ABC):
    """Interface for the tag vocabulary and its assignments (DEC-015).

    Flat and user-defined, with an optional category *label* per tag. There is
    deliberately no parent, no child and no category entity: DEC-015 chose that
    over a hierarchy, and an interface that cannot express a tree is what keeps
    the decision from eroding one convenience method at a time.
    """

    @abstractmethod
    def get(self, tag_id: int) -> Optional["Tag"]:
        """Return one tag, or None."""
        ...

    @abstractmethod
    def find_by_name(self, name: str) -> Optional["Tag"]:
        """Return the tag with this name, ignoring case, or None."""
        ...

    @abstractmethod
    def list_all(self) -> List["TagUsage"]:
        """Return every tag with how many tracks carry it."""
        ...

    @abstractmethod
    def usage_count(self, tag_id: int) -> int:
        """Return how many tracks carry this tag."""
        ...

    @abstractmethod
    def categories_in_use(self) -> List[str]:
        """Return the category labels currently written on tags."""
        ...

    @abstractmethod
    def tags_for_track(self, track_id: int) -> List["Tag"]:
        """Return the tags on one track."""
        ...

    @abstractmethod
    def tags_for_tracks(self, track_ids: Iterable[int]) -> Dict[int, List["Tag"]]:
        """Return the tags on each track that has any, keyed by track id."""
        ...

    @abstractmethod
    def tracks_with_tag(
        self, tag_id: int, track_ids: Optional[Iterable[int]] = None
    ) -> List[int]:
        """Return which tracks carry this tag, optionally within a given set."""
        ...

    @abstractmethod
    def create(self, tag: "Tag") -> "Tag":
        """Insert a tag and return it with its assigned id."""
        ...

    @abstractmethod
    def rename(self, tag_id: int, name: str) -> Optional["Tag"]:
        """Rename a tag, leaving its assignments alone."""
        ...

    @abstractmethod
    def set_category(self, tag_id: int, category: Optional[str]) -> Optional["Tag"]:
        """Set or clear a tag's category label."""
        ...

    @abstractmethod
    def set_colour(self, tag_id: int, colour: Optional[str]) -> Optional["Tag"]:
        """Set or clear a tag's colour token."""
        ...

    @abstractmethod
    def delete(self, tag_id: int) -> bool:
        """Delete a tag and its assignments. Deletes no tracks."""
        ...

    @abstractmethod
    def merge(self, source_id: int, target_id: int) -> int:
        """Move every assignment to another tag and delete the source."""
        ...

    @abstractmethod
    def assign(self, track_ids: Iterable[int], tag_id: int) -> List[int]:
        """Put a tag on tracks; return the ones that did not have it."""
        ...

    @abstractmethod
    def unassign(self, track_ids: Iterable[int], tag_id: int) -> List[int]:
        """Take a tag off tracks; return the ones that had it."""
        ...


class ITagService(ABC):
    """Interface for building and applying the tag vocabulary (DEC-015, DEC-008).

    The layer that turns a tag change into a change *plus* its history, and that
    knows the difference between the vocabulary and the tracks: renaming a tag
    is a change to the vocabulary and writes no track history, while putting one
    on a track is a change to that track and does.
    """

    @abstractmethod
    def create_or_get(
        self,
        name: str,
        category: Optional[str] = None,
        colour: Optional[str] = None,
    ) -> "Tag":
        """Return the tag with this name, creating it if it does not exist."""
        ...

    @abstractmethod
    def rename(self, tag_id: int, name: str) -> "Tag":
        """Rename a tag."""
        ...

    @abstractmethod
    def set_category(self, tag_id: int, category: Optional[str]) -> "Tag":
        """Set or clear a tag's category label."""
        ...

    @abstractmethod
    def set_colour(self, tag_id: int, colour: Optional[str]) -> "Tag":
        """Set or clear a tag's colour token."""
        ...

    @abstractmethod
    def delete(self, tag_id: int, batch_id: Optional[str] = None) -> int:
        """Delete a tag, recording its removal from every track that had it."""
        ...

    @abstractmethod
    def merge(
        self, source_id: int, target_id: int, batch_id: Optional[str] = None
    ) -> int:
        """Merge one tag into another, recording what changed per track."""
        ...

    @abstractmethod
    def assign(
        self, track_ids: Iterable[int], tag_id: int, batch_id: Optional[str] = None
    ) -> List[int]:
        """Put a tag on tracks and record it; return the ones that changed."""
        ...

    @abstractmethod
    def unassign(
        self, track_ids: Iterable[int], tag_id: int, batch_id: Optional[str] = None
    ) -> List[int]:
        """Take a tag off tracks and record it; return the ones that changed."""
        ...

    @abstractmethod
    def list_all(self) -> List["TagUsage"]:
        """Return every tag with its usage count."""
        ...

    @abstractmethod
    def categories_in_use(self) -> List[str]:
        """Return the category labels currently in use."""
        ...

    @abstractmethod
    def tags_for_track(self, track_id: int) -> List["Tag"]:
        """Return the tags on one track."""
        ...

    @abstractmethod
    def tags_for_tracks(self, track_ids: Iterable[int]) -> Dict[int, List["Tag"]]:
        """Return the tags on each track that has any."""
        ...


class IMetadataService(ABC):
    """Interface for editing CuePoint's own track metadata (DEC-057, DEC-008).

    The layer that turns a write into a write *plus* its history entry. Every
    method here is a user's edit, and DEC-008 chose per-field history over an
    undo stack precisely so those edits can be looked at and taken back one at
    a time.
    """

    @abstractmethod
    def get(self, track_id: int) -> Optional["TrackMetadata"]:
        """Return one track's CuePoint metadata, or None."""
        ...

    @abstractmethod
    def get_many(self, track_ids: Iterable[int]) -> Dict[int, "TrackMetadata"]:
        """Return metadata for many tracks, keyed by track id."""
        ...

    @abstractmethod
    def effective_rating_for(self, track_id: int) -> Optional[int]:
        """Return the rating to show for a track, resolving both layers."""
        ...

    @abstractmethod
    def set_rating(
        self, track_id: int, rating: Optional[int], batch_id: Optional[str] = None
    ) -> "TrackMetadata":
        """Set or clear the CuePoint rating and record the change."""
        ...

    @abstractmethod
    def set_favorite(
        self, track_id: int, favorite: bool, batch_id: Optional[str] = None
    ) -> "TrackMetadata":
        """Set the favorite flag and record the change."""
        ...

    @abstractmethod
    def set_notes(
        self, track_id: int, notes: Optional[str], batch_id: Optional[str] = None
    ) -> "TrackMetadata":
        """Set or clear the note and record the change."""
        ...

    @abstractmethod
    def clear(self, track_id: int, batch_id: Optional[str] = None) -> bool:
        """Forget everything CuePoint knows about a track, recording each loss."""
        ...


class IBatchService(ABC):
    """Interface for applying one operation to a whole selection (ORG-07).

    The entry point DEC-063 describes: one vocabulary of operations, a
    selection that is either ids or the query naming them (DEC-045), and a
    result whose counts are what a toast and an activity event both read.

    Nothing about ratings, tags or Collections is decided here — those services
    own their rules, and a batch calls them. What this interface promises is
    the part they do not have: the selection is resolved once, the work is
    applied in committed chunks so a cancel can be honoured, and every field
    change it causes carries one shared batch id.
    """

    @abstractmethod
    def resolve(self, selection: "BatchSelection") -> List[int]:
        """Return the ids a selection names, once, deduplicated."""
        ...

    @abstractmethod
    def check(self, operation: "BatchOperation") -> str:
        """Refuse an operation that cannot be applied, and name what it targets."""
        ...

    @abstractmethod
    def apply_batch(
        self,
        selection: "BatchSelection",
        operation: "BatchOperation",
        *,
        on_progress: Optional["BatchProgressCallback"] = None,
        should_cancel: Optional["BatchCancelCallback"] = None,
    ) -> "BatchResult":
        """Apply one operation to every track a selection names."""
        ...


class IPlaylistRepository(ABC):
    """Interface for the mirrored Rekordbox playlist tree (DEC-031).

    Read-only source data: the only write is a wholesale replacement from an
    export. There is deliberately no rename, move, add-track or remove-track —
    a Phase 6 Collection is a different, editable concept in different tables,
    and an edit landing here would be destroyed by the next refresh.
    """

    @abstractmethod
    def replace_tree(
        self, nodes: Iterable["RekordboxPlaylist"]
    ) -> "PlaylistTreeWriteResult":
        """Replace the whole mirror; nodes must arrive parents-first."""
        ...

    @abstractmethod
    def clear(self) -> None:
        """Remove the whole mirror."""
        ...

    @abstractmethod
    def get(self, playlist_id: int) -> Optional["RekordboxPlaylist"]:
        """Return a node by primary key, or None."""
        ...

    @abstractmethod
    def find_by_path(self, rekordbox_path: str) -> Optional["RekordboxPlaylist"]:
        """Return the node at this path, or None; the path is not unique."""
        ...

    @abstractmethod
    def list_all(self) -> List["RekordboxPlaylist"]:
        """Return every node, parents before children, siblings in order."""
        ...

    @abstractmethod
    def children_of(self, playlist_id: Optional[int]) -> List["RekordboxPlaylist"]:
        """Return a node's direct children, or the roots for None."""
        ...

    @abstractmethod
    def track_ids_for(self, playlist_id: int) -> List[int]:
        """Return the library track ids in a playlist, in Rekordbox's order."""
        ...

    @abstractmethod
    def playlist_ids_for_track(self, track_id: int) -> List[int]:
        """Return the playlists a track appears in."""
        ...

    @abstractmethod
    def count(self) -> int:
        """Return the number of nodes, folders included."""
        ...

    @abstractmethod
    def count_entries(self) -> int:
        """Return the number of stored track references."""
        ...


class ILibrarySourceRepository(ABC):
    """Interface for the DEC-035 record of the file a library was imported from.

    One row: the library is singular. The write path enforces that rather than
    the schema, so a later release can grow an import history without a
    migration that moves data.
    """

    @abstractmethod
    def replace(self, source: "LibrarySource") -> "LibrarySource":
        """Make this the library's only source record."""
        ...

    @abstractmethod
    def get(self) -> Optional["LibrarySource"]:
        """Return the current source record, or None if nothing was imported."""
        ...

    @abstractmethod
    def clear(self) -> None:
        """Forget where the library came from."""
        ...


class ILibraryImportService(ABC):
    """Interface for importing a Rekordbox export into the library.

    Separate from :class:`ILibraryService`, which reads the library: an import
    needs the parser, the playlist mirror and the activity feed, and a search
    endpoint needs none of them.
    """

    @abstractmethod
    def import_rekordbox_xml(self, xml_path: str) -> "ImportSummary":
        """Import an export, returning what the import did."""
        ...

    @abstractmethod
    def current_source(self) -> Optional["LibrarySource"]:
        """Return the file the library was imported from, or None."""
        ...

    @abstractmethod
    def compute_refresh_diff(self, xml_path: Optional[str] = None) -> "RefreshDiff":
        """Return what a refresh would change, having changed nothing (DEC-032).

        Answers from the file's recorded state when the export demonstrably has
        not moved since the import; implementations take a ``force`` argument to
        read it anyway.
        """
        ...

    @abstractmethod
    def apply_refresh(
        self, diff: "RefreshDiff", confirm_references: bool = False
    ) -> "RefreshSummary":
        """Apply a previewed diff, deleting what the export dropped (DEC-003)."""
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
