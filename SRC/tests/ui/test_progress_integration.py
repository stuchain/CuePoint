#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for ProgressWidget integration in MainWindow

Tests that ProgressWidget is properly integrated into MainWindow.
"""

import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QTimer
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.main_window import MainWindow
from cuepoint.ui.gui_interface import ProgressInfo


def test_progress_integration(qapp):
    """Test ProgressWidget integration in MainWindow"""
    app = qapp
    
    window = MainWindow()
    
    # Show progress section
    window.progress_group.setVisible(True)
    
    # Simulate some progress updates
    def simulate_updates():
        for i in range(1, 11):
            def update(i=i):
                progress_info = ProgressInfo(
                    completed_tracks=i,
                    total_tracks=10,
                    matched_count=i - 1,
                    unmatched_count=1 if i > 1 else 0,
                    current_track={
                        'title': f'Test Track {i}',
                        'artists': f'Test Artist {i}'
                    },
                    elapsed_time=i * 2.5
                )
                window.progress_widget.update_progress(progress_info)
            QTimer.singleShot(i * 500, update)
    
    # Start simulation after a short delay
    QTimer.singleShot(1000, simulate_updates)
    
    window.show()
    
    # For pytest, just verify the window was created
    if __name__ == "__main__":
        sys.exit(app.exec())
    # In pytest mode, just verify creation
    assert window is not None


if __name__ == "__main__":
    test_progress_integration()

