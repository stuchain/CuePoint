#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Controller Module - Thread-based processing controller for GUI

This module provides the GUI controller that bridges the GUI and backend processing,
running processing in a background thread and emitting Qt signals for GUI updates.
"""

from PySide6.QtCore import QObject, Signal, QThread
from typing import Optional, Dict, Any, List

from gui_interface import (
    ProgressInfo, TrackResult, ProcessingController, 
    ProcessingError, ErrorType
)
from processor import process_playlist


class ProcessingWorker(QThread):
    """
    Worker thread for processing tracks in the background.
    
    This runs process_playlist() in a separate thread to avoid blocking the GUI.
    It emits Qt signals for progress updates, completion, and errors.
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
        parent: Optional[QObject] = None
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
    
    def run(self):
        """
        Run processing in background thread.
        
        This method is called automatically when the thread starts.
        It calls process_playlist() and emits signals for GUI updates.
        """
        try:
            # Create progress callback that emits signal
            def progress_callback(progress_info: ProgressInfo):
                """Progress callback that emits signal to GUI"""
                self.progress_updated.emit(progress_info)
            
            # Process playlist using backend function
            results = process_playlist(
                xml_path=self.xml_path,
                playlist_name=self.playlist_name,
                settings=self.settings,
                progress_callback=progress_callback,
                controller=self.controller,
                auto_research=self.auto_research
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
                    "Try processing again"
                ],
                recoverable=True
            )
            self.error_occurred.emit(error)
    
    def cancel(self):
        """Request cancellation of processing"""
        self.controller.cancel()


class GUIController(QObject):
    """
    Controller bridging GUI and core processing logic.
    
    This class manages the processing worker thread and provides a clean
    interface for the GUI to start, cancel, and monitor processing.
    """
    
    # Signals emitted to GUI (connected from worker thread)
    progress_updated = Signal(object)  # ProgressInfo object
    processing_complete = Signal(list)  # List[TrackResult]
    error_occurred = Signal(object)  # ProcessingError object
    
    def __init__(self, parent: Optional[QObject] = None):
        """Initialize GUI controller"""
        super().__init__(parent)
        self.current_worker: Optional[ProcessingWorker] = None
    
    def start_processing(
        self,
        xml_path: str,
        playlist_name: str,
        settings: Optional[Dict[str, Any]] = None,
        auto_research: bool = False
    ):
        """
        Start processing a playlist in background thread.
        
        Args:
            xml_path: Path to Rekordbox XML file
            playlist_name: Name of playlist to process
            settings: Optional settings override
            auto_research: If True, auto-research unmatched tracks
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
            parent=self
        )
        
        # Connect worker signals to controller signals (which GUI connects to)
        self.current_worker.progress_updated.connect(self.progress_updated.emit)
        self.current_worker.processing_complete.connect(self.processing_complete.emit)
        self.current_worker.error_occurred.connect(self.error_occurred.emit)
        
        # Start worker thread
        self.current_worker.start()
    
    def cancel_processing(self):
        """Cancel current processing operation"""
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
        """Check if processing is currently running"""
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

