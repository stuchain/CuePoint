#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Rekordbox Instructions Dialog Module

This module contains the RekordboxInstructionsDialog class for showing
instructions on how to export XML files from Rekordbox.
"""

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)


class RekordboxInstructionsDialog(QDialog):
    """Dialog showing instructions for exporting XML from Rekordbox"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("How to Export XML from Rekordbox")
        self.setMinimumSize(600, 500)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title = QLabel("How to Export an XML File from Rekordbox")
        title.setStyleSheet(
            "font-size: 20px; "
            "font-weight: bold; "
            "margin-bottom: 10px;"
        )
        layout.addWidget(title)

        # Scroll area for content
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        content_layout.setSpacing(15)
        content_layout.setContentsMargins(10, 10, 10, 10)

        # Introduction
        intro = QLabel(
            "An XML file is a special file that contains all your playlist "
            "information from Rekordbox. Here's how to create one:"
        )
        intro.setWordWrap(True)
        intro.setStyleSheet("font-size: 14px; color: #333;")
        content_layout.addWidget(intro)

        # Step 1
        step1_title = QLabel("Step 1: Open Rekordbox")
        step1_title.setStyleSheet(
            "font-size: 16px; "
            "font-weight: bold; "
            "margin-top: 10px;"
        )
        content_layout.addWidget(step1_title)

        step1_text = QLabel(
            "Open the Rekordbox application on your computer."
        )
        step1_text.setWordWrap(True)
        step1_text.setStyleSheet("font-size: 14px; color: #555;")
        content_layout.addWidget(step1_text)

        # Photo placeholder for Step 1
        photo1 = self._create_photo_placeholder("Step 1: Rekordbox main window")
        content_layout.addWidget(photo1)

        # Step 2
        step2_title = QLabel("Step 2: Go to File Menu")
        step2_title.setStyleSheet(
            "font-size: 16px; "
            "font-weight: bold; "
            "margin-top: 10px;"
        )
        content_layout.addWidget(step2_title)

        step2_text = QLabel(
            "Click on 'File' in the top menu bar, then select 'Export Collection'."
        )
        step2_text.setWordWrap(True)
        step2_text.setStyleSheet("font-size: 14px; color: #555;")
        content_layout.addWidget(step2_text)

        # Photo placeholder for Step 2
        photo2 = self._create_photo_placeholder("Step 2: File menu with Export Collection")
        content_layout.addWidget(photo2)

        # Step 3
        step3_title = QLabel("Step 3: Save the XML File")
        step3_title.setStyleSheet(
            "font-size: 16px; "
            "font-weight: bold; "
            "margin-top: 10px;"
        )
        content_layout.addWidget(step3_title)

        step3_text = QLabel(
            "Choose where you want to save the file and give it a name. "
            "The file will be saved as an XML file (ending in .xml). "
            "Remember where you saved it!"
        )
        step3_text.setWordWrap(True)
        step3_text.setStyleSheet("font-size: 14px; color: #555;")
        content_layout.addWidget(step3_text)

        # Photo placeholder for Step 3
        photo3 = self._create_photo_placeholder("Step 3: Save dialog")
        content_layout.addWidget(photo3)

        # Step 4
        step4_title = QLabel("Step 4: Use the File in inKey")
        step4_title.setStyleSheet(
            "font-size: 16px; "
            "font-weight: bold; "
            "margin-top: 10px;"
        )
        content_layout.addWidget(step4_title)

        step4_text = QLabel(
            "Now you can use this XML file in inKey! Click 'Browse...' "
            "or drag and drop the file into the file selection area."
        )
        step4_text.setWordWrap(True)
        step4_text.setStyleSheet("font-size: 14px; color: #555;")
        content_layout.addWidget(step4_text)

        # What is XML section
        what_is_title = QLabel("What is an XML File?")
        what_is_title.setStyleSheet(
            "font-size: 16px; "
            "font-weight: bold; "
            "margin-top: 20px;"
        )
        content_layout.addWidget(what_is_title)

        what_is_text = QLabel(
            "An XML file is like a digital list that contains information "
            "about all your playlists and tracks in Rekordbox. It's a safe "
            "way to share your playlist data with other programs like inKey. "
            "It doesn't contain your actual music files, just the information "
            "about them (like track names, artists, BPM, etc.)."
        )
        what_is_text.setWordWrap(True)
        what_is_text.setStyleSheet("font-size: 14px; color: #555;")
        content_layout.addWidget(what_is_text)

        content_layout.addStretch()

        scroll.setWidget(content_widget)
        layout.addWidget(scroll)

        # Close button
        button_box = QDialogButtonBox(QDialogButtonBox.Close)
        button_box.rejected.connect(self.accept)
        layout.addWidget(button_box)

    def _create_photo_placeholder(self, description: str) -> QLabel:
        """Create a placeholder for a photo with description"""
        # Try to load image if it exists
        # For now, create a placeholder
        placeholder = QLabel(f"[Photo: {description}]")
        placeholder.setMinimumHeight(200)
        placeholder.setAlignment(Qt.AlignCenter)
        placeholder.setStyleSheet(
            "border: 2px dashed #ccc; "
            "border-radius: 5px; "
            "background-color: #f5f5f5; "
            "color: #999; "
            "padding: 20px;"
        )
        placeholder.setWordWrap(True)

        # TODO: When photos are added, replace this with:
        # photo_path = Path("resources/images/rekordbox_instructions") / f"{step_name}.png"
        # if photo_path.exists():
        #     pixmap = QPixmap(str(photo_path))
        #     placeholder.setPixmap(pixmap.scaled(600, 400, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        #     placeholder.setStyleSheet("")

        return placeholder

