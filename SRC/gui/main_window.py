#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Main Window Module - Main application window

This module contains the MainWindow class for the GUI application.
"""

from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QMenuBar, QStatusBar, QGroupBox, QLabel, QPushButton
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QDragEnterEvent, QDropEvent
import os

from gui.file_selector import FileSelector
from gui.playlist_selector import PlaylistSelector
from gui.progress_widget import ProgressWidget
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
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        layout = QVBoxLayout(central_widget)
        layout.setSpacing(15)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # File selection section
        file_group = QGroupBox("File Selection")
        file_layout = QVBoxLayout()
        self.file_selector = FileSelector()
        self.file_selector.file_selected.connect(self.on_file_selected)
        file_layout.addWidget(self.file_selector)
        file_group.setLayout(file_layout)
        layout.addWidget(file_group)
        
        # Playlist selection section
        playlist_group = QGroupBox("Playlist Selection")
        playlist_layout = QVBoxLayout()
        self.playlist_selector = PlaylistSelector()
        self.playlist_selector.playlist_selected.connect(self.on_playlist_selected)
        playlist_layout.addWidget(self.playlist_selector)
        playlist_group.setLayout(playlist_layout)
        layout.addWidget(playlist_group)
        
        # Settings section (placeholder - will be replaced with ConfigPanel widget in Step 1.8)
        settings_group = QGroupBox("Settings")
        settings_layout = QVBoxLayout()
        settings_label = QLabel("Settings panel widget will go here")
        settings_label.setStyleSheet("color: gray; font-style: italic; padding: 20px;")
        settings_layout.addWidget(settings_label)
        settings_group.setLayout(settings_layout)
        layout.addWidget(settings_group)
        
        # Start Processing button
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        self.start_button = QPushButton("Start Processing")
        self.start_button.setMinimumHeight(40)
        self.start_button.clicked.connect(self.start_processing)
        button_layout.addWidget(self.start_button)
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # Progress section - ProgressWidget (Step 1.5)
        # Initially hidden until processing starts
        self.progress_group = QGroupBox("Progress")
        progress_layout = QVBoxLayout()
        self.progress_widget = ProgressWidget()
        self.progress_widget.cancel_requested.connect(self.on_cancel_requested)
        progress_layout.addWidget(self.progress_widget)
        self.progress_group.setLayout(progress_layout)
        self.progress_group.setVisible(False)  # Hidden until processing starts
        layout.addWidget(self.progress_group)
        
        # Results section (placeholder - will be replaced with ResultsView widget in Step 1.7)
        # Initially hidden until processing completes
        self.results_group = QGroupBox("Results")
        results_layout = QVBoxLayout()
        self.results_label = QLabel("Results view widget will go here")
        self.results_label.setStyleSheet("color: gray; font-style: italic; padding: 20px;")
        results_layout.addWidget(self.results_label)
        self.results_group.setLayout(results_layout)
        self.results_group.setVisible(False)  # Hidden until processing completes
        layout.addWidget(self.results_group)
        
        # Add stretch to push everything to top
        layout.addStretch()
        
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
        
        # Start processing via controller
        self.controller.start_processing(
            xml_path=xml_path,
            playlist_name=playlist_name,
            settings=None,  # Use default settings for now (will be configurable in Step 1.8)
            auto_research=False  # Will be configurable in Step 1.8
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
        
        # Calculate summary statistics
        total = len(results)
        matched = sum(1 for r in results if r.matched)
        unmatched = total - matched
        match_rate = (matched / total * 100) if total > 0 else 0
        
        # Update status bar
        self.statusBar().showMessage(
            f"Processing complete: {matched}/{total} matched ({match_rate:.1f}%)"
        )
        
        # TODO: Update results view widget (Step 1.7)
        # For now, just show a placeholder message
        self.results_label.setText(
            f"Processing complete!\n\n"
            f"Total tracks: {total}\n"
            f"Matched: {matched} ({match_rate:.1f}%)\n"
            f"Unmatched: {unmatched}\n\n"
            f"Results view widget will be implemented in Step 1.7"
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
