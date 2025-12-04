# Design: Multiple Candidate Output Option

**Number**: 4  
**Status**: 📝 Planned  
**Priority**: 🔥 P0 - Quick Win  
**Effort**: 1 day  
**Impact**: Medium

---

## 1. Overview

### 1.1 Problem Statement

Currently, only the best match is saved in the main output file. When the best match is uncertain or there are close alternatives, users have to manually check the candidates CSV file. This is time-consuming and not ideal for quick reviews.

### 1.2 Solution Overview

Add option to save top N candidates per track (e.g., top 3-5) to a separate CSV file, allowing users to:
1. Quickly review alternative matches
2. See close scoring alternatives
3. Make informed decisions about uncertain matches
4. Compare candidates side-by-side

---

## 2. Architecture Design

### 2.1 Output Structure

```
Main Output (existing):
  - {name}.csv: Best match per track (one row per track)

New Output:
  - {name}_top_candidates.csv: Top N candidates per track (multiple rows per track)
    Columns: playlist_index, candidate_rank, score, title, artists, url, ...
```

### 2.2 Data Flow

```
Process Track
    ↓
Find Candidates & Score
    ↓
Sort by Score (descending)
    ↓
Select Top N
    ├─ Best match → Main CSV (existing)
    └─ Top N candidates → Top Candidates CSV (new)
```

---

## 3. Implementation Design

### 3.1 Command-Line Argument

**Location**: `SRC/main.py`

```python
ap.add_argument(
    "--top-candidates",
    type=int,
    default=0,
    help="Save top N candidates per track to separate CSV (0 = disabled, 1-10 = number of candidates)"
)
```

### 3.2 Configuration Setting

**Location**: `SRC/config.py`

```python
SETTINGS = {
    "TOP_CANDIDATES_COUNT": 0,  # Number of top candidates to save (0 = disabled)
    # ... other settings ...
}
```

### 3.3 Candidate Collection

**Location**: `SRC/matcher.py`

```python
def best_beatport_match(rb: RBTrack, queries: List[str]) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate]]:
    """
    Find best match and return top N candidates
    
    Returns:
        Tuple of:
        - Best candidate (winner)
        - List of top N candidates (sorted by score)
    """
    all_candidates = []
    
    # ... existing candidate collection logic ...
    
    # Score all candidates
    scored = [(score_candidate(cand, rb), cand) for cand in all_candidates]
    scored.sort(key=lambda x: x[0].final_score, reverse=True)
    
    # Filter and select top candidates
    valid_candidates = [cand for score, cand in scored if score.guard_ok]
    best = valid_candidates[0] if valid_candidates else None
    
    # Get top N (excluding best, or including if N=1)
    top_n_count = SETTINGS.get("TOP_CANDIDATES_COUNT", 0)
    if top_n_count > 0:
        top_candidates = valid_candidates[:top_n_count]
    else:
        top_candidates = []
    
    return best, top_candidates
```

### 3.4 Output Generation

**Location**: `SRC/processor.py`

```python
def process_track(idx: int, rb: RBTrack) -> Tuple[Dict, List[Dict], List[Dict], List[Dict]]:
    """
    Process track and return results including top candidates
    
    Returns:
        Tuple of:
        - Main row (best match)
        - All candidates rows (existing)
        - Queries rows (existing)
        - Top candidates rows (new)
    """
    best_match, top_candidates = best_beatport_match(rb, queries)
    
    # ... existing processing ...
    
    # Generate top candidates rows
    top_candidates_rows = []
    for rank, candidate in enumerate(top_candidates, start=1):
        row = {
            'playlist_index': idx,
            'candidate_rank': rank,
            'beatport_title': candidate.title,
            'beatport_artists': candidate.artists,
            'beatport_url': candidate.url,
            'match_score': candidate.final_score,
            'title_sim': candidate.title_sim,
            'artist_sim': candidate.artist_sim,
            # ... other fields ...
        }
        top_candidates_rows.append(row)
    
    return main_row, cand_rows, queries_rows, top_candidates_rows
```

### 3.5 CSV File Writing

**Location**: `SRC/processor.py`

```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    # ... existing processing ...
    
    all_top_candidates: List[Dict[str, str]] = []
    
    for idx, rb_track in inputs:
        main_row, cand_rows, queries_rows, top_candidates_rows = process_track(idx, rb_track)
        all_top_candidates.extend(top_candidates_rows)
    
    # Write top candidates CSV if enabled
    if SETTINGS.get("TOP_CANDIDATES_COUNT", 0) > 0:
        out_top_cands = os.path.join(output_dir, f"{base_filename}_top_candidates.csv")
        write_csv(all_top_candidates, out_top_cands)
        print(f"Top candidates: {len(all_top_candidates)} rows -> {out_top_cands}")
```

---

## 4. CSV File Format

### 4.1 Column Structure

**Top Candidates CSV**:
```
playlist_index, candidate_rank, beatport_title, beatport_artists, beatport_url, 
match_score, title_sim, artist_sim, beatport_key, beatport_year, beatport_bpm,
beatport_label, beatport_genres, confidence
```

### 4.2 Example Data

```
playlist_index,candidate_rank,beatport_title,beatport_artists,match_score,title_sim,artist_sim
1,1,The Night is Blue,Tim Green,139.0,100.0,100.0
1,2,The Night is Blue (Extended Mix),Tim Green,135.0,95.0,100.0
1,3,The Night,Tim Green,120.0,85.0,100.0
2,1,Planet 9,Adam Port,139.0,100.0,100.0
2,2,Planet Nine,Adam Port,125.0,90.0,100.0
```

---

## 5. Usage Examples

### 5.1 Basic Usage

```bash
# Save top 3 candidates per track
python main.py --xml collection.xml --playlist "My Playlist" --top-candidates 3
```

### 5.2 Configuration File

```yaml
# config.yaml
matching:
  top_candidates_count: 5  # Save top 5 candidates
```

### 5.3 Combined with Other Options

```bash
# Save top candidates with auto-research
python main.py --xml collection.xml --playlist "My Playlist" \
    --top-candidates 3 \
    --auto-research
```

---

## 6. Edge Cases

### 6.1 Fewer Candidates Than Requested

**If track has fewer candidates than TOP_CANDIDATES_COUNT**:
- Save all available candidates
- No padding with empty rows

### 6.2 No Match Found

**If no match found**:
- Top candidates CSV still contains candidates that were evaluated
- Helps users see what was considered

### 6.3 Tied Scores

**If multiple candidates have same score**:
- Sort by secondary criteria (title similarity, then artist similarity)
- Maintain consistent ordering

---

## 7. Benefits

### 7.1 User Benefits

- **Quick Review**: See alternatives without parsing large candidates CSV
- **Decision Support**: Compare close matches easily
- **Quality Assessment**: Understand match confidence better

### 7.2 Development Benefits

- **Low Complexity**: Simple addition to existing pipeline
- **Optional Feature**: Doesn't affect default behavior
- **Reuses Existing**: Uses same candidate evaluation logic

---

## 8. Configuration Options

### 8.1 Settings

```python
SETTINGS = {
    "TOP_CANDIDATES_COUNT": 0,  # 0 = disabled, 1-10 = number to save
    "TOP_CANDIDATES_INCLUDE_BEST": True,  # Include best match in top N
}
```

---

## 9. File Naming

### 9.1 Output File Pattern

**Pattern**: `{output_base}_top_candidates.csv`

**Example**: `test_output (2025-11-03 18-50-58)_top_candidates.csv`

---

## 10. Future Enhancements

### 10.1 Potential Improvements

1. **Ranked Columns in Main CSV**: Add columns for 2nd and 3rd place
2. **Similarity Comparison**: Show why each candidate was ranked
3. **Interactive Selection**: Allow choosing from top candidates
4. **Confidence Intervals**: Show score ranges for uncertainty

---

---

## 11. GUI Table Integration

### 11.1 Expandable Table Rows

**Location**: `SRC/gui/results_view.py` (MODIFY)

**Implementation**: Use QTreeWidget or expandable rows in QTableWidget:

```python
# SRC/gui/results_view.py
from PySide6.QtWidgets import QTreeWidget, QTreeWidgetItem

class ResultsView(QWidget):
    """Results table view with expandable candidate rows"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results: List[TrackResult] = []
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up UI with tree widget for expandable rows"""
        layout = QVBoxLayout()
        
        # Use QTreeWidget for expandable rows
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels([
            "Rank", "Title", "Artists", "Score", "Title Sim", "Artist Sim", 
            "Key", "BPM", "Confidence", "URL"
        ])
        self.tree.setColumnWidth(0, 50)
        self.tree.setColumnWidth(1, 250)
        self.tree.setColumnWidth(2, 200)
        self.tree.setColumnWidth(3, 80)
        layout.addWidget(self.tree)
        
        self.setLayout(layout)
    
    def populate(self, results: List[TrackResult], show_top_n: int = 3):
        """Populate tree with results and top candidates"""
        self.results = results
        self.tree.clear()
        
        for result in results:
            # Main track row (always visible)
            main_item = QTreeWidgetItem([
                str(result.playlist_index),
                result.title,
                result.artist,
                "",
                "",
                "",
                "",
                "",
                "",
                ""
            ])
            self.tree.addTopLevelItem(main_item)
            
            # Add best match as first child
            if result.matched:
                best_item = self._create_candidate_item(
                    result, rank=1, is_best=True
                )
                main_item.addChild(best_item)
                main_item.setExpanded(True)
            
            # Add top N candidates as children
            if result.candidates:
                top_candidates = sorted(
                    result.candidates,
                    key=lambda c: float(c.get('match_score', 0)),
                    reverse=True
                )[:show_top_n]
                
                for rank, candidate in enumerate(top_candidates, start=2):
                    candidate_item = self._create_candidate_item(
                        candidate, rank=rank, is_best=False
                    )
                    main_item.addChild(candidate_item)
    
    def _create_candidate_item(self, candidate_data: dict, rank: int, is_best: bool) -> QTreeWidgetItem:
        """Create candidate item for tree"""
        item = QTreeWidgetItem([
            str(rank),
            candidate_data.get('beatport_title', ''),
            candidate_data.get('beatport_artists', ''),
            candidate_data.get('match_score', '0'),
            candidate_data.get('title_sim', '0'),
            candidate_data.get('artist_sim', '0'),
            candidate_data.get('beatport_key', ''),
            candidate_data.get('beatport_bpm', ''),
            candidate_data.get('confidence', ''),
            candidate_data.get('beatport_url', '')
        ])
        
        # Highlight best match
        if is_best:
            item.setForeground(0, QBrush(QColor(0, 150, 0)))  # Green
            item.setBold(True)
        
        return item
```

### 11.2 Side-by-Side Candidate Comparison View

**Location**: `SRC/gui/candidate_comparison.py` (NEW)

**Dialog for comparing candidates**:

```python
# SRC/gui/candidate_comparison.py
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QTableWidget, QTableWidgetItem
)
from PySide6.QtCore import Qt

class CandidateComparisonDialog(QDialog):
    """Dialog for comparing multiple candidates"""
    
    candidate_selected = Signal(dict)  # Emit selected candidate
    
    def __init__(self, candidates: List[Dict], parent=None):
        super().__init__(parent)
        self.candidates = candidates
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up comparison dialog"""
        self.setWindowTitle("Compare Candidates")
        self.setMinimumSize(900, 600)
        
        layout = QVBoxLayout()
        
        # Table with all candidates
        self.table = QTableWidget()
        self.table.setColumnCount(10)
        self.table.setHorizontalHeaderLabels([
            "Rank", "Title", "Artists", "Score", "Title Sim", 
            "Artist Sim", "Key", "BPM", "Confidence", "URL"
        ])
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setSelectionMode(QTableWidget.SingleSelection)
        self.table.doubleClicked.connect(self._on_row_double_clicked)
        
        # Populate table
        self.table.setRowCount(len(self.candidates))
        for row_idx, candidate in enumerate(self.candidates):
            self.table.setItem(row_idx, 0, QTableWidgetItem(str(row_idx + 1)))
            self.table.setItem(row_idx, 1, QTableWidgetItem(candidate.get('beatport_title', '')))
            self.table.setItem(row_idx, 2, QTableWidgetItem(candidate.get('beatport_artists', '')))
            self.table.setItem(row_idx, 3, QTableWidgetItem(str(candidate.get('match_score', 0))))
            self.table.setItem(row_idx, 4, QTableWidgetItem(str(candidate.get('title_sim', 0))))
            self.table.setItem(row_idx, 5, QTableWidgetItem(str(candidate.get('artist_sim', 0))))
            self.table.setItem(row_idx, 6, QTableWidgetItem(candidate.get('beatport_key', '')))
            self.table.setItem(row_idx, 7, QTableWidgetItem(candidate.get('beatport_bpm', '')))
            self.table.setItem(row_idx, 8, QTableWidgetItem(candidate.get('confidence', '')))
            self.table.setItem(row_idx, 9, QTableWidgetItem(candidate.get('beatport_url', '')))
        
        self.table.resizeColumnsToContents()
        layout.addWidget(self.table)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        select_btn = QPushButton("Select Candidate")
        select_btn.clicked.connect(self._select_candidate)
        button_layout.addWidget(select_btn)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        layout.addLayout(button_layout)
        self.setLayout(layout)
    
    def _on_row_double_clicked(self, index):
        """Handle double-click on row"""
        self._select_candidate()
    
    def _select_candidate(self):
        """Select current candidate"""
        row = self.table.currentRow()
        if row >= 0:
            self.candidate_selected.emit(self.candidates[row])
            self.accept()
```

### 11.3 Manual Selection UI

**Integration in ResultsView**:

```python
# SRC/gui/results_view.py
from .candidate_comparison import CandidateComparisonDialog

class ResultsView(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        # ... existing code ...
        
        # Add "View Candidates" button to toolbar
        view_candidates_btn = QPushButton("View Candidates")
        view_candidates_btn.clicked.connect(self._view_candidates)
        # ... add to toolbar ...
    
    def _view_candidates(self):
        """View candidates for selected track"""
        selected_items = self.tree.selectedItems()
        if not selected_items:
            QMessageBox.information(self, "Selection", "Please select a track first.")
            return
        
        item = selected_items[0]
        
        # Get track result
        track_index = int(item.text(0))
        result = next((r for r in self.results if r.playlist_index == track_index), None)
        
        if result and result.candidates:
            # Show comparison dialog
            dialog = CandidateComparisonDialog(result.candidates, self)
            dialog.candidate_selected.connect(self._on_candidate_selected)
            dialog.exec_()
    
    def _on_candidate_selected(self, candidate: dict):
        """Handle candidate selection"""
        # Update result with selected candidate
        # Emit signal to update processing result
        self.candidate_updated.emit(candidate)
```

### 11.4 Accept/Reject Button Placement

**In Results Table Context Menu**:

```python
# SRC/gui/results_view.py
def _show_context_menu(self, position):
    """Show context menu for row"""
    item = self.tree.itemAt(position)
    if not item:
        return
    
    menu = QMenu(self)
    
    # Accept match
    accept_action = menu.addAction("✓ Accept Match")
    accept_action.triggered.connect(lambda: self._accept_match(item))
    
    # Reject match
    reject_action = menu.addAction("✗ Reject Match")
    reject_action.triggered.connect(lambda: self._reject_match(item))
    
    menu.addSeparator()
    
    # View candidates
    view_action = menu.addAction("View All Candidates...")
    view_action.triggered.connect(lambda: self._view_candidates_for_item(item))
    
    menu.addSeparator()
    
    # Open URL
    open_action = menu.addAction("Open Beatport URL")
    open_action.triggered.connect(lambda: self._open_url(item))
    
    menu.exec_(self.tree.viewport().mapToGlobal(position))
```

### 11.5 Integration with Results Table View

**Update ResultsView to support multiple candidates**:

```python
# SRC/gui/results_view.py
class ResultsView(QWidget):
    """Enhanced results view with multiple candidate support"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.show_top_n = 3  # Number of candidates to show per track
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up UI"""
        layout = QVBoxLayout()
        
        # Toolbar
        toolbar = self._create_toolbar()
        layout.addWidget(toolbar)
        
        # Tree widget for expandable rows
        self.tree = QTreeWidget()
        self.tree.setHeaderLabels([...])
        layout.addWidget(self.tree)
        
        self.setLayout(layout)
    
    def _create_toolbar(self) -> QWidget:
        """Create toolbar with candidate options"""
        toolbar = QWidget()
        layout = QHBoxLayout()
        
        # Show top N selector
        n_label = QLabel("Show Top:")
        layout.addWidget(n_label)
        
        self.top_n_spin = QSpinBox()
        self.top_n_spin.setRange(1, 10)
        self.top_n_spin.setValue(3)
        self.top_n_spin.valueChanged.connect(self._on_top_n_changed)
        layout.addWidget(self.top_n_spin)
        
        candidates_label = QLabel("Candidates")
        layout.addWidget(candidates_label)
        
        layout.addStretch()
        
        # Expand all / Collapse all
        expand_btn = QPushButton("Expand All")
        expand_btn.clicked.connect(self.tree.expandAll)
        layout.addWidget(expand_btn)
        
        collapse_btn = QPushButton("Collapse All")
        collapse_btn.clicked.connect(self.tree.collapseAll)
        layout.addWidget(collapse_btn)
        
        toolbar.setLayout(layout)
        return toolbar
    
    def _on_top_n_changed(self, value: int):
        """Handle top N change"""
        self.show_top_n = value
        self.populate(self.results, show_top_n=value)
```

### 11.6 Acceptance Criteria for GUI Integration

- [ ] Expandable rows work correctly
- [ ] Top N candidates display correctly
- [ ] Candidate comparison dialog works
- [ ] Manual selection updates results
- [ ] Accept/Reject buttons work
- [ ] Context menu functions correctly
- [ ] Integration with results table works

---

**Document Version**: 2.0  
**Last Updated**: 2025-01-27  
**Author**: CuePoint Development Team  
**GUI Integration**: Complete

