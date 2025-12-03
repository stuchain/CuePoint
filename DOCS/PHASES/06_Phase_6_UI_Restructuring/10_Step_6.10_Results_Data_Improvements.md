# Step 6.10: Results & Data Improvements

**Status**: 📝 Planned  
**Duration**: 2-3 weeks  
**Dependencies**: Steps 6.1-6.9 (Core UI, UX, and Help Improvements)

## Goal

Enhance the results view, history management, and batch processing with better data visualization, filtering, and export capabilities.

## Overview

This step focuses on improving how users interact with results and historical data:
- Enhanced results view with sorting, filtering, and export
- Improved history/past searches with search and filtering
- Better batch operations with progress tracking
- Preview capabilities for Beatport tracks

---

## Substep 6.10.1: Enhanced Results View

**Duration**: 1 week  
**Priority**: High

### Goal

Make the results view more powerful and user-friendly with sorting, filtering, search, and multiple export options.

### Implementation Details

#### 1. Sortable Columns

**File**: `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)

**Changes**:
- Enable column sorting on all sortable columns
- Visual indicators for sort direction (↑ ↓)
- Remember sort preferences per session
- Support multi-column sorting (optional)

**Sortable Columns**:
- Track Title
- Artist
- Match Score
- Confidence
- BPM
- Key
- Year
- Title Similarity
- Artist Similarity

**Implementation**:
```python
def setup_table(self):
    """Setup results table with sortable columns"""
    self.table.setSortingEnabled(True)
    
    # Set default sort column
    self.table.sortItems(2, Qt.DescendingOrder)  # Sort by score
    
    # Connect sort signal to update display
    self.table.horizontalHeader().sectionClicked.connect(self.on_column_sorted)

def on_column_sorted(self, column: int):
    """Handle column sorting"""
    # Update sort indicator
    # Refresh display if needed
    pass
```

**Visual Indicators**:
- Arrow icons in column headers
- Highlight sorted column
- Show sort order (1, 2, 3 for multi-column)

#### 2. Filter/Search Within Results

**File**: `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)

**Changes**:
- Add search/filter bar above results table
- Filter by multiple criteria simultaneously
- Real-time filtering as user types
- Clear filters button
- Save filter presets (optional)

**Filter Options**:
- Text search (title, artist, label)
- Match status (Matched/Unmatched/Review Needed)
- Confidence level (High/Medium/Low)
- Score range (slider or input)
- BPM range
- Key filter

**Filter Bar Layout**:
```
┌─────────────────────────────────────┐
│  Search: [____________]  [Clear]    │
│  Filter: [All ▼] [Matched ▼] [High ▼]│
│  Score: [0] ──────●────── [100]     │
└─────────────────────────────────────┘
```

**Implementation**:
```python
def create_filter_bar(self):
    """Create filter/search bar"""
    filter_layout = QHBoxLayout()
    
    # Search input
    self.search_input = QLineEdit()
    self.search_input.setPlaceholderText("Search tracks...")
    self.search_input.textChanged.connect(self.apply_filters)
    
    # Filter dropdowns
    self.status_filter = QComboBox()
    self.status_filter.addItems(["All", "Matched", "Unmatched", "Review Needed"])
    self.status_filter.currentTextChanged.connect(self.apply_filters)
    
    # Score range slider
    self.score_slider = QSlider(Qt.Horizontal)
    self.score_slider.setRange(0, 100)
    self.score_slider.valueChanged.connect(self.apply_filters)
    
    filter_layout.addWidget(QLabel("Search:"))
    filter_layout.addWidget(self.search_input)
    filter_layout.addWidget(self.status_filter)
    filter_layout.addWidget(self.score_slider)
    filter_layout.addWidget(QPushButton("Clear"))
    
    return filter_layout

def apply_filters(self):
    """Apply filters to results table"""
    search_text = self.search_input.text().lower()
    status = self.status_filter.currentText()
    min_score = self.score_slider.value()
    
    # Filter results
    filtered_results = [
        r for r in self.results
        if self._matches_filter(r, search_text, status, min_score)
    ]
    
    # Update table
    self._display_results(filtered_results)
```

#### 3. Export Options (CSV, Excel, JSON)

**File**: `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)  
**File**: `SRC/cuepoint/services/export_service.py` (NEW or MODIFY)

**Changes**:
- Add export menu/button in results view
- Support multiple export formats
- Export filtered results or all results
- Remember last export location
- Show export progress

**Export Menu**:
```
[Export ▼]
  ├── Export as CSV...
  ├── Export as Excel...
  ├── Export as JSON...
  └── Export Options...
```

**Export Options Dialog**:
```
┌─────────────────────────────────────┐
│  Export Options                     │
├─────────────────────────────────────┤
│  Format: [CSV ▼]                   │
│  Scope:  [○] All Results            │
│          [●] Filtered Results        │
│                                     │
│  Include:                           │
│  [✓] Original track info            │
│  [✓] Beatport match info            │
│  [✓] Similarity scores              │
│  [ ] Raw API data                   │
│                                     │
│  [Cancel]  [Export]                 │
└─────────────────────────────────────┘
```

**Implementation**:
```python
class ExportService:
    """Service for exporting results in various formats"""
    
    def export_csv(self, results: List[TrackResult], file_path: str, options: dict):
        """Export results as CSV"""
        # Implementation using csv module
    
    def export_excel(self, results: List[TrackResult], file_path: str, options: dict):
        """Export results as Excel"""
        # Implementation using openpyxl or xlsxwriter
    
    def export_json(self, results: List[TrackResult], file_path: str, options: dict):
        """Export results as JSON"""
        # Implementation using json module
```

**Export Features**:
- Include/exclude specific columns
- Export filtered results only
- Custom file naming
- Progress indicator for large exports
- Error handling for file write failures

#### 4. Preview Beatport Tracks Before Selection

**File**: `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)  
**File**: `SRC/cuepoint/ui/dialogs/track_preview_dialog.py` (NEW)

**Changes**:
- Add "Preview" button/action for each candidate
- Open preview dialog with track details
- Show Beatport track information
- Display cover art if available
- Allow selection from preview dialog

**Preview Dialog**:
```
┌─────────────────────────────────────┐
│  Track Preview                      │
├─────────────────────────────────────┤
│  [Cover Art]                        │
│                                     │
│  Title: Example Track               │
│  Artist: Example Artist             │
│  Label: Example Records             │
│  Key: 5A (A Minor)                  │
│  BPM: 128                           │
│  Year: 2023                         │
│                                     │
│  Match Score: 92                    │
│  Title Similarity: 95%               │
│  Artist Similarity: 89%             │
│                                     │
│  [Open on Beatport]  [Select] [Cancel]│
└─────────────────────────────────────┘
```

**Implementation**:
```python
class TrackPreviewDialog(QDialog):
    """Dialog for previewing Beatport track details"""
    
    def __init__(self, track_result: TrackResult, parent=None):
        super().__init__(parent)
        self.track_result = track_result
        self.setup_ui()
    
    def setup_ui(self):
        """Setup preview dialog UI"""
        layout = QVBoxLayout(self)
        
        # Cover art (if available)
        if self.track_result.cover_art_url:
            cover_label = QLabel()
            cover_label.setPixmap(self._load_cover_art())
            layout.addWidget(cover_label)
        
        # Track information
        info_layout = QFormLayout()
        info_layout.addRow("Title:", QLabel(self.track_result.beatport_title))
        info_layout.addRow("Artist:", QLabel(self.track_result.beatport_artists))
        # ... more fields
        
        layout.addLayout(info_layout)
        
        # Buttons
        button_box = QDialogButtonBox(
            QDialogButtonBox.Open | QDialogButtonBox.Ok | QDialogButtonBox.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)
```

**Preview Features**:
- Load cover art from URL
- Display all track metadata
- Link to Beatport page
- Select track from preview
- Compare multiple candidates side-by-side

### Testing Requirements

- [ ] All columns are sortable
- [ ] Sort indicators show correctly
- [ ] Filter/search works in real-time
- [ ] Multiple filters can be applied simultaneously
- [ ] Export works for all formats
- [ ] Preview dialog shows correct information
- [ ] Cover art loads correctly
- [ ] Export handles large datasets efficiently

### Success Criteria

- Users can easily find tracks in results
- Results can be sorted by any column
- Multiple export formats are available
- Track preview helps users make informed decisions
- Export process is smooth and reliable

---

## Substep 6.10.2: Enhanced History/Past Searches

**Duration**: 1 week  
**Priority**: Medium

### Goal

Improve the past searches/history view with search, filtering, timestamps, and quick re-run capabilities.

### Implementation Details

#### 1. Search/Filter Past Results

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)

**Changes**:
- Add search bar for past searches
- Filter by date range, playlist name, match status
- Real-time filtering
- Clear filters button

**Filter Options**:
- Text search (playlist name, track title, artist)
- Date range picker
- Match status filter
- File path filter

**Filter Bar**:
```
┌─────────────────────────────────────┐
│  Search: [____________]  [Clear]   │
│  Date: [From: ___] [To: ___]       │
│  Status: [All ▼] [Matched ▼]       │
└─────────────────────────────────────┘
```

**Implementation**:
```python
def create_filter_bar(self):
    """Create filter bar for history view"""
    filter_layout = QHBoxLayout()
    
    # Search input
    self.search_input = QLineEdit()
    self.search_input.setPlaceholderText("Search history...")
    self.search_input.textChanged.connect(self.apply_history_filters)
    
    # Date range
    self.date_from = QDateEdit()
    self.date_from.setCalendarPopup(True)
    self.date_from.dateChanged.connect(self.apply_history_filters)
    
    self.date_to = QDateEdit()
    self.date_to.setCalendarPopup(True)
    self.date_to.dateChanged.connect(self.apply_history_filters)
    
    # Status filter
    self.status_filter = QComboBox()
    self.status_filter.addItems(["All", "Matched", "Unmatched"])
    self.status_filter.currentTextChanged.connect(self.apply_history_filters)
    
    filter_layout.addWidget(QLabel("Search:"))
    filter_layout.addWidget(self.search_input)
    filter_layout.addWidget(QLabel("From:"))
    filter_layout.addWidget(self.date_from)
    filter_layout.addWidget(QLabel("To:"))
    filter_layout.addWidget(self.date_to)
    filter_layout.addWidget(self.status_filter)
    
    return filter_layout

def apply_history_filters(self):
    """Apply filters to history table"""
    search_text = self.search_input.text().lower()
    date_from = self.date_from.date()
    date_to = self.date_to.date()
    status = self.status_filter.currentText()
    
    # Filter history rows
    filtered = [
        row for row in self.csv_rows
        if self._matches_history_filter(row, search_text, date_from, date_to, status)
    ]
    
    # Update display
    self._display_filtered_history(filtered)
```

#### 2. Date/Time Stamps

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)  
**File**: `SRC/cuepoint/services/output_writer.py` (MODIFY)

**Changes**:
- Add timestamp column to history table
- Display processing date and time
- Sort by date (newest first by default)
- Show relative time (e.g., "2 hours ago")

**Timestamp Column**:
- Processing Date/Time
- Format: "2024-01-15 14:30:25" or "Today, 2:30 PM"
- Relative: "2 hours ago", "Yesterday", "3 days ago"

**Implementation**:
```python
def add_timestamp_column(self):
    """Add timestamp column to history table"""
    self.table.insertColumn(0)  # Insert at beginning
    self.table.setHorizontalHeaderItem(0, QTableWidgetItem("Date/Time"))
    
    # Format timestamps
    for row, csv_row in enumerate(self.csv_rows):
        timestamp = csv_row.get('processing_timestamp', '')
        if timestamp:
            # Format as relative time
            formatted = self._format_relative_time(timestamp)
        else:
            formatted = "Unknown"
        
        item = QTableWidgetItem(formatted)
        self.table.setItem(row, 0, item)

def _format_relative_time(self, timestamp: str) -> str:
    """Format timestamp as relative time"""
    # Parse timestamp
    dt = datetime.fromisoformat(timestamp)
    now = datetime.now()
    diff = now - dt
    
    if diff.days == 0:
        if diff.seconds < 3600:
            minutes = diff.seconds // 60
            return f"{minutes} minutes ago"
        else:
            hours = diff.seconds // 3600
            return f"{hours} hours ago"
    elif diff.days == 1:
        return "Yesterday"
    else:
        return f"{diff.days} days ago"
```

**CSV Timestamp Storage**:
- Add `processing_timestamp` column to CSV files
- Store ISO format: "2024-01-15T14:30:25"
- Include timezone if available

#### 3. Quick Re-run from History

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)  
**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

**Changes**:
- Add "Re-run" button/action for each history entry
- Load original XML file and playlist
- Navigate to main tab with pre-filled selections
- Start processing automatically (optional)

**Re-run Flow**:
1. User clicks "Re-run" on history entry
2. Load original XML file path
3. Load original playlist name
4. Navigate to main tab
5. Pre-fill file selector and playlist selector
6. Enable "Start Processing" button
7. User can review and start processing

**Implementation**:
```python
def add_rerun_action(self):
    """Add re-run action to history table"""
    rerun_action = QAction("Re-run Processing", self)
    rerun_action.triggered.connect(self.on_rerun_processing)
    
    # Add to context menu or toolbar
    self.table.addAction(rerun_action)

def on_rerun_processing(self):
    """Handle re-run request"""
    selected_row = self.table.currentRow()
    if selected_row < 0:
        return
    
    csv_row = self.csv_rows[selected_row]
    
    # Get original file and playlist
    xml_path = csv_row.get('xml_file_path', '')
    playlist_name = csv_row.get('playlist_name', '')
    
    if not xml_path or not os.path.exists(xml_path):
        QMessageBox.warning(
            self,
            "File Not Found",
            f"The original XML file could not be found:\n{xml_path}"
        )
        return
    
    # Emit signal to main window
    self.rerun_requested.emit(xml_path, playlist_name)
```

**Main Window Integration**:
```python
def on_rerun_requested(self, xml_path: str, playlist_name: str):
    """Handle re-run request from history view"""
    # Load XML file
    self.file_selector.set_file(xml_path)
    self.on_file_selected(xml_path)
    
    # Select playlist
    self.playlist_selector.set_selected_playlist(playlist_name)
    self.on_playlist_selected(playlist_name)
    
    # Navigate to main tab
    self.tabs.setCurrentIndex(0)
    
    # Focus on start button (user can review and start)
    self.start_button.setFocus()
```

### Testing Requirements

- [ ] Search/filter works for history entries
- [ ] Date range filtering works correctly
- [ ] Timestamps display correctly
- [ ] Relative time formatting is accurate
- [ ] Re-run loads correct file and playlist
- [ ] Re-run handles missing files gracefully
- [ ] History table updates after filtering

### Success Criteria

- Users can quickly find past searches
- Timestamps help users identify when processing occurred
- Re-run functionality saves time for repeated processing
- History view is efficient and user-friendly

---

## Substep 6.10.3: Enhanced Batch Operations

**Duration**: 1 week  
**Priority**: Medium

### Goal

Improve batch processing with better playlist selection, per-playlist progress tracking, and comprehensive batch results summary.

### Implementation Details

#### 1. Select Multiple Playlists with Checkboxes

**File**: `SRC/cuepoint/ui/widgets/batch_processor.py` (MODIFY)

**Changes**:
- Replace single selection with checkbox list
- Select all/none buttons
- Show track count for each playlist
- Visual indication of selected playlists

**Playlist Selection UI**:
```
┌─────────────────────────────────────┐
│  Batch Processing                  │
├─────────────────────────────────────┤
│  [✓] Select All  [ ] Clear All     │
│                                     │
│  [✓] My Playlist 1 (45 tracks)      │
│  [✓] My Playlist 2 (32 tracks)     │
│  [ ] My Playlist 3 (67 tracks)      │
│  [✓] My Playlist 4 (23 tracks)      │
│  [ ] My Playlist 5 (89 tracks)      │
│                                     │
│  Selected: 3 playlists, 100 tracks │
│  [Start Batch Processing]           │
└─────────────────────────────────────┘
```

**Implementation**:
```python
def create_playlist_list(self):
    """Create checkbox list of playlists"""
    self.playlist_list = QListWidget()
    self.playlist_list.setSelectionMode(QAbstractItemView.NoSelection)
    
    for playlist_name, track_count in self.playlists.items():
        item = QListWidgetItem()
        checkbox = QCheckBox(f"{playlist_name} ({track_count} tracks)")
        checkbox.stateChanged.connect(self.on_playlist_toggled)
        self.playlist_list.setItemWidget(item, checkbox)
        self.playlist_list.addItem(item)
    
    return self.playlist_list

def on_playlist_toggled(self):
    """Update selected playlists count"""
    selected = self.get_selected_playlists()
    total_tracks = sum(p['track_count'] for p in selected)
    self.summary_label.setText(
        f"Selected: {len(selected)} playlists, {total_tracks} tracks"
    )
```

#### 2. Progress Per Playlist in Batch Mode

**File**: `SRC/cuepoint/ui/widgets/batch_processor.py` (MODIFY)

**Changes**:
- Show progress for each playlist individually
- Display current playlist being processed
- Show completed/failed playlists
- Overall batch progress indicator

**Batch Progress Display**:
```
┌─────────────────────────────────────┐
│  Batch Processing Progress          │
├─────────────────────────────────────┤
│  Overall: [████████░░] 60% (3/5)    │
│                                     │
│  ✓ My Playlist 1 - Complete         │
│  ✓ My Playlist 2 - Complete         │
│  → My Playlist 3 - Processing...    │
│     [████████░░░░] 45% (23/51)      │
│  ⏳ My Playlist 4 - Pending         │
│  ⏳ My Playlist 5 - Pending         │
└─────────────────────────────────────┘
```

**Implementation**:
```python
def create_batch_progress_view(self):
    """Create progress view for batch processing"""
    self.progress_widgets = {}
    
    for playlist_name in self.playlists.keys():
        widget = QWidget()
        layout = QVBoxLayout(widget)
        
        # Playlist name and status
        status_label = QLabel(f"{playlist_name} - Pending")
        layout.addWidget(status_label)
        
        # Progress bar
        progress_bar = QProgressBar()
        progress_bar.setValue(0)
        layout.addWidget(progress_bar)
        
        self.progress_widgets[playlist_name] = {
            'widget': widget,
            'status_label': status_label,
            'progress_bar': progress_bar
        }
    
    return self.progress_widgets

def update_playlist_progress(self, playlist_name: str, progress: int, status: str):
    """Update progress for specific playlist"""
    if playlist_name in self.progress_widgets:
        widget_info = self.progress_widgets[playlist_name]
        widget_info['progress_bar'].setValue(progress)
        widget_info['status_label'].setText(f"{playlist_name} - {status}")
```

#### 3. Summary of All Batch Results

**File**: `SRC/cuepoint/ui/widgets/batch_processor.py` (MODIFY)

**Changes**:
- Show comprehensive summary after batch completion
- Aggregate statistics across all playlists
- Individual playlist results
- Export batch summary

**Batch Summary Dialog**:
```
┌─────────────────────────────────────┐
│  Batch Processing Complete          │
├─────────────────────────────────────┤
│  Summary:                           │
│  • Total Playlists: 5               │
│  • Total Tracks: 256                │
│  • Matched: 198 (77%)               │
│  • Unmatched: 58 (23%)              │
│  • Processing Time: 15m 32s         │
│                                     │
│  Per Playlist:                      │
│  ✓ My Playlist 1: 38/45 (84%)      │
│  ✓ My Playlist 2: 25/32 (78%)      │
│  ✓ My Playlist 3: 45/67 (67%)      │
│  ✓ My Playlist 4: 20/23 (87%)      │
│  ✓ My Playlist 5: 70/89 (79%)      │
│                                     │
│  [View Results]  [Export Summary]  │
│  [Close]                            │
└─────────────────────────────────────┘
```

**Implementation**:
```python
def show_batch_summary(self, results: Dict[str, List[TrackResult]]):
    """Show batch processing summary"""
    summary_dialog = QDialog(self)
    layout = QVBoxLayout(summary_dialog)
    
    # Overall statistics
    total_playlists = len(results)
    total_tracks = sum(len(r) for r in results.values())
    total_matched = sum(sum(1 for t in r if t.matched) for r in results.values())
    
    summary_text = f"""
    Summary:
    • Total Playlists: {total_playlists}
    • Total Tracks: {total_tracks}
    • Matched: {total_matched} ({total_matched/total_tracks*100:.0f}%)
    • Unmatched: {total_tracks - total_matched} ({100-total_matched/total_tracks*100:.0f}%)
    """
    
    # Per-playlist breakdown
    playlist_list = QListWidget()
    for playlist_name, playlist_results in results.items():
        matched = sum(1 for r in playlist_results if r.matched)
        total = len(playlist_results)
        item_text = f"{playlist_name}: {matched}/{total} ({matched/total*100:.0f}%)"
        playlist_list.addItem(item_text)
    
    layout.addWidget(QLabel(summary_text))
    layout.addWidget(QLabel("Per Playlist:"))
    layout.addWidget(playlist_list)
    
    # Buttons
    button_box = QDialogButtonBox(
        QDialogButtonBox.Ok | QDialogButtonBox.Save
    )
    button_box.accepted.connect(summary_dialog.accept)
    button_box.button(QDialogButtonBox.Save).setText("Export Summary")
    button_box.button(QDialogButtonBox.Save).clicked.connect(self.export_batch_summary)
    layout.addWidget(button_box)
    
    summary_dialog.exec()
```

### Testing Requirements

- [ ] Multiple playlists can be selected
- [ ] Select all/none works correctly
- [ ] Per-playlist progress displays correctly
- [ ] Batch summary shows accurate statistics
- [ ] Batch summary can be exported
- [ ] Failed playlists are handled gracefully
- [ ] Batch processing can be cancelled

### Success Criteria

- Users can easily select multiple playlists
- Progress is clear for each playlist
- Batch summary provides comprehensive overview
- Batch operations are efficient and reliable

---

## Implementation Order

```
6.10.1 (Enhanced Results View) - High priority, affects daily usage
  ↓
6.10.2 (Enhanced History) - Medium priority, improves workflow
  ↓
6.10.3 (Enhanced Batch Operations) - Medium priority, batch processing
```

---

## Files to Create

- `SRC/cuepoint/services/export_service.py` (NEW)
- `SRC/cuepoint/ui/dialogs/track_preview_dialog.py` (NEW)

## Files to Modify

- `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/batch_processor.py` (MODIFY)
- `SRC/cuepoint/services/output_writer.py` (MODIFY)
- `SRC/cuepoint/ui/main_window.py` (MODIFY)

---

## Testing Checklist

### Functional Testing
- [ ] Results view sorting works correctly
- [ ] Filter/search functions properly
- [ ] Export works for all formats
- [ ] Track preview displays correctly
- [ ] History search/filter works
- [ ] Timestamps display correctly
- [ ] Re-run functionality works
- [ ] Batch selection works correctly
- [ ] Batch progress displays correctly
- [ ] Batch summary is accurate

### User Experience Testing
- [ ] Results are easy to navigate
- [ ] Filtering is intuitive
- [ ] Export process is smooth
- [ ] History is easy to search
- [ ] Batch operations are clear
- [ ] Progress feedback is helpful

### Performance Testing
- [ ] Large result sets don't slow down UI
- [ ] Filtering is fast and responsive
- [ ] Export handles large datasets efficiently
- [ ] History loading is fast

---

## Success Criteria

- ✅ Results view is powerful and user-friendly
- ✅ History is searchable and filterable
- ✅ Batch operations are efficient and clear
- ✅ Export options meet user needs
- ✅ Overall data management is significantly improved

---

**Next Step**: Step 6.11 - Organization & Navigation Improvements

