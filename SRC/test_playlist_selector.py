#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test script for PlaylistSelector widget with real XML file
"""

import sys
import os
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout, QLabel, QPushButton
from gui.playlist_selector import PlaylistSelector

def test_playlist_selector():
    """Test PlaylistSelector widget with collection.xml"""
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    # Check if collection.xml exists
    xml_path = "collection.xml"
    if not os.path.exists(xml_path):
        xml_path = os.path.join("..", "collection.xml")
        if not os.path.exists(xml_path):
            print(f"ERROR: collection.xml not found in current directory or parent directory")
            print(f"Please ensure collection.xml exists to test PlaylistSelector")
            return 1
    
    # Create test window
    window = QWidget()
    window.setWindowTitle("PlaylistSelector Test")
    window.setGeometry(100, 100, 500, 200)
    
    layout = QVBoxLayout(window)
    
    # Add label
    info_label = QLabel(f"Testing with: {xml_path}")
    layout.addWidget(info_label)
    
    # Add PlaylistSelector
    playlist_selector = PlaylistSelector()
    layout.addWidget(playlist_selector)
    
    # Add status label
    status_label = QLabel("Status: Not loaded")
    layout.addWidget(status_label)
    
    # Add load button
    load_btn = QPushButton("Load XML File")
    def load_xml():
        try:
            playlist_selector.load_xml_file(xml_path)
            playlist_count = len(playlist_selector.playlists)
            status_label.setText(f"Status: Loaded {playlist_count} playlists")
            status_label.setStyleSheet("color: green;")
        except Exception as e:
            status_label.setText(f"Status: Error - {str(e)}")
            status_label.setStyleSheet("color: red;")
    load_btn.clicked.connect(load_xml)
    layout.addWidget(load_btn)
    
    # Connect signal
    def on_playlist_selected(playlist_name):
        track_count = playlist_selector.get_playlist_track_count(playlist_name)
        status_label.setText(f"Status: Selected '{playlist_name}' ({track_count} tracks)")
        status_label.setStyleSheet("color: blue;")
    
    playlist_selector.playlist_selected.connect(on_playlist_selected)
    
    # Instructions
    instructions = QLabel(
        "Instructions:\n"
        "1. Click 'Load XML File' to load playlists\n"
        "2. Select a playlist from the dropdown\n"
        "3. Check that the track count is displayed"
    )
    instructions.setWordWrap(True)
    layout.addWidget(instructions)
    
    window.show()
    
    print("PlaylistSelector test window opened!")
    print(f"XML file: {xml_path}")
    print("Test the following:")
    print("  - Load XML file button loads playlists")
    print("  - Dropdown is populated with playlist names")
    print("  - Selecting a playlist shows track count")
    print("  - Signal is emitted when playlist is selected")
    
    sys.exit(app.exec())

if __name__ == "__main__":
    test_playlist_selector()

