# Phase 4: Advanced Features (Ongoing)

**Status**: 📝 Planned  
**Priority**: 🚀 P2 - LOWER PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation), Phase 2 (User Experience), Phase 3 (Reliability & Performance)  
**Estimated Duration**: 3-4 weeks (depending on which features are implemented)

## Goal
Add advanced features to enhance functionality, performance, and integration capabilities based on user feedback, performance metrics from Phase 3, and requirements analysis.

## Success Criteria
- [ ] Features implemented as specified with comprehensive error handling
- [ ] All features tested with unit tests and integration tests
- [ ] Documentation updated (user guide, API docs, design docs)
- [ ] Backward compatibility maintained (existing workflows continue to work)
- [ ] Performance impact acceptable (validated using Phase 3 metrics)
- [ ] Phase 3 integration complete (performance metrics guide decisions)
- [ ] Error handling robust for all new features
- [ ] User guide updated with new features

---

## Documentation Structure

Phase 4 documentation has been reorganized into a folder structure with individual step files:

- **Overview**: `04_Phase_4_Advanced_Features/00_Phase_4_Overview.md` - Complete overview, strategy, and guidelines
- **Step 4.1**: `04_Phase_4_Advanced_Features/01_Step_4.1_Enhanced_Export.md` - Enhanced export features
- **Step 4.2**: `04_Phase_4_Advanced_Features/02_Step_4.2_Advanced_Filtering.md` - Advanced filtering and search
- **Step 4.6**: `04_Phase_4_Advanced_Features/06_Step_4.6_Keyboard_Shortcuts_Accessibility.md` - Keyboard shortcuts and accessibility (optional)

**Future Features** (moved to separate folder):
- See `05_Future_Features/00_Future_Features_Overview.md` for Traxsource Integration, CLI Interface, Advanced Matching Rules, Database Integration, Batch Processing Enhancements, and Visual Analytics Dashboard

**For detailed implementation instructions, see the individual step files in the `04_Phase_4_Advanced_Features/` folder.**

---

## Quick Reference: Implementation Steps

### High Priority Steps
1. **Step 4.1: Enhanced Export Features** (2-3 days)
   - See: `04_Phase_4_Advanced_Features/01_Step_4.1_Enhanced_Export.md`

2. **Step 4.2: Advanced Filtering and Search** (2-3 days)
   - See: `04_Phase_4_Advanced_Features/02_Step_4.2_Advanced_Filtering.md`

### Medium Priority Steps (Evaluate Need)
(No medium priority steps currently - Async I/O has been moved to Phase 5)

### Low Priority Steps (Optional)
4. **Step 4.6: Keyboard Shortcuts and Accessibility** (1-2 days, OPTIONAL)
   - Only if users request accessibility features
   - See: `04_Phase_4_Advanced_Features/06_Step_4.6_Keyboard_Shortcuts_Accessibility.md`

### Future Features (Not in Current Phase 4 Scope)
See `05_Future_Features/00_Future_Features_Overview.md` for:
- Traxsource Integration
- Command-Line Interface (CLI)
- Advanced Matching Rules
- Database Integration
- Batch Processing Enhancements
- Visual Analytics Dashboard

---

## Detailed Implementation Steps

### Step 4.1: Enhanced Export Features (2-3 days)
**File**: `SRC/output_writer.py` (MODIFY), `SRC/gui/export_dialog.py` (MODIFY)

**Dependencies**: Phase 2 Step 2.3 (export dialog exists), Phase 0 (output_writer)

**Status Note**: JSON and Excel export were already implemented in Phase 2. This step adds enhancements.

**What to add - EXACT STRUCTURE:**

**In `SRC/gui/export_dialog.py`:**

```python
# Add new export options

class ExportDialog(QDialog):
    """Enhanced export dialog with additional options"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.file_path = ""
        self.init_ui()
    
    def init_ui(self):
        """Initialize export dialog with enhanced options"""
        layout = QVBoxLayout(self)
        
        # ... existing format and column selection ...
        
        # NEW: Export Options Group
        options_group = QGroupBox("Export Options")
        options_layout = QVBoxLayout()
        
        # Include metadata
        self.include_metadata_checkbox = QCheckBox("Include full metadata (genres, labels, release dates)")
        self.include_metadata_checkbox.setChecked(True)
        options_layout.addWidget(self.include_metadata_checkbox)
        
        # Include processing info
        self.include_processing_info_checkbox = QCheckBox("Include processing information (timestamps, settings)")
        self.include_processing_info_checkbox.setChecked(False)
        options_layout.addWidget(self.include_processing_info_checkbox)
        
        # Compression option (for JSON)
        self.compress_checkbox = QCheckBox("Compress output (gzip)")
        self.compress_checkbox.setChecked(False)
        options_layout.addWidget(self.compress_checkbox)
        
        # Custom delimiter (for CSV)
        delimiter_layout = QHBoxLayout()
        delimiter_layout.addWidget(QLabel("CSV Delimiter:"))
        self.delimiter_combo = QComboBox()
        self.delimiter_combo.addItems([",", ";", "\t", "|"])
        self.delimiter_combo.setCurrentText(",")
        delimiter_layout.addWidget(self.delimiter_combo)
        delimiter_layout.addStretch()
        options_layout.addLayout(delimiter_layout)
        
        options_group.setLayout(options_layout)
        layout.addWidget(options_group)
        
        # ... rest of existing UI ...
    
    def get_export_options(self) -> Dict[str, Any]:
        """Get selected export options with enhancements"""
        options = {
            # ... existing options ...
            "include_metadata": self.include_metadata_checkbox.isChecked(),
            "include_processing_info": self.include_processing_info_checkbox.isChecked(),
            "compress": self.compress_checkbox.isChecked(),
            "delimiter": self.delimiter_combo.currentText(),
        }
        return options
```

**In `SRC/output_writer.py`:**

```python
import gzip
import json

def write_json_file(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output",
    include_metadata: bool = True,
    include_processing_info: bool = False,
    compress: bool = False
) -> str:
    """Write results to JSON file with enhanced options"""
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Build JSON structure
    json_data = {
        "version": "1.0",
        "generated": datetime.now().isoformat(),
        "total_tracks": len(results),
        "matched_tracks": sum(1 for r in results if r.matched),
        "tracks": []
    }
    
    # Add processing info if requested
    if include_processing_info:
        json_data["processing_info"] = {
            "timestamp": datetime.now().isoformat(),
            "settings": {}  # TODO: include actual settings
        }
    
    # Add track data
    for result in results:
        track_data = {
            "playlist_index": result.playlist_index,
            "title": result.title,
            "artist": result.artist,
            "matched": result.matched,
        }
        
        if result.matched:
            track_data["match"] = {
                "beatport_title": result.beatport_title,
                "beatport_artists": result.beatport_artists,
                "beatport_url": result.beatport_url,
                "match_score": result.match_score,
                "confidence": result.confidence,
                "key": result.beatport_key,
                "bpm": result.beatport_bpm,
                "year": result.beatport_year,
            }
            
            # Include full metadata if requested
            if include_metadata:
                track_data["match"]["metadata"] = {
                    "label": result.beatport_label,
                    "genres": result.beatport_genres,
                    "release": result.beatport_release,
                    "release_date": result.beatport_release_date,
                }
        
        # Add candidates if available
        if result.candidates:
            track_data["candidates"] = [
                {
                    "title": c.get("beatport_title", ""),
                    "artists": c.get("beatport_artists", ""),
                    "url": c.get("beatport_url", ""),
                    "score": c.get("match_score", 0),
                }
                for c in result.candidates[:10]  # Top 10 candidates
            ]
        
        json_data["tracks"].append(track_data)
    
    # Write to file
    filename = f"{base_filename}.json"
    if compress:
        filename += ".gz"
    
    filepath = os.path.join(output_dir, filename)
    
    json_str = json.dumps(json_data, indent=2, ensure_ascii=False)
    
    if compress:
        with gzip.open(filepath, 'wt', encoding='utf-8') as f:
            f.write(json_str)
    else:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(json_str)
    
    return filepath


def write_csv_files(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output",
    delimiter: str = ","
) -> Dict[str, str]:
    """Write CSV files with custom delimiter"""
    
    # Modify existing write_csv_files to use custom delimiter
    # Update all CSV writing functions to accept delimiter parameter
    # ...
    pass
```

**Implementation Checklist**:
- [ ] Add enhanced export options to `ExportDialog`
- [ ] Add metadata inclusion option
- [ ] Add processing info inclusion option
- [ ] Add compression option for JSON
- [ ] Add custom delimiter option for CSV
- [ ] Update `write_json_file` to support new options
- [ ] Update `write_csv_files` to support custom delimiter
- [ ] Test all export options
- [ ] Verify compressed JSON files work correctly

**Acceptance Criteria**:
- ✅ Enhanced export options available
- ✅ Metadata inclusion works
- ✅ Processing info inclusion works
- ✅ Compression works for JSON
- ✅ Custom delimiter works for CSV
- ✅ All options tested and working

---



### Step 4.2: Advanced Filtering and Search (2-3 days)
**File**: `04_Phase_4_Advanced_Features/02_Step_4.2_Advanced_Filtering.md`
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Phase 2 Step 2.1 (results table exists)

**What to add - EXACT STRUCTURE:**

```python
# In SRC/gui/results_view.py

class ResultsView(QWidget):
    """Enhanced results view with advanced filtering"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        # ... existing initialization ...
        self._setup_advanced_filters()
    
    def _setup_advanced_filters(self):
        """Setup advanced filtering options"""
        # Add to existing filter layout
        
        # Year range filter
        year_layout = QHBoxLayout()
        year_layout.addWidget(QLabel("Year:"))
        self.year_min = QSpinBox()
        self.year_min.setMinimum(1900)
        self.year_min.setMaximum(2100)
        self.year_min.setSpecialValueText("Any")
        year_layout.addWidget(self.year_min)
        
        year_layout.addWidget(QLabel("to"))
        self.year_max = QSpinBox()
        self.year_max.setMinimum(1900)
        self.year_max.setMaximum(2100)
        self.year_max.setSpecialValueText("Any")
        year_layout.addWidget(self.year_max)
        
        # BPM range filter
        bpm_layout = QHBoxLayout()
        bpm_layout.addWidget(QLabel("BPM:"))
        self.bpm_min = QSpinBox()
        self.bpm_min.setMinimum(60)
        self.bpm_min.setMaximum(200)
        self.bpm_min.setSpecialValueText("Any")
        bpm_layout.addWidget(self.bpm_min)
        
        bpm_layout.addWidget(QLabel("to"))
        self.bpm_max = QSpinBox()
        self.bpm_max.setMinimum(60)
        self.bpm_max.setMaximum(200)
        self.bpm_max.setSpecialValueText("Any")
        bpm_layout.addWidget(self.bpm_max)
        
        # Key filter
        self.key_filter = QComboBox()
        self.key_filter.addItems(["All"] + [f"{k} Major" for k in "C C# D D# E F F# G G# A A# B"] + 
                                 [f"{k} Minor" for k in "C C# D D# E F F# G G# A A# B"])
        
        # Connect signals
        self.year_min.valueChanged.connect(self.apply_filters)
        self.year_max.valueChanged.connect(self.apply_filters)
        self.bpm_min.valueChanged.connect(self.apply_filters)
        self.bpm_max.valueChanged.connect(self.apply_filters)
        self.key_filter.currentTextChanged.connect(self.apply_filters)
    
    def apply_filters(self):
        """Apply all filters including advanced filters"""
        filtered = self.results.copy()
        
        # ... existing filters ...
        
        # Year filter
        year_min_val = self.year_min.value() if self.year_min.value() > 1900 else None
        year_max_val = self.year_max.value() if self.year_max.value() < 2100 else None
        
        if year_min_val or year_max_val:
            filtered = [r for r in filtered if self._year_in_range(r, year_min_val, year_max_val)]
        
        # BPM filter
        bpm_min_val = self.bpm_min.value() if self.bpm_min.value() > 60 else None
        bpm_max_val = self.bpm_max.value() if self.bpm_max.value() < 200 else None
        
        if bpm_min_val or bpm_max_val:
            filtered = [r for r in filtered if self._bpm_in_range(r, bpm_min_val, bpm_max_val)]
        
        # Key filter
        key_filter_val = self.key_filter.currentText()
        if key_filter_val != "All":
            filtered = [r for r in filtered if r.beatport_key == key_filter_val]
        
        # Update table
        self._populate_table(filtered)
    
    def _year_in_range(self, result: TrackResult, min_year: Optional[int], max_year: Optional[int]) -> bool:
        """Check if result year is in range"""
        if not result.beatport_year:
            return False
        try:
            year = int(result.beatport_year)
            if min_year and year < min_year:
                return False
            if max_year and year > max_year:
                return False
            return True
        except:
            return False
    
    def _bpm_in_range(self, result: TrackResult, min_bpm: Optional[int], max_bpm: Optional[int]) -> bool:
        """Check if result BPM is in range"""
        if not result.beatport_bpm:
            return False
        try:
            bpm = float(result.beatport_bpm)
            if min_bpm and bpm < min_bpm:
                return False
            if max_bpm and bpm > max_bpm:
                return False
            return True
        except:
            return False
```

**Implementation Checklist**:
- [ ] Add year range filter
- [ ] Add BPM range filter
- [ ] Add key filter
- [ ] Implement filter logic
- [ ] Update `apply_filters` method
- [ ] Test all filter combinations
- [ ] Ensure filters work with search box

**Acceptance Criteria**:
- ✅ Year range filter works
- ✅ BPM range filter works
- ✅ Key filter works
- ✅ Filters combine correctly
- ✅ Performance acceptable with large datasets

---

## Phase 4 Deliverables Checklist
- [ ] Enhanced export features implemented
- [ ] Advanced filtering implemented
- [ ] Keyboard shortcuts and accessibility (optional, if requested)
- [ ] All features tested
- [ ] Documentation updated
- [ ] Backward compatibility maintained

---

## Implementation Guidelines

### When to Implement Features
1. **User Request**: If users request a feature, evaluate priority
2. **Performance Need**: If performance issues arise, prioritize optimizations
3. **Integration Need**: If integration with other tools is needed
4. **Maintenance**: Keep features maintainable and well-documented

### Feature Priority
- **High Priority**: Enhanced export features, advanced filtering
- **Medium Priority**: Async I/O refactoring (if performance issues) - See Phase 5
- **Low Priority**: Keyboard shortcuts and accessibility (if requested)

### Feature Implementation Checklist
- [ ] Read design document
- [ ] Create implementation plan
- [ ] Implement feature
- [ ] Test thoroughly
- [ ] Update documentation
- [ ] Update user guide (if applicable)
- [ ] Ensure backward compatibility

---

## Testing Strategy

### Feature Testing
- Test each feature independently
- Test feature combinations
- Test with various data sizes
- Test error handling
- Test performance impact

### Integration Testing
- Test features work together
- Test backward compatibility
- Test configuration options
- Test with real-world data

---

## Important Notes

1. **Phase 3 Integration**: All Phase 4 features must integrate with Phase 3 performance monitoring. See the overview document for details.

2. **Evaluation Before Implementation**: 
   - Step 4.6 (Shortcuts): Only implement if users request it
   - Future Features: See `05_Future_Features/00_Future_Features_Overview.md` for Traxsource, CLI, Advanced Matching Rules, Database Integration, Batch Processing Enhancements, and Visual Analytics Dashboard

3. **Start with High Priority**: Begin with Step 4.1 (Enhanced Export) and Step 4.2 (Advanced Filtering) as these provide immediate user value.

4. **See Individual Step Files**: Each step has a detailed document in the `04_Phase_4_Advanced_Features/` folder with:
   - Complete implementation instructions
   - Code examples
   - Testing requirements
   - Error handling strategies
   - Phase 3 integration details
   - Backward compatibility requirements
   - Documentation requirements

---

*Features in Phase 4 are implemented on an as-needed basis. See individual step documents in `04_Phase_4_Advanced_Features/` for detailed specifications.*
