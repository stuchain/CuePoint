# Design: Desktop GUI Application

**Number**: 0 (Highest Priority)  
**Status**: 📝 Planned  
**Priority**: 🔥 P0 - Critical for User Adoption  
**Effort**: 3-4 weeks  
**Impact**: Very High - Makes application accessible to all users

---

## 1. Overview

### 1.1 Problem Statement

The current CLI-based application requires technical knowledge and command-line familiarity, limiting its use to developers and power users. Normal users need a simple, intuitive graphical interface that requires no technical setup.

### 1.2 Solution Overview

Create a native desktop GUI application that:
1. Provides a modern, intuitive graphical interface
2. Allows drag-and-drop file uploads
3. Shows real-time progress with visual feedback
4. Enables result preview and download
5. Works on Windows, macOS, and Linux
6. Packages as a standalone executable (no Python installation required)

### 1.3 Target Users

- **Primary**: DJs and music professionals who use Rekordbox
- **Secondary**: Music library managers and collectors
- **Tertiary**: Technical users who prefer GUI over CLI

---

## 2. Technology Stack Selection

### 2.1 Options Evaluated

#### Option A: Electron (React/Vue + Node.js)
**Pros:**
- Modern, web-based UI (React/Vue)
- Cross-platform (Windows, macOS, Linux)
- Rich ecosystem and components
- Easy to develop and maintain

**Cons:**
- Large bundle size (~100-150MB)
- High memory usage
- Requires Node.js runtime

**Verdict**: ⚠️ Good for complex UIs, but heavy for this use case

#### Option B: PyQt6 / PySide6 (Qt for Python)
**Pros:**
- Native look and feel per platform
- Professional appearance
- Excellent Python integration
- Extensive widget library
- Good performance

**Cons:**
- Commercial license considerations (PyQt6 requires paid license for commercial use)
- PySide6 is LGPL (free, but has obligations)
- Steeper learning curve

**Verdict**: ✅ **RECOMMENDED** - Best balance of native look, performance, and licensing

#### Option C: Tkinter (Python Standard Library)
**Pros:**
- Built into Python (no extra dependencies)
- Simple and lightweight
- Cross-platform

**Cons:**
- Outdated appearance
- Limited modern UI components
- Less polished look

**Verdict**: ⚠️ Acceptable but not ideal for professional application

#### Option D: CustomTkinter
**Pros:**
- Modern appearance
- Built on Tkinter (lightweight)
- Easy to use
- Good documentation

**Cons:**
- Still uses Tkinter backend
- Less mature than PyQt

**Verdict**: ✅ **GOOD ALTERNATIVE** - Modern appearance with Tkinter simplicity

### 2.2 Selected Technology: PySide6 (Qt for Python)

**Rationale:**
- Native appearance on all platforms
- Professional, modern UI
- Excellent widget library
- **Free LGPL license** (PySide6) - No commercial licensing concerns
- Strong Python integration
- Good performance
- Comprehensive documentation
- Active community support

**Important:** We use **PySide6** (not PyQt6) because:
- PySide6 is free and open-source (LGPL)
- No commercial licensing fees
- Officially supported by Qt Company
- Same API as PyQt6 (easy migration if needed)
- Better for open-source projects

**Note:** PyQt6 requires a paid commercial license for commercial use. PySide6 is LGPL and free for all uses, making it the better choice for this project.

---

## 3. Application Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GUI Application Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Main Window │  │ Progress UI  │  │ Results View │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              Application Logic Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ GUI Controller│  │ Config Manager│  │ Job Manager  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              Core Processing Layer (Existing)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  processor.py│  │  matcher.py  │  │ beatport.py  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Structure

```
SRC/
├── gui/                          # GUI application code
│   ├── __init__.py
│   ├── main_window.py            # Main application window
│   ├── file_selector.py          # XML file selection widget
│   ├── playlist_selector.py      # Playlist dropdown/selector
│   ├── config_panel.py           # Configuration settings panel
│   ├── progress_widget.py        # Progress display widget
│   ├── results_view.py           # Results table/preview
│   ├── status_bar.py             # Status bar component
│   └── styles.py                 # Theme and styling
├── gui_controller.py              # Bridge between GUI and core logic
└── [existing core modules...]     # Existing processing code
```

---

## 4. User Interface Design

### 4.1 Main Window Layout

```
┌─────────────────────────────────────────────────────────────┐
│  CuePoint - Beatport Metadata Enricher          [─] [□] [×] │
├─────────────────────────────────────────────────────────────┤
│  File                                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 📁 Rekordbox XML File:                              │    │
│  │ [Browse...]  collection.xml                         │    │
│  │            or drag & drop here                       │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Playlist                                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 📋 Select Playlist:                                │    │
│  │ [▼ My Playlist                      ]              │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Settings                                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ☑ Auto-research unmatched tracks                    │    │
│  │ ☐ Enable verbose logging                            │    │
│  │                                                      │    │
│  │ Performance Preset:                                  │    │
│  │ ◉ Balanced  ○ Fast  ○ Turbo  ○ Exhaustive          │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Output                                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 💾 Output Directory:                                │    │
│  │ [Browse...]  C:\Users\...\output                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │          [▶ Start Processing]                        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Progress (hidden until processing starts)                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Processing: ████████████░░░░░░░░░░  60%            │    │
│  │ Track 12/20: Dance With Me - Shadu                 │    │
│  │ Matched: 11 | Unmatched: 1                          │    │
│  │ [⏸ Pause]  [⏹ Stop]                                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Results (shown after completion)                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ✅ Processing Complete!                              │    │
│  │                                                      │    │
│  │ Summary:                                             │    │
│  │ • 20 tracks processed                               │    │
│  │ • 19 matched (95%)                                  │    │
│  │ • 1 unmatched (5%)                                  │    │
│  │ • Average score: 138.5                               │    │
│  │                                                      │    │
│  │ [📊 View Results]  [💾 Download CSV]  [🔄 Process Another]│
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Status: Ready                    [ℹ] [⚙] [📖]            │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Key UI Components

#### 4.2.1 File Selector
- **Drag & Drop**: Visual drop zone for XML files
- **File Browser**: Standard file picker button
- **Validation**: Immediate feedback on file validity
- **Recent Files**: Dropdown menu with recently used files

#### 4.2.2 Playlist Selector
- **Auto-populate**: Extract playlists from loaded XML
- **Search**: Filter playlists by name
- **Preview**: Show track count per playlist
- **Validation**: Highlight invalid selections

#### 4.2.3 Configuration Panel
- **Presets**: Radio buttons for performance presets
- **Advanced Settings**: Collapsible panel for advanced options
- **Save/Load**: Save configuration presets
- **Tooltips**: Helpful explanations for each setting

#### 4.2.4 Progress Widget
- **Progress Bar**: Visual progress indicator (0-100%)
- **Current Track**: Display currently processing track
- **Statistics**: Real-time match/unmatch counts
- **Time Estimate**: Estimated time remaining
- **Cancel Button**: Ability to stop processing

#### 4.2.5 Results View
- **Summary Cards**: Key statistics in visual cards
- **Results Table**: Sortable, filterable table of matches
- **Download Buttons**: Quick access to CSV files
- **Export Options**: Additional export formats

---

## 5. Implementation Details

### 5.1 Main Window Class

**Location**: `SRC/gui/main_window.py`

```python
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog, QComboBox,
    QProgressBar, QTextEdit, QCheckBox, QRadioButton,
    QGroupBox, QButtonGroup, QMessageBox, QTableWidget,
    QTableWidgetItem, QFileSystemWatcher
)
from PySide6.QtCore import Qt, QThread, Signal, QTimer
from PySide6.QtGui import QDragEnterEvent, QDropEvent, QIcon
import sys
import os

from gui_controller import GUIController
from config import SETTINGS


class MainWindow(QMainWindow):
    """Main application window"""
    
    def __init__(self):
        super().__init__()
        self.controller = GUIController()
        self.current_job = None
        self.init_ui()
        self.setup_connections()
        
    def init_ui(self):
        """Initialize UI components"""
        self.setWindowTitle("CuePoint - Beatport Metadata Enricher")
        self.setMinimumSize(800, 600)
        self.setGeometry(100, 100, 1000, 700)
        
        # Central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Main layout
        layout = QVBoxLayout(central_widget)
        layout.setSpacing(15)
        
        # File selection section
        file_group = self.create_file_section()
        layout.addWidget(file_group)
        
        # Playlist selection section
        playlist_group = self.create_playlist_section()
        layout.addWidget(playlist_group)
        
        # Settings section
        settings_group = self.create_settings_section()
        layout.addWidget(settings_group)
        
        # Output section
        output_group = self.create_output_section()
        layout.addWidget(output_group)
        
        # Control buttons
        control_layout = QHBoxLayout()
        self.start_button = QPushButton("▶ Start Processing")
        self.start_button.setMinimumHeight(40)
        self.start_button.clicked.connect(self.start_processing)
        control_layout.addWidget(self.start_button)
        layout.addLayout(control_layout)
        
        # Progress section (initially hidden)
        self.progress_group = self.create_progress_section()
        self.progress_group.setVisible(False)
        layout.addWidget(self.progress_group)
        
        # Results section (initially hidden)
        self.results_group = self.create_results_section()
        self.results_group.setVisible(False)
        layout.addWidget(self.results_group)
        
        # Status bar
        self.statusBar().showMessage("Ready")
        
        # Enable drag and drop
        self.setAcceptDrops(True)
        
    def create_file_section(self):
        """Create file selection section"""
        group = QGroupBox("File")
        layout = QVBoxLayout()
        
        # File path display
        file_layout = QHBoxLayout()
        self.file_label = QLabel("Rekordbox XML File:")
        self.file_path = QLabel("No file selected")
        self.file_path.setStyleSheet("color: gray; font-style: italic;")
        
        browse_button = QPushButton("Browse...")
        browse_button.clicked.connect(self.browse_xml_file)
        
        file_layout.addWidget(self.file_label)
        file_layout.addWidget(self.file_path, 1)
        file_layout.addWidget(browse_button)
        
        layout.addLayout(file_layout)
        
        # Drag and drop hint
        hint_label = QLabel("or drag & drop XML file here")
        hint_label.setAlignment(Qt.AlignCenter)
        hint_label.setStyleSheet("color: gray; padding: 20px; border: 2px dashed gray;")
        layout.addWidget(hint_label)
        
        group.setLayout(layout)
        return group
        
    def create_playlist_section(self):
        """Create playlist selection section"""
        group = QGroupBox("Playlist")
        layout = QVBoxLayout()
        
        playlist_layout = QHBoxLayout()
        label = QLabel("Select Playlist:")
        self.playlist_combo = QComboBox()
        self.playlist_combo.setEnabled(False)
        self.playlist_combo.currentTextChanged.connect(self.on_playlist_changed)
        
        playlist_layout.addWidget(label)
        playlist_layout.addWidget(self.playlist_combo, 1)
        
        layout.addLayout(playlist_layout)
        group.setLayout(layout)
        return group
        
    def create_settings_section(self):
        """Create settings section"""
        group = QGroupBox("Settings")
        layout = QVBoxLayout()
        
        # Auto-research checkbox
        self.auto_research_check = QCheckBox("Auto-research unmatched tracks")
        self.auto_research_check.setChecked(True)
        layout.addWidget(self.auto_research_check)
        
        # Verbose logging checkbox
        self.verbose_check = QCheckBox("Enable verbose logging")
        layout.addWidget(self.verbose_check)
        
        # Performance preset radio buttons
        preset_label = QLabel("Performance Preset:")
        layout.addWidget(preset_label)
        
        self.preset_group = QButtonGroup()
        preset_layout = QHBoxLayout()
        
        presets = [
            ("Balanced", "balanced"),
            ("Fast", "fast"),
            ("Turbo", "turbo"),
            ("Exhaustive", "exhaustive")
        ]
        
        for text, value in presets:
            radio = QRadioButton(text)
            radio.setChecked(value == "balanced")
            self.preset_group.addButton(radio)
            self.preset_group.setId(radio, value)
            preset_layout.addWidget(radio)
        
        layout.addLayout(preset_layout)
        group.setLayout(layout)
        return group
        
    def create_output_section(self):
        """Create output directory section"""
        group = QGroupBox("Output")
        layout = QVBoxLayout()
        
        output_layout = QHBoxLayout()
        label = QLabel("Output Directory:")
        self.output_path = QLabel(os.path.join(os.getcwd(), "output"))
        
        browse_output = QPushButton("Browse...")
        browse_output.clicked.connect(self.browse_output_dir)
        
        output_layout.addWidget(label)
        output_layout.addWidget(self.output_path, 1)
        output_layout.addWidget(browse_output)
        
        layout.addLayout(output_layout)
        group.setLayout(layout)
        return group
        
    def create_progress_section(self):
        """Create progress display section"""
        group = QGroupBox("Progress")
        layout = QVBoxLayout()
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setMinimum(0)
        self.progress_bar.setMaximum(100)
        layout.addWidget(self.progress_bar)
        
        # Current track label
        self.current_track_label = QLabel("")
        layout.addWidget(self.current_track_label)
        
        # Statistics
        stats_layout = QHBoxLayout()
        self.matched_label = QLabel("Matched: 0")
        self.unmatched_label = QLabel("Unmatched: 0")
        stats_layout.addWidget(self.matched_label)
        stats_layout.addWidget(self.unmatched_label)
        layout.addLayout(stats_layout)
        
        # Control buttons
        control_layout = QHBoxLayout()
        self.pause_button = QPushButton("⏸ Pause")
        self.pause_button.clicked.connect(self.pause_processing)
        self.stop_button = QPushButton("⏹ Stop")
        self.stop_button.clicked.connect(self.stop_processing)
        control_layout.addWidget(self.pause_button)
        control_layout.addWidget(self.stop_button)
        layout.addLayout(control_layout)
        
        group.setLayout(layout)
        return group
        
    def create_results_section(self):
        """Create results display section"""
        group = QGroupBox("Results")
        layout = QVBoxLayout()
        
        # Summary
        self.summary_label = QLabel("")
        layout.addWidget(self.summary_label)
        
        # Action buttons
        button_layout = QHBoxLayout()
        view_results_btn = QPushButton("📊 View Results")
        view_results_btn.clicked.connect(self.view_results)
        download_btn = QPushButton("💾 Download CSV")
        download_btn.clicked.connect(self.download_results)
        new_job_btn = QPushButton("🔄 Process Another")
        new_job_btn.clicked.connect(self.reset_ui)
        
        button_layout.addWidget(view_results_btn)
        button_layout.addWidget(download_btn)
        button_layout.addWidget(new_job_btn)
        layout.addLayout(button_layout)
        
        group.setLayout(layout)
        return group
        
    def setup_connections(self):
        """Setup signal connections"""
        # Connect controller signals to UI updates
        self.controller.progress_updated.connect(self.update_progress)
        self.controller.track_processed.connect(self.on_track_processed)
        self.controller.processing_complete.connect(self.on_processing_complete)
        self.controller.error_occurred.connect(self.on_error)
        
    def dragEnterEvent(self, event: QDragEnterEvent):
        """Handle drag enter event"""
        if event.mimeData().hasUrls():
            urls = event.mimeData().urls()
            if len(urls) == 1 and urls[0].toLocalFile().endswith('.xml'):
                event.acceptProposedAction()
                
    def dropEvent(self, event: QDropEvent):
        """Handle drop event"""
        files = [url.toLocalFile() for url in event.mimeData().urls()]
        if files and files[0].endswith('.xml'):
            self.load_xml_file(files[0])
            event.acceptProposedAction()
            
    def browse_xml_file(self):
        """Open file browser for XML file"""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Rekordbox XML File",
            "",
            "XML Files (*.xml);;All Files (*)"
        )
        if file_path:
            self.load_xml_file(file_path)
            
    def load_xml_file(self, file_path: str):
        """Load XML file and populate playlists"""
        try:
            playlists = self.controller.load_xml_file(file_path)
            self.file_path.setText(file_path)
            self.file_path.setStyleSheet("")
            
            # Populate playlist combo
            self.playlist_combo.clear()
            self.playlist_combo.addItems(playlists)
            self.playlist_combo.setEnabled(True)
            
            self.statusBar().showMessage(f"Loaded {len(playlists)} playlists")
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load XML file:\n{str(e)}")
            
    def on_playlist_changed(self, playlist_name: str):
        """Handle playlist selection change"""
        if playlist_name:
            track_count = self.controller.get_playlist_track_count(playlist_name)
            self.statusBar().showMessage(f"Selected playlist: {playlist_name} ({track_count} tracks)")
            
    def start_processing(self):
        """Start processing job"""
        # Validate inputs
        xml_path = self.file_path.text()
        if xml_path == "No file selected":
            QMessageBox.warning(self, "Missing File", "Please select an XML file")
            return
            
        playlist_name = self.playlist_combo.currentText()
        if not playlist_name:
            QMessageBox.warning(self, "Missing Playlist", "Please select a playlist")
            return
            
        # Get settings
        auto_research = self.auto_research_check.isChecked()
        verbose = self.verbose_check.isChecked()
        preset = self.preset_group.checkedButton().text().lower()
        
        output_dir = self.output_path.text()
        
        # Update UI
        self.start_button.setEnabled(False)
        self.progress_group.setVisible(True)
        self.results_group.setVisible(False)
        self.progress_bar.setValue(0)
        
        # Start processing in background thread
        self.controller.start_processing(
            xml_path=xml_path,
            playlist_name=playlist_name,
            output_dir=output_dir,
            auto_research=auto_research,
            verbose=verbose,
            preset=preset
        )
        
    def update_progress(self, percentage: int, current_track: str, matched: int, unmatched: int):
        """Update progress display"""
        self.progress_bar.setValue(percentage)
        self.current_track_label.setText(f"Track {current_track}")
        self.matched_label.setText(f"Matched: {matched}")
        self.unmatched_label.setText(f"Unmatched: {unmatched}")
        
    def on_track_processed(self, track_info: dict):
        """Handle track processed event"""
        # Update status bar
        self.statusBar().showMessage(
            f"Processing: {track_info.get('title', 'Unknown')} - "
            f"{track_info.get('artist', 'Unknown')}"
        )
        
    def on_processing_complete(self, results: dict):
        """Handle processing completion"""
        self.progress_group.setVisible(False)
        self.results_group.setVisible(True)
        self.start_button.setEnabled(True)
        
        # Update summary
        summary_text = f"""
        ✅ Processing Complete!
        
        Summary:
        • {results['total_tracks']} tracks processed
        • {results['matched']} matched ({results['match_rate']:.1f}%)
        • {results['unmatched']} unmatched ({100 - results['match_rate']:.1f}%)
        • Average score: {results['average_score']:.1f}
        """
        self.summary_label.setText(summary_text)
        
        self.statusBar().showMessage("Processing complete")
        
    def on_error(self, error_message: str):
        """Handle error"""
        QMessageBox.critical(self, "Error", error_message)
        self.start_button.setEnabled(True)
        
    def pause_processing(self):
        """Pause processing"""
        self.controller.pause_processing()
        
    def stop_processing(self):
        """Stop processing"""
        reply = QMessageBox.question(
            self,
            "Stop Processing",
            "Are you sure you want to stop processing?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.controller.stop_processing()
            self.start_button.setEnabled(True)
            
    def reset_ui(self):
        """Reset UI for new job"""
        self.progress_group.setVisible(False)
        self.results_group.setVisible(False)
        self.progress_bar.setValue(0)
        self.statusBar().showMessage("Ready")
        
    def browse_output_dir(self):
        """Browse for output directory"""
        directory = QFileDialog.getExistingDirectory(
            self,
            "Select Output Directory",
            self.output_path.text()
        )
        if directory:
            self.output_path.setText(directory)
            
    def view_results(self):
        """Open results table view"""
        # TODO: Implement results table window
        pass
        
    def download_results(self):
        """Open file browser to download results"""
        # Open output directory in file explorer
        import subprocess
        import platform
        
        output_dir = self.output_path.text()
        
        if platform.system() == "Windows":
            subprocess.Popen(f'explorer "{output_dir}"')
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", output_dir])
        else:
            subprocess.Popen(["xdg-open", output_dir])


def main():
    """GUI application entry point"""
    from PySide6.QtWidgets import QApplication
    
    app = QApplication(sys.argv)
    app.setApplicationName("CuePoint")
    app.setOrganizationName("CuePoint")
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
```

### 5.2 GUI Controller

**Location**: `SRC/gui_controller.py`

```python
from PySide6.QtCore import QObject, Signal, QThread
from rekordbox import parse_rekordbox_xml
from processor import run, process_track
from config import SETTINGS
import os


class ProcessingWorker(QThread):
    """Worker thread for processing tracks"""
    
    progress_updated = Signal(int, str, int, int)  # percentage, track, matched, unmatched
    track_processed = Signal(dict)  # track info
    complete = Signal(dict)  # results
    
    def __init__(self, xml_path, playlist_name, output_dir, auto_research, verbose, preset):
        super().__init__()
        self.xml_path = xml_path
        self.playlist_name = playlist_name
        self.output_dir = output_dir
        self.auto_research = auto_research
        self.verbose = verbose
        self.preset = preset
        self._is_paused = False
        self._is_stopped = False
        
    def run(self):
        """Run processing in background thread"""
        try:
            # Apply preset
            self._apply_preset()
            
            # Process tracks
            results = self._process_tracks()
            
            # Emit completion signal
            self.complete.emit(results)
            
        except Exception as e:
            self.error.emit(str(e))
            
    def _apply_preset(self):
        """Apply performance preset"""
        if self.preset == "fast":
            SETTINGS.update({"TIME_BUDGET_SEC": 30, "MAX_CANDIDATES": 50})
        elif self.preset == "turbo":
            SETTINGS.update({"TIME_BUDGET_SEC": 20, "MAX_CANDIDATES": 25})
        elif self.preset == "exhaustive":
            SETTINGS.update({"TIME_BUDGET_SEC": 120, "MAX_CANDIDATES": 200})
            
        SETTINGS["VERBOSE"] = self.verbose
        
    def _process_tracks(self):
        """Process tracks with progress updates"""
        # Parse XML
        collection = parse_rekordbox_xml(self.xml_path)
        tracks = collection.get_playlist_tracks(self.playlist_name)
        
        total_tracks = len(tracks)
        matched = 0
        unmatched = 0
        
        for idx, track in enumerate(tracks):
            if self._is_stopped:
                break
                
            # Wait if paused
            while self._is_paused and not self._is_stopped:
                self.msleep(100)
                
            # Process track
            main_row, cand_rows, queries_rows = process_track(idx + 1, track)
            
            # Update statistics
            if main_row.get("beatport_url"):
                matched += 1
            else:
                unmatched += 1
                
            # Emit progress
            percentage = int((idx + 1) / total_tracks * 100)
            track_name = f"{track.title} - {track.artist}"
            self.progress_updated.emit(percentage, track_name, matched, unmatched)
            
            # Emit track processed
            self.track_processed.emit({
                "title": track.title,
                "artist": track.artist,
                "matched": bool(main_row.get("beatport_url"))
            })
            
        # Return results
        return {
            "total_tracks": total_tracks,
            "matched": matched,
            "unmatched": unmatched,
            "match_rate": (matched / total_tracks * 100) if total_tracks > 0 else 0,
            "average_score": 0.0  # TODO: Calculate from results
        }
        
    def pause(self):
        """Pause processing"""
        self._is_paused = True
        
    def resume(self):
        """Resume processing"""
        self._is_paused = False
        
    def stop(self):
        """Stop processing"""
        self._is_stopped = True


class GUIController(QObject):
    """Controller bridging GUI and core logic"""
    
    progress_updated = Signal(int, str, int, int)
    track_processed = Signal(dict)
    processing_complete = Signal(dict)
    error_occurred = Signal(str)
    
    def __init__(self):
        super().__init__()
        self.collection = None
        self.current_worker = None
        
    def load_xml_file(self, file_path: str) -> list:
        """Load XML file and return list of playlist names"""
        self.collection = parse_rekordbox_xml(file_path)
        return self.collection.get_playlist_names()
        
    def get_playlist_track_count(self, playlist_name: str) -> int:
        """Get track count for playlist"""
        if not self.collection:
            return 0
        tracks = self.collection.get_playlist_tracks(playlist_name)
        return len(tracks)
        
    def start_processing(self, xml_path: str, playlist_name: str, output_dir: str,
                        auto_research: bool, verbose: bool, preset: str):
        """Start processing job"""
        # Create worker thread
        self.current_worker = ProcessingWorker(
            xml_path, playlist_name, output_dir, auto_research, verbose, preset
        )
        
        # Connect signals
        self.current_worker.progress_updated.connect(self.progress_updated.emit)
        self.current_worker.track_processed.connect(self.track_processed.emit)
        self.current_worker.complete.connect(self.processing_complete.emit)
        self.current_worker.error.connect(self.error_occurred.emit)
        
        # Start worker
        self.current_worker.start()
        
    def pause_processing(self):
        """Pause current processing"""
        if self.current_worker:
            self.current_worker.pause()
            
    def stop_processing(self):
        """Stop current processing"""
        if self.current_worker:
            self.current_worker.stop()
            self.current_worker.wait()
            self.current_worker = None
```

### 5.3 Application Entry Point

**Location**: `SRC/gui_app.py` (new file)

```python
#!/usr/bin/env python3
"""
GUI application entry point for CuePoint

This can be launched independently of the CLI version.
"""

import sys
import os

# Ensure SRC is in path
if __name__ == "__main__":
    # Add SRC to path for imports
    src_path = os.path.join(os.path.dirname(__file__), 'SRC')
    if src_path not in sys.path:
        sys.path.insert(0, src_path)
    
    from gui.main_window import main
    main()
```

---

## 6. Platform-Specific Considerations

### 6.1 Windows

- **Executable**: `.exe` file generated by PyInstaller
- **Icon**: Custom application icon
- **Start Menu**: Installer adds Start Menu shortcut
- **File Associations**: Optional `.xml` file association

### 6.2 macOS

- **App Bundle**: `.app` bundle structure
- **Dock Icon**: Custom dock icon
- **Menu Bar**: Native macOS menu bar integration
- **Gatekeeper**: Code signing for distribution

### 6.3 Linux

- **AppImage**: Portable `.AppImage` format
- **Desktop Entry**: `.desktop` file for launcher integration
- **Package Formats**: Optional `.deb` and `.rpm` packages

---

## 7. Styling and Theming

### 7.1 Default Theme

- **Colors**: Professional blue/gray color scheme
- **Fonts**: System default fonts for native look
- **Icons**: Material Design or Font Awesome icons
- **Spacing**: Consistent padding and margins

### 7.2 Dark Mode Support

- **System Detection**: Auto-detect system theme preference
- **Manual Toggle**: Option to manually switch themes
- **Theme Persistence**: Save user preference

---

## 8. Error Handling and User Feedback

### 8.1 Error Messages

- **User-Friendly**: Plain language error messages
- **Actionable**: Suggestions for fixing errors
- **Non-Technical**: Avoid technical jargon

### 8.2 Validation

- **File Validation**: Check XML file validity before processing
- **Playlist Validation**: Verify playlist exists
- **Output Directory**: Check write permissions

### 8.3 Progress Feedback

- **Real-Time Updates**: Continuous progress updates
- **Time Estimates**: Show estimated time remaining
- **Status Messages**: Clear status messages

---

## 9. Testing Strategy

### 9.1 Unit Tests

- Test GUI components in isolation
- Mock backend processing
- Test event handlers

### 9.2 Integration Tests

- Test full workflow: file load → process → results
- Test error scenarios
- Test UI state transitions

### 9.3 User Testing

- Beta testing with real users
- Collect feedback on usability
- Iterate based on feedback

---

## 10. Distribution

### 10.1 Executable Packaging

- **PyInstaller**: Create standalone executables
- **Include Dependencies**: Bundle all required libraries
- **Include Data**: Bundle configuration templates

### 10.2 Installer Creation

- **Windows**: NSIS or Inno Setup installer
- **macOS**: DMG with app bundle
- **Linux**: AppImage or package manager

### 10.3 Update Mechanism

- **Version Check**: Check for updates on startup
- **Download Updates**: Optional auto-update feature
- **Manual Updates**: Download from website

---

## 11. Dependencies

### 11.1 GUI Framework

```
PySide6>=6.5.0  # Qt for Python (LGPL - free and open-source)
```

**Installation:**
```bash
pip install PySide6>=6.5.0
```

**Note:** PySide6 is the free, LGPL-licensed version of Qt for Python. It does not require any commercial licensing fees.

### 11.2 Optional Dependencies

```
PyInstaller>=5.0  # For executable creation
```

---

## 12. Future Enhancements

### 12.1 Advanced Features

1. **Batch Processing UI**: Process multiple playlists at once
2. **Results Preview**: In-app table view of results
3. **Configuration Editor**: Visual config editor
4. **History**: Track processing history
5. **Statistics Dashboard**: Visual charts and graphs

### 12.2 Integration Features

1. **Cloud Storage**: Upload/download from cloud services
2. **API Integration**: Connect to external APIs
3. **Export Formats**: Additional export formats (JSON, Excel)

---

## 13. Migration Path

### 13.1 From CLI to GUI

- **Keep CLI**: Maintain CLI version for power users
- **Shared Core**: Both GUI and CLI use same core processing code
- **Progressive Enhancement**: GUI wraps CLI functionality

### 13.2 Backward Compatibility

- **CLI Still Works**: Existing CLI scripts continue to work
- **Config Files**: GUI respects existing config files
- **Output Format**: Same output format as CLI

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

