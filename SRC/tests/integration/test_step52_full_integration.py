#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Full integration tests for Step 5.2.

Tests the complete flow from entry point → bootstrap → DI → controller → service.
"""

import os
import tempfile

import pytest

from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import IProcessorService
from cuepoint.ui.controllers.main_controller import ProcessingWorker
from cuepoint.utils.di_container import get_container, reset_container


class TestStep52FullIntegration:
    """Full integration tests for Step 5.2."""

    def setup_method(self):
        """Set up test environment."""
        reset_container()
        bootstrap_services()

    def test_bootstrap_registers_all_services(self):
        """Test that bootstrap registers all required services."""
        container = get_container()

        # Verify all services are registered
        from cuepoint.services.interfaces import (
            IBeatportService,
            ICacheService,
            IConfigService,
            IExportService,
            ILoggingService,
            IMatcherService,
            IProcessorService,
        )

        assert container.is_registered(ILoggingService)
        assert container.is_registered(IConfigService)
        assert container.is_registered(ICacheService)
        assert container.is_registered(IMatcherService)
        assert container.is_registered(IBeatportService)
        assert container.is_registered(IProcessorService)
        assert container.is_registered(IExportService)

    def test_processor_service_dependencies_injected(self):
        """Test that ProcessorService has all dependencies injected."""
        from cuepoint.services.interfaces import (
            IBeatportService,
            IConfigService,
            ILoggingService,
            IMatcherService,
        )

        container = get_container()
        processor_service = container.resolve(IProcessorService)

        # Verify dependencies
        assert processor_service.beatport_service is not None
        assert processor_service.matcher_service is not None
        assert processor_service.logging_service is not None
        assert processor_service.config_service is not None

        # Verify dependencies are also services
        assert isinstance(processor_service.beatport_service, IBeatportService)
        assert isinstance(processor_service.matcher_service, IMatcherService)
        assert isinstance(processor_service.logging_service, ILoggingService)
        assert isinstance(processor_service.config_service, IConfigService)

    def test_beatport_service_dependencies_injected(self):
        """Test that BeatportService has dependencies injected."""
        from cuepoint.services.interfaces import IBeatportService

        container = get_container()
        processor_service = container.resolve(IProcessorService)
        beatport_service = processor_service.beatport_service

        # BeatportService should have cache and logging
        assert hasattr(beatport_service, "cache_service")
        assert hasattr(beatport_service, "logging_service")

    def test_processing_worker_can_resolve_service(self):
        """Test that ProcessingWorker can resolve ProcessorService."""
        # Create a temporary XML file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS>
    <COLLECTION>
        <TRACK TrackID="1" Name="Test Track" Artist="Test Artist"/>
    </COLLECTION>
    <PLAYLISTS>
        <NODE Name="ROOT">
            <NODE Name="Test Playlist">
                <TRACK TrackID="1"/>
            </NODE>
        </NODE>
    </PLAYLISTS>
</DJ_PLAYLISTS>"""
            f.write(xml_content)
            xml_path = f.name

        try:
            # Create worker
            worker = ProcessingWorker(
                xml_path=xml_path,
                playlist_name="Test Playlist",
            )

            # Simulate what happens in worker.run() - resolve service
            container = get_container()
            processor_service = container.resolve(IProcessorService)

            # Verify service is resolved
            assert processor_service is not None
            assert hasattr(processor_service, "process_playlist_from_xml")

        finally:
            os.unlink(xml_path)

    def test_service_singletons(self):
        """Test that singleton services return same instance."""
        from cuepoint.services.interfaces import ILoggingService

        container = get_container()
        processor_service = container.resolve(IProcessorService)

        # Logging service should be singleton
        logging1 = container.resolve(ILoggingService)
        logging2 = container.resolve(ILoggingService)
        # Verify they are the same instance
        assert logging1 is logging2
        # Verify processor service uses the same instance
        assert processor_service.logging_service is logging1

    def test_factory_services_create_new_instances(self):
        """Test that factory services can create new instances."""
        container = get_container()

        # Processor service uses factory, so each resolve should work
        processor1 = container.resolve(IProcessorService)
        processor2 = container.resolve(IProcessorService)

        # They might be different instances, but should both work
        assert processor1 is not None
        assert processor2 is not None
        assert hasattr(processor1, "process_playlist_from_xml")
        assert hasattr(processor2, "process_playlist_from_xml")

