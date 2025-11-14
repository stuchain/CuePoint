# Phase 1: GUI Foundation (4-5 weeks)

**Status**: 📝 Planned  
**Priority**: 🔥 P0 - CRITICAL PATH  
**Dependencies**: Phase 0 (Backend Foundation)  
**Blocks**: Phase 2 (GUI User Experience)

## Goal
Build the core GUI application using PySide6, with all essential features working.

## Success Criteria (MVP)
- [ ] GUI window launches successfully
- [ ] File selection works (drag & drop + browse)
- [ ] Playlist selection works (dropdown)
- [ ] Processing starts and shows progress
- [ ] Results display correctly
- [ ] CSV download works
- [ ] Error handling shows user-friendly dialogs
- [ ] Cancellation works
- [ ] Standalone executable builds

## ⚠️ CRITICAL: Prerequisites
**Phase 0 MUST be completed first!** All backend refactoring must be done before starting GUI work.

## Technology Stack
- **GUI Framework**: PySide6 (Qt for Python - LGPL license, free for all uses)
- **Python Version**: 3.8+
- **Packaging**: PyInstaller for executables

**Important**: We use **PySide6** (not PyQt6) because:
- PySide6 is free and open-source (LGPL)
- No commercial licensing fees
- Officially supported by Qt Company
- Same API as PyQt6

---

## Implementation Steps

### Step 1.1: Set Up GUI Project Structure (1 day)
**Files**: `SRC/gui/` directory (NEW)

**Dependencies**: Phase 0 complete

**What to create - EXACT STRUCTURE:**

```
SRC/gui/
├── __init__.py              # Empty file, makes it a package
├── main_window.py            # Main application window
├── file_selector.py          # XML file selection widget
├── playlist_selector.py     # Playlist dropdown widget
├── config_panel.py           # Settings panel widget
├── progress_widget.py        # Progress display widget
├── results_view.py           # Results table widget
├── status_bar.py             # Status bar widget (optional)
├── styles.py                 # Theme and styling
└── dialogs.py                # Error dialogs, confirmations
```

**Implementation Checklist**:
- [ ] Create `SRC/gui/` directory
- [ ] Create `__init__.py` (can be empty)
- [ ] Create all module files (empty initially, will be filled in later steps)
- [ ] Verify directory structure is correct

**Acceptance Criteria**:
- ✅ Directory structure matches exactly
- ✅ All files exist (can be empty initially)
- ✅ `__init__.py` exists
- ✅ No import errors when importing the package

**DO NOT**:
- ❌ Don't add any code yet (that's for later steps)
- ❌ Don't create files in wrong locations

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 3.2)

---

### Step 1.2: Create Main Window Structure (2 days)
**File**: `SRC/gui/main_window.py` (NEW)

**Dependencies**: Step 1.1 (directory structure)

**What to create - EXACT STRUCTURE:**

See `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 5.1) for complete code example.

**Key Components**:
1. `MainWindow` class (QMainWindow subclass)
2. Menu bar (File, Edit, View, Help)
3. Central widget with sections:
   - File selection section
   - Playlist selection section
   - Settings section
   - Progress section (initially hidden)
   - Results section (initially hidden)
4. Status bar
5. Window layout and styling

**Implementation Checklist**:
- [ ] Create QMainWindow subclass
- [ ] Add menu bar with basic menus
- [ ] Create central widget with QVBoxLayout
- [ ] Add all section widgets (empty initially, will be created in later steps)
- [ ] Add status bar
- [ ] Apply basic styling
- [ ] Set window title, size, minimum size
- [ ] Enable drag & drop (setAcceptDrops(True))

**Acceptance Criteria**:
- ✅ Window displays correctly
- ✅ All sections visible (even if empty)
- ✅ Menu bar works
- ✅ Layout responsive
- ✅ Window can be resized
- ✅ Drag & drop enabled

**DO NOT**:
- ❌ Don't implement functionality yet (just structure)
- ❌ Don't connect signals yet (that's for later steps)

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.1, 5.1)

---

### Step 1.3: Create File Selector Widget (1 day)
**File**: `SRC/gui/file_selector.py` (NEW)

**Dependencies**: Step 1.2 (main window structure)

**What to create - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QLineEdit
from PySide6.QtCore import Signal, Qt
from PySide6.QtGui import QDragEnterEvent, QDropEvent

class FileSelector(QWidget):
    """Widget for selecting Rekordbox XML file"""
    
    file_selected = Signal(str)  # Emitted when file is selected
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        
        # File path display
        file_layout = QHBoxLayout()
        label = QLabel("Rekordbox XML File:")
        self.path_edit = QLineEdit()
        self.path_edit.setReadOnly(True)
        self.path_edit.setPlaceholderText("No file selected")
        
        browse_btn = QPushButton("Browse...")
        browse_btn.clicked.connect(self.browse_file)
        
        file_layout.addWidget(label)
        file_layout.addWidget(self.path_edit, 1)
        file_layout.addWidget(browse_btn)
        
        layout.addLayout(file_layout)
        
        # Drag & drop area
        self.drop_label = QLabel("or drag & drop XML file here")
        self.drop_label.setAlignment(Qt.AlignCenter)
        self.drop_label.setStyleSheet("color: gray; padding: 20px; border: 2px dashed gray;")
        layout.addWidget(self.drop_label)
        
        # Enable drag & drop
        self.setAcceptDrops(True)
        
    def dragEnterEvent(self, event: QDragEnterEvent):
        """Handle drag enter event"""
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if len(urls) == 1 and urls[0].toLocalFile().endswith('.xml'):
                event.acceptProposedAction()
                self.drop_label.setStyleSheet("color: blue; padding: 20px; border: 2px dashed blue;")
                
    def dragLeaveEvent(self, event):
        """Handle drag leave event"""
        self.drop_label.setStyleSheet("color: gray; padding: 20px; border: 2px dashed gray;")
        
    def dropEvent(self, event: QDropEvent):
        """Handle drop event"""
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files and files[0].endswith('.xml'):
            self.set_file(files[0])
            event.acceptProposedAction()
        self.drop_label.setStyleSheet("color: gray; padding: 20px; border: 2px dashed gray;")
        
    def browse_file(self):
        """Open file browser"""
        from PySide6.QtWidgets import QFileDialog
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Rekordbox XML File",
            "",
            "XML Files (*.xml);;All Files (*)"
        )
        if file_path:
            self.set_file(file_path)
            
    def set_file(self, file_path: str):
        """Set file path and emit signal"""
        self.path_edit.setText(file_path)
        self.file_selected.emit(file_path)
        
    def get_file_path(self) -> str:
        """Get current file path"""
        return self.path_edit.text()
        
    def validate_file(self) -> bool:
        """Validate that file exists and is XML"""
        file_path = self.get_file_path()
        if not file_path:
            return False
        import os
        return os.path.exists(file_path) and file_path.endswith('.xml')
```

**Implementation Checklist**:
- [ ] Create QWidget subclass
- [ ] Add QLineEdit for path display
- [ ] Add QPushButton for browse
- [ ] Implement drag & drop (QDragEnterEvent, QDropEvent)
- [ ] Validate XML file format
- [ ] Emit signal when file selected
- [ ] Add visual feedback for drag & drop

**Acceptance Criteria**:
- ✅ Browse button opens file dialog
- ✅ Drag & drop works
- ✅ File validation works
- ✅ Signal emitted correctly
- ✅ Visual feedback during drag & drop

**DO NOT**:
- ❌ Don't parse XML yet (that's for playlist selector)
- ❌ Don't add error handling yet (that's for dialogs)

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.2.1)

---

### Step 1.4: Create Playlist Selector Widget (1 day)
**File**: `SRC/gui/playlist_selector.py` (NEW)

**Dependencies**: Step 1.3 (file selector), Phase 0 (needs `parse_rekordbox` from backend)

**What to create - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox
from PySide6.QtCore import Signal
from rekordbox import parse_rekordbox

class PlaylistSelector(QWidget):
    """Widget for selecting playlist from XML"""
    
    playlist_selected = Signal(str)  # Emitted when playlist is selected
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists = {}
        self.init_ui()
        
    def init_ui(self):
        """Initialize UI components"""
        layout = QHBoxLayout(self)
        
        label = QLabel("Select Playlist:")
        self.combo = QComboBox()
        self.combo.setEnabled(False)
        self.combo.currentTextChanged.connect(self.on_selection_changed)
        
        layout.addWidget(label)
        layout.addWidget(self.combo, 1)
        
    def load_xml_file(self, xml_path: str):
        """Load XML file and populate playlists"""
        try:
            tracks_by_id, playlists = parse_rekordbox(xml_path)
            self.playlists = playlists
            
            # Populate combobox
            self.combo.clear()
            self.combo.addItems(sorted(playlists.keys()))
            self.combo.setEnabled(True)
            
        except Exception as e:
            # Error handling will be done by parent
            self.combo.clear()
            self.combo.setEnabled(False)
            raise
            
    def on_selection_changed(self, playlist_name: str):
        """Handle playlist selection change"""
        if playlist_name:
            self.playlist_selected.emit(playlist_name)
            
    def get_selected_playlist(self) -> str:
        """Get currently selected playlist"""
        return self.combo.currentText()
        
    def get_playlist_track_count(self, playlist_name: str) -> int:
        """Get track count for playlist"""
        if playlist_name in self.playlists:
            return len(self.playlists[playlist_name])
        return 0
```

**Implementation Checklist**:
- [ ] Create QWidget subclass
- [ ] Add QComboBox
- [ ] Connect to file selector signal (from main window)
- [ ] Parse XML when file changes
- [ ] Populate combobox with playlists
- [ ] Emit signal when playlist selected
- [ ] Handle empty XML gracefully

**Acceptance Criteria**:
- ✅ Dropdown populated correctly
- ✅ Playlist selection works
- ✅ Signal emitted correctly
- ✅ Handles empty XML gracefully
- ✅ Handles parsing errors gracefully

**DO NOT**:
- ❌ Don't show error dialogs here (that's for dialogs.py)
- ❌ Don't cache XML parsing (keep it simple)

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.2.2)

---

### Step 1.5: Create Progress Widget (2 days)
**File**: `SRC/gui/progress_widget.py` (NEW)

**Dependencies**: Step 1.2 (main window), Phase 0 (needs `ProgressInfo` from `gui_interface`)

**What to create - EXACT STRUCTURE:**

See `DOCS/DESIGNS/01_Progress_Bar_Design.md` for detailed design.

**Key Components**:
1. Progress bar (QProgressBar)
2. Statistics display (matched/unmatched counts)
3. Current track label
4. Time remaining estimate
5. Cancel button

**Implementation Checklist**:
- [ ] Create QWidget subclass
- [ ] Add QProgressBar
- [ ] Add QLabel widgets for stats
- [ ] Add cancel button
- [ ] Connect to progress callback from backend
- [ ] Update UI from ProgressInfo objects
- [ ] Calculate time remaining estimate

**Acceptance Criteria**:
- ✅ Progress bar updates in real-time
- ✅ Statistics display correctly
- ✅ Current track shows
- ✅ Cancel button works
- ✅ Time estimate calculates

**DO NOT**:
- ❌ Don't implement cancellation logic here (that's for controller)
- ❌ Don't block UI thread (use signals/slots)

**Design References**: 
- `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.2.4)
- `DOCS/DESIGNS/01_Progress_Bar_Design.md`

---

### Step 1.6: Create GUI Controller (2 days)
**File**: `SRC/gui_controller.py` (NEW)

**Dependencies**: Phase 0 (needs `process_playlist`, `ProcessingController`, `ProgressInfo`)

**What to create - EXACT STRUCTURE:**

See `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 5.2) for complete code example.

**Key Components**:
1. `GUIController` class (QObject)
2. `ProcessingWorker` class (QThread)
3. Qt signals for GUI updates:
   - `progress_updated(ProgressInfo)`
   - `processing_complete(List[TrackResult])`
   - `error_occurred(ProcessingError)`
4. Methods:
   - `start_processing()`
   - `cancel_processing()`
   - `pause_processing()` (optional)

**Implementation Checklist**:
- [ ] Create controller class (QObject)
- [ ] Use QThread for processing
- [ ] Create ProcessingController instance
- [ ] Connect progress callbacks
- [ ] Handle cancellation
- [ ] Emit Qt signals for GUI updates
- [ ] Handle errors and convert to signals

**Acceptance Criteria**:
- ✅ Processing runs in background thread
- ✅ Progress updates GUI correctly
- ✅ Cancellation works
- ✅ Errors handled gracefully
- ✅ Signals emitted correctly

**DO NOT**:
- ❌ Don't update GUI directly from worker thread (use signals)
- ❌ Don't block main thread

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 3.3, 5.2)

---

### Step 1.7: Create Results View Widget (2 days)
**File**: `SRC/gui/results_view.py` (NEW)

**Dependencies**: Step 1.6 (controller), Phase 0 (needs `TrackResult`)

**What to create - EXACT STRUCTURE:**

**Key Components**:
1. QTableWidget for results
2. Summary statistics display
3. Download buttons
4. Export functionality

**Implementation Checklist**:
- [ ] Create QWidget subclass
- [ ] Add QTableWidget
- [ ] Populate from TrackResult objects
- [ ] Add summary statistics
- [ ] Add download/export buttons
- [ ] Connect to output_writer

**Acceptance Criteria**:
- ✅ Table displays results correctly
- ✅ Summary statistics shown
- ✅ Download buttons work
- ✅ Export to CSV works

**DO NOT**:
- ❌ Don't implement sorting/filtering yet (that's Phase 2)
- ❌ Don't add multiple candidate display yet (that's Phase 2)

**Design References**: 
- `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.2.5)
- `DOCS/DESIGNS/02_Summary_Statistics_Report_Design.md`

---

### Step 1.8: Create Settings Panel Widget (2 days)
**File**: `SRC/gui/config_panel.py` (NEW)

**Dependencies**: Step 1.2 (main window)

**What to create - EXACT STRUCTURE:**

**Key Components**:
1. Form controls for all settings
2. Preset selector (radio buttons)
3. Save/Load buttons
4. Settings validation

**Implementation Checklist**:
- [ ] Create QWidget subclass
- [ ] Add form controls (QSpinBox, QCheckBox, etc.)
- [ ] Load defaults from config
- [ ] Save to YAML
- [ ] Load presets
- [ ] Validate settings

**Acceptance Criteria**:
- ✅ All settings have controls
- ✅ Presets work
- ✅ Save/Load works
- ✅ Validation works

**Design References**: 
- `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.2.3)
- `DOCS/DESIGNS/03_YAML_Configuration_Design.md`

---

### Step 1.9: Create Error Dialogs (1 day)
**File**: `SRC/gui/dialogs.py` (NEW)

**Dependencies**: Phase 0 (needs `ProcessingError`)

**What to create - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QDialog, QVBoxLayout, QLabel, QPushButton, QTextEdit
from gui_interface import ProcessingError

class ErrorDialog(QDialog):
    """User-friendly error dialog"""
    
    def __init__(self, error: ProcessingError, parent=None):
        super().__init__(parent)
        self.error = error
        self.init_ui()
        
    def init_ui(self):
        """Initialize UI"""
        layout = QVBoxLayout(self)
        
        # Error message
        message_label = QLabel(self.error.message)
        message_label.setWordWrap(True)
        layout.addWidget(message_label)
        
        # Details (if available)
        if self.error.details:
            details = QTextEdit(self.error.details)
            details.setReadOnly(True)
            layout.addWidget(details)
            
        # Suggestions (if available)
        if self.error.suggestions:
            suggestions_label = QLabel("Suggestions:")
            layout.addWidget(suggestions_label)
            for suggestion in self.error.suggestions:
                sug_label = QLabel(f"• {suggestion}")
                sug_label.setWordWrap(True)
                layout.addWidget(sug_label)
        
        # OK button
        ok_btn = QPushButton("OK")
        ok_btn.clicked.connect(self.accept)
        layout.addWidget(ok_btn)
        
        self.setWindowTitle("Error")
        self.setMinimumWidth(400)
```

**Implementation Checklist**:
- [ ] Create QDialog subclasses
- [ ] Display ProcessingError objects
- [ ] Show suggestions
- [ ] Add help buttons (optional)
- [ ] Style consistently

**Acceptance Criteria**:
- ✅ Errors display clearly
- ✅ Suggestions shown
- ✅ Help buttons work (if implemented)
- ✅ Consistent styling

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.7)
**Design Reference**: `DOCS/DESIGNS/05_Better_Error_Messages_Design.md`

---

### Step 1.10: Create Main Application Entry Point (1 day)
**File**: `SRC/gui_app.py` (NEW)

**Dependencies**: Step 1.2 (main window)

**What to create - EXACT STRUCTURE:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Application Entry Point
"""

import sys
from PySide6.QtWidgets import QApplication
from gui.main_window import MainWindow

def main():
    """Main entry point for GUI application"""
    app = QApplication(sys.argv)
    app.setApplicationName("CuePoint")
    app.setOrganizationName("CuePoint")
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
```

**Implementation Checklist**:
- [ ] Create QApplication
- [ ] Set application metadata
- [ ] Create MainWindow
- [ ] Show window
- [ ] Run event loop
- [ ] Handle exceptions

**Acceptance Criteria**:
- ✅ Application launches
- ✅ Window displays
- ✅ No errors on startup
- ✅ Clean exit

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 5.1)

---

### Step 1.11: Create Executable Packaging (1 week)
**Files**: `build/` directory (NEW)

**Dependencies**: Step 1.10 (application entry point)

**What to create - EXACT STRUCTURE:**

See `DOCS/DESIGNS/17_Executable_Packaging_Design.md` for complete details.

**Key Components**:
1. PyInstaller spec file
2. Build scripts
3. Installer scripts (NSIS/Inno Setup for Windows)
4. Icon assets
5. GitHub Actions workflow (optional)

**Implementation Checklist**:
- [ ] Create PyInstaller spec
- [ ] Create build scripts
- [ ] Create Windows installer
- [ ] Create macOS DMG
- [ ] Create Linux AppImage
- [ ] Set up CI/CD (optional)

**Acceptance Criteria**:
- ✅ Executable builds successfully
- ✅ Windows installer works
- ✅ macOS app bundle works
- ✅ Linux AppImage works
- ✅ CI builds automatically (if set up)

**Design Reference**: `DOCS/DESIGNS/17_Executable_Packaging_Design.md`

---

### Step 1.12: GUI Enhancements (1-2 weeks)
**Files**: Various GUI files (MODIFY)

**Dependencies**: Steps 1.1-1.11 (core GUI working)

**What to add**:
- Icons and branding
- Settings persistence
- Recent files menu
- Dark mode support
- Menu bar and shortcuts
- Help system

**Implementation Checklist**:
- [ ] Add application icons
- [ ] Implement settings persistence
- [ ] Add recent files
- [ ] Implement dark mode
- [ ] Add keyboard shortcuts
- [ ] Create help system

**Acceptance Criteria**:
- ✅ Icons display correctly
- ✅ Settings persist between sessions
- ✅ Recent files work
- ✅ Dark mode works
- ✅ Shortcuts work
- ✅ Help accessible

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 6)
**Design Reference**: `DOCS/DESIGNS/18_GUI_Enhancements_Design.md`

---

## Phase 1 Deliverables Checklist
- [ ] GUI application launches
- [ ] All core features work
- [ ] Executable builds
- [ ] Windows installer works
- [ ] macOS app bundle works
- [ ] Linux AppImage works
- [ ] GUI enhancements complete
- [ ] User testing done

---

## Testing Strategy

### Manual Testing
- Launch application
- Test file selection (browse + drag & drop)
- Test playlist selection
- Start processing and verify progress updates
- Test cancellation
- Verify results display
- Test CSV download
- Test error handling

### Integration Testing
- Test with real XML files
- Test with various playlist sizes
- Test error scenarios
- Test cancellation scenarios

---

## Common Issues and Solutions

### Issue: PySide6 import errors
**Solution**: Install PySide6: `pip install PySide6`

### Issue: Application doesn't launch
**Solution**: Check that `gui_app.py` is the entry point and all imports are correct

### Issue: Progress not updating
**Solution**: Make sure signals are connected correctly and worker thread emits signals

### Issue: Executable too large
**Solution**: Use PyInstaller's `--exclude-module` to remove unused modules

---

*For complete code examples, see `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` which contains full implementation details.*

