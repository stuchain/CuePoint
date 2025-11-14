# Phase 2: GUI User Experience (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - HIGH PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

## Goal
Enhance GUI with advanced features for better user experience.

## Success Criteria
- [ ] Results table is sortable and filterable
- [ ] Multiple candidates can be displayed and compared
- [ ] Export supports multiple formats (CSV, JSON, Excel)
- [ ] All features tested and working

---

## Implementation Steps

### Step 2.1: Results Table with Sort/Filter (2 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.7 (results view exists)

**What to add - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import (
    QTableWidget, QTableWidgetItem, QHeaderView,
    QLineEdit, QComboBox, QPushButton, QVBoxLayout, QHBoxLayout
)
from PySide6.QtCore import Qt

class ResultsView(QWidget):
    """Enhanced results view with sorting and filtering"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results = []
        self.init_ui()
        
    def init_ui(self):
        """Initialize UI with sort/filter controls"""
        layout = QVBoxLayout(self)
        
        # Filter controls
        filter_layout = QHBoxLayout()
        
        # Search box
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search...")
        self.search_box.textChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.search_box)
        
        # Confidence filter
        self.confidence_filter = QComboBox()
        self.confidence_filter.addItems(["All", "High", "Medium", "Low"])
        self.confidence_filter.currentTextChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.confidence_filter)
        
        layout.addLayout(filter_layout)
        
        # Results table
        self.table = QTableWidget()
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        layout.addWidget(self.table)
        
    def populate_results(self, results: List[TrackResult]):
        """Populate table with results"""
        self.results = results
        self._update_table()
        
    def _update_table(self):
        """Update table with filtered/sorted results"""
        # Apply filters
        filtered = self._filter_results()
        
        # Set up table
        self.table.setRowCount(len(filtered))
        self.table.setColumnCount(10)  # Adjust based on columns needed
        
        # Set headers
        headers = [
            "Index", "Title", "Artist", "Matched", "Beatport Title",
            "Score", "Confidence", "Key", "BPM", "Year"
        ]
        self.table.setHorizontalHeaderLabels(headers)
        
        # Populate rows
        for row, result in enumerate(filtered):
            self.table.setItem(row, 0, QTableWidgetItem(str(result.playlist_index)))
            self.table.setItem(row, 1, QTableWidgetItem(result.title))
            self.table.setItem(row, 2, QTableWidgetItem(result.artist))
            self.table.setItem(row, 3, QTableWidgetItem("Yes" if result.matched else "No"))
            # ... add more columns
            
    def _filter_results(self) -> List[TrackResult]:
        """Apply filters to results"""
        filtered = self.results
        
        # Search filter
        search_text = self.search_box.text().lower()
        if search_text:
            filtered = [
                r for r in filtered
                if search_text in r.title.lower() or search_text in (r.artist or "").lower()
            ]
        
        # Confidence filter
        confidence = self.confidence_filter.currentText()
        if confidence != "All":
            filtered = [r for r in filtered if r.confidence == confidence.lower()]
            
        return filtered
        
    def apply_filters(self):
        """Apply filters and update table"""
        self._update_table()
```

**Implementation Checklist**:
- [ ] Add sortable columns (setSortingEnabled)
- [ ] Add filter by confidence (QComboBox)
- [ ] Add search box (QLineEdit)
- [ ] Add row selection
- [ ] Add column visibility toggle (optional)
- [ ] Connect filter controls to update table

**Acceptance Criteria**:
- ✅ Columns sortable
- ✅ Filter works
- ✅ Search works
- ✅ Selection works
- ✅ Performance acceptable with large result sets

**DO NOT**:
- ❌ Don't break existing functionality
- ❌ Don't make table too complex

**Design Reference**: `DOCS/DESIGNS/19_Results_Preview_Table_View_Design.md`

---

### Step 2.2: Multiple Candidate Display (1-2 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Step 2.1 (results table exists)

**What to add - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QTreeWidget, QTreeWidgetItem

class ResultsView(QWidget):
    """Results view with expandable candidate rows"""
    
    def populate_results(self, results: List[TrackResult]):
        """Populate with expandable rows"""
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels(["Track", "Match", "Score", "Details"])
        
        for result in results:
            # Main row
            main_item = QTreeWidgetItem([
                f"{result.title} - {result.artist}",
                "Yes" if result.matched else "No",
                f"{result.match_score:.1f}" if result.match_score else "N/A",
                ""
            ])
            self.tree.addTopLevelItem(main_item)
            
            # Candidate rows (expandable)
            if result.candidates:
                for i, candidate in enumerate(result.candidates[:5]):  # Top 5
                    candidate_item = QTreeWidgetItem([
                        candidate.get('candidate_title', ''),
                        f"{candidate.get('final_score', '0')}",
                        candidate.get('candidate_artists', ''),
                        candidate.get('candidate_url', '')
                    ])
                    main_item.addChild(candidate_item)
                    
            main_item.setExpanded(False)  # Collapsed by default
```

**Implementation Checklist**:
- [ ] Add expandable rows showing top candidates
- [ ] Add comparison view
- [ ] Add manual selection (radio buttons)
- [ ] Add Accept/Reject buttons
- [ ] Update result when candidate selected

**Acceptance Criteria**:
- ✅ Top candidates shown
- ✅ Comparison works
- ✅ Selection works
- ✅ Accept/Reject updates result

**Design Reference**: `DOCS/DESIGNS/04_Multiple_Candidate_Output_Design.md`

---

### Step 2.3: Export Format Options (2-3 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Step 2.1 (results table exists), Phase 0 (output_writer)

**What to add - EXACT STRUCTURE:**

```python
from PySide6.QtWidgets import QDialog, QVBoxLayout, QCheckBox, QButtonGroup, QRadioButton

class ExportDialog(QDialog):
    """Dialog for export options"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
    def init_ui(self):
        """Initialize export dialog"""
        layout = QVBoxLayout(self)
        
        # Format selection
        format_group = QButtonGroup()
        self.csv_radio = QRadioButton("CSV")
        self.json_radio = QRadioButton("JSON")
        self.excel_radio = QRadioButton("Excel")
        self.csv_radio.setChecked(True)
        
        format_group.addButton(self.csv_radio)
        format_group.addButton(self.json_radio)
        format_group.addButton(self.excel_radio)
        
        layout.addWidget(self.csv_radio)
        layout.addWidget(self.json_radio)
        layout.addWidget(self.excel_radio)
        
        # Column selection (checkboxes)
        self.column_checks = {}
        columns = ["Title", "Artist", "Score", "Key", "BPM", "Year"]
        for col in columns:
            check = QCheckBox(col)
            check.setChecked(True)
            self.column_checks[col] = check
            layout.addWidget(check)
            
    def get_export_options(self) -> dict:
        """Get selected export options"""
        format_map = {
            self.csv_radio: "csv",
            self.json_radio: "json",
            self.excel_radio: "excel"
        }
        
        selected_format = None
        for radio, fmt in format_map.items():
            if radio.isChecked():
                selected_format = fmt
                break
                
        selected_columns = [
            col for col, check in self.column_checks.items()
            if check.isChecked()
        ]
        
        return {
            "format": selected_format,
            "columns": selected_columns
        }
```

**Implementation Checklist**:
- [ ] Add export dialog
- [ ] Add format selection (CSV, JSON, Excel)
- [ ] Add column selection
- [ ] Add filter options
- [ ] Implement JSON export (new)
- [ ] Implement Excel export (new, requires openpyxl)

**Acceptance Criteria**:
- ✅ Multiple formats supported
- ✅ Column selection works
- ✅ Export works
- ✅ Files created correctly

**Design Reference**: `DOCS/DESIGNS/20_Export_Format_Options_Design.md`
**Design Reference**: `DOCS/DESIGNS/09_JSON_Output_Format_Design.md`

---

## Phase 2 Deliverables Checklist
- [ ] Results table enhanced
- [ ] Multiple candidates display
- [ ] Export formats work
- [ ] All features tested
- [ ] Performance acceptable

---

## Testing Strategy

### Manual Testing
- Test sorting on all columns
- Test filtering with various criteria
- Test search functionality
- Test candidate expansion
- Test export in all formats

### Performance Testing
- Test with large result sets (1000+ tracks)
- Verify sorting/filtering performance
- Check memory usage

---

*For complete design details, see the referenced design documents in `DOCS/DESIGNS/`.*

