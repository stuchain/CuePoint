#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Playlist Selector Module - Playlist dropdown widget

This module contains the PlaylistSelector class for selecting playlists from XML.
"""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QComboBox, QHBoxLayout, QWidget

from cuepoint.data.rekordbox import parse_rekordbox
from cuepoint.models.playlist import Playlist
from cuepoint.ui.strings import EmptyState, TooltipCopy


class PlaylistSelector(QWidget):
    """Widget for selecting playlist from XML"""

    playlist_selected = Signal(str)  # Emitted when playlist is selected

    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists: dict[str, Playlist] = {}
        self.init_ui()

    def init_ui(self):
        """Initialize UI components - compact, no label (box title is enough)"""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        self.combo = QComboBox()
        self.combo.setEnabled(False)
        self.combo.setPlaceholderText(EmptyState.NO_PLAYLIST_TITLE)
        self.combo.setToolTip(TooltipCopy.PLAYLIST)
        self.combo.setAccessibleName("Playlist selector")
        self.combo.setAccessibleDescription(
            "Select a playlist from the loaded Rekordbox collection XML"
        )
        self.combo.setFocusPolicy(Qt.StrongFocus)
        self.combo.currentTextChanged.connect(self.on_selection_changed)
        self.combo.setStyleSheet("font-size: 11px;")

        layout.addWidget(self.combo, 1)

    def load_xml_file(self, xml_path: str):
        """Load XML file and populate playlists"""
        try:
            self.playlists = parse_rekordbox(xml_path)

            # Populate combobox
            self.combo.clear()
            if self.playlists:
                playlist_names = sorted(self.playlists.keys())
                self.combo.addItems(playlist_names)
                self.combo.setEnabled(True)
                self.combo.setPlaceholderText("")  # Has selection
            else:
                self.combo.setEnabled(False)
                self.combo.setPlaceholderText(EmptyState.NO_PLAYLISTS_IN_XML)

        except FileNotFoundError:
            self.combo.clear()
            self.combo.setEnabled(False)
            self.combo.setPlaceholderText(EmptyState.XML_NOT_FOUND)
            raise
        except Exception:
            # Error handling will be done by parent
            self.combo.clear()
            self.combo.setEnabled(False)
            self.combo.setPlaceholderText(EmptyState.ERROR_LOADING_XML)
            raise

    def on_selection_changed(self, playlist_name: str):
        """Handle playlist selection change"""
        if playlist_name:
            self.playlist_selected.emit(playlist_name)

    def get_selected_playlist(self) -> str:
        """Get currently selected playlist"""
        return self.combo.currentText()

    def set_selected_playlist(self, playlist_name: str) -> None:
        """Set the selected playlist by name (Step 8 - autosave restore)."""
        if not playlist_name or playlist_name not in self.playlists:
            return
        idx = self.combo.findText(playlist_name)
        if idx >= 0:
            self.combo.setCurrentIndex(idx)

    def get_playlist_track_count(self, playlist_name: str) -> int:
        """Get track count for playlist"""
        if playlist_name in self.playlists:
            return self.playlists[playlist_name].get_track_count()
        return 0

    def clear(self):
        """Clear playlist selection"""
        self.combo.clear()
        self.combo.setEnabled(False)
        self.combo.setPlaceholderText(EmptyState.NO_XML_LOADED)
        self.playlists = {}
