#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Dialogs Module - Error dialogs and confirmations

This module contains error dialogs and confirmation dialogs for the GUI.
"""

from typing import Optional

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTextBrowser,
    QTextEdit,
    QVBoxLayout,
)

from cuepoint.ui.gui_interface import ProcessingError
from cuepoint.ui.widgets.shortcut_manager import ShortcutContext, ShortcutManager


class ErrorDialog(QDialog):
    """User-friendly error dialog for displaying ProcessingError objects"""

    def __init__(self, error: ProcessingError, parent=None):
        """
        Initialize error dialog.

        Args:
            error: ProcessingError object to display
            parent: Parent widget
        """
        super().__init__(parent)
        self.error = error
        self.init_ui()

    def init_ui(self):
        """Initialize UI components with enhanced error display"""
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)

        # Error icon and title
        title_layout = QHBoxLayout()
        error_icon = QLabel("⚠️")
        error_icon.setStyleSheet("font-size: 24px;")
        
        # Get user-friendly title based on error type
        title_text = self._get_error_title()
        title_label = QLabel(title_text)
        title_label.setStyleSheet("font-size: 18px; font-weight: bold; color: #c62828;")
        title_layout.addWidget(error_icon)
        title_layout.addWidget(title_label)
        title_layout.addStretch()
        layout.addLayout(title_layout)

        # "What went wrong" section
        what_went_wrong_group = QGroupBox("What went wrong:")
        what_went_wrong_group.setStyleSheet("QGroupBox { font-weight: bold; margin-top: 10px; }")
        what_layout = QVBoxLayout()
        what_label = QLabel(self._get_what_went_wrong())
        what_label.setWordWrap(True)
        what_label.setStyleSheet("font-size: 12px; padding: 5px; color: #333;")
        what_layout.addWidget(what_label)
        what_went_wrong_group.setLayout(what_layout)
        layout.addWidget(what_went_wrong_group)

        # "How to fix" section
        how_to_fix_group = QGroupBox("How to fix:")
        how_to_fix_group.setStyleSheet("QGroupBox { font-weight: bold; margin-top: 10px; }")
        how_layout = QVBoxLayout()
        how_layout.setSpacing(5)
        
        # Use suggestions if available, otherwise provide default fixes
        fixes = self.error.suggestions if self.error.suggestions else self._get_default_fixes()
        for i, fix in enumerate(fixes, 1):
            fix_label = QLabel(f"{i}. {fix}")
            fix_label.setWordWrap(True)
            fix_label.setStyleSheet("font-size: 12px; padding: 5px; color: #1976d2;")
            how_layout.addWidget(fix_label)
        
        how_to_fix_group.setLayout(how_layout)
        layout.addWidget(how_to_fix_group)

        # Collapsible technical details section
        self.tech_details_group = QGroupBox()
        self.tech_details_group.setCheckable(True)
        self.tech_details_group.setChecked(False)
        self.tech_details_group.setTitle("Show Technical Details")
        self.tech_details_group.setStyleSheet("QGroupBox { font-weight: bold; margin-top: 10px; }")
        self.tech_details_group.toggled.connect(self._toggle_tech_details)
        
        tech_layout = QVBoxLayout()
        
        # Error type
        error_type_label = QLabel(f"Error Type: {self.error.error_type.value.replace('_', ' ').title()}")
        error_type_label.setStyleSheet("font-size: 11px; color: #666; padding: 3px;")
        tech_layout.addWidget(error_type_label)
        
        # Original message
        if self.error.message:
            message_label = QLabel(f"Message: {self.error.message}")
            message_label.setWordWrap(True)
            message_label.setStyleSheet("font-size: 11px; color: #666; padding: 3px;")
            tech_layout.addWidget(message_label)
        
        # Details (if available)
        if self.error.details:
            details_text = QTextEdit(self.error.details)
            details_text.setReadOnly(True)
            details_text.setMaximumHeight(100)
            details_text.setStyleSheet("background-color: #f5f5f5; padding: 5px; font-size: 10px; font-family: monospace;")
            tech_layout.addWidget(details_text)
        
        self.tech_details_group.setLayout(tech_layout)
        layout.addWidget(self.tech_details_group)

        # Documentation link (if available)
        doc_link = self._get_documentation_link()
        if doc_link:
            link_layout = QHBoxLayout()
            link_label = QLabel(f'<a href="{doc_link}">Learn More</a>')
            link_label.setOpenExternalLinks(True)
            link_label.setStyleSheet("color: #1976d2; padding: 5px;")
            link_label.linkActivated.connect(lambda url: QDesktopServices.openUrl(QUrl(url)))
            link_layout.addWidget(link_label)
            link_layout.addStretch()
            layout.addLayout(link_layout)

        # Recoverable indicator
        if self.error.recoverable:
            recoverable_label = QLabel(
                "✓ This error is recoverable. You can try again after fixing the issue."
            )
            recoverable_label.setStyleSheet("color: #388e3c; font-style: italic; padding: 5px; background-color: #e8f5e9; border-radius: 3px;")
            layout.addWidget(recoverable_label)

        # Action buttons
        button_box = QDialogButtonBox(QDialogButtonBox.Ok)
        
        # Add action buttons based on error type
        action_buttons = self._get_action_buttons()
        for button_text, callback in action_buttons:
            action_btn = button_box.addButton(button_text, QDialogButtonBox.ActionRole)
            action_btn.clicked.connect(callback)
        
        ok_btn = button_box.button(QDialogButtonBox.Ok)
        ok_btn.setDefault(True)
        ok_btn.clicked.connect(self.accept)
        layout.addWidget(button_box)

        # Window properties
        self.setWindowTitle(f"Error - {title_text}")
        self.setMinimumWidth(550)
        self.setMaximumWidth(750)
        self.setModal(True)
    
    def _get_error_title(self) -> str:
        """Get user-friendly error title"""
        titles = {
            'file_not_found': 'File Not Found',
            'playlist_not_found': 'Playlist Not Found',
            'xml_parse_error': 'Invalid XML File',
            'network_error': 'Network Error',
            'processing_error': 'Processing Error',
            'validation_error': 'Validation Error',
        }
        return titles.get(self.error.error_type.value, 'Error')
    
    def _get_what_went_wrong(self) -> str:
        """Get user-friendly explanation of what went wrong"""
        explanations = {
            'file_not_found': 'The XML file you selected could not be found. It may have been moved, renamed, or deleted.',
            'playlist_not_found': 'The playlist you selected could not be found in the XML file. It may have been removed or renamed.',
            'xml_parse_error': 'The XML file could not be read. It may be corrupted, incomplete, or in an invalid format.',
            'network_error': 'Could not connect to Beatport or the connection was interrupted. This may be due to network issues or Beatport being temporarily unavailable.',
            'processing_error': 'An error occurred while processing your tracks. This may be due to invalid data or an unexpected issue.',
            'validation_error': 'The data you provided is invalid or incomplete. Please check your input and try again.',
        }
        return explanations.get(self.error.error_type.value, self.error.message)
    
    def _get_default_fixes(self) -> list:
        """Get default fix suggestions based on error type"""
        fixes = {
            'file_not_found': [
                'Check if the file still exists at the specified location',
                'Select a different XML file using the Browse button',
                'Export a new XML file from Rekordbox if the file was deleted'
            ],
            'playlist_not_found': [
                'Check if the playlist name is correct',
                'Select a different playlist from the dropdown',
                'Export a new XML file from Rekordbox to refresh playlists'
            ],
            'xml_parse_error': [
                'Verify the file is a valid Rekordbox XML export',
                'Try exporting a new XML file from Rekordbox',
                'Check if the file is corrupted or incomplete'
            ],
            'network_error': [
                'Check your internet connection',
                'Wait a few moments and try again',
                'Check if Beatport is accessible in your browser'
            ],
            'processing_error': [
                'Check the technical details for more information',
                'Try processing a smaller playlist',
                'Restart the application and try again'
            ],
            'validation_error': [
                'Review the input data for errors',
                'Check the technical details for specific issues',
                'Ensure all required fields are provided'
            ],
        }
        return fixes.get(self.error.error_type.value, ['Please check the technical details and try again.'])
    
    def _get_documentation_link(self) -> str:
        """Get documentation link for this error type"""
        # Placeholder - would link to actual documentation
        links = {
            'file_not_found': 'https://docs.cuepoint.com/troubleshooting/file-errors',
            'xml_parse_error': 'https://docs.cuepoint.com/troubleshooting/xml-format',
            'network_error': 'https://docs.cuepoint.com/troubleshooting/network-issues',
        }
        return links.get(self.error.error_type.value, '')
    
    def _get_action_buttons(self) -> list:
        """Get action buttons based on error type"""
        actions = []
        if self.error.error_type.value == 'file_not_found':
            actions.append(('Select Different File', self._on_select_file))
        return actions
    
    def _on_select_file(self):
        """Handle select file action"""
        # This would trigger file selection in parent window
        # For now, just accept the dialog
        self.accept()
    
    def _toggle_tech_details(self, checked: bool):
        """Toggle technical details visibility"""
        # The group box handles visibility automatically
        pass


def show_error_dialog(error: ProcessingError, parent=None) -> None:
    """
    Convenience function to show an error dialog.

    Args:
        error: ProcessingError object to display
        parent: Parent widget
    """
    dialog = ErrorDialog(error, parent)
    dialog.exec()


class AboutDialog(QDialog):
    """About dialog for CuePoint"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        self.setWindowTitle("About CuePoint")
        self.setMinimumSize(500, 400)
        self.setModal(True)

        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title_label = QLabel("CuePoint")
        title_label.setStyleSheet("font-size: 24px; font-weight: bold;")
        title_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(title_label)

        # Subtitle
        subtitle_label = QLabel("Beatport Metadata Enricher")
        subtitle_label.setStyleSheet("font-size: 14px; color: #666;")
        subtitle_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(subtitle_label)

        # Version
        version_label = QLabel("Version 1.0.0")
        version_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(version_label)

        layout.addSpacing(10)

        # Description
        description = QLabel(
            "CuePoint automatically matches tracks from your Rekordbox playlists "
            "to Beatport, enriching your collection with accurate metadata including "
            "keys, BPM, labels, genres, release information, and more."
        )
        description.setWordWrap(True)
        description.setAlignment(Qt.AlignCenter)
        layout.addWidget(description)

        layout.addStretch()

        # Copyright
        copyright_label = QLabel("© 2025 CuePoint")
        copyright_label.setAlignment(Qt.AlignCenter)
        copyright_label.setStyleSheet("color: #999; font-size: 10px;")
        layout.addWidget(copyright_label)

        # OK button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        ok_btn = QPushButton("OK")
        ok_btn.setMinimumWidth(100)
        ok_btn.setDefault(True)
        ok_btn.clicked.connect(self.accept)
        button_layout.addWidget(ok_btn)
        layout.addLayout(button_layout)


class UserGuideDialog(QDialog):
    """User Guide dialog"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def init_ui(self):
        """Initialize UI components"""
        self.setWindowTitle("CuePoint User Guide")
        self.setMinimumSize(800, 600)
        self.setModal(True)

        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)

        # Text browser for HTML content
        browser = QTextBrowser()
        guide_html = self._load_guide_html()
        browser.setHtml(guide_html)
        layout.addWidget(browser)

        # Close button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        close_btn = QPushButton("Close")
        close_btn.setMinimumWidth(100)
        close_btn.setDefault(True)
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)
        layout.addLayout(button_layout)

    def _load_guide_html(self) -> str:
        """Load user guide HTML content"""
        return """
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #1976d2; }
                h2 { color: #424242; margin-top: 20px; }
                h3 { color: #616161; margin-top: 15px; }
                p { line-height: 1.6; }
                ul { line-height: 1.8; }
                code { background-color: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <h1>CuePoint User Guide</h1>

            <h2>Getting Started</h2>
            <p>CuePoint is a tool that automatically matches tracks from your
            Rekordbox playlists to Beatport, enriching your collection with
            accurate metadata.</p>

            <h3>Step 1: Export from Rekordbox</h3>
            <ul>
                <li>Open Rekordbox</li>
                <li>Go to File → Export → Export Collection in XML Format</li>
                <li>Save the XML file to a location you can access</li>
            </ul>

            <h3>Step 2: Load XML File</h3>
            <ul>
                <li>Click "Browse" or use File → Open XML File...</li>
                <li>Select your exported Rekordbox XML file</li>
                <li>The playlists will be loaded automatically</li>
            </ul>

            <h3>Step 3: Select Playlist</h3>
            <ul>
                <li>Choose a playlist from the dropdown</li>
                <li>You'll see the track count for the selected playlist</li>
            </ul>

            <h3>Step 4: Configure Settings (Optional)</h3>
            <ul>
                <li>Go to the Settings tab</li>
                <li>Choose a performance preset (Balanced, Fast, Turbo, or Exhaustive)</li>
                <li>Adjust advanced settings if needed</li>
            </ul>

            <h3>Step 5: Start Processing</h3>
            <ul>
                <li>Click "Start Processing"</li>
                <li>Monitor progress in the progress section</li>
                <li>You can cancel processing at any time</li>
            </ul>

            <h3>Step 6: Review Results</h3>
            <ul>
                <li>View results in the results table</li>
                <li>Use filters to find specific tracks</li>
                <li>Double-click a row to view alternative candidates</li>
                <li>Export results in CSV, JSON, or Excel format</li>
            </ul>

            <h2>Features</h2>

            <h3>Results Table</h3>
            <ul>
                <li><strong>Sorting:</strong> Click any column header to sort</li>
                <li><strong>Search:</strong> Use the search box to filter by
                title, artist, or Beatport data</li>
                <li><strong>Confidence Filter:</strong> Filter by match confidence
                (High, Medium, Low)</li>
                <li><strong>View Candidates:</strong> Double-click a row to see
                alternative matches</li>
            </ul>

            <h3>Export Options</h3>
            <ul>
                <li><strong>CSV:</strong> Standard spreadsheet format</li>
                <li><strong>JSON:</strong> Structured data format for API integration</li>
                <li><strong>Excel:</strong> Formatted spreadsheet with styling</li>
            </ul>

            <h3>Settings</h3>
            <ul>
                <li><strong>Performance Presets:</strong> Choose between
                Balanced, Fast, Turbo, or Exhaustive</li>
                <li><strong>Advanced Settings:</strong> Fine-tune processing
                parameters</li>
                <li><strong>Auto-Research:</strong> Automatically re-search
                unmatched tracks (always enabled)</li>
            </ul>

            <h2>Tips</h2>
            <ul>
                <li>For best results, ensure your Rekordbox tracks have
                accurate title and artist information</li>
                <li>Use the "Exhaustive" preset for maximum accuracy
                (slower)</li>
                <li>Review low-confidence matches and use the candidate viewer
                to select alternatives</li>
                <li>Export results regularly to avoid losing work</li>
            </ul>

            <h2>Keyboard Shortcuts</h2>
            <ul>
                <li><strong>Ctrl+O:</strong> Open XML file</li>
                <li><strong>Ctrl+C:</strong> Copy selected results</li>
                <li><strong>Ctrl+A:</strong> Select all</li>
                <li><strong>F11:</strong> Toggle full screen</li>
                <li><strong>F1:</strong> Show this user guide</li>
                <li><strong>Ctrl+Q:</strong> Exit application</li>
            </ul>
        </body>
        </html>
        """


class KeyboardShortcutsDialog(QDialog):
    """Enhanced keyboard shortcuts dialog"""

    def __init__(self, shortcut_manager: Optional[ShortcutManager] = None, parent=None):
        super().__init__(parent)
        self.shortcut_manager = shortcut_manager
        self.init_ui()

    def init_ui(self):
        """Initialize UI with enhanced features"""
        self.setWindowTitle("Keyboard Shortcuts - CuePoint")
        self.setMinimumSize(800, 600)
        self.setModal(True)

        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)

        # Title
        title_label = QLabel("Keyboard Shortcuts")
        title_label.setStyleSheet("font-size: 18px; font-weight: bold;")
        layout.addWidget(title_label)

        # Search box (if shortcut manager is available)
        if self.shortcut_manager:
            search_layout = QHBoxLayout()
            search_label = QLabel("Search:")
            self.search_box = QLineEdit()
            self.search_box.setPlaceholderText("Search shortcuts...")
            self.search_box.textChanged.connect(self.filter_shortcuts)
            search_layout.addWidget(search_label)
            search_layout.addWidget(self.search_box)
            layout.addLayout(search_layout)

            # Context tabs
            self.tabs = QTabWidget()

            # Global shortcuts tab
            global_tab = self.create_shortcuts_table(ShortcutContext.GLOBAL)
            self.tabs.addTab(global_tab, "Global")

            # Main window tab
            main_tab = self.create_shortcuts_table(ShortcutContext.MAIN_WINDOW)
            self.tabs.addTab(main_tab, "Main Window")

            # Results view tab
            results_tab = self.create_shortcuts_table(ShortcutContext.RESULTS_VIEW)
            self.tabs.addTab(results_tab, "Results View")

            # Batch processor tab
            batch_tab = self.create_shortcuts_table(ShortcutContext.BATCH_PROCESSOR)
            self.tabs.addTab(batch_tab, "Batch Processor")

            # Settings tab
            settings_tab = self.create_shortcuts_table(ShortcutContext.SETTINGS)
            self.tabs.addTab(settings_tab, "Settings")

            layout.addWidget(self.tabs)

            # Customize button
            customize_button = QPushButton("Customize Shortcuts...")
            customize_button.clicked.connect(self.on_customize)
            layout.addWidget(customize_button)
        else:
            # Fallback to simple table if no shortcut manager
            table = QTableWidget()
            table.setColumnCount(2)
            table.setHorizontalHeaderLabels(["Action", "Shortcut"])
            table.setEditTriggers(QTableWidget.NoEditTriggers)
            table.setAlternatingRowColors(True)
            table.horizontalHeader().setStretchLastSection(True)

            shortcuts = [
                ("Open XML File", "Ctrl+O"),
                ("Export Results", "Ctrl+E"),
                ("Copy Selected", "Ctrl+C"),
                ("Select All", "Ctrl+A"),
                ("Toggle Full Screen", "F11"),
                ("Show User Guide", "F1"),
                ("Exit Application", "Ctrl+Q"),
            ]

            table.setRowCount(len(shortcuts))
            for row, (action, shortcut) in enumerate(shortcuts):
                table.setItem(row, 0, QTableWidgetItem(action))
                table.setItem(row, 1, QTableWidgetItem(shortcut))

            table.resizeColumnsToContents()
            layout.addWidget(table)

        # Note
        note_label = QLabel(
            "<i>Note: On macOS, use Cmd instead of Ctrl for keyboard shortcuts.</i>"
        )
        note_label.setWordWrap(True)
        layout.addWidget(note_label)

        # Close button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        close_btn = QPushButton("Close")
        close_btn.setMinimumWidth(100)
        close_btn.setDefault(True)
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)
        layout.addLayout(button_layout)

    def create_shortcuts_table(self, context: str) -> QTableWidget:
        """Create shortcuts table for a context"""
        table = QTableWidget()
        table.setColumnCount(2)
        table.setHorizontalHeaderLabels(["Action", "Shortcut"])
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setAlternatingRowColors(True)
        table.horizontalHeader().setStretchLastSection(True)

        # Get shortcuts for context
        shortcuts = self.shortcut_manager.get_shortcuts_for_context(context)
        table.setRowCount(len(shortcuts))

        for row, (action_id, (sequence, description)) in enumerate(shortcuts.items()):
            table.setItem(row, 0, QTableWidgetItem(description))
            table.setItem(row, 1, QTableWidgetItem(sequence))

        table.resizeColumnsToContents()
        return table

    def filter_shortcuts(self, text: str):
        """Filter shortcuts by search text"""
        text = text.lower()
        # Search in all tabs
        for i in range(self.tabs.count()):
            table = self.tabs.widget(i)
            if isinstance(table, QTableWidget):
                for row in range(table.rowCount()):
                    action = table.item(row, 0)
                    shortcut = table.item(row, 1)
                    if action and shortcut:
                        action_text = action.text().lower()
                        shortcut_text = shortcut.text().lower()
                        # Show row if text matches
                        matches = text in action_text or text in shortcut_text
                        table.setRowHidden(row, not matches)

    def on_customize(self):
        """Open customization dialog"""
        # Use new GUI structure - legacy GUI has been moved
        from cuepoint.ui.widgets.shortcut_customization_dialog import ShortcutCustomizationDialog

        dialog = ShortcutCustomizationDialog(self.shortcut_manager, self)
        dialog.exec()
        # Refresh tables
        self.init_ui()
