#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Service Bootstrap

Bootstrap function to register all services with the DI container.
This should be called at application startup.
"""

import os
import threading

from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.cache_service import CacheService
from cuepoint.services.incrate_discovery_service import IncrateDiscoveryService
from cuepoint.services.inventory_service import (
    InventoryService,
    default_inventory_db_path,
)
from cuepoint.services.config_service import ConfigService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.export_service import ExportService
from cuepoint.services.interfaces import (
    ICollectionRepository,
    ICollectionService,
    IActivityRepository,
    IActivityService,
    IAuthoredDataRepository,
    IBackupService,
    IBatchService,
    IBeatportService,
    ICacheService,
    IConfigService,
    IDatabaseService,
    IExportService,
    IArtworkRepository,
    IArtworkService,
    IFileWriteRepository,
    IHealthService,
    IRekordboxExportRepository,
    IRekordboxExportService,
    IReviewExportService,
    ITagWriteService,
    ICreditIndexService,
    IDuplicateRepository,
    IDuplicateService,
    IFileCheckService,
    IFileStatusRepository,
    IIncrateDiscoveryService,
    IJobRepository,
    ILibraryService,
    IMetadataService,
    ITagRepository,
    ITagService,
    IInventoryService,
    ILoggingService,
    IMatcherService,
    IMatchApplyService,
    IMatchJobRepository,
    IMatchRepository,
    IMatchService,
    IMatchStateService,
    IMigrationRunner,
    IOnboardingService,
    IPrivacyService,
    IProcessorService,
    IRevertService,
    ITelemetryService,
    ILibraryImportService,
    ILibrarySourceRepository,
    IPlaylistRepository,
    ITrackMetadataRepository,
    ITrackCreditRepository,
    ITrackRepository,
)
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.onboarding_service import OnboardingService
from cuepoint.services.privacy_service import PrivacyService
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.authored_data_repository import AuthoredDataRepository
from cuepoint.persistence.artwork_repository import ArtworkRepository
from cuepoint.persistence.file_write_repository import FileWriteRepository
from cuepoint.persistence.rekordbox_export_repository import (
    RekordboxExportRepository,
)
from cuepoint.services.tag_write_service import TagWriteService
from cuepoint.persistence.duplicate_repository import DuplicateRepository
from cuepoint.services.credit_index_service import CreditIndexService
from cuepoint.persistence.file_status_repository import FileStatusRepository
from cuepoint.persistence.job_repository import JobRepository
from cuepoint.persistence.library_source_repository import (
    LibrarySourceRepository,
)
from cuepoint.persistence.match_job_repository import MatchJobRepository
from cuepoint.persistence.match_repository import MatchRepository
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.tag_repository import TagRepository
from cuepoint.persistence.track_metadata_repository import (
    TrackMetadataRepository,
)
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.backup_service import BackupService
from cuepoint.services.batch_service import BatchService
from cuepoint.services.collection_service import CollectionService
from cuepoint.services.artwork_cache import ArtworkCache, default_artwork_cache_dir
from cuepoint.services.artwork_service import ArtworkService, FetchGate
from cuepoint.services.duplicate_service import DuplicateService
from cuepoint.services.file_check_service import FileCheckService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.health_service import HealthService
from cuepoint.services.review_export_service import ReviewExportService
from cuepoint.services.rekordbox_export_service import RekordboxExportService
from cuepoint.services.match_apply import MatchApplyService
from cuepoint.services.match_service import MatchService
from cuepoint.services.match_state import MatchStateService
from cuepoint.services.metadata_service import MetadataService
from cuepoint.services.tag_service import TagService
from cuepoint.services.processor_service import ProcessorService
from cuepoint.services.revert_service import RevertService
from cuepoint.services.telemetry_service import TelemetryService
from cuepoint.utils.di_container import get_container


class _Bootstrapped:
    """Marker registered last, so a container knows it has been wired.

    Not a service: nothing resolves it. It exists because
    :func:`bootstrap_services` has to be able to answer "have I already run on
    this container?", and it is registered at the very end so a call that
    failed half way leaves no marker and the next one starts over.
    """


def bootstrap_services() -> None:
    """Register all services with the DI container, once per container.

    **Calling this twice must not replace what the first call registered.**
    Four callers say "make sure the services exist" — the engine's launch
    backup, its job runner, and the config and inCrate routes — and each one
    used to register a *new* ``DatabaseService`` over the last. Anything
    resolved before that point kept the old one, so two objects in the same
    process held two SQLite connections to the same file. That is not a
    tidiness problem: a 50,000-track import took its write lock on one
    connection, and the job store — holding a repository from the earlier
    bootstrap — tried to record progress on the other, waiting out the whole
    five-second busy timeout on every tick. An import that takes three seconds
    took hours (CLEAN-14's E2E timeouts).

    A container that has been wired is left exactly as it is. Tests that want
    fresh services call :func:`~cuepoint.utils.di_container.reset_container`
    first, which drops the container and with it the marker.
    """
    container = get_container()
    if container.is_registered(_Bootstrapped):
        return

    # Register logging service first (needed by others)
    logging_service = LoggingService()
    container.register_singleton(ILoggingService, logging_service)

    # Register config service
    config_service = ConfigService()
    container.register_singleton(IConfigService, config_service)

    # Register cache service
    cache_service = CacheService()
    container.register_singleton(ICacheService, cache_service)

    # Library database. Registered as a singleton so every consumer shares one
    # connection pool; constructing it does not open the file, so this stays
    # cheap for runs that never touch the database (e.g. plain CLI matching).
    container.register_singleton(
        IDatabaseService, DatabaseService(config_service=config_service)
    )

    # Schema migrations. Resolving the runner discovers migrations but does not
    # apply them or open the database; callers invoke migrate() explicitly.
    def create_migration_runner() -> IMigrationRunner:
        return MigrationRunner(database_service=container.resolve(IDatabaseService))

    container.register_factory(IMigrationRunner, create_migration_runner)

    # Repositories are the first thing that needs real tables, so this is where
    # migrations run. Doing it here rather than inside DatabaseService.connect()
    # keeps opening the database cheap for the many code paths that never touch
    # it, while making it impossible to reach a repository against an
    # unmigrated database. migrate() is a no-op once the schema is current.
    def create_track_repository() -> ITrackRepository:
        container.resolve(IMigrationRunner).migrate()
        return TrackRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(ITrackRepository, create_track_repository)

    # The library's name index (DISCOVER-03): its repository, and the service
    # that rebuilds it when the running rule version did not build it.
    def create_track_credit_repository() -> ITrackCreditRepository:
        container.resolve(IMigrationRunner).migrate()
        return TrackCreditRepository(
            database_service=container.resolve(IDatabaseService)
        )

    container.register_factory(ITrackCreditRepository, create_track_credit_repository)

    def create_credit_index_service() -> ICreditIndexService:
        return CreditIndexService(
            credit_repository=container.resolve(ITrackCreditRepository)
        )

    container.register_factory(ICreditIndexService, create_credit_index_service)

    def create_playlist_repository() -> IPlaylistRepository:
        """Build the mirrored Rekordbox playlist tree repository.

        Migrates first, like the track repository, so its tables exist however
        this is reached. Until LIBUI-03 every path that touched playlists had
        resolved something else first — the import service, or the summary
        endpoint's library service — and so migrated by accident of ordering.
        The playlists endpoint resolves only this, which on a fresh install is
        a 500 the first time a user opens the Library page.
        """
        container.resolve(IMigrationRunner).migrate()
        return PlaylistRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IPlaylistRepository, create_playlist_repository)

    def create_library_source_repository() -> ILibrarySourceRepository:
        """Build the DEC-035 source-record repository, migrating first."""
        container.resolve(IMigrationRunner).migrate()
        return LibrarySourceRepository(
            database_service=container.resolve(IDatabaseService)
        )

    container.register_factory(
        ILibrarySourceRepository, create_library_source_repository
    )

    def create_library_import_service() -> ILibraryImportService:
        """Build the Rekordbox import service."""
        from cuepoint.services.library_import_service import (
            LibraryImportService,
        )

        return LibraryImportService(
            track_repository=container.resolve(ITrackRepository),
            playlist_repository=container.resolve(IPlaylistRepository),
            source_repository=container.resolve(ILibrarySourceRepository),
            # The transaction boundary an import or a refresh runs inside. The
            # same singleton the repositories hold, which is what lets them
            # join it rather than open one of their own.
            database_service=container.resolve(IDatabaseService),
            activity_service=container.resolve(IActivityService),
            # DEC-011's reference check. Resolved here so a refresh diff always
            # asks the real seam rather than falling back to a local zero.
            library_service=container.resolve(ILibraryService),
        )

    container.register_factory(ILibraryImportService, create_library_import_service)

    # Library entry point. Callers depend on this rather than on repositories,
    # so persistence details stay behind the seam. It reads three of them: the
    # tracks, the Collections that reference them (DEC-011) and CuePoint's own
    # layer, which every window carries beside the imported record (ORG-08).
    def create_library_service() -> ILibraryService:
        return LibraryService(
            track_repository=container.resolve(ITrackRepository),
            collection_repository=container.resolve(ICollectionRepository),
            metadata_repository=container.resolve(ITrackMetadataRepository),
            authored_repository=container.resolve(IAuthoredDataRepository),
        )

    container.register_factory(ILibraryService, create_library_service)

    # Which tracks carry a user's own work (DEC-011, as amended in CLEAN-05):
    # what a refresh has to warn about before it deletes them.
    def create_authored_data_repository() -> IAuthoredDataRepository:
        container.resolve(IMigrationRunner).migrate()
        return AuthoredDataRepository(
            database_service=container.resolve(IDatabaseService)
        )

    container.register_factory(IAuthoredDataRepository, create_authored_data_repository)

    # Durable job records (DEC-007). Like the track repository, resolving this
    # applies migrations first, so the jobs table is guaranteed to exist.
    def create_job_repository() -> IJobRepository:
        container.resolve(IMigrationRunner).migrate()
        return JobRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IJobRepository, create_job_repository)

    # Activity feed and per-track field history (DEC-008).
    def create_activity_repository() -> IActivityRepository:
        container.resolve(IMigrationRunner).migrate()
        return ActivityRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IActivityRepository, create_activity_repository)

    def create_activity_service() -> IActivityService:
        return ActivityService(
            activity_repository=container.resolve(IActivityRepository),
            track_repository=container.resolve(ITrackRepository),
        )

    container.register_factory(IActivityService, create_activity_service)

    # CuePoint's own per-track values (DEC-057). Registered after the activity
    # service because every write through it records its own history (DEC-008),
    # and after the track repository because it refuses a write against a track
    # that is not there.
    def create_track_metadata_repository() -> ITrackMetadataRepository:
        container.resolve(IMigrationRunner).migrate()
        return TrackMetadataRepository(
            database_service=container.resolve(IDatabaseService)
        )

    container.register_factory(
        ITrackMetadataRepository, create_track_metadata_repository
    )

    # Match attempts, their candidates and each track's match state (DEC-066).
    # CLEAN-03's job and CLEAN-04's decisions reach those tables through this.
    def create_match_repository() -> IMatchRepository:
        container.resolve(IMigrationRunner).migrate()
        return MatchRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IMatchRepository, create_match_repository)

    # A match job's plan and progress (DEC-065): what makes resuming one a query.
    def create_match_job_repository() -> IMatchJobRepository:
        container.resolve(IMigrationRunner).migrate()
        return MatchJobRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IMatchJobRepository, create_match_job_repository)

    # Each track's match state and a user's decisions (CLEAN-04, DEC-067). The
    # match job's state rule and the batch path's decisions both go through it,
    # so there is one place that knows a user's decision is never overwritten.
    def create_match_state_service() -> IMatchStateService:
        return MatchStateService(
            match_repository=container.resolve(IMatchRepository),
            track_repository=container.resolve(ITrackRepository),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(IMatchStateService, create_match_state_service)

    def create_metadata_service() -> IMetadataService:
        return MetadataService(
            metadata_repository=container.resolve(ITrackMetadataRepository),
            track_repository=container.resolve(ITrackRepository),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(IMetadataService, create_metadata_service)

    # The tag vocabulary and its assignments (DEC-015). The service takes the
    # database service as well as its repository: a tag applied to twelve
    # thousand tracks and the twelve thousand history entries recording it are
    # one transaction, and something has to open it.
    def create_tag_repository() -> ITagRepository:
        container.resolve(IMigrationRunner).migrate()
        return TagRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(ITagRepository, create_tag_repository)

    def create_tag_service() -> ITagService:
        return TagService(
            tag_repository=container.resolve(ITagRepository),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(ITagService, create_tag_service)

    # CuePoint's own collection tree (DEC-006, DEC-059). The repository is
    # resolved by the library service too, because DEC-011's warning before a
    # refresh deletes anything is a question about Collections.
    def create_collection_repository() -> ICollectionRepository:
        container.resolve(IMigrationRunner).migrate()
        return CollectionRepository(
            database_service=container.resolve(IDatabaseService)
        )

    container.register_factory(ICollectionRepository, create_collection_repository)

    # The tree service also takes the library and the activity feed, and both
    # are there for one operation: freezing a Smart Collection has to run its
    # rules to find out what it is storing, and DEC-029 wants one event saying
    # it happened.
    def create_collection_service() -> ICollectionService:
        return CollectionService(
            collection_repository=container.resolve(ICollectionRepository),
            database_service=container.resolve(IDatabaseService),
            track_repository=container.resolve(ITrackRepository),
            activity_service=container.resolve(IActivityService),
        )

    container.register_factory(ICollectionService, create_collection_service)

    # One operation over a selection of any size (ORG-07, DEC-063). It resolves
    # a query selection through the track repository and then delegates every
    # write to the service that owns it, which is why it takes five of them and
    # holds no rules of its own. The database service is the transaction a chunk
    # commits in; no SQL is run here either.
    def create_batch_service() -> IBatchService:
        return BatchService(
            metadata_service=container.resolve(IMetadataService),
            tag_service=container.resolve(ITagService),
            collection_service=container.resolve(ICollectionService),
            track_repository=container.resolve(ITrackRepository),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
            match_state_service=container.resolve(IMatchStateService),
            match_apply_service=container.resolve(IMatchApplyService),
        )

    container.register_factory(IBatchService, create_batch_service)

    # Copying an accepted match's values into CuePoint's layer (CLEAN-05,
    # DEC-068). Separate from deciding, as DEC-004 separates the two acts.
    def create_match_apply_service() -> IMatchApplyService:
        return MatchApplyService(
            match_repository=container.resolve(IMatchRepository),
            metadata_service=container.resolve(IMetadataService),
            track_repository=container.resolve(ITrackRepository),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(IMatchApplyService, create_match_apply_service)

    # Reverting CuePoint's own changes (CLEAN-06, DEC-068). It reads history
    # through the repository and writes every revert through the service that
    # owns the field, which is why it takes three of them: a revert validates
    # and records exactly as the edit it undoes did.
    def create_revert_service() -> IRevertService:
        return RevertService(
            activity_repository=container.resolve(IActivityRepository),
            activity_service=container.resolve(IActivityService),
            metadata_service=container.resolve(IMetadataService),
            tag_service=container.resolve(ITagService),
            match_state_service=container.resolve(IMatchStateService),
            match_repository=container.resolve(IMatchRepository),
            track_repository=container.resolve(ITrackRepository),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(IRevertService, create_revert_service)

    # Library Health (CLEAN-11, DEC-075): counts of rule sets, answered by the
    # count the Library table shows, so a number and its click cannot disagree.
    # When each detection last ran is the activity feed's (CLEAN-12), so Health
    # and the Activity panel say the same thing.
    def create_health_service() -> IHealthService:
        return HealthService(
            track_repository=container.resolve(ITrackRepository),
            activity_repository=container.resolve(IActivityRepository),
            file_status_repository=container.resolve(IFileStatusRepository),
        )

    container.register_factory(IHealthService, create_health_service)

    # "Export review list" (CLEAN-11): a selection resolved through the batch
    # path, read through the rule vocabulary, written by the export service.
    def create_review_export_service() -> IReviewExportService:
        return ReviewExportService(
            batch_service=container.resolve(IBatchService),
            track_repository=container.resolve(ITrackRepository),
            export_service=container.resolve(IExportService),
        )

    container.register_factory(IReviewExportService, create_review_export_service)

    # Checking whether tracks' files are there (CLEAN-07, DEC-073). The check
    # resolves a selection through the batch service, as a match does, so a
    # check and a batch cannot disagree about which tracks a selection names.
    def create_file_status_repository() -> IFileStatusRepository:
        container.resolve(IMigrationRunner).migrate()
        return FileStatusRepository(
            database_service=container.resolve(IDatabaseService)
        )

    container.register_factory(IFileStatusRepository, create_file_status_repository)

    def create_file_check_service() -> IFileCheckService:
        return FileCheckService(
            file_status_repository=container.resolve(IFileStatusRepository),
            batch_service=container.resolve(IBatchService),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(IFileCheckService, create_file_check_service)

    # Possible duplicates and a user's "not duplicates" (CLEAN-08, DEC-074).
    def create_duplicate_repository() -> IDuplicateRepository:
        container.resolve(IMigrationRunner).migrate()
        return DuplicateRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IDuplicateRepository, create_duplicate_repository)

    def create_duplicate_service() -> IDuplicateService:
        return DuplicateService(
            duplicate_repository=container.resolve(IDuplicateRepository),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(IDuplicateService, create_duplicate_service)

    # Artwork from files and Beatport, as bounded thumbnails (CLEAN-09, DEC-076).
    # One cache for the process: its byte count and eviction are shared.
    def create_artwork_repository() -> IArtworkRepository:
        container.resolve(IMigrationRunner).migrate()
        return ArtworkRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IArtworkRepository, create_artwork_repository)

    # One fetch gate and one cache for the engine, so the bound on Beatport
    # requests and the cache's byte count hold across every request thread. The
    # cache follows its directory, which follows CUEPOINT_HOME.
    artwork_gate = FetchGate()
    artwork_caches: list[ArtworkCache] = []
    artwork_cache_lock = threading.Lock()

    def artwork_cache() -> ArtworkCache:
        directory = default_artwork_cache_dir()
        with artwork_cache_lock:
            if not artwork_caches or artwork_caches[0].directory != directory:
                artwork_caches[:] = [ArtworkCache(directory)]
            return artwork_caches[0]

    def create_artwork_service() -> IArtworkService:
        return ArtworkService(
            artwork_repository=container.resolve(IArtworkRepository),
            track_repository=container.resolve(ITrackRepository),
            batch_service=container.resolve(IBatchService),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
            cache=artwork_cache(),
            gate=artwork_gate,
        )

    container.register_factory(IArtworkService, create_artwork_service)

    # Writing tags to files, with a record (CLEAN-10, DEC-070). The one service
    # that writes audio files; the boundary test holds it to that.
    def create_file_write_repository() -> IFileWriteRepository:
        container.resolve(IMigrationRunner).migrate()
        return FileWriteRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IFileWriteRepository, create_file_write_repository)

    def create_tag_write_service() -> ITagWriteService:
        return TagWriteService(
            file_write_repository=container.resolve(IFileWriteRepository),
            file_status_repository=container.resolve(IFileStatusRepository),
            artwork_repository=container.resolve(IArtworkRepository),
            artwork_service=container.resolve(IArtworkService),
            batch_service=container.resolve(IBatchService),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(ITagWriteService, create_tag_write_service)

    # The Rekordbox export (EXPORT-04, EXPORT-05, DEC-084). Five reads make the
    # preview: the source file and its recorded state, both value layers for
    # every track, CuePoint's tree with each Collection's own order, a Smart
    # Collection resolved live through the service that owns that rule, and what
    # the last file check found. The export walks the same plan and writes it,
    # which is what keeps the preview and the result one accounting, then
    # records the row (DEC-086) and the event (DEC-029) in one transaction.
    def create_rekordbox_export_repository() -> IRekordboxExportRepository:
        container.resolve(IMigrationRunner).migrate()
        return RekordboxExportRepository(
            database_service=container.resolve(IDatabaseService)
        )

    container.register_factory(
        IRekordboxExportRepository, create_rekordbox_export_repository
    )

    def create_rekordbox_export_service() -> IRekordboxExportService:
        return RekordboxExportService(
            track_repository=container.resolve(ITrackRepository),
            collection_repository=container.resolve(ICollectionRepository),
            collection_service=container.resolve(ICollectionService),
            library_source_repository=container.resolve(ILibrarySourceRepository),
            file_status_repository=container.resolve(IFileStatusRepository),
            export_repository=container.resolve(IRekordboxExportRepository),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
        )

    container.register_factory(IRekordboxExportService, create_rekordbox_export_service)

    # Matching library tracks as a resumable job (CLEAN-03, DEC-065). It takes
    # the batch service for one thing, resolving a selection, so a match and a
    # batch cannot disagree about which tracks a selection names; and the
    # processor for another, ``process_track``, which is the whole of matching.
    # The database service is the transaction an attempt and its plan row
    # commit in; no SQL is run here.
    def create_match_service() -> IMatchService:
        return MatchService(
            processor_service=container.resolve(IProcessorService),
            config_service=container.resolve(IConfigService),
            track_repository=container.resolve(ITrackRepository),
            match_repository=container.resolve(IMatchRepository),
            match_job_repository=container.resolve(IMatchJobRepository),
            batch_service=container.resolve(IBatchService),
            activity_service=container.resolve(IActivityService),
            database_service=container.resolve(IDatabaseService),
            state_rule=container.resolve(IMatchStateService).apply_attempt,
        )

    container.register_factory(IMatchService, create_match_service)

    # Library database backups (DEC-009). Resolving this does not open the
    # database or write anything; backup_on_launch() is called explicitly.
    def create_backup_service() -> IBackupService:
        return BackupService(
            database_service=container.resolve(IDatabaseService),
            config_service=container.resolve(IConfigService),
        )

    container.register_factory(IBackupService, create_backup_service)

    # Register matcher service (no dependencies)
    matcher_service = MatcherService()
    container.register_singleton(IMatcherService, matcher_service)

    # Register Beatport service (depends on cache, logging, config for Design 5.1 retry)
    def create_beatport_service() -> IBeatportService:
        return BeatportService(
            cache_service=container.resolve(ICacheService),
            logging_service=container.resolve(ILoggingService),
            config_service=container.resolve(IConfigService),
        )

    container.register_factory(IBeatportService, create_beatport_service)

    # inCrate Phase 2: Beatport API client for charts/labels (discovery)
    def create_beatport_api() -> BeatportApi:
        cfg = config_service
        base_url = (
            cfg.get("incrate.beatport_api_base_url") or "https://api.beatport.com/v4"
        ).strip()
        token = (
            os.environ.get("BEATPORT_ACCESS_TOKEN")
            or cfg.get("incrate.beatport_access_token")
            or ""
        ).strip()
        timeout = int(cfg.get("incrate.beatport_api_timeout") or 30)
        client = BeatportApiClient(
            base_url=base_url, access_token=token, timeout=timeout
        )
        return BeatportApi(client=client, cache_service=cache_service)

    container.register_factory(BeatportApi, create_beatport_api)

    # inCrate Phase 1: Inventory service (import from XML, enrich via shared matching pipeline + workers)
    def create_inventory_service() -> InventoryService:
        raw = config_service.get("incrate.inventory_db_path")
        db_path = (raw and str(raw).strip()) or default_inventory_db_path()
        return InventoryService(
            db_path=db_path,
            config_service=config_service,
            beatport_service=container.resolve(IBeatportService),
            logging_service=container.resolve(ILoggingService),
            processor_service=container.resolve(IProcessorService),
        )

    # Registered under both the interface and the concrete class: existing
    # callers (e.g. engine/incrate_api.py) resolve by concrete class.
    container.register_factory(InventoryService, create_inventory_service)
    container.register_factory(IInventoryService, create_inventory_service)

    # inCrate Phase 3: Discovery (charts + label releases)
    def create_incrate_discovery_service() -> IncrateDiscoveryService:
        return IncrateDiscoveryService(
            inventory_service=container.resolve(InventoryService),
            beatport_api=container.resolve(BeatportApi),
            config_service=config_service,
        )

    container.register_factory(
        IncrateDiscoveryService, create_incrate_discovery_service
    )
    container.register_factory(
        IIncrateDiscoveryService, create_incrate_discovery_service
    )

    # Register processor service (depends on beatport, matcher, logging, config)
    def create_processor_service() -> IProcessorService:
        return ProcessorService(
            beatport_service=container.resolve(IBeatportService),
            matcher_service=container.resolve(IMatcherService),
            logging_service=container.resolve(ILoggingService),
            config_service=container.resolve(IConfigService),
        )

    container.register_factory(IProcessorService, create_processor_service)

    # Register export service (depends on logging)
    def create_export_service() -> IExportService:
        return ExportService(logging_service=container.resolve(ILoggingService))

    container.register_factory(IExportService, create_export_service)

    # Step 14: Telemetry service (opt-in analytics)
    def create_telemetry_service() -> ITelemetryService:
        return TelemetryService(
            config_service=container.resolve(IConfigService),
            logging_service=container.resolve(ILoggingService),
        )

    container.register_factory(ITelemetryService, create_telemetry_service)

    # Step 8.4 / 9.4: Privacy preferences and onboarding state.
    # Both persist through ConfigService (no GUI toolkit dependency).
    def create_privacy_service() -> IPrivacyService:
        return PrivacyService(config_service=container.resolve(IConfigService))

    container.register_factory(IPrivacyService, create_privacy_service)

    def create_onboarding_service() -> IOnboardingService:
        return OnboardingService(config_service=container.resolve(IConfigService))

    container.register_factory(IOnboardingService, create_onboarding_service)

    # Design 7: Opt-in alerting for repeated failures
    try:
        if config_service.get("observability.alert_on_repeated_failures", False):
            import logging

            from cuepoint.utils.alerting import register_alert_hook

            _logger = logging.getLogger(__name__)

            def _log_alert(service: str, count: int, detail: str) -> None:
                _logger.warning(
                    "[observability] Repeated failures: %s (%d) - %s",
                    service,
                    count,
                    detail or "",
                )

            register_alert_hook(_log_alert)
    except Exception:
        pass

    # Last, so that only a container that got all of the above is treated as
    # wired and skipped by the next call.
    container.register_singleton(_Bootstrapped, _Bootstrapped())
