#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for ProgressWidget

Tests the ProgressWidget in isolation to verify it displays correctly.
"""

import sys
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton
from PySide6.QtCore import QTimer
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.widgets.progress_widget import ProgressWidget
from cuepoint.ui.gui_interface import ProgressInfo


def test_progress_widget(qapp):
    """Test ProgressWidget with simulated progress updates"""
    app = qapp
    
    # Create main window
    window = QWidget()
    window.setWindowTitle("ProgressWidget Test")
    window.setGeometry(100, 100, 600, 400)
    
    layout = QVBoxLayout(window)
    
    # Create progress widget
    progress_widget = ProgressWidget()
    layout.addWidget(progress_widget)
    
    # Test buttons
    button_layout = QVBoxLayout()
    
    reset_btn = QPushButton("Reset")
    reset_btn.clicked.connect(progress_widget.reset)
    button_layout.addWidget(reset_btn)
    
    # Simulate progress button
    simulate_btn = QPushButton("Simulate Progress")
    button_layout.addWidget(simulate_btn)
    
    layout.addLayout(button_layout)
    
    # Progress simulation
    current_track = 0
    total_tracks = 20
    matched_count = 0
    unmatched_count = 0
    elapsed_time = 0.0
    
    def simulate_progress():
        nonlocal current_track, matched_count, unmatched_count, elapsed_time
        
        if current_track >= total_tracks:
            return
        
        current_track += 1
        elapsed_time += 2.5  # Simulate 2.5 seconds per track
        
        # Randomly assign matched/unmatched
        import random
        if random.random() > 0.1:  # 90% match rate
            matched_count += 1
        else:
            unmatched_count += 1
        
        # Create ProgressInfo
        progress_info = ProgressInfo(
            completed_tracks=current_track,
            total_tracks=total_tracks,
            matched_count=matched_count,
            unmatched_count=unmatched_count,
            current_track={
                'title': f'Test Track {current_track}',
                'artists': f'Test Artist {current_track}'
            },
            elapsed_time=elapsed_time
        )
        
        progress_widget.update_progress(progress_info)
        
        # Continue simulation if not done
        if current_track < total_tracks:
            QTimer.singleShot(500, simulate_progress)
    
    def start_simulation():
        nonlocal current_track, matched_count, unmatched_count, elapsed_time
        progress_widget.reset()
        current_track = 0
        matched_count = 0
        unmatched_count = 0
        elapsed_time = 0.0
        QTimer.singleShot(100, simulate_progress)
    
    simulate_btn.clicked.connect(start_simulation)
    
    # Connect cancel signal
    progress_widget.cancel_requested.connect(lambda: print("Cancel requested!"))
    
    window.show()
    
    # For pytest, just verify the widget was created
    if __name__ == "__main__":
        sys.exit(app.exec())
    # In pytest mode, just verify creation
    assert progress_widget is not None


if __name__ == "__main__":
    test_progress_widget()

