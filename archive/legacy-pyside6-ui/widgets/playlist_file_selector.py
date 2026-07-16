#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Playlist File Selector - M3U/M3U8 file selection widget

Widget for selecting a playlist file (.m3u or .m3u8) for the "Playlist file" source.
"""

import os

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QLineEdit,
    QPushButton,
    QToolButton,
    QWidget,
)

from cuepoint.ui.dialogs.playlist_export_instructions_dialog import (
    PlaylistExportInstructionsDialog,
)
from cuepoint.ui.strings import ButtonCopy


class PlaylistFileSelector(QWidget):
    """Widget for selecting an M3U or M3U8 playlist file."""

    playlist_file_selected = Signal(str)  # Emitted when file is selected

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components - path edit, Browse, info button."""
        layout = QHBoxLayout(self)
        layout.setSpacing(6)
        layout.setContentsMargins(0, 0, 0, 0)

        self.path_edit = QLineEdit()
        self.path_edit.setReadOnly(True)
        self.path_edit.setPlaceholderText("Select a playlist file (.m3u or .m3u8)")
        self.path_edit.setStyleSheet("font-size: 11px; color: #e0e0e0;")
        self.path_edit.setAccessibleName("Playlist file path")
        self.path_edit.setAccessibleDescription(
            "Shows the selected M3U or M3U8 playlist file path"
        )
        self.path_edit.setFocusPolicy(Qt.StrongFocus)

        self.browse_btn = QPushButton(ButtonCopy.BROWSE)
        self.browse_btn.setToolTip("Select an M3U or M3U8 playlist file")
        self.browse_btn.clicked.connect(self.browse_file)
        self.browse_btn.setObjectName("secondaryActionButton")
        self.browse_btn.setAccessibleName("Browse for playlist file button")
        self.browse_btn.setAccessibleDescription(
            "Opens a file picker to select an M3U or M3U8 playlist file"
        )
        self.browse_btn.setFocusPolicy(Qt.StrongFocus)

        self.info_btn = QToolButton()
        self.info_btn.setText("ℹ")
        self.info_btn.setToolTip("How to export a playlist as M3U from Rekordbox")
        self.info_btn.setAccessibleName("Playlist export instructions button")
        self.info_btn.setAccessibleDescription(
            "Opens instructions for exporting a playlist as M3U from Rekordbox"
        )
        self.info_btn.setFocusPolicy(Qt.StrongFocus)
        self.info_btn.clicked.connect(self.show_instructions)

        layout.addWidget(self.path_edit, 1)
        layout.addWidget(self.browse_btn)
        layout.addWidget(self.info_btn)

    def browse_file(self):
        """Open file browser for .m3u / .m3u8."""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Playlist File",
            "",
            "Playlist files (*.m3u *.m3u8);;All Files (*)",
        )
        if file_path:
            self.set_file(file_path)

    def set_file(self, file_path: str):
        """Set file path and emit signal."""
        if self.validate_file(file_path):
            self.path_edit.setText(file_path)
            self.path_edit.setStyleSheet("font-size: 11px; color: #e0e0e0;")
            self.playlist_file_selected.emit(file_path)
        else:
            self.path_edit.setText(file_path)
            self.path_edit.setStyleSheet("font-size: 11px; color: #FF453A;")
            self.playlist_file_selected.emit(file_path)

    def get_file_path(self) -> str:
        """Return current file path."""
        return self.path_edit.text().strip()

    def validate_file(self, file_path: str) -> bool:
        """Return True if path exists and has extension .m3u or .m3u8."""
        if not file_path:
            return False
        if not os.path.exists(file_path):
            return False
        ext = os.path.splitext(file_path)[1].lower()
        return ext in (".m3u", ".m3u8")

    def clear(self):
        """Clear the current path."""
        self.path_edit.clear()
        self.path_edit.setStyleSheet("font-size: 11px; color: #e0e0e0;")

    def show_instructions(self):
        """Show playlist export instructions dialog."""
        dialog = PlaylistExportInstructionsDialog(self)
        dialog.exec()
