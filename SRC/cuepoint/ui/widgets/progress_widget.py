#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Progress Widget Module - Progress display widget

This module contains the ProgressWidget class for displaying processing progress.
"""

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QProgressBar,
    QPushButton,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.gui_interface import ProgressInfo


class ProgressWidget(QWidget):
    """GUI progress widget for processing display"""

    cancel_requested = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setSpacing(8)
        main_layout.setContentsMargins(0, 0, 0, 0)

        # Row 1: Progress bar + percentage
        row1 = QHBoxLayout()
        row1.setSpacing(10)
        
        self.overall_progress = QProgressBar()
        self.overall_progress.setMinimum(0)
        self.overall_progress.setMaximum(100)
        self.overall_progress.setValue(0)
        self.overall_progress.setFormat("%p% (%v/%m tracks)")
        self.overall_progress.setFixedHeight(22)
        self.overall_progress.setStyleSheet("""
            QProgressBar {
                border: 1px solid #555;
                border-radius: 4px;
                text-align: center;
                font-weight: bold;
                font-size: 11px;
                background-color: #333;
                color: #fff;
            }
            QProgressBar::chunk {
                background-color: #007AFF;
                border-radius: 3px;
            }
        """)
        row1.addWidget(self.overall_progress, 1)
        
        self.percentage_label = QLabel("0%")
        self.percentage_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #fff;")
        self.percentage_label.setFixedWidth(50)
        self.percentage_label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        row1.addWidget(self.percentage_label)
        
        main_layout.addLayout(row1)

        # Row 2: Current track info
        self.current_track_label = QLabel("Ready to start...")
        self.current_track_label.setStyleSheet("font-size: 12px; color: #ccc;")
        self.current_track_label.setWordWrap(True)
        self.current_track_label.setFixedHeight(20)
        main_layout.addWidget(self.current_track_label)

        # Row 3: Time + Stats
        row3 = QHBoxLayout()
        row3.setSpacing(20)
        
        self.elapsed_label = QLabel("Elapsed: 0s")
        self.elapsed_label.setStyleSheet("font-size: 11px; color: #aaa;")
        row3.addWidget(self.elapsed_label)
        
        self.remaining_label = QLabel("Remaining: --")
        self.remaining_label.setStyleSheet("font-size: 11px; color: #aaa;")
        row3.addWidget(self.remaining_label)
        
        row3.addStretch()
        
        self.matched_label = QLabel("✓ 0")
        self.matched_label.setStyleSheet("font-size: 11px; color: #4CAF50; font-weight: bold;")
        self.matched_label.setToolTip("Matched tracks")
        row3.addWidget(self.matched_label)
        
        self.unmatched_label = QLabel("✗ 0")
        self.unmatched_label.setStyleSheet("font-size: 11px; color: #F44336; font-weight: bold;")
        self.unmatched_label.setToolTip("Unmatched tracks")
        row3.addWidget(self.unmatched_label)
        
        self.processing_label = QLabel("⟳ 0")
        self.processing_label.setStyleSheet("font-size: 11px; color: #2196F3; font-weight: bold;")
        self.processing_label.setToolTip("Processing")
        row3.addWidget(self.processing_label)
        
        main_layout.addLayout(row3)

        # Row 4: Cancel button
        row4 = QHBoxLayout()
        row4.addStretch()
        
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.setFixedSize(100, 28)
        self.cancel_button.setStyleSheet("""
            QPushButton {
                background-color: #F44336;
                color: white;
                border: none;
                border-radius: 4px;
                font-weight: bold;
                font-size: 11px;
            }
            QPushButton:hover { background-color: #D32F2F; }
            QPushButton:pressed { background-color: #B71C1C; }
            QPushButton:disabled { background-color: #555; color: #888; }
        """)
        self.cancel_button.clicked.connect(self._on_cancel_clicked)
        row4.addWidget(self.cancel_button)
        
        row4.addStretch()
        main_layout.addLayout(row4)

    def update_progress(self, progress_info: ProgressInfo):
        """Update progress from backend ProgressInfo object"""
        if progress_info.total_tracks > 0:
            self.overall_progress.setMaximum(progress_info.total_tracks)
            self.overall_progress.setValue(progress_info.completed_tracks)
            percentage = (progress_info.completed_tracks / progress_info.total_tracks) * 100
            self.percentage_label.setText(f"{percentage:.0f}%")

        # Current track
        if progress_info.current_track:
            title = progress_info.current_track.get("title", "Unknown")
            artists = progress_info.current_track.get("artists", "Unknown")
            self.current_track_label.setText(f"{progress_info.completed_tracks}/{progress_info.total_tracks}: {title} - {artists}")
        else:
            self.current_track_label.setText(f"Processing track {progress_info.completed_tracks}/{progress_info.total_tracks}...")

        # Stats
        self.matched_label.setText(f"✓ {progress_info.matched_count}")
        self.unmatched_label.setText(f"✗ {progress_info.unmatched_count}")
        self.processing_label.setText(f"⟳ {progress_info.completed_tracks}")

        # Time
        if progress_info.elapsed_time > 0:
            self.elapsed_label.setText(f"Elapsed: {self._format_time(progress_info.elapsed_time)}")
            if progress_info.completed_tracks > 0:
                avg = progress_info.elapsed_time / progress_info.completed_tracks
                remaining = avg * (progress_info.total_tracks - progress_info.completed_tracks)
                self.remaining_label.setText(f"Remaining: {self._format_time(remaining)}")
            else:
                self.remaining_label.setText("Remaining: --")
        else:
            self.elapsed_label.setText("Elapsed: 0s")
            self.remaining_label.setText("Remaining: --")

    def _format_time(self, seconds: float) -> str:
        """Format time in human-readable format"""
        if seconds < 0:
            return "--"
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            m, s = divmod(int(seconds), 60)
            return f"{m}m {s}s" if s else f"{m}m"
        else:
            h, rem = divmod(int(seconds), 3600)
            m = rem // 60
            return f"{h}h {m}m" if m else f"{h}h"

    def reset(self):
        """Reset progress widget to initial state"""
        self.overall_progress.setValue(0)
        self.overall_progress.setMaximum(100)
        self.current_track_label.setText("Ready to start...")
        self.matched_label.setText("✓ 0")
        self.unmatched_label.setText("✗ 0")
        self.processing_label.setText("⟳ 0")
        self.elapsed_label.setText("Elapsed: 0s")
        self.remaining_label.setText("Remaining: --")
        self.cancel_button.setEnabled(True)
        self.cancel_button.setText("Cancel")

    def set_enabled(self, enabled: bool):
        """Enable or disable the cancel button"""
        self.cancel_button.setEnabled(enabled)

    def _on_cancel_clicked(self):
        """Handle cancel button click"""
        try:
            self.cancel_requested.emit()
            self.cancel_button.setEnabled(False)
            self.cancel_button.setText("Cancelling...")
        except Exception as e:
            import traceback
            print(f"Error in cancel button: {e}")
            traceback.print_exc()
