# Batch Processing Enhancements (Future Feature)

**Status**: 📝 Future Consideration  
**Priority**: 🚀 Low Priority (Only if users request batch processing features)  
**Estimated Duration**: 2-3 days  
**Dependencies**: Phase 1 (GUI), Phase 2 (batch processor), Phase 3 (performance monitoring)

## Goal
Enhance batch processing capabilities with features like resume interrupted processing, batch statistics, and improved progress tracking.

## Success Criteria
- [ ] Resume interrupted batch processing works
- [ ] Batch statistics displayed correctly
- [ ] Progress tracking improved
- [ ] Error recovery for batch processing
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing**: Basic batch processing (implemented in Phase 2)
- **Limitations**: No resume capability, limited statistics, basic progress tracking
- **Opportunity**: Add resume, detailed statistics, better progress feedback
- **Risk**: Additional complexity, state management

### Feature Design
- **Resume Processing**: Save progress, resume from last completed file
- **Batch Statistics**: Track overall progress, success rates, time estimates
- **Progress Tracking**: More detailed progress information per file

### Performance Considerations (Phase 3 Integration)
- **Batch Metrics**: Track batch processing performance
- **Resume Performance**: Track resume operation time
- **Statistics**: Aggregate statistics across all files

### Error Handling Strategy
1. **Interruption Handling**: Save state on interruption
2. **Resume Errors**: Handle corrupted state files
3. **Statistics Errors**: Handle missing data gracefully

### Backward Compatibility
- Existing batch processing continues to work
- New features are opt-in
- No breaking changes

---

## Implementation Steps

### Substep 4.6.1: Add Resume Capability (1-2 days)
**File**: `SRC/gui/batch_processor.py` (MODIFY)

**What to implement:**

```python
import json
import os
from pathlib import Path
from typing import List, Dict, Optional

class BatchProcessor:
    """Enhanced batch processor with resume capability"""
    
    STATE_FILE = "batch_processing_state.json"
    
    def __init__(self):
        self.processed_files = []
        self.failed_files = []
        self.current_file_index = 0
        self.state_file_path = None
    
    def save_state(self, file_list: List[str], current_index: int):
        """Save processing state to file"""
        state = {
            "file_list": file_list,
            "current_index": current_index,
            "processed_files": self.processed_files,
            "failed_files": self.failed_files,
            "timestamp": datetime.now().isoformat()
        }
        
        if self.state_file_path:
            with open(self.state_file_path, 'w') as f:
                json.dump(state, f)
    
    def load_state(self) -> Optional[Dict]:
        """Load processing state from file"""
        if not self.state_file_path or not os.path.exists(self.state_file_path):
            return None
        
        try:
            with open(self.state_file_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            # Handle corrupted state file
            return None
    
    def resume_processing(self, state_file: str) -> bool:
        """Resume processing from saved state"""
        self.state_file_path = state_file
        state = self.load_state()
        
        if not state:
            return False
        
        self.processed_files = state.get("processed_files", [])
        self.failed_files = state.get("failed_files", [])
        self.current_file_index = state.get("current_index", 0)
        
        return True
    
    def clear_state(self):
        """Clear saved state"""
        if self.state_file_path and os.path.exists(self.state_file_path):
            os.remove(self.state_file_path)
```

**Implementation Checklist**:
- [ ] Add state saving/loading
- [ ] Add resume functionality
- [ ] Add error handling
- [ ] Test resume capability

---

### Substep 4.6.2: Add Batch Statistics (1 day)
**File**: `SRC/gui/batch_processor.py` (MODIFY)

**What to implement:**

```python
def get_batch_statistics(self) -> Dict[str, Any]:
    """Get batch processing statistics"""
    total_files = len(self.file_list)
    processed = len(self.processed_files)
    failed = len(self.failed_files)
    remaining = total_files - processed - failed
    
    total_tracks = sum(f.get("total_tracks", 0) for f in self.processed_files)
    matched_tracks = sum(f.get("matched_tracks", 0) for f in self.processed_files)
    
    return {
        "total_files": total_files,
        "processed_files": processed,
        "failed_files": failed,
        "remaining_files": remaining,
        "total_tracks": total_tracks,
        "matched_tracks": matched_tracks,
        "match_rate": matched_tracks / total_tracks if total_tracks > 0 else 0,
        "progress_percent": (processed / total_files * 100) if total_files > 0 else 0
    }
```

**Implementation Checklist**:
- [ ] Add statistics calculation
- [ ] Add statistics display
- [ ] Test statistics accuracy

---

### Substep 4.8.3: GUI Integration for Batch Enhancements (1-2 days)
**Files**: `SRC/gui/batch_processor.py` (MODIFY), `SRC/gui/main_window.py` (MODIFY)

**Dependencies**: Phase 2 Step 2.2 (batch processor exists), Substep 4.8.1 (resume capability), Substep 4.8.2 (batch statistics)

**What to implement - EXACT STRUCTURE:**

#### Part A: Enhanced Batch Processor Dialog

**In `SRC/gui/batch_processor.py`:**

```python
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QProgressBar, QTableWidget, QTableWidgetItem, QGroupBox,
    QCheckBox, QMessageBox, QFileDialog
)
from PySide6.QtCore import Qt, QTimer, Signal
from typing import List, Dict, Optional
import json
import os
from datetime import datetime

class BatchProcessorDialog(QDialog):
    """Enhanced batch processor dialog with resume and statistics"""
    
    # Signals
    processing_complete = Signal(list)  # Emitted when batch processing completes
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.file_list = []
        self.processed_files = []
        self.failed_files = []
        self.current_file_index = 0
        self.state_file_path = None
        self.statistics = {}
        self.init_ui()
        self._check_for_resume()
    
    def init_ui(self):
        """Initialize enhanced batch processor UI"""
        self.setWindowTitle("Batch Process Playlists")
        self.setMinimumWidth(800)
        self.setMinimumHeight(600)
        
        layout = QVBoxLayout(self)
        
        # File selection
        file_group = QGroupBox("Playlist Files")
        file_layout = QVBoxLayout()
        
        file_button_layout = QHBoxLayout()
        self.add_files_button = QPushButton("Add Files...")
        self.add_files_button.clicked.connect(self.add_files)
        file_button_layout.addWidget(self.add_files_button)
        
        self.clear_files_button = QPushButton("Clear All")
        self.clear_files_button.clicked.connect(self.clear_files)
        file_button_layout.addWidget(self.clear_files_button)
        
        file_button_layout.addStretch()
        file_layout.addLayout(file_button_layout)
        
        # File list table
        self.file_table = QTableWidget()
        self.file_table.setColumnCount(4)
        self.file_table.setHorizontalHeaderLabels(["File", "Status", "Progress", "Result"])
        self.file_table.setSelectionBehavior(QTableWidget.SelectRows)
        file_layout.addWidget(self.file_table)
        
        file_group.setLayout(file_layout)
        layout.addWidget(file_group)
        
        # NEW: Resume option
        resume_group = QGroupBox("Resume Options")
        resume_layout = QVBoxLayout()
        
        self.resume_checkbox = QCheckBox("Enable resume capability (save progress)")
        self.resume_checkbox.setChecked(True)
        self.resume_checkbox.setToolTip(
            "Save processing state to allow resuming interrupted batch processing.\n"
            "State is saved after each file is processed."
        )
        resume_layout.addWidget(self.resume_checkbox)
        
        # Resume button (shown if state file exists)
        self.resume_button = QPushButton("Resume Previous Batch")
        self.resume_button.setVisible(False)
        self.resume_button.clicked.connect(self.resume_previous)
        resume_layout.addWidget(self.resume_button)
        
        resume_group.setLayout(resume_layout)
        layout.addWidget(resume_group)
        
        # NEW: Batch Statistics Group
        stats_group = QGroupBox("Batch Statistics")
        stats_layout = QVBoxLayout()
        
        stats_grid = QHBoxLayout()
        
        # Overall progress
        self.total_progress_label = QLabel("Total Progress: 0/0 files")
        self.total_progress_bar = QProgressBar()
        self.total_progress_bar.setMinimum(0)
        self.total_progress_bar.setMaximum(100)
        
        # Statistics labels
        self.stats_labels = {
            "processed": QLabel("Processed: 0"),
            "succeeded": QLabel("Succeeded: 0"),
            "failed": QLabel("Failed: 0"),
            "total_tracks": QLabel("Total Tracks: 0"),
            "matched_tracks": QLabel("Matched Tracks: 0"),
            "match_rate": QLabel("Match Rate: 0%"),
            "estimated_time": QLabel("Estimated Time Remaining: --")
        }
        
        stats_left = QVBoxLayout()
        stats_left.addWidget(self.total_progress_label)
        stats_left.addWidget(self.total_progress_bar)
        for label in self.stats_labels.values():
            stats_left.addWidget(label)
        
        stats_grid.addLayout(stats_left)
        stats_grid.addStretch()
        
        stats_layout.addLayout(stats_grid)
        stats_group.setLayout(stats_layout)
        layout.addWidget(stats_group)
        
        # Control buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.start_button = QPushButton("Start Batch Processing")
        self.start_button.clicked.connect(self.start_processing)
        button_layout.addWidget(self.start_button)
        
        self.pause_button = QPushButton("Pause")
        self.pause_button.setEnabled(False)
        self.pause_button.clicked.connect(self.pause_processing)
        button_layout.addWidget(self.pause_button)
        
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_button)
        
        layout.addLayout(button_layout)
    
    def _check_for_resume(self):
        """Check if there's a previous state file to resume from"""
        state_file = "batch_processing_state.json"
        if os.path.exists(state_file):
            self.resume_button.setVisible(True)
            self.state_file_path = state_file
    
    def resume_previous(self):
        """Resume previous batch processing"""
        if not self.state_file_path or not os.path.exists(self.state_file_path):
            QMessageBox.warning(self, "No Resume Data", "No previous batch processing state found.")
            return
        
        try:
            with open(self.state_file_path, 'r') as f:
                state = json.load(f)
            
            # Load state
            self.file_list = state.get("file_list", [])
            self.current_file_index = state.get("current_index", 0)
            self.processed_files = state.get("processed_files", [])
            self.failed_files = state.get("failed_files", [])
            
            # Update UI
            self._populate_file_table()
            self._update_statistics()
            
            QMessageBox.information(
                self,
                "Resume Loaded",
                f"Resumed batch processing from file {self.current_file_index + 1} of {len(self.file_list)}.\n"
                f"Processed: {len(self.processed_files)}, Failed: {len(self.failed_files)}"
            )
        except Exception as e:
            QMessageBox.warning(
                self,
                "Resume Failed",
                f"Failed to load resume state:\n{str(e)}\n\nStarting fresh batch."
            )
    
    def _populate_file_table(self):
        """Populate file table with current file list"""
        self.file_table.setRowCount(len(self.file_list))
        
        for row, file_path in enumerate(self.file_list):
            # File path
            self.file_table.setItem(row, 0, QTableWidgetItem(os.path.basename(file_path)))
            
            # Status
            if row < self.current_file_index:
                status = "Completed" if file_path in self.processed_files else "Failed"
            elif row == self.current_file_index:
                status = "Processing..."
            else:
                status = "Pending"
            
            status_item = QTableWidgetItem(status)
            if status == "Completed":
                status_item.setForeground(Qt.darkGreen)
            elif status == "Failed":
                status_item.setForeground(Qt.darkRed)
            elif status == "Processing...":
                status_item.setForeground(Qt.darkBlue)
            
            self.file_table.setItem(row, 1, status_item)
            
            # Progress (would show per-file progress)
            progress_item = QTableWidgetItem("--")
            self.file_table.setItem(row, 2, progress_item)
            
            # Result (would show match rate, etc.)
            result_item = QTableWidgetItem("--")
            self.file_table.setItem(row, 3, result_item)
    
    def _update_statistics(self):
        """Update batch statistics display"""
        total_files = len(self.file_list)
        processed = len(self.processed_files) + len(self.failed_files)
        
        # Update progress
        self.total_progress_label.setText(f"Total Progress: {processed}/{total_files} files")
        if total_files > 0:
            progress_percent = int((processed / total_files) * 100)
            self.total_progress_bar.setValue(progress_percent)
        
        # Update statistics
        self.stats_labels["processed"].setText(f"Processed: {processed}")
        self.stats_labels["succeeded"].setText(f"Succeeded: {len(self.processed_files)}")
        self.stats_labels["failed"].setText(f"Failed: {len(self.failed_files)}")
        
        # Calculate aggregate statistics
        total_tracks = sum(s.get("total_tracks", 0) for s in self.statistics.values())
        matched_tracks = sum(s.get("matched_tracks", 0) for s in self.statistics.values())
        match_rate = (matched_tracks / total_tracks * 100) if total_tracks > 0 else 0
        
        self.stats_labels["total_tracks"].setText(f"Total Tracks: {total_tracks}")
        self.stats_labels["matched_tracks"].setText(f"Matched Tracks: {matched_tracks}")
        self.stats_labels["match_rate"].setText(f"Match Rate: {match_rate:.1f}%")
        
        # Estimate time remaining (if processing)
        if processed > 0 and self.current_file_index < total_files:
            # Calculate average time per file and estimate
            # This would use actual timing data
            self.stats_labels["estimated_time"].setText("Estimated Time Remaining: Calculating...")
    
    def save_state(self):
        """Save current processing state"""
        if not self.resume_checkbox.isChecked() or not self.state_file_path:
            return
        
        state = {
            "file_list": self.file_list,
            "current_index": self.current_file_index,
            "processed_files": self.processed_files,
            "failed_files": self.failed_files,
            "statistics": self.statistics,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            with open(self.state_file_path, 'w') as f:
                json.dump(state, f, indent=2)
        except Exception as e:
            print(f"Warning: Failed to save batch state: {e}")
    
    def start_processing(self):
        """Start batch processing"""
        if not self.file_list:
            QMessageBox.warning(self, "No Files", "Please add playlist files to process.")
            return
        
        # Initialize state file if resume enabled
        if self.resume_checkbox.isChecked():
            self.state_file_path = "batch_processing_state.json"
        
        # Start processing
        self.start_button.setEnabled(False)
        self.pause_button.setEnabled(True)
        # ... processing logic ...
```

#### Part B: Main Window Integration

**In `SRC/gui/main_window.py`:**

```python
# In batch processing action handler:

def on_batch_process(self):
    """Handle batch process action"""
    from SRC.gui.batch_processor import BatchProcessorDialog
    
    dialog = BatchProcessorDialog(self)
    
    if dialog.exec() == QDialog.Accepted:
        # Batch processing completed
        results = dialog.get_all_results()
        # Handle results...
```

**Implementation Checklist**:
- [ ] Enhance batch processor dialog with resume UI
- [ ] Add statistics display group
- [ ] Add resume button and state loading
- [ ] Add state saving during processing
- [ ] Add statistics calculation and display
- [ ] Integrate into main window
- [ ] Test UI interactions
- [ ] Test resume functionality
- [ ] Test statistics accuracy

---

## Comprehensive Testing (2-3 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_batch_enhancements.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for batch processing enhancements.

Tests resume capability, statistics, and state management.
"""

import unittest
import tempfile
import os
import json
from unittest.mock import Mock, patch
from SRC.gui.batch_processor import BatchProcessorDialog

class TestBatchEnhancements(unittest.TestCase):
    """Comprehensive tests for batch enhancements"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.state_file = os.path.join(self.temp_dir, "batch_state.json")
    
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_state_saving(self):
        """Test state saving functionality"""
        dialog = BatchProcessorDialog()
        dialog.file_list = ["file1.xml", "file2.xml"]
        dialog.current_file_index = 1
        dialog.processed_files = ["file1.xml"]
        dialog.state_file_path = self.state_file
        
        dialog.save_state()
        
        # Verify state file created
        self.assertTrue(os.path.exists(self.state_file))
        
        # Verify state content
        with open(self.state_file, 'r') as f:
            state = json.load(f)
        
        self.assertEqual(state["file_list"], ["file1.xml", "file2.xml"])
        self.assertEqual(state["current_index"], 1)
        self.assertEqual(state["processed_files"], ["file1.xml"])
    
    def test_state_loading(self):
        """Test state loading functionality"""
        # Create state file
        state = {
            "file_list": ["file1.xml", "file2.xml"],
            "current_index": 1,
            "processed_files": ["file1.xml"],
            "failed_files": [],
            "timestamp": "2023-01-01T00:00:00"
        }
        
        with open(self.state_file, 'w') as f:
            json.dump(state, f)
        
        dialog = BatchProcessorDialog()
        dialog.state_file_path = self.state_file
        
        loaded_state = dialog.load_state()
        
        self.assertIsNotNone(loaded_state)
        self.assertEqual(loaded_state["file_list"], ["file1.xml", "file2.xml"])
        self.assertEqual(loaded_state["current_index"], 1)
    
    def test_resume_functionality(self):
        """Test resume from saved state"""
        # Create state file
        state = {
            "file_list": ["file1.xml", "file2.xml", "file3.xml"],
            "current_index": 1,
            "processed_files": ["file1.xml"],
            "failed_files": []
        }
        
        with open(self.state_file, 'w') as f:
            json.dump(state, f)
        
        dialog = BatchProcessorDialog()
        dialog.state_file_path = self.state_file
        dialog.resume_previous()
        
        # Verify state loaded
        self.assertEqual(len(dialog.file_list), 3)
        self.assertEqual(dialog.current_file_index, 1)
        self.assertEqual(len(dialog.processed_files), 1)
    
    def test_statistics_calculation(self):
        """Test batch statistics calculation"""
        dialog = BatchProcessorDialog()
        dialog.file_list = ["file1.xml", "file2.xml", "file3.xml"]
        dialog.processed_files = ["file1.xml", "file2.xml"]
        dialog.failed_files = []
        
        # Add statistics for processed files
        dialog.statistics = {
            "file1.xml": {"total_tracks": 10, "matched_tracks": 8},
            "file2.xml": {"total_tracks": 20, "matched_tracks": 18}
        }
        
        dialog._update_statistics()
        
        # Verify statistics
        self.assertEqual(dialog.stats_labels["processed"].text(), "Processed: 2")
        self.assertEqual(dialog.stats_labels["succeeded"].text(), "Succeeded: 2")
        self.assertEqual(dialog.stats_labels["failed"].text(), "Failed: 0")
        self.assertEqual(dialog.stats_labels["total_tracks"].text(), "Total Tracks: 30")
        self.assertEqual(dialog.stats_labels["matched_tracks"].text(), "Matched Tracks: 26")
    
    def test_corrupted_state_handling(self):
        """Test handling of corrupted state file"""
        # Create corrupted state file
        with open(self.state_file, 'w') as f:
            f.write("corrupted json data {")
        
        dialog = BatchProcessorDialog()
        dialog.state_file_path = self.state_file
        
        # Should handle gracefully
        loaded_state = dialog.load_state()
        self.assertIsNone(loaded_state)  # Should return None for corrupted state

if __name__ == '__main__':
    unittest.main()
```

#### Part B: GUI Integration Tests (`SRC/test_batch_gui.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for batch processing enhancements.

Tests UI interactions and resume functionality.
"""

import unittest
from unittest.mock import Mock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.batch_processor import BatchProcessorDialog

class TestBatchGUI(unittest.TestCase):
    """Tests for batch processor GUI components"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.dialog = BatchProcessorDialog()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.dialog.close()
    
    def test_resume_checkbox_exists(self):
        """Test resume checkbox exists"""
        self.assertIsNotNone(self.dialog.resume_checkbox)
        self.assertTrue(self.dialog.resume_checkbox.isChecked())  # Default enabled
    
    def test_statistics_group_visible(self):
        """Test statistics group is visible"""
        # Statistics group should be visible
        self.assertIsNotNone(self.dialog.stats_labels)
    
    def test_file_table_exists(self):
        """Test file table exists"""
        self.assertIsNotNone(self.dialog.file_table)

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Manual Testing Checklist

**UI Testing Checklist**:
- [ ] Batch processor dialog opens correctly
- [ ] Add Files button works
- [ ] File table displays files correctly
- [ ] Resume checkbox is visible and works
- [ ] Resume button appears when state file exists
- [ ] Resume button loads previous state correctly
- [ ] Statistics group is visible
- [ ] Statistics update during processing
- [ ] Progress bar updates correctly
- [ ] Start/Pause/Cancel buttons work
- [ ] State file is created when resume enabled
- [ ] State file is saved after each file

**Functional Testing Checklist**:
- [ ] Resume from saved state works
- [ ] Processing continues from correct file
- [ ] Processed files are tracked correctly
- [ ] Failed files are tracked correctly
- [ ] Statistics calculate correctly
- [ ] Progress tracking works correctly
- [ ] State saving works correctly
- [ ] State loading works correctly
- [ ] Corrupted state handled gracefully
- [ ] Missing state handled gracefully

**Error Scenario Testing**:
- [ ] Corrupted state file → Handled gracefully
- [ ] Missing state file → Start fresh
- [ ] File list changed → Handle mismatch
- [ ] Processing interruption → State saved
- [ ] Disk full → State save fails gracefully
- [ ] Error messages are clear and helpful

**Cross-Step Integration Testing**:
- [ ] Batch enhancements work with Phase 3 performance tracking
- [ ] Batch enhancements work with Step 4.1 (Enhanced Export)
- [ ] Batch enhancements work with Step 4.2 (Advanced Filtering)
  - Note: Batch mode tabs now include advanced filters (year, BPM, key) with resizable splitters
  - Each playlist tab has its own filter controls and can be filtered independently
- [ ] Batch enhancements work with Step 4.3 (Async I/O)
- [ ] Batch enhancements work with Database Integration (if implemented)

**Acceptance Criteria Verification**:
- ✅ Resume functionality works
- ✅ Batch statistics displayed
- ✅ Progress tracking improved
- ✅ Error handling robust
- ✅ UI is intuitive and helpful
- ✅ All tests passing
- ✅ Manual testing complete

---

## Error Handling

### Error Scenarios
1. **State File Errors**
   - Corrupted state → Handle gracefully
   - Missing state → Start fresh

2. **Resume Errors**
   - File list changed → Handle mismatch
   - Processing errors → Continue with next file

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Existing batch processing works
- [ ] Resume is opt-in
- [ ] No breaking changes

---

## Documentation Requirements

### User Guide Updates
- [ ] Document resume feature
- [ ] Document batch statistics
- [ ] Explain state files

---

## Phase 3 Integration

### Performance Metrics
- [ ] Track batch processing time
- [ ] Track resume operation time
- [ ] Track statistics generation time

---

## Acceptance Criteria
- ✅ Resume functionality works
- ✅ Batch statistics displayed
- ✅ Error handling robust
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 4.6.1: Add Resume Capability
- [ ] Substep 4.6.2: Add Batch Statistics
- [ ] Testing
- [ ] Documentation updated

---

**IMPORTANT**: This is a future feature. Only implement if users request batch processing enhancements. Evaluate need based on user feedback.

**See Also**: See `00_Future_Features_Overview.md` for other future features and implementation considerations.

