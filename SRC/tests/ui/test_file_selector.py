#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for FileSelector widget
"""

import sys
import os
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QLabel
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.widgets.file_selector import FileSelector

def test_file_selector():
    """Test FileSelector widget"""
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    # Create test window
    window = QWidget()
    window.setWindowTitle("FileSelector Test")
    window.setGeometry(100, 100, 600, 300)
    
    layout = QVBoxLayout(window)
    
    # Add FileSelector
    file_selector = FileSelector()
    layout.addWidget(file_selector)
    
    # Add status label to show signal emissions
    status_label = QLabel("Status: No file selected")
    layout.addWidget(status_label)
    
    # Connect signal
    def on_file_selected(file_path):
        if file_selector.validate_file(file_path):
            status_label.setText(f"Status: File selected - {os.path.basename(file_path)}")
            status_label.setStyleSheet("color: green;")
        else:
            status_label.setText(f"Status: Invalid file - {file_path}")
            status_label.setStyleSheet("color: red;")
    
    file_selector.file_selected.connect(on_file_selected)
    
    # Instructions
    instructions = QLabel(
        "Instructions:\n"
        "1. Click 'Browse...' to select an XML file\n"
        "2. Or drag & drop an XML file onto the drop area\n"
        "3. Try dragging a non-XML file (should be rejected)\n"
        "4. Check that the path appears in the text field"
    )
    instructions.setWordWrap(True)
    layout.addWidget(instructions)
    
    window.show()
    
    print("FileSelector test window opened!")
    print("Test the following:")
    print("  - Browse button opens file dialog")
    print("  - Drag & drop XML file works")
    print("  - Drag & drop non-XML file is rejected")
    print("  - Visual feedback during drag (drop area turns blue)")
    print("  - Signal is emitted when file is selected")
    
    sys.exit(app.exec())

if __name__ == "__main__":
    test_file_selector()

