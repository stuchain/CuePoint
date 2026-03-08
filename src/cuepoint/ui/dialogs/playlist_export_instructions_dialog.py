#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Playlist Export Instructions Dialog

Instructions for exporting a playlist as M3U/M3U8 from Rekordbox.
"""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)


class PlaylistExportInstructionsDialog(QDialog):
    """Dialog showing instructions for exporting a playlist as M3U from Rekordbox."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("How to Export a Playlist as M3U from Rekordbox")
        self.setMinimumSize(500, 400)
        self.resize(550, 450)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components."""
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(20, 20, 20, 20)

        title = QLabel("How to Export a Playlist as M3U/M3U8 from Rekordbox")
        title.setStyleSheet("font-size: 18px; font-weight: bold; margin-bottom: 10px;")
        layout.addWidget(title)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)

        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        content_layout.setSpacing(15)
        content_layout.setContentsMargins(20, 10, 30, 10)

        intro = QLabel(
            "An M3U or M3U8 file is a playlist file that lists the paths to your "
            "audio files. CuePoint can use it to process tracks without loading "
            "the full Rekordbox collection. Here's how to export one from Rekordbox:"
        )
        intro.setWordWrap(True)
        intro.setStyleSheet("font-size: 14px; color: #cccccc;")
        content_layout.addWidget(intro)

        step1_title = QLabel("Step 1: Open Rekordbox")
        step1_title.setStyleSheet("font-size: 16px; font-weight: bold; margin-top: 10px;")
        content_layout.addWidget(step1_title)
        step1_text = QLabel("Open Rekordbox and go to the Playlist view.")
        step1_text.setWordWrap(True)
        step1_text.setStyleSheet("font-size: 14px; color: #cccccc;")
        content_layout.addWidget(step1_text)

        step2_title = QLabel("Step 2: Select Your Playlist")
        step2_title.setStyleSheet("font-size: 16px; font-weight: bold; margin-top: 10px;")
        content_layout.addWidget(step2_title)
        step2_text = QLabel(
            "In the playlist list, select the playlist you want to export."
        )
        step2_text.setWordWrap(True)
        step2_text.setStyleSheet("font-size: 14px; color: #cccccc;")
        content_layout.addWidget(step2_text)

        step3_title = QLabel("Step 3: Export as M3U")
        step3_title.setStyleSheet("font-size: 16px; font-weight: bold; margin-top: 10px;")
        content_layout.addWidget(step3_title)
        step3_text = QLabel(
            "Right-click the playlist and look for an option such as "
            "'Export playlist', 'Export as M3U', or 'Save as M3U'. "
            "Choose a location and save the file. The file may have the extension "
            ".m3u or .m3u8 (both work in CuePoint)."
        )
        step3_text.setWordWrap(True)
        step3_text.setStyleSheet("font-size: 14px; color: #cccccc;")
        content_layout.addWidget(step3_text)

        step4_title = QLabel("Step 4: Use in CuePoint")
        step4_title.setStyleSheet("font-size: 16px; font-weight: bold; margin-top: 10px;")
        content_layout.addWidget(step4_title)
        step4_text = QLabel(
            "In CuePoint, click 'Playlist file', then use Browse to select "
            "the saved .m3u or .m3u8 file. You can then run matching and sync "
            "without loading the full collection XML."
        )
        step4_text.setWordWrap(True)
        step4_text.setStyleSheet("font-size: 14px; color: #cccccc;")
        content_layout.addWidget(step4_text)

        scroll.setWidget(content_widget)
        layout.addWidget(scroll)

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok)
        buttons.accepted.connect(self.accept)
        layout.addWidget(buttons)
