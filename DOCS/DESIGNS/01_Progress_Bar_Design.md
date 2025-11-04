# Design: Progress Bar During Processing

**Number**: 1  
**Status**: ✅ Implemented  
**Priority**: 🔥 P0 - Quick Win  
**Effort**: 1 day  
**Impact**: Very High

---

## 1. Overview

### 1.1 Problem Statement

During long processing runs, users had no visibility into:
- Overall progress (how many tracks completed)
- Current track being processed
- Estimated time remaining
- Real-time statistics (matched/unmatched counts)
- Query execution progress

This led to uncertainty about whether the process was working or stuck.

### 1.2 Solution Overview

Implement a comprehensive progress tracking system with:
1. **Overall progress bar**: Visual indication of track processing completion
2. **Real-time statistics**: Matched/unmatched/processing counts
3. **Current track display**: Show which track is currently being processed
4. **Query progress**: Nested progress for queries within each track
5. **Time estimates**: Estimated time remaining based on current rate

---

## 2. Architecture Design

### 2.1 Progress Display Levels

```
Level 1: Overall Track Processing
  └─ Level 2: Query Execution (per track)
      └─ Level 3: Candidate Evaluation (optional, detailed mode)
```

### 2.2 Library Selection

**Primary Choice**: `tqdm`
- Lightweight, widely used
- Automatic terminal handling
- Thread-safe for parallel processing
- Rich formatting options
- Minimal dependencies

**Alternative**: `rich`
- More advanced formatting
- Better for complex nested displays
- Heavier dependency

**Decision**: Use `tqdm` for simplicity and compatibility.

---

## 3. Implementation Design

### 3.1 Overall Progress Bar

**Location**: `processor.py` → `run()`

**Implementation**:
```python
from tqdm import tqdm

# Create progress bar for all tracks
track_progress = tqdm(
    total=len(inputs),
    desc="Processing tracks",
    unit="track",
    ncols=100,
    bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]"
)

# Update during processing
for idx, rb_track in inputs:
    # Process track...
    track_progress.update(1)
    track_progress.set_postfix({
        'matched': matched_count,
        'unmatched': unmatched_count
    })
```

**Display Format**:
```
Processing tracks: 12/25 [00:45<01:23] matched=10, unmatched=2
```

### 3.2 Current Track Display

**Location**: `processor.py` → `process_track()`

**Display**:
```python
current_track_info = f"Track {idx}/{total}: {rb_track.title} - {rb_track.artists}"

# Update progress bar description
track_progress.set_description(current_track_info)
```

**Example Output**:
```
Track 12/25: Dance With Me - Shadu: 12/25 [00:45<01:23]
```

### 3.3 Nested Query Progress

**Location**: `matcher.py` → `best_beatport_match()`

**For verbose mode**:
```python
if SETTINGS["VERBOSE"]:
    query_progress = tqdm(
        total=len(queries),
        desc="  Queries",
        unit="query",
        leave=False,  # Don't leave progress bar after completion
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt}"
    )
    
    for query in queries:
        # Execute query...
        query_progress.update(1)
```

**Display Format**:
```
Track 12/25: Dance With Me - Shadu: 12/25 [00:45<01:23]
  Queries: 8/40 [████████░░░░░░░░░░░░] 8/40
```

### 3.4 Statistics Tracking

**Real-time Statistics**:
```python
class ProgressStats:
    def __init__(self):
        self.matched = 0
        self.unmatched = 0
        self.review_needed = 0
        self.total_queries = 0
        self.total_candidates = 0
        
    def update_track_result(self, has_match: bool, needs_review: bool):
        if has_match:
            self.matched += 1
        else:
            self.unmatched += 1
        if needs_review:
            self.review_needed += 1
    
    def get_stats_string(self) -> str:
        return f"matched={self.matched}, unmatched={self.unmatched}, review={self.review_needed}"
```

**Integration**:
```python
progress_stats = ProgressStats()

for idx, rb_track in inputs:
    result = process_track(idx, rb_track)
    progress_stats.update_track_result(
        has_match=result.has_match,
        needs_review=result.needs_review
    )
    
    track_progress.set_postfix_str(progress_stats.get_stats_string())
```

---

## 4. Detailed Progress Information

### 4.1 Track-Level Details

**Display per track** (verbose mode):
```
Track 12/25: Dance With Me - Shadu
  ├─ Queries: 8/40 executed (20.0%)
  ├─ Candidates found: 13
  ├─ Best match: 141.0 (High confidence)
  ├─ Time: 2.7s / 45s budget
  └─ Status: ✓ Matched
```

### 4.2 Query-Level Details

**Query execution progress**:
```python
query_details = {
    'executed': query_count,
    'total': total_queries,
    'candidates_found': candidate_count,
    'best_score': best_score,
    'elapsed': elapsed_time,
    'remaining_budget': remaining_time
}
```

---

## 5. Configuration Options

### 5.1 Settings in `config.py`

```python
SETTINGS = {
    "SHOW_PROGRESS_BAR": True,          # Enable/disable progress bar
    "PROGRESS_BAR_DETAILED": False,     # Show nested query progress
    "PROGRESS_UPDATE_INTERVAL": 0.1,    # Update frequency (seconds)
    "PROGRESS_SHOW_STATS": True,        # Show real-time statistics
}
```

### 5.2 Command-Line Options

```bash
# Disable progress bar (for scripts/logs)
python main.py --xml collection.xml --playlist "My Playlist" --no-progress

# Enable detailed progress (nested bars)
python main.py --xml collection.xml --playlist "My Playlist" --progress-detailed
```

---

## 6. Parallel Processing Considerations

### 6.1 Thread-Safe Progress Updates

**Challenge**: Multiple threads updating progress simultaneously

**Solution**: Use `tqdm`'s thread-safe mode or lock:
```python
from threading import Lock

progress_lock = Lock()

def update_progress():
    with progress_lock:
        track_progress.update(1)
        track_progress.set_postfix(...)
```

### 6.2 Per-Worker Progress

**Option**: Separate progress bars for each worker (complex, not recommended)

**Better**: Single shared progress bar with aggregated statistics

---

## 7. Performance Impact

### 7.1 Overhead Considerations

- **Update frequency**: Update every track completion (not every query)
- **Display rendering**: Minimal overhead for simple progress bars
- **Memory**: Negligible (progress bar objects are lightweight)

### 7.2 Optimization

```python
# Only update if enough time has passed (reduces terminal I/O)
if time.time() - last_update > UPDATE_INTERVAL:
    track_progress.refresh()
    last_update = time.time()
```

---

## 8. Display Modes

### 8.1 Normal Mode (Default)

```
Processing tracks: 12/25 [00:45<01:23] matched=10, unmatched=2
```

### 8.2 Verbose Mode

```
Processing tracks: 12/25 [00:45<01:23] matched=10, unmatched=2
Track 12/25: Dance With Me - Shadu
  Queries: 8/40 [████████░░░░░░░░░░░░] 8/40
  Candidates: 13 found, best: 141.0
```

### 8.3 Minimal Mode

```
[12/25] matched=10, unmatched=2
```

### 8.4 No Progress Mode

```
(For scripts/logging - no visual progress)
```

---

## 9. Integration Points

### 9.1 processor.py

```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    # ... existing code ...
    
    # Create progress bar
    with tqdm(total=len(inputs), desc="Processing tracks", unit="track") as pbar:
        for idx, rb_track in inputs:
            result = process_track(idx, rb_track)
            update_progress_stats(result)
            pbar.update(1)
            pbar.set_postfix(get_current_stats())
```

### 9.2 matcher.py

```python
def best_beatport_match(rb: RBTrack, queries: List[str]) -> Optional[BeatportCandidate]:
    # ... existing code ...
    
    if SETTINGS["PROGRESS_BAR_DETAILED"]:
        with tqdm(total=len(queries), desc="  Queries", leave=False) as query_pbar:
            for query in queries:
                candidates = execute_query(query)
                query_pbar.update(1)
```

---

## 10. Error Handling

### 10.1 Terminal Compatibility

**Fallback for non-TTY**:
```python
# Detect if running in terminal
if not sys.stdout.isatty():
    # Fallback to simple text updates
    print(f"Processing track {idx}/{total}...")
```

### 10.2 Progress Bar Cleanup

**Ensure cleanup on errors**:
```python
try:
    with tqdm(...) as pbar:
        # Processing...
        pass
except KeyboardInterrupt:
    pbar.close()
    print("\nInterrupted by user")
    raise
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

- Test progress bar creation
- Test statistics tracking
- Test update mechanisms

### 11.2 Integration Tests

- Test with real processing
- Test with parallel workers
- Test error handling

### 11.3 Manual Testing

- Small playlist (10 tracks)
- Large playlist (100+ tracks)
- Various terminal types

---

## 12. Example Outputs

### 12.1 Small Playlist

```
Processing tracks: 10/10 [00:32<00:00] matched=9, unmatched=1
100%|████████████████████████████████████| 10/10 [00:32<00:00, 3.12track/s]
```

### 12.2 Large Playlist with Verbose

```
Processing tracks: 45/100 [02:15<02:45] matched=42, unmatched=3
Track 45/100: Never Sleep Again - Solomun
  Queries: 15/40 [██████████░░░░░░░░] 15/40
  Candidates: 28 found, best: 152.0
```

---

## 13. Future Enhancements

### 13.1 Potential Improvements

1. **Rich library integration**: More advanced formatting
2. **Web-based progress**: For web interface
3. **Progress persistence**: Save/restore progress state
4. **Estimated time per track**: Based on historical data
5. **Performance warnings**: Alert if processing slower than expected

---

## 14. Dependencies

### 14.1 Required

- `tqdm>=4.64.0`: Progress bar library

### 14.2 Installation

```bash
pip install tqdm
```

Already in `requirements.txt`.

---

## 15. Benefits

### 15.1 User Experience

- **Reduced anxiety**: Users know progress is being made
- **Better planning**: Can estimate completion time
- **Real-time feedback**: Immediate visibility into results

### 15.2 Development Benefits

- **Easier debugging**: See where processing is slow
- **Performance insights**: Identify bottlenecks
- **User satisfaction**: Professional appearance

---

---

## 16. GUI Integration (PySide6)

### 16.1 GUI Progress Widget Design

**Location**: `SRC/gui/progress_widget.py` (NEW)

**Component Structure**:
```python
# SRC/gui/progress_widget.py
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QProgressBar, QGroupBox
)
from PySide6.QtCore import Qt, Signal
from gui_interface import ProgressInfo

class ProgressWidget(QWidget):
    """GUI progress widget for processing display"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up progress widget UI"""
        layout = QVBoxLayout()
        
        # Overall progress bar
        self.overall_progress = QProgressBar()
        self.overall_progress.setMinimum(0)
        self.overall_progress.setMaximum(100)
        self.overall_progress.setValue(0)
        self.overall_progress.setFormat("%p% (%v/%m)")
        layout.addWidget(self.overall_progress)
        
        # Current track info
        self.current_track_label = QLabel("Ready to start...")
        self.current_track_label.setWordWrap(True)
        layout.addWidget(self.current_track_label)
        
        # Statistics group
        stats_group = QGroupBox("Statistics")
        stats_layout = QHBoxLayout()
        
        self.matched_label = QLabel("Matched: 0")
        self.unmatched_label = QLabel("Unmatched: 0")
        self.processing_label = QLabel("Processing: 0")
        
        stats_layout.addWidget(self.matched_label)
        stats_layout.addWidget(self.unmatched_label)
        stats_layout.addWidget(self.processing_label)
        stats_layout.addStretch()
        
        stats_group.setLayout(stats_layout)
        layout.addWidget(stats_group)
        
        # Time estimates
        time_layout = QHBoxLayout()
        self.elapsed_label = QLabel("Elapsed: 0s")
        self.remaining_label = QLabel("Remaining: --")
        time_layout.addWidget(self.elapsed_label)
        time_layout.addWidget(self.remaining_label)
        time_layout.addStretch()
        layout.addLayout(time_layout)
        
        self.setLayout(layout)
    
    def update_progress(self, progress_info: ProgressInfo):
        """Update progress from backend"""
        # Update overall progress bar
        if progress_info.total_tracks > 0:
            percentage = int((progress_info.completed_tracks / progress_info.total_tracks) * 100)
            self.overall_progress.setValue(percentage)
            self.overall_progress.setMaximum(progress_info.total_tracks)
        
        # Update current track
        if progress_info.current_track:
            track_text = f"Track {progress_info.completed_tracks + 1}/{progress_info.total_tracks}: {progress_info.current_track.title} - {progress_info.current_track.artists}"
            self.current_track_label.setText(track_text)
        
        # Update statistics
        self.matched_label.setText(f"Matched: {progress_info.matched_count}")
        self.unmatched_label.setText(f"Unmatched: {progress_info.unmatched_count}")
        self.processing_label.setText(f"Processing: {progress_info.completed_tracks}")
        
        # Update time estimates
        if progress_info.elapsed_time > 0:
            elapsed_str = self._format_time(progress_info.elapsed_time)
            self.elapsed_label.setText(f"Elapsed: {elapsed_str}")
            
            if progress_info.total_tracks > 0 and progress_info.completed_tracks > 0:
                avg_time_per_track = progress_info.elapsed_time / progress_info.completed_tracks
                remaining_tracks = progress_info.total_tracks - progress_info.completed_tracks
                estimated_remaining = avg_time_per_track * remaining_tracks
                remaining_str = self._format_time(estimated_remaining)
                self.remaining_label.setText(f"Remaining: {remaining_str}")
    
    def _format_time(self, seconds: float) -> str:
        """Format time in human-readable format"""
        if seconds < 60:
            return f"{seconds:.0f}s"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"
    
    def reset(self):
        """Reset progress widget"""
        self.overall_progress.setValue(0)
        self.current_track_label.setText("Ready to start...")
        self.matched_label.setText("Matched: 0")
        self.unmatched_label.setText("Unmatched: 0")
        self.processing_label.setText("Processing: 0")
        self.elapsed_label.setText("Elapsed: 0s")
        self.remaining_label.setText("Remaining: --")
```

### 16.2 Thread-Safe Progress Updates

**Integration in MainWindow**:

```python
# SRC/gui/main_window.py
from PySide6.QtCore import QThread, Signal
from gui_interface import ProgressInfo, ProcessingController

class ProcessingThread(QThread):
    """Thread for running processing"""
    
    progress_updated = Signal(ProgressInfo)
    processing_complete = Signal(list)
    error_occurred = Signal(str)
    
    def __init__(self, xml_path: str, playlist_name: str):
        super().__init__()
        self.xml_path = xml_path
        self.playlist_name = playlist_name
        self.controller = ProcessingController()
    
    def run(self):
        """Run processing in background thread"""
        def progress_callback(progress_info: ProgressInfo):
            # Emit signal to update GUI (thread-safe)
            self.progress_updated.emit(progress_info)
        
        try:
            results = process_playlist(
                xml_path=self.xml_path,
                playlist_name=self.playlist_name,
                progress_callback=progress_callback,
                controller=self.controller
            )
            self.processing_complete.emit(results)
        except Exception as e:
            self.error_occurred.emit(str(e))
    
    def cancel(self):
        """Cancel processing"""
        self.controller.cancel()

# In MainWindow
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.progress_widget = ProgressWidget()
        self.processing_thread = None
    
    def _start_processing(self):
        """Start processing"""
        # Reset progress widget
        self.progress_widget.reset()
        
        # Create and start processing thread
        self.processing_thread = ProcessingThread(
            xml_path=self.xml_path,
            playlist_name=self.playlist_name
        )
        
        # Connect signals
        self.processing_thread.progress_updated.connect(self.progress_widget.update_progress)
        self.processing_thread.processing_complete.connect(self._on_processing_complete)
        self.processing_thread.error_occurred.connect(self._on_error)
        
        # Start thread
        self.processing_thread.start()
    
    def _on_processing_complete(self, results):
        """Handle processing completion"""
        # Update UI
        self.progress_widget.overall_progress.setValue(100)
        # ... show results ...
    
    def _cancel_processing(self):
        """Cancel processing"""
        if self.processing_thread and self.processing_thread.isRunning():
            self.processing_thread.cancel()
```

### 16.3 Visual Design

**Progress Bar Styling**:
```python
# Styled progress bar with color coding
self.overall_progress.setStyleSheet("""
    QProgressBar {
        border: 2px solid #cccccc;
        border-radius: 5px;
        text-align: center;
        font-weight: bold;
    }
    QProgressBar::chunk {
        background-color: #4CAF50;
        border-radius: 3px;
    }
""")
```

**Statistics Color Coding**:
- **Matched**: Green (#4CAF50)
- **Unmatched**: Red (#F44336)
- **Processing**: Blue (#2196F3)

### 16.4 Acceptance Criteria for GUI Integration

- [ ] Progress widget displays correctly
- [ ] Progress updates in real-time
- [ ] Thread-safe updates work correctly
- [ ] Time estimates calculate correctly
- [ ] Visual design is clear and professional
- [ ] Cancellation works correctly

---

**Document Version**: 2.0  
**Last Updated**: 2025-01-27  
**Author**: CuePoint Development Team  
**GUI Integration**: Complete

