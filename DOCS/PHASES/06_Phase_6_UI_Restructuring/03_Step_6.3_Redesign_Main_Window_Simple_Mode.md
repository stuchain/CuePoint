# Step 6.3: Redesign Main Window - Simple Mode

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 4-5 days  
**Dependencies**: Step 6.2 (Implement Theme System)

---

## Goal

Redesign the main window to provide a simplified, intuitive interface for non-technical users. The default view should show only essential features, with a clear step-by-step workflow.

---

## Success Criteria

- [ ] Simplified main window layout implemented
- [ ] Large, clear buttons for primary actions
- [ ] Step-by-step workflow visible
- [ ] Visual feedback for all actions
- [ ] Help tooltips on all elements
- [ ] Advanced settings hidden by default
- [ ] Responsive layout
- [ ] All existing functionality preserved
- [ ] User testing completed

---

## Analytical Design

### Simplified Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  CuePoint                    [⚙️] [❓] [☰]     │  Header
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Step 1: Select Your Playlist File             │   │  Step 1
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │  📁 No file selected                     │   │   │
│  │  │  [Browse Files...]                       │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Step 2: Choose Playlist (Optional)            │   │  Step 2
│  │  [Select a playlist from your file...] ▼      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ⚙️  Advanced Settings (Optional)               │   │  Step 3
│  │  [Show Advanced Settings ▼]                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│         [▶️  Process Playlist]  (Large Button)          │  Action
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  📊 Results                                      │   │  Results
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │  [Empty state: Select file to begin]     │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│         [💾 Export Results]  (Secondary Button)        │  Export
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Component Architecture

```python
# src/cuepoint/ui/main_window_simple.py
"""
Simplified main window for non-technical users.
"""

from typing import Optional
from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog, QComboBox,
    QGroupBox, QMessageBox, QProgressBar
)

from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton, PixelCard
from cuepoint.ui.controllers.main_controller import GUIController
from cuepoint.ui.widgets.results_view import ResultsView


class SimpleMainWindow(QMainWindow):
    """Simplified main window for easy use."""
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        
        # Initialize theme
        self.theme_manager = ThemeManager()
        
        # Initialize controller
        self.controller = GUIController()
        
        # State
        self.selected_file: Optional[Path] = None
        self.selected_playlist: Optional[str] = None
        
        # Initialize UI
        self.init_ui()
        self.setup_connections()
    
    def init_ui(self):
        """Initialize simplified UI."""
        self.setWindowTitle("CuePoint - Beatport Metadata Enricher")
        self.setMinimumSize(800, 600)
        self.resize(1000, 700)
        
        # Create central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(24)
        main_layout.setContentsMargins(32, 32, 32, 32)
        
        # Header
        self.create_header(main_layout)
        
        # Step 1: File Selection
        self.create_file_selection_step(main_layout)
        
        # Step 2: Playlist Selection
        self.create_playlist_selection_step(main_layout)
        
        # Step 3: Advanced Settings (Collapsed)
        self.create_advanced_settings_step(main_layout)
        
        # Process Button
        self.create_process_button(main_layout)
        
        # Results Area
        self.create_results_area(main_layout)
        
        # Export Button
        self.create_export_button(main_layout)
        
        # Status Bar
        self.create_status_bar()
    
    def create_header(self, parent_layout: QVBoxLayout):
        """Create header with logo and menu."""
        header_layout = QHBoxLayout()
        
        # Logo and title
        logo_label = QLabel("🎵")
        logo_label.setStyleSheet("font-size: 32px;")
        title_label = QLabel("CuePoint")
        title_label.setStyleSheet("font-size: 24px; font-weight: bold;")
        
        header_layout.addWidget(logo_label)
        header_layout.addWidget(title_label)
        header_layout.addStretch()
        
        # Menu buttons
        settings_btn = QPushButton("⚙️")
        settings_btn.setToolTip("Settings")
        settings_btn.setFixedSize(40, 40)
        
        help_btn = QPushButton("❓")
        help_btn.setToolTip("Help")
        help_btn.setFixedSize(40, 40)
        
        menu_btn = QPushButton("☰")
        menu_btn.setToolTip("Menu")
        menu_btn.setFixedSize(40, 40)
        
        header_layout.addWidget(settings_btn)
        header_layout.addWidget(help_btn)
        header_layout.addWidget(menu_btn)
        
        parent_layout.addLayout(header_layout)
    
    def create_file_selection_step(self, parent_layout: QVBoxLayout):
        """Create file selection step."""
        step_card = PixelCard()
        step_layout = QVBoxLayout(step_card)
        step_layout.setSpacing(12)
        
        # Step title
        step_title = QLabel("Step 1: Select Your Playlist File")
        step_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        step_layout.addWidget(step_title)
        
        # File display
        self.file_display = QLabel("📁 No file selected")
        self.file_display.setStyleSheet("""
            padding: 16px;
            border: 2px dashed #999;
            border-radius: 4px;
            background-color: #F5F5F5;
        """)
        step_layout.addWidget(self.file_display)
        
        # Browse button
        browse_btn = PixelButton("Browse Files...", class_name="primary")
        browse_btn.setMinimumHeight(48)
        browse_btn.clicked.connect(self.browse_file)
        step_layout.addWidget(browse_btn)
        
        parent_layout.addWidget(step_card)
    
    def create_playlist_selection_step(self, parent_layout: QVBoxLayout):
        """Create playlist selection step."""
        step_card = PixelCard()
        step_layout = QVBoxLayout(step_card)
        step_layout.setSpacing(12)
        
        # Step title
        step_title = QLabel("Step 2: Choose Playlist (Optional)")
        step_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        step_layout.addWidget(step_title)
        
        # Playlist dropdown
        self.playlist_combo = QComboBox()
        self.playlist_combo.setMinimumHeight(48)
        self.playlist_combo.addItem("Select a playlist from your file...")
        self.playlist_combo.setEnabled(False)
        self.playlist_combo.setToolTip("Select a specific playlist from your XML file")
        step_layout.addWidget(self.playlist_combo)
        
        parent_layout.addWidget(step_card)
    
    def create_advanced_settings_step(self, parent_layout: QVBoxLayout):
        """Create collapsible advanced settings step."""
        step_card = PixelCard()
        step_layout = QVBoxLayout(step_card)
        step_layout.setSpacing(12)
        
        # Header with toggle
        header_layout = QHBoxLayout()
        
        step_title = QLabel("⚙️  Advanced Settings (Optional)")
        step_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        header_layout.addWidget(step_title)
        header_layout.addStretch()
        
        self.advanced_toggle = QPushButton("Show Advanced Settings ▼")
        self.advanced_toggle.setCheckable(True)
        self.advanced_toggle.clicked.connect(self.toggle_advanced_settings)
        header_layout.addWidget(self.advanced_toggle)
        
        step_layout.addLayout(header_layout)
        
        # Advanced settings panel (hidden by default)
        self.advanced_panel = QWidget()
        self.advanced_panel.setVisible(False)
        advanced_layout = QVBoxLayout(self.advanced_panel)
        advanced_layout.setSpacing(8)
        
        # Add advanced settings widgets here
        # (Will be implemented in Step 6.4)
        
        step_layout.addWidget(self.advanced_panel)
        
        parent_layout.addWidget(step_card)
    
    def create_process_button(self, parent_layout: QVBoxLayout):
        """Create large process button."""
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.process_btn = PixelButton("▶️  Process Playlist", class_name="primary")
        self.process_btn.setMinimumHeight(64)
        self.process_btn.setMinimumWidth(300)
        self.process_btn.setStyleSheet("font-size: 18px; font-weight: bold;")
        self.process_btn.clicked.connect(self.process_playlist)
        self.process_btn.setEnabled(False)
        self.process_btn.setToolTip("Start processing your playlist")
        
        button_layout.addWidget(self.process_btn)
        button_layout.addStretch()
        
        parent_layout.addLayout(button_layout)
    
    def create_results_area(self, parent_layout: QVBoxLayout):
        """Create results display area."""
        results_card = PixelCard()
        results_layout = QVBoxLayout(results_card)
        results_layout.setSpacing(12)
        
        # Title
        results_title = QLabel("📊 Results")
        results_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        results_layout.addWidget(results_title)
        
        # Results view (empty state by default)
        self.results_view = ResultsView()
        self.results_view.setMinimumHeight(300)
        results_layout.addWidget(self.results_view)
        
        parent_layout.addWidget(results_card)
    
    def create_export_button(self, parent_layout: QVBoxLayout):
        """Create export button."""
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.export_btn = PixelButton("💾 Export Results", class_name="secondary")
        self.export_btn.setMinimumHeight(48)
        self.export_btn.setMinimumWidth(200)
        self.export_btn.clicked.connect(self.export_results)
        self.export_btn.setEnabled(False)
        self.export_btn.setToolTip("Export results to CSV file")
        
        button_layout.addWidget(self.export_btn)
        button_layout.addStretch()
        
        parent_layout.addLayout(button_layout)
    
    def create_status_bar(self):
        """Create status bar."""
        self.statusBar().showMessage("Ready")
    
    def setup_connections(self):
        """Set up signal connections."""
        # Controller signals
        self.controller.progress_updated.connect(self.on_progress)
        self.controller.processing_complete.connect(self.on_processing_complete)
        self.controller.error_occurred.connect(self.on_error)
    
    def browse_file(self):
        """Browse for XML file."""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Playlist File",
            "",
            "XML Files (*.xml);;All Files (*)"
        )
        
        if file_path:
            self.selected_file = Path(file_path)
            self.file_display.setText(f"📁 {self.selected_file.name}")
            self.file_display.setStyleSheet("""
                padding: 16px;
                border: 2px solid #4A90E2;
                border-radius: 4px;
                background-color: #E8F4FD;
            """)
            
            # Load playlists
            self.load_playlists()
            
            # Enable process button
            self.process_btn.setEnabled(True)
    
    def load_playlists(self):
        """Load playlists from selected file."""
        if not self.selected_file:
            return
        
        try:
            # Parse XML and get playlists
            # (Implementation depends on existing parser)
            playlists = []  # Get from parser
            
            self.playlist_combo.clear()
            self.playlist_combo.addItem("All Playlists")
            for playlist in playlists:
                self.playlist_combo.addItem(playlist)
            
            self.playlist_combo.setEnabled(True)
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Could not load playlists: {e}")
    
    def toggle_advanced_settings(self, checked: bool):
        """Toggle advanced settings visibility."""
        self.advanced_panel.setVisible(checked)
        if checked:
            self.advanced_toggle.setText("Hide Advanced Settings ▲")
        else:
            self.advanced_toggle.setText("Show Advanced Settings ▼")
    
    def process_playlist(self):
        """Process selected playlist."""
        if not self.selected_file:
            return
        
        # Disable button during processing
        self.process_btn.setEnabled(False)
        self.process_btn.setText("⏳ Processing...")
        
        # Get selected playlist
        playlist_name = None
        if self.playlist_combo.currentIndex() > 0:
            playlist_name = self.playlist_combo.currentText()
        
        # Start processing
        self.controller.process_playlist(
            xml_path=str(self.selected_file),
            playlist_name=playlist_name
        )
    
    def on_progress(self, current: int, total: int, message: str):
        """Handle progress updates."""
        self.statusBar().showMessage(f"Processing: {current}/{total} - {message}")
    
    def on_processing_complete(self, results):
        """Handle processing completion."""
        self.process_btn.setEnabled(True)
        self.process_btn.setText("▶️  Process Playlist")
        
        # Display results
        self.results_view.set_results(results)
        
        # Enable export
        self.export_btn.setEnabled(True)
        
        self.statusBar().showMessage("Processing complete!")
    
    def on_error(self, error_message: str):
        """Handle errors."""
        self.process_btn.setEnabled(True)
        self.process_btn.setText("▶️  Process Playlist")
        
        QMessageBox.critical(self, "Error", error_message)
        self.statusBar().showMessage("Error occurred")
    
    def export_results(self):
        """Export results to CSV."""
        # Implementation from existing export functionality
        pass
```

### Integration with Existing Code

The simplified main window should:
1. **Wrap existing functionality**: Use existing controllers and services
2. **Preserve all features**: All functionality available, just hidden
3. **Maintain compatibility**: Work with existing data models
4. **Use theme system**: Apply pixel art theme

---

## Detailed Implementation Guide

### Step-by-Step Implementation

#### Step 1: Review Existing Code Structure

**Action**: Understand current main window and controller structure

**Files to Review**:
- `SRC/cuepoint/ui/main_window.py` - Current main window
- `SRC/cuepoint/ui/controllers/main_controller.py` - Processing controller
- `SRC/cuepoint/ui/widgets/results_view.py` - Current results view
- `SRC/cuepoint/ui/widgets/file_selector.py` - File selection widget
- `SRC/cuepoint/ui/widgets/playlist_selector.py` - Playlist selection widget

**Key Understanding**:
- How `GUIController` processes playlists
- How results are displayed
- How file selection works
- Signal/slot connections

#### Step 2: Create Simple Main Window File

**File Path**: `SRC/cuepoint/ui/main_window_simple.py`

**Action**: Create new simplified main window

**Complete Implementation** (with full integration):
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Simplified main window for non-technical users.

This module provides a simplified, step-by-step interface that hides
complexity while maintaining all functionality through existing controllers.
"""

import logging
from pathlib import Path
from typing import Optional, List

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog, QComboBox,
    QGroupBox, QMessageBox, QProgressBar, QStatusBar
)

from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton, PixelCard
from cuepoint.ui.controllers.main_controller import GUIController
from cuepoint.ui.widgets.results_view import ResultsView
from cuepoint.models.result import TrackResult

logger = logging.getLogger(__name__)


class SimpleMainWindow(QMainWindow):
    """Simplified main window for easy use.
    
    This window provides a step-by-step interface that guides users
    through the playlist processing workflow. Advanced features are
    hidden by default but accessible through a collapsible panel.
    
    Signals:
        processing_started: Emitted when processing begins
        processing_complete: Emitted when processing finishes
        export_requested: Emitted when export is requested
    """
    
    processing_started = Signal()
    processing_complete = Signal(list)  # List[TrackResult]
    export_requested = Signal()
    
    def __init__(self, parent: Optional[QWidget] = None):
        """Initialize simplified main window.
        
        Args:
            parent: Parent widget
        """
        super().__init__(parent)
        
        # Initialize theme FIRST (before any UI)
        self.theme_manager = ThemeManager()
        self.theme_manager.theme_changed.connect(self.on_theme_changed)
        
        # Initialize controller (from existing code)
        self.controller = GUIController()
        
        # State
        self.selected_file: Optional[Path] = None
        self.selected_playlist: Optional[str] = None
        self.current_results: List[TrackResult] = []
        
        # Initialize UI
        self.init_ui()
        self.setup_connections()
        
        logger.info("SimpleMainWindow initialized")
    
    def init_ui(self):
        """Initialize simplified UI."""
        self.setWindowTitle("CuePoint - Beatport Metadata Enricher")
        self.setMinimumSize(800, 600)
        self.resize(1000, 700)
        
        # Create central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(24)
        main_layout.setContentsMargins(32, 32, 32, 32)
        
        # Header
        self.create_header(main_layout)
        
        # Step 1: File Selection
        self.create_file_selection_step(main_layout)
        
        # Step 2: Playlist Selection
        self.create_playlist_selection_step(main_layout)
        
        # Step 3: Advanced Settings (Collapsed)
        self.create_advanced_settings_step(main_layout)
        
        # Process Button
        self.create_process_button(main_layout)
        
        # Results Area
        self.create_results_area(main_layout)
        
        # Export Button
        self.create_export_button(main_layout)
        
        # Status Bar
        self.create_status_bar()
    
    def create_header(self, parent_layout: QVBoxLayout):
        """Create header with logo and menu."""
        header_layout = QHBoxLayout()
        
        # Logo and title
        logo_label = QLabel("🎵")
        logo_label.setStyleSheet("font-size: 32px;")
        title_label = QLabel("CuePoint")
        title_label.setStyleSheet("font-size: 24px; font-weight: bold;")
        
        header_layout.addWidget(logo_label)
        header_layout.addWidget(title_label)
        header_layout.addStretch()
        
        # Menu buttons (using theme icons)
        settings_btn = QPushButton()
        settings_icon = self.theme_manager.get_icon('settings', '16x16')
        settings_btn.setIcon(settings_icon)
        settings_btn.setToolTip("Settings")
        settings_btn.setFixedSize(40, 40)
        
        help_btn = QPushButton()
        help_icon = self.theme_manager.get_icon('info', '16x16')
        help_btn.setIcon(help_icon)
        help_btn.setToolTip("Help")
        help_btn.setFixedSize(40, 40)
        
        menu_btn = QPushButton("☰")
        menu_btn.setToolTip("Menu")
        menu_btn.setFixedSize(40, 40)
        
        header_layout.addWidget(settings_btn)
        header_layout.addWidget(help_btn)
        header_layout.addWidget(menu_btn)
        
        parent_layout.addLayout(header_layout)
    
    def create_file_selection_step(self, parent_layout: QVBoxLayout):
        """Create file selection step."""
        step_card = PixelCard()
        step_layout = QVBoxLayout(step_card)
        step_layout.setSpacing(12)
        
        # Step title
        step_title = QLabel("Step 1: Select Your Playlist File")
        step_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        step_layout.addWidget(step_title)
        
        # File display
        self.file_display = QLabel("📁 No file selected")
        self.file_display.setStyleSheet("""
            padding: 16px;
            border: 2px dashed #999;
            border-radius: 4px;
            background-color: #F5F5F5;
        """)
        step_layout.addWidget(self.file_display)
        
        # Browse button
        browse_btn = PixelButton("Browse Files...", class_name="primary")
        browse_btn.setMinimumHeight(48)
        browse_icon = self.theme_manager.get_icon('folder', '16x16')
        browse_btn.setIcon(browse_icon)
        browse_btn.clicked.connect(self.browse_file)
        browse_btn.setToolTip("Select your XML playlist file")
        step_layout.addWidget(browse_btn)
        
        parent_layout.addWidget(step_card)
    
    def create_playlist_selection_step(self, parent_layout: QVBoxLayout):
        """Create playlist selection step."""
        step_card = PixelCard()
        step_layout = QVBoxLayout(step_card)
        step_layout.setSpacing(12)
        
        # Step title
        step_title = QLabel("Step 2: Choose Playlist (Optional)")
        step_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        step_layout.addWidget(step_title)
        
        # Playlist dropdown
        self.playlist_combo = QComboBox()
        self.playlist_combo.setMinimumHeight(48)
        self.playlist_combo.addItem("Select a playlist from your file...")
        self.playlist_combo.setEnabled(False)
        self.playlist_combo.setToolTip("Select a specific playlist from your XML file")
        step_layout.addWidget(self.playlist_combo)
        
        parent_layout.addWidget(step_card)
    
    def create_advanced_settings_step(self, parent_layout: QVBoxLayout):
        """Create collapsible advanced settings step."""
        step_card = PixelCard()
        step_layout = QVBoxLayout(step_card)
        step_layout.setSpacing(12)
        
        # Header with toggle
        header_layout = QHBoxLayout()
        
        step_title = QLabel("⚙️  Advanced Settings (Optional)")
        step_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        header_layout.addWidget(step_title)
        header_layout.addStretch()
        
        self.advanced_toggle = QPushButton("Show Advanced Settings ▼")
        self.advanced_toggle.setCheckable(True)
        self.advanced_toggle.clicked.connect(self.toggle_advanced_settings)
        header_layout.addWidget(self.advanced_toggle)
        
        step_layout.addLayout(header_layout)
        
        # Advanced settings panel (hidden by default)
        # Will be implemented in Step 6.4
        self.advanced_panel = QWidget()
        self.advanced_panel.setVisible(False)
        advanced_layout = QVBoxLayout(self.advanced_panel)
        advanced_layout.setSpacing(8)
        
        # Placeholder label
        placeholder = QLabel("Advanced settings will be available here")
        placeholder.setStyleSheet("color: #999; padding: 16px;")
        advanced_layout.addWidget(placeholder)
        
        step_layout.addWidget(self.advanced_panel)
        
        parent_layout.addWidget(step_card)
    
    def create_process_button(self, parent_layout: QVBoxLayout):
        """Create large process button."""
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.process_btn = PixelButton("▶️  Process Playlist", class_name="primary")
        self.process_btn.setMinimumHeight(64)
        self.process_btn.setMinimumWidth(300)
        self.process_btn.setStyleSheet("font-size: 18px; font-weight: bold;")
        self.process_btn.clicked.connect(self.process_playlist)
        self.process_btn.setEnabled(False)
        self.process_btn.setToolTip("Start processing your playlist")
        
        button_layout.addWidget(self.process_btn)
        button_layout.addStretch()
        
        parent_layout.addLayout(button_layout)
    
    def create_results_area(self, parent_layout: QVBoxLayout):
        """Create results display area."""
        results_card = PixelCard()
        results_layout = QVBoxLayout(results_card)
        results_layout.setSpacing(12)
        
        # Title
        results_title = QLabel("📊 Results")
        results_title.setStyleSheet("font-size: 18px; font-weight: bold;")
        results_layout.addWidget(results_title)
        
        # Results view (use existing ResultsView for now, will enhance in Step 6.5)
        from cuepoint.ui.widgets.results_view import ResultsView
        self.results_view = ResultsView()
        self.results_view.setMinimumHeight(300)
        results_layout.addWidget(self.results_view)
        
        parent_layout.addWidget(results_card)
    
    def create_export_button(self, parent_layout: QVBoxLayout):
        """Create export button."""
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.export_btn = PixelButton("💾 Export Results", class_name="secondary")
        self.export_btn.setMinimumHeight(48)
        self.export_btn.setMinimumWidth(200)
        export_icon = self.theme_manager.get_icon('export', '16x16')
        self.export_btn.setIcon(export_icon)
        self.export_btn.clicked.connect(self.export_results)
        self.export_btn.setEnabled(False)
        self.export_btn.setToolTip("Export results to CSV file")
        
        button_layout.addWidget(self.export_btn)
        button_layout.addStretch()
        
        parent_layout.addLayout(button_layout)
    
    def create_status_bar(self):
        """Create status bar."""
        self.statusBar().showMessage("Ready")
    
    def setup_connections(self):
        """Set up signal connections with controller."""
        # Connect controller signals
        if hasattr(self.controller, 'progress_updated'):
            self.controller.progress_updated.connect(self.on_progress)
        if hasattr(self.controller, 'processing_complete'):
            self.controller.processing_complete.connect(self.on_processing_complete)
        if hasattr(self.controller, 'error_occurred'):
            self.controller.error_occurred.connect(self.on_error)
        
        logger.debug("Signal connections established")
    
    def browse_file(self):
        """Browse for XML file."""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Playlist File",
            "",
            "XML Files (*.xml);;All Files (*)"
        )
        
        if file_path:
            self.selected_file = Path(file_path)
            self.file_display.setText(f"📁 {self.selected_file.name}")
            self.file_display.setStyleSheet("""
                padding: 16px;
                border: 2px solid #4A90E2;
                border-radius: 4px;
                background-color: #E8F4FD;
            """)
            
            # Load playlists
            self.load_playlists()
            
            # Enable process button
            self.process_btn.setEnabled(True)
            
            logger.info(f"File selected: {self.selected_file}")
    
    def load_playlists(self):
        """Load playlists from selected file.
        
        This method uses the existing parser to extract playlist names
        from the XML file.
        """
        if not self.selected_file:
            return
        
        try:
            # Use existing parser to get playlists
            from cuepoint.core.mix_parser import MixParser
            
            parser = MixParser()
            playlists = parser.get_playlist_names(str(self.selected_file))
            
            self.playlist_combo.clear()
            self.playlist_combo.addItem("All Playlists")
            for playlist in playlists:
                self.playlist_combo.addItem(playlist)
            
            self.playlist_combo.setEnabled(True)
            logger.info(f"Loaded {len(playlists)} playlists")
        except Exception as e:
            logger.error(f"Error loading playlists: {e}")
            QMessageBox.warning(
                self,
                "Error",
                f"Could not load playlists:\n{str(e)}"
            )
    
    def toggle_advanced_settings(self, checked: bool):
        """Toggle advanced settings visibility."""
        self.advanced_panel.setVisible(checked)
        if checked:
            self.advanced_toggle.setText("Hide Advanced Settings ▲")
        else:
            self.advanced_toggle.setText("Show Advanced Settings ▼")
    
    def process_playlist(self):
        """Process selected playlist using existing controller."""
        if not self.selected_file:
            return
        
        # Disable button during processing
        self.process_btn.setEnabled(False)
        self.process_btn.setText("⏳ Processing...")
        self.statusBar().showMessage("Processing playlist...")
        
        # Get selected playlist
        playlist_name = None
        if self.playlist_combo.currentIndex() > 0:
            playlist_name = self.playlist_combo.currentText()
        
        # Emit signal
        self.processing_started.emit()
        
        # Start processing using existing controller
        try:
            # Use controller's process method
            # This will be async, so we connect to signals
            self.controller.process_playlist(
                xml_path=str(self.selected_file),
                playlist_name=playlist_name
            )
            logger.info(f"Processing started: {self.selected_file}")
        except Exception as e:
            logger.error(f"Error starting processing: {e}")
            self.on_error(str(e))
    
    def on_progress(self, current: int, total: int, message: str):
        """Handle progress updates from controller."""
        self.statusBar().showMessage(f"Processing: {current}/{total} - {message}")
        logger.debug(f"Progress: {current}/{total} - {message}")
    
    def on_processing_complete(self, results):
        """Handle processing completion."""
        self.process_btn.setEnabled(True)
        self.process_btn.setText("▶️  Process Playlist")
        
        # Store results
        self.current_results = results
        
        # Display results (using existing ResultsView)
        self.results_view.set_results(results)
        
        # Enable export
        self.export_btn.setEnabled(True)
        
        # Update status
        matched = sum(1 for r in results if r.matched)
        total = len(results)
        self.statusBar().showMessage(
            f"Processing complete! {matched}/{total} tracks matched."
        )
        
        # Emit signal
        self.processing_complete.emit(results)
        
        logger.info(f"Processing complete: {matched}/{total} matched")
    
    def on_error(self, error_message: str):
        """Handle errors from controller."""
        self.process_btn.setEnabled(True)
        self.process_btn.setText("▶️  Process Playlist")
        
        QMessageBox.critical(self, "Error", error_message)
        self.statusBar().showMessage("Error occurred")
        
        logger.error(f"Processing error: {error_message}")
    
    def export_results(self):
        """Export results using existing export controller."""
        if not self.current_results:
            QMessageBox.warning(self, "No Results", "No results to export.")
            return
        
        # Use existing export functionality
        from cuepoint.ui.controllers.export_controller import ExportController
        
        export_controller = ExportController()
        export_controller.export_results(self.current_results, parent=self)
        
        self.export_requested.emit()
        logger.info("Export requested")
    
    def on_theme_changed(self, theme_name: str):
        """Handle theme change.
        
        Args:
            theme_name: Name of the new theme
        """
        # Theme is applied automatically by ThemeManager
        # This method can be used to update any theme-specific UI elements
        logger.debug(f"Theme changed to: {theme_name}")
```

#### Step 3: Update Application Entry Point

**File Path**: `SRC/gui_app.py`

**Action**: Add option to use simple window

**Code to Add** (modify main function):
```python
from cuepoint.ui.main_window_simple import SimpleMainWindow

def main():
    """Main entry point for GUI application"""
    try:
        # Bootstrap services
        bootstrap_services()
        
        # Create QApplication
        app = QApplication(sys.argv)
        app.setApplicationName("CuePoint")
        app.setOrganizationName("CuePoint")
        app.setApplicationVersion("1.0.0")
        
        # Create and show main window
        # Option 1: Use simple window (default for Phase 6)
        window = SimpleMainWindow()
        
        # Option 2: Use advanced window (for power users)
        # from cuepoint.ui.main_window import MainWindow
        # window = MainWindow()
        
        window.show()
        
        # Run event loop
        sys.exit(app.exec())
    except Exception as e:
        # ... existing error handling ...
```

#### Step 4: Testing

**Manual Test Steps**:
1. Run application: `python SRC/gui_app.py`
2. Verify simple window appears
3. Click "Browse Files" and select an XML file
4. Verify file is selected and playlists load
5. Click "Process Playlist"
6. Verify processing starts and progress updates
7. Verify results appear when complete
8. Click "Export Results"
9. Verify export works

**Expected Results**:
- Simple, clear interface
- Step-by-step workflow works
- All existing functionality preserved
- Theme applied correctly
- No errors in console

---

## File Structure

```
src/cuepoint/ui/
├── main_window.py              # Existing (keep for advanced mode)
├── main_window_simple.py       # New simplified window
└── widgets/
    ├── pixel_widgets.py        # Custom pixel widgets
    └── ...
```

---

## Testing Requirements

### Functional Testing
- [ ] File selection works
- [ ] Playlist selection works
- [ ] Process button triggers processing
- [ ] Results display correctly
- [ ] Export works
- [ ] Advanced settings toggle works
- [ ] All tooltips display

### Usability Testing
- [ ] Non-technical users can complete workflow
- [ ] Steps are clear and intuitive
- [ ] Error messages are user-friendly
- [ ] Help is accessible
- [ ] Visual feedback is clear

### Integration Testing
- [ ] Works with existing controllers
- [ ] Works with existing services
- [ ] Theme applies correctly
- [ ] All existing functionality preserved

---

## Implementation Checklist

- [ ] Create SimpleMainWindow class
- [ ] Implement simplified layout
- [ ] Create step-by-step UI components
- [ ] Implement file selection
- [ ] Implement playlist selection
- [ ] Implement process button
- [ ] Implement results display
- [ ] Implement export button
- [ ] Add tooltips to all elements
- [ ] Add visual feedback
- [ ] Integrate with controllers
- [ ] Test complete workflow
- [ ] Get user feedback
- [ ] Refine based on feedback

---

## Dependencies

- **Step 6.2**: Implement Theme System (must be completed)
- **Existing Controllers**: GUIController, ResultsController, ExportController
- **Existing Widgets**: ResultsView, PixelButton, PixelCard

---

## Notes

- **Backward Compatibility**: Keep existing MainWindow for advanced users
- **Progressive Enhancement**: Simple mode can be enhanced gradually
- **User Choice**: Allow users to switch between simple and advanced modes
- **Help System**: Comprehensive help needed for non-technical users

---

## Next Steps

After completing this step:
1. Proceed to Step 6.4: Implement Advanced Settings Panel
2. Advanced settings will integrate with simple mode
3. Test both simple and advanced workflows

