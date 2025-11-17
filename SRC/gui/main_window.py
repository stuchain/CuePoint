#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Main Window Module - Main application window

This module contains the MainWindow class for the GUI application.
"""

from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QMenuBar, QStatusBar, QGroupBox, QLabel, QPushButton, QTabWidget,
    QMenu, QMessageBox, QRadioButton, QButtonGroup, QScrollArea
)
from PySide6.QtCore import Qt, QSettings
from PySide6.QtGui import QDragEnterEvent, QDropEvent, QKeySequence, QAction
from typing import List, Dict
import os
import sys

from gui.file_selector import FileSelector
from gui.playlist_selector import PlaylistSelector
from gui.progress_widget import ProgressWidget
from gui.results_view import ResultsView
from gui.config_panel import ConfigPanel
from gui.batch_processor import BatchProcessorWidget
from gui.history_view import HistoryView
from gui.dialogs import ErrorDialog, AboutDialog, UserGuideDialog, KeyboardShortcutsDialog
from gui_controller import GUIController
from gui_interface import ProcessingError
from output_writer import write_csv_files
from utils import with_timestamp
from gui.performance_view import PerformanceView


class MainWindow(QMainWindow):
    """Main application window"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        # Create GUI controller for processing
        self.controller = GUIController()
        self.init_ui()
        self.setup_connections()
        
    def init_ui(self):
        """Initialize UI components"""
        # Window properties
        self.setWindowTitle("CuePoint - Beatport Metadata Enricher")
        self.setMinimumSize(800, 600)
        self.setGeometry(100, 100, 1000, 700)
        
        # Create menu bar
        self.create_menu_bar()
        
        # Create tab widget
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        
        # Main tab - wrap in scroll area for scrolling
        main_tab_scroll = QScrollArea()
        main_tab_scroll.setWidgetResizable(True)
        main_tab_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        main_tab_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        
        main_tab = QWidget()
        main_layout = QVBoxLayout(main_tab)
        main_layout.setSpacing(15)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        # File selection section
        file_group = QGroupBox("File Selection")
        file_layout = QVBoxLayout()
        self.file_selector = FileSelector()
        self.file_selector.file_selected.connect(self.on_file_selected)
        file_layout.addWidget(self.file_selector)
        file_group.setLayout(file_layout)
        main_layout.addWidget(file_group)
        
        # Processing mode selection
        mode_group = QGroupBox("Processing Mode")
        mode_layout = QHBoxLayout()
        self.mode_button_group = QButtonGroup()
        
        self.single_mode_radio = QRadioButton("Single Playlist")
        self.single_mode_radio.setChecked(True)  # Default to single mode
        self.single_mode_radio.toggled.connect(self.on_mode_changed)
        self.mode_button_group.addButton(self.single_mode_radio, 0)
        mode_layout.addWidget(self.single_mode_radio)
        
        self.batch_mode_radio = QRadioButton("Multiple Playlists")
        self.batch_mode_radio.toggled.connect(self.on_mode_changed)
        self.mode_button_group.addButton(self.batch_mode_radio, 1)
        mode_layout.addWidget(self.batch_mode_radio)
        
        mode_layout.addStretch()
        mode_group.setLayout(mode_layout)
        main_layout.addWidget(mode_group)
        
        # Single playlist selection section (shown in single mode)
        self.single_playlist_group = QGroupBox("Playlist Selection")
        single_playlist_layout = QVBoxLayout()
        self.playlist_selector = PlaylistSelector()
        self.playlist_selector.playlist_selected.connect(self.on_playlist_selected)
        single_playlist_layout.addWidget(self.playlist_selector)
        self.single_playlist_group.setLayout(single_playlist_layout)
        main_layout.addWidget(self.single_playlist_group)
        
        # Batch processor widget (shown in batch mode)
        self.batch_processor = BatchProcessorWidget()
        self.batch_processor.setVisible(False)  # Hidden by default
        main_layout.addWidget(self.batch_processor)
        
        # Start Processing button container (for single mode)
        self.start_button_container = QWidget()
        self.start_button_layout = QHBoxLayout(self.start_button_container)
        self.start_button_layout.addStretch()
        self.start_button = QPushButton("Start Processing")
        self.start_button.setMinimumHeight(40)
        self.start_button.clicked.connect(self.start_processing)
        self.start_button_layout.addWidget(self.start_button)
        self.start_button_layout.addStretch()
        main_layout.addWidget(self.start_button_container)
        
        # Progress section - ProgressWidget (Step 1.5)
        # Initially hidden until processing starts
        self.progress_group = QGroupBox("Progress")
        progress_layout = QVBoxLayout()
        self.progress_widget = ProgressWidget()
        self.progress_widget.cancel_requested.connect(self.on_cancel_requested)
        progress_layout.addWidget(self.progress_widget)
        self.progress_group.setLayout(progress_layout)
        self.progress_group.setVisible(False)  # Hidden until processing starts
        main_layout.addWidget(self.progress_group)
        
        # Results section - ResultsView widget (Step 1.7)
        # Initially hidden until processing completes
        self.results_group = QGroupBox("Results")
        results_layout = QVBoxLayout()
        
        # Wrap results view in scroll area for better scrolling
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.results_view = ResultsView()
        scroll_area.setWidget(self.results_view)
        
        results_layout.addWidget(scroll_area)
        self.results_group.setLayout(results_layout)
        self.results_group.setVisible(False)  # Hidden until processing completes
        main_layout.addWidget(self.results_group)
        
        # Add stretch to push everything to top
        main_layout.addStretch()
        
        # Set the main tab widget in the scroll area
        main_tab_scroll.setWidget(main_tab)
        
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
        self.tabs.addTab(main_tab_scroll, "Main")
        self.tabs.addTab(settings_tab, "Settings")
        self.tabs.addTab(history_tab, "Past Searches")
        
        # Performance monitoring view (created but not added to tabs yet)
        self.performance_view = PerformanceView()
        self.performance_tab_index = None  # Will be set when tab is added
        
        # Status bar
        self.statusBar().showMessage("Ready")
        
        # Enable drag and drop for the window
        self.setAcceptDrops(True)
    
    def setup_connections(self):
        """Set up signal connections for GUI controller"""
        # Connect controller signals to handlers
        self.controller.progress_updated.connect(self.on_progress_updated)
        self.controller.processing_complete.connect(self.on_processing_complete)
        self.controller.error_occurred.connect(self.on_error_occurred)
        
        # Connect batch processor signals
        self.batch_processor.batch_started.connect(self.on_batch_started)
        self.batch_processor.batch_cancelled.connect(self.on_batch_cancelled)
        self.batch_processor.batch_completed.connect(self.on_batch_completed)
        
        
    def create_menu_bar(self):
        """Create menu bar with File, Edit, View, Help menus"""
        menubar = self.menuBar()
        
        # File Menu
        file_menu = menubar.addMenu("&File")
        
        # Open XML File
        open_action = QAction("&Open XML File...", self)
        open_action.setShortcut(QKeySequence.Open)
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
        copy_action.triggered.connect(self.on_copy_selected)
        edit_menu.addAction(copy_action)
        
        # Select All
        select_all_action = QAction("Select &All", self)
        select_all_action.setShortcut(QKeySequence.SelectAll)
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
        fullscreen_action.setCheckable(True)
        fullscreen_action.triggered.connect(self.toggle_fullscreen)
        view_menu.addAction(fullscreen_action)
        
        # Help Menu
        help_menu = menubar.addMenu("&Help")
        
        # User Guide
        guide_action = QAction("&User Guide", self)
        guide_action.setShortcut(QKeySequence.HelpContents)
        guide_action.triggered.connect(self.on_show_user_guide)
        help_menu.addAction(guide_action)
        
        # Keyboard Shortcuts
        shortcuts_action = QAction("&Keyboard Shortcuts", self)
        shortcuts_action.triggered.connect(self.on_show_shortcuts)
        help_menu.addAction(shortcuts_action)
        
        help_menu.addSeparator()
        
        # About
        about_action = QAction("&About CuePoint", self)
        about_action.triggered.connect(self.on_show_about)
        help_menu.addAction(about_action)
        
    def dragEnterEvent(self, event: QDragEnterEvent):
        """Handle drag enter event"""
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if len(urls) == 1 and urls[0].toLocalFile().endswith('.xml'):
                event.acceptProposedAction()
                
    def dropEvent(self, event: QDropEvent):
        """Handle drop event"""
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files and files[0].lower().endswith('.xml'):
            # Forward to file selector
            self.file_selector.set_file(files[0])
            event.acceptProposedAction()
            
    def on_file_open(self):
        """Handle File > Open menu action"""
        self.file_selector.browse_file()
        
    def on_file_selected(self, file_path: str):
        """Handle file selection from FileSelector"""
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
    
    def on_mode_changed(self):
        """Handle processing mode change (single vs batch)"""
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
    
    def update_recent_files_menu(self):
        """Update recent files menu with saved files"""
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
    
    def on_open_recent_file(self, file_path: str):
        """Open a recent file"""
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
    
    def save_recent_file(self, file_path: str):
        """Save file to recent files list"""
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
    
    def on_copy_selected(self):
        """Copy selected results to clipboard"""
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
    
    def on_select_all(self):
        """Select all items in results table"""
        if hasattr(self, 'results_view') and self.results_view.table.rowCount() > 0:
            self.results_view.table.selectAll()
            self.statusBar().showMessage("All items selected", 2000)
        else:
            self.statusBar().showMessage("No results to select", 2000)
    
    def on_clear_results(self):
        """Clear results display"""
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
    
    def on_toggle_progress(self):
        """Toggle progress section visibility"""
        is_visible = self.toggle_progress_action.isChecked()
        self.progress_group.setVisible(is_visible)
        # Update menu text based on current state
        if is_visible:
            self.toggle_progress_action.setText("Hide &Progress")
        else:
            self.toggle_progress_action.setText("Show &Progress")
    
    def on_toggle_results(self):
        """Toggle results section visibility"""
        is_visible = self.toggle_results_action.isChecked()
        self.results_group.setVisible(is_visible)
        # Update menu text based on current state
        if is_visible:
            self.toggle_results_action.setText("Hide &Results")
        else:
            self.toggle_results_action.setText("Show &Results")
    
    def toggle_fullscreen(self):
        """Toggle full screen mode"""
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()
    
    def on_show_user_guide(self):
        """Show user guide dialog"""
        dialog = UserGuideDialog(self)
        dialog.exec()
    
    def on_show_shortcuts(self):
        """Show keyboard shortcuts dialog"""
        dialog = KeyboardShortcutsDialog(self)
        dialog.exec()
    
    def on_show_about(self):
        """Show about dialog"""
        dialog = AboutDialog(self)
        dialog.exec()
    
    def on_batch_started(self, playlist_names: List[str]):
        """Handle batch processing started"""
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
    
    def _on_batch_playlist_complete(self, results):
        """Handle completion of a playlist in batch"""
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
    
    def _on_batch_playlist_error(self, error: ProcessingError):
        """Handle error for a playlist in batch"""
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
    
    def _reconnect_regular_signals(self):
        """Reconnect regular processing signals after batch completes"""
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
    
    def on_batch_cancelled(self):
        """Handle batch processing cancelled"""
        self.controller.cancel_processing()
        self.statusBar().showMessage("Batch processing cancelled")
        
        # Reconnect regular processing signals
        self._reconnect_regular_signals()
    
    def on_batch_completed(self, results_dict: Dict[str, List]):
        """Handle batch processing completion - display results in separate tables per playlist"""
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
    
    def _auto_save_results(self, results, playlist_name: str):
        """Automatically save results to CSV file"""
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
            
    def on_playlist_selected(self, playlist_name: str):
        """Handle playlist selection from PlaylistSelector"""
        if playlist_name:
            track_count = self.playlist_selector.get_playlist_track_count(playlist_name)
            self.statusBar().showMessage(f"Selected playlist: {playlist_name} ({track_count} tracks)")
    
    def start_processing(self):
        """Start processing the selected playlist"""
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
    
    def on_cancel_requested(self):
        """Handle cancel button click from ProgressWidget"""
        self.controller.cancel_processing()
        self.statusBar().showMessage("Cancelling processing...")
        # Re-enable start button
        self.start_button.setEnabled(True)
        # Disable cancel button
        self.progress_widget.set_enabled(False)
    
    def on_progress_updated(self, progress_info):
        """Handle progress update from controller"""
        # Update progress widget
        self.progress_widget.update_progress(progress_info)
        
        # Update status bar
        if progress_info.current_track:
            title = progress_info.current_track.get('title', 'Unknown')
            self.statusBar().showMessage(
                f"Processing: {title} ({progress_info.completed_tracks}/{progress_info.total_tracks})"
            )
    
    def on_processing_complete(self, results):
        """Handle processing completion"""
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
    
    def on_error_occurred(self, error: ProcessingError):
        """Handle error from controller"""
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
