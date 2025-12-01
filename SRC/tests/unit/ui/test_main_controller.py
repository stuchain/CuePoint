#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for main_controller module."""

import os
import tempfile
from unittest.mock import Mock, patch, MagicMock

import pytest
from PySide6.QtCore import QObject

from cuepoint.models.result import TrackResult
from cuepoint.ui.controllers.main_controller import GUIController, ProcessingWorker
from cuepoint.ui.gui_interface import ErrorType, ProcessingError, ProgressInfo


@pytest.fixture
def mock_processor_service():
    """Create a mock processor service."""
    service = Mock()
    service.process_playlist_from_xml = Mock(return_value=[])
    return service


@pytest.fixture
def sample_track_results():
    """Create sample TrackResult objects for testing."""
    return [
        TrackResult(
            playlist_index=0,
            title="Test Track 1",
            artist="Test Artist 1",
            matched=True,
            beatport_url="https://www.beatport.com/track/test1/123",
        ),
        TrackResult(
            playlist_index=1,
            title="Test Track 2",
            artist="Test Artist 2",
            matched=False,
        ),
    ]


@pytest.fixture
def sample_xml_file():
    """Create a temporary XML file for testing."""
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
    with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
        f.write(xml_content)
        xml_path = f.name
    
    yield xml_path
    
    # Cleanup
    if os.path.exists(xml_path):
        os.unlink(xml_path)


@pytest.mark.unit
class TestProcessingWorker:
    """Test ProcessingWorker class."""

    @patch('cuepoint.ui.controllers.main_controller.get_container')
    def test_processing_worker_run_success(self, mock_get_container, sample_xml_file, sample_track_results):
        """Test ProcessingWorker.run() with successful processing - lines 112-133."""
        # Setup mock container and processor service
        mock_container = Mock()
        mock_processor = Mock()
        mock_processor.process_playlist_from_xml = Mock(return_value=sample_track_results)
        mock_container.resolve = Mock(return_value=mock_processor)
        mock_get_container.return_value = mock_container

        # Create worker and connect signals
        worker = ProcessingWorker(
            xml_path=sample_xml_file,
            playlist_name="Test Playlist",
            settings=None,
            auto_research=False,
        )
        
        # Track signal emissions
        progress_calls = []
        complete_calls = []
        error_calls = []
        
        def on_progress(progress_info):
            progress_calls.append(progress_info)
        
        def on_complete(results):
            complete_calls.append(results)
        
        def on_error(error):
            error_calls.append(error)
        
        worker.progress_updated.connect(on_progress)
        worker.processing_complete.connect(on_complete)
        worker.error_occurred.connect(on_error)
        
        # Run worker
        worker.run()
        
        # Verify processor was called correctly
        mock_processor.process_playlist_from_xml.assert_called_once()
        call_kwargs = mock_processor.process_playlist_from_xml.call_args[1]
        assert call_kwargs['xml_path'] == sample_xml_file
        assert call_kwargs['playlist_name'] == "Test Playlist"
        assert call_kwargs['auto_research'] is False
        
        # Verify completion signal was emitted
        assert len(complete_calls) == 1
        assert complete_calls[0] == sample_track_results
        assert len(error_calls) == 0

    @patch('cuepoint.ui.controllers.main_controller.get_container')
    def test_processing_worker_run_processing_error(self, mock_get_container, sample_xml_file):
        """Test ProcessingWorker.run() with ProcessingError - lines 135-137."""
        # Setup mock container and processor service
        mock_container = Mock()
        mock_processor = Mock()
        processing_error = ProcessingError(
            error_type=ErrorType.PROCESSING_ERROR,
            message="Test error",
            details="Test details",
            suggestions=["Suggestion 1"],
            recoverable=True,
        )
        mock_processor.process_playlist_from_xml = Mock(side_effect=processing_error)
        mock_container.resolve = Mock(return_value=mock_processor)
        mock_get_container.return_value = mock_container

        # Create worker
        worker = ProcessingWorker(
            xml_path=sample_xml_file,
            playlist_name="Test Playlist",
        )
        
        # Track error signal
        error_calls = []
        worker.error_occurred.connect(lambda e: error_calls.append(e))
        
        # Run worker
        worker.run()
        
        # Verify error signal was emitted
        assert len(error_calls) == 1
        assert error_calls[0] == processing_error

    @patch('cuepoint.ui.controllers.main_controller.get_container')
    def test_processing_worker_run_unexpected_error(self, mock_get_container, sample_xml_file):
        """Test ProcessingWorker.run() with unexpected exception - lines 138-151."""
        # Setup mock container and processor service
        mock_container = Mock()
        mock_processor = Mock()
        mock_processor.process_playlist_from_xml = Mock(side_effect=ValueError("Unexpected error"))
        mock_container.resolve = Mock(return_value=mock_processor)
        mock_get_container.return_value = mock_container

        # Create worker
        worker = ProcessingWorker(
            xml_path=sample_xml_file,
            playlist_name="Test Playlist",
        )
        
        # Track error signal
        error_calls = []
        worker.error_occurred.connect(lambda e: error_calls.append(e))
        
        # Run worker
        worker.run()
        
        # Verify error signal was emitted with converted ProcessingError
        assert len(error_calls) == 1
        error = error_calls[0]
        assert isinstance(error, ProcessingError)
        assert error.error_type == ErrorType.PROCESSING_ERROR
        assert "Unexpected error" in error.message
        assert error.recoverable is True

    def test_processing_worker_cancel(self):
        """Test ProcessingWorker.cancel() - lines 153-159."""
        worker = ProcessingWorker(
            xml_path="test.xml",
            playlist_name="Test Playlist",
        )
        
        # Verify controller exists
        assert worker.controller is not None
        
        # Cancel should set cancellation flag
        worker.cancel()
        
        # Verify controller was cancelled
        assert worker.controller.is_cancelled() is True


@pytest.mark.unit
class TestGUIController:
    """Test GUIController class."""

    def test_gui_controller_init(self):
        """Test GUIController.__init__()."""
        controller = GUIController()
        
        assert controller.current_worker is None
        assert controller.batch_playlists == []
        assert controller.batch_index == 0
        assert controller.batch_xml_path == ""
        assert controller.batch_settings is None
        assert controller.batch_auto_research is False

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_start_processing_creates_worker(self, mock_worker_class, sample_xml_file):
        """Test GUIController.start_processing() creates worker - lines 240-258."""
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=False)
        mock_worker_class.return_value = mock_worker
        
        controller = GUIController()
        controller.start_processing(
            xml_path=sample_xml_file,
            playlist_name="Test Playlist",
            settings={"max_candidates": 10},
            auto_research=True,
        )
        
        # Verify worker was created
        mock_worker_class.assert_called_once()
        call_kwargs = mock_worker_class.call_args[1]
        assert call_kwargs['xml_path'] == sample_xml_file
        assert call_kwargs['playlist_name'] == "Test Playlist"
        assert call_kwargs['settings'] == {"max_candidates": 10}
        assert call_kwargs['auto_research'] is True
        
        # Verify signals were connected
        assert mock_worker.progress_updated.connect.called
        assert mock_worker.processing_complete.connect.called
        assert mock_worker.error_occurred.connect.called
        
        # Verify worker was started
        mock_worker.start.assert_called_once()

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_start_processing_cancels_existing(self, mock_worker_class, sample_xml_file):
        """Test GUIController.start_processing() cancels existing worker - lines 240-241."""
        # Create controller with existing worker
        controller = GUIController()
        existing_worker = Mock()
        existing_worker.isRunning = Mock(return_value=True)
        controller.current_worker = existing_worker
        
        # Mock cancel_processing
        controller.cancel_processing = Mock()
        
        # Create new worker
        new_worker = Mock()
        new_worker.isRunning = Mock(return_value=False)
        mock_worker_class.return_value = new_worker
        
        controller.start_processing(
            xml_path=sample_xml_file,
            playlist_name="Test Playlist",
        )
        
        # Verify existing worker was cancelled
        controller.cancel_processing.assert_called_once()

    def test_cancel_processing_with_running_worker(self):
        """Test GUIController.cancel_processing() with running worker - lines 267-277."""
        controller = GUIController()
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=True)
        mock_worker.wait = Mock(return_value=True)  # Worker finishes quickly
        mock_worker.cancel = Mock()
        controller.current_worker = mock_worker
        
        controller.cancel_processing()
        
        # Verify cancellation was requested
        mock_worker.cancel.assert_called_once()
        # Verify wait was called
        mock_worker.wait.assert_called_once_with(5000)
        # Verify worker was cleared
        assert controller.current_worker is None

    def test_cancel_processing_with_timeout(self):
        """Test GUIController.cancel_processing() with timeout - lines 272-275."""
        controller = GUIController()
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=True)
        mock_worker.wait = Mock(return_value=False)  # Worker doesn't finish
        mock_worker.cancel = Mock()
        mock_worker.terminate = Mock()
        controller.current_worker = mock_worker
        
        controller.cancel_processing()
        
        # Verify termination was called
        mock_worker.terminate.assert_called_once()
        # Verify second wait was called
        assert mock_worker.wait.call_count == 2

    def test_cancel_processing_no_worker(self):
        """Test GUIController.cancel_processing() with no worker."""
        controller = GUIController()
        controller.current_worker = None
        
        # Should not raise exception
        controller.cancel_processing()
        assert controller.current_worker is None

    def test_is_processing(self):
        """Test GUIController.is_processing()."""
        controller = GUIController()
        
        # No worker
        assert controller.is_processing() is False
        
        # Worker not running
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=False)
        controller.current_worker = mock_worker
        assert controller.is_processing() is False
        
        # Worker running
        mock_worker.isRunning = Mock(return_value=True)
        assert controller.is_processing() is True

    def test_wait_for_completion_with_worker(self):
        """Test GUIController.wait_for_completion() with worker - lines 297-299."""
        controller = GUIController()
        mock_worker = Mock()
        mock_worker.wait = Mock(return_value=True)
        controller.current_worker = mock_worker
        
        result = controller.wait_for_completion(timeout=10000)
        
        assert result is True
        mock_worker.wait.assert_called_once_with(10000)

    def test_wait_for_completion_no_worker(self):
        """Test GUIController.wait_for_completion() with no worker."""
        controller = GUIController()
        controller.current_worker = None
        
        result = controller.wait_for_completion()
        
        assert result is True

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_start_batch_processing(self, mock_worker_class, sample_xml_file):
        """Test GUIController.start_batch_processing() - lines 320-334."""
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=False)
        mock_worker_class.return_value = mock_worker
        
        controller = GUIController()
        controller.cancel_processing = Mock()
        
        controller.start_batch_processing(
            xml_path=sample_xml_file,
            playlist_names=["Playlist 1", "Playlist 2", "Playlist 3"],
            settings={"max_candidates": 10},
            auto_research=True,
        )
        
        # Verify batch state was set
        assert controller.batch_playlists == ["Playlist 1", "Playlist 2", "Playlist 3"]
        assert controller.batch_index == 0
        assert controller.batch_xml_path == sample_xml_file
        assert controller.batch_settings == {"max_candidates": 10}
        assert controller.batch_auto_research is True
        assert controller.last_completed_playlist_name is None
        
        # Verify first playlist processing was started
        mock_worker_class.assert_called_once()
        call_kwargs = mock_worker_class.call_args[1]
        assert call_kwargs['playlist_name'] == "Playlist 1"

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_start_batch_processing_empty_list(self, mock_worker_class, sample_xml_file):
        """Test GUIController.start_batch_processing() with empty playlist list."""
        controller = GUIController()
        controller.cancel_processing = Mock()
        
        controller.start_batch_processing(
            xml_path=sample_xml_file,
            playlist_names=[],
        )
        
        # Verify batch state was set but no worker created
        assert controller.batch_playlists == []
        mock_worker_class.assert_not_called()

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_process_next_playlist(self, mock_worker_class, sample_xml_file):
        """Test GUIController._process_next_playlist() - lines 342-363."""
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=False)
        mock_worker_class.return_value = mock_worker
        
        controller = GUIController()
        controller.batch_playlists = ["Playlist 1", "Playlist 2"]
        controller.batch_index = 0
        controller.batch_xml_path = sample_xml_file
        
        controller._process_next_playlist()
        
        # Verify worker was created for first playlist
        mock_worker_class.assert_called_once()
        call_kwargs = mock_worker_class.call_args[1]
        assert call_kwargs['playlist_name'] == "Playlist 1"
        assert controller.current_batch_playlist_name == "Playlist 1"
        
        # Verify signals were connected
        assert mock_worker.progress_updated.connect.called
        assert mock_worker.processing_complete.connect.called
        assert mock_worker.error_occurred.connect.called
        
        # Verify worker was started
        mock_worker.start.assert_called_once()

    def test_process_next_playlist_index_out_of_range(self):
        """Test GUIController._process_next_playlist() when index >= len(playlists) - line 342-343."""
        controller = GUIController()
        controller.batch_playlists = ["Playlist 1"]
        controller.batch_index = 1  # Out of range
        
        # Should return early without creating worker
        controller._process_next_playlist()
        
        assert controller.current_worker is None

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_on_batch_playlist_complete_continues_batch(self, mock_worker_class, sample_xml_file, sample_track_results):
        """Test GUIController._on_batch_playlist_complete() continues batch - lines 376-386."""
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=False)
        mock_worker_class.return_value = mock_worker
        
        controller = GUIController()
        controller.batch_playlists = ["Playlist 1", "Playlist 2"]
        controller.batch_index = 0
        controller.current_batch_playlist_name = "Playlist 1"
        controller.batch_xml_path = sample_xml_file
        
        # Track signal emissions using signal.connect
        complete_calls = []
        def on_complete(results):
            complete_calls.append(results)
        controller.processing_complete.connect(on_complete)
        
        # Process first playlist completion
        controller._on_batch_playlist_complete(sample_track_results)
        
        # Verify completion signal was emitted
        assert len(complete_calls) == 1
        assert complete_calls[0] == sample_track_results
        
        # Verify batch index was incremented
        assert controller.batch_index == 1
        assert controller.last_completed_playlist_name == "Playlist 1"
        
        # Verify next playlist processing was started
        mock_worker_class.assert_called_once()
        call_kwargs = mock_worker_class.call_args[1]
        assert call_kwargs['playlist_name'] == "Playlist 2"

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_on_batch_playlist_complete_batch_finished(self, mock_worker_class, sample_xml_file, sample_track_results):
        """Test GUIController._on_batch_playlist_complete() when batch finished - lines 387-391."""
        controller = GUIController()
        controller.batch_playlists = ["Playlist 1"]
        controller.batch_index = 0
        controller.current_batch_playlist_name = "Playlist 1"
        controller.current_worker = Mock()
        
        # Track signal emissions using signal.connect
        complete_calls = []
        def on_complete(results):
            complete_calls.append(results)
        controller.processing_complete.connect(on_complete)
        
        # Process last playlist completion
        controller._on_batch_playlist_complete(sample_track_results)
        
        # Verify completion signal was emitted
        assert len(complete_calls) == 1
        
        # Verify batch state was cleared
        assert controller.current_worker is None
        assert controller.current_batch_playlist_name is None
        assert controller.last_completed_playlist_name is None
        
        # Verify no new worker was created
        mock_worker_class.assert_not_called()

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_on_batch_playlist_error_continues_batch(self, mock_worker_class, sample_xml_file):
        """Test GUIController._on_batch_playlist_error() continues batch - lines 404-414."""
        mock_worker = Mock()
        mock_worker.isRunning = Mock(return_value=False)
        mock_worker_class.return_value = mock_worker
        
        error = ProcessingError(
            error_type=ErrorType.PROCESSING_ERROR,
            message="Test error",
            details="Test details",
            suggestions=[],
            recoverable=True,
        )
        
        controller = GUIController()
        controller.batch_playlists = ["Playlist 1", "Playlist 2"]
        controller.batch_index = 0
        controller.current_batch_playlist_name = "Playlist 1"
        controller.batch_xml_path = sample_xml_file
        
        # Track signal emissions using signal.connect
        error_calls = []
        def on_error(error):
            error_calls.append(error)
        controller.error_occurred.connect(on_error)
        
        # Process first playlist error
        controller._on_batch_playlist_error(error)
        
        # Verify error signal was emitted
        assert len(error_calls) == 1
        assert error_calls[0] == error
        
        # Verify batch index was incremented
        assert controller.batch_index == 1
        assert controller.last_completed_playlist_name == "Playlist 1"
        
        # Verify next playlist processing was started
        mock_worker_class.assert_called_once()
        call_kwargs = mock_worker_class.call_args[1]
        assert call_kwargs['playlist_name'] == "Playlist 2"

    @patch('cuepoint.ui.controllers.main_controller.ProcessingWorker')
    def test_on_batch_playlist_error_batch_finished(self, mock_worker_class, sample_xml_file):
        """Test GUIController._on_batch_playlist_error() when batch finished - lines 415-419."""
        error = ProcessingError(
            error_type=ErrorType.PROCESSING_ERROR,
            message="Test error",
            details="Test details",
            suggestions=[],
            recoverable=True,
        )
        
        controller = GUIController()
        controller.batch_playlists = ["Playlist 1"]
        controller.batch_index = 0
        controller.current_batch_playlist_name = "Playlist 1"
        controller.current_worker = Mock()
        
        # Track signal emissions using signal.connect
        error_calls = []
        def on_error(error):
            error_calls.append(error)
        controller.error_occurred.connect(on_error)
        
        # Process last playlist error
        controller._on_batch_playlist_error(error)
        
        # Verify error signal was emitted
        assert len(error_calls) == 1
        
        # Verify batch state was cleared
        assert controller.current_worker is None
        assert controller.current_batch_playlist_name is None
        assert controller.last_completed_playlist_name is None
        
        # Verify no new worker was created
        mock_worker_class.assert_not_called()

