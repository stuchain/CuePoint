#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Playlist Selector Module - Playlist dropdown widget

This module contains the PlaylistSelector class for selecting playlists from XML.
"""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox
from PySide6.QtCore import Signal
from cuepoint.data.rekordbox import parse_rekordbox


class PlaylistSelector(QWidget):
    """Widget for selecting playlist from XML"""
    
    playlist_selected = Signal(str)  # Emitted when playlist is selected
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists = {}
        self.tracks_by_id = {}
        self.init_ui()
        
    def init_ui(self):
        """Initialize UI components"""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        
        label = QLabel("Select Playlist:")
        self.combo = QComboBox()
        self.combo.setEnabled(False)
        self.combo.setPlaceholderText("No XML file loaded")
        self.combo.currentTextChanged.connect(self.on_selection_changed)
        
        layout.addWidget(label)
        layout.addWidget(self.combo, 1)
        
    def load_xml_file(self, xml_path: str):
        """Load XML file and populate playlists"""
        try:
            self.tracks_by_id, self.playlists = parse_rekordbox(xml_path)
            
            # Populate combobox
            self.combo.clear()
            if self.playlists:
                playlist_names = sorted(self.playlists.keys())
                self.combo.addItems(playlist_names)
                self.combo.setEnabled(True)
                self.combo.setPlaceholderText("")
            else:
                self.combo.setEnabled(False)
                self.combo.setPlaceholderText("No playlists found in XML")
            
        except FileNotFoundError:
            self.combo.clear()
            self.combo.setEnabled(False)
            self.combo.setPlaceholderText("XML file not found")
            raise
        except Exception as e:
            # Error handling will be done by parent
            self.combo.clear()
            self.combo.setEnabled(False)
            self.combo.setPlaceholderText("Error loading XML")
            raise
            
    def on_selection_changed(self, playlist_name: str):
        """Handle playlist selection change"""
        if playlist_name:
            self.playlist_selected.emit(playlist_name)
            
    def get_selected_playlist(self) -> str:
        """Get currently selected playlist"""
        return self.combo.currentText()
        
    def get_playlist_track_count(self, playlist_name: str) -> int:
        """Get track count for playlist"""
        if playlist_name in self.playlists:
            return len(self.playlists[playlist_name])
        return 0
    
    def clear(self):
        """Clear playlist selection"""
        self.combo.clear()
        self.combo.setEnabled(False)
        self.combo.setPlaceholderText("No XML file loaded")
        self.playlists = {}
        self.tracks_by_id = {}
