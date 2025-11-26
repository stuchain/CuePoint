#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Main Window Module - Main application window.

This module contains the MainWindow class, which is the primary window
of the CuePoint application. It provides the main user interface including:

- File and playlist selection
- Processing mode selection (single vs batch)
- Progress monitoring
- Results display
- Menu bar with File, Edit, View, and Help menus
- Keyboard shortcuts management
- Drag and drop support

The MainWindow coordinates between various UI components and the
GUIController for processing operations.
"""

from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QMenuBar, QStatusBar, QGroupBox, QLabel, QPushButton, QTabWidget,
    QMenu, QMessageBox, QRadioButton, QButtonGroup, QScrollArea, QSplitter
)
from PySide6.QtCore import Qt, QSettings
from PySide6.QtGui import QDragEnterEvent, QDropEvent, QKeySequence, QAction, QKeyEvent
from typing import List, Dict, Optional, Any
import os
import sys

from cuepoint.ui.widgets.file_selector import FileSelector
from cuepoint.ui.widgets.playlist_selector import PlaylistSelector
from cuepoint.ui.widgets.progress_widget import ProgressWidget
from cuepoint.ui.widgets.results_view import ResultsView
from cuepoint.ui.widgets.config_panel import ConfigPanel
from cuepoint.ui.widgets.batch_processor import BatchProcessorWidget
from cuepoint.ui.widgets.history_view import HistoryView
from cuepoint.ui.widgets.dialogs import ErrorDialog, AboutDialog, UserGuideDialog, KeyboardShortcutsDialog
from cuepoint.ui.widgets.shortcut_manager import ShortcutManager, ShortcutContext
from cuepoint.ui.controllers.main_controller import GUIController
from cuepoint.ui.gui_interface import ProcessingError, TrackResult, ProgressInfo
from cuepoint.services.output_writer import write_csv_files
from cuepoint.utils.utils import with_timestamp
from cuepoint.ui.widgets.performance_view import PerformanceView


class MainWindow(QMainWindow):
    """Main application window for CuePoint Beatport Metadata Enricher.
    
    This is the primary window of the application, containing all UI components
    including file selection, playlist selection, processing controls, progress
    display, and results view. It manages the overall application state and
    coordinates between different UI components.
    
    Attributes:
        controller: GUIController instance for processing operations.
        shortcut_manager: ShortcutManager instance for keyboard shortcuts.
        file_selector: FileSelector widget for XML file selection.
        playlist_selector: PlaylistSelector widget for playlist selection.
        progress_widget: ProgressWidget for displaying processing progress.
        results_view: ResultsView widget for displaying processing results.
        config_panel: ConfigPanel widget for configuration settings.
        batch_processor: BatchProcessorWidget for batch processing mode.
        history_view: HistoryView widget for viewing past searches.
        performance_view: PerformanceView widget for performance monitoring.
        tabs: QTabWidget containing main, settings, and history tabs.
        performance_tab_index: Optional index of performance monitoring tab.
        batch_playlist_names: List of playlist names for batch processing.
    
    Example:
        >>> app = QApplication(sys.argv)
        >>> window = MainWindow()
        >>> window.show()
        >>> sys.exit(app.exec())
    """
    
    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        # Create GUI controller for processing
        self.controller = GUIController()
        # Create shortcut manager
        self.shortcut_manager = ShortcutManager(self)
        self.shortcut_manager.shortcut_conflict.connect(self.on_shortcut_conflict)
        self.init_ui()
        self.setup_connections()
        self.setup_shortcuts()
        
    def init_ui(self) -> None:
        """Initialize all UI components and layout.
        
        Sets up the main window structure including:
        - Window properties (title, size, geometry)
        - Menu bar with File, Edit, View, and Help menus
        - Tab widget with Main, Settings, and Past Searches tabs
        - File selection and playlist selection widgets
        - Processing mode selection (single vs batch)
        - Progress widget and results view
        - Status bar
        - Drag and drop support
        """
        # Window properties
        self.setWindowTitle("CuePoint - Beatport Metadata Enricher")
        self.setMinimumSize(800, 600)
        self.setGeometry(100, 100, 1000, 700)
        
        # Create menu bar
        self.create_menu_bar()
        
        # Create tab widget
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        
        # Main tab - use splitter for resizable sections
        main_tab = QWidget()
        main_layout = QVBoxLayout(main_tab)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        # Create vertical splitter for resizable sections
        main_splitter = QSplitter(Qt.Vertical)
        main_splitter.setChildrenCollapsible(False)  # Prevent sections from being collapsed completely
        
        # Top section: Input controls (file selection, mode, playlist, buttons, progress)
        top_section_widget = QWidget()
        top_section_layout = QVBoxLayout(top_section_widget)
        top_section_layout.setSpacing(15)
        top_section_layout.setContentsMargins(0, 0, 0, 0)
        
        # File selection section
        file_group = QGroupBox("File Selection")
        file_layout = QVBoxLayout()
        self.file_selector = FileSelector()
        self.file_selector.file_selected.connect(self.on_file_selected)
        file_layout.addWidget(self.file_selector)
        file_group.setLayout(file_layout)
        top_section_layout.addWidget(file_group)
        
        # Processing mode selection
        mode_group = QGroupBox("Processing Mode")
        mode_layout = QHBoxLayout()
        self.mode_button_group = QButtonGroup()
        
        self.single_mode_radio = QRadioButton("Single Playlist")
        self.single_mode_radio.setChecked(True)  # Default to single mode
        self.single_mode_radio.toggled.connect(self.on_mode_changed)
        self.single_mode_radio.setToolTip("Process a single playlist at a time")
        self.single_mode_radio.setAccessibleName("Single playlist mode radio button")
        self.single_mode_radio.setAccessibleDescription("Select to process one playlist at a time")
        self.single_mode_radio.setFocusPolicy(Qt.StrongFocus)
        self.mode_button_group.addButton(self.single_mode_radio, 0)
        mode_layout.addWidget(self.single_mode_radio)
        
        self.batch_mode_radio = QRadioButton("Multiple Playlists")
        self.batch_mode_radio.toggled.connect(self.on_mode_changed)
        self.batch_mode_radio.setToolTip("Process multiple playlists in batch")
        self.batch_mode_radio.setAccessibleName("Multiple playlists mode radio button")
        self.batch_mode_radio.setAccessibleDescription("Select to process multiple playlists in batch")
        self.batch_mode_radio.setFocusPolicy(Qt.StrongFocus)
        self.mode_button_group.addButton(self.batch_mode_radio, 1)
        mode_layout.addWidget(self.batch_mode_radio)
        
        mode_layout.addStretch()
        mode_group.setLayout(mode_layout)
        top_section_layout.addWidget(mode_group)
        
        # Single playlist selection section (shown in single mode)
        self.single_playlist_group = QGroupBox("Playlist Selection")
        single_playlist_layout = QVBoxLayout()
        self.playlist_selector = PlaylistSelector()
        self.playlist_selector.playlist_selected.connect(self.on_playlist_selected)
        single_playlist_layout.addWidget(self.playlist_selector)
        self.single_playlist_group.setLayout(single_playlist_layout)
        top_section_layout.addWidget(self.single_playlist_group)
        
        # Batch processor widget (shown in batch mode)
        self.batch_processor = BatchProcessorWidget()
        self.batch_processor.setVisible(False)  # Hidden by default
        top_section_layout.addWidget(self.batch_processor)
        
        # Start Processing button container (for single mode)
        self.start_button_container = QWidget()
        self.start_button_layout = QHBoxLayout(self.start_button_container)
        self.start_button_layout.addStretch()
        self.start_button = QPushButton("Start Processing")
        self.start_button.setMinimumHeight(40)
        self.start_button.clicked.connect(self.start_processing)
        self.start_button.setToolTip("Start processing the selected playlist (F5)")
        self.start_button.setAccessibleName("Start processing button")
        self.start_button.setAccessibleDescription("Click to start processing the selected playlist. Keyboard shortcut: F5")
        self.start_button.setFocusPolicy(Qt.StrongFocus)
        self.start_button_layout.addWidget(self.start_button)
        self.start_button_layout.addStretch()
        top_section_layout.addWidget(self.start_button_container)
        
        # Progress section - ProgressWidget (Step 1.5)
        # Initially hidden until processing starts
        self.progress_group = QGroupBox("Progress")
        progress_layout = QVBoxLayout()
        self.progress_widget = ProgressWidget()
        self.progress_widget.cancel_requested.connect(self.on_cancel_requested)
        progress_layout.addWidget(self.progress_widget)
        self.progress_group.setLayout(progress_layout)
        self.progress_group.setVisible(False)  # Hidden until processing starts
        top_section_layout.addWidget(self.progress_group)
        
        # Add stretch to push everything to top
        top_section_layout.addStretch()
        
        # Set maximum height for top section
        top_section_widget.setMaximumHeight(600)
        main_splitter.addWidget(top_section_widget)
        
        # Bottom section: Results
        bottom_section_widget = QWidget()
        bottom_section_layout = QVBoxLayout(bottom_section_widget)
        bottom_section_layout.setContentsMargins(0, 0, 0, 0)
        
        # Results section - ResultsView widget (Step 1.7)
        # Initially hidden until processing completes
        self.results_group = QGroupBox("Results")
        results_layout = QVBoxLayout()
        self.results_view = ResultsView()
        results_layout.addWidget(self.results_view)
        self.results_group.setLayout(results_layout)
        self.results_group.setVisible(False)  # Hidden until processing completes
        bottom_section_layout.addWidget(self.results_group)
        
        main_splitter.addWidget(bottom_section_widget)
        
        # Set initial splitter sizes (40% top, 60% bottom)
        main_splitter.setSizes([400, 600])
        
        # Add splitter to main layout
        main_layout.addWidget(main_splitter, 1)  # Give splitter stretch priority
        
        # Settings tab
        settings_tab = QWidget()
        settings_layout = QVBoxLayout(settings_tab)
        settings_layout.setContentsMargins(10, 10, 10, 10)
        self.config_panel = ConfigPanel()
        settings_layout.addWidget(self.config_panel)
        
        # History tab (Past Searches)
        history_tab = QWidget()
        history_layout = QVBoxLayout(history_tab)
        history_layout.setContentsMargins(10, 10, 10, 10)
        self.history_view = HistoryView()
        history_layout.addWidget(self.history_view)
        
        # Add tabs
        self.tabs.addTab(main_tab, "Main")
        self.tabs.addTab(settings_tab, "Settings")
        self.tabs.addTab(history_tab, "Past Searches")
        
        # Performance monitoring view (created but not added to tabs yet)
        self.performance_view = PerformanceView()
        self.performance_tab_index = None  # Will be set when tab is added
        
        # Status bar
        self.statusBar().showMessage("Ready")
        
        # Enable drag and drop for the window
        self.setAcceptDrops(True)
        
        # Set accessible name for main window
        self.setAccessibleName("CuePoint main window")
        self.setAccessibleDescription("Main application window for CuePoint Beatport Metadata Enricher")
    
    def setup_connections(self) -> None:
        """Set up signal connections between controller and UI components.
        
        Connects controller signals (progress_updated, processing_complete,
        error_occurred) to UI handlers, and connects batch processor signals
        for batch processing mode.
        """
        # Connect controller signals to handlers
        self.controller.progress_updated.connect(self.on_progress_updated)
        self.controller.processing_complete.connect(self.on_processing_complete)
        self.controller.error_occurred.connect(self.on_error_occurred)
        
        # Connect batch processor signals
        self.batch_processor.batch_started.connect(self.on_batch_started)
        self.batch_processor.batch_cancelled.connect(self.on_batch_cancelled)
        self.batch_processor.batch_completed.connect(self.on_batch_completed)
    
    def setup_shortcuts(self) -> None:
        """Set up all keyboard shortcuts for the application.
        
        Registers global shortcuts (Ctrl+O, Ctrl+E, Ctrl+Q, F1, F11, F5)
        and context-specific shortcuts for main window and settings.
        """
        # Global shortcuts
        self.shortcut_manager.register_shortcut(
            "open_file",
            "Ctrl+O",
            self.on_file_open,
            ShortcutContext.GLOBAL,
            "Open XML file"
        )
        
        self.shortcut_manager.register_shortcut(
            "export_results",
            "Ctrl+E",
            self.on_export_results,
            ShortcutContext.GLOBAL,
            "Export results"
        )
        
        self.shortcut_manager.register_shortcut(
            "quit",
            "Ctrl+Q",
            self.close,
            ShortcutContext.GLOBAL,
            "Quit application"
        )
        
        self.shortcut_manager.register_shortcut(
            "help",
            "F1",
            self.on_show_user_guide,
            ShortcutContext.GLOBAL,
            "Show help"
        )
        
        self.shortcut_manager.register_shortcut(
            "shortcuts",
            "Ctrl+?",
            self.on_show_shortcuts,
            ShortcutContext.GLOBAL,
            "Show keyboard shortcuts"
        )
        
        self.shortcut_manager.register_shortcut(
            "fullscreen",
            "F11",
            self.toggle_fullscreen,
            ShortcutContext.GLOBAL,
            "Toggle fullscreen"
        )
        
        # Main window shortcuts
        self.shortcut_manager.register_shortcut(
            "new_session",
            "Ctrl+N",
            self.on_new_session,
            ShortcutContext.MAIN_WINDOW,
            "New session"
        )
        
        self.shortcut_manager.register_shortcut(
            "start_processing",
            "F5",
            self.start_processing,
            ShortcutContext.GLOBAL,  # Changed to GLOBAL so it works from anywhere
            "Start processing"
        )
        
        self.shortcut_manager.register_shortcut(
            "restart_processing",
            "Ctrl+R",
            self.on_restart_processing,
            ShortcutContext.MAIN_WINDOW,
            "Restart processing"
        )
        
        # Settings shortcuts
        self.shortcut_manager.register_shortcut(
            "open_settings",
            "Ctrl+,",
            self.on_open_settings,
            ShortcutContext.SETTINGS,
            "Open settings"
        )
        
        # Set initial context
        self.shortcut_manager.set_context(ShortcutContext.MAIN_WINDOW)
    
    def on_shortcut_conflict(self, action_id1: str, action_id2: str) -> None:
        """Handle keyboard shortcut conflicts.
        
        Args:
            action_id1: ID of first conflicting action.
            action_id2: ID of second conflicting action.
        """
        QMessageBox.warning(
            self,
            "Shortcut Conflict",
            f"Shortcut conflict detected between '{action_id1}' and '{action_id2}'"
        )
    
    def on_new_session(self) -> None:
        """Start a new session by clearing all results and resetting progress.
        
        Prompts the user for confirmation before clearing results. Resets
        the results view, progress widget, and hides the results group.
        """
        reply = QMessageBox.question(
            self,
            "New Session",
            "Clear all results and start a new session?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            if hasattr(self, 'results_view'):
                self.results_view.clear()
            if hasattr(self, 'progress_widget'):
                self.progress_widget.reset()
            if hasattr(self, 'results_group'):
                self.results_group.setVisible(False)
            self.statusBar().showMessage("New session started", 2000)
    
    def on_restart_processing(self) -> None:
        """Restart processing of the current playlist.
        
        Cancels any ongoing processing and starts processing again with
        the same playlist and settings.
        """
        if self.controller.is_processing():
            self.controller.cancel_processing()
        self.start_processing()
    
    def on_export_results(self) -> None:
        """Export results via keyboard shortcut (Ctrl+E).
        
        Opens the export dialog if results are available, otherwise
        shows a status message indicating no results to export.
        """
        if hasattr(self, 'results_view') and self.results_view.results:
            self.results_view.show_export_dialog()
        else:
            self.statusBar().showMessage("No results to export", 2000)
    
    def on_open_settings(self) -> None:
        """Open the Settings tab via keyboard shortcut (Ctrl+,).
        
        Finds and switches to the Settings tab in the tab widget.
        """
        # Find settings tab index
        for i in range(self.tabs.count()):
            if self.tabs.tabText(i) == "Settings":
                self.tabs.setCurrentIndex(i)
                break
    
    def keyPressEvent(self, event: QKeyEvent) -> None:
        """Handle key press events for keyboard shortcuts.
        
        Shows the shortcuts dialog when '?' is pressed (without Ctrl).
        Other key events are passed to the parent class.
        
        Args:
            event: QKeyEvent containing key press information.
        """
        # Show shortcuts dialog when '?' is pressed (without Ctrl)
        if event.key() == Qt.Key_Question and event.modifiers() == Qt.NoModifier:
            self.on_show_shortcuts()
        else:
            super().keyPressEvent(event)
        
        
    def create_menu_bar(self) -> None:
        """Create the application menu bar with all menus and actions.
        
        Creates the following menus:
        - File: Open XML file, recent files, exit
        - Edit: Copy, select all, clear results
        - View: Toggle progress/results visibility, fullscreen
        - Help: User guide, keyboard shortcuts, about
        """
        menubar = self.menuBar()
        
        # File Menu
        file_menu = menubar.addMenu("&File")
        
        # Open XML File
        open_action = QAction("&Open XML File...", self)
        open_action.setShortcut(QKeySequence.Open)
        open_action.setToolTip("Open XML file (Ctrl+O)")
        open_action.triggered.connect(self.on_file_open)
        file_menu.addAction(open_action)
        
        file_menu.addSeparator()
        
        # Recent Files submenu
        self.recent_files_menu = QMenu("Recent Files", self)
        self.recent_files_menu.aboutToShow.connect(self.update_recent_files_menu)
        file_menu.addMenu(self.recent_files_menu)
        
        file_menu.addSeparator()
        
        # Exit
        exit_action = QAction("E&xit", self)
        exit_action.setShortcut(QKeySequence.Quit)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)
        
        # Edit Menu
        edit_menu = menubar.addMenu("&Edit")
        
        # Copy selected results
        copy_action = QAction("&Copy", self)
        copy_action.setShortcut(QKeySequence.Copy)
        copy_action.setToolTip("Copy selected results (Ctrl+C)")
        copy_action.triggered.connect(self.on_copy_selected)
        edit_menu.addAction(copy_action)
        
        # Select All
        select_all_action = QAction("Select &All", self)
        select_all_action.setShortcut(QKeySequence.SelectAll)
        select_all_action.setToolTip("Select all results (Ctrl+A)")
        select_all_action.triggered.connect(self.on_select_all)
        edit_menu.addAction(select_all_action)
        
        edit_menu.addSeparator()
        
        # Clear Results
        clear_action = QAction("&Clear Results", self)
        clear_action.triggered.connect(self.on_clear_results)
        edit_menu.addAction(clear_action)
        
        # View Menu
        view_menu = menubar.addMenu("&View")
        
        # Show/Hide Progress
        self.toggle_progress_action = QAction("Show &Progress", self)
        self.toggle_progress_action.setCheckable(True)
        self.toggle_progress_action.setChecked(True)
        self.toggle_progress_action.triggered.connect(self.on_toggle_progress)
        view_menu.addAction(self.toggle_progress_action)
        
        # Show/Hide Results
        self.toggle_results_action = QAction("Show &Results", self)
        self.toggle_results_action.setCheckable(True)
        self.toggle_results_action.setChecked(True)
        self.toggle_results_action.triggered.connect(self.on_toggle_results)
        view_menu.addAction(self.toggle_results_action)
        
        view_menu.addSeparator()
        
        # Full Screen
        fullscreen_action = QAction("&Full Screen", self)
        fullscreen_action.setShortcut(QKeySequence.FullScreen)
        fullscreen_action.setToolTip("Toggle fullscreen mode (F11)")
        fullscreen_action.setCheckable(True)
        fullscreen_action.triggered.connect(self.toggle_fullscreen)
        view_menu.addAction(fullscreen_action)
        
        # Help Menu
        help_menu = menubar.addMenu("&Help")
        
        # User Guide
        guide_action = QAction("&User Guide", self)
        guide_action.setShortcut(QKeySequence.HelpContents)
        guide_action.setToolTip("Show user guide (F1)")
        guide_action.triggered.connect(self.on_show_user_guide)
        help_menu.addAction(guide_action)
        
        # Keyboard Shortcuts
        shortcuts_action = QAction("&Keyboard Shortcuts", self)
        shortcuts_action.setShortcut(QKeySequence("Ctrl+?"))
        shortcuts_action.setToolTip("Show keyboard shortcuts (Ctrl+?)")
        shortcuts_action.triggered.connect(self.on_show_shortcuts)
        help_menu.addAction(shortcuts_action)
        
        help_menu.addSeparator()
        
        # About
        about_action = QAction("&About CuePoint", self)
        about_action.triggered.connect(self.on_show_about)
        help_menu.addAction(about_action)
        
    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        """Handle drag enter event for drag-and-drop file support.
        
        Accepts the drag operation if a single XML file is being dragged.
        
        Args:
            event: QDragEnterEvent containing drag information.
        """
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if len(urls) == 1 and urls[0].toLocalFile().endswith('.xml'):
                event.acceptProposedAction()
                
    def dropEvent(self, event: QDropEvent) -> None:
        """Handle drop event for drag-and-drop file support.
        
        Processes the dropped file and forwards it to the file selector
        if it's a valid XML file.
        
        Args:
            event: QDropEvent containing drop information.
        """
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files and files[0].lower().endswith('.xml'):
            # Forward to file selector
            self.file_selector.set_file(files[0])
            event.acceptProposedAction()
            
    def on_file_open(self) -> None:
        """Handle File > Open menu action.
        
        Opens the file browser dialog to select an XML file for processing.
        """
        self.file_selector.browse_file()
        
    def on_file_selected(self, file_path: str) -> None:
        """Handle file selection from FileSelector widget.
        
        Validates the selected file, loads playlists into the playlist
        selector, updates the batch processor, and saves to recent files.
        
        Args:
            file_path: Path to the selected XML file.
        """
        if self.file_selector.validate_file(file_path):
            self.statusBar().showMessage(f"Loading XML file: {os.path.basename(file_path)}...")
            try:
                # Load playlists into playlist selector
                self.playlist_selector.load_xml_file(file_path)
                playlist_count = len(self.playlist_selector.playlists)
                self.statusBar().showMessage(f"File loaded: {playlist_count} playlists found")
                
                # Update batch processor with playlists
                self.batch_processor.set_playlists(list(self.playlist_selector.playlists.keys()))
                
                # Save to recent files
                self.save_recent_file(file_path)
            except Exception as e:
                self.statusBar().showMessage(f"Error loading XML: {str(e)}")
                # Error dialog will be handled in later step
        else:
            self.statusBar().showMessage(f"Invalid file: {file_path}")
            # Clear playlist selector if file is invalid
            self.playlist_selector.clear()
            self.batch_processor.set_playlists([])
    
    def on_mode_changed(self) -> None:
        """Handle processing mode change between single and batch modes.
        
        Shows/hides appropriate UI components based on the selected mode:
        - Single mode: Shows playlist selector and start button
        - Batch mode: Shows batch processor widget
        """
        is_batch_mode = self.batch_mode_radio.isChecked()
        
        # Show/hide single playlist UI
        self.single_playlist_group.setVisible(not is_batch_mode)
        self.start_button_container.setVisible(not is_batch_mode)
        
        # Show/hide batch processor
        self.batch_processor.setVisible(is_batch_mode)
        
        # Update batch processor with playlists if file is already loaded
        if is_batch_mode and hasattr(self.playlist_selector, 'playlists'):
            playlists = list(self.playlist_selector.playlists.keys())
            self.batch_processor.set_playlists(playlists)
        
        # Update status bar
        mode_text = "Multiple Playlists" if is_batch_mode else "Single Playlist"
        self.statusBar().showMessage(f"Mode: {mode_text}")
    
    def update_recent_files_menu(self) -> None:
        """Update the Recent Files submenu with saved file paths.
        
        Loads recent files from QSettings and populates the menu with
        up to 10 most recent files. Shows "No recent files" if empty.
        """
        self.recent_files_menu.clear()
        
        settings = QSettings("CuePoint", "CuePoint")
        recent_files = settings.value("recent_files", [])
        
        if not recent_files:
            action = QAction("No recent files", self)
            action.setEnabled(False)
            self.recent_files_menu.addAction(action)
        else:
            for file_path in recent_files[:10]:  # Show last 10
                action = QAction(os.path.basename(file_path), self)
                action.setData(file_path)
                action.triggered.connect(lambda checked, path=file_path: self.on_open_recent_file(path))
                self.recent_files_menu.addAction(action)
    
    def on_open_recent_file(self, file_path: str) -> None:
        """Open a file from the Recent Files menu.
        
        Validates that the file exists, then loads it. If the file
        no longer exists, removes it from recent files and shows a warning.
        
        Args:
            file_path: Path to the file to open.
        """
        if os.path.exists(file_path):
            self.file_selector.set_file(file_path)
            # set_file will emit file_selected signal, which will call on_file_selected
        else:
            # Remove invalid file from recent files
            settings = QSettings("CuePoint", "CuePoint")
            recent_files = settings.value("recent_files", [])
            if file_path in recent_files:
                recent_files.remove(file_path)
                settings.setValue("recent_files", recent_files)
            self.update_recent_files_menu()
            QMessageBox.warning(
                self,
                "File Not Found",
                f"The file no longer exists:\n{file_path}"
            )
    
    def save_recent_file(self, file_path: str) -> None:
        """Save a file path to the recent files list.
        
        Adds the file to the top of the recent files list and maintains
        a maximum of 10 recent files. Saves to QSettings for persistence.
        
        Args:
            file_path: Path to the file to save.
        """
        settings = QSettings("CuePoint", "CuePoint")
        recent_files = settings.value("recent_files", [])
        
        if not isinstance(recent_files, list):
            recent_files = []
        
        if file_path in recent_files:
            recent_files.remove(file_path)
        recent_files.insert(0, file_path)
        
        # Keep only last 10
        recent_files = recent_files[:10]
        settings.setValue("recent_files", recent_files)
    
    def on_copy_selected(self) -> None:
        """Copy selected results to clipboard via Edit > Copy (Ctrl+C).
        
        Extracts selected rows from the results table and copies them
        as tab-separated text to the clipboard.
        """
        # Get selected items from results table
        if hasattr(self, 'results_view') and self.results_view.results:
            selected_items = self.results_view.table.selectedItems()
            if selected_items:
                # Get selected rows
                selected_rows = set()
                for item in selected_items:
                    selected_rows.add(item.row())
                
                # Build text to copy
                lines = []
                for row in sorted(selected_rows):
                    row_data = []
                    for col in range(self.results_view.table.columnCount()):
                        item = self.results_view.table.item(row, col)
                        row_data.append(item.text() if item else "")
                    lines.append("\t".join(row_data))
                
                if lines:
                    from PySide6.QtWidgets import QApplication
                    clipboard = QApplication.clipboard()
                    clipboard.setText("\n".join(lines))
                    self.statusBar().showMessage("Copied to clipboard", 2000)
            else:
                self.statusBar().showMessage("No items selected", 2000)
        else:
            self.statusBar().showMessage("No results to copy", 2000)
    
    def on_select_all(self) -> None:
        """Select all items in results table via Edit > Select All (Ctrl+A).
        
        Selects all rows in the results table if results are available.
        """
        if hasattr(self, 'results_view') and self.results_view.table.rowCount() > 0:
            self.results_view.table.selectAll()
            self.statusBar().showMessage("All items selected", 2000)
        else:
            self.statusBar().showMessage("No results to select", 2000)
    
    def on_clear_results(self) -> None:
        """Clear results display via Edit > Clear Results.
        
        Prompts the user for confirmation before clearing all results
        and hiding the results group.
        """
        if hasattr(self, 'results_view'):
            reply = QMessageBox.question(
                self,
                "Clear Results",
                "Are you sure you want to clear all results?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            if reply == QMessageBox.Yes:
                self.results_view.clear()
                self.results_group.setVisible(False)
                self.statusBar().showMessage("Results cleared", 2000)
    
    def on_toggle_progress(self) -> None:
        """Toggle progress section visibility via View > Show/Hide Progress.
        
        Shows or hides the progress group based on the menu action state
        and updates the menu text accordingly.
        """
        is_visible = self.toggle_progress_action.isChecked()
        self.progress_group.setVisible(is_visible)
        # Update menu text based on current state
        if is_visible:
            self.toggle_progress_action.setText("Hide &Progress")
        else:
            self.toggle_progress_action.setText("Show &Progress")
    
    def on_toggle_results(self) -> None:
        """Toggle results section visibility via View > Show/Hide Results.
        
        Shows or hides the results group based on the menu action state
        and updates the menu text accordingly.
        """
        is_visible = self.toggle_results_action.isChecked()
        self.results_group.setVisible(is_visible)
        # Update menu text based on current state
        if is_visible:
            self.toggle_results_action.setText("Hide &Results")
        else:
            self.toggle_results_action.setText("Show &Results")
    
    def toggle_fullscreen(self) -> None:
        """Toggle fullscreen mode via View > Full Screen (F11).
        
        Switches between normal and fullscreen window modes.
        """
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()
    
    def on_show_user_guide(self) -> None:
        """Show user guide dialog via Help > User Guide (F1).
        
        Opens a dialog displaying the user guide documentation.
        """
        dialog = UserGuideDialog(self)
        dialog.exec()
    
    def on_show_shortcuts(self) -> None:
        """Show keyboard shortcuts dialog via Help > Keyboard Shortcuts (Ctrl+?).
        
        Opens a dialog displaying all available keyboard shortcuts.
        """
        dialog = KeyboardShortcutsDialog(self.shortcut_manager, self)
        dialog.exec()
    
    def on_show_about(self) -> None:
        """Show about dialog via Help > About CuePoint.
        
        Opens a dialog displaying application information and version.
        """
        dialog = AboutDialog(self)
        dialog.exec()
    
    def on_batch_started(self, playlist_names: List[str]) -> None:
        """Handle batch processing started signal from batch processor.
        
        Validates the XML file, gets settings, and starts batch processing
        via the controller. Connects controller signals to batch processor
        for progress updates.
        
        Args:
            playlist_names: List of playlist names to process in batch.
        """
        xml_path = self.file_selector.get_file_path()
        if not xml_path or not self.file_selector.validate_file(xml_path):
            QMessageBox.warning(
                self,
                "No File Selected",
                "Please select a valid XML file before starting batch processing."
            )
            self.batch_processor.cancel_batch_processing()
            return
        
        # Get settings
        settings = self.config_panel.get_settings()
        auto_research = self.config_panel.get_auto_research()
        
        # Store playlist names for tracking
        self.batch_playlist_names = playlist_names
        
        # Disconnect regular processing signals temporarily (if connected)
        try:
            self.controller.progress_updated.disconnect(self.on_progress_updated)
        except:
            pass
        try:
            self.controller.processing_complete.disconnect(self.on_processing_complete)
        except:
            pass
        try:
            self.controller.error_occurred.disconnect(self.on_error_occurred)
        except:
            pass
        
        # Connect controller signals to batch processor
        self.controller.progress_updated.connect(self.batch_processor.on_playlist_progress)
        self.controller.processing_complete.connect(self._on_batch_playlist_complete)
        self.controller.error_occurred.connect(self._on_batch_playlist_error)
        
        # Start batch processing via controller
        self.controller.start_batch_processing(
            xml_path=xml_path,
            playlist_names=playlist_names,
            settings=settings,
            auto_research=auto_research
        )
        
        # Notify batch processor of first playlist start
        if playlist_names:
            self.batch_processor.on_playlist_started(playlist_names[0])
    
    def _on_batch_playlist_complete(self, results: List[TrackResult]) -> None:
        """Handle completion of a single playlist in batch processing.
        
        Notifies the batch processor of completion and checks if the batch
        is complete. Reconnects regular signals when batch is finished.
        
        Args:
            results: List of TrackResult objects for the completed playlist.
        """
        # Get playlist name from controller (stored before processing next)
        if hasattr(self.controller, 'last_completed_playlist_name') and self.controller.last_completed_playlist_name:
            playlist_name = self.controller.last_completed_playlist_name
            self.batch_processor.on_playlist_completed(playlist_name, results)
            
            # Check if batch is complete
            if hasattr(self.controller, 'batch_index') and self.controller.batch_index >= len(self.batch_playlist_names):
                # Batch complete - reconnect regular signals
                self._reconnect_regular_signals()
            elif hasattr(self.controller, 'batch_index') and self.controller.batch_index < len(self.batch_playlist_names):
                # Notify start of next playlist
                next_playlist_name = self.batch_playlist_names[self.controller.batch_index]
                self.batch_processor.on_playlist_started(next_playlist_name)
    
    def _on_batch_playlist_error(self, error: ProcessingError) -> None:
        """Handle error for a single playlist in batch processing.
        
        Notifies the batch processor of the error and continues with the
        next playlist. Reconnects regular signals when batch is finished.
        
        Args:
            error: ProcessingError object containing error information.
        """
        # Get playlist name from controller (stored before processing next)
        if hasattr(self.controller, 'last_completed_playlist_name') and self.controller.last_completed_playlist_name:
            playlist_name = self.controller.last_completed_playlist_name
            self.batch_processor.on_playlist_error(playlist_name, error)
            
            # Check if batch is complete
            if hasattr(self.controller, 'batch_index') and self.controller.batch_index >= len(self.batch_playlist_names):
                # Batch complete - reconnect regular signals
                self._reconnect_regular_signals()
            elif hasattr(self.controller, 'batch_index') and self.controller.batch_index < len(self.batch_playlist_names):
                # Notify start of next playlist
                next_playlist_name = self.batch_playlist_names[self.controller.batch_index]
                self.batch_processor.on_playlist_started(next_playlist_name)
    
    def _reconnect_regular_signals(self) -> None:
        """Reconnect regular processing signals after batch processing completes.
        
        Disconnects batch-specific signal handlers and reconnects the
        regular signal handlers for single playlist processing mode.
        """
        try:
            self.controller.progress_updated.disconnect(self.batch_processor.on_playlist_progress)
        except:
            pass
        try:
            self.controller.processing_complete.disconnect(self._on_batch_playlist_complete)
        except:
            pass
        try:
            self.controller.error_occurred.disconnect(self._on_batch_playlist_error)
        except:
            pass
        
        self.controller.progress_updated.connect(self.on_progress_updated)
        self.controller.processing_complete.connect(self.on_processing_complete)
        self.controller.error_occurred.connect(self.on_error_occurred)
    
    def on_batch_cancelled(self) -> None:
        """Handle batch processing cancellation.
        
        Cancels the current processing operation and reconnects regular
        processing signals.
        """
        self.controller.cancel_processing()
        self.statusBar().showMessage("Batch processing cancelled")
        
        # Reconnect regular processing signals
        self._reconnect_regular_signals()
    
    def on_batch_completed(self, results_dict: Dict[str, List[TrackResult]]) -> None:
        """Handle batch processing completion.
        
        Displays results in separate tables per playlist, automatically
        saves results for each playlist, and updates the status bar with
        summary statistics.
        
        Args:
            results_dict: Dictionary mapping playlist names to lists of TrackResult objects.
        """
        # Pass all playlists, even empty ones (so user can see what was processed)
        # Filter out None values only
        filtered_dict = {name: results for name, results in results_dict.items() if results is not None}
        
        if not filtered_dict:
            self.statusBar().showMessage("Batch processing complete, but no results to display")
            return
        
        # Ensure we're on Main tab (should already be there, but just in case)
        self.tabs.setCurrentIndex(0)
        
        # Hide batch processor progress, show results
        # Note: batch processor has its own progress display, regular progress_group is for single mode
        self.progress_group.setVisible(False)
        self.results_group.setVisible(True)
        
        # Re-enable start button
        self.start_button.setEnabled(True)
        
        # Disable cancel button
        self.progress_widget.set_enabled(False)
        
        # Automatically save results for each playlist
        for playlist_name, results in filtered_dict.items():
            if results:  # Only save if there are results
                self._auto_save_results(results, playlist_name)
        
        # Update results view with batch results (separate table per playlist)
        self.results_view.set_batch_results(filtered_dict)
        
        # Calculate summary statistics for status bar
        total = sum(len(results) for results in filtered_dict.values())
        matched = sum(sum(1 for r in results if r.matched) for results in filtered_dict.values())
        match_rate = (matched / total * 100) if total > 0 else 0
        
        # Update status bar
        self.statusBar().showMessage(
            f"Batch processing complete: {len(filtered_dict)} playlist(s), "
            f"{total} total tracks, {matched}/{total} matched ({match_rate:.1f}%)"
        )
    
    def _auto_save_results(self, results: List[TrackResult], playlist_name: str) -> None:
        """Automatically save results to CSV file after processing.
        
        Creates a sanitized filename from the playlist name and saves
        results to the output directory. Updates the history view to
        show the new file.
        
        Args:
            results: List of TrackResult objects to save.
            playlist_name: Name of the playlist for file naming.
        """
        if not results:
            return
        
        try:
            # Sanitize playlist name for filename (remove invalid characters)
            safe_playlist_name = "".join(c for c in playlist_name if c.isalnum() or c in (' ', '-', '_')).strip()
            if not safe_playlist_name:
                safe_playlist_name = "playlist"
            
            # Create base filename (write_csv_files will add timestamp)
            base_filename = f"{safe_playlist_name}.csv"
            
            # Determine SRC directory
            current_file = os.path.abspath(__file__)  # SRC/gui/main_window.py
            src_dir = os.path.dirname(os.path.dirname(current_file))  # SRC/
            
            # Save to output directory in SRC folder
            output_dir = os.path.join(src_dir, "output")
            output_dir = os.path.abspath(output_dir)  # Ensure absolute path
            os.makedirs(output_dir, exist_ok=True)
            
            # Write CSV files (this will add timestamp automatically)
            output_files = write_csv_files(results, base_filename, output_dir)
            
            # Show success message in status bar
            if output_files.get('main'):
                main_file = output_files['main']
                self.statusBar().showMessage(f"Results saved: {os.path.basename(main_file)}", 3000)
                
                # Refresh Past Searches tab to show the new file
                if hasattr(self, 'history_view'):
                    # Use QTimer to refresh after a delay to ensure file system has updated
                    from PySide6.QtCore import QTimer
                    from PySide6.QtWidgets import QListWidgetItem
                    from datetime import datetime
                    
                    def refresh_with_file():
                        # First do normal refresh
                        self.history_view.refresh_recent_files()
                        # Then manually ensure our file is in the list if it wasn't found
                        if os.path.exists(main_file):
                            # Check if file is already in list
                            found = False
                            for i in range(self.history_view.recent_list.count()):
                                item = self.history_view.recent_list.item(i)
                                if item and item.data(Qt.UserRole) == main_file:
                                    found = True
                                    break
                            if not found:
                                # Add it manually
                                item = QListWidgetItem(os.path.basename(main_file))
                                item.setData(Qt.UserRole, main_file)
                                mtime = os.path.getmtime(main_file)
                                dt = datetime.fromtimestamp(mtime)
                                item.setToolTip(f"{main_file}\nModified: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
                                # Insert at top (newest first)
                                self.history_view.recent_list.insertItem(0, item)
                    QTimer.singleShot(1000, refresh_with_file)
                
        except Exception as e:
            # Show error in status bar for longer
            import traceback
            error_msg = f"Warning: Could not auto-save results: {str(e)}"
            self.statusBar().showMessage(error_msg, 10000)
            print(f"Auto-save error: {traceback.format_exc()}")
            
    def on_playlist_selected(self, playlist_name: str) -> None:
        """Handle playlist selection from PlaylistSelector widget.
        
        Updates the status bar with the selected playlist name and
        track count.
        
        Args:
            playlist_name: Name of the selected playlist.
        """
        if playlist_name:
            track_count = self.playlist_selector.get_playlist_track_count(playlist_name)
            self.statusBar().showMessage(f"Selected playlist: {playlist_name} ({track_count} tracks)")
    
    def start_processing(self) -> None:
        """Start processing the selected playlist.
        
        Validates inputs (XML file and playlist), resets progress widget,
        shows progress section, disables start button, and starts processing
        via the controller. Handles performance monitoring tab if enabled.
        """
        # Get file path and playlist name
        xml_path = self.file_selector.get_file_path()
        playlist_name = self.playlist_selector.get_selected_playlist()
        
        # Validate inputs
        if not xml_path or not self.file_selector.validate_file(xml_path):
            self.statusBar().showMessage("Please select a valid XML file")
            return
        
        if not playlist_name:
            self.statusBar().showMessage("Please select a playlist")
            return
        
        # Reset progress widget
        self.progress_widget.reset()
        
        # Show progress section, hide results
        self.progress_group.setVisible(True)
        self.results_group.setVisible(False)
        
        # Disable start button during processing
        self.start_button.setEnabled(False)
        
        # Enable cancel button
        self.progress_widget.set_enabled(True)
        
        # Update status
        self.statusBar().showMessage(f"Starting processing: {playlist_name}...")
        
        # Get settings from config panel
        settings = self.config_panel.get_settings()
        auto_research = self.config_panel.get_auto_research()
        
        # Handle performance monitoring tab
        track_performance = settings.get("track_performance", False)
        print(f"[DEBUG] track_performance setting: {track_performance}")  # Debug output
        
        if track_performance:
            # Add performance tab if not already added
            if self.performance_tab_index is None:
                print("[DEBUG] Adding Performance tab")  # Debug output
                self.performance_tab_index = self.tabs.addTab(
                    self.performance_view, 
                    "Performance"
                )
                self.performance_view.start_monitoring()
                # Switch to performance tab to show it to the user
                self.tabs.setCurrentIndex(self.performance_tab_index)
                print(f"[DEBUG] Performance tab added at index {self.performance_tab_index}")  # Debug output
            else:
                # Tab already exists, just start monitoring
                print("[DEBUG] Performance tab already exists, starting monitoring")  # Debug output
                self.performance_view.start_monitoring()
                # Switch to performance tab to show it to the user
                self.tabs.setCurrentIndex(self.performance_tab_index)
        else:
            print("[DEBUG] track_performance is False, not adding Performance tab")  # Debug output
            # Remove performance tab if it exists
            if self.performance_tab_index is not None:
                self.performance_view.stop_monitoring()
                self.tabs.removeTab(self.performance_tab_index)
                self.performance_tab_index = None
        
        # Start processing via controller
        self.controller.start_processing(
            xml_path=xml_path,
            playlist_name=playlist_name,
            settings=settings,
            auto_research=auto_research
        )
    
    def on_cancel_requested(self) -> None:
        """Handle cancel button click from ProgressWidget.
        
        Cancels the current processing operation, re-enables the start button,
        and disables the cancel button.
        """
        self.controller.cancel_processing()
        self.statusBar().showMessage("Cancelling processing...")
        # Re-enable start button
        self.start_button.setEnabled(True)
        # Disable cancel button
        self.progress_widget.set_enabled(False)
    
    def on_progress_updated(self, progress_info: ProgressInfo) -> None:
        """Handle progress update from controller.
        
        Updates the progress widget and status bar with current processing
        information.
        
        Args:
            progress_info: ProgressInfo object containing progress details.
        """
        # Update progress widget
        self.progress_widget.update_progress(progress_info)
        
        # Update status bar
        if progress_info.current_track:
            title = progress_info.current_track.get('title', 'Unknown')
            self.statusBar().showMessage(
                f"Processing: {title} ({progress_info.completed_tracks}/{progress_info.total_tracks})"
            )
    
    def on_processing_complete(self, results: List[TrackResult]) -> None:
        """Handle processing completion.
        
        Stops performance monitoring if active, hides progress section,
        shows results, updates results view, calculates summary statistics,
        and automatically saves results to CSV.
        
        Args:
            results: List of TrackResult objects from processing.
        """
        # Stop performance monitoring if active
        if self.performance_view and self.performance_tab_index is not None:
            self.performance_view.stop_monitoring()
        
        # Hide progress, show results
        self.progress_group.setVisible(False)
        self.results_group.setVisible(True)
        
        # Switch to Main tab to show results
        self.tabs.setCurrentIndex(0)
        
        # Re-enable start button
        self.start_button.setEnabled(True)
        
        # Disable cancel button
        self.progress_widget.set_enabled(False)
        
        # Get playlist name for file naming
        playlist_name = self.playlist_selector.get_selected_playlist() or "playlist"
        
        # Update results view with results first
        if results:
            # Ensure results group is visible and shown
            self.results_group.setVisible(True)
            self.results_group.show()
            
            # Update results view with results
            self.results_view.set_results(results, playlist_name)
            
            # Force update the results view
            self.results_view.update()
            self.results_view.repaint()
            
            # Calculate summary statistics for status bar
            total = len(results)
            matched = sum(1 for r in results if r.matched)
            match_rate = (matched / total * 100) if total > 0 else 0
            
            # Update status bar
            self.statusBar().showMessage(
                f"Processing complete: {matched}/{total} matched ({match_rate:.1f}%)"
            )
            
            # Automatically save results to CSV (after displaying)
            self._auto_save_results(results, playlist_name)
        else:
            self.statusBar().showMessage("Processing complete: No results to display", 5000)
    
    def on_error_occurred(self, error: ProcessingError) -> None:
        """Handle error from controller.
        
        Hides progress section, re-enables start button, updates status bar,
        and shows an error dialog with error details.
        
        Args:
            error: ProcessingError object containing error information.
        """
        # Hide progress section
        self.progress_group.setVisible(False)
        
        # Re-enable start button
        self.start_button.setEnabled(True)
        
        # Disable cancel button
        self.progress_widget.set_enabled(False)
        
        # Update status bar with error
        self.statusBar().showMessage(f"Error: {error.message}")
        
        # Show error dialog
        error_dialog = ErrorDialog(error, self)
        error_dialog.exec()
