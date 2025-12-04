# Phase 2: GUI User Experience (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - HIGH PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

## Goal
Enhance GUI with advanced features for better user experience.

## Success Criteria
- [ ] Results table is sortable and filterable with Beatport Artist column
- [ ] Multiple candidates can be displayed and compared
- [ ] Export supports multiple formats (CSV, JSON, Excel)
- [ ] File menu with Recent Files works
- [ ] Edit menu actions work (Copy, Select All, Clear Results)
- [ ] View menu toggles work (Show/Hide Progress, Show/Hide Results, Full Screen)
- [ ] Help menu dialogs work (User Guide, Shortcuts, About)
- [ ] Settings panel refactored (all settings under advanced, auto-research always on)
- [ ] Past Searches tab works (load CSV files, view results, browse recent files)
- [ ] All features tested and working

---

## Implementation Steps

### Step 2.1: Results Table with Sort/Filter and Beatport Artist (2 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.7 (results view exists)

**What to add - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import (
    QTableWidget, QTableWidgetItem, QHeaderView,
    QLineEdit, QComboBox, QPushButton, QVBoxLayout, QHBoxLayout
)
from PySide6.QtCore import Qt

class ResultsView(QWidget):
    """Enhanced results view with sorting and filtering"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results = []
        self.init_ui()
        
    def init_ui(self):
        """Initialize UI with sort/filter controls"""
        layout = QVBoxLayout(self)
        
        # Filter controls
        filter_layout = QHBoxLayout()
        
        # Search box
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search...")
        self.search_box.textChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.search_box)
        
        # Confidence filter
        self.confidence_filter = QComboBox()
        self.confidence_filter.addItems(["All", "High", "Medium", "Low"])
        self.confidence_filter.currentTextChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.confidence_filter)
        
        layout.addLayout(filter_layout)
        
        # Results table
        self.table = QTableWidget()
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        layout.addWidget(self.table)
        
    def populate_results(self, results: List[TrackResult]):
        """Populate table with results"""
        self.results = results
        self._update_table()
        
    def _update_table(self):
        """Update table with filtered/sorted results"""
        # Apply filters
        filtered = self._filter_results()
        
        # Set up table - NOW INCLUDES BEATPORT ARTIST COLUMN
        self.table.setRowCount(len(filtered))
        self.table.setColumnCount(11)  # Updated column count
        
        # Set headers - INCLUDES BEATPORT ARTIST
        headers = [
            "Index", "Title", "Artist", "Matched", "Beatport Title",
            "Beatport Artist", "Score", "Confidence", "Key", "BPM", "Year"
        ]
        self.table.setHorizontalHeaderLabels(headers)
        
        # Populate rows
        for row, result in enumerate(filtered):
            self.table.setItem(row, 0, QTableWidgetItem(str(result.playlist_index)))
            self.table.setItem(row, 1, QTableWidgetItem(result.title))
            self.table.setItem(row, 2, QTableWidgetItem(result.artist))
            self.table.setItem(row, 3, QTableWidgetItem("Yes" if result.matched else "No"))
            self.table.setItem(row, 4, QTableWidgetItem(result.beatport_title or ""))
            # NEW: Beatport Artist column
            self.table.setItem(row, 5, QTableWidgetItem(result.beatport_artists or ""))
            # ... add more columns
            
    def _filter_results(self) -> List[TrackResult]:
        """Apply filters to results"""
        filtered = self.results
        
        # Search filter
        search_text = self.search_box.text().lower()
        if search_text:
            filtered = [
                r for r in filtered
                if search_text in r.title.lower() or search_text in (r.artist or "").lower()
            ]
        
        # Confidence filter
        confidence = self.confidence_filter.currentText()
        if confidence != "All":
            filtered = [r for r in filtered if r.confidence == confidence.lower()]
            
        return filtered
        
    def apply_filters(self):
        """Apply filters and update table"""
        self._update_table()
```

**Implementation Checklist**:
- [ ] Add Beatport Artist column to table headers
- [ ] Add Beatport Artist data to table rows (column index 5)
- [ ] Update column count from 8 to 9 (or 11 if adding more columns)
- [ ] Add sortable columns (setSortingEnabled)
- [ ] Add filter by confidence (QComboBox)
- [ ] Add search box (QLineEdit)
- [ ] Add row selection
- [ ] Connect filter controls to update table

**Acceptance Criteria**:
- ✅ Beatport Artist column displays correctly
- ✅ Columns sortable
- ✅ Filter works
- ✅ Search works
- ✅ Selection works
- ✅ Performance acceptable with large result sets

**DO NOT**:
- ❌ Don't break existing functionality
- ❌ Don't make table too complex

**Design Reference**: `DOCS/DESIGNS/19_Results_Preview_Table_View_Design.md`

---

### Step 2.2: Multiple Candidate Display (1-2 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Step 2.1 (results table exists)

**What to add - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QTreeWidget, QTreeWidgetItem

class ResultsView(QWidget):
    """Results view with expandable candidate rows"""
    
    def populate_results(self, results: List[TrackResult]):
        """Populate with expandable rows"""
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels(["Track", "Match", "Score", "Details"])
        
        for result in results:
            # Main row
            main_item = QTreeWidgetItem([
                f"{result.title} - {result.artist}",
                "Yes" if result.matched else "No",
                f"{result.match_score:.1f}" if result.match_score else "N/A",
                ""
            ])
            self.tree.addTopLevelItem(main_item)
            
            # Candidate rows (expandable)
            if result.candidates:
                for i, candidate in enumerate(result.candidates[:5]):  # Top 5
                    candidate_item = QTreeWidgetItem([
                        candidate.get('candidate_title', ''),
                        f"{candidate.get('final_score', '0')}",
                        candidate.get('candidate_artists', ''),
                        candidate.get('candidate_url', '')
                    ])
                    main_item.addChild(candidate_item)
                    
            main_item.setExpanded(False)  # Collapsed by default
```

**Implementation Checklist**:
- [ ] Add expandable rows showing top candidates
- [ ] Add comparison view
- [ ] Add manual selection (radio buttons)
- [ ] Add Accept/Reject buttons
- [ ] Update result when candidate selected

**Acceptance Criteria**:
- ✅ Top candidates shown
- ✅ Comparison works
- ✅ Selection works
- ✅ Accept/Reject updates result

**Design Reference**: `DOCS/DESIGNS/04_Multiple_Candidate_Output_Design.md`

---

### Step 2.3: Export Format Options (2-3 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Step 2.1 (results table exists), Phase 0 (output_writer)

**What to add - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QDialog, QVBoxLayout, QCheckBox, QButtonGroup, QRadioButton

class ExportDialog(QDialog):
    """Dialog for export options"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
    def init_ui(self):
        """Initialize export dialog"""
        layout = QVBoxLayout(self)
        
        # Format selection
        format_group = QButtonGroup()
        self.csv_radio = QRadioButton("CSV")
        self.json_radio = QRadioButton("JSON")
        self.excel_radio = QRadioButton("Excel")
        self.csv_radio.setChecked(True)
        
        format_group.addButton(self.csv_radio)
        format_group.addButton(self.json_radio)
        format_group.addButton(self.excel_radio)
        
        layout.addWidget(self.csv_radio)
        layout.addWidget(self.json_radio)
        layout.addWidget(self.excel_radio)
        
        # Column selection (checkboxes)
        self.column_checks = {}
        columns = ["Title", "Artist", "Score", "Key", "BPM", "Year"]
        for col in columns:
            check = QCheckBox(col)
            check.setChecked(True)
            self.column_checks[col] = check
            layout.addWidget(check)
            
    def get_export_options(self) -> dict:
        """Get selected export options"""
        format_map = {
            self.csv_radio: "csv",
            self.json_radio: "json",
            self.excel_radio: "excel"
        }
        
        selected_format = None
        for radio, fmt in format_map.items():
            if radio.isChecked():
                selected_format = fmt
                break
                
        selected_columns = [
            col for col, check in self.column_checks.items()
            if check.isChecked()
        ]
        
        return {
            "format": selected_format,
            "columns": selected_columns
        }
```

**Implementation Checklist**:
- [ ] Add export dialog
- [ ] Add format selection (CSV, JSON, Excel)
- [ ] Add column selection
- [ ] Add filter options
- [ ] Implement JSON export (new)
- [ ] Implement Excel export (new, requires openpyxl)

**Acceptance Criteria**:
- ✅ Multiple formats supported
- ✅ Column selection works
- ✅ Export works
- ✅ Files created correctly

**Design Reference**: `DOCS/DESIGNS/20_Export_Format_Options_Design.md`
**Design Reference**: `DOCS/DESIGNS/09_JSON_Output_Format_Design.md`

---

### Step 2.4: Menu Bar Functionality (2-3 days)
**File**: `SRC/gui/main_window.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.2 (main window exists)

**What to add - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QMenu, QAction
from PySide6.QtCore import QSettings
from PySide6.QtGui import QKeySequence

class MainWindow(QMainWindow):
    """Main application window with functional menu bar"""
    
    def create_menu_bar(self):
        """Create menu bar with File, Edit, View, Help menus"""
        menubar = self.menuBar()
        
        # File Menu
        file_menu = menubar.addMenu("&File")
        
        # Open XML File
        open_action = QAction("&Open XML File...", self)
        open_action.setShortcut(QKeySequence.Open)
        open_action.triggered.connect(self.on_open_file)
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
            self.file_selector.set_file_path(file_path)
            self.on_file_selected(file_path)
        else:
            # Remove invalid file from recent files
            settings = QSettings("CuePoint", "CuePoint")
            recent_files = settings.value("recent_files", [])
            if file_path in recent_files:
                recent_files.remove(file_path)
                settings.setValue("recent_files", recent_files)
            self.update_recent_files_menu()
    
    def save_recent_file(self, file_path: str):
        """Save file to recent files list"""
        settings = QSettings("CuePoint", "CuePoint")
        recent_files = settings.value("recent_files", [])
        
        if file_path in recent_files:
            recent_files.remove(file_path)
        recent_files.insert(0, file_path)
        
        # Keep only last 10
        recent_files = recent_files[:10]
        settings.setValue("recent_files", recent_files)
```

**Implementation Checklist**:
- [ ] Implement File menu with Recent Files submenu
- [ ] Implement Edit menu with Copy, Select All, Clear Results
- [ ] Implement View menu with Show/Hide toggles and Full Screen
- [ ] Implement Help menu with User Guide, Shortcuts, About
- [ ] Add QSettings for recent files persistence
- [ ] Connect all menu actions to handlers
- [ ] Add keyboard shortcuts
- [ ] Create About dialog
- [ ] Create User Guide dialog/window
- [ ] Create Keyboard Shortcuts dialog

**Acceptance Criteria**:
- ✅ File menu works with Recent Files
- ✅ Edit menu actions work
- ✅ View menu toggles work
- ✅ Help menu dialogs work
- ✅ Recent files persist between sessions
- ✅ Keyboard shortcuts work
- ✅ All menu items functional

**Design Reference**: `DOCS/DESIGNS/18_GUI_Enhancements_Design.md`

---

### Step 2.5: Settings Panel Refactoring (1 day)
**File**: `SRC/gui/config_panel.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.8 (config panel exists)

**What to modify - EXACT STRUCTURE:**

```python
class ConfigPanel(QWidget):
    """Widget for configuring processing settings"""
    
    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        
        # Message at top
        message_label = QLabel("We dont touch what already works, if it takes time go touch some grass :)")
        message_label.setWordWrap(True)
        message_label.setStyleSheet("color: #666; font-style: italic; padding: 10px;")
        layout.addWidget(message_label)
        
        layout.addSpacing(10)
        
        # Performance Presets
        preset_group = QGroupBox("Performance Preset")
        preset_layout = QVBoxLayout()
        
        self.preset_group = QButtonGroup()
        preset_buttons_layout = QHBoxLayout()
        
        presets = [
            ("Balanced", "balanced"),
            ("Fast", "fast"),
            ("Turbo", "turbo"),
            ("Exhaustive", "exhaustive")
        ]
        
        for text, value in presets:
            radio = QRadioButton(text)
            radio.setObjectName(f"preset_{value}")
            if value == "balanced":
                radio.setChecked(True)
            self.preset_group.addButton(radio)
            preset_buttons_layout.addWidget(radio)
        
        preset_layout.addLayout(preset_buttons_layout)
        preset_group.setLayout(preset_layout)
        layout.addWidget(preset_group)
        
        # Note: Auto-research is ALWAYS ON (removed checkbox)
        # Note: Verbose logging moved to advanced settings
        
        # Show Advanced Settings button
        self.show_advanced_btn = QPushButton("Show Advanced Settings")
        self.show_advanced_btn.clicked.connect(self._toggle_advanced_settings)
        layout.addWidget(self.show_advanced_btn)
        
        # Advanced Settings (hidden by default) - ALL SETTINGS HERE
        self.advanced_group = QGroupBox("Advanced Settings")
        advanced_layout = QVBoxLayout()
        
        # Processing Options (moved to advanced)
        options_group = QGroupBox("Processing Options")
        options_layout = QVBoxLayout()
        
        self.verbose_check = QCheckBox("Enable verbose logging")
        self.verbose_check.setChecked(False)
        options_layout.addWidget(self.verbose_check)
        
        options_group.setLayout(options_layout)
        advanced_layout.addWidget(options_group)
        
        # Track Workers (already in advanced)
        # Time Budget (already in advanced)
        # Min Score (already in advanced)
        # Max Results (already in advanced)
        # ... all other advanced settings ...
        
        self.advanced_group.setLayout(advanced_layout)
        self.advanced_group.setVisible(False)
        layout.addWidget(self.advanced_group)
        
        # Reset button
        reset_layout = QHBoxLayout()
        self.reset_btn = QPushButton("Reset to Defaults")
        self.reset_btn.clicked.connect(self.reset_to_defaults)
        reset_layout.addWidget(self.reset_btn)
        layout.addLayout(reset_layout)
    
    def get_settings(self) -> Dict[str, Any]:
        """Get current settings - auto_research is ALWAYS True"""
        settings = {}
        
        # Auto-research is always enabled
        settings["auto_research"] = True
        
        # Get preset
        preset = self._get_selected_preset()
        # ... preset logic ...
        
        # Get advanced settings if visible
        if self.advanced_group.isVisible():
            # ... get all advanced settings ...
            settings["VERBOSE"] = self.verbose_check.isChecked()
        
        return settings
```

**Implementation Checklist**:
- [ ] Add message label at top of settings panel
- [ ] Remove auto-research checkbox (always enabled)
- [ ] Move verbose logging to advanced settings
- [ ] Ensure all settings are under "Show Advanced Settings"
- [ ] Update get_settings() to always return auto_research=True
- [ ] Update UI layout and styling

**Acceptance Criteria**:
- ✅ Message displays at top of settings
- ✅ Auto-research always enabled (no checkbox)
- ✅ All settings under advanced settings
- ✅ Settings panel layout correct
- ✅ Reset button works

---

### Step 2.6: Batch Playlist Processing (3-4 days)
**File**: `SRC/gui/batch_processor.py` (NEW), `SRC/gui/main_window.py` (MODIFY)

**Dependencies**: Step 2.1 (results table exists), Phase 1 Step 1.6 (GUI controller)

**What to create - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QListWidget, QListWidgetItem,
    QPushButton, QLabel, QProgressBar, QGroupBox, QCheckBox
)
from PySide6.QtCore import Signal, QThread, Qt
from typing import List, Dict, Any
from gui_interface import TrackResult, ProgressInfo, ProcessingError

class BatchProcessorWidget(QWidget):
    """Widget for batch processing multiple playlists"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists = []
        self.results = {}  # playlist_name -> List[TrackResult]
        self.init_ui()
        
    def init_ui(self):
        """Initialize batch processing UI"""
        layout = QVBoxLayout(self)
        
        # Playlist selection
        playlist_group = QGroupBox("Select Playlists")
        playlist_layout = QVBoxLayout()
        
        self.playlist_list = QListWidget()
        self.playlist_list.setSelectionMode(QListWidget.MultiSelection)
        playlist_layout.addWidget(self.playlist_list)
        
        # Select all/none buttons
        btn_layout = QHBoxLayout()
        self.select_all_btn = QPushButton("Select All")
        self.select_all_btn.clicked.connect(self.select_all_playlists)
        self.deselect_all_btn = QPushButton("Deselect All")
        self.deselect_all_btn.clicked.connect(self.deselect_all_playlists)
        btn_layout.addWidget(self.select_all_btn)
        btn_layout.addWidget(self.deselect_all_btn)
        playlist_layout.addLayout(btn_layout)
        
        playlist_group.setLayout(playlist_layout)
        layout.addWidget(playlist_group)
        
        # Processing controls
        control_layout = QHBoxLayout()
        self.start_batch_btn = QPushButton("Start Batch Processing")
        self.start_batch_btn.clicked.connect(self.start_batch_processing)
        self.cancel_batch_btn = QPushButton("Cancel")
        self.cancel_batch_btn.clicked.connect(self.cancel_batch_processing)
        self.cancel_batch_btn.setEnabled(False)
        control_layout.addWidget(self.start_batch_btn)
        control_layout.addWidget(self.cancel_batch_btn)
        layout.addLayout(control_layout)
        
        # Progress display
        self.progress_group = QGroupBox("Batch Progress")
        progress_layout = QVBoxLayout()
        
        self.overall_progress = QProgressBar()
        self.overall_progress.setFormat("%p% (%v/%m)")
        progress_layout.addWidget(QLabel("Overall Progress:"))
        progress_layout.addWidget(self.overall_progress)
        
        self.current_playlist_label = QLabel("Ready")
        progress_layout.addWidget(self.current_playlist_label)
        
        self.progress_group.setLayout(progress_layout)
        layout.addWidget(self.progress_group)
        
        layout.addStretch()
        
    def set_playlists(self, playlists: List[str]):
        """Set available playlists"""
        self.playlist_list.clear()
        for playlist in playlists:
            item = QListWidgetItem(playlist)
            item.setCheckState(Qt.Checked)
            self.playlist_list.addItem(item)
            
    def get_selected_playlists(self) -> List[str]:
        """Get list of selected playlists"""
        selected = []
        for i in range(self.playlist_list.count()):
            item = self.playlist_list.item(i)
            if item.checkState() == Qt.Checked:
                selected.append(item.text())
        return selected
        
    def select_all_playlists(self):
        """Select all playlists"""
        for i in range(self.playlist_list.count()):
            self.playlist_list.item(i).setCheckState(Qt.Checked)
            
    def deselect_all_playlists(self):
        """Deselect all playlists"""
        for i in range(self.playlist_list.count()):
            self.playlist_list.item(i).setCheckState(Qt.Unchecked)
            
    def start_batch_processing(self):
        """Start processing selected playlists"""
        selected = self.get_selected_playlists()
        if not selected:
            return
            
        self.start_batch_btn.setEnabled(False)
        self.cancel_batch_btn.setEnabled(True)
        self.overall_progress.setMaximum(len(selected))
        self.overall_progress.setValue(0)
        
        # Emit signal to start batch processing
        # (This will be handled by MainWindow/GUIController)
        
    def cancel_batch_processing(self):
        """Cancel batch processing"""
        # Emit cancel signal
        pass
        
    def update_progress(self, completed: int, total: int, current_playlist: str):
        """Update batch progress display"""
        self.overall_progress.setValue(completed)
        self.current_playlist_label.setText(f"Processing: {current_playlist}")
```

**Implementation Checklist**:
- [ ] Create BatchProcessorWidget class
- [ ] Add multi-select playlist list
- [ ] Add batch queue management
- [ ] Add progress per playlist
- [ ] Add pause/resume/cancel functionality
- [ ] Integrate with GUIController for processing
- [ ] Add results aggregation
- [ ] Add batch summary report

**Acceptance Criteria**:
- ✅ Multiple playlists can be selected
- ✅ Batch processing works
- ✅ Queue management works
- ✅ Progress tracking works per playlist
- ✅ Pause/resume/cancel works
- ✅ Results aggregated correctly
- ✅ Summary report generated

**Design Reference**: `DOCS/DESIGNS/08_Batch_Playlist_Processing_Design.md`

---

### Step 2.7: Past Searches History Tab (2-3 days)
**File**: `SRC/gui/history_view.py` (NEW), `SRC/gui/main_window.py` (MODIFY)

**Dependencies**: Step 2.1 (results table exists), Phase 1 Step 1.2 (main window exists)

**What to create - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QFileDialog, QGroupBox,
    QListWidget, QListWidgetItem, QMessageBox
)
from PySide6.QtCore import Qt
from typing import List, Optional
import os
import csv
from datetime import datetime

class HistoryView(QWidget):
    """Widget for viewing past search results from CSV files"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_csv_path: Optional[str] = None
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        
        # File selection section
        file_group = QGroupBox("Select Past Search")
        file_layout = QVBoxLayout()
        
        # Browse button
        browse_layout = QHBoxLayout()
        self.file_path_label = QLabel("No file selected")
        self.file_path_label.setWordWrap(True)
        browse_layout.addWidget(self.file_path_label, 1)
        
        self.browse_btn = QPushButton("Browse CSV File...")
        self.browse_btn.clicked.connect(self.on_browse_csv)
        browse_layout.addWidget(self.browse_btn)
        
        file_layout.addLayout(browse_layout)
        
        # Recent CSV files list
        recent_label = QLabel("Recent CSV Files:")
        file_layout.addWidget(recent_label)
        
        self.recent_list = QListWidget()
        self.recent_list.itemDoubleClicked.connect(self.on_recent_file_selected)
        file_layout.addWidget(self.recent_list)
        
        # Refresh recent files button
        refresh_btn = QPushButton("Refresh List")
        refresh_btn.clicked.connect(self.refresh_recent_files)
        file_layout.addWidget(refresh_btn)
        
        file_group.setLayout(file_layout)
        layout.addWidget(file_group)
        
        # Results display section
        results_group = QGroupBox("Search Results")
        results_layout = QVBoxLayout()
        
        # Summary info
        self.summary_label = QLabel("No file loaded")
        self.summary_label.setWordWrap(True)
        results_layout.addWidget(self.summary_label)
        
        # Results table (reuse same structure as ResultsView)
        self.table = QTableWidget()
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.horizontalHeader().setStretchLastSection(True)
        results_layout.addWidget(self.table, 1)
        
        results_group.setLayout(results_layout)
        layout.addWidget(results_group, 1)
        
        # Load recent files on init
        self.refresh_recent_files()
    
    def on_browse_csv(self):
        """Browse for CSV file to load"""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select CSV File",
            "output",
            "CSV Files (*.csv);;All Files (*.*)"
        )
        
        if file_path:
            self.load_csv_file(file_path)
    
    def on_recent_file_selected(self, item: QListWidgetItem):
        """Load CSV file from recent list"""
        file_path = item.data(Qt.UserRole)
        if file_path and os.path.exists(file_path):
            self.load_csv_file(file_path)
    
    def load_csv_file(self, file_path: str):
        """Load and display CSV file contents"""
        try:
            if not os.path.exists(file_path):
                QMessageBox.warning(self, "File Not Found", f"File not found: {file_path}")
                return
            
            # Read CSV file
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            
            if not rows:
                QMessageBox.warning(self, "Empty File", "The selected CSV file is empty")
                return
            
            self.current_csv_path = file_path
            self.file_path_label.setText(f"Loaded: {os.path.basename(file_path)}")
            
            # Update summary
            total = len(rows)
            matched = sum(1 for row in rows if row.get('beatport_url', '').strip())
            match_rate = (matched / total * 100) if total > 0 else 0
            
            # Try to extract timestamp from filename
            timestamp_info = ""
            try:
                # Filename format: playlist_20250127_123456.csv
                basename = os.path.basename(file_path)
                parts = basename.replace('.csv', '').split('_')
                if len(parts) >= 3:
                    date_str = parts[-2]
                    time_str = parts[-1]
                    if len(date_str) == 8 and len(time_str) == 6:
                        dt = datetime.strptime(f"{date_str}_{time_str}", "%Y%m%d_%H%M%S")
                        timestamp_info = f"\nSearch Date: {dt.strftime('%Y-%m-%d %H:%M:%S')}"
            except:
                pass
            
            summary_text = (
                f"File: {os.path.basename(file_path)}\n"
                f"Total tracks: {total}\n"
                f"Matched: {matched} ({match_rate:.1f}%)"
                f"{timestamp_info}"
            )
            self.summary_label.setText(summary_text)
            
            # Populate table
            self._populate_table(rows)
            
            # Add to recent files if not already there
            self._add_to_recent_files(file_path)
            
        except Exception as e:
            QMessageBox.critical(
                self,
                "Error Loading File",
                f"Error loading CSV file:\n{str(e)}"
            )
    
    def _populate_table(self, rows: List[dict]):
        """Populate table with CSV data"""
        if not rows:
            self.table.setRowCount(0)
            return
        
        # Get column names from first row
        columns = list(rows[0].keys())
        
        # Set up table
        self.table.setColumnCount(len(columns))
        self.table.setHorizontalHeaderLabels(columns)
        self.table.setRowCount(len(rows))
        
        # Populate rows
        for row_idx, row_data in enumerate(rows):
            for col_idx, col_name in enumerate(columns):
                value = row_data.get(col_name, "")
                item = QTableWidgetItem(str(value))
                self.table.setItem(row_idx, col_idx, item)
        
        # Resize columns to content
        self.table.resizeColumnsToContents()
    
    def refresh_recent_files(self):
        """Refresh list of recent CSV files from output directory"""
        self.recent_list.clear()
        
        output_dir = "output"
        if not os.path.exists(output_dir):
            return
        
        # Find all CSV files
        csv_files = []
        for filename in os.listdir(output_dir):
            if filename.endswith('.csv') and not filename.endswith('_candidates.csv') and not filename.endswith('_queries.csv') and not filename.endswith('_review.csv'):
                file_path = os.path.join(output_dir, filename)
                csv_files.append((file_path, os.path.getmtime(file_path)))
        
        # Sort by modification time (newest first)
        csv_files.sort(key=lambda x: x[1], reverse=True)
        
        # Add to list (show last 20)
        for file_path, mtime in csv_files[:20]:
            item = QListWidgetItem(os.path.basename(file_path))
            item.setData(Qt.UserRole, file_path)
            item.setToolTip(file_path)
            # Add timestamp tooltip
            dt = datetime.fromtimestamp(mtime)
            item.setToolTip(f"{file_path}\nModified: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
            self.recent_list.addItem(item)
    
    def _add_to_recent_files(self, file_path: str):
        """Add file to recent files (for quick access)"""
        # This could use QSettings to persist across sessions
        pass
```

**Integration in MainWindow:**

```python
# In MainWindow.init_ui(), add new tab:
# History tab
history_tab = QWidget()
history_layout = QVBoxLayout(history_tab)
history_layout.setContentsMargins(10, 10, 10, 10)
self.history_view = HistoryView()
history_layout.addWidget(self.history_view)

# Add to tabs
self.tabs.addTab(main_tab, "Main")
self.tabs.addTab(settings_tab, "Settings")
self.tabs.addTab(history_tab, "Past Searches")  # NEW TAB
```

**Implementation Checklist**:
- [ ] Create HistoryView widget class
- [ ] Add CSV file browser
- [ ] Add recent CSV files list (from output directory)
- [ ] Parse CSV files and display in table
- [ ] Show summary statistics from CSV
- [ ] Extract and display timestamp from filename
- [ ] Add "Past Searches" tab to MainWindow
- [ ] Handle file errors gracefully
- [ ] Add refresh functionality for recent files list
- [ ] Style table consistently with ResultsView

**Acceptance Criteria**:
- ✅ Past Searches tab displays in main window
- ✅ Can browse and select CSV files
- ✅ Recent CSV files list shows files from output directory
- ✅ CSV data displays correctly in table
- ✅ Summary statistics show correctly
- ✅ Timestamp extracted from filename
- ✅ Table is sortable
- ✅ Error handling works for invalid files
- ✅ Refresh button updates recent files list

**Design Reference**: `DOCS/DESIGNS/19_Results_Preview_Table_View_Design.md`

---

## Phase 2 Deliverables Checklist
- [ ] Results table enhanced with sort/filter and Beatport Artist column
- [ ] Multiple candidates display
- [ ] Export formats work (CSV, JSON, Excel)
- [ ] File menu with Recent Files works
- [ ] Edit menu actions work
- [ ] View menu toggles work
- [ ] Help menu dialogs work
- [ ] Settings panel refactored (all settings under advanced, auto-research always on)
- [ ] Past Searches tab works (browse CSV, view results, recent files list)
- [ ] Batch playlist processing works
- [ ] All features tested
- [ ] Performance acceptable

---

## Testing Strategy

### Manual Testing
- Test sorting on all columns
- Test filtering with various criteria
- Test search functionality
- Test candidate expansion
- Test export in all formats

### Performance Testing
- Test with large result sets (1000+ tracks)
- Verify sorting/filtering performance
- Check memory usage

---

*For complete design details, see the referenced design documents in `DOCS/DESIGNS/`.*

