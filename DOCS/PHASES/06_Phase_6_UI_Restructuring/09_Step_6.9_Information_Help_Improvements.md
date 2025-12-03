# Step 6.9: Information & Help Improvements

**Status**: 📝 Planned  
**Duration**: 1-2 weeks  
**Dependencies**: Steps 6.1-6.8 (Core UI and UX Improvements)

## Goal

Enhance user understanding and support through contextual help, better error messages, and informative status displays.

## Overview

This step focuses on making the application more informative and user-friendly through:
- Contextual help buttons and expandable help sections
- Clear, actionable error messages
- Comprehensive status bar information
- First-time user guidance

---

## Substep 6.9.1: Contextual Help System

**Duration**: 3-4 days  
**Priority**: Medium

### Goal

Provide contextual help where users need it most, without cluttering the interface.

### Implementation Details

#### 1. "?" Buttons Next to Complex Options

**File**: `SRC/cuepoint/ui/widgets/config_panel.py` (MODIFY)  
**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Add small "?" help buttons next to complex settings
- Position: Right side of labels or next to controls
- Style: Small, unobtrusive, matches info button style
- Click opens contextual help tooltip or dialog

**Help Button Placement**:
```
Performance Preset [?]
[○] Balanced  [○] Fast  [○] Turbo  [○] Exhaustive

Auto-research unmatched tracks [?]
[✓]

Verbose Logging [?]
[ ]
```

**Implementation**:
```python
def create_help_button(self, help_text: str, parent=None) -> QPushButton:
    """Create a help button with tooltip"""
    help_btn = QPushButton("?")
    help_btn.setMaximumSize(20, 20)
    help_btn.setStyleSheet(
        """
        QPushButton {
            border: none;
            background-color: transparent;
            color: #0078d4;
            font-weight: bold;
            border-radius: 10px;
        }
        QPushButton:hover {
            background-color: rgba(0, 120, 212, 0.1);
        }
        """
    )
    help_btn.setToolTip(help_text)
    help_btn.clicked.connect(lambda: self._show_help_dialog(help_text))
    return help_btn
```

**Help Content Examples**:
- **Performance Preset**: "Choose processing speed vs accuracy. Balanced is recommended for most users."
- **Auto-research**: "Automatically search for better matches when initial match quality is low."
- **Verbose Logging**: "Enable detailed logging for debugging. May slow down processing slightly."

#### 2. Expandable Help Sections in Settings

**File**: `SRC/cuepoint/ui/widgets/config_panel.py` (MODIFY)

**Changes**:
- Add "Show Help" button/toggle in settings
- Expandable sections with detailed explanations
- Collapsible help panels that don't take space when closed
- Rich text formatting for better readability

**Help Section Layout**:
```
┌─────────────────────────────────────┐
│  Advanced Settings        [Show Help]│
├─────────────────────────────────────┤
│  Performance Preset                 │
│  [○] Balanced  [○] Fast  ...        │
│                                     │
│  ▼ Help: Performance Presets        │
│  ─────────────────────────────────  │
│  • Balanced: Good speed/accuracy    │
│    Recommended for most users       │
│  • Fast: Quick processing, may     │
│    miss some matches                │
│  • Turbo: Very fast, lower accuracy│
│  • Exhaustive: Slow but thorough    │
└─────────────────────────────────────┘
```

**Implementation**:
```python
class ExpandableHelpSection(QWidget):
    """Expandable help section widget"""
    
    def __init__(self, title: str, content: str, parent=None):
        super().__init__(parent)
        self.setup_ui(title, content)
    
    def setup_ui(self, title: str, content: str):
        """Setup expandable help UI"""
        layout = QVBoxLayout(self)
        
        # Toggle button
        self.toggle_btn = QPushButton(f"▼ {title}")
        self.toggle_btn.clicked.connect(self.toggle)
        
        # Help content (initially hidden)
        self.help_content = QLabel(content)
        self.help_content.setWordWrap(True)
        self.help_content.setVisible(False)
        
        layout.addWidget(self.toggle_btn)
        layout.addWidget(self.help_content)
    
    def toggle(self):
        """Toggle help content visibility"""
        visible = self.help_content.isVisible()
        self.help_content.setVisible(not visible)
        self.toggle_btn.setText(
            f"▼ {self.toggle_btn.text().replace('▼', '').replace('▲', '')}" 
            if visible else 
            f"▲ {self.toggle_btn.text().replace('▼', '').replace('▲', '')}"
        )
```

#### 3. First-Time User Tour/Tooltips

**File**: `SRC/cuepoint/ui/widgets/first_run_tour.py` (NEW)

**Changes**:
- Detect first-time users (check QSettings)
- Show interactive tour on first launch
- Highlight each UI section with tooltips
- Allow users to skip or complete tour
- Remember tour completion status

**Tour Flow**:
1. Welcome dialog: "Welcome to CuePoint! Take a quick tour?"
2. Highlight tool selection page → Tooltip: "Start here to select a tool"
3. Highlight file selector → Tooltip: "Select your Rekordbox XML file"
4. Highlight processing mode → Tooltip: "Choose single or batch processing"
5. Highlight results → Tooltip: "View and manage your results here"
6. Completion: "Tour complete! You're ready to start."

**Implementation**:
```python
class FirstRunTour(QObject):
    """Interactive tour for first-time users"""
    
    def __init__(self, main_window, parent=None):
        super().__init__(parent)
        self.main_window = main_window
        self.settings = QSettings()
        self.current_step = 0
        self.steps = [
            {
                'widget': self.main_window.tool_selection_page,
                'message': 'Start here to select a tool',
                'position': 'top'
            },
            # ... more steps
        ]
    
    def should_show_tour(self) -> bool:
        """Check if tour should be shown"""
        return not self.settings.value("tour_completed", False, type=bool)
    
    def start_tour(self):
        """Start the interactive tour"""
        # Implementation with overlay and tooltips
```

**Tour Features**:
- Overlay with highlighted areas
- Tooltips with explanations
- Next/Previous/Skip buttons
- Progress indicator (Step 1 of 5)
- Can be restarted from Help menu

### Testing Requirements

- [ ] Help buttons appear next to complex options
- [ ] Help tooltips/dialogs show correct information
- [ ] Expandable help sections work correctly
- [ ] First-time tour appears for new users
- [ ] Tour can be skipped or completed
- [ ] Tour completion is remembered
- [ ] Help content is clear and useful

### Success Criteria

- Users can access help where they need it
- Help content is contextual and relevant
- First-time users are guided through the interface
- Help system doesn't clutter the UI

---

## Substep 6.9.2: Better Error Messages

**Duration**: 3-4 days  
**Priority**: High

### Goal

Replace technical error messages with clear, actionable messages that help users resolve issues.

### Implementation Details

#### 1. Clear, Actionable Error Messages

**File**: `SRC/cuepoint/ui/dialogs/error_dialog.py` (NEW or MODIFY)

**Changes**:
- Create structured error message format
- Translate technical errors to user-friendly language
- Provide specific actions users can take
- Use icons and color coding for error severity

**Error Message Structure**:
```
┌─────────────────────────────────────┐
│  ⚠ Error: File Not Found           │
├─────────────────────────────────────┤
│  What went wrong:                   │
│  The XML file you selected could    │
│  not be found. It may have been      │
│  moved or deleted.                  │
│                                     │
│  How to fix:                        │
│  1. Check if the file still exists  │
│  2. Select a different file         │
│  3. Export a new XML from Rekordbox │
│                                     │
│  [OK]  [Select Different File]       │
└─────────────────────────────────────┘
```

**Error Categories**:
- **File Errors**: File not found, invalid format, permission denied
- **Processing Errors**: Network issues, API errors, timeout
- **Validation Errors**: Invalid XML, missing data, corrupted file
- **System Errors**: Out of memory, disk full, permission issues

**Implementation**:
```python
class ErrorDialog(QDialog):
    """User-friendly error dialog"""
    
    ERROR_TYPES = {
        'file_not_found': {
            'title': 'File Not Found',
            'icon': QMessageBox.Warning,
            'what_went_wrong': 'The file you selected could not be found.',
            'how_to_fix': [
                'Check if the file still exists at the specified location',
                'Select a different file',
                'Export a new XML file from Rekordbox'
            ],
            'actions': ['Select Different File', 'OK']
        },
        # ... more error types
    }
    
    def show_error(self, error_type: str, details: dict = None):
        """Show user-friendly error dialog"""
        error_info = self.ERROR_TYPES.get(error_type, self.ERROR_TYPES['generic'])
        # Display error with structured format
```

#### 2. "What Went Wrong" and "How to Fix" Sections

**File**: `SRC/cuepoint/ui/dialogs/error_dialog.py` (MODIFY)

**Changes**:
- Always include "What went wrong" section
- Always include "How to fix" section with numbered steps
- Use simple, non-technical language
- Include relevant file paths or error codes (collapsible)

**Error Dialog Layout**:
```
┌─────────────────────────────────────┐
│  ⚠ Error Title                      │
├─────────────────────────────────────┤
│  What went wrong:                   │
│  [Clear explanation in simple words]│
│                                     │
│  How to fix:                        │
│  1. [First step]                    │
│  2. [Second step]                   │
│  3. [Third step]                    │
│                                     │
│  [Show Technical Details ▼]          │
│  [Action Button]  [OK]              │
└─────────────────────────────────────┘
```

**Technical Details Section** (Collapsible):
- Error code
- Full error message
- Stack trace (for debugging)
- File paths
- Timestamp

#### 3. Links to Documentation (If Available)

**File**: `SRC/cuepoint/ui/dialogs/error_dialog.py` (MODIFY)

**Changes**:
- Add "Learn More" link for common errors
- Link to relevant documentation sections
- Open documentation in browser or help viewer
- Provide search keywords for documentation

**Implementation**:
```python
def add_documentation_link(self, error_type: str):
    """Add documentation link to error dialog"""
    doc_links = {
        'file_not_found': 'https://docs.cuepoint.com/troubleshooting/file-errors',
        'invalid_xml': 'https://docs.cuepoint.com/troubleshooting/xml-format',
        # ... more links
    }
    
    if error_type in doc_links:
        link_label = QLabel(f'<a href="{doc_links[error_type]}">Learn More</a>')
        link_label.setOpenExternalLinks(True)
        # Add to dialog
```

### Testing Requirements

- [ ] Error messages are clear and non-technical
- [ ] "What went wrong" section explains the issue
- [ ] "How to fix" section provides actionable steps
- [ ] Documentation links work correctly
- [ ] Technical details are available but hidden
- [ ] Error dialogs are helpful and not intimidating

### Success Criteria

- Users understand what went wrong
- Users know how to fix the issue
- Error messages reduce support requests
- Technical details are available for advanced users

---

## Substep 6.9.3: Enhanced Status Bar

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Make the status bar more informative by showing current operation, file path, selected playlist, and quick stats.

### Implementation Details

#### 1. Current Operation Display

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Show current operation in status bar
- Update in real-time as user navigates
- Use clear, concise messages

**Status Messages**:
- "Ready" - Initial state
- "Selecting XML file..." - During file selection
- "Processing: Track 45/120" - During processing
- "Processing complete: 95/120 matched" - After completion
- "Loading playlists..." - During XML parsing
- "Saving results..." - During export

**Implementation**:
```python
def update_status(self, message: str, timeout: int = 0):
    """Update status bar message"""
    self.statusBar().showMessage(message, timeout)

def on_file_selected(self, file_path: str):
    """Update status when file is selected"""
    file_name = os.path.basename(file_path)
    self.update_status(f"XML file loaded: {file_name}")

def on_processing_started(self):
    """Update status when processing starts"""
    self.update_status("Processing started...")
```

#### 2. File Path Display

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Show current XML file path in status bar
- Truncate long paths with ellipsis
- Show full path in tooltip
- Update when file changes

**Status Bar Layout**:
```
[Ready] | File: C:\Users\...\Documents\playlist.xml
```

**Implementation**:
```python
def create_status_bar(self):
    """Create status bar with file path display"""
    self.statusBar().showMessage("Ready")
    
    # Permanent widget for file path
    self.file_path_label = QLabel()
    self.file_path_label.setStyleSheet("color: #666;")
    self.statusBar().addPermanentWidget(self.file_path_label)
    
    # Initially hidden
    self.file_path_label.setVisible(False)

def on_file_selected(self, file_path: str):
    """Update file path in status bar"""
    # Truncate path if too long
    display_path = self._truncate_path(file_path, max_length=50)
    self.file_path_label.setText(f"File: {display_path}")
    self.file_path_label.setToolTip(file_path)  # Full path in tooltip
    self.file_path_label.setVisible(True)
```

#### 3. Selected Playlist Display

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Show selected playlist name in status bar
- Update when playlist selection changes
- Show track count if available

**Status Bar Layout**:
```
[Ready] | File: playlist.xml | Playlist: My Playlist (45 tracks)
```

**Implementation**:
```python
def on_playlist_selected(self, playlist_name: str):
    """Update playlist in status bar"""
    # Get track count if available
    track_count = self.playlist_selector.get_track_count(playlist_name)
    playlist_text = f"Playlist: {playlist_name}"
    if track_count:
        playlist_text += f" ({track_count} tracks)"
    
    self.playlist_label.setText(playlist_text)
    self.playlist_label.setVisible(True)
```

#### 4. Quick Stats (Total Tracks, Matched Count)

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Show quick statistics in status bar
- Update during processing
- Show match rate percentage

**Status Bar Layout**:
```
[Processing: 45/120] | Matched: 38 (84%) | File: playlist.xml
```

**Implementation**:
```python
def create_status_bar(self):
    """Create status bar with stats display"""
    # ... existing code ...
    
    # Stats label
    self.stats_label = QLabel()
    self.stats_label.setStyleSheet("color: #4CAF50; font-weight: bold;")
    self.statusBar().addPermanentWidget(self.stats_label)
    self.stats_label.setVisible(False)

def on_progress_updated(self, progress_info):
    """Update stats in status bar"""
    if progress_info.matched_count is not None:
        total = progress_info.total_tracks
        matched = progress_info.matched_count
        percentage = (matched / total * 100) if total > 0 else 0
        self.stats_label.setText(f"Matched: {matched}/{total} ({percentage:.0f}%)")
        self.stats_label.setVisible(True)
```

**Status Bar Organization**:
- Left side: Current operation message
- Right side (permanent widgets): File path | Playlist | Stats | Progress bar

### Testing Requirements

- [ ] Status bar shows current operation
- [ ] File path displays correctly (truncated if needed)
- [ ] Selected playlist shows in status bar
- [ ] Quick stats update during processing
- [ ] Status bar doesn't become cluttered
- [ ] All information is readable and useful

### Success Criteria

- Users always know what the application is doing
- Current file and playlist are visible
- Processing statistics are easily accessible
- Status bar provides valuable information without clutter

---

## Implementation Order

```
6.9.2 (Better Error Messages) - High priority, affects all error handling
  ↓
6.9.3 (Enhanced Status Bar) - Quick win, improves visibility
  ↓
6.9.1 (Contextual Help) - Comprehensive help system
```

---

## Files to Create

- `SRC/cuepoint/ui/widgets/first_run_tour.py` (NEW)
- `SRC/cuepoint/ui/dialogs/error_dialog.py` (NEW or MODIFY)

## Files to Modify

- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/config_panel.py` (MODIFY)

---

## Testing Checklist

### Functional Testing
- [ ] Help buttons appear and work correctly
- [ ] Expandable help sections function properly
- [ ] First-time tour guides users effectively
- [ ] Error messages are clear and actionable
- [ ] Status bar displays all information correctly

### User Experience Testing
- [ ] Help is accessible when needed
- [ ] Error messages help users resolve issues
- [ ] Status bar provides useful information
- [ ] First-time users feel guided
- [ ] Information doesn't overwhelm users

### Error Handling Testing
- [ ] All error types have user-friendly messages
- [ ] Error dialogs handle edge cases
- [ ] Documentation links work correctly
- [ ] Status bar handles missing information gracefully

---

## Success Criteria

- ✅ Users can access help contextually
- ✅ Error messages are clear and actionable
- ✅ Status bar provides comprehensive information
- ✅ First-time users are guided through the interface
- ✅ Overall user understanding is significantly improved

---

**Next Step**: Step 6.10 - Results & Data Improvements

