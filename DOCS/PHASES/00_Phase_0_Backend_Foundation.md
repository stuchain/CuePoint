# Phase 0: Backend Foundation (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: 🔥 P0 - CRITICAL PATH  
**Dependencies**: None  
**Blocks**: Phase 1 (GUI Foundation)

## Goal
Refactor backend to be GUI-ready while maintaining CLI compatibility. This foundation enables all GUI features.

## Success Criteria
- [ ] Progress callback interface implemented and tested
- [ ] Cancellation support working
- [ ] Structured data returns (TrackResult objects)
- [ ] File I/O separated from business logic
- [ ] Error handling structured for GUI
- [ ] CLI backward compatibility maintained
- [ ] Test suite covers core functionality

## ⚠️ CRITICAL: Implementation Order
**Steps MUST be done in order. Each step depends on the previous one.**
1. Step 0.1 → Step 0.2 → Step 0.3 → Step 0.4 → Step 0.5
2. Steps 0.6 and 0.7 can be done in parallel after 0.5

---

## Implementation Steps

### Step 0.1: Create GUI Interface Module (1 day)
**File**: `SRC/gui_interface.py` (NEW - CREATE FROM SCRATCH)

**Dependencies**: None (this is the foundation)

**What to create - EXACT STRUCTURE:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Interface Module - Data structures and interfaces for GUI integration

This module defines all data structures and interfaces needed for GUI integration:
- ProgressInfo: Progress updates for GUI
- TrackResult: Result for a single track
- ProcessingController: Cancellation support
- ProcessingError: Structured error handling
- ErrorType: Error type enumeration
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional, List, Dict, Any
import threading


# ============================================================================
# Progress Reporting
# ============================================================================

@dataclass
class ProgressInfo:
    """
    Progress information for GUI updates.
    
    This is passed to progress callbacks to update GUI progress bars and status.
    """
    completed_tracks: int
    total_tracks: int
    matched_count: int
    unmatched_count: int
    current_track: Dict[str, str] = field(default_factory=dict)  # {'title': str, 'artists': str}
    elapsed_time: float = 0.0
    
    def __post_init__(self):
        """Calculate percentage if not provided"""
        if self.total_tracks > 0:
            self.percentage = (self.completed_tracks / self.total_tracks) * 100.0
        else:
            self.percentage = 0.0


# Type alias for progress callback function
ProgressCallback = Callable[[ProgressInfo], None]


# ============================================================================
# Track Results
# ============================================================================

@dataclass
class TrackResult:
    """
    Result for a single track processing operation.
    
    This replaces the old tuple return (main_row, cand_rows, queries_rows)
    with a structured object that's easier to work with.
    """
    playlist_index: int
    title: str
    artist: str
    matched: bool
    
    # Match information (only if matched=True)
    beatport_url: Optional[str] = None
    beatport_title: Optional[str] = None
    beatport_artists: Optional[str] = None
    beatport_key: Optional[str] = None
    beatport_key_camelot: Optional[str] = None
    beatport_year: Optional[str] = None
    beatport_bpm: Optional[str] = None
    beatport_label: Optional[str] = None
    beatport_genres: Optional[str] = None
    beatport_release: Optional[str] = None
    beatport_release_date: Optional[str] = None
    beatport_track_id: Optional[str] = None
    
    # Scoring information
    match_score: Optional[float] = None
    title_sim: Optional[float] = None
    artist_sim: Optional[float] = None
    confidence: Optional[str] = None  # "high", "medium", "low"
    
    # Search metadata
    search_query_index: Optional[str] = None
    search_stop_query_index: Optional[str] = None
    candidate_index: Optional[str] = None
    
    # Detailed data (for CSV export)
    candidates: List[Dict[str, Any]] = field(default_factory=list)
    queries: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, str]:
        """
        Convert to dictionary format for CSV export.
        
        This matches the old format from process_track() for backward compatibility.
        """
        return {
            "playlist_index": str(self.playlist_index),
            "original_title": self.title,
            "original_artists": self.artist,
            "beatport_title": self.beatport_title or "",
            "beatport_artists": self.beatport_artists or "",
            "beatport_key": self.beatport_key or "",
            "beatport_key_camelot": self.beatport_key_camelot or "",
            "beatport_year": self.beatport_year or "",
            "beatport_bpm": self.beatport_bpm or "",
            "beatport_label": self.beatport_label or "",
            "beatport_genres": self.beatport_genres or "",
            "beatport_release": self.beatport_release or "",
            "beatport_release_date": self.beatport_release_date or "",
            "beatport_track_id": self.beatport_track_id or "",
            "beatport_url": self.beatport_url or "",
            "title_sim": str(self.title_sim) if self.title_sim is not None else "0",
            "artist_sim": str(self.artist_sim) if self.artist_sim is not None else "0",
            "match_score": f"{self.match_score:.1f}" if self.match_score is not None else "0.0",
            "confidence": self.confidence or "low",
            "search_query_index": self.search_query_index or "0",
            "search_stop_query_index": self.search_stop_query_index or "0",
            "candidate_index": self.candidate_index or "0",
        }


# ============================================================================
# Cancellation Support
# ============================================================================

class ProcessingController:
    """
    Thread-safe controller for processing operations with cancellation support.
    
    This allows GUI to cancel long-running operations safely.
    """
    
    def __init__(self):
        """Initialize controller with cancellation state"""
        self._cancelled = False
        self._lock = threading.Lock()
    
    def cancel(self):
        """Request cancellation of processing operation"""
        with self._lock:
            self._cancelled = True
    
    def is_cancelled(self) -> bool:
        """Check if cancellation was requested (thread-safe)"""
        with self._lock:
            return self._cancelled
    
    def reset(self):
        """Reset cancellation state (for new operation)"""
        with self._lock:
            self._cancelled = False


# ============================================================================
# Error Handling
# ============================================================================

class ErrorType(Enum):
    """Types of errors that can occur during processing"""
    FILE_NOT_FOUND = "file_not_found"
    PLAYLIST_NOT_FOUND = "playlist_not_found"
    XML_PARSE_ERROR = "xml_parse_error"
    NETWORK_ERROR = "network_error"
    PROCESSING_ERROR = "processing_error"
    VALIDATION_ERROR = "validation_error"


@dataclass
class ProcessingError(Exception):
    """
    Structured error for GUI display.
    
    This replaces print_error() calls with structured errors that GUI can display
    in user-friendly dialogs.
    """
    error_type: ErrorType
    message: str
    details: Optional[str] = None
    suggestions: List[str] = field(default_factory=list)
    recoverable: bool = False
    
    def __str__(self) -> str:
        """String representation of error"""
        return self.message
```

**Implementation Checklist**:
- [ ] Create file `SRC/gui_interface.py`
- [ ] Copy exact code structure above
- [ ] Verify all imports work (dataclasses, enum, typing, threading)
- [ ] Test import: `from gui_interface import ProgressInfo, TrackResult, ProcessingController, ProcessingError, ErrorType, ProgressCallback`
- [ ] Create simple test: instantiate each class and verify no errors

**Acceptance Criteria**:
- ✅ File exists at `SRC/gui_interface.py`
- ✅ All classes defined with complete type hints
- ✅ Can import without errors: `from gui_interface import *`
- ✅ `TrackResult.to_dict()` method works correctly
- ✅ `ProcessingController.is_cancelled()` is thread-safe
- ✅ All dataclasses have proper default values

**DO NOT**:
- ❌ Don't add any business logic here (only data structures)
- ❌ Don't import from processor.py or other modules
- ❌ Don't add any file I/O or network code

---

### Step 0.2: Create Output Writer Module (1 day)
**File**: `SRC/output_writer.py` (NEW - CREATE FROM SCRATCH)

**Dependencies**: Step 0.1 (needs `TrackResult` from `gui_interface.py`)

**What to create - EXACT STRUCTURE:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Output Writer Module - CSV file writing functions

This module handles all CSV file writing, separating I/O from business logic.
All functions take TrackResult objects as input and write CSV files.
"""

import csv
import os
from typing import List, Dict, Set, Optional
from gui_interface import TrackResult
from utils import with_timestamp


def write_csv_files(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Dict[str, str]:
    """
    Write all CSV files from TrackResult objects.
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename (timestamp will be added)
        output_dir: Output directory (default: "output")
    
    Returns:
        Dictionary mapping file type to file path:
        {
            'main': 'output/filename_20250127_123456.csv',
            'candidates': 'output/filename_candidates_20250127_123456.csv',
            'queries': 'output/filename_queries_20250127_123456.csv',
            'review': 'output/filename_review_20250127_123456.csv' (if needed)
        }
    """
    os.makedirs(output_dir, exist_ok=True)
    output_files = {}
    
    # Add timestamp to base filename
    timestamped_filename = with_timestamp(base_filename)
    
    # Write main results CSV
    main_path = write_main_csv(results, timestamped_filename, output_dir)
    if main_path:
        output_files['main'] = main_path
    
    # Write candidates CSV
    candidates_path = write_candidates_csv(results, timestamped_filename, output_dir)
    if candidates_path:
        output_files['candidates'] = candidates_path
    
    # Write queries CSV
    queries_path = write_queries_csv(results, timestamped_filename, output_dir)
    if queries_path:
        output_files['queries'] = queries_path
    
    # Write review CSV (if there are tracks needing review)
    review_indices = _get_review_indices(results)
    if review_indices:
        review_path = write_review_csv(results, review_indices, timestamped_filename, output_dir)
        if review_path:
            output_files['review'] = review_path
    
    return output_files


def write_main_csv(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write main results CSV file (one row per track).
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no results
    """
    if not results:
        return None
    
    filepath = os.path.join(output_dir, base_filename)
    
    # Define CSV columns (must match old format exactly)
    fieldnames = [
        "playlist_index", "original_title", "original_artists",
        "beatport_title", "beatport_artists", "beatport_key", "beatport_key_camelot",
        "beatport_year", "beatport_bpm", "beatport_label", "beatport_genres",
        "beatport_release", "beatport_release_date", "beatport_track_id",
        "beatport_url", "title_sim", "artist_sim", "match_score", "confidence",
        "search_query_index", "search_stop_query_index", "candidate_index"
    ]
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(result.to_dict())
    
    return filepath


def write_candidates_csv(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write candidates CSV file (all candidates evaluated for all tracks).
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no candidates
    """
    # Collect all candidates from all tracks
    all_candidates = []
    for result in results:
        all_candidates.extend(result.candidates)
    
    if not all_candidates:
        return None
    
    # Remove .csv extension and add _candidates
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_candidates.csv")
    
    # Get fieldnames from first candidate
    fieldnames = list(all_candidates[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_candidates)
    
    return filepath


def write_queries_csv(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write queries CSV file (all queries executed for all tracks).
    
    Args:
        results: List of TrackResult objects
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no queries
    """
    # Collect all queries from all tracks
    all_queries = []
    for result in results:
        all_queries.extend(result.queries)
    
    if not all_queries:
        return None
    
    # Remove .csv extension and add _queries
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_queries.csv")
    
    # Get fieldnames from first query
    fieldnames = list(all_queries[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_queries)
    
    return filepath


def write_review_csv(
    results: List[TrackResult],
    review_indices: Set[int],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """
    Write review CSV file (tracks needing manual review).
    
    Args:
        results: List of TrackResult objects
        review_indices: Set of playlist indices that need review
        base_filename: Base filename with timestamp
        output_dir: Output directory
    
    Returns:
        Path to written file, or None if no review tracks
    """
    review_results = [r for r in results if r.playlist_index in review_indices]
    if not review_results:
        return None
    
    # Remove .csv extension and add _review
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_review.csv")
    
    # Use same format as main CSV
    fieldnames = [
        "playlist_index", "original_title", "original_artists",
        "beatport_title", "beatport_artists", "beatport_key", "beatport_key_camelot",
        "beatport_year", "beatport_bpm", "beatport_label", "beatport_genres",
        "beatport_release", "beatport_release_date", "beatport_track_id",
        "beatport_url", "title_sim", "artist_sim", "match_score", "confidence",
        "search_query_index", "search_stop_query_index", "candidate_index"
    ]
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for result in review_results:
            writer.writerow(result.to_dict())
    
    return filepath


def write_review_candidates_csv(
    results: List[TrackResult],
    review_indices: Set[int],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """Write candidates CSV for review tracks only"""
    review_results = [r for r in results if r.playlist_index in review_indices]
    if not review_results:
        return None
    
    all_candidates = []
    for result in review_results:
        all_candidates.extend(result.candidates)
    
    if not all_candidates:
        return None
    
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_review_candidates.csv")
    
    fieldnames = list(all_candidates[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_candidates)
    
    return filepath


def write_review_queries_csv(
    results: List[TrackResult],
    review_indices: Set[int],
    base_filename: str,
    output_dir: str = "output"
) -> Optional[str]:
    """Write queries CSV for review tracks only"""
    review_results = [r for r in results if r.playlist_index in review_indices]
    if not review_results:
        return None
    
    all_queries = []
    for result in review_results:
        all_queries.extend(result.queries)
    
    if not all_queries:
        return None
    
    base = base_filename.replace('.csv', '') if base_filename.endswith('.csv') else base_filename
    filepath = os.path.join(output_dir, f"{base}_review_queries.csv")
    
    fieldnames = list(all_queries[0].keys())
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_queries)
    
    return filepath


def _get_review_indices(results: List[TrackResult]) -> Set[int]:
    """
    Determine which tracks need review based on score and match quality.
    
    Review criteria (from old code):
    - Score < 70
    - Artist similarity < 50 (if artists present)
    - No match found
    """
    review_indices = set()
    
    for result in results:
        needs_review = False
        
        # Check score
        if result.match_score is not None and result.match_score < 70:
            needs_review = True
        
        # Check artist similarity (if artists present)
        if result.artist and result.artist.strip():
            if result.artist_sim is not None and result.artist_sim < 50:
                needs_review = True
        
        # Check if no match
        if not result.matched or not (result.beatport_url or "").strip():
            needs_review = True
        
        if needs_review:
            review_indices.add(result.playlist_index)
    
    return review_indices
```

**Implementation Checklist**:
- [ ] Create file `SRC/output_writer.py`
- [ ] Import `TrackResult` from `gui_interface`
- [ ] Copy exact code structure above
- [ ] Verify `utils.with_timestamp()` exists (should already exist)
- [ ] Test with empty results list
- [ ] Test with sample TrackResult objects

**Acceptance Criteria**:
- ✅ File exists at `SRC/output_writer.py`
- ✅ All functions take `List[TrackResult]` as input
- ✅ CSV files are written correctly with proper headers
- ✅ Handles empty results gracefully (returns None)
- ✅ File paths use timestamps correctly
- ✅ Review files only created when needed

**DO NOT**:
- ❌ Don't modify `processor.py` yet (that's step 0.3+)
- ❌ Don't add any business logic (only file I/O)
- ❌ Don't change CSV column names (must match old format)

---

### Step 0.3: Create process_track_with_callback() Function (2 days)
**File**: `SRC/processor.py` (MODIFY - ADD NEW FUNCTION, KEEP OLD ONE)

**Dependencies**: Step 0.1 (needs `TrackResult`, `ProcessingController`, `ProgressCallback`)

**What to do - EXACT STEPS:**

1. **Add imports at top of file** (after existing imports):
```python
from gui_interface import TrackResult, ProcessingController, ProgressCallback, ProcessingError, ErrorType
from typing import Optional, Dict, Any, Callable
```

2. **Add new function AFTER `process_track()` function** (don't delete `process_track()` yet - it's still used by `run()`):

**NOTE**: The full function code is very long (900+ lines). See the detailed implementation in `DOCS/MASTER_PLAN.md` lines 666-902 for the complete code. The key points are:
- Copy ALL logic from `process_track()` 
- Convert return value to `TrackResult` object
- Add cancellation checks (before start, before expensive operations)
- Use `effective_settings` for `MIN_ACCEPT_SCORE`
- Keep all print statements (for CLI compatibility)

**Implementation Checklist**:
- [ ] Add imports for `gui_interface` classes
- [ ] Add new function `process_track_with_callback()` AFTER `process_track()`
- [ ] Copy ALL logic from `process_track()` (don't skip anything)
- [ ] Convert return value to `TrackResult` object
- [ ] Add cancellation checks (before start, before expensive operations)
- [ ] Use `effective_settings` for `MIN_ACCEPT_SCORE`
- [ ] Keep all print statements (for CLI compatibility)
- [ ] Test function with sample RBTrack object

**Acceptance Criteria**:
- ✅ Function exists and can be imported
- ✅ Returns `TrackResult` object (not tuple)
- ✅ Cancellation checks work (returns early if cancelled)
- ✅ Settings override works (uses `effective_settings`)
- ✅ All candidate and query data included in result
- ✅ Old `process_track()` function still exists (don't delete it)

**DO NOT**:
- ❌ Don't delete `process_track()` function (still used by `run()`)
- ❌ Don't modify `process_track()` function
- ❌ Don't skip any logic from `process_track()` (must be identical except return type)

---

### Step 0.4: Create process_playlist() Function (3 days)
**File**: `SRC/processor.py` (MODIFY - ADD NEW FUNCTION)

**Dependencies**: Step 0.3 (needs `process_track_with_callback()`)

**What to do - EXACT STEPS:**

1. **Add new function BEFORE `run()` function**

**NOTE**: The full function code is very long (350+ lines). See the detailed implementation in `DOCS/MASTER_PLAN.md` lines 939-1289 for the complete code. Key points:
- Parse XML with error handling (raises `ProcessingError`)
- Validate playlist exists
- Support both sequential and parallel processing
- Thread-safe progress updates in parallel mode
- Auto-research logic for unmatched tracks
- Returns `List[TrackResult]`

**Implementation Checklist**:
- [ ] Add `threading` import if not already present
- [ ] Add new function `process_playlist()` BEFORE `run()` function
- [ ] Copy exact code structure from MASTER_PLAN.md
- [ ] Handle all error cases with `ProcessingError`
- [ ] Support both sequential and parallel processing
- [ ] Thread-safe progress updates in parallel mode
- [ ] Auto-research logic for unmatched tracks
- [ ] Test with sample XML file

**Acceptance Criteria**:
- ✅ Function exists and can be called
- ✅ Returns `List[TrackResult]` (not None, not dicts)
- ✅ Raises `ProcessingError` for all error cases
- ✅ Supports progress callback (thread-safe in parallel mode)
- ✅ Supports cancellation via controller
- ✅ Auto-research works when enabled
- ✅ Both sequential and parallel modes work

**DO NOT**:
- ❌ Don't modify `run()` function yet (that's step 0.5)
- ❌ Don't write any CSV files here (that's for `run()` or GUI)
- ❌ Don't use `print_error()` - use `ProcessingError` instead

---

### Step 0.5: Update run() Function for Backward Compatibility (1 day)
**File**: `SRC/processor.py` (MODIFY - UPDATE EXISTING FUNCTION)

**Dependencies**: Step 0.2 (needs `output_writer`), Step 0.4 (needs `process_playlist()`)

**What to do - EXACT STEPS:**

1. **Add import at top**:
```python
from output_writer import write_csv_files, write_review_candidates_csv, write_review_queries_csv
```

2. **Modify `run()` function** - Replace the entire function body but KEEP the function signature

**NOTE**: The full function code is very long (300+ lines). See the detailed implementation in `DOCS/MASTER_PLAN.md` lines 1332-1637 for the complete code. Key points:
- Create CLI progress callback wrapper (uses tqdm)
- Call `process_playlist()` instead of old logic
- Convert `TrackResult` objects to dicts for summary
- Use `write_csv_files()` instead of direct CSV writing
- Keep all existing CLI output (print statements, tqdm)
- Keep manual re-search prompt logic

**Implementation Checklist**:
- [ ] Add import for `output_writer` functions
- [ ] Replace `run()` function body (keep signature)
- [ ] Create CLI progress callback wrapper (uses tqdm)
- [ ] Call `process_playlist()` instead of old logic
- [ ] Convert `TrackResult` objects to dicts for summary
- [ ] Use `write_csv_files()` instead of direct CSV writing
- [ ] Keep all existing CLI output (print statements, tqdm)
- [ ] Keep manual re-search prompt logic
- [ ] Test CLI still works: `python SRC/main.py --xml collection.xml --playlist "test"`

**Acceptance Criteria**:
- ✅ CLI command works exactly as before
- ✅ CSV files are written correctly
- ✅ Progress bar (tqdm) still works
- ✅ Summary report still works
- ✅ Manual re-search prompt still works
- ✅ All existing tests pass
- ✅ No breaking changes to CLI interface

**DO NOT**:
- ❌ Don't change function signature of `run()`
- ❌ Don't remove any CLI output (print statements, tqdm)
- ❌ Don't remove manual re-search prompt logic
- ❌ Don't delete old `process_track()` function (might still be referenced)

---

### Step 0.6: Add Retry Logic with Exponential Backoff (3-4 days)
**Status**: ⏸️ OPTIONAL - Can be done later if needed

**Note**: This step is optional and can be deferred. Focus on steps 0.1-0.5 first.

**Design Reference**: `DOCS/DESIGNS/06_Retry_Logic_Exponential_Backoff_Design.md`

---

### Step 0.7: Create Test Suite Foundation (4-5 days)
**Status**: ⏸️ OPTIONAL - Can be done later if needed

**Note**: This step is optional and can be deferred. Focus on steps 0.1-0.5 first.

**Design Reference**: `DOCS/DESIGNS/07_Test_Suite_Foundation_Design.md`

---

## Phase 0 Deliverables Checklist
- [ ] `SRC/gui_interface.py` - Complete with all classes
- [ ] `SRC/output_writer.py` - Complete CSV writing functions
- [ ] `SRC/processor.py` - Updated with new functions
- [ ] `tests/` directory - Test suite with good coverage (optional)
- [ ] CLI still works - Backward compatibility maintained
- [ ] Documentation updated - README reflects new architecture

---

## Testing Strategy

### Unit Tests
- Test `gui_interface.py` classes independently
- Test `output_writer.py` functions with mock data
- Test `process_track_with_callback()` with sample RBTrack

### Integration Tests
- Test `process_playlist()` with real XML file
- Test `run()` function end-to-end
- Test CLI backward compatibility

### Manual Testing
- Run CLI command: `python SRC/main.py --xml collection.xml --playlist "test" --auto-research`
- Verify CSV files are created correctly
- Verify progress bar works
- Verify summary report displays

---

## Common Issues and Solutions

### Issue: Import errors after creating gui_interface.py
**Solution**: Make sure all imports are correct. Test with: `python -c "from gui_interface import *"`

### Issue: CSV files don't match old format
**Solution**: Check that `TrackResult.to_dict()` returns exact same keys as old `process_track()` return format

### Issue: CLI breaks after refactoring
**Solution**: Make sure `run()` function signature is unchanged and all CLI output is preserved

### Issue: Parallel processing doesn't update progress correctly
**Solution**: Make sure progress updates are thread-safe (use `progress_lock`)

---

*For complete code examples, see `DOCS/MASTER_PLAN.md` which contains the full implementation details.*

