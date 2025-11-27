#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Batch Processor Widget Module

This module contains the BatchProcessorWidget class for processing multiple playlists.
"""

import time
from typing import Dict, List, Optional

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.gui_interface import ProcessingError, ProgressInfo, TrackResult


class BatchProcessorWidget(QWidget):
    """Widget for batch processing multiple playlists"""

    # Signals
    batch_started = Signal(list)  # List of playlist names
    batch_completed = Signal(dict)  # Dict[playlist_name, List[TrackResult]]
    batch_cancelled = Signal()
    playlist_completed = Signal(str, list)  # playlist_name, results

    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists: List[str] = []
        self.results: Dict[str, List[TrackResult]] = {}  # playlist_name -> List[TrackResult]
        self.current_playlist_index: int = -1
        self.selected_playlists: List[str] = []
        self.is_processing: bool = False
        self.batch_start_time: Optional[float] = None
        self.current_playlist_start_time: Optional[float] = None
        self.total_elapsed_time: float = 0.0
        self.timer = QTimer()
        self.timer.timeout.connect(self._update_time_display)
        self.init_ui()

    def init_ui(self):
        """Initialize batch processing UI"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)

        # Playlist selection
        playlist_group = QGroupBox("Select Playlists")
        playlist_layout = QVBoxLayout()

        self.playlist_list = QListWidget()
        self.playlist_list.setSelectionMode(QListWidget.NoSelection)  # Use checkboxes instead
        playlist_layout.addWidget(self.playlist_list)

        # Select all/none buttons
        btn_layout = QHBoxLayout()
        self.select_all_btn = QPushButton("Select All")
        self.select_all_btn.clicked.connect(self.select_all_playlists)
        btn_layout.addWidget(self.select_all_btn)

        self.deselect_all_btn = QPushButton("Deselect All")
        self.deselect_all_btn.clicked.connect(self.deselect_all_playlists)
        btn_layout.addWidget(self.deselect_all_btn)

        btn_layout.addStretch()
        playlist_layout.addLayout(btn_layout)

        playlist_group.setLayout(playlist_layout)
        layout.addWidget(playlist_group)

        # Processing controls
        control_layout = QHBoxLayout()
        control_layout.addStretch()

        self.start_batch_btn = QPushButton("Start Batch Processing")
        self.start_batch_btn.clicked.connect(self._on_start_batch)
        control_layout.addWidget(self.start_batch_btn)

        self.cancel_batch_btn = QPushButton("Cancel")
        self.cancel_batch_btn.clicked.connect(self._on_cancel_batch)
        self.cancel_batch_btn.setEnabled(False)
        control_layout.addWidget(self.cancel_batch_btn)

        control_layout.addStretch()
        layout.addLayout(control_layout)

        # Progress display
        self.progress_group = QGroupBox("Batch Progress")
        progress_layout = QVBoxLayout()

        # Overall progress
        overall_label = QLabel("Overall Progress:")
        progress_layout.addWidget(overall_label)

        self.overall_progress = QProgressBar()
        self.overall_progress.setFormat("%p% (%v/%m)")
        self.overall_progress.setMinimum(0)
        self.overall_progress.setMaximum(100)
        self.overall_progress.setValue(0)
        progress_layout.addWidget(self.overall_progress)

        # Current playlist label
        self.current_playlist_label = QLabel("Ready")
        self.current_playlist_label.setWordWrap(True)
        progress_layout.addWidget(self.current_playlist_label)

        # Current playlist progress
        current_label = QLabel("Current Playlist Progress:")
        progress_layout.addWidget(current_label)

        self.current_progress = QProgressBar()
        self.current_progress.setFormat("%p% (%v/%m)")
        self.current_progress.setMinimum(0)
        self.current_progress.setMaximum(100)
        self.current_progress.setValue(0)
        progress_layout.addWidget(self.current_progress)

        # Time information
        time_layout = QHBoxLayout()
        self.elapsed_label = QLabel("Elapsed: 0s")
        self.remaining_label = QLabel("Remaining: --")
        time_layout.addWidget(self.elapsed_label)
        time_layout.addWidget(self.remaining_label)
        time_layout.addStretch()
        progress_layout.addLayout(time_layout)

        self.progress_group.setLayout(progress_layout)
        layout.addWidget(self.progress_group)

        layout.addStretch()

    def set_playlists(self, playlists: List[str]):
        """Set available playlists"""
        self.playlists = playlists
        self.playlist_list.clear()

        for playlist in playlists:
            item = QListWidgetItem(playlist)
            item.setCheckState(Qt.Checked)
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            self.playlist_list.addItem(item)

    def get_selected_playlists(self) -> List[str]:
        """Get list of selected playlists"""
        selected = []
        for i in range(self.playlist_list.count()):
            item = self.playlist_list.item(i)
            if item.checkState() == Qt.Checked:
                selected.append(item.text())
        return selected

    def select_all_playlists(self):
        """Select all playlists"""
        for i in range(self.playlist_list.count()):
            self.playlist_list.item(i).setCheckState(Qt.Checked)

    def deselect_all_playlists(self):
        """Deselect all playlists"""
        for i in range(self.playlist_list.count()):
            self.playlist_list.item(i).setCheckState(Qt.Unchecked)

    def _on_start_batch(self):
        """Handle start batch button click"""
        selected = self.get_selected_playlists()
        if not selected:
            QMessageBox.warning(
                self, "No Playlists Selected", "Please select at least one playlist to process."
            )
            return

        # Confirm with user
        reply = QMessageBox.question(
            self,
            "Start Batch Processing",
            f"Process {len(selected)} playlist(s)?\n\nThis may take a while.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )

        if reply == QMessageBox.Yes:
            self.start_batch_processing(selected)

    def start_batch_processing(self, playlist_names: List[str]):
        """Start processing selected playlists"""
        self.selected_playlists = playlist_names
        self.results = {}
        self.current_playlist_index = -1  # Start at -1, will be 0 after first completion
        self.is_processing = True

        # Initialize time tracking
        self.batch_start_time = time.time()
        self.current_playlist_start_time = None
        self.total_elapsed_time = 0.0

        # Start timer to update time display every second
        self.timer.start(1000)  # Update every 1 second

        # Update UI
        self.start_batch_btn.setEnabled(False)
        self.cancel_batch_btn.setEnabled(True)
        self.overall_progress.setMaximum(len(playlist_names))
        self.overall_progress.setValue(0)
        self.current_playlist_label.setText("Starting batch processing...")
        self.elapsed_label.setText("Elapsed: 0s")
        self.remaining_label.setText("Remaining: --")

        # Disable playlist selection during processing
        for i in range(self.playlist_list.count()):
            item = self.playlist_list.item(i)
            item.setFlags(item.flags() & ~Qt.ItemIsEnabled)

        # Emit signal to start batch processing
        self.batch_started.emit(playlist_names)

    def _on_cancel_batch(self):
        """Handle cancel batch button click"""
        reply = QMessageBox.question(
            self,
            "Cancel Batch Processing",
            "Are you sure you want to cancel batch processing?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )

        if reply == QMessageBox.Yes:
            self.cancel_batch_processing()

    def cancel_batch_processing(self):
        """Cancel batch processing"""
        self.is_processing = False

        # Stop timer
        self.timer.stop()

        # Update UI
        self.start_batch_btn.setEnabled(True)
        self.cancel_batch_btn.setEnabled(False)
        self.current_playlist_label.setText("Batch processing cancelled")

        # Re-enable playlist selection
        for i in range(self.playlist_list.count()):
            item = self.playlist_list.item(i)
            item.setFlags(item.flags() | Qt.ItemIsEnabled)

        # Emit cancel signal
        self.batch_cancelled.emit()

    def _update_time_display(self):
        """Update elapsed and remaining time display"""
        if not self.is_processing or not self.batch_start_time:
            return

        # Calculate total elapsed time
        current_time = time.time()
        if self.current_playlist_start_time:
            # Add time from current playlist
            current_playlist_elapsed = current_time - self.current_playlist_start_time
            total_elapsed = self.total_elapsed_time + current_playlist_elapsed
        else:
            total_elapsed = self.total_elapsed_time

        # Update elapsed time
        elapsed_str = self._format_time(total_elapsed)
        self.elapsed_label.setText(f"Elapsed: {elapsed_str}")

        # Calculate remaining time estimate
        completed_playlists = self.current_playlist_index + 1  # Number of fully completed playlists
        total_playlists = len(self.selected_playlists)
        remaining_playlists = total_playlists - completed_playlists

        # If we're currently processing a playlist, we need to account for it
        if self.current_playlist_start_time:
            remaining_playlists -= 1  # Subtract current playlist from remaining count

        if remaining_playlists <= 0:
            # All playlists are done or being processed
            self.remaining_label.setText("Remaining: --")
        elif completed_playlists > 0:
            # We have completed at least one playlist, use average
            avg_time_per_playlist = self.total_elapsed_time / completed_playlists
            estimated_remaining = avg_time_per_playlist * remaining_playlists
            remaining_str = self._format_time(estimated_remaining)
            self.remaining_label.setText(f"Remaining: {remaining_str}")
        elif self.current_playlist_start_time and total_elapsed > 5:
            # First playlist, use current elapsed time as estimate
            # Only estimate if we've spent at least 5 seconds (to avoid showing same small values)
            # Estimate: if we've spent X time on this playlist, and there are N more playlists,
            # estimate remaining as X * N
            current_playlist_elapsed = current_time - self.current_playlist_start_time
            if current_playlist_elapsed > 5:  # Only estimate after 5 seconds
                estimated_remaining = current_playlist_elapsed * remaining_playlists
                remaining_str = self._format_time(estimated_remaining)
                self.remaining_label.setText(f"Remaining: {remaining_str}")
            else:
                self.remaining_label.setText("Remaining: Calculating...")
        else:
            self.remaining_label.setText("Remaining: --")

    def _format_time(self, seconds: float) -> str:
        """Format time in human-readable format"""
        if seconds < 60:
            return f"{seconds:.0f}s"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"

    def on_playlist_started(self, playlist_name: str):
        """Handle when a playlist starts processing"""
        if not self.is_processing:
            return

        # Track start time for current playlist
        self.current_playlist_start_time = time.time()

        self.current_playlist_label.setText(f"Processing: {playlist_name}")
        self.current_progress.setValue(0)

    def on_playlist_progress(self, progress_info: ProgressInfo):
        """Handle progress update for current playlist"""
        if not self.is_processing:
            return

        # Update current playlist progress
        if progress_info.total_tracks > 0:
            self.current_progress.setMaximum(progress_info.total_tracks)
            self.current_progress.setValue(progress_info.completed_tracks)

        # Update time display (will also be updated by timer, but this ensures accuracy)
        self._update_time_display()

    def on_playlist_completed(self, playlist_name: str, results: List[TrackResult]):
        """Handle when a playlist completes"""
        if not self.is_processing:
            return

        # Update total elapsed time (add time spent on this playlist)
        if self.current_playlist_start_time:
            playlist_elapsed = time.time() - self.current_playlist_start_time
            self.total_elapsed_time += playlist_elapsed
            self.current_playlist_start_time = None

        # Store results
        self.results[playlist_name] = results

        # Update overall progress (increment first, then set value)
        self.current_playlist_index += 1
        completed_count = self.current_playlist_index + 1  # +1 because index is 0-based
        self.overall_progress.setValue(completed_count)

        # Update time display
        self._update_time_display()

        # Emit signal
        self.playlist_completed.emit(playlist_name, results)

        # Check if batch is complete
        if completed_count >= len(self.selected_playlists):
            self.on_batch_completed()

    def on_playlist_error(self, playlist_name: str, error: ProcessingError):
        """Handle error for a playlist"""
        if not self.is_processing:
            return

        # Show error but continue with next playlist
        QMessageBox.warning(
            self,
            f"Error Processing {playlist_name}",
            f"An error occurred while processing '{playlist_name}':\n\n{
                error.message}\n\nContinuing with next playlist...",
        )

        # Mark as completed (with no results)
        self.results[playlist_name] = []
        self.current_playlist_index += 1
        completed_count = self.current_playlist_index + 1  # +1 because index is 0-based
        self.overall_progress.setValue(completed_count)

        # Check if batch is complete
        if completed_count >= len(self.selected_playlists):
            self.on_batch_completed()

    def on_batch_completed(self):
        """Handle batch completion"""
        self.is_processing = False

        # Stop timer
        self.timer.stop()

        # Final time update
        if self.batch_start_time:
            total_time = time.time() - self.batch_start_time
            elapsed_str = self._format_time(total_time)
            self.elapsed_label.setText(f"Total Time: {elapsed_str}")
            self.remaining_label.setText("")  # Clear remaining time

        # Update UI
        self.start_batch_btn.setEnabled(True)
        self.cancel_batch_btn.setEnabled(False)
        self.current_playlist_label.setText("Batch processing complete!")

        # Re-enable playlist selection
        for i in range(self.playlist_list.count()):
            item = self.playlist_list.item(i)
            item.setFlags(item.flags() | Qt.ItemIsEnabled)

        # Emit completion signal
        self.batch_completed.emit(self.results)

        # Show summary with time
        total_playlists = len(self.selected_playlists)
        successful = len([r for r in self.results.values() if r])
        total_time = time.time() - self.batch_start_time if self.batch_start_time else 0
        time_str = self._format_time(total_time)
        QMessageBox.information(
            self,
            "Batch Processing Complete",
            f"Batch processing completed!\n\n"
            f"Processed: {total_playlists} playlist(s)\n"
            f"Successful: {successful}\n"
            f"Failed: {total_playlists - successful}\n"
            f"Total Time: {time_str}",
        )

    def reset(self):
        """Reset batch processor state"""
        self.results = {}
        self.current_playlist_index = -1
        self.selected_playlists = []
        self.is_processing = False
        self.overall_progress.setValue(0)
        self.current_progress.setValue(0)
        self.current_playlist_label.setText("Ready")
        self.start_batch_btn.setEnabled(True)
        self.cancel_batch_btn.setEnabled(False)
