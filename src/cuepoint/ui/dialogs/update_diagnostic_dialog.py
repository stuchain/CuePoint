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
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
)


class UpdateDiagnosticDialog(QDialog):
    """Simple dialog for update confirmation."""

    def __init__(self, update_info: Dict, parent=None):
        """
        Initialize confirmation dialog.

        Args:
            update_info: Update information dictionary
            parent: Parent widget (None on macOS to avoid dialog crash)
        """
        if sys.platform == "darwin":
            parent = None  # Avoid macOS parent-related crashes
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
        version = self.update_info.get("short_version") or self.update_info.get(
            "version", "Unknown"
        )
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
                download_filename = (
                    Path(urlparse(download_url).path).name or download_filename
                )
            except Exception:
                pass
        size_mb = f"{file_size / (1024 * 1024):.1f} MB" if file_size else "Unknown size"
        download_label = QLabel(f"Download: {download_filename} ({size_mb})")
        download_label.setWordWrap(True)
        layout.addWidget(download_label)

        # Lightweight sanity warning for mismatched file type
        expected_ext = (
            ".exe"
            if sys.platform == "win32"
            else ".dmg"
            if sys.platform == "darwin"
            else ""
        )
        if (
            expected_ext
            and download_url
            and not download_url.lower().endswith(expected_ext)
        ):
            warn_label = QLabel(
                f"Warning: This update file does not look like a {expected_ext} installer."
            )
            warn_label.setWordWrap(True)
            warn_label.setStyleSheet("color: #b45309;")
            layout.addWidget(warn_label)

        # Buttons row: Open Release Page (left, purple) | Update Later | Update Now (right)
        buttons_layout = QHBoxLayout()
        buttons_layout.setSpacing(10)

        open_release_btn = QPushButton("Open Release Page")
        open_release_btn.setMinimumWidth(120)
        open_release_btn.setStyleSheet(
            "QPushButton { background-color: #7c3aed; color: white; }"
            "QPushButton:hover { background-color: #8b5cf6; }"
            "QPushButton:disabled { background-color: #4b5563; color: #9ca3af; }"
        )
        target_url = release_notes_url or download_url
        open_release_btn.setEnabled(bool(target_url))
        open_release_btn.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl(target_url))
        )
        buttons_layout.addWidget(open_release_btn)

        self.update_later_button = QPushButton("Update Later")
        self.update_later_button.setMinimumWidth(120)
        buttons_layout.addWidget(self.update_later_button)

        self.update_now_button = QPushButton("Update Now")
        self.update_now_button.setDefault(True)
        self.update_now_button.setMinimumWidth(120)
        buttons_layout.addWidget(self.update_now_button)

        buttons_layout.addStretch(1)
        layout.addLayout(buttons_layout)

        # Connect signals
        self.update_now_button.clicked.connect(self.accept)
        self.update_later_button.clicked.connect(self.reject)
