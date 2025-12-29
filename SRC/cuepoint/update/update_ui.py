#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update UI components.

Provides dialogs and UI elements for update notifications.
"""

import html
from typing import Callable, Dict, Optional

from PySide6.QtCore import Qt, Signal, QTimer, QUrl
from PySide6.QtGui import QDesktopServices, QTextDocument, QClipboard
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QDialogButtonBox,
    QGroupBox,
    QLabel,
    QMenu,
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
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            # Validate parent before passing to super()
            if parent is not None:
                try:
                    # Quick validation that parent is a valid QWidget
                    if not hasattr(parent, 'windowTitle'):
                        logger.warning("Parent does not have windowTitle, using None")
                        parent = None
                except (RuntimeError, AttributeError):
                    logger.warning("Parent widget validation failed, using None")
                    parent = None
            
            super().__init__(parent)
            self.current_version = current_version
            self.update_info: Optional[Dict] = None
            self._download_url: Optional[str] = None  # Store download URL for context menu
            
            self._setup_ui()
        except Exception as e:
            logger.error(f"Error in UpdateCheckDialog.__init__: {e}", exc_info=True)
            # Try to complete initialization even if _setup_ui fails
            try:
                super().__init__(parent)
                self.current_version = current_version
                self.update_info = None
                self._download_url = None
            except:
                raise
    
    def _setup_ui(self) -> None:
        """Setup dialog UI."""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
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
            
            try:
                from cuepoint.version import get_version_display_string, get_build_info
                
                current_version_label = QLabel(f"Version: {get_version_display_string()}")
                current_version_label.setStyleSheet("font-size: 12px;")
                current_layout.addWidget(current_version_label)
                
                build_info = get_build_info()
                if build_info and build_info.get("build_date"):
                    build_date_label = QLabel(f"Built: {build_info['build_date']}")
                    build_date_label.setStyleSheet("font-size: 11px; color: #666;")
                    current_layout.addWidget(build_date_label)
            except Exception as version_error:
                logger.warning(f"Could not get version info: {version_error}")
                # Fallback: use current_version parameter
                current_version_label = QLabel(f"Version: {self.current_version}")
                current_version_label.setStyleSheet("font-size: 12px;")
                current_layout.addWidget(current_version_label)
            
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
            self.results_label.setOpenExternalLinks(False)  # We'll handle links manually for copy support
            self.results_label.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
            self.results_label.customContextMenuRequested.connect(self._on_results_label_context_menu)
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
            self.download_button.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
            self.download_button.customContextMenuRequested.connect(self._on_download_button_context_menu)
            button_box.addButton(self.download_button, QDialogButtonBox.AcceptRole)
            
            layout.addWidget(button_box)
            
            # Connect signals
            self.close_button.clicked.connect(self.accept)
            # Note: download_button is connected by parent (main_window.py) after update is found
            # We don't connect it here to avoid conflicts
        except Exception as ui_error:
            logger.error(f"Error in _setup_ui: {ui_error}", exc_info=True)
            # Try to create minimal UI as fallback
            try:
                layout = QVBoxLayout(self)
                error_label = QLabel(f"Error setting up update dialog: {str(ui_error)}")
                error_label.setWordWrap(True)
                layout.addWidget(error_label)
                close_btn = QPushButton("Close")
                close_btn.clicked.connect(self.close)
                layout.addWidget(close_btn)
            except Exception as fallback_error:
                logger.error(f"Could not even create fallback UI: {fallback_error}", exc_info=True)
                raise
    
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
        # Store update_info immediately to ensure it's available when button is clicked
        self.update_info = update_info
        
        # Log for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"set_update_found called with version: {update_info.get('short_version', 'unknown')}, download_url: {update_info.get('download_url', 'none')}")
        
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
        
        # Add release date if available
        pub_date = update_info.get('pub_date')
        if pub_date:
            # Format date as YYYY-MM-DD
            if hasattr(pub_date, 'strftime'):
                date_str = pub_date.strftime('%Y-%m-%d')
            else:
                date_str = str(pub_date)[:10]  # Take first 10 chars if it's a string
            results_html += f"<b>Released:</b> {date_str}<br><br>"
        
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
        
        # Store download URL for context menu
        self._download_url = download_url
        
        # Show release notes if available
        release_notes = update_info.get('release_notes')
        if release_notes:
            notes_html = html.escape(release_notes)
            notes_html = notes_html.replace('\n', '<br>')
            self.details_text.setHtml(f"<b>What's New:</b><br>{notes_html}")
            self.details_text.setVisible(True)
        
        # Show download button
        self.download_button.setText("Download & Install")  # Match the button text in the image
        self.download_button.setVisible(True)
        self.download_button.setEnabled(True)  # Ensure button is enabled
        self.download_button.setDefault(True)
        self.close_button.setDefault(False)
        
        # Debug: Log button state
        logger.info(f"Download button state - visible: {self.download_button.isVisible()}, enabled: {self.download_button.isEnabled()}, text: {self.download_button.text()}")
        
        # Fallback: Ensure button is connected even if main_window connection failed
        # This is a safety mechanism for frozen/packaged builds
        if not hasattr(self, '_download_connected') or not self._download_connected:
            logger.warning("Button not connected yet, attempting fallback connection...")
            self._ensure_button_connected()
    
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
    
    def _ensure_button_connected(self) -> None:
        """Ensure download button is connected to handler (fallback mechanism).
        
        This is a safety mechanism that tries to connect the button to the parent
        window's download handler if it hasn't been connected yet. This helps
        ensure the button works even in frozen/packaged builds where the main
        connection might fail silently.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        # Check if already connected
        if hasattr(self, '_download_connected') and self._download_connected:
            logger.info("Button already connected, skipping fallback connection")
            return
        
        # Try to connect to parent window's handler
        parent = self.parent()
        if parent and hasattr(parent, '_on_update_install_from_dialog'):
            logger.info("Attempting fallback connection to parent window handler")
            try:
                # Disconnect any existing handlers
                try:
                    self.download_button.clicked.disconnect()
                except (TypeError, RuntimeError):
                    pass  # No existing connections
                
                # Connect to parent's handler
                parent_window = parent
                def fallback_handler():
                    import logging
                    from PySide6.QtWidgets import QMessageBox
                    btn_logger = logging.getLogger(__name__)
                    btn_logger.info("=" * 70)
                    btn_logger.info("FALLBACK download button handler called!")
                    btn_logger.info("=" * 70)
                    btn_logger.info("This means the main connection failed, using fallback")
                    try:
                        parent_window._on_update_install_from_dialog()
                    except Exception as e:
                        btn_logger.error(f"Error in fallback handler: {e}", exc_info=True)
                        import traceback
                        try:
                            error_msg = f"Failed to start download (fallback handler):\n\n{str(e)}\n\nTraceback:\n{traceback.format_exc()}"
                            QMessageBox.critical(
                                parent_window,
                                "Download Error (Fallback Handler)",
                                error_msg
                            )
                        except:
                            pass
                
                self.download_button.clicked.connect(fallback_handler)
                self._download_connected = True
                logger.info("Fallback button connection successful")
            except Exception as e:
                logger.error(f"Failed to establish fallback connection: {e}", exc_info=True)
        else:
            logger.warning("Cannot establish fallback connection - parent window or handler not available")
    
    def _on_download_button_context_menu(self, position):
        """Handle context menu for download button (right-click to show diagnostics).
        
        Args:
            position: Position where context menu was requested
        """
        import logging
        logger = logging.getLogger(__name__)
        
        menu = QMenu(self)
        
        # Add "Show Diagnostics" option
        diag_action = menu.addAction("Show Diagnostics (Test Connection)")
        diag_action.triggered.connect(self._show_button_diagnostics)
        
        # Show menu at cursor position
        menu.exec(self.download_button.mapToGlobal(position))
    
    def _show_button_diagnostics(self) -> None:
        """Show diagnostic information about the download button state."""
        from PySide6.QtWidgets import QDialog, QVBoxLayout, QTextEdit, QPushButton, QLabel
        import logging
        logger = logging.getLogger(__name__)
        
        diagnostics = []
        diagnostics.append("=== DOWNLOAD BUTTON DIAGNOSTICS ===\n")
        
        # Check button state
        try:
            diagnostics.append(f"✓ Button exists: True")
            diagnostics.append(f"✓ Button visible: {self.download_button.isVisible()}")
            diagnostics.append(f"✓ Button enabled: {self.download_button.isEnabled()}")
            diagnostics.append(f"✓ Button text: {self.download_button.text()}")
        except Exception as e:
            diagnostics.append(f"✗ Button check failed: {e}")
        
        # Check connection status
        try:
            diagnostics.append(f"\n✓ Connection status:")
            diagnostics.append(f"  - Has _download_connected: {hasattr(self, '_download_connected')}")
            if hasattr(self, '_download_connected'):
                diagnostics.append(f"  - _download_connected value: {self._download_connected}")
            else:
                diagnostics.append(f"  - ✗ NOT CONNECTED (this is the problem!)")
        except Exception as e:
            diagnostics.append(f"\n✗ Connection check failed: {e}")
        
        # Check update_info
        try:
            diagnostics.append(f"\n✓ Update info status:")
            diagnostics.append(f"  - Has update_info: {hasattr(self, 'update_info')}")
            if hasattr(self, 'update_info'):
                if self.update_info:
                    diagnostics.append(f"  - update_info is not None")
                    diagnostics.append(f"    Version: {self.update_info.get('short_version', 'N/A')}")
                    diagnostics.append(f"    Download URL: {self.update_info.get('download_url', 'N/A')[:80]}...")
                else:
                    diagnostics.append(f"  - ✗ update_info is None")
            else:
                diagnostics.append(f"  - ✗ update_info attribute missing")
        except Exception as e:
            diagnostics.append(f"\n✗ Update info check failed: {e}")
        
        # Check parent window
        try:
            parent = self.parent()
            diagnostics.append(f"\n✓ Parent window:")
            if parent:
                diagnostics.append(f"  - Parent exists: True")
                diagnostics.append(f"  - Parent type: {type(parent).__name__}")
                diagnostics.append(f"  - Has _on_update_install_from_dialog: {hasattr(parent, '_on_update_install_from_dialog')}")
                
                # Check if parent has update_check_dialog reference
                if hasattr(parent, 'update_check_dialog'):
                    diagnostics.append(f"  - Parent has update_check_dialog: True")
                    if parent.update_check_dialog == self:
                        diagnostics.append(f"  - ✓ Parent references this dialog")
                    else:
                        diagnostics.append(f"  - ✗ Parent references different dialog")
                else:
                    diagnostics.append(f"  - ✗ Parent missing update_check_dialog reference")
            else:
                diagnostics.append(f"  - ✗ No parent window")
        except Exception as e:
            diagnostics.append(f"\n✗ Parent check failed: {e}")
        
        # Check update_manager fallback
        try:
            parent = self.parent()
            if parent and hasattr(parent, 'update_manager'):
                diagnostics.append(f"\n✓ Update manager fallback:")
                if parent.update_manager:
                    diagnostics.append(f"  - update_manager exists: True")
                    diagnostics.append(f"  - Has _update_available: {hasattr(parent.update_manager, '_update_available')}")
                    if hasattr(parent.update_manager, '_update_available'):
                        fallback = parent.update_manager._update_available
                        if fallback:
                            diagnostics.append(f"  - _update_available is not None")
                            diagnostics.append(f"    Version: {fallback.get('short_version', 'N/A')}")
                        else:
                            diagnostics.append(f"  - _update_available is None")
                else:
                    diagnostics.append(f"  - ✗ update_manager is None")
            else:
                diagnostics.append(f"\n✗ Cannot check update_manager (no parent)")
        except Exception as e:
            diagnostics.append(f"\n✗ Update manager check failed: {e}")
        
        diagnostics.append(f"\n=== RECOMMENDATIONS ===")
        if not hasattr(self, '_download_connected') or not self._download_connected:
            diagnostics.append(f"✗ Button is NOT connected!")
            diagnostics.append(f"  → Try closing and reopening the update dialog")
            diagnostics.append(f"  → Check if _on_update_available was called")
        else:
            diagnostics.append(f"✓ Button appears to be connected")
        
        if not hasattr(self, 'update_info') or not self.update_info:
            diagnostics.append(f"✗ update_info is missing!")
            diagnostics.append(f"  → This will prevent download from working")
        
        # Show diagnostic dialog
        diag_dialog = QDialog(self)
        diag_dialog.setWindowTitle("Download Button Diagnostics")
        diag_dialog.setMinimumWidth(700)
        diag_dialog.setMinimumHeight(500)
        
        layout = QVBoxLayout(diag_dialog)
        
        title = QLabel("Download Button Connection Diagnostics")
        title.setStyleSheet("font-weight: bold; font-size: 14px;")
        layout.addWidget(title)
        
        text_area = QTextEdit()
        text_area.setReadOnly(True)
        text_area.setPlainText("\n".join(diagnostics))
        text_area.setFontFamily("Courier")
        text_area.setFontPointSize(9)
        layout.addWidget(text_area)
        
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(diag_dialog.accept)
        layout.addWidget(close_btn)
        
        diag_dialog.exec()
    
    def _on_download(self) -> None:
        """Handle download button click.
        
        Note: This method is kept for backward compatibility but the actual
        download handling is done via the connection in main_window.py
        """
        if self.update_info:
            # Accept dialog - parent will handle download via callback
            self.accept()
    
    def _on_results_label_context_menu(self, position):
        """Handle context menu for results label (to copy links).
        
        Args:
            position: Position where context menu was requested
        """
        # Get the HTML text
        text = self.results_label.text()
        
        # Try to find links in the HTML
        import re
        # Find all href links in the HTML
        link_pattern = r'<a\s+href="([^"]+)">([^<]+)</a>'
        links = re.findall(link_pattern, text)
        
        if not links:
            # No links found, show generic menu
            menu = QMenu(self)
            copy_all_action = menu.addAction("Copy All Text")
            # Use a helper function to avoid closure issues
            def copy_all_handler(checked):
                self._copy_text_to_clipboard(text)
            copy_all_action.triggered.connect(copy_all_handler)
            menu.exec(self.results_label.mapToGlobal(position))
            return
        
        # Create context menu
        menu = QMenu(self)
        
        # Add copy options for each link
        for url, link_text in links:
            action = menu.addAction(f"Copy Link: {link_text}")
            # Use a helper function to properly capture the URL and avoid closure issues
            def make_copy_handler(u):
                def handler(checked):
                    self._copy_link_to_clipboard(u)
                return handler
            action.triggered.connect(make_copy_handler(url))
        
        menu.addSeparator()
        
        # Add option to open link
        for url, link_text in links:
            open_action = menu.addAction(f"Open: {link_text}")
            # Use a helper function to properly capture the URL and avoid closure issues
            def make_open_handler(u):
                def handler(checked):
                    QDesktopServices.openUrl(QUrl(u))
                return handler
            open_action.triggered.connect(make_open_handler(url))
        
        # Show menu at cursor position
        menu.exec(self.results_label.mapToGlobal(position))
    
    def _copy_text_to_clipboard(self, text: str):
        """Copy text to clipboard (strip HTML tags).
        
        Args:
            text: Text to copy (may contain HTML)
        """
        import re
        # Strip HTML tags
        plain_text = re.sub(r'<[^>]+>', '', text)
        clipboard = QApplication.clipboard()
        clipboard.setText(plain_text)
        
        # Show brief feedback
        original_text = self.status_label.text()
        self.status_label.setText("✓ Text copied to clipboard")
        QTimer.singleShot(2000, lambda: self.status_label.setText(original_text))
    
    def _copy_link_to_clipboard(self, url: str):
        """Copy link URL to clipboard.
        
        Args:
            url: URL to copy
        """
        clipboard = QApplication.clipboard()
        clipboard.setText(url)
        
        # Show brief feedback in status
        original_text = self.status_label.text()
        self.status_label.setText(f"✓ Link copied to clipboard")
        
        # Restore original text after 2 seconds
        from PySide6.QtCore import QTimer
        QTimer.singleShot(2000, lambda: self.status_label.setText(original_text))


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
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Validate parent if provided
        if parent is not None:
            try:
                # Try to access a property to verify parent is valid
                _ = parent.windowTitle()
            except (RuntimeError, AttributeError):
                logger.warning("Parent widget is invalid, creating dialog without parent")
                parent = None
        
        # Create dialog with error handling
        try:
            dialog = UpdateCheckDialog(current_version, parent)
        except Exception as create_error:
            logger.error(f"Error creating UpdateCheckDialog: {create_error}", exc_info=True)
            # Try creating without parent as fallback
            try:
                dialog = UpdateCheckDialog(current_version, None)
            except Exception as fallback_error:
                logger.error(f"Error creating UpdateCheckDialog even without parent: {fallback_error}", exc_info=True)
                raise
        
        # Show dialog with error handling
        try:
            dialog.show()  # Show non-modal
        except Exception as show_error:
            logger.error(f"Error showing update check dialog: {show_error}", exc_info=True)
            # Dialog was created but couldn't be shown - return it anyway
            # The caller can try to show it later
        
        return dialog
    except Exception as e:
        logger.error(f"Fatal error in show_update_check_dialog: {e}", exc_info=True)
        # Last resort: create a minimal dialog
        try:
            from PySide6.QtWidgets import QDialog, QVBoxLayout, QLabel, QPushButton
            minimal_dialog = QDialog(parent)
            minimal_dialog.setWindowTitle("Check for Updates")
            layout = QVBoxLayout(minimal_dialog)
            layout.addWidget(QLabel("Update check dialog could not be created."))
            layout.addWidget(QLabel(f"Error: {str(e)}"))
            btn = QPushButton("Close")
            btn.clicked.connect(minimal_dialog.close)
            layout.addWidget(btn)
            minimal_dialog.show()
            # Return a minimal wrapper that has the expected interface
            class MinimalUpdateDialog:
                def __init__(self, dialog):
                    self._dialog = dialog
                def set_checking(self): pass
                def set_error(self, msg): pass
                def set_update_found(self, info): pass
                def set_no_update(self): pass
            return MinimalUpdateDialog(minimal_dialog)
        except Exception as minimal_error:
            logger.error(f"Could not even create minimal dialog: {minimal_error}", exc_info=True)
            raise
