#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""GUI Controller Module - Thread-based processing controller for GUI.

This module provides the GUI controller that bridges the GUI and backend processing,
running processing in a background thread and emitting Qt signals for GUI updates.

The module contains:

- ProcessingWorker: QThread subclass that runs processing in background
- GUIController: Main controller class that manages worker threads and signals

This architecture ensures the GUI remains responsive during long-running
processing operations by moving all processing to a separate thread.
"""

from typing import Any, Dict, List, Optional

from PySide6.QtCore import QObject, QThread, Signal

from cuepoint.services.interfaces import IProcessorService
from cuepoint.ui.gui_interface import (
    ErrorType,
    ProcessingController,
    ProcessingError,
    ProgressInfo,
    TrackResult,
)
from cuepoint.utils.di_container import get_container


class ProcessingWorker(QThread):
    """Worker thread for processing tracks in the background.

    This runs process_playlist() in a separate thread to avoid blocking the GUI.
    It emits Qt signals for progress updates, completion, and errors. The worker
    thread allows the GUI to remain responsive during long-running processing
    operations.

    Attributes:
        xml_path: Path to Rekordbox XML file.
        playlist_name: Name of playlist to process.
        settings: Optional settings override dictionary.
        auto_research: Whether to auto-research unmatched tracks.
        controller: ProcessingController for cancellation support.

    Signals:
        progress_updated: Emitted when processing progress updates.
            Args:
                progress_info: ProgressInfo object with current progress.
        processing_complete: Emitted when processing completes successfully.
            Args:
                results: List of TrackResult objects.
        error_occurred: Emitted when an error occurs during processing.
            Args:
                error: ProcessingError object with error details.

    Example:
        >>> worker = ProcessingWorker(
        ...     xml_path="collection.xml",
        ...     playlist_name="My Playlist",
        ...     settings={"max_candidates": 10}
        ... )
        >>> worker.progress_updated.connect(on_progress)
        >>> worker.start()
    """

    # Signals emitted to update GUI (thread-safe)
    progress_updated = Signal(object)  # ProgressInfo object
    processing_complete = Signal(list)  # List[TrackResult]
    error_occurred = Signal(object)  # ProcessingError object

    def __init__(
        self,
        xml_path: str,
        playlist_name: str,
        settings: Optional[Dict[str, Any]] = None,
        auto_research: bool = False,
        parent: Optional[QObject] = None,
    ):
        """
        Initialize processing worker.

        Args:
            xml_path: Path to Rekordbox XML file
            playlist_name: Name of playlist to process
            settings: Optional settings override
            auto_research: If True, auto-research unmatched tracks
            parent: Parent QObject
        """
        super().__init__(parent)
        self.xml_path = xml_path
        self.playlist_name = playlist_name
        self.settings = settings
        self.auto_research = auto_research

        # Create ProcessingController for cancellation support
        self.controller = ProcessingController()

    def run(self) -> None:
        """Run processing in background thread.

        This method is called automatically when the thread starts via start().
        It uses ProcessorService from the DI container to process the playlist
        and emits signals for GUI updates. Handles exceptions and converts them
        to ProcessingError objects for consistent error handling.

        Raises:
            ProcessingError: If processing fails (emitted as signal).
        """
        try:
            # Get ProcessorService from DI container
            container = get_container()
            processor_service: IProcessorService = container.resolve(IProcessorService)

            # Create progress callback that emits signal
            def progress_callback(progress_info: ProgressInfo):
                """Progress callback that emits signal to GUI"""
                self.progress_updated.emit(progress_info)

            # Process playlist using ProcessorService
            results = processor_service.process_playlist_from_xml(
                xml_path=self.xml_path,
                playlist_name=self.playlist_name,
                settings=self.settings,
                progress_callback=progress_callback,
                controller=self.controller,
                auto_research=self.auto_research,
            )

            # Emit completion signal with results
            self.processing_complete.emit(results)

        except ProcessingError as e:
            # Emit structured error
            self.error_occurred.emit(e)
        except Exception as e:
            # Convert unexpected exceptions to ProcessingError
            error = ProcessingError(
                error_type=ErrorType.PROCESSING_ERROR,
                message=f"Unexpected error during processing: {str(e)}",
                details=f"Error type: {type(e).__name__}",
                suggestions=[
                    "Check that the XML file is valid",
                    "Verify the playlist name is correct",
                    "Try processing again",
                ],
                recoverable=True,
            )
            self.error_occurred.emit(error)

    def cancel(self) -> None:
        """Request cancellation of processing.

        Sets the cancellation flag in the ProcessingController, which will
        cause process_playlist() to stop processing gracefully.
        """
        self.controller.cancel()


class GUIController(QObject):
    """Controller bridging GUI and core processing logic.

    This class manages the processing worker thread and provides a clean
    interface for the GUI to start, cancel, and monitor processing. It handles
    both single playlist and batch processing modes.

    Attributes:
        current_worker: Currently active ProcessingWorker thread, or None.
        batch_playlists: List of playlist names for batch processing.
        batch_index: Current index in batch processing.
        batch_xml_path: XML file path for batch processing.
        batch_settings: Settings dictionary for batch processing.
        batch_auto_research: Auto-research flag for batch processing.
        current_batch_playlist_name: Name of currently processing playlist.
        last_completed_playlist_name: Name of last completed playlist.

    Signals:
        progress_updated: Emitted when processing progress updates.
            Args:
                progress_info: ProgressInfo object with current progress.
        processing_complete: Emitted when processing completes successfully.
            Args:
                results: List of TrackResult objects.
        error_occurred: Emitted when an error occurs during processing.
            Args:
                error: ProcessingError object with error details.

    Example:
        >>> controller = GUIController()
        >>> controller.progress_updated.connect(on_progress)
        >>> controller.start_processing("collection.xml", "My Playlist")
    """

    # Signals emitted to GUI (connected from worker thread)
    progress_updated = Signal(object)  # ProgressInfo object
    processing_complete = Signal(list)  # List[TrackResult]
    error_occurred = Signal(object)  # ProcessingError object

    def __init__(self, parent: Optional[QObject] = None) -> None:
        """Initialize GUI controller.

        Args:
            parent: Optional parent QObject for Qt object hierarchy.
        """
        super().__init__(parent)
        self.current_worker: Optional[ProcessingWorker] = None
        # Batch processing state
        self.batch_playlists: List[str] = []
        self.batch_index: int = 0
        self.batch_xml_path: str = ""
        self.batch_settings: Optional[Dict[str, Any]] = None
        self.batch_auto_research: bool = False

    def start_processing(
        self,
        xml_path: str,
        playlist_name: str,
        settings: Optional[Dict[str, Any]] = None,
        auto_research: bool = False,
    ) -> None:
        """Start processing a playlist in background thread.

        Cancels any existing processing, creates a new ProcessingWorker thread,
        connects signals, and starts processing. The worker thread will emit
        signals for progress updates, completion, and errors.

        Args:
            xml_path: Path to Rekordbox XML file.
            playlist_name: Name of playlist to process.
            settings: Optional settings override dictionary.
            auto_research: If True, auto-research unmatched tracks.
        """
        # Cancel any existing processing
        if self.current_worker and self.current_worker.isRunning():
            self.cancel_processing()

        # Create new worker thread
        self.current_worker = ProcessingWorker(
            xml_path=xml_path,
            playlist_name=playlist_name,
            settings=settings,
            auto_research=auto_research,
            parent=self,
        )

        # Connect worker signals to controller signals (which GUI connects to)
        self.current_worker.progress_updated.connect(self.progress_updated.emit)
        self.current_worker.processing_complete.connect(self.processing_complete.emit)
        self.current_worker.error_occurred.connect(self.error_occurred.emit)

        # Start worker thread
        self.current_worker.start()

    def cancel_processing(self) -> None:
        """Cancel current processing operation.

        Requests cancellation of the current worker thread and waits for it
        to finish (with a 5-second timeout). Forces termination if the thread
        doesn't respond within the timeout.
        """
        if self.current_worker and self.current_worker.isRunning():
            # Request cancellation
            self.current_worker.cancel()

            # Wait for thread to finish (with timeout)
            if not self.current_worker.wait(5000):  # 5 second timeout
                # Force termination if thread doesn't finish
                self.current_worker.terminate()
                self.current_worker.wait()

            self.current_worker = None

    def is_processing(self) -> bool:
        """Check if processing is currently running.

        Returns:
            True if a worker thread exists and is running, False otherwise.
        """
        return self.current_worker is not None and self.current_worker.isRunning()

    def wait_for_completion(self, timeout: int = 30000) -> bool:
        """
        Wait for processing to complete.

        Args:
            timeout: Maximum time to wait in milliseconds

        Returns:
            True if processing completed, False if timeout
        """
        if self.current_worker:
            return self.current_worker.wait(timeout)
        return True

    def start_batch_processing(
        self,
        xml_path: str,
        playlist_names: List[str],
        settings: Optional[Dict[str, Any]] = None,
        auto_research: bool = False,
    ) -> None:
        """Start batch processing multiple playlists sequentially.

        Processes playlists one at a time, emitting signals for each playlist
        completion. Continues with the next playlist even if one fails.

        Args:
            xml_path: Path to Rekordbox XML file.
            playlist_names: List of playlist names to process.
            settings: Optional settings override dictionary.
            auto_research: If True, auto-research unmatched tracks.
        """
        # Cancel any existing processing
        if self.current_worker and self.current_worker.isRunning():
            self.cancel_processing()

        # Store batch processing state
        self.batch_playlists = playlist_names
        self.batch_index = 0
        self.batch_xml_path = xml_path
        self.batch_settings = settings
        self.batch_auto_research = auto_research
        self.current_batch_playlist_name = None  # Track current playlist being processed
        self.last_completed_playlist_name = None  # Track last completed playlist name

        # Start processing first playlist
        if self.batch_playlists:
            self._process_next_playlist()

    def _process_next_playlist(self) -> None:
        """Process next playlist in batch.

        Creates a new ProcessingWorker for the next playlist in the batch
        and starts processing. Updates batch state tracking variables.
        """
        if self.batch_index >= len(self.batch_playlists):
            return

        playlist_name = self.batch_playlists[self.batch_index]
        self.current_batch_playlist_name = playlist_name  # Store current playlist name

        # Create new worker thread
        self.current_worker = ProcessingWorker(
            xml_path=self.batch_xml_path,
            playlist_name=playlist_name,
            settings=self.batch_settings,
            auto_research=self.batch_auto_research,
            parent=self,
        )

        # Connect worker signals
        self.current_worker.progress_updated.connect(self.progress_updated.emit)
        self.current_worker.processing_complete.connect(self._on_batch_playlist_complete)
        self.current_worker.error_occurred.connect(self._on_batch_playlist_error)

        # Start worker thread
        self.current_worker.start()

    def _on_batch_playlist_complete(self, results: List[TrackResult]) -> None:
        """Handle completion of a playlist in batch processing.

        Stores the completed playlist name, emits the completion signal,
        and moves to the next playlist in the batch. Clears worker state
        when batch is complete.

        Args:
            results: List of TrackResult objects for the completed playlist.
        """
        # Get playlist name before incrementing index or processing next
        playlist_name = self.current_batch_playlist_name
        self.last_completed_playlist_name = playlist_name  # Store for GUI

        # Emit completion for this playlist (GUI will handle it)
        self.processing_complete.emit(results)

        # Move to next playlist
        self.batch_index += 1
        if self.batch_index < len(self.batch_playlists):
            # Process next playlist (this will update current_batch_playlist_name)
            self._process_next_playlist()
        else:
            # Batch complete - clear worker but keep batch state for GUI
            self.current_worker = None
            self.current_batch_playlist_name = None
            self.last_completed_playlist_name = None

    def _on_batch_playlist_error(self, error: ProcessingError) -> None:
        """Handle error for a playlist in batch processing.

        Stores the failed playlist name, emits the error signal, and
        continues with the next playlist in the batch. Clears worker state
        when batch is complete.

        Args:
            error: ProcessingError object containing error information.
        """
        # Get playlist name before incrementing index or processing next
        playlist_name = self.current_batch_playlist_name
        self.last_completed_playlist_name = playlist_name  # Store for GUI

        # Emit error (GUI will handle it)
        self.error_occurred.emit(error)

        # Move to next playlist (continue batch)
        self.batch_index += 1
        if self.batch_index < len(self.batch_playlists):
            # Process next playlist (this will update current_batch_playlist_name)
            self._process_next_playlist()
        else:
            # Batch complete (with errors) - clear worker but keep batch state for GUI
            self.current_worker = None
            self.current_batch_playlist_name = None
            self.last_completed_playlist_name = None
