#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Main Window Module - Main application window

This module contains the MainWindow class for the GUI application.
"""

from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QMenuBar, QStatusBar, QGroupBox, QLabel, QPushButton, QTabWidget
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QDragEnterEvent, QDropEvent
import os

from gui.file_selector import FileSelector
from gui.playlist_selector import PlaylistSelector
from gui.progress_widget import ProgressWidget
from gui.results_view import ResultsView
from gui.config_panel import ConfigPanel
from gui_controller import GUIController
from gui_interface import ProcessingError


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
        
        # Main tab
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
        
        # Playlist selection section
        playlist_group = QGroupBox("Playlist Selection")
        playlist_layout = QVBoxLayout()
        self.playlist_selector = PlaylistSelector()
        self.playlist_selector.playlist_selected.connect(self.on_playlist_selected)
        playlist_layout.addWidget(self.playlist_selector)
        playlist_group.setLayout(playlist_layout)
        main_layout.addWidget(playlist_group)
        
        # Start Processing button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        self.start_button = QPushButton("Start Processing")
        self.start_button.setMinimumHeight(40)
        self.start_button.clicked.connect(self.start_processing)
        button_layout.addWidget(self.start_button)
        button_layout.addStretch()
        main_layout.addLayout(button_layout)
        
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
        self.results_view = ResultsView()
        results_layout.addWidget(self.results_view)
        self.results_group.setLayout(results_layout)
        self.results_group.setVisible(False)  # Hidden until processing completes
        main_layout.addWidget(self.results_group)
        
        # Add stretch to push everything to top
        main_layout.addStretch()
        
        # Settings tab
        settings_tab = QWidget()
        settings_layout = QVBoxLayout(settings_tab)
        settings_layout.setContentsMargins(10, 10, 10, 10)
        self.config_panel = ConfigPanel()
        settings_layout.addWidget(self.config_panel)
        
        # Add tabs
        self.tabs.addTab(main_tab, "Main")
        self.tabs.addTab(settings_tab, "Settings")
        
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
        
    def create_menu_bar(self):
        """Create menu bar with basic menus"""
        menubar = self.menuBar()
        
        # File menu
        file_menu = menubar.addMenu("&File")
        file_menu.addAction("&Open XML File...", self.on_file_open)
        file_menu.addAction("&Recent Files")
        file_menu.addSeparator()
        file_menu.addAction("E&xit", self.close)
        
        # Edit menu
        edit_menu = menubar.addMenu("&Edit")
        edit_menu.addAction("&Settings...")
        
        # View menu
        view_menu = menubar.addMenu("&View")
        view_menu.addAction("&Show Progress")
        view_menu.addAction("&Show Results")
        
        # Help menu
        help_menu = menubar.addMenu("&Help")
        help_menu.addAction("&About")
        help_menu.addAction("&Documentation")
        
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
            except Exception as e:
                self.statusBar().showMessage(f"Error loading XML: {str(e)}")
                # Error dialog will be handled in later step
        else:
            self.statusBar().showMessage(f"Invalid file: {file_path}")
            # Clear playlist selector if file is invalid
            self.playlist_selector.clear()
            
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
        # Hide progress, show results
        self.progress_group.setVisible(False)
        self.results_group.setVisible(True)
        
        # Re-enable start button
        self.start_button.setEnabled(True)
        
        # Disable cancel button
        self.progress_widget.set_enabled(False)
        
        # Get playlist name for file naming
        playlist_name = self.playlist_selector.get_selected_playlist() or "playlist"
        
        # Update results view with results
        self.results_view.set_results(results, playlist_name)
        
        # Calculate summary statistics for status bar
        total = len(results)
        matched = sum(1 for r in results if r.matched)
        match_rate = (matched / total * 100) if total > 0 else 0
        
        # Update status bar
        self.statusBar().showMessage(
            f"Processing complete: {matched}/{total} matched ({match_rate:.1f}%)"
        )
    
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
        
        # TODO: Show error dialog (Step 1.9)
        # For now, just show error in status bar
        print(f"Error: {error.message}")
        if error.details:
            print(f"Details: {error.details}")
        if error.suggestions:
            print("Suggestions:")
            for suggestion in error.suggestions:
                print(f"  - {suggestion}")
