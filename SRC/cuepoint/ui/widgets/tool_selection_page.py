#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tool Selection Page Module - Main landing page for tool selection

This module contains the ToolSelectionPage class for selecting which tool to use.
"""

from PySide6.QtCore import Qt, Signal
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

        # Title
        title = QLabel("CuePoint")
        title.setAlignment(Qt.AlignCenter)
        title.setStyleSheet(
            "font-size: 48px; "
            "font-weight: bold; "
            "color: #333; "
            "margin-bottom: 20px;"
        )
        layout.addWidget(title)

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

    def get_selected_tool(self) -> str:
        """Get the currently selected tool (for future use if multiple tools)"""
        return "inkey"  # Only tool for now

