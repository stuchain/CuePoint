#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tool Selection Page Module - Main landing page for tool selection

This module contains the ToolSelectionPage class for selecting which tool to use.
"""

from pathlib import Path
import sys
from typing import Optional, Tuple

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class ToolSelectionPage(QWidget):
    """Widget for selecting which tool to use"""

    tool_selected = Signal(str)  # Emitted when a tool is selected (tool_name)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(30)
        layout.setContentsMargins(50, 50, 50, 50)

        # Logo (top)
        logo_label = self._load_logo(size=(300, 120))
        if logo_label:
            layout.addWidget(logo_label)
            layout.addSpacing(20)

        # Title (optional - logo may replace it)
        # title = QLabel("CuePoint")
        # title.setAlignment(Qt.AlignCenter)
        # title.setStyleSheet(
        #     "font-size: 48px; "
        #     "font-weight: bold; "
        #     "color: #333; "
        #     "margin-bottom: 20px;"
        # )
        # layout.addWidget(title)

        # Subtitle
        subtitle = QLabel("Select a tool to get started")
        subtitle.setAlignment(Qt.AlignCenter)
        subtitle.setStyleSheet(
            "font-size: 18px; "
            "color: #666; "
            "margin-bottom: 40px;"
        )
        layout.addWidget(subtitle)

        # Tool buttons container
        tools_layout = QVBoxLayout()
        tools_layout.setSpacing(20)
        tools_layout.setAlignment(Qt.AlignCenter)

        # inKey button (only tool for now)
        inkey_button = QPushButton("inKey")
        inkey_button.setMinimumSize(300, 80)
        inkey_button.setStyleSheet(
            """
            QPushButton {
                font-size: 24px;
                font-weight: bold;
                background-color: #4A90E2;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 20px;
            }
            QPushButton:hover {
                background-color: #357ABD;
            }
            QPushButton:pressed {
                background-color: #2A5F8F;
            }
            """
        )
        inkey_button.clicked.connect(lambda: self.tool_selected.emit("inkey"))
        tools_layout.addWidget(inkey_button)

        # Tool description
        description = QLabel("Beatport Track Matching")
        description.setAlignment(Qt.AlignCenter)
        description.setStyleSheet(
            "font-size: 14px; "
            "color: #888; "
            "margin-top: 10px;"
        )
        tools_layout.addWidget(description)

        layout.addLayout(tools_layout)
        layout.addStretch()
        
        # Footer logo (bottom)
        footer_logo = self._load_logo(size=(150, 60))
        if footer_logo:
            layout.addWidget(footer_logo)

    def _load_logo(self, size: Optional[Tuple[int, int]] = None) -> Optional[QLabel]:
        """Load and display the logo image.
        
        Args:
            size: Optional tuple (width, height) to scale the logo.
        
        Returns:
            QLabel with logo pixmap, or None if logo not found.
        """
        # Determine the logo path
        if getattr(sys, 'frozen', False):
            # Running as packaged app
            if hasattr(sys, '_MEIPASS'):
                base_path = Path(sys._MEIPASS)
            else:
                import os
                base_path = Path(os.path.dirname(sys.executable))
            logo_path = base_path / 'assets' / 'icons' / 'logo.png'
        else:
            # Running as script - use SRC/cuepoint/ui/assets/icons
            # This file is at SRC/cuepoint/ui/widgets/tool_selection_page.py
            # So parent.parent is SRC/cuepoint/ui/
            base_path = Path(__file__).resolve().parent.parent
            logo_path = base_path / 'assets' / 'icons' / 'logo.png'
        
        if not logo_path.exists():
            return None
        
        try:
            pixmap = QPixmap(str(logo_path))
            if pixmap.isNull():
                return None
            
            # Scale if size specified
            if size:
                width, height = size
                pixmap = pixmap.scaled(
                    width, height,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )
            
            logo_label = QLabel()
            logo_label.setPixmap(pixmap)
            logo_label.setAlignment(Qt.AlignCenter)
            return logo_label
        except Exception:
            return None

    def get_selected_tool(self) -> str:
        """Get the currently selected tool (for future use if multiple tools)"""
        return "inkey"  # Only tool for now

