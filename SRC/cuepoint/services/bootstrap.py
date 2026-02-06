#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Service Bootstrap

Bootstrap function to register all services with the DI container.
This should be called at application startup.
"""

from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.cache_service import CacheService
from cuepoint.services.config_service import ConfigService
from cuepoint.services.export_service import ExportService
from cuepoint.services.interfaces import (
    IBeatportService,
    ICacheService,
    IConfigService,
    IExportService,
    ILoggingService,
    IMatcherService,
    IProcessorService,
    ITelemetryService,
)
from cuepoint.services.logging_service import LoggingService
from cuepoint.services.matcher_service import MatcherService
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
        pass
