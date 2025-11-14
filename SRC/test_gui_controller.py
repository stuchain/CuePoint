#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for GUI Controller

Tests the GUI Controller with simulated processing to verify signals work correctly.
"""

import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QTimer
from gui.main_window import MainWindow


def test_gui_controller():
    """Test GUI Controller integration"""
    app = QApplication(sys.argv)
    
    window = MainWindow()
    
    # Test that controller is created
    assert window.controller is not None, "Controller should be created"
    print("[OK] Controller created")
    
    # Test that signals are connected
    assert window.controller.receivers(window.controller.progress_updated) > 0, "Progress signal should be connected"
    assert window.controller.receivers(window.controller.processing_complete) > 0, "Complete signal should be connected"
    assert window.controller.receivers(window.controller.error_occurred) > 0, "Error signal should be connected"
    print("[OK] Signals connected")
    
    window.show()
    
    print("\nGUI Controller test:")
    print("1. Load an XML file")
    print("2. Select a playlist")
    print("3. Click 'Start Processing' to test processing")
    print("4. Click 'Cancel' to test cancellation")
    
    sys.exit(app.exec())


if __name__ == "__main__":
    test_gui_controller()

