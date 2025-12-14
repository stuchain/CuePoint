#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update UI components.

Provides dialogs and UI elements for update notifications.
"""

import html
from typing import Callable, Dict, Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QDesktopServices, QTextDocument
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from cuepoint.update.version_utils import get_version_display_string


class UpdateAvailableDialog(QDialog):
    """
    Dialog shown when an update is available.
    
    Shows version information, release notes, and action buttons.
    """
    
    # Dialog result signals
    install_clicked = Signal()
    later_clicked = Signal()
    skip_clicked = Signal()
    
    def __init__(
        self,
        current_version: str,
        update_info: Dict,
        parent: Optional[QWidget] = None
    ):
        """
        Initialize update dialog.
        
        Args:
            current_version: Current application version
            update_info: Update information dictionary
            parent: Parent widget
        """
        super().__init__(parent)
        self.current_version = current_version
        self.update_info = update_info
        
        self._setup_ui()
    
    def _setup_ui(self) -> None:
        """Setup dialog UI."""
        self.setWindowTitle("Update Available")
        self.setMinimumWidth(500)
        self.setMinimumHeight(400)
        
        layout = QVBoxLayout(self)
        
        # Title
        title = QLabel("Update Available")
        title_font = title.font()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)
        
        # Version information
        new_version = self.update_info.get('short_version') or self.update_info.get('version', 'Unknown')
        version_text = f"You have {get_version_display_string(self.current_version)}.\n"
        version_text += f"{get_version_display_string(new_version)} is available."
        
        version_label = QLabel(version_text)
        version_label.setWordWrap(True)
        layout.addWidget(version_label)
        
        # File size
        file_size = self.update_info.get('file_size', 0)
        if file_size > 0:
            size_mb = file_size / (1024 * 1024)
            size_label = QLabel(f"Download size: {size_mb:.1f} MB")
            layout.addWidget(size_label)
        
        # Release notes
        release_notes = self.update_info.get('release_notes')
        if release_notes:
            notes_label = QLabel("What's New:")
            notes_label.setWordWrap(True)
            layout.addWidget(notes_label)
            
            # Use QTextBrowser for HTML support
            notes_browser = QTextBrowser()
            notes_browser.setMaximumHeight(150)
            notes_browser.setReadOnly(True)
            
            # Escape HTML and format
            notes_html = html.escape(release_notes)
            # Convert basic markdown-like formatting to HTML
            notes_html = notes_html.replace('\n', '<br>')
            notes_browser.setHtml(notes_html)
            
            layout.addWidget(notes_browser)
        
        # More details link
        release_notes_url = self.update_info.get('release_notes_url')
        if release_notes_url:
            details_label = QLabel(f'<a href="{release_notes_url}">More details...</a>')
            details_label.setOpenExternalLinks(True)
            layout.addWidget(details_label)
        
        # Buttons
        button_box = QDialogButtonBox(Qt.Horizontal, self)
        
        # Install button (primary)
        install_button = QPushButton("Download & Install")
        install_button.setDefault(True)
        button_box.addButton(install_button, QDialogButtonBox.AcceptRole)
        
        # Later button
        later_button = QPushButton("Remind Me Later")
        button_box.addButton(later_button, QDialogButtonBox.RejectRole)
        
        # Skip button
        skip_button = QPushButton("Skip This Version")
        button_box.addButton(skip_button, QDialogButtonBox.ActionRole)
        
        layout.addWidget(button_box)
        
        # Connect signals
        install_button.clicked.connect(self._on_install)
        later_button.clicked.connect(self._on_later)
        skip_button.clicked.connect(self._on_skip)
    
    def _on_install(self) -> None:
        """Handle install button click."""
        self.accept()
        self.install_clicked.emit()
    
    def _on_later(self) -> None:
        """Handle later button click."""
        self.reject()
        self.later_clicked.emit()
    
    def _on_skip(self) -> None:
        """Handle skip button click."""
        self.reject()
        self.skip_clicked.emit()


class UpdateErrorDialog(QDialog):
    """
    Dialog shown when update check fails.
    """
    
    def __init__(
        self,
        error_message: str,
        parent: Optional[QWidget] = None
    ):
        """
        Initialize error dialog.
        
        Args:
            error_message: Error message to display
            parent: Parent widget
        """
        super().__init__(parent)
        self._setup_ui(error_message)
    
    def _setup_ui(self, error_message: str) -> None:
        """Setup dialog UI."""
        self.setWindowTitle("Update Check Failed")
        self.setMinimumWidth(400)
        
        layout = QVBoxLayout(self)
        
        # Error message
        error_label = QLabel("Unable to check for updates:")
        error_label.setWordWrap(True)
        layout.addWidget(error_label)
        
        message_label = QLabel(error_message)
        message_label.setWordWrap(True)
        layout.addWidget(message_label)
        
        # Buttons
        button_box = QDialogButtonBox(QDialogButtonBox.Ok, self)
        button_box.accepted.connect(self.accept)
        layout.addWidget(button_box)


def show_update_dialog(
    current_version: str,
    update_info: Dict,
    parent: Optional[QWidget] = None,
    on_install: Optional[Callable[[], None]] = None,
    on_later: Optional[Callable[[], None]] = None,
    on_skip: Optional[Callable[[], None]] = None
) -> int:
    """
    Show update available dialog.
    
    Args:
        current_version: Current application version
        update_info: Update information dictionary
        parent: Parent widget
        on_install: Callback for install action
        on_later: Callback for later action
        on_skip: Callback for skip action
        
    Returns:
        Dialog result code
    """
    dialog = UpdateAvailableDialog(current_version, update_info, parent)
    
    if on_install:
        dialog.install_clicked.connect(on_install)
    if on_later:
        dialog.later_clicked.connect(on_later)
    if on_skip:
        dialog.skip_clicked.connect(on_skip)
    
    return dialog.exec()


def show_update_error_dialog(
    error_message: str,
    parent: Optional[QWidget] = None
) -> int:
    """
    Show update error dialog.
    
    Args:
        error_message: Error message to display
        parent: Parent widget
        
    Returns:
        Dialog result code
    """
    dialog = UpdateErrorDialog(error_message, parent)
    return dialog.exec()
