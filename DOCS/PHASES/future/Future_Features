# Design: Re-Search Progress UI

**Number**: 22  
**Status**: 📝 Planned (Design Only)  
**Priority**: ⚡ P2 - Medium Priority  
**Effort**: 2-3 days  
**Impact**: Medium - User visibility into re-search operations

---

## 1. Overview

### 1.1 Problem Statement

When auto-research is enabled and unmatched tracks are re-searched with enhanced settings, users currently have no visibility into:
- Which tracks are being re-searched
- Progress of the re-search operation
- How many tracks have been re-searched vs. remaining
- Whether re-search found matches for previously unmatched tracks

This information is only available in console output, which is not visible in the GUI application.

### 1.2 Solution Overview

Implement a dedicated UI component that:
1. **Appears automatically** when re-search begins
2. **Displays below the main processing progress box**
3. **Shows list of unmatched tracks** being re-searched
4. **Displays progress** for each track and overall re-search
5. **Updates in real-time** as re-search progresses
6. **Highlights newly matched tracks** when re-search succeeds

---

## 2. Architecture Design

### 2.1 UI Component Placement

```
Main Window
├─ Processing Progress Box (existing)
│  └─ Overall track processing progress
│
└─ Re-Search Progress Box (NEW)
   ├─ Header: "Re-Searching Unmatched Tracks"
   ├─ Overall progress bar
   ├─ Track list with individual progress
   └─ Statistics (matched/unmatched counts)
```

### 2.2 Component Visibility

- **Hidden by default**: Component is not visible initially
- **Shown automatically**: Appears when re-search begins (auto_research=True and unmatched tracks exist)
- **Hidden after completion**: Can be collapsed/hidden after re-search completes
- **Toggle option**: User can manually show/hide the component

### 2.3 Data Flow

```
Backend (processor.py)
  ↓ (emits re-search progress signals)
GUI Controller (gui_controller.py)
  ↓ (forwards signals to GUI)
Re-Search Progress Widget (gui/research_progress_widget.py)
  ↓ (updates UI)
Main Window (gui/main_window.py)
```

---

## 3. Implementation Design

### 3.1 Re-Search Progress Widget

**Location**: `SRC/gui/research_progress_widget.py` (NEW)

**Component Structure**:
```python
class ReSearchProgressWidget(QWidget):
    """Widget for displaying re-search progress"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.unmatched_tracks: List[TrackResult] = []
        self.research_progress: Dict[int, float] = {}  # track_index -> progress (0-100)
        self.research_results: Dict[int, bool] = {}  # track_index -> matched (True/False)
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI components"""
        layout = QVBoxLayout(self)
        
        # Header
        header = QLabel("Re-Searching Unmatched Tracks")
        header.setStyleSheet("font-weight: bold; font-size: 12pt;")
        layout.addWidget(header)
        
        # Overall progress bar
        self.overall_progress = QProgressBar()
        self.overall_progress.setFormat("%p% (%v/%m tracks)")
        layout.addWidget(self.overall_progress)
        
        # Track list (scrollable)
        self.track_list = QListWidget()
        self.track_list.setMaximumHeight(200)
        layout.addWidget(self.track_list)
        
        # Statistics
        stats_layout = QHBoxLayout()
        self.matched_label = QLabel("Newly Matched: 0")
        self.remaining_label = QLabel("Remaining: 0")
        stats_layout.addWidget(self.matched_label)
        stats_layout.addWidget(self.remaining_label)
        stats_layout.addStretch()
        layout.addLayout(stats_layout)
```

### 3.2 Progress Signals

**Location**: `SRC/gui_interface.py` (MODIFY)

**New Progress Info Structure**:
```python
@dataclass
class ReSearchProgressInfo:
    """Progress information for re-search operations"""
    total_unmatched: int
    completed: int
    newly_matched: int
    current_track: Optional[Dict[str, str]] = None  # {'title': str, 'artists': str, 'index': int}
    track_progress: Dict[int, float] = field(default_factory=dict)  # track_index -> progress
    track_results: Dict[int, bool] = field(default_factory=dict)  # track_index -> matched
```

**Signal Definition**:
```python
# In GUIController or ProcessingWorker
research_progress_updated = Signal(object)  # ReSearchProgressInfo object
research_complete = Signal(list)  # List[TrackResult] - updated results
```

### 3.3 Backend Integration

**Location**: `SRC/processor.py` (MODIFY)

**Re-Search Progress Callback**:
```python
def process_playlist(
    ...
    research_progress_callback: Optional[Callable[[ReSearchProgressInfo], None]] = None,
    ...
):
    # ... existing processing ...
    
    # When re-search begins
    if unmatched_inputs and auto_research:
        if research_progress_callback:
            research_progress_callback(ReSearchProgressInfo(
                total_unmatched=len(unmatched_inputs),
                completed=0,
                newly_matched=0
            ))
        
        # During re-search
        for idx, rb in unmatched_inputs:
            if research_progress_callback:
                research_progress_callback(ReSearchProgressInfo(
                    total_unmatched=len(unmatched_inputs),
                    completed=completed_count,
                    newly_matched=matched_count,
                    current_track={'title': rb.title, 'artists': rb.artists, 'index': idx},
                    track_progress={idx: 50.0}  # Example progress
                ))
            
            # Process track...
            new_result = process_track_with_callback(...)
            
            if research_progress_callback:
                research_progress_callback(ReSearchProgressInfo(
                    total_unmatched=len(unmatched_inputs),
                    completed=completed_count + 1,
                    newly_matched=matched_count + (1 if new_result.matched else 0),
                    track_progress={idx: 100.0},
                    track_results={idx: new_result.matched}
                ))
```

### 3.4 Main Window Integration

**Location**: `SRC/gui/main_window.py` (MODIFY)

**Add Re-Search Widget**:
```python
from gui.research_progress_widget import ReSearchProgressWidget

class MainWindow(QMainWindow):
    def __init__(self, parent=None):
        # ... existing initialization ...
        
        # Re-Search Progress Widget (initially hidden)
        self.research_progress_widget = ReSearchProgressWidget()
        self.research_progress_widget.setVisible(False)
        main_layout.addWidget(self.research_progress_widget)
        
        # Connect controller signals
        self.controller.research_progress_updated.connect(
            self.research_progress_widget.update_progress
        )
        self.controller.research_complete.connect(
            self._on_research_complete
        )
    
    def _on_research_complete(self, updated_results: List[TrackResult]):
        """Handle re-search completion"""
        # Update results view with newly matched tracks
        # Hide or collapse re-search widget
        self.research_progress_widget.setVisible(False)
```

---

## 4. UI Design Details

### 4.1 Re-Search Progress Box Layout

```
┌─────────────────────────────────────────────────────┐
│ Re-Searching Unmatched Tracks                       │
├─────────────────────────────────────────────────────┤
│ [████████████░░░░░░░░] 60% (3/5 tracks)            │
├─────────────────────────────────────────────────────┤
│ 📋 Track List:                                      │
│   ✓ Track 1 - Artist A (Matched)                  │
│   ✓ Track 3 - Artist B (Matched)                   │
│   ✓ Track 7 - Artist C (Matched)                   │
│   ⏳ Track 12 - Artist D (Searching...)            │
│   ⏸ Track 15 - Artist E (Pending)                 │
├─────────────────────────────────────────────────────┤
│ Newly Matched: 3  |  Remaining: 2                  │
└─────────────────────────────────────────────────────┘
```

### 4.2 Track List Item Format

Each track in the list shows:
- **Status icon**: ✓ (matched), ⏳ (searching), ⏸ (pending), ✗ (failed)
- **Track title and artist**
- **Progress indicator** (for currently searching track)
- **Result indicator** (if matched, show "Matched" badge)

### 4.3 Visual Styling

- **Background**: Light blue/gray to distinguish from main progress
- **Border**: Subtle border to separate from main processing area
- **Icons**: Use Unicode symbols or Qt icons for status
- **Colors**:
  - Matched tracks: Green text/icon
  - Searching tracks: Blue text with animated indicator
  - Pending tracks: Gray text
  - Failed tracks: Red text

### 4.4 Responsive Behavior

- **Auto-expand**: Widget expands when re-search begins
- **Auto-collapse**: Option to auto-collapse when complete (configurable)
- **Manual toggle**: User can show/hide the widget
- **Scrollable**: Track list scrolls if many unmatched tracks

---

## 5. User Experience Flow

### 5.1 Normal Processing Flow

1. User starts processing playlist
2. Main progress box shows overall progress
3. Processing completes with some unmatched tracks
4. **Re-search automatically begins** (if auto_research=True)
5. **Re-search progress box appears** below main progress
6. User sees:
   - List of unmatched tracks
   - Progress for each track
   - Overall re-search progress
7. As tracks are re-searched:
   - Track status updates in real-time
   - Progress bars update
   - Newly matched tracks highlighted
8. Re-search completes
9. Widget shows final results
10. Widget can be collapsed/hidden

### 5.2 User Interactions

- **View details**: Click on track to see re-search details
- **Cancel re-search**: Button to cancel ongoing re-search
- **Hide widget**: Collapse button to hide the widget
- **Expand widget**: Show button if collapsed

---

## 6. Technical Considerations

### 6.1 Thread Safety

- Progress updates come from background thread
- Use Qt signals/slots for thread-safe UI updates
- Ensure all UI updates happen on main thread

### 6.2 Performance

- Limit track list display (show max 50 tracks, scroll for more)
- Update UI at reasonable intervals (not every query)
- Use efficient data structures for progress tracking

### 6.3 Error Handling

- Handle cases where re-search fails for individual tracks
- Show error status in track list
- Continue re-search even if some tracks fail

### 6.4 Backward Compatibility

- Feature is opt-in (only shown when auto_research=True)
- Existing processing flow unchanged
- No breaking changes to existing APIs

---

## 7. Implementation Checklist

### Phase 1: Core Widget
- [ ] Create `ReSearchProgressWidget` class
- [ ] Implement basic UI layout
- [ ] Add overall progress bar
- [ ] Add track list display
- [ ] Add statistics display

### Phase 2: Backend Integration
- [ ] Add `ReSearchProgressInfo` dataclass
- [ ] Add progress callback to `process_playlist()`
- [ ] Emit progress updates during re-search
- [ ] Handle re-search completion

### Phase 3: Signal Integration
- [ ] Add signals to `GUIController`
- [ ] Connect signals in `MainWindow`
- [ ] Update widget from signals
- [ ] Handle widget visibility

### Phase 4: Polish
- [ ] Add visual styling
- [ ] Add icons/indicators
- [ ] Add animations
- [ ] Add user preferences (auto-collapse, etc.)

### Phase 5: Testing
- [ ] Unit tests for widget
- [ ] Integration tests with backend
- [ ] UI interaction tests
- [ ] Performance tests

---

## 8. Future Enhancements

### 8.1 Advanced Features

1. **Detailed View**: Click track to see re-search queries and candidates
2. **Manual Re-Search**: User can manually trigger re-search for specific tracks
3. **Re-Search Settings**: Allow user to adjust re-search settings per-track
4. **Export Re-Search Results**: Export re-search statistics separately
5. **Re-Search History**: Track re-search attempts and results over time

### 8.2 Analytics

- Track re-search success rate
- Show which tracks are frequently unmatched
- Suggest settings adjustments based on re-search patterns

---

## 9. Dependencies

- **Requires**: Phase 1 GUI Foundation (MainWindow, ProgressWidget)
- **Requires**: Phase 0 Backend (process_playlist with auto_research)
- **Optional**: Phase 3 Performance Monitoring (for re-search metrics)

---

## 10. Acceptance Criteria

- [ ] Re-search progress box appears automatically when re-search begins
- [ ] Shows list of unmatched tracks being re-searched
- [ ] Displays progress for each track and overall
- [ ] Updates in real-time as re-search progresses
- [ ] Highlights newly matched tracks
- [ ] Can be collapsed/hidden by user
- [ ] Works with both parallel and sequential re-search
- [ ] Handles errors gracefully
- [ ] No performance impact on main processing
- [ ] All tests passing

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-27  
**Author**: CuePoint Development Team  
**Status**: 📝 Design Only - Not Yet Implemented

