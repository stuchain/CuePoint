#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update Confirmation Dialog

Simple dialog with "Update Now" / "Update Later" buttons.
"""

from typing import Dict

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QPushButton,
    QVBoxLayout,
)


class UpdateDiagnosticDialog(QDialog):
    """Simple dialog for update confirmation."""
    
    def __init__(
        self,
        update_info: Dict,
        parent=None
    ):
        """
        Initialize confirmation dialog.
        
        Args:
            update_info: Update information dictionary
            parent: Parent widget
        """
        super().__init__(parent)
        self.update_info = update_info
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up UI components."""
        self.setWindowTitle("Update Available")
        self.setMinimumWidth(400)
        self.setMinimumHeight(150)
        
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Title
        title = QLabel("Update Available")
        title_font = title.font()
        title_font.setPointSize(14)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)
        
        # Version info
        version = self.update_info.get("short_version") or self.update_info.get("version", "Unknown")
        version_label = QLabel(f"A new version ({version}) is available.")
        version_label.setWordWrap(True)
        layout.addWidget(version_label)
        
        # Buttons
        button_box = QDialogButtonBox(Qt.Horizontal, self)
        
        self.update_now_button = QPushButton("Update Now")
        self.update_now_button.setDefault(True)
        button_box.addButton(self.update_now_button, QDialogButtonBox.AcceptRole)
        
        self.update_later_button = QPushButton("Update Later")
        button_box.addButton(self.update_later_button, QDialogButtonBox.RejectRole)
        
        layout.addWidget(button_box)
        
        # Connect signals
        self.update_now_button.clicked.connect(self.accept)
        self.update_later_button.clicked.connect(self.reject)
