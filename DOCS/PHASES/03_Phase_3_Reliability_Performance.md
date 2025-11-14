# Phase 3: Reliability & Performance (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - MEDIUM PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

## Goal
Improve reliability and performance, add batch processing.

## Success Criteria
- [ ] Performance monitoring dashboard works
- [ ] Batch playlist processing works
- [ ] All features tested
- [ ] Performance improvements measurable

---

## Implementation Steps

### Step 3.1: Performance Monitoring (3-4 days)
**File**: `SRC/gui/performance_view.py` (NEW)

**Dependencies**: Phase 1 (GUI working), Phase 0 (processing backend)

**What to create - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QTableWidget
from PySide6.QtCore import QTimer
import time

class PerformanceView(QWidget):
    """Performance monitoring dashboard"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.metrics = {
            "total_tracks": 0,
            "matched_tracks": 0,
            "unmatched_tracks": 0,
            "total_time": 0.0,
            "avg_time_per_track": 0.0,
            "queries_executed": 0,
            "candidates_evaluated": 0,
            "cache_hits": 0,
            "cache_misses": 0
        }
        self.init_ui()
        
    def init_ui(self):
        """Initialize performance dashboard"""
        layout = QVBoxLayout(self)
        
        # Title
        title = QLabel("Performance Metrics")
        title.setStyleSheet("font-size: 18px; font-weight: bold;")
        layout.addWidget(title)
        
        # Metrics table
        self.metrics_table = QTableWidget()
        self.metrics_table.setColumnCount(2)
        self.metrics_table.setHorizontalHeaderLabels(["Metric", "Value"])
        self.metrics_table.setRowCount(len(self.metrics))
        layout.addWidget(self.metrics_table)
        
        # Performance tips
        self.tips_label = QLabel()
        self.tips_label.setWordWrap(True)
        layout.addWidget(self.tips_label)
        
    def update_metrics(self, metrics: dict):
        """Update performance metrics"""
        self.metrics.update(metrics)
        self._update_display()
        self._update_tips()
        
    def _update_display(self):
        """Update metrics table"""
        row = 0
        for key, value in self.metrics.items():
            self.metrics_table.setItem(row, 0, QTableWidgetItem(key.replace("_", " ").title()))
            self.metrics_table.setItem(row, 1, QTableWidgetItem(str(value)))
            row += 1
            
    def _update_tips(self):
        """Update performance tips based on metrics"""
        tips = []
        
        avg_time = self.metrics.get("avg_time_per_track", 0)
        if avg_time > 5.0:
            tips.append("Consider using 'Fast' preset to reduce processing time")
            
        cache_hit_rate = self.metrics.get("cache_hits", 0) / max(
            self.metrics.get("cache_hits", 0) + self.metrics.get("cache_misses", 0), 1
        )
        if cache_hit_rate < 0.3:
            tips.append("Low cache hit rate - consider enabling HTTP caching")
            
        if tips:
            self.tips_label.setText("Performance Tips:\n" + "\n".join(f"• {tip}" for tip in tips))
        else:
            self.tips_label.setText("Performance looks good!")
```

**Implementation Checklist**:
- [ ] Create performance dashboard widget
- [ ] Track timing breakdown
- [ ] Track query effectiveness
- [ ] Display performance tips
- [ ] Update metrics in real-time

**Acceptance Criteria**:
- ✅ Metrics tracked
- ✅ Dashboard displays
- ✅ Tips shown
- ✅ Real-time updates work

**Design Reference**: `DOCS/DESIGNS/10_Performance_Monitoring_Design.md`

---

### Step 3.2: Batch Playlist Processing (3-4 days)
**File**: `SRC/gui/batch_processor.py` (NEW)

**Dependencies**: Phase 1 (GUI working), Phase 0 (processing backend)

**What to create - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QListWidget,
    QPushButton, QLabel, QProgressBar, QCheckBox
)
from PySide6.QtCore import Signal, QThread
from gui_interface import TrackResult

class BatchProcessor(QWidget):
    """Batch playlist processing widget"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists = []
        self.queue = []
        self.processing = False
        self.init_ui()
        
    def init_ui(self):
        """Initialize batch processor UI"""
        layout = QVBoxLayout(self)
        
        # Playlist list (multi-select)
        self.playlist_list = QListWidget()
        self.playlist_list.setSelectionMode(QListWidget.MultiSelection)
        layout.addWidget(self.playlist_list)
        
        # Control buttons
        button_layout = QHBoxLayout()
        
        self.add_btn = QPushButton("Add Playlists")
        self.add_btn.clicked.connect(self.add_playlists)
        button_layout.addWidget(self.add_btn)
        
        self.start_btn = QPushButton("Start Batch")
        self.start_btn.clicked.connect(self.start_batch)
        button_layout.addWidget(self.start_btn)
        
        self.pause_btn = QPushButton("Pause")
        self.pause_btn.setEnabled(False)
        self.pause_btn.clicked.connect(self.pause_batch)
        button_layout.addWidget(self.pause_btn)
        
        self.cancel_btn = QPushButton("Cancel")
        self.cancel_btn.setEnabled(False)
        self.cancel_btn.clicked.connect(self.cancel_batch)
        button_layout.addWidget(self.cancel_btn)
        
        layout.addLayout(button_layout)
        
        # Progress per playlist
        self.progress_widgets = {}
        
    def add_playlists(self, playlists: List[str]):
        """Add playlists to batch queue"""
        for playlist in playlists:
            if playlist not in self.queue:
                self.queue.append(playlist)
                self.playlist_list.addItem(playlist)
                
    def start_batch(self):
        """Start batch processing"""
        selected = [item.text() for item in self.playlist_list.selectedItems()]
        if not selected:
            selected = [self.playlist_list.item(i).text() for i in range(self.playlist_list.count())]
            
        self.queue = selected
        self.processing = True
        self.start_btn.setEnabled(False)
        self.pause_btn.setEnabled(True)
        self.cancel_btn.setEnabled(True)
        
        # Start processing first playlist
        self._process_next()
        
    def _process_next(self):
        """Process next playlist in queue"""
        if not self.queue or not self.processing:
            self._on_batch_complete()
            return
            
        playlist = self.queue.pop(0)
        # Start processing this playlist
        # (Implementation depends on controller)
        
    def pause_batch(self):
        """Pause batch processing"""
        self.processing = False
        self.pause_btn.setEnabled(False)
        self.start_btn.setEnabled(True)
        
    def cancel_batch(self):
        """Cancel batch processing"""
        self.queue.clear()
        self.processing = False
        self._on_batch_complete()
        
    def _on_batch_complete(self):
        """Handle batch completion"""
        self.processing = False
        self.start_btn.setEnabled(True)
        self.pause_btn.setEnabled(False)
        self.cancel_btn.setEnabled(False)
```

**Implementation Checklist**:
- [ ] Create multi-select playlist list
- [ ] Create batch queue
- [ ] Add progress per playlist
- [ ] Add pause/resume/cancel
- [ ] Integrate with processing controller

**Acceptance Criteria**:
- ✅ Batch processing works
- ✅ Queue management works
- ✅ Progress tracking works
- ✅ Pause/resume works
- ✅ Cancel works

**Design Reference**: `DOCS/DESIGNS/08_Batch_Playlist_Processing_Design.md`

---

## Phase 3 Deliverables Checklist
- [ ] Performance monitoring works
- [ ] Batch processing works
- [ ] All features tested
- [ ] Performance improvements documented

---

## Testing Strategy

### Performance Testing
- Measure processing time before/after optimizations
- Test with various playlist sizes
- Monitor memory usage
- Test cache effectiveness

### Batch Processing Testing
- Test with multiple playlists
- Test pause/resume
- Test cancellation
- Test error handling in batch mode

---

*For complete design details, see the referenced design documents in `DOCS/DESIGNS/`.*

