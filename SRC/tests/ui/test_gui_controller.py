#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for GUI Controller

Tests the GUI Controller with simulated processing to verify signals work correctly.
"""

import sys
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QTimer
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.main_window import MainWindow


def test_gui_controller(qapp):
    """Test GUI Controller integration"""
    app = qapp
    
    window = MainWindow()
    
    # Test that controller is created
    assert window.controller is not None, "Controller should be created"
    print("[OK] Controller created")
    
    # Test that signals exist (can't easily test receivers without signal name strings)
    assert hasattr(window.controller, 'progress_updated'), "Progress signal should exist"
    assert hasattr(window.controller, 'processing_complete'), "Complete signal should exist"
    assert hasattr(window.controller, 'error_occurred'), "Error signal should exist"
    print("[OK] Signals exist")
    
    window.show()
    
    print("\nGUI Controller test:")
    print("1. Load an XML file")
    print("2. Select a playlist")
    print("3. Click 'Start Processing' to test processing")
    print("4. Click 'Cancel' to test cancellation")
    
    # For pytest, just verify the controller was created
    if __name__ == "__main__":
        sys.exit(app.exec())
    # In pytest mode, just verify creation
    assert window.controller is not None


if __name__ == "__main__":
    test_gui_controller()

