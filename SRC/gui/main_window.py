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


class MainWindow(QMainWindow):
    """Main application window"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
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
        
        # Playlist selection section (placeholder - will be replaced with PlaylistSelector widget in Step 1.4)
        playlist_group = QGroupBox("Playlist Selection")
        playlist_layout = QVBoxLayout()
        playlist_label = QLabel("Playlist selector widget will go here")
        playlist_label.setStyleSheet("color: gray; font-style: italic; padding: 20px;")
        playlist_layout.addWidget(playlist_label)
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
        
        # Progress section (placeholder - will be replaced with ProgressWidget in Step 1.5)
        # Initially hidden until processing starts
        self.progress_group = QGroupBox("Progress")
        progress_layout = QVBoxLayout()
        progress_label = QLabel("Progress widget will go here")
        progress_label.setStyleSheet("color: gray; font-style: italic; padding: 20px;")
        progress_layout.addWidget(progress_label)
        self.progress_group.setLayout(progress_layout)
        self.progress_group.setVisible(False)  # Hidden until processing starts
        layout.addWidget(self.progress_group)
        
        # Results section (placeholder - will be replaced with ResultsView widget in Step 1.7)
        # Initially hidden until processing completes
        self.results_group = QGroupBox("Results")
        results_layout = QVBoxLayout()
        results_label = QLabel("Results view widget will go here")
        results_label.setStyleSheet("color: gray; font-style: italic; padding: 20px;")
        results_layout.addWidget(results_label)
        self.results_group.setLayout(results_layout)
        self.results_group.setVisible(False)  # Hidden until processing completes
        layout.addWidget(self.results_group)
        
        # Add stretch to push everything to top
        layout.addStretch()
        
        # Status bar
        self.statusBar().showMessage("Ready")
        
        # Enable drag and drop for the window
        self.setAcceptDrops(True)
        
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
            self.statusBar().showMessage(f"File selected: {os.path.basename(file_path)}")
        else:
            self.statusBar().showMessage(f"Invalid file: {file_path}")
