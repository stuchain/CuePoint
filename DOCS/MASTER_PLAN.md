# CuePoint - Master Implementation Plan

**Goal**: Full-Featured Desktop GUI Application as Standalone Executable

**Last Updated**: 2025-01-27

---

## 📋 Executive Summary

This document provides a comprehensive, step-by-step implementation plan for transforming CuePoint from a CLI tool into a complete desktop GUI application. Each phase builds on the previous one, with clear dependencies and success criteria.

**Timeline Estimate**: 8-12 weeks total
- Phase 0: 2-3 weeks (Backend Foundation)
- Phase 1: 4-5 weeks (GUI Foundation)
- Phase 2: 2-3 weeks (GUI User Experience)
- Phase 3: 2-3 weeks (Reliability & Performance)
- Phase 4+: Ongoing (Advanced Features)

---

## 🎯 Phase Overview

```
Phase 0: Backend Foundation (CRITICAL - DO FIRST)
    ↓
Phase 1: GUI Foundation (CRITICAL - BUILD ON BACKEND)
    ↓
Phase 2: GUI User Experience (HIGH PRIORITY)
    ↓
Phase 3: Reliability & Performance (MEDIUM PRIORITY)
    ↓
Phase 4: Advanced Features (LOWER PRIORITY)
```

---

## 🔧 Phase 0: Backend Foundation (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: 🔥 P0 - CRITICAL PATH  
**Dependencies**: None  
**Blocks**: Phase 1 (GUI Foundation)

### Goal
Refactor backend to be GUI-ready while maintaining CLI compatibility. This foundation enables all GUI features.

### Success Criteria
- [ ] Progress callback interface implemented and tested
- [ ] Cancellation support working
- [ ] Structured data returns (TrackResult objects)
- [ ] File I/O separated from business logic
- [ ] Error handling structured for GUI
- [ ] CLI backward compatibility maintained
- [ ] Test suite covers core functionality

### Implementation Steps

#### Step 0.1: Create GUI Interface Module (1 day)
**File**: `SRC/gui_interface.py` (NEW)

**What to create:**
- `ProgressInfo` dataclass
- `TrackResult` dataclass  
- `ProcessingResult` dataclass
- `ProcessingController` class
- `ProcessingError` class
- `ErrorType` enum
- `ProgressCallback` type alias

**Design Reference**: `DOCS/DESIGNS/21_Backend_Refactoring_GUI_Readiness_Design.md` (Section 4.1)

**Acceptance Criteria**:
- All classes defined and documented
- Type hints complete
- Can import without errors
- Unit tests pass

---

#### Step 0.2: Create Output Writer Module (1 day)
**File**: `SRC/output_writer.py` (NEW)

**What to create:**
- `write_csv_files()` function
- `write_main_csv()` function
- `write_candidates_csv()` function
- `write_queries_csv()` function
- `write_review_csv()` function
- `_write_csv_no_trailing_newline()` helper

**Design Reference**: `DOCS/DESIGNS/21_Backend_Refactoring_GUI_Readiness_Design.md` (Section 4.5)

**Acceptance Criteria**:
- Takes TrackResult objects as input
- Writes CSV files correctly
- Handles empty results
- No file I/O in processor.py

---

#### Step 0.3: Create process_track_with_callback() Function (2 days)
**File**: `SRC/processor.py` (MODIFY)

**What to create:**
- New function: `process_track_with_callback()`
- Returns `TrackResult` instead of tuple
- Accepts `progress_callback` parameter
- Accepts `controller` parameter for cancellation
- Accepts `settings` parameter

**Design Reference**: `DOCS/DESIGNS/21_Backend_Refactoring_GUI_Readiness_Design.md` (Section 3.2)

**Implementation Details**:
1. Copy logic from existing `process_track()`
2. Convert return values to `TrackResult` object
3. Add cancellation checks
4. Add progress callback calls
5. Handle settings override

**Acceptance Criteria**:
- Returns `TrackResult` object
- Supports cancellation via controller
- Calls progress callback (if provided)
- Handles settings override
- Unit tests pass

---

#### Step 0.4: Create process_playlist() Function (3 days)
**File**: `SRC/processor.py` (MODIFY)

**What to create:**
- New function: `process_playlist()`
- Supports sequential and parallel processing
- Uses `process_track_with_callback()` internally
- Thread-safe progress reporting for parallel mode
- Returns `List[TrackResult]`
- Raises `ProcessingError` for GUI-friendly errors

**Design Reference**: `DOCS/DESIGNS/21_Backend_Refactoring_GUI_Readiness_Design.md` (Section 3.2, 4.3)

**Implementation Details**:
1. Parse XML (with error handling)
2. Validate playlist exists
3. Build track list
4. Process tracks (sequential or parallel based on TRACK_WORKERS)
5. Thread-safe progress updates in parallel mode
6. Handle cancellation
7. Return results list

**Acceptance Criteria**:
- Returns list of `TrackResult` objects
- Supports progress callback
- Supports cancellation
- Thread-safe for parallel processing
- Raises `ProcessingError` for errors
- Integration tests pass

---

#### Step 0.5: Update run() Function for Backward Compatibility (1 day)
**File**: `SRC/processor.py` (MODIFY)

**What to modify:**
- Keep existing `run()` function signature
- Internally call `process_playlist()`
- Convert `TrackResult` objects back to dict format
- Write CSV files using `output_writer.py`
- Maintain CLI output (tqdm, print statements)

**Design Reference**: `DOCS/DESIGNS/21_Backend_Refactoring_GUI_Readiness_Design.md` (Section 5.1)

**Implementation Details**:
1. Create CLI progress callback wrapper (updates tqdm)
2. Call `process_playlist()` with callback
3. Convert results to dict format
4. Write CSV files using `output_writer.py`
5. Maintain all existing CLI behavior

**Acceptance Criteria**:
- CLI still works exactly as before
- Uses new backend internally
- No breaking changes
- All existing tests pass

---

#### Step 0.6: Add Retry Logic with Exponential Backoff (3-4 days)
**File**: `SRC/utils.py` or `SRC/beatport_search.py` (MODIFY)

**What to create:**
- `retry_with_backoff()` decorator
- `is_retryable()` function
- Error-specific retry strategies
- GUI-friendly retry progress reporting

**Design Reference**: `DOCS/DESIGNS/06_Retry_Logic_Exponential_Backoff_Design.md`

**Implementation Details**:
1. Create retry decorator
2. Add retryable error detection
3. Apply to network requests
4. Add retry logging
5. Integrate with progress callbacks

**Acceptance Criteria**:
- Network requests retry automatically
- Exponential backoff works correctly
- Retry attempts logged
- GUI can show retry progress
- Unit tests pass

---

#### Step 0.7: Create Test Suite Foundation (4-5 days)
**Files**: `tests/` directory (NEW)

**What to create:**
- Test directory structure
- Unit tests for core modules
- Integration tests for pipeline
- Test fixtures (sample XML, mock responses)
- CI/CD configuration

**Design Reference**: `DOCS/DESIGNS/07_Test_Suite_Foundation_Design.md`

**Implementation Details**:
1. Set up pytest structure
2. Create test fixtures
3. Write unit tests for core logic
4. Write integration tests
5. Set up GitHub Actions CI
6. Configure coverage reporting

**Acceptance Criteria**:
- Test suite runs successfully
- Coverage > 70% for core modules
- CI runs on every commit
- All tests pass

---

### Phase 0 Deliverables Checklist
- [ ] `SRC/gui_interface.py` - Complete with all classes
- [ ] `SRC/output_writer.py` - Complete CSV writing functions
- [ ] `SRC/processor.py` - Updated with new functions
- [ ] `tests/` directory - Test suite with good coverage
- [ ] CLI still works - Backward compatibility maintained
- [ ] Documentation updated - README reflects new architecture

---

## 🎯 Phase 1: GUI Foundation (4-5 weeks)

**Status**: 📝 Planned  
**Priority**: 🔥 P0 - CRITICAL PATH  
**Dependencies**: Phase 0 (Backend Foundation)  
**Blocks**: Phase 2 (GUI User Experience)

### Goal
Build the core GUI application using PySide6, with all essential features working.

### Success Criteria (MVP)
- [ ] GUI window launches successfully
- [ ] File selection works (drag & drop + browse)
- [ ] Playlist selection works (dropdown)
- [ ] Processing starts and shows progress
- [ ] Results display correctly
- [ ] CSV download works
- [ ] Error handling shows user-friendly dialogs
- [ ] Cancellation works
- [ ] Standalone executable builds

### Implementation Steps

#### Step 1.1: Set Up GUI Project Structure (1 day)
**Files**: `SRC/gui/` directory (NEW)

**What to create:**
```
SRC/gui/
├── __init__.py
├── main_window.py          # Main application window
├── file_selector.py        # XML file selection widget
├── playlist_selector.py    # Playlist dropdown widget
├── config_panel.py         # Settings panel widget
├── progress_widget.py      # Progress display widget
├── results_view.py         # Results table widget
├── status_bar.py           # Status bar widget
├── styles.py              # Theme and styling
└── dialogs.py             # Error dialogs, confirmations
```

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 3.2)

**Acceptance Criteria**:
- Directory structure created
- All modules importable
- Basic window shows

---

#### Step 1.2: Create Main Window Structure (2 days)
**File**: `SRC/gui/main_window.py` (NEW)

**What to create:**
- `MainWindow` class (QMainWindow)
- Menu bar (File, Edit, View, Help)
- Toolbar (optional)
- Central widget with sections:
  - File selection section
  - Playlist selection section
  - Settings section
  - Progress section
  - Results section
- Status bar
- Window layout and styling

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.1)

**Implementation Details**:
1. Create QMainWindow subclass
2. Add menu bar
3. Create central widget with layout
4. Add all section widgets (empty initially)
5. Add status bar
6. Apply basic styling

**Acceptance Criteria**:
- Window displays correctly
- All sections visible
- Menu bar works
- Layout responsive

---

#### Step 1.3: Create File Selector Widget (1 day)
**File**: `SRC/gui/file_selector.py` (NEW)

**What to create:**
- `FileSelector` widget class
- File browse button
- Drag & drop area
- File path display
- File validation
- Signal: `file_selected(str)`

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.2)

**Implementation Details**:
1. Create QWidget subclass
2. Add QLineEdit for path display
3. Add QPushButton for browse
4. Implement drag & drop (QDragEnterEvent, QDropEvent)
5. Validate XML file format
6. Emit signal when file selected

**Acceptance Criteria**:
- Browse button opens file dialog
- Drag & drop works
- File validation works
- Signal emitted correctly

---

#### Step 1.4: Create Playlist Selector Widget (1 day)
**File**: `SRC/gui/playlist_selector.py` (NEW)

**What to create:**
- `PlaylistSelector` widget class
- QComboBox for playlist selection
- Parse XML when file selected
- Populate dropdown with playlists
- Signal: `playlist_selected(str)`

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.3)

**Implementation Details**:
1. Create QWidget subclass
2. Add QComboBox
3. Connect to file selector signal
4. Parse XML when file changes
5. Populate combobox
6. Emit signal when playlist selected

**Acceptance Criteria**:
- Dropdown populated correctly
- Playlist selection works
- Signal emitted correctly
- Handles empty XML gracefully

---

#### Step 1.5: Create Progress Widget (2 days)
**File**: `SRC/gui/progress_widget.py` (NEW)

**What to create:**
- `ProgressWidget` class
- Progress bar (QProgressBar)
- Statistics display (matched/unmatched counts)
- Current track label
- Time remaining estimate
- Cancel button

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.4)
**Design Reference**: `DOCS/DESIGNS/01_Progress_Bar_Design.md`

**Implementation Details**:
1. Create QWidget subclass
2. Add QProgressBar
3. Add QLabel widgets for stats
4. Add cancel button
5. Connect to progress callback
6. Update UI from ProgressInfo objects

**Acceptance Criteria**:
- Progress bar updates in real-time
- Statistics display correctly
- Current track shows
- Cancel button works
- Time estimate calculates

---

#### Step 1.6: Create GUI Controller (2 days)
**File**: `SRC/gui_controller.py` (NEW)

**What to create:**
- `GUIController` class
- Bridges GUI and backend
- Manages processing thread
- Handles progress callbacks
- Handles cancellation
- Manages ProcessingController instance

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 3.3)

**Implementation Details**:
1. Create controller class
2. Use QThread for processing
3. Create ProcessingController
4. Connect progress callbacks
5. Handle cancellation
6. Emit Qt signals for GUI updates

**Acceptance Criteria**:
- Processing runs in background thread
- Progress updates GUI correctly
- Cancellation works
- Errors handled gracefully

---

#### Step 1.7: Create Results View Widget (2 days)
**File**: `SRC/gui/results_view.py` (NEW)

**What to create:**
- `ResultsView` widget class
- QTableWidget for results
- Summary statistics display
- Download buttons
- Export functionality

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.5)
**Design Reference**: `DOCS/DESIGNS/02_Summary_Statistics_Report_Design.md`

**Implementation Details**:
1. Create QWidget subclass
2. Add QTableWidget
3. Populate from TrackResult objects
4. Add summary statistics
5. Add download/export buttons
6. Connect to output_writer

**Acceptance Criteria**:
- Table displays results correctly
- Summary statistics shown
- Download buttons work
- Export to CSV works

---

#### Step 1.8: Create Settings Panel Widget (2 days)
**File**: `SRC/gui/config_panel.py` (NEW)

**What to create:**
- `ConfigPanel` widget class
- Form controls for all settings
- Preset selector
- Save/Load buttons
- Settings validation

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.6)
**Design Reference**: `DOCS/DESIGNS/03_YAML_Configuration_Design.md`

**Implementation Details**:
1. Create QWidget subclass
2. Add form controls (QSpinBox, QCheckBox, etc.)
3. Load defaults from config
4. Save to YAML
5. Load presets
6. Validate settings

**Acceptance Criteria**:
- All settings have controls
- Presets work
- Save/Load works
- Validation works

---

#### Step 1.9: Create Error Dialogs (1 day)
**File**: `SRC/gui/dialogs.py` (NEW)

**What to create:**
- `ErrorDialog` class
- `ConfirmDialog` class
- User-friendly error messages
- Actionable suggestions
- Help buttons

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 4.7)

**Implementation Details**:
1. Create QDialog subclasses
2. Display ProcessingError objects
3. Show suggestions
4. Add help buttons
5. Style consistently

**Acceptance Criteria**:
- Errors display clearly
- Suggestions shown
- Help buttons work
- Consistent styling

---

#### Step 1.10: Create Main Application Entry Point (1 day)
**File**: `SRC/gui_app.py` (NEW)

**What to create:**
- `main()` function
- QApplication setup
- MainWindow instantiation
- Application initialization
- Error handling

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 5.1)

**Implementation Details**:
1. Create QApplication
2. Set application metadata
3. Create MainWindow
4. Show window
5. Run event loop
6. Handle exceptions

**Acceptance Criteria**:
- Application launches
- Window displays
- No errors on startup
- Clean exit

---

#### Step 1.11: Create Executable Packaging (1 week)
**Files**: `build/` directory (NEW)

**What to create:**
- PyInstaller spec file
- Build scripts
- Installer scripts (NSIS/Inno Setup)
- Icon assets
- GitHub Actions workflow

**Design Reference**: `DOCS/DESIGNS/17_Executable_Packaging_Design.md`

**Implementation Details**:
1. Create PyInstaller spec
2. Create build scripts
3. Create Windows installer
4. Create macOS DMG
5. Create Linux AppImage
6. Set up CI/CD

**Acceptance Criteria**:
- Executable builds successfully
- Windows installer works
- macOS app bundle works
- Linux AppImage works
- CI builds automatically

---

#### Step 1.12: GUI Enhancements (1-2 weeks)
**Files**: Various GUI files (MODIFY)

**What to add:**
- Icons and branding
- Settings persistence
- Recent files menu
- Dark mode support
- Menu bar and shortcuts
- Help system

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 6)

**Implementation Details**:
1. Add application icons
2. Implement settings persistence
3. Add recent files
4. Implement dark mode
5. Add keyboard shortcuts
6. Create help system

**Acceptance Criteria**:
- Icons display correctly
- Settings persist between sessions
- Recent files work
- Dark mode works
- Shortcuts work
- Help accessible

---

### Phase 1 Deliverables Checklist
- [ ] GUI application launches
- [ ] All core features work
- [ ] Executable builds
- [ ] Windows installer works
- [ ] macOS app bundle works
- [ ] Linux AppImage works
- [ ] GUI enhancements complete
- [ ] User testing done

---

## 🎨 Phase 2: GUI User Experience (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - HIGH PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

### Goal
Enhance GUI with advanced features for better user experience.

### Implementation Steps

#### Step 2.1: Results Table with Sort/Filter (2 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**What to add:**
- Sortable columns
- Filter by confidence
- Search box
- Row selection
- Column visibility toggle

**Design Reference**: `DOCS/DESIGNS/19_Results_Preview_and_Table_View_Design.md` (if exists, otherwise create)

**Acceptance Criteria**:
- Columns sortable
- Filter works
- Search works
- Selection works

---

#### Step 2.2: Multiple Candidate Display (1-2 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**What to add:**
- Expandable rows showing top candidates
- Comparison view
- Manual selection
- Accept/Reject buttons

**Design Reference**: `DOCS/DESIGNS/04_Multiple_Candidate_Output_Design.md`

**Acceptance Criteria**:
- Top candidates shown
- Comparison works
- Selection works

---

#### Step 2.3: Export Format Options (2-3 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**What to add:**
- Export dialog
- Format selection (CSV, JSON, Excel)
- Column selection
- Filter options

**Design Reference**: `DOCS/DESIGNS/20_Export_Format_Options_Design.md` (if exists, otherwise create)

**Acceptance Criteria**:
- Multiple formats supported
- Column selection works
- Export works

---

### Phase 2 Deliverables Checklist
- [ ] Results table enhanced
- [ ] Multiple candidates display
- [ ] Export formats work
- [ ] All features tested

---

## 🔧 Phase 3: Reliability & Performance (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - MEDIUM PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

### Goal
Improve reliability and performance, add batch processing.

### Implementation Steps

#### Step 3.1: Performance Monitoring (3-4 days)
**File**: `SRC/gui/performance_view.py` (NEW)

**What to create:**
- Performance dashboard
- Timing breakdown
- Query effectiveness
- Performance tips

**Design Reference**: `DOCS/DESIGNS/10_Performance_Monitoring_Design.md`

**Acceptance Criteria**:
- Metrics tracked
- Dashboard displays
- Tips shown

---

#### Step 3.2: Batch Playlist Processing (3-4 days)
**File**: `SRC/gui/batch_processor.py` (NEW)

**What to create:**
- Multi-select playlist list
- Batch queue
- Progress per playlist
- Pause/resume/cancel

**Design Reference**: `DOCS/DESIGNS/08_Batch_Playlist_Processing_Design.md`

**Acceptance Criteria**:
- Batch processing works
- Queue management works
- Progress tracking works

---

### Phase 3 Deliverables Checklist
- [ ] Performance monitoring works
- [ ] Batch processing works
- [ ] All features tested

---

## 🚀 Phase 4: Advanced Features (Ongoing)

**Status**: 📝 Planned  
**Priority**: 🚀 P2 - LOWER PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

### Goal
Add advanced features as needed.

### Features
- JSON Output Format
- Async I/O Refactoring
- Additional Metadata Sources

**Design References**: Available in `DOCS/DESIGNS/`

---

## 📝 Implementation Notes

### Dependencies Between Phases
1. **Phase 0 → Phase 1**: Backend must be GUI-ready before GUI can use it
2. **Phase 1 → Phase 2**: Core GUI must work before enhancements
3. **Phase 1 → Phase 3**: Core GUI needed for batch processing

### Testing Strategy
- **Phase 0**: Unit tests + Integration tests
- **Phase 1**: GUI tests + Manual testing
- **Phase 2+**: Feature tests + User testing

### Documentation Updates
- Update README after each phase
- Update design docs as implementation progresses
- Create user guide after Phase 1

---

## ✅ Success Metrics

### Phase 0 Success
- [ ] Backend refactored and tested
- [ ] CLI still works
- [ ] Test coverage > 70%

### Phase 1 Success (MVP)
- [ ] GUI launches and runs
- [ ] Core features work
- [ ] Executable builds
- [ ] Basic user testing passed

### Phase 1 Success (Complete)
- [ ] All features work
- [ ] Polish complete
- [ ] User testing passed
- [ ] Documentation complete

---

*This master plan should be updated as implementation progresses.*

