# Design: Results Preview and Table View

**Number**: 19  
**Status**: 📝 Planned  
**Priority**: ⚡ P1 - High Priority  
**Effort**: 3-4 days  
**Impact**: High - Essential GUI functionality  
**Phase**: 2 (GUI User Experience)

---

## 1. Overview

### 1.1 Problem Statement

After processing completes, users need to:
- Review results visually
- Sort by different criteria (score, confidence, title)
- Filter results (matched/unmatched, confidence levels)
- Search for specific tracks
- Select rows for bulk operations
- View detailed information per track

Currently, results are only available in CSV files, requiring external tools for viewing.

### 1.2 Solution Overview

Implement a comprehensive results table widget that:
1. **Displays all results** in an interactive table
2. **Sortable columns** for all data fields
3. **Filterable results** by confidence, matched status
4. **Search functionality** to find specific tracks
5. **Row selection** for bulk operations
6. **Column customization** (visibility, resize, reorder)
7. **Context menu** for row actions
8. **Double-click** to view track details

---

## 2. Architecture Design

### 2.1 Component Structure

```
ResultsView (QWidget)
├── QVBoxLayout
│   ├── Toolbar (QWidget)
│   │   ├── Search box (QLineEdit)
│   │   ├── Filter dropdown (QComboBox)
│   │   └── Export button (QPushButton)
│   │
│   └── ResultsTable (QTableWidget)
│       ├── Headers (customizable)
│       ├── Rows (from TrackResult objects)
│       └── Context menu (right-click)
│
└── SummaryPanel (QWidget)
    └── Statistics cards
```

### 2.2 Data Flow

```
Processing Complete
    ↓
TrackResult objects
    ↓
ResultsView.populate()
    ↓
QTableWidget rows
    ↓
User interaction (sort, filter, search)
    ↓
Proxy model filters/sorts
    ↓
Displayed table
```

---

## 3. Implementation Details

### 3.1 Results Table Widget

**Location**: `SRC/gui/results_view.py` (MODIFY)

**Column Definitions**:

```python
COLUMNS = [
    {'key': 'playlist_index', 'label': '#', 'width': 50, 'sortable': True},
    {'key': 'original_title', 'label': 'Title', 'width': 250, 'sortable': True},
    {'key': 'original_artists', 'label': 'Artists', 'width': 200, 'sortable': True},
    {'key': 'beatport_title', 'label': 'Beatport Title', 'width': 250, 'sortable': True},
    {'key': 'beatport_artists', 'label': 'Beatport Artists', 'width': 200, 'sortable': True},
    {'key': 'match_score', 'label': 'Score', 'width': 80, 'sortable': True, 'format': 'float'},
    {'key': 'confidence', 'label': 'Confidence', 'width': 100, 'sortable': True},
    {'key': 'title_sim', 'label': 'Title Sim', 'width': 80, 'sortable': True, 'format': 'int'},
    {'key': 'artist_sim', 'label': 'Artist Sim', 'width': 80, 'sortable': True, 'format': 'int'},
    {'key': 'beatport_key', 'label': 'Key', 'width': 80, 'sortable': True},
    {'key': 'beatport_bpm', 'label': 'BPM', 'width': 60, 'sortable': True},
    {'key': 'beatport_url', 'label': 'URL', 'width': 200, 'sortable': False, 'hidden': True},
]
```

**Implementation**:

```python
# SRC/gui/results_view.py
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget,
    QTableWidgetItem, QHeaderView, QLineEdit, QComboBox,
    QPushButton, QLabel, QMenu, QMessageBox
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QBrush, QContextMenuEvent

class ResultsView(QWidget):
    """Results table view widget"""
    
    track_selected = Signal(int)  # Emit playlist_index when track selected
    export_requested = Signal(list)  # Emit selected rows for export
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results: List[TrackResult] = []
        self._setup_ui()
        self._setup_table()
    
    def _setup_ui(self):
        """Set up UI layout"""
        layout = QVBoxLayout()
        
        # Toolbar
        toolbar = self._create_toolbar()
        layout.addWidget(toolbar)
        
        # Table
        self.table = QTableWidget()
        self.table.setColumnCount(len(COLUMNS))
        self.table.setHorizontalHeaderLabels([col['label'] for col in COLUMNS])
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setSelectionMode(QTableWidget.ExtendedSelection)
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.setContextMenuPolicy(Qt.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._show_context_menu)
        self.table.doubleClicked.connect(self._on_row_double_clicked)
        layout.addWidget(self.table)
        
        # Summary panel
        self.summary_panel = self._create_summary_panel()
        layout.addWidget(self.summary_panel)
        
        self.setLayout(layout)
    
    def _create_toolbar(self) -> QWidget:
        """Create toolbar with search and filter"""
        toolbar = QWidget()
        layout = QHBoxLayout()
        
        # Search box
        search_label = QLabel("Search:")
        layout.addWidget(search_label)
        
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search by title or artist...")
        self.search_box.textChanged.connect(self._apply_filter)
        layout.addWidget(self.search_box)
        
        # Filter dropdown
        filter_label = QLabel("Filter:")
        layout.addWidget(filter_label)
        
        self.filter_combo = QComboBox()
        self.filter_combo.addItems([
            "All", "Matched", "Unmatched",
            "High Confidence", "Medium Confidence", "Low Confidence",
            "Needs Review"
        ])
        self.filter_combo.currentTextChanged.connect(self._apply_filter)
        layout.addWidget(self.filter_combo)
        
        layout.addStretch()
        
        # Export button
        export_button = QPushButton("Export Selected")
        export_button.clicked.connect(self._export_selected)
        layout.addWidget(export_button)
        
        toolbar.setLayout(layout)
        return toolbar
    
    def populate(self, results: List[TrackResult]):
        """Populate table with results"""
        self.results = results
        self.table.setRowCount(len(results))
        
        for row_idx, result in enumerate(results):
            for col_idx, col_def in enumerate(COLUMNS):
                value = self._get_cell_value(result, col_def['key'])
                item = QTableWidgetItem(str(value))
                
                # Set item properties
                item.setFlags(Qt.ItemIsSelectable | Qt.ItemIsEnabled)
                if col_def.get('sortable', True):
                    # Set sort data
                    if col_def.get('format') == 'float':
                        item.setData(Qt.UserRole, float(value) if value else 0.0)
                    elif col_def.get('format') == 'int':
                        item.setData(Qt.UserRole, int(value) if value else 0)
                    else:
                        item.setData(Qt.UserRole, str(value).lower())
                
                # Color coding by confidence
                if col_def['key'] == 'confidence':
                    if value == 'high':
                        item.setForeground(QBrush(QColor(0, 150, 0)))  # Green
                    elif value == 'medium':
                        item.setForeground(QBrush(QColor(255, 165, 0)))  # Orange
                    else:
                        item.setForeground(QBrush(QColor(200, 0, 0)))  # Red
                
                # Color coding for matched/unmatched
                if col_def['key'] == 'beatport_url':
                    if not value or not value.strip():
                        # Unmatched - light red background
                        for c in range(self.table.columnCount()):
                            if self.table.item(row_idx, c):
                                self.table.item(row_idx, c).setBackground(QBrush(QColor(255, 240, 240)))
                
                self.table.setItem(row_idx, col_idx, item)
        
        # Resize columns
        header = self.table.horizontalHeader()
        for col_idx, col_def in enumerate(COLUMNS):
            header.resizeSection(col_idx, col_def['width'])
        
        # Hide hidden columns
        for col_idx, col_def in enumerate(COLUMNS):
            if col_def.get('hidden', False):
                self.table.hideColumn(col_idx)
        
        self._update_summary()
    
    def _get_cell_value(self, result: TrackResult, key: str) -> str:
        """Get cell value from TrackResult"""
        # Convert TrackResult to dict for easier access
        result_dict = result.to_dict()
        return result_dict.get(key, "")
    
    def _apply_filter(self):
        """Apply search and filter"""
        search_text = self.search_box.text().lower()
        filter_text = self.filter_combo.currentText()
        
        for row_idx in range(self.table.rowCount()):
            row_visible = True
            
            # Search filter
            if search_text:
                title = self.table.item(row_idx, 1).text().lower()  # Title column
                artists = self.table.item(row_idx, 2).text().lower()  # Artists column
                if search_text not in title and search_text not in artists:
                    row_visible = False
            
            # Filter dropdown
            if filter_text != "All":
                if filter_text == "Matched":
                    url_item = self.table.item(row_idx, 11)  # URL column
                    if not url_item or not url_item.text().strip():
                        row_visible = False
                elif filter_text == "Unmatched":
                    url_item = self.table.item(row_idx, 11)
                    if url_item and url_item.text().strip():
                        row_visible = False
                elif filter_text == "High Confidence":
                    conf_item = self.table.item(row_idx, 6)  # Confidence column
                    if not conf_item or conf_item.text() != "high":
                        row_visible = False
                elif filter_text == "Medium Confidence":
                    conf_item = self.table.item(row_idx, 6)
                    if not conf_item or conf_item.text() != "medium":
                        row_visible = False
                elif filter_text == "Low Confidence":
                    conf_item = self.table.item(row_idx, 6)
                    if not conf_item or conf_item.text() != "low":
                        row_visible = False
                elif filter_text == "Needs Review":
                    score_item = self.table.item(row_idx, 5)  # Score column
                    url_item = self.table.item(row_idx, 11)
                    score = float(score_item.text()) if score_item else 0.0
                    if score >= 70 and url_item and url_item.text().strip():
                        row_visible = False
            
            self.table.setRowHidden(row_idx, not row_visible)
    
    def _show_context_menu(self, position):
        """Show context menu for row"""
        item = self.table.itemAt(position)
        if not item:
            return
        
        row = item.row()
        menu = QMenu(self)
        
        # View details
        view_action = menu.addAction("View Details")
        view_action.triggered.connect(lambda: self._view_details(row))
        
        # Open Beatport URL
        url_item = self.table.item(row, 11)  # URL column
        if url_item and url_item.text().strip():
            open_action = menu.addAction("Open Beatport URL")
            open_action.triggered.connect(lambda: self._open_url(row))
        
        menu.addSeparator()
        
        # Select row
        select_action = menu.addAction("Select Row")
        select_action.triggered.connect(lambda: self._select_row(row))
        
        menu.exec_(self.table.viewport().mapToGlobal(position))
    
    def _on_row_double_clicked(self, index):
        """Handle double-click on row"""
        self._view_details(index.row())
    
    def _view_details(self, row: int):
        """View track details dialog"""
        if row < len(self.results):
            result = self.results[row]
            # Show details dialog (to be implemented)
            self.track_selected.emit(result.playlist_index)
    
    def _open_url(self, row: int):
        """Open Beatport URL in browser"""
        url_item = self.table.item(row, 11)
        if url_item and url_item.text().strip():
            import webbrowser
            webbrowser.open(url_item.text())
    
    def _select_row(self, row: int):
        """Select row"""
        self.table.selectRow(row)
    
    def _export_selected(self):
        """Export selected rows"""
        selected_rows = []
        for item in self.table.selectedItems():
            row = item.row()
            if row not in selected_rows:
                selected_rows.append(row)
        
        if selected_rows:
            results_to_export = [self.results[r] for r in selected_rows]
            self.export_requested.emit(results_to_export)
        else:
            QMessageBox.information(self, "Export", "No rows selected.")
    
    def _create_summary_panel(self) -> QWidget:
        """Create summary statistics panel"""
        panel = QWidget()
        layout = QHBoxLayout()
        
        self.matched_label = QLabel("Matched: 0")
        self.unmatched_label = QLabel("Unmatched: 0")
        self.total_label = QLabel("Total: 0")
        
        layout.addWidget(self.matched_label)
        layout.addWidget(self.unmatched_label)
        layout.addWidget(self.total_label)
        layout.addStretch()
        
        panel.setLayout(layout)
        return panel
    
    def _update_summary(self):
        """Update summary statistics"""
        matched = sum(1 for r in self.results if r.matched)
        unmatched = len(self.results) - matched
        total = len(self.results)
        
        self.matched_label.setText(f"Matched: {matched}")
        self.unmatched_label.setText(f"Unmatched: {unmatched}")
        self.total_label.setText(f"Total: {total}")
```

---

## 4. Column Customization

### 4.1 Column Visibility Toggle

```python
# SRC/gui/results_view.py
def _create_view_menu(self):
    """Create view menu with column visibility"""
    view_menu = QMenu("Columns", self)
    
    for col_idx, col_def in enumerate(COLUMNS):
        action = QAction(col_def['label'], self)
        action.setCheckable(True)
        action.setChecked(not col_def.get('hidden', False))
        action.triggered.connect(
            lambda checked, idx=col_idx: self.table.setColumnHidden(idx, not checked)
        )
        view_menu.addAction(action)
    
    return view_menu
```

### 4.2 Column Resizing and Reordering

```python
# SRC/gui/results_view.py
def _setup_table(self):
    """Set up table properties"""
    # Allow column resizing
    header = self.table.horizontalHeader()
    header.setSectionResizeMode(QHeaderView.Interactive)
    
    # Allow column reordering
    header.setSectionsMovable(True)
    
    # Save column state
    header.sectionResized.connect(self._on_column_resized)
    header.sectionMoved.connect(self._on_column_moved)
```

---

## 5. Search and Filter Implementation

### 5.1 Search Functionality

- **Real-time search**: Updates as user types
- **Case-insensitive**: Matches regardless of case
- **Multi-field**: Searches title and artist columns
- **Highlight matches**: Optional (future enhancement)

### 5.2 Filter Options

- **All**: Show all results
- **Matched**: Only tracks with matches
- **Unmatched**: Only tracks without matches
- **High Confidence**: Score >= 90
- **Medium Confidence**: Score 70-89
- **Low Confidence**: Score < 70
- **Needs Review**: Low score or weak match

---

## 6. Performance Considerations

### 6.1 Large Result Sets

For playlists with 1000+ tracks:
- **Virtual scrolling**: Use QTableView with model instead of QTableWidget
- **Lazy loading**: Load visible rows only
- **Pagination**: Optional (if needed)

### 6.2 Optimization

- **Proxy model**: Use QSortFilterProxyModel for filtering/sorting
- **Debounce search**: Wait 300ms after typing stops
- **Background processing**: Filter/sort in background thread

---

## 7. Testing Strategy

### Unit Tests
- Column population: All columns filled correctly
- Sorting: All columns sort correctly
- Filtering: All filters work correctly
- Search: Search finds correct rows

### Integration Tests
- Table populates from TrackResult objects
- Context menu actions work
- Export selected rows works
- Summary statistics update correctly

### Manual Testing
- Visual appearance
- User interaction flow
- Performance with large datasets

---

## 8. Acceptance Criteria

- [ ] Table displays all results correctly
- [ ] All columns sortable
- [ ] Filter dropdown works
- [ ] Search box works
- [ ] Row selection works
- [ ] Context menu works
- [ ] Double-click shows details
- [ ] Column visibility toggle works
- [ ] Column resizing works
- [ ] Summary statistics update
- [ ] Export selected works
- [ ] Performance acceptable with 1000+ rows

---

## 9. Dependencies

- **Requires**: Phase 1 GUI Foundation (MainWindow, widgets)
- **Requires**: Phase 0 Backend (TrackResult objects)
- **Used By**: Export functionality, Detail views

---

## 10. Future Enhancements

- **Column customization**: Save column order/width
- **Export selected**: Multiple format options
- **Print preview**: Print results table
- **Copy to clipboard**: Copy selected rows
- **Highlight matches**: Highlight search matches
- **Chart integration**: Visual statistics

---

*This design is essential for Phase 2 completion.*

