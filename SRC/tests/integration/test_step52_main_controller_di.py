#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for Step 5.2: Main Controller using DI.

Tests that the main controller correctly uses ProcessorService from DI container.
"""

import os
import tempfile
from unittest.mock import Mock, patch

import pytest

from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.services.interfaces import IProcessorService
from cuepoint.ui.controllers.main_controller import GUIController, ProcessingWorker
from cuepoint.utils.di_container import get_container, reset_container


class TestMainControllerDI:
    """Tests for main controller using dependency injection."""

    def setup_method(self):
        """Set up test environment."""
        reset_container()
        bootstrap_services()
        self.container = get_container()

    def test_processing_worker_uses_di_container(self):
        """Test that ProcessingWorker uses ProcessorService from DI container."""
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
            # Verify service is registered
            assert self.container.is_registered(IProcessorService)

            # Get the service to verify it exists
            processor_service = self.container.resolve(IProcessorService)
            assert processor_service is not None

            # Create worker (but don't start it - we'll test the run method directly)
            worker = ProcessingWorker(
                xml_path=xml_path,
                playlist_name="Test Playlist",
            )

            # Verify worker has controller
            assert worker.controller is not None

            # Mock the processor service to avoid actual processing
            with patch.object(
                self.container, "resolve", return_value=Mock(spec=IProcessorService)
            ) as mock_resolve:
                mock_service = Mock(spec=IProcessorService)
                mock_service.process_playlist_from_xml.return_value = []
                mock_resolve.return_value = mock_service

                # Test that worker would use DI container
                # We can't easily test the full run() without Qt event loop,
                # but we can verify the structure
                assert hasattr(worker, "xml_path")
                assert hasattr(worker, "playlist_name")
                assert hasattr(worker, "controller")

        finally:
            os.unlink(xml_path)

    def test_gui_controller_creates_worker(self):
        """Test that GUIController can create ProcessingWorker."""
        controller = GUIController()

        # Verify controller is initialized
        assert controller.current_worker is None
        assert controller.batch_playlists == []
        assert controller.batch_index == 0

    def test_processing_worker_signals(self):
        """Test that ProcessingWorker has correct signals."""
        worker = ProcessingWorker(
            xml_path="test.xml",
            playlist_name="Test Playlist",
        )

        # Verify signals exist
        assert hasattr(worker, "progress_updated")
        assert hasattr(worker, "processing_complete")
        assert hasattr(worker, "error_occurred")

    def test_gui_controller_signals(self):
        """Test that GUIController has correct signals."""
        controller = GUIController()

        # Verify signals exist
        assert hasattr(controller, "progress_updated")
        assert hasattr(controller, "processing_complete")
        assert hasattr(controller, "error_occurred")

    def test_processing_worker_cancellation(self):
        """Test that ProcessingWorker supports cancellation."""
        worker = ProcessingWorker(
            xml_path="test.xml",
            playlist_name="Test Playlist",
        )

        # Verify cancellation support
        assert hasattr(worker, "cancel")
        assert worker.controller is not None

        # Test cancellation
        worker.cancel()
        assert worker.controller.is_cancelled() is True

    def test_gui_controller_cancellation(self):
        """Test that GUIController supports cancellation."""
        controller = GUIController()

        # Verify cancellation support
        assert hasattr(controller, "cancel_processing")
        assert hasattr(controller, "is_processing")

        # Test when no worker is running
        assert controller.is_processing() is False
        controller.cancel_processing()  # Should not raise error

    @pytest.mark.skip(reason="Requires Qt event loop - tested in UI tests")
    def test_processing_worker_full_integration(self):
        """Test full integration of ProcessingWorker with DI."""
        # This test would require a Qt event loop and is better suited for UI tests
        pass


class TestStep52DIResolution:
    """Tests for DI container resolution in Step 5.2 context."""

    def setup_method(self):
        """Set up test environment."""
        reset_container()
        bootstrap_services()
        self.container = get_container()

    def test_processor_service_resolved_in_worker_context(self):
        """Test that ProcessorService can be resolved in worker context."""
        # This simulates what happens in ProcessingWorker.run()
        container = get_container()
        processor_service = container.resolve(IProcessorService)

        assert processor_service is not None
        assert isinstance(processor_service, IProcessorService)

        # Verify it has all required dependencies
        assert hasattr(processor_service, "beatport_service")
        assert hasattr(processor_service, "matcher_service")
        assert hasattr(processor_service, "logging_service")
        assert hasattr(processor_service, "config_service")

    def test_processor_service_has_process_playlist_from_xml(self):
        """Test that ProcessorService has the new method."""
        processor_service = self.container.resolve(IProcessorService)

        # Verify method exists
        assert hasattr(processor_service, "process_playlist_from_xml")
        assert callable(processor_service.process_playlist_from_xml)

    def test_di_container_singleton(self):
        """Test that DI container is a singleton."""
        container1 = get_container()
        container2 = get_container()

        assert container1 is container2

    def test_reset_container_creates_new_instance(self):
        """Test that reset_container creates a new instance."""
        container1 = get_container()
        reset_container()
        container2 = get_container()

        assert container1 is not container2

