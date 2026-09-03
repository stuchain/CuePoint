#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Service Bootstrap

Bootstrap function to register all services with the DI container.
This should be called at application startup.
"""

import os

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
    IActivityRepository,
    IActivityService,
    IBackupService,
    IBeatportService,
    ICacheService,
    IConfigService,
    IDatabaseService,
    IExportService,
    IIncrateDiscoveryService,
    IJobRepository,
    ILibraryService,
    IInventoryService,
    ILoggingService,
    IMatcherService,
    IMigrationRunner,
    IOnboardingService,
    IPrivacyService,
    IProcessorService,
    ITelemetryService,
    ILibraryImportService,
    ILibrarySourceRepository,
    IPlaylistRepository,
    ITrackRepository,
)
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.matcher_service import MatcherService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.onboarding_service import OnboardingService
from cuepoint.services.privacy_service import PrivacyService
from cuepoint.persistence.activity_repository import ActivityRepository
from cuepoint.persistence.job_repository import JobRepository
from cuepoint.persistence.library_source_repository import (
    LibrarySourceRepository,
)
from cuepoint.persistence.playlist_repository import PlaylistRepository
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.activity_service import ActivityService
from cuepoint.services.backup_service import BackupService
from cuepoint.services.library_service import LibraryService
from cuepoint.services.processor_service import ProcessorService
from cuepoint.services.telemetry_service import TelemetryService
from cuepoint.utils.di_container import get_container


def bootstrap_services() -> None:
    """Register all services with the DI container."""
    container = get_container()

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

    def create_playlist_repository() -> IPlaylistRepository:
        """Build the mirrored Rekordbox playlist tree repository."""
        return PlaylistRepository(database_service=container.resolve(IDatabaseService))

    container.register_factory(IPlaylistRepository, create_playlist_repository)

    def create_library_source_repository() -> ILibrarySourceRepository:
        """Build the DEC-035 source-record repository."""
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
            activity_service=container.resolve(IActivityService),
            # DEC-011's reference check. Resolved here so a refresh diff always
            # asks the real seam rather than falling back to a local zero.
            library_service=container.resolve(ILibraryService),
        )

    container.register_factory(ILibraryImportService, create_library_import_service)

    # Library entry point. Callers depend on this rather than on repositories,
    # so persistence details stay behind the seam.
    def create_library_service() -> ILibraryService:
        return LibraryService(track_repository=container.resolve(ITrackRepository))

    container.register_factory(ILibraryService, create_library_service)

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

    # inCrate Phase 1: Inventory service (import from XML, enrich via full inKey pipeline + workers)
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
