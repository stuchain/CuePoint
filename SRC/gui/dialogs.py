#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Dialogs Module - Error dialogs and confirmations

This module contains error dialogs and confirmation dialogs for the GUI.
"""

from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QTextEdit,
    QTextBrowser, QTableWidget, QTableWidgetItem, QTabWidget, QLineEdit
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QIcon
from typing import Optional

from gui_interface import ProcessingError, ErrorType
from gui.shortcut_manager import ShortcutManager, ShortcutContext


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
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Error icon and title
        title_layout = QHBoxLayout()
        error_icon = QLabel("⚠️")
        error_icon.setStyleSheet("font-size: 24px;")
        title_label = QLabel("Error")
        title_label.setStyleSheet("font-size: 16px; font-weight: bold;")
        title_layout.addWidget(error_icon)
        title_layout.addWidget(title_label)
        title_layout.addStretch()
        layout.addLayout(title_layout)
        
        # Error message
        message_label = QLabel(self.error.message)
        message_label.setWordWrap(True)
        message_label.setStyleSheet("font-size: 12px; padding: 10px;")
        layout.addWidget(message_label)
        
        # Error type badge (optional, for visual distinction)
        error_type_label = QLabel(f"Type: {self.error.error_type.value.replace('_', ' ').title()}")
        error_type_label.setStyleSheet(
            "background-color: #ffebee; color: #c62828; "
            "padding: 5px 10px; border-radius: 3px; font-size: 10px;"
        )
        layout.addWidget(error_type_label)
        
        # Details section (if available)
        if self.error.details:
            details_label = QLabel("Details:")
            details_label.setStyleSheet("font-weight: bold; margin-top: 10px;")
            layout.addWidget(details_label)
            
            details_text = QTextEdit(self.error.details)
            details_text.setReadOnly(True)
            details_text.setMaximumHeight(100)
            details_text.setStyleSheet("background-color: #f5f5f5; padding: 5px;")
            layout.addWidget(details_text)
        
        # Suggestions section (if available)
        if self.error.suggestions:
            suggestions_label = QLabel("Suggestions:")
            suggestions_label.setStyleSheet("font-weight: bold; margin-top: 10px;")
            layout.addWidget(suggestions_label)
            
            suggestions_container = QVBoxLayout()
            suggestions_container.setSpacing(5)
            for suggestion in self.error.suggestions:
                sug_label = QLabel(f"• {suggestion}")
                sug_label.setWordWrap(True)
                sug_label.setStyleSheet("padding-left: 10px; color: #1976d2;")
                suggestions_container.addWidget(sug_label)
            layout.addLayout(suggestions_container)
        
        # Recoverable indicator
        if self.error.recoverable:
            recoverable_label = QLabel("This error is recoverable. You can try again after fixing the issue.")
            recoverable_label.setStyleSheet("color: #388e3c; font-style: italic; padding: 5px;")
            layout.addWidget(recoverable_label)
        
        # OK button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        ok_btn = QPushButton("OK")
        ok_btn.setMinimumWidth(100)
        ok_btn.setDefault(True)
        ok_btn.clicked.connect(self.accept)
        button_layout.addWidget(ok_btn)
        layout.addLayout(button_layout)
        
        # Window properties
        self.setWindowTitle("Error - CuePoint")
        self.setMinimumWidth(500)
        self.setMaximumWidth(700)
        self.setModal(True)


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
            <p>CuePoint is a tool that automatically matches tracks from your Rekordbox playlists to Beatport, 
            enriching your collection with accurate metadata.</p>
            
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
                <li><strong>Search:</strong> Use the search box to filter by title, artist, or Beatport data</li>
                <li><strong>Confidence Filter:</strong> Filter by match confidence (High, Medium, Low)</li>
                <li><strong>View Candidates:</strong> Double-click a row to see alternative matches</li>
            </ul>
            
            <h3>Export Options</h3>
            <ul>
                <li><strong>CSV:</strong> Standard spreadsheet format</li>
                <li><strong>JSON:</strong> Structured data format for API integration</li>
                <li><strong>Excel:</strong> Formatted spreadsheet with styling</li>
            </ul>
            
            <h3>Settings</h3>
            <ul>
                <li><strong>Performance Presets:</strong> Choose between Balanced, Fast, Turbo, or Exhaustive</li>
                <li><strong>Advanced Settings:</strong> Fine-tune processing parameters</li>
                <li><strong>Auto-Research:</strong> Automatically re-search unmatched tracks (always enabled)</li>
            </ul>
            
            <h2>Tips</h2>
            <ul>
                <li>For best results, ensure your Rekordbox tracks have accurate title and artist information</li>
                <li>Use the "Exhaustive" preset for maximum accuracy (slower)</li>
                <li>Review low-confidence matches and use the candidate viewer to select alternatives</li>
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
        from gui.shortcut_customization_dialog import ShortcutCustomizationDialog
        dialog = ShortcutCustomizationDialog(self.shortcut_manager, self)
        dialog.exec()
        # Refresh tables
        self.init_ui()
