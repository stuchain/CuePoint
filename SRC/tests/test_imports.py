#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Integration test: service import smoke test (Step 5.2)."""

from __future__ import annotations


def test_step52_imports_smoke() -> None:
    from cuepoint.utils.di_container import DIContainer, get_container, reset_container

    container = DIContainer()
    assert container is not None

    reset_container()
    container = get_container()
    assert container is not None

    from cuepoint.services.cache_service import CacheEntry, CacheService
    assert CacheEntry is not None
    cache = CacheService()
    assert cache is not None

    from cuepoint.services.logging_service import LoggingService
    assert LoggingService is not None

    from cuepoint.services.config_service import ConfigService
    assert ConfigService is not None

    from cuepoint.services.export_service import ExportService
    assert ExportService is not None

    from cuepoint.services.matcher_service import MatcherService
    assert MatcherService is not None

    from cuepoint.services.beatport_service import BeatportService
    assert BeatportService is not None

    from cuepoint.services.processor_service import ProcessorService
    assert ProcessorService is not None

    from cuepoint.services.bootstrap import bootstrap_services
    assert callable(bootstrap_services)

