# Step 4.2: Advanced Filtering and Search

**Status**: 📝 Planned  
**Priority**: 🚀 High Priority  
**Estimated Duration**: 2-3 days  
**Dependencies**: Phase 2 Step 2.1 (results table exists), Phase 3 (performance monitoring)

## Goal
Enhance the results view with advanced filtering options (year range, BPM range, key filter) to allow users to quickly find tracks matching specific criteria. Additionally, add the same advanced filtering capabilities to the Past Searches (HistoryView) tab, and implement resizable UI sections for improved user experience.

## Success Criteria
- [ ] Year range filter works correctly
- [ ] BPM range filter works correctly
- [ ] Key filter works correctly
- [ ] Filters combine correctly (AND logic)
- [ ] Filters work with existing search box
- [ ] Advanced filters available in HistoryView (Past Searches tab)
- [ ] Resizable UI sections implemented (splitters in all views)
- [ ] Sorting improvements (zero-padding, numeric sorting for playlist index)
- [ ] Performance acceptable with large datasets
- [ ] Filter operations tracked in Phase 3 metrics
- [ ] Error handling robust
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing Filters**: Search box, confidence filter (implemented in Phase 2)
- **Limitations**: 
  - No filtering by year, BPM, or key
  - No advanced filters in HistoryView (Past Searches tab)
  - UI sections not resizable (fixed layout)
  - Playlist index sorting issues (lexicographical instead of numeric)
- **User Needs**: 
  - Users want to filter by musical attributes (year, BPM, key)
  - Users want same filtering capabilities in Past Searches tab
  - Users want resizable UI sections for better space management
  - Users want correct numerical sorting of playlist index
- **Opportunity**: 
  - Add range filters for numeric attributes and dropdown for key
  - Extend filtering to HistoryView
  - Implement resizable splitters for better UX
  - Fix sorting with zero-padding and numeric data roles

### Filter Design
- **Year Range**: Min/max spinboxes (1900-2100)
- **BPM Range**: Min/max spinboxes (60-200)
- **Key Filter**: Dropdown with all keys (Major/Minor)
- **Filter Logic**: AND logic (all filters must match)
- **Performance**: Efficient filtering with large datasets

### Performance Considerations (Phase 3 Integration)
- **Filter Time**: Track filter operation duration
- **Dataset Size**: Optimize for large result sets
- **Metrics to Track**:
  - Filter operation time
  - Number of results after filtering
  - Filter usage statistics

### Error Handling Strategy
1. **Invalid Values**: Handle missing/invalid data gracefully
2. **Type Conversion**: Safely convert year/BPM strings to numbers
3. **Empty Results**: Show clear message when no results match
4. **User Feedback**: Update result count immediately

### Backward Compatibility
- Existing filters continue to work
- New filters are additions, not replacements
- No breaking changes to existing code

---

## Implementation Steps

### Substep 4.2.1: Add Advanced Filter UI Components (4-6 hours)
**File**: `SRC/gui/results_view.py` (MODIFY)

**What to add:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QLineEdit, QComboBox, QPushButton, QLabel, QSpinBox, QGroupBox
)
from PySide6.QtCore import Qt
import time
from SRC.performance import performance_collector

class ResultsView(QWidget):
    """Enhanced results view with advanced filtering"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results = []
        self.filtered_results = []
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI with advanced filters"""
        layout = QVBoxLayout(self)
        
        # Existing filter controls (search box, confidence filter)
        # ... existing code ...
        
        # NEW: Advanced Filters Group
        advanced_filters_group = QGroupBox("Advanced Filters")
        advanced_filters_layout = QVBoxLayout()
        
        # Year range filter
        year_layout = QHBoxLayout()
        year_layout.addWidget(QLabel("Year:"))
        self.year_min = QSpinBox()
        self.year_min.setMinimum(1900)
        self.year_min.setMaximum(2100)
        self.year_min.setValue(1900)
        self.year_min.setSpecialValueText("Any")
        self.year_min.setToolTip("Minimum year (leave at 1900 for no minimum)")
        year_layout.addWidget(self.year_min)
        
        year_layout.addWidget(QLabel("to"))
        self.year_max = QSpinBox()
        self.year_max.setMinimum(1900)
        self.year_max.setMaximum(2100)
        self.year_max.setValue(2100)
        self.year_max.setSpecialValueText("Any")
        self.year_max.setToolTip("Maximum year (leave at 2100 for no maximum)")
        year_layout.addWidget(self.year_max)
        advanced_filters_layout.addLayout(year_layout)
        
        # BPM range filter
        bpm_layout = QHBoxLayout()
        bpm_layout.addWidget(QLabel("BPM:"))
        self.bpm_min = QSpinBox()
        self.bpm_min.setMinimum(60)
        self.bpm_min.setMaximum(200)
        self.bpm_min.setValue(60)
        self.bpm_min.setSpecialValueText("Any")
        self.bpm_min.setToolTip("Minimum BPM (leave at 60 for no minimum)")
        bpm_layout.addWidget(self.bpm_min)
        
        bpm_layout.addWidget(QLabel("to"))
        self.bpm_max = QSpinBox()
        self.bpm_max.setMinimum(60)
        self.bpm_max.setMaximum(200)
        self.bpm_max.setValue(200)
        self.bpm_max.setSpecialValueText("Any")
        self.bpm_max.setToolTip("Maximum BPM (leave at 200 for no maximum)")
        bpm_layout.addWidget(self.bpm_max)
        advanced_filters_layout.addLayout(bpm_layout)
        
        # Key filter
        key_layout = QHBoxLayout()
        key_layout.addWidget(QLabel("Key:"))
        self.key_filter = QComboBox()
        keys = ["All"] + [f"{k} Major" for k in "C C# D D# E F F# G G# A A# B".split()] + \
               [f"{k} Minor" for k in "C C# D D# E F F# G G# A A# B".split()]
        self.key_filter.addItems(keys)
        self.key_filter.setToolTip("Filter by musical key")
        key_layout.addWidget(self.key_filter)
        key_layout.addStretch()
        advanced_filters_layout.addLayout(key_layout)
        
        # Clear filters button
        clear_button = QPushButton("Clear All Filters")
        clear_button.clicked.connect(self.clear_filters)
        advanced_filters_layout.addWidget(clear_button)
        
        advanced_filters_group.setLayout(advanced_filters_layout)
        layout.addWidget(advanced_filters_group)
        
        # Results table (existing)
        # ... existing table code ...
        
        # Result count label
        self.result_count_label = QLabel("0 results")
        layout.addWidget(self.result_count_label)
    
    def clear_filters(self):
        """Clear all advanced filters"""
        self.year_min.setValue(1900)
        self.year_max.setValue(2100)
        self.bpm_min.setValue(60)
        self.bpm_max.setValue(200)
        self.key_filter.setCurrentText("All")
        self.apply_filters()
```

**Implementation Checklist**:
- [ ] Add advanced filters group
- [ ] Add year range spinboxes
- [ ] Add BPM range spinboxes
- [ ] Add key filter dropdown
- [ ] Add clear filters button
- [ ] Add tooltips
- [ ] Connect signals
- [ ] Test UI layout

---

### Substep 4.2.2: Implement Filter Logic (4-6 hours)
**File**: `SRC/gui/results_view.py` (MODIFY)

**What to implement:**

```python
def apply_filters(self):
    """
    Apply all filters including advanced filters.
    
    Tracks performance metrics if Phase 3 monitoring is enabled.
    """
    filter_start_time = time.time()
    
    # Start with all results
    filtered = self.results.copy()
    
    # Existing filters (search box, confidence)
    search_text = self.search_box.text().lower()
    if search_text:
        filtered = [
            r for r in filtered
            if search_text in r.title.lower() or search_text in r.artist.lower() or
               (r.matched and search_text in (r.beatport_title or "").lower())
        ]
    
    confidence_filter = self.confidence_filter.currentText()
    if confidence_filter != "All":
        filtered = [r for r in filtered if r.confidence == confidence_filter]
    
    # NEW: Year range filter
    year_min_val = self.year_min.value() if self.year_min.value() > 1900 else None
    year_max_val = self.year_max.value() if self.year_max.value() < 2100 else None
    
    if year_min_val or year_max_val:
        filtered = [
            r for r in filtered
            if self._year_in_range(r, year_min_val, year_max_val)
        ]
    
    # NEW: BPM range filter
    bpm_min_val = self.bpm_min.value() if self.bpm_min.value() > 60 else None
    bpm_max_val = self.bpm_max.value() if self.bpm_max.value() < 200 else None
    
    if bpm_min_val or bpm_max_val:
        filtered = [
            r for r in filtered
            if self._bpm_in_range(r, bpm_min_val, bpm_max_val)
        ]
    
    # NEW: Key filter
    key_filter_val = self.key_filter.currentText()
    if key_filter_val != "All":
        filtered = [
            r for r in filtered
            if r.matched and r.beatport_key == key_filter_val
        ]
    
    # Store filtered results
    self.filtered_results = filtered
    
    # Update table
    self._populate_table(filtered)
    
    # Update result count
    self.result_count_label.setText(f"{len(filtered)} of {len(self.results)} results")
    
    # Track performance
    filter_duration = time.time() - filter_start_time
    if hasattr(performance_collector, 'record_filter_operation'):
        performance_collector.record_filter_operation(
            duration=filter_duration,
            initial_count=len(self.results),
            filtered_count=len(filtered),
            filters_applied={
                "year_range": (year_min_val, year_max_val),
                "bpm_range": (bpm_min_val, bpm_max_val),
                "key": key_filter_val if key_filter_val != "All" else None
            }
        )


def _year_in_range(
    self,
    result: TrackResult,
    min_year: Optional[int],
    max_year: Optional[int]
) -> bool:
    """
    Check if result year is in range.
    
    Args:
        result: TrackResult object
        min_year: Minimum year (None for no minimum)
        max_year: Maximum year (None for no maximum)
    
    Returns:
        True if year is in range or no year data
    """
    if not result.matched or not result.beatport_year:
        return False  # Only filter matched tracks with year data
    
    try:
        year = int(result.beatport_year)
        if min_year and year < min_year:
            return False
        if max_year and year > max_year:
            return False
        return True
    except (ValueError, TypeError):
        # Invalid year data, exclude from filtered results
        return False


def _bpm_in_range(
    self,
    result: TrackResult,
    min_bpm: Optional[int],
    max_bpm: Optional[int]
) -> bool:
    """
    Check if result BPM is in range.
    
    Args:
        result: TrackResult object
        min_bpm: Minimum BPM (None for no minimum)
        max_bpm: Maximum BPM (None for no maximum)
    
    Returns:
        True if BPM is in range or no BPM data
    """
    if not result.matched or not result.beatport_bpm:
        return False  # Only filter matched tracks with BPM data
    
    try:
        bpm = float(result.beatport_bpm)
        if min_bpm and bpm < min_bpm:
            return False
        if max_bpm and bpm > max_bpm:
            return False
        return True
    except (ValueError, TypeError):
        # Invalid BPM data, exclude from filtered results
        return False
```

**Implementation Checklist**:
- [ ] Update `apply_filters` method
- [ ] Implement `_year_in_range` helper
- [ ] Implement `_bpm_in_range` helper
- [ ] Add error handling for invalid data
- [ ] Add performance tracking
- [ ] Update result count label
- [ ] Test filter combinations
- [ ] Test with edge cases

**Error Handling**:
- Handle missing year/BPM data
- Handle invalid type conversions
- Handle empty results gracefully
- Show clear feedback to user

---

### Substep 4.2.3: Add Advanced Filters to HistoryView (3-4 hours)
**File**: `SRC/gui/history_view.py` (MODIFY)

**Dependencies**: Substep 4.2.1 (UI components), Substep 4.2.2 (filter logic)

**What to implement:**

Extend advanced filtering capabilities to the Past Searches (HistoryView) tab, allowing users to filter previously loaded CSV files using the same advanced filters (year, BPM, key) as in the main results view.

**Key Requirements:**
- Replicate advanced filter UI components in HistoryView
- Adapt filter logic to work with CSV row dictionaries (instead of TrackResult objects)
- Support filtering on dictionary keys (e.g., `row['Year']`, `row['BPM']`, `row['Key']`)
- Integrate with existing search and confidence filters
- Add debouncing for performance
- Add filter status and result count labels

**Implementation Checklist:**
- [ ] Add advanced filters group to HistoryView UI
- [ ] Implement `_year_in_range` for dictionary rows
- [ ] Implement `_bpm_in_range` for dictionary rows
- [ ] Update `_filter_rows` to apply all filters
- [ ] Add debouncing for filter operations
- [ ] Add filter status label
- [ ] Add result count label
- [ ] Test with various CSV file structures
- [ ] Test filter combinations

**Error Handling:**
- Handle missing columns in CSV data
- Handle invalid year/BPM values in CSV
- Handle empty CSV files
- Provide clear feedback when no results match

---

### Substep 4.2.4: Implement Resizable UI Sections (2-3 hours)
**Files**: `SRC/gui/main_window.py` (MODIFY), `SRC/gui/results_view.py` (MODIFY), `SRC/gui/history_view.py` (MODIFY)

**Dependencies**: Substep 4.2.1 (UI components)

**What to implement:**

Add resizable splitters (QSplitter) to all major UI sections, allowing users to adjust the space allocated to filters/controls vs. results tables.

**Key Requirements:**
- Main tab: Splitter between input controls (top) and results section (bottom)
- ResultsView (single mode): Splitter between summary/filters (top) and results table (bottom)
- ResultsView (batch mode): Each playlist tab has splitter between filters (top) and table (bottom)
- HistoryView: Splitter between file selection/filters (top) and results table (bottom)
- Set appropriate initial split sizes (e.g., 30-40% top, 60-70% bottom)
- Set maximum heights for top sections to prevent them from taking all space
- Prevent sections from being collapsed completely

**Implementation Checklist:**
- [ ] Add QSplitter import to all relevant files
- [ ] Implement splitter in MainWindow main tab
- [ ] Implement splitter in ResultsView (single mode)
- [ ] Implement splitter in ResultsView batch mode tabs
- [ ] Implement splitter in HistoryView
- [ ] Set initial split sizes appropriately
- [ ] Set maximum heights for top sections
- [ ] Test resizing behavior
- [ ] Test with different window sizes

---

### Substep 4.2.5: Fix Playlist Index Sorting (1-2 hours)
**Files**: `SRC/gui/results_view.py` (MODIFY), `SRC/gui/history_view.py` (MODIFY)

**Dependencies**: Substep 4.2.1 (UI components)

**What to implement:**

Fix playlist index sorting to ensure correct numerical order (1, 2, 3, ...) instead of lexicographical order (1, 10, 11, ..., 2, 20, ...).

**Key Requirements:**
- Store numeric playlist_index in Qt.EditRole for correct numerical sorting
- Display zero-padded index string (e.g., "001", "010", "100") for consistent lexicographical display
- Calculate padding dynamically based on maximum index value
- Default sort to Index column ascending if no previous sort state
- Preserve user's sort state when filtering

**Implementation Checklist:**
- [ ] Update `_populate_table` in ResultsView to store numeric data in EditRole
- [ ] Update `_populate_table` in HistoryView to store numeric data in EditRole
- [ ] Implement zero-padding calculation based on max index
- [ ] Display zero-padded index strings
- [ ] Set default ascending sort on Index column
- [ ] Test sorting with various index ranges (1-10, 1-100, 1-1000)
- [ ] Test sorting preserves after filtering

---

### Substep 4.2.6: Connect Filter Signals and Integrate into Results View (4-6 hours)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Phase 2 Step 2.1 (results view exists), Substep 4.2.1 (UI components), Substep 4.2.2 (filter logic)

**What to implement - EXACT STRUCTURE:**

#### Part A: Complete ResultsView Integration

**In `SRC/gui/results_view.py` - Full integration:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QLineEdit, QComboBox, QPushButton, QLabel, QSpinBox, QGroupBox,
    QMessageBox
)
from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QKeySequence
from typing import List, Optional, Dict, Any
import time
from SRC.performance import performance_collector

class ResultsView(QWidget):
    """Enhanced results view with advanced filtering"""
    
    # Signal emitted when filters change
    filters_changed = Signal()
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results = []
        self.filtered_results = []
        self._filter_debounce_timer = QTimer()
        self._filter_debounce_timer.setSingleShot(True)
        self._filter_debounce_timer.timeout.connect(self._apply_filters_debounced)
        self.init_ui()
        self._setup_connections()
    
    def init_ui(self):
        """Initialize UI with advanced filters"""
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # Existing filter controls (from Phase 2)
        existing_filter_layout = QHBoxLayout()
        
        # Search box
        existing_filter_layout.addWidget(QLabel("Search:"))
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search tracks...")
        self.search_box.setClearButtonEnabled(True)
        existing_filter_layout.addWidget(self.search_box)
        
        # Confidence filter
        existing_filter_layout.addWidget(QLabel("Confidence:"))
        self.confidence_filter = QComboBox()
        self.confidence_filter.addItems(["All", "High", "Medium", "Low"])
        existing_filter_layout.addWidget(self.confidence_filter)
        
        existing_filter_layout.addStretch()
        layout.addLayout(existing_filter_layout)
        
        # NEW: Advanced Filters Group
        advanced_filters_group = QGroupBox("Advanced Filters")
        advanced_filters_group.setCheckable(True)
        advanced_filters_group.setChecked(False)  # Collapsed by default
        advanced_filters_group.toggled.connect(self._on_advanced_filters_toggled)
        advanced_filters_layout = QVBoxLayout()
        
        # Year range filter
        year_layout = QHBoxLayout()
        year_layout.addWidget(QLabel("Year Range:"))
        self.year_min = QSpinBox()
        self.year_min.setMinimum(1900)
        self.year_min.setMaximum(2100)
        self.year_min.setValue(1900)
        self.year_min.setSpecialValueText("Any")
        self.year_min.setToolTip("Minimum year (leave at 1900 for no minimum)")
        self.year_min.setSuffix(" -")
        year_layout.addWidget(self.year_min)
        
        self.year_max = QSpinBox()
        self.year_max.setMinimum(1900)
        self.year_max.setMaximum(2100)
        self.year_max.setValue(2100)
        self.year_max.setSpecialValueText("Any")
        self.year_max.setToolTip("Maximum year (leave at 2100 for no maximum)")
        year_layout.addWidget(self.year_max)
        year_layout.addStretch()
        advanced_filters_layout.addLayout(year_layout)
        
        # BPM range filter
        bpm_layout = QHBoxLayout()
        bpm_layout.addWidget(QLabel("BPM Range:"))
        self.bpm_min = QSpinBox()
        self.bpm_min.setMinimum(60)
        self.bpm_min.setMaximum(200)
        self.bpm_min.setValue(60)
        self.bpm_min.setSpecialValueText("Any")
        self.bpm_min.setToolTip("Minimum BPM (leave at 60 for no minimum)")
        self.bpm_min.setSuffix(" -")
        bpm_layout.addWidget(self.bpm_min)
        
        self.bpm_max = QSpinBox()
        self.bpm_max.setMinimum(60)
        self.bpm_max.setMaximum(200)
        self.bpm_max.setValue(200)
        self.bpm_max.setSpecialValueText("Any")
        self.bpm_max.setToolTip("Maximum BPM (leave at 200 for no maximum)")
        bpm_layout.addWidget(self.bpm_max)
        bpm_layout.addStretch()
        advanced_filters_layout.addLayout(bpm_layout)
        
        # Key filter
        key_layout = QHBoxLayout()
        key_layout.addWidget(QLabel("Musical Key:"))
        self.key_filter = QComboBox()
        keys = ["All"] + [f"{k} Major" for k in "C C# D D# E F F# G G# A A# B".split()] + \
               [f"{k} Minor" for k in "C C# D D# E F F# G G# A A# B".split()]
        self.key_filter.addItems(keys)
        self.key_filter.setToolTip("Filter by musical key (only shows matched tracks with key data)")
        self.key_filter.setMinimumWidth(150)
        key_layout.addWidget(self.key_filter)
        key_layout.addStretch()
        advanced_filters_layout.addLayout(key_layout)
        
        # Clear filters button
        clear_button = QPushButton("Clear All Filters")
        clear_button.setToolTip("Reset all filters to default values")
        clear_button.clicked.connect(self.clear_filters)
        advanced_filters_layout.addWidget(clear_button)
        
        advanced_filters_group.setLayout(advanced_filters_layout)
        layout.addWidget(advanced_filters_group)
        
        # Results table (existing from Phase 2)
        self.table = QTableWidget()
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        layout.addWidget(self.table)
        
        # Result count and filter status label
        status_layout = QHBoxLayout()
        self.result_count_label = QLabel("0 results")
        self.result_count_label.setStyleSheet("font-weight: bold;")
        status_layout.addWidget(self.result_count_label)
        
        self.filter_status_label = QLabel("")
        self.filter_status_label.setStyleSheet("color: gray;")
        status_layout.addStretch()
        status_layout.addWidget(self.filter_status_label)
        layout.addLayout(status_layout)
    
    def _setup_connections(self):
        """Setup signal connections for real-time filtering with debouncing"""
        # Connect existing filters
        self.search_box.textChanged.connect(self._trigger_filter_debounced)
        self.confidence_filter.currentTextChanged.connect(self._trigger_filter_debounced)
        
        # Connect new advanced filters
        self.year_min.valueChanged.connect(self._trigger_filter_debounced)
        self.year_max.valueChanged.connect(self._trigger_filter_debounced)
        self.bpm_min.valueChanged.connect(self._trigger_filter_debounced)
        self.bpm_max.valueChanged.connect(self._trigger_filter_debounced)
        self.key_filter.currentTextChanged.connect(self._trigger_filter_debounced)
        
        # Connect table sorting
        self.table.horizontalHeader().sortIndicatorChanged.connect(self._on_sort_changed)
    
    def _trigger_filter_debounced(self):
        """Trigger filter with debouncing for performance"""
        # Reset timer (debounce: wait 300ms after last change)
        self._filter_debounce_timer.stop()
        self._filter_debounce_timer.start(300)
    
    def _apply_filters_debounced(self):
        """Apply filters after debounce delay"""
        self.apply_filters()
    
    def _on_advanced_filters_toggled(self, checked: bool):
        """Handle advanced filters group expand/collapse"""
        # Update filter status label
        self._update_filter_status()
    
    def _on_sort_changed(self, logical_index: int, order: Qt.SortOrder):
        """Handle table column sorting"""
        # Re-apply filters to maintain sort
        self.apply_filters()
    
    def populate_results(self, results: List[TrackResult]):
        """Populate view with results (called from main window)"""
        self.results = results
        self.filtered_results = results.copy()
        self.apply_filters()
    
    def clear_filters(self):
        """Clear all advanced filters to default values"""
        self.year_min.setValue(1900)
        self.year_max.setValue(2100)
        self.bpm_min.setValue(60)
        self.bpm_max.setValue(200)
        self.key_filter.setCurrentText("All")
        self.search_box.clear()
        self.confidence_filter.setCurrentText("All")
        self.apply_filters()
    
    def _update_filter_status(self):
        """Update filter status label to show active filters"""
        active_filters = []
        
        # Check year filter
        if self.year_min.value() > 1900 or self.year_max.value() < 2100:
            min_val = self.year_min.value() if self.year_min.value() > 1900 else None
            max_val = self.year_max.value() if self.year_max.value() < 2100 else None
            if min_val and max_val:
                active_filters.append(f"Year: {min_val}-{max_val}")
            elif min_val:
                active_filters.append(f"Year: ≥{min_val}")
            elif max_val:
                active_filters.append(f"Year: ≤{max_val}")
        
        # Check BPM filter
        if self.bpm_min.value() > 60 or self.bpm_max.value() < 200:
            min_val = self.bpm_min.value() if self.bpm_min.value() > 60 else None
            max_val = self.bpm_max.value() if self.bpm_max.value() < 200 else None
            if min_val and max_val:
                active_filters.append(f"BPM: {min_val}-{max_val}")
            elif min_val:
                active_filters.append(f"BPM: ≥{min_val}")
            elif max_val:
                active_filters.append(f"BPM: ≤{max_val}")
        
        # Check key filter
        if self.key_filter.currentText() != "All":
            active_filters.append(f"Key: {self.key_filter.currentText()}")
        
        # Check search box
        if self.search_box.text():
            active_filters.append("Search")
        
        # Check confidence filter
        if self.confidence_filter.currentText() != "All":
            active_filters.append(f"Confidence: {self.confidence_filter.currentText()}")
        
        if active_filters:
            self.filter_status_label.setText(f"Active filters: {', '.join(active_filters)}")
        else:
            self.filter_status_label.setText("No filters active")
    
    def apply_filters(self):
        """
        Apply all filters including advanced filters.
        
        Tracks performance metrics if Phase 3 monitoring is enabled.
        Uses debouncing to avoid excessive filtering on rapid changes.
        """
        filter_start_time = time.time()
        
        # Start with all results
        filtered = self.results.copy()
        initial_count = len(filtered)
        
        # Existing filters (search box, confidence)
        search_text = self.search_box.text().lower().strip()
        if search_text:
            filtered = [
                r for r in filtered
                if search_text in r.title.lower() or 
                   search_text in r.artist.lower() or
                   (r.matched and search_text in (r.beatport_title or "").lower()) or
                   (r.matched and search_text in (r.beatport_artists or "").lower())
            ]
        
        confidence_filter = self.confidence_filter.currentText()
        if confidence_filter != "All":
            filtered = [
                r for r in filtered
                if r.matched and r.confidence == confidence_filter
            ]
        
        # NEW: Year range filter
        year_min_val = self.year_min.value() if self.year_min.value() > 1900 else None
        year_max_val = self.year_max.value() if self.year_max.value() < 2100 else None
        
        if year_min_val or year_max_val:
            filtered = [
                r for r in filtered
                if self._year_in_range(r, year_min_val, year_max_val)
            ]
        
        # NEW: BPM range filter
        bpm_min_val = self.bpm_min.value() if self.bpm_min.value() > 60 else None
        bpm_max_val = self.bpm_max.value() if self.bpm_max.value() < 200 else None
        
        if bpm_min_val or bpm_max_val:
            filtered = [
                r for r in filtered
                if self._bpm_in_range(r, bpm_min_val, bpm_max_val)
            ]
        
        # NEW: Key filter
        key_filter_val = self.key_filter.currentText()
        if key_filter_val != "All":
            filtered = [
                r for r in filtered
                if r.matched and r.beatport_key and r.beatport_key == key_filter_val
            ]
        
        # Store filtered results
        self.filtered_results = filtered
        
        # Update table
        self._populate_table(filtered)
        
        # Update result count and status
        count_text = f"{len(filtered)} of {len(self.results)} results"
        if len(filtered) < len(self.results):
            count_text += f" (filtered)"
        self.result_count_label.setText(count_text)
        self._update_filter_status()
        
        # Show message if no results
        if len(filtered) == 0 and len(self.results) > 0:
            self.result_count_label.setStyleSheet("font-weight: bold; color: red;")
            self.result_count_label.setText("No results match the current filters")
        else:
            self.result_count_label.setStyleSheet("font-weight: bold;")
        
        # Track performance
        filter_duration = time.time() - filter_start_time
        if hasattr(performance_collector, 'record_filter_operation'):
            performance_collector.record_filter_operation(
                duration=filter_duration,
                initial_count=initial_count,
                filtered_count=len(filtered),
                filters_applied={
                    "search": bool(search_text),
                    "confidence": confidence_filter if confidence_filter != "All" else None,
                    "year_range": (year_min_val, year_max_val),
                    "bpm_range": (bpm_min_val, bpm_max_val),
                    "key": key_filter_val if key_filter_val != "All" else None
                }
            )
        
        # Emit signal for other components
        self.filters_changed.emit()
    
    def _populate_table(self, results: List[TrackResult]):
        """Populate table with results (existing from Phase 2, enhanced)"""
        # Store current sort state
        sort_column = self.table.horizontalHeader().sortIndicatorSection()
        sort_order = self.table.horizontalHeader().sortIndicatorOrder()
        
        # Clear table
        self.table.setRowCount(0)
        
        if not results:
            self.table.setRowCount(1)
            self.table.setColumnCount(1)
            self.table.setItem(0, 0, QTableWidgetItem("No results to display"))
            self.table.item(0, 0).setTextAlignment(Qt.AlignCenter)
            return
        
        # Set up table columns (from Phase 2, with Beatport Artist column)
        self.table.setRowCount(len(results))
        self.table.setColumnCount(11)
        
        headers = [
            "Index", "Title", "Artist", "Matched", "Beatport Title",
            "Beatport Artist", "Score", "Confidence", "Key", "BPM", "Year"
        ]
        self.table.setHorizontalHeaderLabels(headers)
        
        # Populate rows
        for row, result in enumerate(results):
            # Index
            self.table.setItem(row, 0, QTableWidgetItem(str(result.playlist_index)))
            self.table.item(row, 0).setTextAlignment(Qt.AlignCenter)
            
            # Title
            self.table.setItem(row, 1, QTableWidgetItem(result.title))
            
            # Artist
            self.table.setItem(row, 2, QTableWidgetItem(result.artist))
            
            # Matched
            matched_item = QTableWidgetItem("Yes" if result.matched else "No")
            matched_item.setTextAlignment(Qt.AlignCenter)
            if result.matched:
                matched_item.setForeground(Qt.darkGreen)
            else:
                matched_item.setForeground(Qt.darkRed)
            self.table.setItem(row, 3, matched_item)
            
            # Beatport Title
            self.table.setItem(row, 4, QTableWidgetItem(result.beatport_title or ""))
            
            # Beatport Artist
            self.table.setItem(row, 5, QTableWidgetItem(result.beatport_artists or ""))
            
            # Score
            score_item = QTableWidgetItem(f"{result.match_score:.1f}" if result.match_score else "")
            score_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row, 6, score_item)
            
            # Confidence
            confidence_item = QTableWidgetItem(result.confidence or "")
            confidence_item.setTextAlignment(Qt.AlignCenter)
            if result.confidence == "High":
                confidence_item.setForeground(Qt.darkGreen)
            elif result.confidence == "Medium":
                confidence_item.setForeground(Qt.darkYellow)
            elif result.confidence == "Low":
                confidence_item.setForeground(Qt.darkRed)
            self.table.setItem(row, 7, confidence_item)
            
            # Key
            self.table.setItem(row, 8, QTableWidgetItem(result.beatport_key or ""))
            
            # BPM
            bpm_item = QTableWidgetItem(str(result.beatport_bpm) if result.beatport_bpm else "")
            bpm_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row, 9, bpm_item)
            
            # Year
            year_item = QTableWidgetItem(str(result.beatport_year) if result.beatport_year else "")
            year_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.table.setItem(row, 10, year_item)
        
        # Restore sort state
        if sort_column >= 0:
            self.table.sortItems(sort_column, sort_order)
        
        # Resize columns to content
        self.table.resizeColumnsToContents()
        
        # Set minimum column widths
        for col in range(self.table.columnCount()):
            current_width = self.table.columnWidth(col)
            self.table.setColumnWidth(col, max(current_width, 80))
```

#### Part B: Integrate into Main Window

**In `SRC/gui/main_window.py`:**

```python
# Results view is already integrated from Phase 2
# No additional integration needed - filters work automatically
# But we can add keyboard shortcuts for quick filter access

def setup_keyboard_shortcuts(self):
    """Setup keyboard shortcuts for filtering"""
    # Ctrl+F to focus search box
    search_shortcut = QShortcut(QKeySequence("Ctrl+F"), self)
    search_shortcut.activated.connect(lambda: self.results_view.search_box.setFocus())
    
    # Ctrl+Shift+F to clear filters
    clear_shortcut = QShortcut(QKeySequence("Ctrl+Shift+F"), self)
    clear_shortcut.activated.connect(self.results_view.clear_filters)
```

**Implementation Checklist**:
- [ ] Complete ResultsView integration with all UI components
- [ ] Add debouncing for filter performance
- [ ] Add filter status label
- [ ] Add clear filters functionality
- [ ] Add keyboard shortcuts (optional)
- [ ] Test all UI interactions
- [ ] Test filter combinations
- [ ] Test performance with large datasets
- [ ] Test debouncing effectiveness

---

### Substep 4.2.7: Comprehensive Testing (1-2 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_advanced_filtering.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for advanced filtering features.

Tests all filter types, combinations, edge cases, and performance.
"""

import unittest
from unittest.mock import Mock, patch
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys
import time

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.results_view import ResultsView
from SRC.processor import TrackResult

class MockTrackResult:
    """Mock TrackResult for testing"""
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

class TestAdvancedFiltering(unittest.TestCase):
    """Comprehensive tests for advanced filtering functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.view = ResultsView()
        
        # Create comprehensive test data
        self.view.results = [
            MockTrackResult(
                playlist_index=1,
                title="Track 2020",
                artist="Artist A",
                matched=True,
                beatport_title="Track 2020",
                beatport_artists="Artist A",
                match_score=95.0,
                confidence="High",
                beatport_key="C Major",
                beatport_bpm="128",
                beatport_year=2020
            ),
            MockTrackResult(
                playlist_index=2,
                title="Track 2023",
                artist="Artist B",
                matched=True,
                beatport_title="Track 2023",
                beatport_artists="Artist B",
                match_score=88.0,
                confidence="Medium",
                beatport_key="A Minor",
                beatport_bpm="130",
                beatport_year=2023
            ),
            MockTrackResult(
                playlist_index=3,
                title="Track 2015",
                artist="Artist C",
                matched=True,
                beatport_title="Track 2015",
                beatport_artists="Artist C",
                match_score=92.0,
                confidence="High",
                beatport_key="G Major",
                beatport_bpm="125",
                beatport_year=2015
            ),
            MockTrackResult(
                playlist_index=4,
                title="Unmatched Track",
                artist="Artist D",
                matched=False,
                beatport_title=None,
                beatport_artists=None,
                match_score=None,
                confidence=None,
                beatport_key=None,
                beatport_bpm=None,
                beatport_year=None
            ),
            MockTrackResult(
                playlist_index=5,
                title="Track No Year",
                artist="Artist E",
                matched=True,
                beatport_title="Track No Year",
                beatport_artists="Artist E",
                match_score=85.0,
                confidence="Low",
                beatport_key="D Major",
                beatport_bpm="140",
                beatport_year=None  # Missing year
            ),
            MockTrackResult(
                playlist_index=6,
                title="Track No BPM",
                artist="Artist F",
                matched=True,
                beatport_title="Track No BPM",
                beatport_artists="Artist F",
                match_score=90.0,
                confidence="High",
                beatport_key="E Minor",
                beatport_bpm=None,  # Missing BPM
                beatport_year=2022
            ),
            MockTrackResult(
                playlist_index=7,
                title="Track No Key",
                artist="Artist G",
                matched=True,
                beatport_title="Track No Key",
                beatport_artists="Artist G",
                match_score=87.0,
                confidence="Medium",
                beatport_key=None,  # Missing key
                beatport_bpm="135",
                beatport_year=2021
            ),
        ]
    
    def test_year_range_filter_min_only(self):
        """Test year range filter with minimum year only"""
        self.view.year_min.setValue(2020)
        self.view.year_max.setValue(2100)  # Default max
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        # Should include tracks from 2020, 2023 (but not 2015, and not unmatched/no year)
        years = [r.beatport_year for r in filtered if r.matched and r.beatport_year]
        self.assertTrue(all(year >= 2020 for year in years))
        self.assertIn(2020, years)
        self.assertIn(2023, years)
        self.assertNotIn(2015, years)
    
    def test_year_range_filter_max_only(self):
        """Test year range filter with maximum year only"""
        self.view.year_min.setValue(1900)  # Default min
        self.view.year_max.setValue(2020)
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        years = [r.beatport_year for r in filtered if r.matched and r.beatport_year]
        self.assertTrue(all(year <= 2020 for year in years))
        self.assertIn(2020, years)
        self.assertIn(2015, years)
        self.assertNotIn(2023, years)
    
    def test_year_range_filter_both(self):
        """Test year range filter with both min and max"""
        self.view.year_min.setValue(2018)
        self.view.year_max.setValue(2022)
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        years = [r.beatport_year for r in filtered if r.matched and r.beatport_year]
        self.assertTrue(all(2018 <= year <= 2022 for year in years))
        self.assertIn(2020, years)
        self.assertIn(2021, years)
        self.assertNotIn(2015, years)
        self.assertNotIn(2023, years)
    
    def test_year_range_filter_no_match(self):
        """Test year range filter with no matching years"""
        self.view.year_min.setValue(2030)
        self.view.year_max.setValue(2040)
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        years = [r.beatport_year for r in filtered if r.matched and r.beatport_year]
        self.assertEqual(len(years), 0)
    
    def test_bpm_range_filter_min_only(self):
        """Test BPM range filter with minimum BPM only"""
        self.view.bpm_min.setValue(130)
        self.view.bpm_max.setValue(200)  # Default max
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        bpms = [float(r.beatport_bpm) for r in filtered if r.matched and r.beatport_bpm]
        self.assertTrue(all(bpm >= 130 for bpm in bpms))
        self.assertIn(130.0, bpms)
        self.assertIn(135.0, bpms)
        self.assertIn(140.0, bpms)
        self.assertNotIn(125.0, bpms)
        self.assertNotIn(128.0, bpms)
    
    def test_bpm_range_filter_max_only(self):
        """Test BPM range filter with maximum BPM only"""
        self.view.bpm_min.setValue(60)  # Default min
        self.view.bpm_max.setValue(130)
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        bpms = [float(r.beatport_bpm) for r in filtered if r.matched and r.beatport_bpm]
        self.assertTrue(all(bpm <= 130 for bpm in bpms))
        self.assertIn(125.0, bpms)
        self.assertIn(128.0, bpms)
        self.assertIn(130.0, bpms)
        self.assertNotIn(135.0, bpms)
        self.assertNotIn(140.0, bpms)
    
    def test_bpm_range_filter_both(self):
        """Test BPM range filter with both min and max"""
        self.view.bpm_min.setValue(128)
        self.view.bpm_max.setValue(135)
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        bpms = [float(r.beatport_bpm) for r in filtered if r.matched and r.beatport_bpm]
        self.assertTrue(all(128 <= bpm <= 135 for bpm in bpms))
        self.assertIn(128.0, bpms)
        self.assertIn(130.0, bpms)
        self.assertIn(135.0, bpms)
        self.assertNotIn(125.0, bpms)
        self.assertNotIn(140.0, bpms)
    
    def test_key_filter_specific_key(self):
        """Test key filter with specific key"""
        self.view.key_filter.setCurrentText("C Major")
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        keys = [r.beatport_key for r in filtered if r.matched and r.beatport_key]
        self.assertTrue(all(key == "C Major" for key in keys))
        self.assertEqual(len(keys), 1)
    
    def test_key_filter_all(self):
        """Test key filter with 'All' selected"""
        self.view.key_filter.setCurrentText("All")
        self.view.apply_filters()
        
        # Should show all matched tracks (regardless of key)
        filtered = self.view.filtered_results
        matched_count = sum(1 for r in filtered if r.matched)
        self.assertGreater(matched_count, 0)
    
    def test_filter_combinations_year_and_bpm(self):
        """Test combining year and BPM filters"""
        self.view.year_min.setValue(2020)
        self.view.year_max.setValue(2023)
        self.view.bpm_min.setValue(128)
        self.view.bpm_max.setValue(135)
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        for result in filtered:
            if result.matched and result.beatport_year and result.beatport_bpm:
                self.assertGreaterEqual(result.beatport_year, 2020)
                self.assertLessEqual(result.beatport_year, 2023)
                self.assertGreaterEqual(float(result.beatport_bpm), 128)
                self.assertLessEqual(float(result.beatport_bpm), 135)
    
    def test_filter_combinations_all_filters(self):
        """Test combining all filters together"""
        self.view.year_min.setValue(2020)
        self.view.year_max.setValue(2023)
        self.view.bpm_min.setValue(128)
        self.view.bpm_max.setValue(135)
        self.view.key_filter.setCurrentText("C Major")
        self.view.confidence_filter.setCurrentText("High")
        self.view.search_box.setText("Track")
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        # All filters should be applied (AND logic)
        for result in filtered:
            if result.matched:
                if result.beatport_year:
                    self.assertGreaterEqual(result.beatport_year, 2020)
                    self.assertLessEqual(result.beatport_year, 2023)
                if result.beatport_bpm:
                    self.assertGreaterEqual(float(result.beatport_bpm), 128)
                    self.assertLessEqual(float(result.beatport_bpm), 135)
                if result.beatport_key:
                    self.assertEqual(result.beatport_key, "C Major")
                self.assertEqual(result.confidence, "High")
                self.assertIn("Track", result.title)
    
    def test_filter_with_search_box(self):
        """Test filter works with existing search box"""
        self.view.search_box.setText("2020")
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        # Should only show tracks with "2020" in title, artist, or beatport fields
        for result in filtered:
            search_text = "2020"
            matches = (
                search_text in result.title.lower() or
                search_text in result.artist.lower() or
                (result.matched and search_text in (result.beatport_title or "").lower())
            )
            self.assertTrue(matches)
    
    def test_filter_with_confidence(self):
        """Test filter works with existing confidence filter"""
        self.view.confidence_filter.setCurrentText("High")
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        # Should only show high confidence matches
        for result in filtered:
            if result.matched:
                self.assertEqual(result.confidence, "High")
    
    def test_empty_results_handling(self):
        """Test handling when no results match filters"""
        self.view.year_min.setValue(2050)
        self.view.year_max.setValue(2060)
        self.view.apply_filters()
        
        filtered = self.view.filtered_results
        self.assertEqual(len(filtered), 0)
        
        # Check that status label shows appropriate message
        self.assertIn("No results", self.view.result_count_label.text())
    
    def test_clear_filters(self):
        """Test clear filters functionality"""
        # Set some filters
        self.view.year_min.setValue(2020)
        self.view.bpm_min.setValue(130)
        self.view.key_filter.setCurrentText("C Major")
        self.view.search_box.setText("test")
        
        # Clear filters
        self.view.clear_filters()
        
        # Verify all filters reset
        self.assertEqual(self.view.year_min.value(), 1900)
        self.assertEqual(self.view.year_max.value(), 2100)
        self.assertEqual(self.view.bpm_min.value(), 60)
        self.assertEqual(self.view.bpm_max.value(), 200)
        self.assertEqual(self.view.key_filter.currentText(), "All")
        self.assertEqual(self.view.search_box.text(), "")
        self.assertEqual(self.view.confidence_filter.currentText(), "All")
        
        # Verify all results shown
        self.assertEqual(len(self.view.filtered_results), len(self.view.results))
    
    def test_filter_performance_large_dataset(self):
        """Test filter performance with large dataset"""
        import time
        
        # Create large dataset
        large_results = [
            MockTrackResult(
                playlist_index=i,
                title=f"Track {i}",
                artist=f"Artist {i % 10}",
                matched=(i % 2 == 0),
                beatport_year=2020 + (i % 5),
                beatport_bpm=str(120 + (i % 20)),
                beatport_key="C Major" if i % 3 == 0 else "A Minor",
                confidence="High" if i % 4 == 0 else "Medium"
            )
            for i in range(1000)
        ]
        
        self.view.results = large_results
        
        # Measure filter time
        start_time = time.time()
        self.view.apply_filters()
        filter_time = time.time() - start_time
        
        # Should complete in reasonable time (< 1 second for 1000 tracks)
        self.assertLess(filter_time, 1.0)
    
    def test_filter_debouncing(self):
        """Test that filter debouncing works"""
        # Rapidly change filter values
        for i in range(10):
            self.view.year_min.setValue(2020 + i)
            QApplication.processEvents()
        
        # Wait for debounce timer
        import time
        time.sleep(0.5)  # Wait longer than debounce delay (300ms)
        QApplication.processEvents()
        
        # Filter should have been applied only once (after debounce)
        # This is hard to test directly, but we can verify the final state
        self.assertEqual(self.view.year_min.value(), 2029)
    
    def test_invalid_year_data(self):
        """Test handling of invalid year data"""
        # Add result with invalid year
        invalid_result = MockTrackResult(
            playlist_index=99,
            title="Invalid Year Track",
            artist="Artist",
            matched=True,
            beatport_year="invalid",  # Invalid year
            beatport_bpm="128"
        )
        self.view.results.append(invalid_result)
        
        self.view.year_min.setValue(2020)
        self.view.apply_filters()
        
        # Invalid year should be excluded
        filtered = self.view.filtered_results
        for result in filtered:
            if result.playlist_index == 99:
                # Should not appear in filtered results
                self.fail("Invalid year result should be excluded")
    
    def test_invalid_bpm_data(self):
        """Test handling of invalid BPM data"""
        # Add result with invalid BPM
        invalid_result = MockTrackResult(
            playlist_index=98,
            title="Invalid BPM Track",
            artist="Artist",
            matched=True,
            beatport_year=2022,
            beatport_bpm="invalid"  # Invalid BPM
        )
        self.view.results.append(invalid_result)
        
        self.view.bpm_min.setValue(120)
        self.view.apply_filters()
        
        # Invalid BPM should be excluded
        filtered = self.view.filtered_results
        for result in filtered:
            if result.playlist_index == 98:
                # Should not appear in filtered results
                self.fail("Invalid BPM result should be excluded")
    
    def test_filter_status_label(self):
        """Test filter status label updates correctly"""
        self.view.year_min.setValue(2020)
        self.view.bpm_min.setValue(130)
        self.view.key_filter.setCurrentText("C Major")
        self.view.apply_filters()
        
        status_text = self.view.filter_status_label.text()
        self.assertIn("Active filters", status_text)
        self.assertIn("Year", status_text)
        self.assertIn("BPM", status_text)
        self.assertIn("Key", status_text)
    
    def test_result_count_label(self):
        """Test result count label updates correctly"""
        self.view.apply_filters()
        
        # Should show total count
        count_text = self.view.result_count_label.text()
        self.assertIn(str(len(self.view.results)), count_text)
        
        # Apply filter
        self.view.year_min.setValue(2020)
        self.view.apply_filters()
        
        # Should show filtered count
        count_text = self.view.result_count_label.text()
        self.assertIn(str(len(self.view.filtered_results)), count_text)
        if len(self.view.filtered_results) < len(self.view.results):
            self.assertIn("filtered", count_text)

if __name__ == '__main__':
    unittest.main()
```

#### Part B: GUI Integration Tests (`SRC/test_filtering_gui.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for advanced filtering.

Tests UI interactions, widget states, and user experience.
"""

import unittest
from unittest.mock import Mock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.results_view import ResultsView

class TestFilteringGUI(unittest.TestCase):
    """Tests for filtering GUI components"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.view = ResultsView()
        # Add test data
        self.view.results = [
            Mock(playlist_index=1, title="Track 1", artist="Artist", matched=True,
                 beatport_year=2020, beatport_bpm="128", beatport_key="C Major")
        ]
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.view.close()
    
    def test_advanced_filters_group_collapsible(self):
        """Test advanced filters group is collapsible"""
        self.assertFalse(self.view.findChild(QGroupBox, "advanced_filters_group").isChecked())
    
    def test_year_spinboxes_initial_values(self):
        """Test year spinboxes have correct initial values"""
        self.assertEqual(self.view.year_min.value(), 1900)
        self.assertEqual(self.view.year_max.value(), 2100)
        self.assertEqual(self.view.year_min.specialValueText(), "Any")
        self.assertEqual(self.view.year_max.specialValueText(), "Any")
    
    def test_bpm_spinboxes_initial_values(self):
        """Test BPM spinboxes have correct initial values"""
        self.assertEqual(self.view.bpm_min.value(), 60)
        self.assertEqual(self.view.bpm_max.value(), 200)
    
    def test_key_filter_has_all_option(self):
        """Test key filter includes 'All' option"""
        self.assertEqual(self.view.key_filter.itemText(0), "All")
    
    def test_clear_filters_button(self):
        """Test clear filters button exists and works"""
        clear_button = self.view.findChild(QPushButton, "clear_filters_button")
        self.assertIsNotNone(clear_button)
        
        # Set some filters
        self.view.year_min.setValue(2020)
        self.view.bpm_min.setValue(130)
        
        # Click clear button
        QTest.mouseClick(clear_button, Qt.LeftButton)
        
        # Verify filters reset
        self.assertEqual(self.view.year_min.value(), 1900)
        self.assertEqual(self.view.bpm_min.value(), 60)

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Integration Tests (`SRC/test_filtering_integration.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for filtering functionality.

Tests end-to-end filtering workflow with real data.
"""

import unittest
from unittest.mock import Mock, patch
from PySide6.QtWidgets import QApplication
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.main_window import MainWindow
from SRC.gui.results_view import ResultsView

class TestFilteringIntegration(unittest.TestCase):
    """Integration tests for filtering workflow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.main_window = MainWindow()
        # Mock results
        self.main_window.results = [
            Mock(playlist_index=i, title=f"Track {i}", artist=f"Artist {i}",
                 matched=(i % 2 == 0), beatport_year=2020 + (i % 5),
                 beatport_bpm=str(120 + i), beatport_key="C Major" if i % 2 == 0 else "A Minor")
            for i in range(100)
        ]
        
        # Populate results view
        if hasattr(self.main_window, 'results_view'):
            self.main_window.results_view.populate_results(self.main_window.results)
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.main_window.close()
    
    def test_filter_integration_with_main_window(self):
        """Test filtering integrates with main window"""
        results_view = self.main_window.results_view
        
        # Apply filter
        results_view.year_min.setValue(2022)
        results_view.apply_filters()
        
        # Verify filtered results
        self.assertLessEqual(len(results_view.filtered_results), len(results_view.results))
    
    def test_filter_preserves_table_sorting(self):
        """Test that filtering preserves table sorting"""
        results_view = self.main_window.results_view
        
        # Sort table by year
        results_view.table.sortItems(10, Qt.AscendingOrder)  # Year column
        
        # Apply filter
        results_view.year_min.setValue(2020)
        results_view.apply_filters()
        
        # Verify table is still sorted
        sort_column = results_view.table.horizontalHeader().sortIndicatorSection()
        self.assertEqual(sort_column, 10)  # Year column

if __name__ == '__main__':
    unittest.main()
```

#### Part D: Manual Testing Checklist

**UI Testing Checklist**:
- [ ] Advanced filters group is visible and collapsible
- [ ] Year range spinboxes are visible and functional
- [ ] BPM range spinboxes are visible and functional
- [ ] Key filter dropdown is visible and functional
- [ ] Clear filters button is visible and works
- [ ] Filter status label updates correctly
- [ ] Result count label updates correctly
- [ ] Filters apply in real-time (with debouncing)
- [ ] Format switching works correctly
- [ ] Table updates when filters change
- [ ] Table sorting works with filtered results
- [ ] Empty results message displays correctly
- [ ] All filters can be cleared at once
- [ ] Keyboard shortcuts work (if implemented)
- [ ] Tooltips are helpful and accurate
- [ ] UI is responsive during filtering
- [ ] No UI freezing with large datasets

**Functional Testing Checklist**:
- [ ] Year range filter (min only) works
- [ ] Year range filter (max only) works
- [ ] Year range filter (both) works
- [ ] Year range filter (no match) shows empty message
- [ ] BPM range filter (min only) works
- [ ] BPM range filter (max only) works
- [ ] BPM range filter (both) works
- [ ] BPM range filter (no match) shows empty message
- [ ] Key filter (specific key) works
- [ ] Key filter (All) shows all tracks
- [ ] Search box filter works with advanced filters
- [ ] Confidence filter works with advanced filters
- [ ] All filters combine correctly (AND logic)
- [ ] Filters handle missing data correctly
- [ ] Filters handle invalid data correctly
- [ ] Filters handle empty results correctly
- [ ] Filter debouncing works (no excessive filtering)
- [ ] Filter performance acceptable (< 1s for 1000 tracks)
- [ ] Filter status updates correctly
- [ ] Result count updates correctly

**Cross-Step Integration Testing**:
- [ ] Filters work with Step 4.1 (Enhanced Export) - verify filtered results export correctly
- [ ] Filters work with Phase 3 performance tracking
- [ ] Filters work with existing Phase 2 features (sorting, search)
- [ ] Filters maintain state when switching tabs
- [ ] Filters work with batch processing results

**Performance Testing**:
- [ ] Filter 100 tracks: < 0.1 seconds
- [ ] Filter 1000 tracks: < 0.5 seconds
- [ ] Filter 10000 tracks: < 2 seconds
- [ ] Rapid filter changes don't cause UI freezing
- [ ] Debouncing reduces unnecessary filtering
- [ ] Memory usage acceptable during filtering
- [ ] No memory leaks with repeated filtering

**Error Scenario Testing**:
- [ ] Invalid year data → Excluded from results
- [ ] Invalid BPM data → Excluded from results
- [ ] Missing year data → Handled gracefully
- [ ] Missing BPM data → Handled gracefully
- [ ] Missing key data → Handled gracefully
- [ ] Empty results → Shows clear message
- [ ] Large datasets → Performance acceptable
- [ ] Rapid changes → Debouncing works

**User Experience Testing**:
- [ ] Filters are intuitive to use
- [ ] Filter status is clear
- [ ] Result count is accurate
- [ ] Empty results message is helpful
- [ ] Clear filters button is easy to find
- [ ] Tooltips are helpful
- [ ] UI is responsive
- [ ] No confusing error messages

---

## Testing Requirements

### Unit Tests
- [ ] Test each filter independently
- [ ] Test filter combinations
- [ ] Test edge cases (empty data, invalid data)
- [ ] Test error handling
- [ ] Minimum 80% code coverage

### Integration Tests
- [ ] Test with real results
- [ ] Test with existing filters
- [ ] Test with large datasets
- [ ] Test performance

### User Acceptance Tests
- [ ] Filters work as expected
- [ ] UI is intuitive
- [ ] Performance is acceptable
- [ ] Error messages are clear

---

## Error Handling

### Error Scenarios
1. **Invalid Data**
   - Missing year/BPM → Exclude from filtered results
   - Invalid type → Handle conversion errors
   - Empty results → Show clear message

2. **Performance Issues**
   - Large datasets → Optimize filtering
   - Rapid filter changes → Consider debouncing

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Existing filters continue to work
- [ ] New filters are additions
- [ ] No breaking changes
- [ ] Default filter values show all results

---

## Documentation Requirements

### User Guide Updates
- [ ] Document new filter options
- [ ] Explain how filters work together
- [ ] Provide usage examples
- [ ] Update screenshots

### API Documentation
- [ ] Document filter methods
- [ ] Document helper functions
- [ ] Document performance characteristics

---

## Phase 3 Integration

### Performance Metrics
- [ ] Track filter operation times
- [ ] Track filter usage statistics
- [ ] Track result count changes
- [ ] Include in performance reports

---

## Acceptance Criteria
- ✅ Year range filter works
- ✅ BPM range filter works
- ✅ Key filter works
- ✅ Filters combine correctly
- ✅ Performance acceptable with large datasets
- ✅ Error handling robust
- ✅ Performance tracking integrated
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 4.2.1: Add Advanced Filter UI Components
- [ ] Substep 4.2.2: Implement Filter Logic
- [ ] Substep 4.2.3: Add Advanced Filters to HistoryView
- [ ] Substep 4.2.4: Implement Resizable UI Sections
- [ ] Substep 4.2.5: Fix Playlist Index Sorting
- [ ] Substep 4.2.6: Connect Filter Signals and Integrate
- [ ] Substep 4.2.7: Testing
- [ ] Documentation updated
- [ ] All tests passing

---

**Next Step**: After completing Step 4.2, proceed to Step 4.3 (Async I/O) or other Phase 4 steps based on priority, or move to Phase 5 if Phase 4 is complete.

