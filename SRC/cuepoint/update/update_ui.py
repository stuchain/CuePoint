#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update UI components.

Provides dialogs and UI elements for update notifications.
"""

import html
from typing import Callable, Dict, Optional

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QDesktopServices, QTextDocument
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QGroupBox,
    QLabel,
    QProgressBar,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from cuepoint.update.version_utils import get_version_display_string as format_version_string


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
        from cuepoint.version import get_version_display_string as get_app_version_display
        version_text = f"You have {get_app_version_display()}.\n"
        version_text += f"{format_version_string(new_version)} is available."
        
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


class UpdateCheckDialog(QDialog):
    """
    Dialog shown when checking for updates manually.
    
    Shows current version, checking status, and results.
    """
    
    def __init__(
        self,
        current_version: str,
        parent: Optional[QWidget] = None
    ):
        """
        Initialize update check dialog.
        
        Args:
            current_version: Current application version
            parent: Parent widget
        """
        super().__init__(parent)
        self.current_version = current_version
        self.update_info: Optional[Dict] = None
        
        self._setup_ui()
    
    def _setup_ui(self) -> None:
        """Setup dialog UI."""
        self.setWindowTitle("Check for Updates")
        self.setMinimumWidth(600)
        self.setMinimumHeight(400)
        self.setModal(False)  # Non-modal so it doesn't block
        
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Title
        title = QLabel("Checking for Updates")
        title_font = title.font()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)
        
        # Current version section
        current_group = QGroupBox("Current Version")
        current_layout = QVBoxLayout()
        from cuepoint.version import get_version_display_string, get_build_info
        
        current_version_label = QLabel(f"Version: {get_version_display_string()}")
        current_version_label.setStyleSheet("font-size: 12px;")
        current_layout.addWidget(current_version_label)
        
        build_info = get_build_info()
        if build_info.get("build_date"):
            build_date_label = QLabel(f"Built: {build_info['build_date']}")
            build_date_label.setStyleSheet("font-size: 11px; color: #666;")
            current_layout.addWidget(build_date_label)
        
        current_group.setLayout(current_layout)
        layout.addWidget(current_group)
        
        # Status section
        status_group = QGroupBox("Status")
        status_layout = QVBoxLayout()
        
        self.status_label = QLabel("Initializing update check...")
        self.status_label.setWordWrap(True)
        self.status_label.setStyleSheet("font-size: 12px; padding: 5px;")
        status_layout.addWidget(self.status_label)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 0)  # Indeterminate progress
        self.progress_bar.setVisible(False)
        status_layout.addWidget(self.progress_bar)
        
        status_group.setLayout(status_layout)
        layout.addWidget(status_group)
        
        # Results section (initially hidden)
        self.results_group = QGroupBox("Update Information")
        results_layout = QVBoxLayout()
        
        self.results_label = QLabel()
        self.results_label.setWordWrap(True)
        self.results_label.setStyleSheet("font-size: 12px; padding: 5px;")
        results_layout.addWidget(self.results_label)
        
        self.details_text = QTextBrowser()
        self.details_text.setMaximumHeight(150)
        self.details_text.setReadOnly(True)
        self.details_text.setVisible(False)
        results_layout.addWidget(self.details_text)
        
        self.results_group.setLayout(results_layout)
        self.results_group.setVisible(False)
        layout.addWidget(self.results_group)
        
        # Buttons
        button_box = QDialogButtonBox(Qt.Horizontal, self)
        
        self.close_button = QPushButton("Close")
        self.close_button.setDefault(True)
        button_box.addButton(self.close_button, QDialogButtonBox.AcceptRole)
        
        self.download_button = QPushButton("Download & Install")
        self.download_button.setVisible(False)
        button_box.addButton(self.download_button, QDialogButtonBox.AcceptRole)
        
        layout.addWidget(button_box)
        
        # Connect signals
        self.close_button.clicked.connect(self.accept)
        self.download_button.clicked.connect(self._on_download)
    
    def set_status(self, message: str, show_progress: bool = False) -> None:
        """Update status message.
        
        Args:
            message: Status message to display
            show_progress: Whether to show progress bar
        """
        self.status_label.setText(message)
        self.progress_bar.setVisible(show_progress)
        if show_progress:
            self.progress_bar.setRange(0, 0)  # Indeterminate
    
    def set_checking(self) -> None:
        """Set status to checking."""
        self.set_status("Checking for updates...", show_progress=True)
        self.results_group.setVisible(False)
        self.download_button.setVisible(False)
    
    def set_update_found(self, update_info: Dict) -> None:
        """Set status to update found.
        
        Args:
            update_info: Update information dictionary
        """
        self.update_info = update_info
        self.progress_bar.setVisible(False)
        
        new_version = update_info.get('short_version') or update_info.get('version', 'Unknown')
        from cuepoint.version import get_version_display_string as get_app_version_display
        
        status_text = f"✓ Update available!"
        self.set_status(status_text, show_progress=False)
        
        # Show results
        self.results_group.setVisible(True)
        
        results_html = f"""
        <b>New Version Available:</b><br>
        Version {new_version}<br><br>
        
        <b>Current Version:</b><br>
        {get_app_version_display()}<br><br>
        """
        
        # Add file size if available
        file_size = update_info.get('file_size', 0)
        if file_size > 0:
            size_mb = file_size / (1024 * 1024)
            results_html += f"<b>Download Size:</b> {size_mb:.1f} MB<br><br>"
        
        # Add release notes URL if available
        release_notes_url = update_info.get('release_notes_url')
        if release_notes_url:
            results_html += f'<a href="{release_notes_url}">View Release Notes</a><br><br>'
        
        # Add download URL if available
        download_url = update_info.get('download_url')
        if download_url:
            results_html += f'<a href="{download_url}">Direct Download Link</a>'
        
        self.results_label.setText(results_html)
        
        # Show release notes if available
        release_notes = update_info.get('release_notes')
        if release_notes:
            notes_html = html.escape(release_notes)
            notes_html = notes_html.replace('\n', '<br>')
            self.details_text.setHtml(f"<b>What's New:</b><br>{notes_html}")
            self.details_text.setVisible(True)
        
        # Show download button
        self.download_button.setVisible(True)
        self.download_button.setDefault(True)
        self.close_button.setDefault(False)
    
    def set_no_update(self) -> None:
        """Set status to no update available."""
        self.progress_bar.setVisible(False)
        self.set_status("✓ You are using the latest version.", show_progress=False)
        self.results_group.setVisible(False)
        self.download_button.setVisible(False)
    
    def set_error(self, error_message: str) -> None:
        """Set status to error.
        
        Args:
            error_message: Error message to display
        """
        self.progress_bar.setVisible(False)
        self.set_status(f"✗ Error: {error_message}", show_progress=False)
        self.results_group.setVisible(False)
        self.download_button.setVisible(False)
    
    def _on_download(self) -> None:
        """Handle download button click."""
        if self.update_info:
            # Emit signal or call callback
            self.accept()
            # The parent will handle the download via the update manager


def show_update_check_dialog(
    current_version: str,
    parent: Optional[QWidget] = None
) -> UpdateCheckDialog:
    """
    Show update check dialog.
    
    Args:
        current_version: Current application version
        parent: Parent widget
        
    Returns:
        UpdateCheckDialog instance (caller can update it)
    """
    dialog = UpdateCheckDialog(current_version, parent)
    dialog.show()  # Show non-modal
    return dialog
