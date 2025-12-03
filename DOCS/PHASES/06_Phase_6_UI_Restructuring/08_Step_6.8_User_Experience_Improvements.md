# Step 6.8: User Experience Improvements

**Status**: 📝 Planned  
**Duration**: 1-2 weeks  
**Dependencies**: Steps 6.1-6.7 (Core UI Restructuring)

## Goal

Enhance the user experience with improved file management, keyboard navigation, visual feedback, and better workflow controls.

## Overview

This step focuses on making the application more intuitive and efficient through:
- Recent files quick access
- Enhanced drag & drop experience
- Comprehensive keyboard shortcuts
- Confirmation dialogs for critical actions
- Improved progress visualization

---

## Substep 6.8.1: Recent Files Quick Access

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Allow users to quickly access recently used XML files without navigating through the file browser each time.

### Implementation Details

#### 1. Recent Files Storage

**File**: `SRC/cuepoint/ui/utils/recent_files.py` (NEW)

```python
"""
Recent Files Manager - Manages recently opened files

Stores and retrieves recently used XML files using QSettings.
Maintains a list of up to 10 recent files with timestamps.
"""

from typing import List, Dict
from pathlib import Path
from PySide6.QtCore import QSettings

class RecentFilesManager:
    """Manages recently opened files"""
    
    MAX_RECENT_FILES = 10
    
    def __init__(self):
        self.settings = QSettings()
        self.settings.beginGroup("RecentFiles")
    
    def add_file(self, file_path: str) -> None:
        """Add a file to recent files list"""
        # Implementation details...
    
    def get_recent_files(self) -> List[Dict[str, str]]:
        """Get list of recent files with metadata"""
        # Returns: [{"path": "...", "name": "...", "date": "..."}, ...]
    
    def clear_recent_files(self) -> None:
        """Clear all recent files"""
```

**Key Features**:
- Store up to 10 recent files
- Include file name, path, and last accessed timestamp
- Persist across application restarts
- Remove files that no longer exist

#### 2. Recent Files Menu

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Add "Open Recent" submenu to File menu
- Display recent files with timestamps
- Show file name and parent directory
- Add separator between recent files and "Clear Recent Files" action
- Update menu when new file is opened

**Menu Structure**:
```
File
├── Open XML File... (Ctrl+O)
├── Open Recent
│   ├── playlist1.xml (C:\Users\...\Documents) - Today, 2:30 PM
│   ├── playlist2.xml (C:\Users\...\Documents) - Yesterday, 5:15 PM
│   ├── ...
│   └── Clear Recent Files
└── Exit
```

#### 3. Recent Files Integration

**File**: `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)

**Changes**:
- Call `RecentFilesManager.add_file()` when file is selected
- Add recent files dropdown/button in file selector (optional)
- Show recent files in a popup menu when clicking a "Recent" button

**User Flow**:
1. User selects XML file → File added to recent files
2. User opens File menu → Sees recent files
3. User clicks recent file → File opens directly
4. File selector updates with selected file

### Testing Requirements

- [ ] Recent files persist after application restart
- [ ] Recent files list updates when new file is opened
- [ ] Non-existent files are removed from list
- [ ] Maximum 10 files are stored
- [ ] File menu displays recent files correctly
- [ ] Clicking recent file opens it successfully
- [ ] Clear Recent Files removes all entries

### Success Criteria

- Users can access recently used files in 1-2 clicks
- Recent files list is accurate and up-to-date
- No performance impact from recent files storage

---

## Substep 6.8.2: Enhanced Drag & Drop Experience

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Improve the drag & drop experience with visual feedback and file preview.

### Implementation Details

#### 1. Visual Drop Zone Highlight

**File**: `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)

**Changes**:
- Add visual highlight when dragging file over drop zone
- Change background color/border when file is dragged over
- Show "Drop XML file here" message
- Add drop zone indicator (dashed border, icon)

**Visual States**:
- **Normal**: Standard appearance
- **Drag Enter**: Highlighted border, background color change
- **Drag Over**: Pulsing animation or glow effect
- **Drop Accepted**: Success animation
- **Drop Rejected**: Error animation

**CSS Styling**:
```css
/* Normal state */
.file-drop-zone {
    border: 2px dashed #ccc;
    background-color: transparent;
}

/* Drag over state */
.file-drop-zone[drag-over="true"] {
    border: 2px dashed #0078d4;
    background-color: rgba(0, 120, 212, 0.1);
}
```

#### 2. File Preview Before Confirmation

**File**: `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)

**Changes**:
- Show file preview dialog when file is dropped
- Display file name, size, last modified date
- Show file path
- Add "Confirm" and "Cancel" buttons
- Parse XML to show basic info (playlist count, track count)

**Preview Dialog Content**:
```
┌─────────────────────────────────────┐
│  File Preview                       │
├─────────────────────────────────────┤
│  File: playlist.xml                │
│  Size: 2.5 MB                       │
│  Modified: Today, 3:45 PM          │
│  Path: C:\Users\...\Documents       │
│                                     │
│  XML Info:                          │
│  • Playlists: 5                    │
│  • Total Tracks: 234               │
│                                     │
│  [Cancel]  [Confirm]                │
└─────────────────────────────────────┘
```

**Implementation**:
- Use `QFileInfo` for file metadata
- Quick XML parse to get playlist/track counts
- Non-blocking preview (can be dismissed)

### Testing Requirements

- [ ] Drop zone highlights when dragging file over
- [ ] Visual feedback is clear and responsive
- [ ] File preview shows correct information
- [ ] Preview can be confirmed or cancelled
- [ ] Invalid files show error in preview
- [ ] Drag & drop works with multiple file types (XML only accepted)

### Success Criteria

- Users get clear visual feedback during drag & drop
- File preview helps users confirm correct file selection
- Drag & drop feels smooth and responsive

---

## Substep 6.8.3: Comprehensive Keyboard Shortcuts

**Duration**: 3-4 days  
**Priority**: High

### Goal

Enable full keyboard navigation and provide keyboard shortcuts for all major actions.

### Implementation Details

#### 1. Tab Navigation Through All Controls

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Ensure all interactive controls are in proper tab order
- Set `setTabOrder()` for logical navigation flow
- Add focus indicators for keyboard navigation
- Test tab order: File selector → Mode radios → Playlist selector → Start button

**Tab Order Flow**:
```
1. File path input
2. Browse button
3. Info button
4. Single Playlist radio
5. Multiple Playlists radio
6. Playlist dropdown
7. Start Processing button
8. Cancel button (when visible)
9. Results table (when visible)
```

**Focus Indicators**:
- Add visible focus outline (CSS: `outline: 2px solid #0078d4`)
- Ensure focus is visible on all controls

#### 2. Enter to Start Processing

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Connect Enter key to Start Processing button
- Only activate when button is enabled
- Handle Enter key in keyPressEvent or use QShortcut

**Implementation**:
```python
# In MainWindow.__init__ or init_ui
from PySide6.QtGui import QShortcut, QKeySequence

start_shortcut = QShortcut(QKeySequence("Return"), self)
start_shortcut.activated.connect(self._on_enter_start)

def _on_enter_start(self):
    """Handle Enter key to start processing"""
    if self.start_button.isEnabled():
        self.start_processing()
```

#### 3. Escape to Cancel

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Connect Escape key to cancel operation
- Only active when processing is running
- Show confirmation dialog if processing is in progress

**Implementation**:
```python
cancel_shortcut = QShortcut(QKeySequence("Escape"), self)
cancel_shortcut.activated.connect(self._on_escape_cancel)

def _on_escape_cancel(self):
    """Handle Escape key to cancel"""
    if self.controller.is_processing():
        self.on_cancel_requested()
```

#### 4. Shortcuts Displayed in Tooltips

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)  
**File**: `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)

**Changes**:
- Update all tooltips to include keyboard shortcuts
- Format: "Description (Shortcut: Key)"

**Tooltip Examples**:
- "Start processing the selected playlist (Shortcut: Enter)"
- "Cancel processing (Shortcut: Esc)"
- "Open XML file (Shortcut: Ctrl+O)"
- "Browse for XML file (Shortcut: Ctrl+B)"

#### 5. Additional Useful Shortcuts

**Standard Shortcuts to Add**:
- `Ctrl+O`: Open XML file
- `Ctrl+S`: Save results (when results are visible)
- `F5`: Start processing (refresh/retry)
- `Ctrl+,`: Open Settings
- `Ctrl+Q`: Quit application
- `F1`: Help/About

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Implementation**:
```python
def create_keyboard_shortcuts(self):
    """Create all keyboard shortcuts"""
    shortcuts = {
        "Ctrl+O": self.on_open_file,
        "Ctrl+S": self.on_save_results,
        "F5": self.start_processing,
        "Ctrl+,": self.on_open_settings,
        "Ctrl+Q": self.close,
        "F1": self.show_help,
        "Return": self._on_enter_start,
        "Escape": self._on_escape_cancel,
    }
    # Create QShortcut for each
```

### Testing Requirements

- [ ] Tab navigation works through all controls in logical order
- [ ] Enter key starts processing when button is enabled
- [ ] Escape key cancels processing when active
- [ ] All shortcuts work as expected
- [ ] Tooltips display shortcuts correctly
- [ ] Focus indicators are visible
- [ ] Shortcuts don't conflict with system shortcuts

### Success Criteria

- Users can navigate entire application with keyboard only
- All major actions have keyboard shortcuts
- Shortcuts are discoverable through tooltips
- Keyboard navigation is intuitive and efficient

---

## Substep 6.8.4: Confirmation Dialogs

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Add confirmation dialogs for critical actions to prevent accidental operations.

### Implementation Details

#### 1. "Are You Sure?" Before Canceling Long-Running Operations

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Show confirmation dialog when cancel is clicked during processing
- Only show if processing has been running for more than 5 seconds
- Display progress information in confirmation
- Options: "Yes, Cancel" and "No, Continue"

**Confirmation Dialog**:
```
┌─────────────────────────────────────┐
│  Cancel Processing?                 │
├─────────────────────────────────────┤
│  Processing is in progress:         │
│                                     │
│  Current: Track 45/120              │
│  Progress: 37%                      │
│  Elapsed: 2m 15s                    │
│                                     │
│  Are you sure you want to cancel?   │
│  All progress will be lost.          │
│                                     │
│  [No, Continue]  [Yes, Cancel]     │
└─────────────────────────────────────┘
```

**Implementation**:
```python
def on_cancel_requested(self) -> None:
    """Handle cancel with confirmation"""
    if self.controller.is_processing():
        # Check if processing has been running for a while
        if self._processing_start_time and \
           (time.time() - self._processing_start_time) > 5:
            # Show confirmation
            reply = QMessageBox.question(
                self,
                "Cancel Processing?",
                "Processing is in progress. Are you sure you want to cancel?\n"
                "All progress will be lost.",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            if reply == QMessageBox.No:
                return
        
        # Proceed with cancellation
        self._perform_cancel()
```

#### 2. Summary Before Starting Batch Processing

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Show summary dialog before starting batch processing
- Display list of playlists to be processed
- Show estimated time (if available)
- Options: "Cancel" and "Start Processing"

**Batch Summary Dialog**:
```
┌─────────────────────────────────────┐
│  Start Batch Processing?            │
├─────────────────────────────────────┤
│  You are about to process:           │
│                                     │
│  Playlists (5):                     │
│  • My Playlist 1 (45 tracks)        │
│  • My Playlist 2 (32 tracks)        │
│  • My Playlist 3 (67 tracks)        │
│  • My Playlist 4 (23 tracks)        │
│  • My Playlist 5 (89 tracks)        │
│                                     │
│  Total Tracks: 256                  │
│  Estimated Time: ~15-20 minutes     │
│                                     │
│  [Cancel]  [Start Processing]        │
└─────────────────────────────────────┘
```

**Implementation**:
```python
def start_processing(self) -> None:
    """Start processing with confirmation for batch mode"""
    if self.batch_mode_radio.isChecked():
        # Show batch confirmation
        playlists = self.batch_processor.get_selected_playlists()
        total_tracks = sum(p.get('track_count', 0) for p in playlists)
        
        reply = self._show_batch_confirmation(playlists, total_tracks)
        if reply != QMessageBox.Yes:
            return
    
    # Proceed with processing
    self._perform_start_processing()
```

#### 3. Optional: Confirmation for File Replacement

**File**: `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)

**Changes**:
- If file already exists when saving results, ask for confirmation
- "File exists. Overwrite?" dialog

### Testing Requirements

- [ ] Cancel confirmation appears for long-running operations
- [ ] Cancel confirmation can be dismissed
- [ ] Batch processing shows summary before starting
- [ ] Batch summary shows correct playlist information
- [ ] Confirmation dialogs are non-intrusive
- [ ] Users can proceed or cancel from confirmations

### Success Criteria

- Users are protected from accidental cancellations
- Batch processing starts with full awareness of scope
- Confirmation dialogs provide useful information
- Confirmations don't interrupt workflow unnecessarily

---

## Substep 6.8.5: Enhanced Progress Visualization

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Improve progress feedback with better time estimates, percentage display, and status bar integration.

### Implementation Details

#### 1. Refine Estimated Time Remaining Accuracy

**File**: `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)

**Changes**:
- Improve time estimation algorithm
- Use moving average of recent track processing times
- Account for varying track complexity
- Show confidence indicator (e.g., "~5-7 minutes")

**Time Estimation Algorithm**:
```python
def _calculate_remaining_time(self, progress_info):
    """Calculate remaining time with improved accuracy"""
    if progress_info.completed_tracks < 3:
        # Not enough data, use default estimate
        return None
    
    # Calculate average time per track from recent tracks
    recent_times = self._get_recent_track_times()
    avg_time_per_track = sum(recent_times) / len(recent_times)
    
    remaining_tracks = progress_info.total_tracks - progress_info.completed_tracks
    estimated_seconds = remaining_tracks * avg_time_per_track
    
    # Add confidence range (±20%)
    return {
        'min': estimated_seconds * 0.8,
        'max': estimated_seconds * 1.2,
        'avg': estimated_seconds
    }
```

**Display Format**:
- "~5-7 minutes remaining" (with range)
- "~2 minutes remaining" (when confident)
- "Calculating..." (when insufficient data)

#### 2. Percentage Complete Display

**File**: `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)

**Changes**:
- Add percentage display next to progress bar
- Show both overall percentage and current track progress
- Format: "45% (54/120 tracks)"

**Visual Layout**:
```
Progress: [████████░░░░░░░░░░] 45% (54/120 tracks)
```

**Implementation**:
```python
# Add percentage label
self.percentage_label = QLabel("0%")
self.percentage_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #ffffff;")

def update_progress(self, progress_info):
    """Update progress with percentage"""
    percentage = (progress_info.completed_tracks / progress_info.total_tracks) * 100
    self.percentage_label.setText(
        f"{percentage:.0f}% ({progress_info.completed_tracks}/{progress_info.total_tracks} tracks)"
    )
```

#### 3. Mini Progress Bar in Status Bar

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Add small progress bar to status bar during processing
- Show percentage and current track
- Update in real-time
- Hide when processing is complete

**Status Bar Layout**:
```
[Ready] | [████░░░░] 45% - Track 54/120
```

**Implementation**:
```python
def create_status_bar(self):
    """Create status bar with progress indicator"""
    self.statusBar().showMessage("Ready")
    
    # Add permanent widget for progress
    self.status_progress = QProgressBar()
    self.status_progress.setMaximumWidth(200)
    self.status_progress.setVisible(False)
    self.statusBar().addPermanentWidget(self.status_progress)

def on_progress_updated(self, progress_info):
    """Update status bar progress"""
    if self.controller.is_processing():
        percentage = (progress_info.completed_tracks / progress_info.total_tracks) * 100
        self.status_progress.setValue(int(percentage))
        self.status_progress.setVisible(True)
        self.statusBar().showMessage(
            f"Processing: {progress_info.completed_tracks}/{progress_info.total_tracks} tracks"
        )
    else:
        self.status_progress.setVisible(False)
```

### Testing Requirements

- [ ] Time estimates are reasonably accurate
- [ ] Percentage display updates correctly
- [ ] Status bar progress bar appears during processing
- [ ] Status bar progress bar hides when complete
- [ ] All progress indicators are synchronized
- [ ] Progress updates don't cause performance issues

### Success Criteria

- Users have clear understanding of progress
- Time estimates are helpful and reasonably accurate
- Multiple progress indicators provide redundancy
- Progress updates are smooth and responsive

---

## Implementation Order

```
6.8.3 (Keyboard Shortcuts) - Foundation for navigation
  ↓
6.8.1 (Recent Files) - Quick access improvement
  ↓
6.8.2 (Drag & Drop) - Visual feedback
  ↓
6.8.4 (Confirmation Dialogs) - Safety features
  ↓
6.8.5 (Progress Visualization) - Feedback enhancement
```

---

## Files to Create

- `SRC/cuepoint/ui/utils/recent_files.py` (NEW)

## Files to Modify

- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/file_selector.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/progress_widget.py` (MODIFY)

---

## Testing Checklist

### Functional Testing
- [ ] Recent files menu works correctly
- [ ] Drag & drop visual feedback is clear
- [ ] All keyboard shortcuts function properly
- [ ] Confirmation dialogs appear at appropriate times
- [ ] Progress indicators are accurate and responsive

### User Experience Testing
- [ ] Workflow feels smoother with recent files
- [ ] Drag & drop is intuitive
- [ ] Keyboard navigation is efficient
- [ ] Confirmations prevent accidents without being annoying
- [ ] Progress feedback is helpful

### Error Handling Testing
- [ ] Invalid recent files are handled gracefully
- [ ] Keyboard shortcuts don't conflict
- [ ] Progress calculations handle edge cases
- [ ] Confirmation dialogs handle cancellation properly

---

## Success Criteria

- ✅ Users can access recent files quickly
- ✅ Drag & drop provides clear visual feedback
- ✅ Full keyboard navigation is possible
- ✅ Critical actions require confirmation
- ✅ Progress feedback is accurate and helpful
- ✅ Overall user experience is significantly improved

---

**Next Step**: Step 6.9 - Information & Help Improvements

