#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Progress Widget Module - Progress display widget

This module contains the ProgressWidget class for displaying processing progress.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QProgressBar, QGroupBox, QPushButton
)
from PySide6.QtCore import Qt, Signal
from gui_interface import ProgressInfo


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
        layout.setSpacing(10)
        
        # Overall progress bar
        self.overall_progress = QProgressBar()
        self.overall_progress.setMinimum(0)
        self.overall_progress.setMaximum(100)
        self.overall_progress.setValue(0)
        self.overall_progress.setFormat("%p% (%v/%m)")
        layout.addWidget(self.overall_progress)
        
        # Current track info
        self.current_track_label = QLabel("Ready to start...")
        self.current_track_label.setWordWrap(True)
        layout.addWidget(self.current_track_label)
        
        # Statistics group
        stats_group = QGroupBox("Statistics")
        stats_layout = QHBoxLayout()
        
        self.matched_label = QLabel("Matched: 0")
        self.matched_label.setStyleSheet("color: #4CAF50; font-weight: bold;")
        self.unmatched_label = QLabel("Unmatched: 0")
        self.unmatched_label.setStyleSheet("color: #F44336; font-weight: bold;")
        self.processing_label = QLabel("Processing: 0")
        self.processing_label.setStyleSheet("color: #2196F3; font-weight: bold;")
        
        stats_layout.addWidget(self.matched_label)
        stats_layout.addWidget(self.unmatched_label)
        stats_layout.addWidget(self.processing_label)
        stats_layout.addStretch()
        
        stats_group.setLayout(stats_layout)
        layout.addWidget(stats_group)
        
        # Time estimates
        time_layout = QHBoxLayout()
        self.elapsed_label = QLabel("Elapsed: 0s")
        self.remaining_label = QLabel("Remaining: --")
        time_layout.addWidget(self.elapsed_label)
        time_layout.addWidget(self.remaining_label)
        time_layout.addStretch()
        layout.addLayout(time_layout)
        
        # Cancel button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.cancel_requested.emit)
        button_layout.addWidget(self.cancel_button)
        layout.addLayout(button_layout)
    
    def update_progress(self, progress_info: ProgressInfo):
        """Update progress from backend ProgressInfo object"""
        # Update overall progress bar
        if progress_info.total_tracks > 0:
            # Set maximum to total tracks for proper display
            self.overall_progress.setMaximum(progress_info.total_tracks)
            # Set value to completed tracks
            self.overall_progress.setValue(progress_info.completed_tracks)
        
        # Update current track
        if progress_info.current_track:
            title = progress_info.current_track.get('title', 'Unknown')
            artists = progress_info.current_track.get('artists', 'Unknown')
            track_text = f"Track {progress_info.completed_tracks}/{progress_info.total_tracks}: {title} - {artists}"
            self.current_track_label.setText(track_text)
        else:
            self.current_track_label.setText(f"Processing track {progress_info.completed_tracks}/{progress_info.total_tracks}...")
        
        # Update statistics
        self.matched_label.setText(f"Matched: {progress_info.matched_count}")
        self.unmatched_label.setText(f"Unmatched: {progress_info.unmatched_count}")
        processing_count = progress_info.completed_tracks
        self.processing_label.setText(f"Processing: {processing_count}")
        
        # Update time estimates
        if progress_info.elapsed_time > 0:
            elapsed_str = self._format_time(progress_info.elapsed_time)
            self.elapsed_label.setText(f"Elapsed: {elapsed_str}")
            
            # Calculate time remaining estimate
            if progress_info.total_tracks > 0 and progress_info.completed_tracks > 0:
                avg_time_per_track = progress_info.elapsed_time / progress_info.completed_tracks
                remaining_tracks = progress_info.total_tracks - progress_info.completed_tracks
                estimated_remaining = avg_time_per_track * remaining_tracks
                remaining_str = self._format_time(estimated_remaining)
                self.remaining_label.setText(f"Remaining: {remaining_str}")
            else:
                self.remaining_label.setText("Remaining: --")
        else:
            self.elapsed_label.setText("Elapsed: 0s")
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
    
    def reset(self):
        """Reset progress widget to initial state"""
        self.overall_progress.setValue(0)
        self.overall_progress.setMaximum(100)
        self.current_track_label.setText("Ready to start...")
        self.matched_label.setText("Matched: 0")
        self.unmatched_label.setText("Unmatched: 0")
        self.processing_label.setText("Processing: 0")
        self.elapsed_label.setText("Elapsed: 0s")
        self.remaining_label.setText("Remaining: --")
    
    def set_enabled(self, enabled: bool):
        """Enable or disable the cancel button"""
        self.cancel_button.setEnabled(enabled)
