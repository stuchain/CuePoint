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
        from PySide6.QtGui import QPixmap
        import sys
        import os
        
        placeholder = QLabel()
        placeholder.setMinimumHeight(200)
        placeholder.setAlignment(Qt.AlignCenter)
        placeholder.setWordWrap(True)
        
        # Determine the resource path
        # In development: SRC/cuepoint/ui/resources/images/rekordbox_instructions/
        # In frozen app: resources/images/rekordbox_instructions/ (in _MEIPASS)
        if getattr(sys, 'frozen', False):
            # Running as packaged app
            if hasattr(sys, '_MEIPASS'):
                base_path = Path(sys._MEIPASS)
            else:
                base_path = Path(os.path.dirname(sys.executable))
        else:
            # Running as script - use SRC/cuepoint/ui/resources
            # __file__ is at SRC/cuepoint/ui/dialogs/rekordbox_instructions_dialog.py
            # So parent.parent is SRC/cuepoint/ui/
            # Use resolve() to get absolute path
            base_path = Path(__file__).resolve().parent.parent / 'resources'
        
        # Extract step number from description (e.g., "Step 1: ..." -> "step1")
        # Description format: "Step 1: Rekordbox main window" -> "step1"
        import re
        match = re.search(r'step\s*(\d+)', description.lower())
        if match:
            step_num = match.group(1)
            step_name = f'step{step_num}'
        else:
            # Fallback: try to extract from first word
            step_name = description.lower().split()[0] if description else 'step1'
        photo_path = (base_path / 'images' / 'rekordbox_instructions' / f'{step_name}.png').resolve()
        
        # Try to load the image
        if photo_path.exists():
            try:
                pixmap = QPixmap(str(photo_path))
                if not pixmap.isNull():
                    # Scale to fit width (600px) while maintaining aspect ratio
                    scaled_pixmap = pixmap.scaled(
                        600, 400, 
                        Qt.AspectRatioMode.KeepAspectRatio, 
                        Qt.TransformationMode.SmoothTransformation
                    )
                    placeholder.setPixmap(scaled_pixmap)
                    placeholder.setStyleSheet("")
                    return placeholder
            except Exception as e:
                # If loading fails, log error and fall through to placeholder
                import logging
                logging.getLogger(__name__).warning(f"Failed to load image {photo_path}: {e}")
                pass
        else:
            # Debug: Log when image file is not found (only in debug mode)
            import logging
            logger = logging.getLogger(__name__)
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(f"Image not found at: {photo_path} (base_path: {base_path}, step_name: {step_name})")
        
        # Fallback: show placeholder if image not found
        placeholder.setText(f"[Photo: {description}]")
        placeholder.setStyleSheet(
            "border: 2px dashed #ccc; "
            "border-radius: 5px; "
            "background-color: #f5f5f5; "
            "color: #999; "
            "padding: 20px;"
        )
        return placeholder

