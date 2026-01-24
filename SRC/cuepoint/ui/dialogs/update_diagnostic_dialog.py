#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update Confirmation Dialog

Simple dialog with "Update Now" / "Update Later" buttons.
"""

import sys
from pathlib import Path
from typing import Dict
from urllib.parse import urlparse

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
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

        # Download details
        download_url = self.update_info.get("download_url") or ""
        release_notes_url = self.update_info.get("release_notes_url") or ""
        file_size = self.update_info.get("file_size") or 0
        download_filename = "Unknown"
        if download_url:
            try:
                download_filename = Path(urlparse(download_url).path).name or download_filename
            except Exception:
                pass
        size_mb = f"{file_size / (1024 * 1024):.1f} MB" if file_size else "Unknown size"
        download_label = QLabel(f"Download: {download_filename} ({size_mb})")
        download_label.setWordWrap(True)
        layout.addWidget(download_label)

        if download_url:
            url_label = QLabel(f"URL: {download_url}")
            url_label.setWordWrap(True)
            url_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            layout.addWidget(url_label)

        # Lightweight sanity warning for mismatched file type
        expected_ext = ".exe" if sys.platform == "win32" else ".dmg" if sys.platform == "darwin" else ""
        if expected_ext and download_url and not download_url.lower().endswith(expected_ext):
            warn_label = QLabel(
                f"Warning: This update file does not look like a {expected_ext} installer."
            )
            warn_label.setWordWrap(True)
            warn_label.setStyleSheet("color: #b45309;")
            layout.addWidget(warn_label)

        # Quick actions
        actions_layout = QHBoxLayout()
        copy_link_btn = QPushButton("Copy Download Link")
        copy_link_btn.setEnabled(bool(download_url))
        copy_link_btn.clicked.connect(lambda: QApplication.clipboard().setText(download_url))
        actions_layout.addWidget(copy_link_btn)

        open_release_btn = QPushButton("Open Release Page")
        target_url = release_notes_url or download_url
        open_release_btn.setEnabled(bool(target_url))
        open_release_btn.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(target_url)))
        actions_layout.addWidget(open_release_btn)
        layout.addLayout(actions_layout)
        
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
