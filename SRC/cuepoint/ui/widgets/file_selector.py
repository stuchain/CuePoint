#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
File Selector Module - XML file selection widget

This module contains the FileSelector class for selecting Rekordbox XML files.
"""

import os

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QDragEnterEvent, QDropEvent
from PySide6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from cuepoint.ui.dialogs.rekordbox_instructions_dialog import RekordboxInstructionsDialog


class FileSelector(QWidget):
    """Widget for selecting Rekordbox XML file"""

    file_selected = Signal(str)  # Emitted when file is selected

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(8)

        # File path display
        file_layout = QHBoxLayout()
        label = QLabel("Rekordbox XML File:")
        self.path_edit = QLineEdit()
        self.path_edit.setReadOnly(True)
        self.path_edit.setPlaceholderText("No file selected")

        browse_btn = QPushButton("Browse...")
        browse_btn.clicked.connect(self.browse_file)

        # Add info button
        info_btn = QToolButton()
        info_btn.setText("ℹ️")  # Info emoji
        info_btn.setToolTip("How to export XML from Rekordbox")
        info_btn.setStyleSheet(
            """
            QToolButton {
                font-size: 16px;
                border: none;
                border-radius: 3px;
                padding: 5px;
                background-color: transparent;
                min-width: 30px;
                max-width: 30px;
            }
            QToolButton:hover {
                background-color: rgba(0, 0, 0, 0.05);
            }
            QToolButton:pressed {
                background-color: rgba(0, 0, 0, 0.1);
            }
            """
        )
        info_btn.clicked.connect(self.show_instructions)

        file_layout.addWidget(label)
        file_layout.addWidget(self.path_edit, 1)
        file_layout.addWidget(browse_btn)
        file_layout.addWidget(info_btn)  # Add info button

        layout.addLayout(file_layout)

        # Drag & drop area
        self.drop_label = QLabel("or drag & drop XML file here")
        self.drop_label.setAlignment(Qt.AlignCenter)
        self.drop_label.setProperty("class", "caption")
        self.drop_label.setStyleSheet(
            "padding: 12px; border: 2px dashed rgba(255, 255, 255, 0.2); border-radius: 6px;"
        )
        layout.addWidget(self.drop_label)

        # Enable drag & drop
        self.setAcceptDrops(True)

    def dragEnterEvent(self, event: QDragEnterEvent):
        """Handle drag enter event"""
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if len(urls) == 1:
                file_path = urls[0].toLocalFile()
                if file_path.lower().endswith(".xml"):
                    event.acceptProposedAction()
                    # Visual feedback - highlight drop area
                    self.drop_label.setStyleSheet(
                        "padding: 12px; border: 2px dashed #0A84FF; border-radius: 6px;"
                    )
                else:
                    event.ignore()
            else:
                event.ignore()
        else:
            event.ignore()

    def dragLeaveEvent(self, event):
        """Handle drag leave event"""
        # Reset drop area styling
        self.drop_label.setStyleSheet(
            "padding: 12px; border: 2px dashed rgba(255, 255, 255, 0.2); border-radius: 6px;"
        )

    def dropEvent(self, event: QDropEvent):
        """Handle drop event"""
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files and files[0].lower().endswith(".xml"):
            self.set_file(files[0])
            event.acceptProposedAction()
        else:
            event.ignore()

        # Reset drop area styling
        self.drop_label.setStyleSheet(
            "padding: 12px; border: 2px dashed rgba(255, 255, 255, 0.2); border-radius: 6px;"
        )

    def browse_file(self):
        """Open file browser"""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Select Rekordbox XML File", "", "XML Files (*.xml);;All Files (*)"
        )
        if file_path:
            self.set_file(file_path)

    def set_file(self, file_path: str):
        """Set file path and emit signal"""
        if self.validate_file(file_path):
            self.path_edit.setText(file_path)
            self.path_edit.setStyleSheet("")  # Clear any error styling
            self.file_selected.emit(file_path)
        else:
            # Show error styling
            self.path_edit.setText(file_path)
            self.path_edit.setStyleSheet("color: #FF453A;")
            # Still emit signal so parent can handle error
            self.file_selected.emit(file_path)

    def get_file_path(self) -> str:
        """Get current file path"""
        return self.path_edit.text()

    def validate_file(self, file_path: str) -> bool:
        """Validate that file exists and is XML"""
        if not file_path:
            return False
        if not file_path.lower().endswith(".xml"):
            return False
        return os.path.exists(file_path)

    def show_instructions(self):
        """Show Rekordbox instructions dialog"""
        dialog = RekordboxInstructionsDialog(self)
        dialog.exec()
