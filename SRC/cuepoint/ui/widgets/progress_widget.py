#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Progress Widget Module - Progress display widget

This module contains the ProgressWidget class for displaying processing progress.
"""

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.gui_interface import ProgressInfo


class ProgressWidget(QWidget):
    """GUI progress widget for processing display"""

    # Signal emitted when cancel button is clicked
    cancel_requested = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(15, 15, 15, 15)

        # Overall progress bar - improved styling
        self.overall_progress = QProgressBar()
        self.overall_progress.setMinimum(0)
        self.overall_progress.setMaximum(100)
        self.overall_progress.setValue(0)
        self.overall_progress.setFormat("%p% (%v/%m tracks)")
        
        # Percentage label (separate for better visibility)
        progress_container = QWidget()
        progress_layout = QHBoxLayout(progress_container)
        progress_layout.setContentsMargins(0, 0, 0, 0)
        progress_layout.setSpacing(10)
        
        self.overall_progress.setStyleSheet(
            """
            QProgressBar {
                border: 2px solid #ccc;
                border-radius: 5px;
                text-align: center;
                font-weight: bold;
                height: 25px;
            }
            QProgressBar::chunk {
                background-color: #4A90E2;
                border-radius: 3px;
            }
            """
        )
        progress_layout.addWidget(self.overall_progress)
        
        # Percentage label next to progress bar
        self.percentage_label = QLabel("0%")
        self.percentage_label.setStyleSheet(
            "font-size: 16px; font-weight: bold; color: #ffffff; min-width: 50px;"
        )
        progress_layout.addWidget(self.percentage_label)
        
        layout.addWidget(progress_container)

        # Current track info - improved styling
        self.current_track_label = QLabel("Ready to start...")
        self.current_track_label.setWordWrap(True)
        self.current_track_label.setStyleSheet(
            "font-size: 14px; "
            "color: #ffffff; "
            "padding: 5px;"
        )
        layout.addWidget(self.current_track_label)

        # Time information - improved layout
        time_container = QWidget()
        time_layout = QHBoxLayout(time_container)
        time_layout.setContentsMargins(0, 0, 0, 0)
        time_layout.setSpacing(20)

        # Elapsed time
        elapsed_container = QWidget()
        elapsed_layout = QVBoxLayout(elapsed_container)
        elapsed_layout.setContentsMargins(0, 0, 0, 0)
        elapsed_layout.setSpacing(2)
        elapsed_title = QLabel("Elapsed Time")
        elapsed_title.setStyleSheet("font-size: 11px; color: #ffffff;")
        self.elapsed_label = QLabel("0s")
        self.elapsed_label.setStyleSheet("font-size: 16px; font-weight: bold; color: #ffffff;")
        elapsed_layout.addWidget(elapsed_title)
        elapsed_layout.addWidget(self.elapsed_label)
        time_layout.addWidget(elapsed_container)

        # Remaining time
        remaining_container = QWidget()
        remaining_layout = QVBoxLayout(remaining_container)
        remaining_layout.setContentsMargins(0, 0, 0, 0)
        remaining_layout.setSpacing(2)
        remaining_title = QLabel("Estimated Remaining")
        remaining_title.setStyleSheet("font-size: 11px; color: #ffffff;")
        self.remaining_label = QLabel("--")
        self.remaining_label.setStyleSheet("font-size: 16px; font-weight: bold; color: #ffffff;")
        remaining_layout.addWidget(remaining_title)
        remaining_layout.addWidget(self.remaining_label)
        time_layout.addWidget(remaining_container)

        time_layout.addStretch()
        layout.addWidget(time_container)

        # Statistics group - improved layout
        stats_group = QGroupBox("Statistics")
        stats_group.setStyleSheet("QGroupBox { font-weight: bold; color: #ffffff; }")
        stats_layout = QHBoxLayout()
        stats_layout.setSpacing(15)

        self.matched_label = QLabel("Matched: 0")
        self.matched_label.setStyleSheet("color: #4CAF50; font-weight: bold; font-size: 13px;")
        self.unmatched_label = QLabel("Unmatched: 0")
        self.unmatched_label.setStyleSheet("color: #F44336; font-weight: bold; font-size: 13px;")
        self.processing_label = QLabel("Processing: 0")
        self.processing_label.setStyleSheet("color: #2196F3; font-weight: bold; font-size: 13px;")

        stats_layout.addWidget(self.matched_label)
        stats_layout.addWidget(self.unmatched_label)
        stats_layout.addWidget(self.processing_label)
        stats_layout.addStretch()

        stats_group.setLayout(stats_layout)
        layout.addWidget(stats_group)

        # Cancel button - improved styling and positioning
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        self.cancel_button = QPushButton("Cancel Processing")
        self.cancel_button.setMinimumWidth(150)
        self.cancel_button.setToolTip("Cancel processing (Shortcut: Esc)")
        self.cancel_button.setStyleSheet(
            """
            QPushButton {
                background-color: #F44336;
                color: white;
                border: none;
                border-radius: 5px;
                padding: 8px 20px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #D32F2F;
            }
            QPushButton:pressed {
                background-color: #B71C1C;
            }
            QPushButton:disabled {
                background-color: #ccc;
                color: #666;
            }
            """
        )
        self.cancel_button.clicked.connect(self._on_cancel_clicked)
        button_layout.addWidget(self.cancel_button)
        button_layout.addStretch()
        layout.addLayout(button_layout)

    def update_progress(self, progress_info: ProgressInfo):
        """Update progress from backend ProgressInfo object"""
        # Update overall progress bar
        if progress_info.total_tracks > 0:
            # Set maximum to total tracks for proper display
            self.overall_progress.setMaximum(progress_info.total_tracks)
            # Set value to completed tracks
            self.overall_progress.setValue(progress_info.completed_tracks)
            
            # Update percentage label
            percentage = (progress_info.completed_tracks / progress_info.total_tracks) * 100
            self.percentage_label.setText(f"{percentage:.0f}%")

        # Update current track
        if progress_info.current_track:
            title = progress_info.current_track.get("title", "Unknown")
            artists = progress_info.current_track.get("artists", "Unknown")
            track_text = f"Track {
                progress_info.completed_tracks}/{
                progress_info.total_tracks}: {title} - {artists}"
            self.current_track_label.setText(track_text)
        else:
            self.current_track_label.setText(
                f"Processing track {progress_info.completed_tracks}/{progress_info.total_tracks}..."
            )

        # Update statistics
        self.matched_label.setText(f"Matched: {progress_info.matched_count}")
        self.unmatched_label.setText(f"Unmatched: {progress_info.unmatched_count}")
        processing_count = progress_info.completed_tracks
        self.processing_label.setText(f"Processing: {processing_count}")

        # Update time estimates (labels are now separate from values)
        if progress_info.elapsed_time > 0:
            elapsed_str = self._format_time(progress_info.elapsed_time)
            self.elapsed_label.setText(elapsed_str)

            # Calculate time remaining estimate
            if progress_info.total_tracks > 0 and progress_info.completed_tracks > 0:
                avg_time_per_track = progress_info.elapsed_time / progress_info.completed_tracks
                remaining_tracks = progress_info.total_tracks - progress_info.completed_tracks
                estimated_remaining = avg_time_per_track * remaining_tracks
                remaining_str = self._format_time(estimated_remaining)
                self.remaining_label.setText(remaining_str)
            else:
                self.remaining_label.setText("--")
        else:
            self.elapsed_label.setText("0s")
            self.remaining_label.setText("--")

    def _format_time(self, seconds: float) -> str:
        """Format time in human-readable format"""
        if seconds < 0:
            return "--"
        
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            if secs == 0:
                return f"{minutes}m"
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            if minutes == 0:
                return f"{hours}h"
            return f"{hours}h {minutes}m"

    def reset(self):
        """Reset progress widget to initial state"""
        self.overall_progress.setValue(0)
        self.overall_progress.setMaximum(100)
        self.current_track_label.setText("Ready to start...")
        self.matched_label.setText("Matched: 0")
        self.unmatched_label.setText("Unmatched: 0")
        self.processing_label.setText("Processing: 0")
        self.elapsed_label.setText("0s")
        self.remaining_label.setText("--")
        # Reset cancel button
        self.cancel_button.setEnabled(True)
        self.cancel_button.setText("Cancel Processing")

    def set_enabled(self, enabled: bool):
        """Enable or disable the cancel button"""
        self.cancel_button.setEnabled(enabled)

    def _on_cancel_clicked(self):
        """Handle cancel button click with error handling"""
        try:
            # Emit cancel signal
            self.cancel_requested.emit()
            # Disable button to prevent multiple clicks
            self.cancel_button.setEnabled(False)
            self.cancel_button.setText("Cancelling...")
        except Exception as e:
            # Log error but don't crash
            import traceback
            print(f"Error in cancel button: {e}")
            print(traceback.format_exc())
