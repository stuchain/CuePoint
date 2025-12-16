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
from cuepoint.ui.widgets.styles import is_macos


class FileSelector(QWidget):
    """Widget for selecting Rekordbox XML file"""

    file_selected = Signal(str)  # Emitted when file is selected

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components - compact horizontal layout"""
        layout = QHBoxLayout(self)
        layout.setSpacing(6)
        layout.setContentsMargins(0, 0, 0, 0)

        self.path_edit = QLineEdit()
        self.path_edit.setReadOnly(True)
        self.path_edit.setPlaceholderText("No file selected")
        self.path_edit.setStyleSheet("font-size: 11px;")
        self.path_edit.setAccessibleName("Collection XML path")
        self.path_edit.setAccessibleDescription("Shows the selected Rekordbox collection XML file path")
        self.path_edit.setFocusPolicy(Qt.StrongFocus)

        self.browse_btn = QPushButton("Browse...")
        self.browse_btn.setToolTip(
            "Browse for Rekordbox Collection XML file.\n"
            "Export from Rekordbox: File → Export Collection"
        )
        self.browse_btn.clicked.connect(self.browse_file)
        self.browse_btn.setObjectName("secondaryActionButton")
        self.browse_btn.setAccessibleName("Browse for XML file button")
        self.browse_btn.setAccessibleDescription("Opens a file picker to select your Rekordbox collection XML file")
        self.browse_btn.setFocusPolicy(Qt.StrongFocus)

        # Info button
        self.info_btn = QToolButton()
        self.info_btn.setText("ℹ")
        self.info_btn.setToolTip("How to export XML from Rekordbox")
        self.info_btn.setAccessibleName("Rekordbox export instructions button")
        self.info_btn.setAccessibleDescription("Opens instructions for exporting an XML file from Rekordbox")
        self.info_btn.setFocusPolicy(Qt.StrongFocus)
        self.info_btn.clicked.connect(self.show_instructions)

        layout.addWidget(self.path_edit, 1)
        layout.addWidget(self.browse_btn)
        layout.addWidget(self.info_btn)

        # Drag & drop area - hidden but still functional
        self.drop_label = QLabel("")
        self.drop_label.setVisible(False)

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
                    drop_padding = "4px 8px" if is_macos() else "12px"
                    self.drop_label.setStyleSheet(
                        f"padding: {drop_padding}; border: 1px dashed #0A84FF; border-radius: 4px; font-size: 10px;"
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
        self.drop_label.setProperty("drag_over", False)
        drop_padding = "4px 8px" if is_macos() else "12px"
        self.drop_label.setStyleSheet(
            f"padding: {drop_padding}; border: 1px dashed rgba(255, 255, 255, 0.2); border-radius: 4px; font-size: 10px;"
        )
        self.drop_label.setText("or drag & drop XML file here")

    def dropEvent(self, event: QDropEvent):
        """Handle drop event"""
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files and files[0].lower().endswith(".xml"):
            file_path = files[0]
            # Show file preview/confirmation (optional - for now just set file)
            # In future, could show preview dialog here
            self.set_file(file_path)
            event.acceptProposedAction()
        else:
            event.ignore()

        # Reset drop area styling
        self.drop_label.setProperty("drag_over", False)
        drop_padding = "4px 8px" if is_macos() else "12px"
        self.drop_label.setStyleSheet(
            f"padding: {drop_padding}; border: 1px dashed rgba(255, 255, 255, 0.2); border-radius: 4px; font-size: 10px;"
        )
        self.drop_label.setText("or drag & drop XML file here")

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
