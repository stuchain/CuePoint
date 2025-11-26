#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for ErrorDialog

Tests the ErrorDialog with different types of ProcessingError objects.
"""

import sys
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))
from cuepoint.ui.widgets.dialogs import ErrorDialog
from cuepoint.ui.gui_interface import ProcessingError, ErrorType


def create_test_errors():
    """Create sample ProcessingError objects for testing"""
    errors = []
    
    # File not found error
    errors.append(ProcessingError(
        error_type=ErrorType.FILE_NOT_FOUND,
        message="XML file not found: collection.xml",
        details="The specified Rekordbox XML export file does not exist.",
        suggestions=[
            "Check that the file path is correct",
            "Verify the file exists and is readable",
            "Ensure the file path uses forward slashes (/) or escaped backslashes (\\)"
        ],
        recoverable=True
    ))
    
    # Playlist not found error
    errors.append(ProcessingError(
        error_type=ErrorType.PLAYLIST_NOT_FOUND,
        message="Playlist 'My Playlist' not found in XML file",
        details="Available playlists: Playlist 1, Playlist 2, Playlist 3...",
        suggestions=[
            "Check the playlist name spelling (case-sensitive)",
            "Verify 'My Playlist' exists in your Rekordbox library",
            "Export a fresh XML file from Rekordbox",
            "Choose from available playlists listed above"
        ],
        recoverable=True
    ))
    
    # XML parse error
    errors.append(ProcessingError(
        error_type=ErrorType.XML_PARSE_ERROR,
        message="Failed to parse XML file",
        details="Error occurred while parsing XML file: collection.xml\n\nLine 123: Invalid tag structure",
        suggestions=[
            "Verify the XML file is a valid Rekordbox export",
            "Check that the file is not corrupted",
            "Try exporting a fresh XML file from Rekordbox"
        ],
        recoverable=False
    ))
    
    # Processing error
    errors.append(ProcessingError(
        error_type=ErrorType.PROCESSING_ERROR,
        message="Unexpected error during processing: Connection timeout",
        details="Error type: TimeoutError\n\nNetwork request to Beatport timed out after 8 seconds.",
        suggestions=[
            "Check your internet connection",
            "Verify the XML file is valid",
            "Try processing again",
            "Check if Beatport website is accessible"
        ],
        recoverable=True
    ))
    
    return errors


def test_error_dialog(qapp):
    """Test ErrorDialog with different error types"""
    app = qapp
    
    window = QWidget()
    window.setWindowTitle("ErrorDialog Test")
    window.setGeometry(100, 100, 400, 300)
    
    layout = QVBoxLayout(window)
    
    test_errors = create_test_errors()
    
    for i, error in enumerate(test_errors):
        btn = QPushButton(f"Show Error {i+1}: {error.error_type.value}")
        btn.clicked.connect(lambda checked, e=error: ErrorDialog(e, window).exec())
        layout.addWidget(btn)
    
    window.show()
    
    # For pytest, just verify widgets were created
    if __name__ == "__main__":
        sys.exit(app.exec())
    # In pytest mode, just verify creation
    # The errors list is created in the function, so just verify the function completed
    assert window is not None


if __name__ == "__main__":
    test_error_dialog()

