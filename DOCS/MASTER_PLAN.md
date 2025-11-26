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

**📄 Detailed Documentation**: See [`DOCS/PHASES/00_Phase_0_Backend_Foundation.md`](PHASES/00_Phase_0_Backend_Foundation.md) for complete implementation guide with exact code structures, step-by-step instructions, and acceptance criteria.

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

### ⚠️ CRITICAL: Implementation Order
**Steps MUST be done in order. Each step depends on the previous one.**
1. Step 0.1 → Step 0.2 → Step 0.3 → Step 0.4 → Step 0.5
2. Steps 0.6 and 0.7 can be done in parallel after 0.5

### Quick Overview

---

#### Step 0.1: Create GUI Interface Module (1 day)
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

#### Step 0.2: Create Output Writer Module (1 day)
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
    
    if not all_candidates:
        return None
    
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

#### Step 0.3: Create process_track_with_callback() Function (2 days)
**File**: `SRC/processor.py` (MODIFY - ADD NEW FUNCTION, KEEP OLD ONE)

**Dependencies**: Step 0.1 (needs `TrackResult`, `ProcessingController`, `ProgressCallback`)

**What to do - EXACT STEPS:**

1. **Add imports at top of file** (after existing imports):
```python
from gui_interface import TrackResult, ProcessingController, ProgressCallback, ProcessingError, ErrorType
from typing import Optional, Dict, Any, Callable
```

2. **Add new function AFTER `process_track()` function** (don't delete `process_track()` yet - it's still used by `run()`):
```python
def process_track_with_callback(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None
) -> TrackResult:
    """
    Process single track with progress callback support.
    
    This is a GUI-friendly version of process_track() that:
    - Returns TrackResult object instead of tuple of dicts
    - Supports cancellation via controller
    - Supports progress callbacks
    - Supports settings override
    
    Args:
        idx: Playlist index (1-based) for this track
        rb: RBTrack object containing original track data from Rekordbox
        settings: Optional settings override (uses SETTINGS if None)
        progress_callback: Optional callback for progress updates
        controller: Optional controller for cancellation support
    
    Returns:
        TrackResult object with match information and candidates/queries
    """
    # Check for cancellation before starting
    if controller and controller.is_cancelled():
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False
        )
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    t0 = time.perf_counter()
    
    # Copy ALL logic from process_track() function:
    # 1. Extract artists, clean title
    original_artists = rb.artists or ""
    title_for_search = sanitize_title_for_search(rb.title)
    artists_for_scoring = original_artists
    
    title_only_search = False
    extracted = False
    
    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, extracted_title = ex
            title_for_search = sanitize_title_for_search(extracted_title)
            extracted = True
        title_only_search = True
    
    # 2. Print statements (keep for CLI compatibility)
    try:
        print(f"[{idx}] Searching Beatport for: {title_for_search} - {original_artists or artists_for_scoring}", flush=True)
    except UnicodeEncodeError:
        safe_title = title_for_search.encode('ascii', 'ignore').decode('ascii')
        safe_artists = (original_artists or artists_for_scoring).encode('ascii', 'ignore').decode('ascii')
        print(f"[{idx}] Searching Beatport for: {safe_title} - {safe_artists}", flush=True)
    
    if extracted and title_only_search:
        print(f"[{idx}]   (artists inferred from title for scoring; search is title-only)", flush=True)
    
    # 3. Generate queries
    queries = make_search_queries(
        title_for_search,
        ("" if title_only_search else artists_for_scoring),
        original_title=rb.title
    )
    
    print(f"[{idx}]   queries:", flush=True)
    for i, q in enumerate(queries, 1):
        try:
            print(f"[{idx}]     {i}. site:beatport.com/track {q}", flush=True)
        except UnicodeEncodeError:
            safe_q = q.encode('ascii', 'ignore').decode('ascii')
            print(f"[{idx}]     {i}. site:beatport.com/track {safe_q}", flush=True)
    
    # 4. Extract mix flags
    input_mix_flags = _parse_mix_flags(rb.title)
    input_generic_phrases = _extract_generic_parenthetical_phrases(rb.title)
    
    # 5. Check cancellation again before expensive operation
    if controller and controller.is_cancelled():
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False
        )
    
    # 6. Execute matching (use effective_settings for MIN_ACCEPT_SCORE)
    min_accept_score = effective_settings.get("MIN_ACCEPT_SCORE", SETTINGS.get("MIN_ACCEPT_SCORE", 70))
    
    best, candlog, queries_audit, stop_qidx = best_beatport_match(
        idx,
        title_for_search,
        artists_for_scoring,
        (title_only_search and not extracted),
        queries,
        input_year=None,
        input_key=None,
        input_mix=input_mix_flags,
        input_generic_phrases=input_generic_phrases,
    )
    
    dur = (time.perf_counter() - t0) * 1000
    
    # 7. Build candidate rows (same as process_track())
    cand_rows: List[Dict[str, Any]] = []
    for c in candlog:
        m = re.search(r'/track/[^/]+/(\d+)', c.url)
        bp_id = m.group(1) if m else ""
        cand_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists or "",
            "candidate_url": c.url,
            "candidate_track_id": bp_id,
            "candidate_title": c.title,
            "candidate_artists": c.artists,
            "candidate_key": c.key or "",
            "candidate_key_camelot": _camelot_key(c.key) or "",
            "candidate_year": str(c.release_year) if c.release_year else "",
            "candidate_bpm": c.bpm or "",
            "candidate_label": c.label or "",
            "candidate_genres": c.genres or "",
            "candidate_release": c.release_name or "",
            "candidate_release_date": c.release_date or "",
            "title_sim": str(c.title_sim),
            "artist_sim": str(c.artist_sim),
            "base_score": f"{c.base_score:.1f}",
            "bonus_year": str(c.bonus_year),
            "bonus_key": str(c.bonus_key),
            "final_score": f"{c.score:.1f}",
            "guard_ok": "Y" if c.guard_ok else "N",
            "reject_reason": c.reject_reason or "",
            "search_query_index": str(c.query_index),
            "search_query_text": c.query_text,
            "candidate_index": str(c.candidate_index),
            "elapsed_ms": str(c.elapsed_ms),
            "winner": "Y" if c.is_winner else "N",
        })
    
    # 8. Build query rows (same as process_track())
    queries_rows: List[Dict[str, Any]] = []
    for (qidx, qtext, num_cands, q_ms) in queries_audit:
        is_winner = "Y" if (best and qidx == best.query_index) else "N"
        winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
        is_stop = "Y" if qidx == stop_qidx else "N"
        queries_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists or "",
            "search_query_index": str(qidx),
            "search_query_text": qtext,
            "candidate_count": str(num_cands),
            "elapsed_ms": str(q_ms),
            "is_winner": is_winner,
            "winner_candidate_index": winner_cand_idx,
            "is_stop": is_stop,
        })
    
    # 9. Check for match and build TrackResult
    if best and best.score >= min_accept_score:
        # Match found
        try:
            print(f"[{idx}] -> Match: {best.title} - {best.artists} "
                  f"(key {best.key or '?'}, year {best.release_year or '?'}) "
                  f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
                  f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]", flush=True)
        except UnicodeEncodeError:
            safe_title = best.title.encode('ascii', 'ignore').decode('ascii')
            safe_artists = best.artists.encode('ascii', 'ignore').decode('ascii')
            safe_key = (best.key or '?').encode('ascii', 'ignore').decode('ascii')
            print(f"[{idx}] -> Match: {safe_title} - {safe_artists} "
                  f"(key {safe_key}, year {best.release_year or '?'}) "
                  f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
                  f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]", flush=True)
        
        m = re.search(r'/track/[^/]+/(\d+)', best.url)
        beatport_track_id = m.group(1) if m else ""
        
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=True,
            beatport_url=best.url,
            beatport_title=best.title,
            beatport_artists=best.artists,
            match_score=best.score,
            title_sim=float(best.title_sim),
            artist_sim=float(best.artist_sim),
            confidence=_confidence_label(best.score),
            beatport_key=best.key,
            beatport_key_camelot=_camelot_key(best.key) or "",
            beatport_year=str(best.release_year) if best.release_year else None,
            beatport_bpm=best.bpm,
            beatport_label=best.label,
            beatport_genres=best.genres,
            beatport_release=best.release_name,
            beatport_release_date=best.release_date,
            beatport_track_id=beatport_track_id,
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index=str(best.query_index),
            search_stop_query_index=str(stop_qidx),
            candidate_index=str(best.candidate_index),
        )
    else:
        # No match found
        try:
            print(f"[{idx}] -> No match candidates found. [{dur:.0f} ms]", flush=True)
        except UnicodeEncodeError:
            pass
        
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False,
            match_score=0.0,
            title_sim=0.0,
            artist_sim=0.0,
            confidence="low",
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index="0",
            search_stop_query_index=str(stop_qidx),
            candidate_index="0",
        )
```

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

#### Step 0.4: Create process_playlist() Function (3 days)
**File**: `SRC/processor.py` (MODIFY - ADD NEW FUNCTION)

**Dependencies**: Step 0.3 (needs `process_track_with_callback()`)

**What to do - EXACT STEPS:**

1. **Add new function BEFORE `run()` function**:
```python
def process_playlist(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None,
    auto_research: bool = False
) -> List[TrackResult]:
    """
    Process playlist with GUI-friendly interface.
    
    This function processes all tracks in a playlist and returns structured results.
    It supports progress callbacks, cancellation, and both sequential and parallel processing.
    
    Args:
        xml_path: Path to Rekordbox XML export file
        playlist_name: Name of playlist to process (must exist in XML)
        settings: Optional settings override (uses SETTINGS if None)
        progress_callback: Optional callback for progress updates
        controller: Optional controller for cancellation support
        auto_research: If True, automatically re-search unmatched tracks with enhanced settings
    
    Returns:
        List of TrackResult objects (one per track)
    
    Raises:
        ProcessingError: If XML file not found, playlist not found, or parsing errors occur
    """
    # Track processing start time
    processing_start_time = time.perf_counter()
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    # Set random seed for deterministic behavior
    random.seed(effective_settings.get("SEED", SETTINGS.get("SEED", 0)))
    
    # Enable HTTP response caching if available and enabled
    if effective_settings.get("ENABLE_CACHE", SETTINGS.get("ENABLE_CACHE", True)) and HAVE_CACHE:
        import requests_cache
        requests_cache.install_cache("bp_cache", expire_after=60 * 60 * 24)
    
    # Parse Rekordbox XML file to extract tracks and playlists
    try:
        tracks_by_id, playlists = parse_rekordbox(xml_path)
    except FileNotFoundError:
        raise ProcessingError(
            error_type=ErrorType.FILE_NOT_FOUND,
            message=f"XML file not found: {xml_path}",
            details="The specified Rekordbox XML export file does not exist.",
            suggestions=[
                "Check that the file path is correct",
                "Verify the file exists and is readable",
                "Ensure the file path uses forward slashes (/) or escaped backslashes (\\)"
            ],
            recoverable=False
        )
    except Exception as e:
        # XML parsing errors
        error_msg = str(e)
        if error_msg.startswith("="):
            # Error message already formatted by rekordbox.py
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=error_msg,
                details=f"Failed to parse XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
        else:
            # Generic parsing error
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=f"XML parsing failed: {error_msg}",
                details=f"Error occurred while parsing XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
    
    # Validate that requested playlist exists in the XML
    if playlist_name not in playlists:
        available_playlists = sorted(playlists.keys())
        raise ProcessingError(
            error_type=ErrorType.PLAYLIST_NOT_FOUND,
            message=f"Playlist '{playlist_name}' not found in XML file",
            details=f"Available playlists: {', '.join(available_playlists[:10])}{'...' if len(available_playlists) > 10 else ''}",
            suggestions=[
                "Check the playlist name spelling (case-sensitive)",
                f"Verify '{playlist_name}' exists in your Rekordbox library",
                "Export a fresh XML file from Rekordbox",
                "Choose from available playlists listed above"
            ],
            recoverable=True
        )
    
    # Get track IDs for the requested playlist
    tids = playlists[playlist_name]
    
    # Build list of tracks to process with their playlist indices
    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))
    
    if not inputs:
        raise ProcessingError(
            error_type=ErrorType.VALIDATION_ERROR,
            message=f"Playlist '{playlist_name}' is empty",
            details="The playlist contains no valid tracks.",
            suggestions=[
                "Verify the playlist has tracks in Rekordbox",
                "Export a fresh XML file from Rekordbox"
            ],
            recoverable=True
        )
    
    # Create a mapping for quick lookup (used when tracking unmatched tracks in parallel mode)
    inputs_map = {idx: rb for idx, rb in inputs}
    
    # Initialize results list and statistics
    results: List[TrackResult] = []
    matched_count = 0
    unmatched_count = 0
    
    # Thread-safe progress tracking for parallel mode
    progress_lock = threading.Lock()
    
    # Determine processing mode (sequential or parallel)
    track_workers = effective_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 12))
    
    if track_workers > 1:
        print(f"Using parallel processing with {track_workers} workers", flush=True)
        # PARALLEL MODE: Process multiple tracks simultaneously
        # Use ThreadPoolExecutor to run process_track_with_callback() in parallel
        with ThreadPoolExecutor(max_workers=track_workers) as ex:
            # Submit all tasks
            future_to_args = {
                ex.submit(
                    process_track_with_callback,
                    idx,
                    rb,
                    settings=effective_settings,
                    progress_callback=None,  # Don't pass callback to individual tracks in parallel mode
                    controller=controller
                ): (idx, rb) 
                for idx, rb in inputs
            }
            
            # Process completed tasks as they finish
            results_dict: Dict[int, TrackResult] = {}  # Store results by index for ordering
            
            for future in as_completed(future_to_args):
                # Check for cancellation
                if controller and controller.is_cancelled():
                    # Cancel remaining futures
                    for f in future_to_args.keys():
                        f.cancel()
                    break
                
                try:
                    result = future.result()
                    results_dict[result.playlist_index] = result
                    
                    # Thread-safe progress update
                    with progress_lock:
                        if result.matched:
                            matched_count += 1
                        else:
                            unmatched_count += 1
                        
                        # Update progress callback (thread-safe)
                        if progress_callback:
                            completed = len(results_dict)
                            elapsed_time = time.perf_counter() - processing_start_time
                            progress_info = ProgressInfo(
                                completed_tracks=completed,
                                total_tracks=len(inputs),
                                matched_count=matched_count,
                                unmatched_count=unmatched_count,
                                current_track={
                                    'title': result.title,
                                    'artists': result.artist
                                },
                                elapsed_time=elapsed_time
                            )
                            try:
                                progress_callback(progress_info)
                            except Exception:
                                # Don't let callback errors break processing
                                pass
                
                except Exception as e:
                    # Handle errors from individual track processing
                    idx, rb = future_to_args[future]
                    # Create error result
                    error_result = TrackResult(
                        playlist_index=idx,
                        title=rb.title,
                        artist=rb.artists or "",
                        matched=False
                    )
                    results_dict[idx] = error_result
                    unmatched_count += 1
            
            # Sort results by playlist index to maintain order
            results = [results_dict[idx] for idx in sorted(results_dict.keys())]
    
    else:
        # SEQUENTIAL MODE: Process tracks one at a time
        print(f"Using sequential processing (TRACK_WORKERS={track_workers})", flush=True)
        for idx, rb in inputs:
            # Check for cancellation
            if controller and controller.is_cancelled():
                break
            
            # Process track
            result = process_track_with_callback(
                idx,
                rb,
                settings=effective_settings,
                progress_callback=None,  # Don't pass callback to individual tracks
                controller=controller
            )
            
            results.append(result)
            
            # Update statistics
            if result.matched:
                matched_count += 1
            else:
                unmatched_count += 1
            
            # Update progress callback
            if progress_callback:
                completed = len(results)
                elapsed_time = time.perf_counter() - processing_start_time
                
                progress_info = ProgressInfo(
                    completed_tracks=completed,
                    total_tracks=len(inputs),
                    matched_count=matched_count,
                    unmatched_count=unmatched_count,
                    current_track={
                        'title': rb.title,
                        'artists': rb.artists or ""
                    },
                    elapsed_time=elapsed_time
                )
                try:
                    progress_callback(progress_info)
                except Exception:
                    # Don't let callback errors break processing
                    pass
    
    # Handle auto-research for unmatched tracks if requested and not cancelled
    if auto_research and not (controller and controller.is_cancelled()):
        unmatched_results = [r for r in results if not r.matched]
        if unmatched_results:
            print(f"\n{'='*80}", flush=True)
            print(f"Auto-research: Found {len(unmatched_results)} unmatched track(s), re-searching with enhanced settings...", flush=True)
            print(f"{'='*80}\n", flush=True)
            
            # Enhanced settings for re-search
            enhanced_settings = effective_settings.copy()
            enhanced_settings["PER_TRACK_TIME_BUDGET_SEC"] = max(
                enhanced_settings.get("PER_TRACK_TIME_BUDGET_SEC", 45), 90
            )
            enhanced_settings["MAX_SEARCH_RESULTS"] = max(
                enhanced_settings.get("MAX_SEARCH_RESULTS", 50), 100
            )
            enhanced_settings["MAX_QUERIES_PER_TRACK"] = max(
                enhanced_settings.get("MAX_QUERIES_PER_TRACK", 40), 60
            )
            enhanced_settings["MIN_ACCEPT_SCORE"] = max(
                enhanced_settings.get("MIN_ACCEPT_SCORE", 70), 60
            )
            
            # Re-search unmatched tracks in parallel
            unmatched_inputs = [(result.playlist_index, inputs_map[result.playlist_index]) 
                               for result in unmatched_results 
                               if result.playlist_index in inputs_map]
            
            if unmatched_inputs:
                # Use same parallel processing approach as main processing
                track_workers = enhanced_settings.get("TRACK_WORKERS", SETTINGS.get("TRACK_WORKERS", 12))
                if track_workers > 1 and len(unmatched_inputs) > 1:
                    # Parallel re-search
                    print(f"\nRe-searching {len(unmatched_inputs)} unmatched tracks using parallel processing with {min(track_workers, len(unmatched_inputs))} workers", flush=True)
                    with ThreadPoolExecutor(max_workers=min(track_workers, len(unmatched_inputs))) as ex:
                        future_to_idx = {
                            ex.submit(
                                process_track_with_callback,
                                idx,
                                rb,
                                settings=enhanced_settings,
                                progress_callback=None,
                                controller=controller
                            ): idx
                            for idx, rb in unmatched_inputs
                        }
                        
                        for future in as_completed(future_to_idx):
                            idx = future_to_idx[future]
                            try:
                                new_result = future.result()
                                # Find and update the result
                                for i, result in enumerate(results):
                                    if result.playlist_index == idx:
                                        if new_result.matched:
                                            results[i] = new_result
                                            matched_count += 1
                                            unmatched_count -= 1
                                        break
                            except Exception as e:
                                # Error handling - keep original unmatched result
                                pass
                else:
                    # Sequential re-search (fallback)
                    reason = "only 1 unmatched track" if len(unmatched_inputs) == 1 else f"TRACK_WORKERS={track_workers}"
                    print(f"\nRe-searching {len(unmatched_inputs)} unmatched tracks using sequential processing ({reason})", flush=True)
                    for idx, rb in unmatched_inputs:
                        if controller and controller.is_cancelled():
                            break
                        
                        new_result = process_track_with_callback(
                            idx,
                            rb,
                            settings=enhanced_settings,
                            progress_callback=None,
                            controller=controller
                        )
                        
                        # Update result if we found a match
                        if new_result.matched:
                            for i, result in enumerate(results):
                                if result.playlist_index == idx:
                                    results[i] = new_result
                                    matched_count += 1
                                    unmatched_count -= 1
                                    break
    
    return results
```

**Implementation Checklist**:
- [ ] Add `threading` import if not already present
- [ ] Add new function `process_playlist()` BEFORE `run()` function
- [ ] Copy exact code structure above
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

#### Step 0.5: Update run() Function for Backward Compatibility (1 day)
**File**: `SRC/processor.py` (MODIFY - UPDATE EXISTING FUNCTION)

**Dependencies**: Step 0.2 (needs `output_writer`), Step 0.4 (needs `process_playlist()`)

**What to do - EXACT STEPS:**

1. **Add import at top**:
```python
from output_writer import write_csv_files, write_review_candidates_csv, write_review_queries_csv
```

2. **Modify `run()` function** - Replace the entire function body but KEEP the function signature:
```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    """
    Main processing function - orchestrates the entire matching pipeline
    
    Legacy CLI function - wraps new process_playlist() for backward compatibility.
    This function maintains the existing CLI interface while using the new GUI-ready backend.
    
    Args:
        xml_path: Path to Rekordbox XML export file
        playlist_name: Name of playlist to process (must exist in XML)
        out_csv_base: Base filename for output CSV files (timestamp auto-appended)
        auto_research: If True, automatically re-search unmatched tracks without prompting
    
    Output files (all in output/ directory):
        - {out_csv_base} (timestamp).csv: Main results (one row per track)
        - {out_csv_base}_review.csv: Tracks needing review (low scores, weak matches)
        - {out_csv_base}_candidates.csv: All candidates evaluated for all tracks
        - {out_csv_base}_review_candidates.csv: Candidates for review tracks only
        - {out_csv_base}_queries.csv: All queries executed for all tracks
        - {out_csv_base}_review_queries.csv: Queries for review tracks only
    """
    # Track processing start time for summary statistics
    processing_start_time = time.perf_counter()
    
    # Create CLI progress callback wrapper (updates tqdm progress bar)
    # Use a list to hold the progress bar so we can modify it from the callback
    pbar_container = [None]
    
    def cli_progress_callback(progress_info: ProgressInfo):
        """CLI progress callback that updates tqdm progress bar"""
        if pbar_container[0] is None:
            # Initialize progress bar on first callback
            pbar_container[0] = tqdm(total=progress_info.total_tracks, desc="Processing tracks", unit="track",
                                    bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]')
        
        pbar = pbar_container[0]
        
        # Update progress bar
        current_pos = progress_info.completed_tracks
        pbar.n = current_pos
        pbar.refresh()
        
        # Update postfix with current stats
        current_track_title = progress_info.current_track.get('title', '') if progress_info.current_track else ''
        if len(current_track_title) > 30:
            current_track_title = current_track_title[:30] + "..."
        
        pbar.set_postfix({
            'matched': progress_info.matched_count,
            'unmatched': progress_info.unmatched_count,
            'current': current_track_title if current_track_title else f"Track {progress_info.completed_tracks}"
        })
    
    # Process playlist using new backend
    try:
        results = process_playlist(
            xml_path=xml_path,
            playlist_name=playlist_name,
            progress_callback=cli_progress_callback,
            auto_research=auto_research
        )
    except ProcessingError as e:
        # Convert ProcessingError to CLI-friendly error messages
        if e.error_type == ErrorType.FILE_NOT_FOUND:
            print_error(error_file_not_found(xml_path, "XML", "Check the --xml file path"))
        elif e.error_type == ErrorType.PLAYLIST_NOT_FOUND:
            print_error(error_playlist_not_found(playlist_name, []))
        elif e.error_type == ErrorType.XML_PARSE_ERROR:
            print_error(e.message, exit_code=None)
        else:
            print_error(f"Processing error: {e.message}", exit_code=None)
        return
    except Exception as e:
        # Handle unexpected errors
        error_msg = str(e)
        if error_msg.startswith("="):
            print_error(error_msg, exit_code=None)
        else:
            from error_handling import error_xml_parsing
            print_error(error_xml_parsing(xml_path, e, None), exit_code=None)
        return
    finally:
        # Close progress bar if it was opened
        if pbar_container[0] is not None:
            pbar_container[0].close()
    
    # Convert TrackResult objects to dict format for summary report
    rows = [result.to_dict() for result in results]
    
    # Collect all candidates and queries for summary
    all_candidates: List[Dict[str, str]] = []
    all_queries: List[Dict[str, str]] = []
    for result in results:
        all_candidates.extend(result.candidates)
        all_queries.extend(result.queries)
    
    # Generate output file paths with timestamps
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    base_filename = with_timestamp(out_csv_base)
    
    # Write CSV files using output_writer module
    output_files = write_csv_files(results, base_filename, output_dir)
    
    # Get review indices for review-specific files
    review_indices = set()
    for result in results:
        score = result.match_score or 0.0
        artist_sim = result.artist_sim or 0.0
        artists_present = bool((result.artist or "").strip())
        needs_review = False
        
        if score < 70:
            needs_review = True
        if artists_present and artist_sim < 35:
            beatport_artists = result.beatport_artists or ""
            if not _artist_token_overlap(result.artist, beatport_artists):
                needs_review = True
        if not result.matched or not (result.beatport_url or "").strip():
            needs_review = True
        
        if needs_review:
            review_indices.add(result.playlist_index)
    
    # Write review-specific files if needed
    if review_indices:
        review_cands_path = write_review_candidates_csv(results, review_indices, base_filename, output_dir)
        review_queries_path = write_review_queries_csv(results, review_indices, base_filename, output_dir)
        if review_cands_path:
            output_files['review_candidates'] = review_cands_path
            print(f"Review candidates: {len([c for r in results if r.playlist_index in review_indices for c in r.candidates])} rows -> {review_cands_path}")
        if review_queries_path:
            output_files['review_queries'] = review_queries_path
            print(f"Review queries: {len([q for r in results if r.playlist_index in review_indices for q in r.queries])} rows -> {review_queries_path}")
    
    # Print file output messages
    if output_files.get('main'):
        print(f"\nDone. Wrote {len(rows)} rows -> {output_files['main']}")
    if output_files.get('candidates'):
        print(f"Candidates: {len(all_candidates)} rows -> {output_files['candidates']}")
    if output_files.get('queries'):
        print(f"Queries: {len(all_queries)} rows -> {output_files['queries']}")
    if output_files.get('review'):
        review_count = len([r for r in results if r.playlist_index in review_indices])
        print(f"Review list: {review_count} rows -> {output_files['review']}")
    
    # Handle unmatched tracks display and re-search prompt (if not auto-research)
    unmatched_results = [r for r in results if not r.matched]
    if unmatched_results and not auto_research:
        # Display list of unmatched tracks
        print(f"\n{'='*80}")
        print(f"Found {len(unmatched_results)} unmatched track(s):")
        print(f"{'='*80}")
        for result in unmatched_results:
            artists_str = result.artist or "(no artists)"
            try:
                print(f"  [{result.playlist_index}] {result.title} - {artists_str}")
            except UnicodeEncodeError:
                # Unicode-safe fallback
                safe_title = result.title.encode('ascii', 'ignore').decode('ascii')
                safe_artists = artists_str.encode('ascii', 'ignore').decode('ascii')
                print(f"  [{result.playlist_index}] {safe_title} - {safe_artists}")
        
        print(f"\n{'='*80}")
        # Check if we're in an interactive environment
        if sys.stdin.isatty():
            # Interactive mode: prompt user for confirmation
            try:
                response = input("Search again for these tracks with enhanced settings? (y/n): ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                # User interrupted (Ctrl+C) or EOF
                print("\nRe-search skipped (interrupted).")
                response = 'n'
        else:
            # Non-interactive mode (piped input, script, etc.): skip prompt
            print("Non-interactive mode: Skipping re-search prompt.")
            print("(To enable re-search, use --auto-research flag or run in interactive terminal)")
            response = 'n'
        
        if response == 'y' or response == 'yes':
            print("\nRe-searching unmatched tracks with enhanced settings...")
            print("=" * 80)
            
            # Re-process playlist with auto_research=True
            try:
                # Create new progress callback for re-search
                pbar_research_container = [None]
                
                def cli_progress_callback_research(progress_info: ProgressInfo):
                    """CLI progress callback for re-search"""
                    if pbar_research_container[0] is None:
                        pbar_research_container[0] = tqdm(total=progress_info.total_tracks, desc="Re-searching", unit="track",
                                                         bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]')
                    pbar_research = pbar_research_container[0]
                    pbar_research.n = progress_info.completed_tracks
                    pbar_research.refresh()
                    pbar_research.set_postfix({
                        'matched': progress_info.matched_count,
                        'unmatched': progress_info.unmatched_count
                    })
                
                # Re-process with auto_research=True
                updated_results = process_playlist(
                    xml_path=xml_path,
                    playlist_name=playlist_name,
                    progress_callback=cli_progress_callback_research,
                    auto_research=True
                )
                
                if pbar_research_container[0] is not None:
                    pbar_research_container[0].close()
                
                # Update results with new matches
                results_dict = {r.playlist_index: r for r in results}
                for new_result in updated_results:
                    if new_result.matched:
                        old_result = results_dict.get(new_result.playlist_index)
                        if old_result is None or not old_result.matched:
                            # This is a new match or improved match
                            results_dict[new_result.playlist_index] = new_result
                
                # Rebuild results list maintaining order
                results = [results_dict.get(i, r) for i, r in enumerate(results, start=1) if i <= len(results)]
                
                # Update rows and files
                rows = [result.to_dict() for result in results]
                all_candidates = []
                all_queries = []
                for result in results:
                    all_candidates.extend(result.candidates)
                    all_queries.extend(result.queries)
                
                # Re-write CSV files
                output_files = write_csv_files(results, base_filename, output_dir)
                
                # Update review files
                review_indices = set()
                for result in results:
                    score = result.match_score or 0.0
                    artist_sim = result.artist_sim or 0.0
                    artists_present = bool((result.artist or "").strip())
                    needs_review = False
                    
                    if score < 70:
                        needs_review = True
                    if artists_present and artist_sim < 35:
                        beatport_artists = result.beatport_artists or ""
                        if not _artist_token_overlap(result.artist, beatport_artists):
                            needs_review = True
                    if not result.matched or not (result.beatport_url or "").strip():
                        needs_review = True
                    
                    if needs_review:
                        review_indices.add(result.playlist_index)
                
                if review_indices:
                    review_cands_path = write_review_candidates_csv(results, review_indices, base_filename, output_dir)
                    review_queries_path = write_review_queries_csv(results, review_indices, base_filename, output_dir)
                    if review_cands_path:
                        output_files['review_candidates'] = review_cands_path
                    if review_queries_path:
                        output_files['review_queries'] = review_queries_path
                
                new_matches = sum(1 for r in results if r.matched and (results_dict.get(r.playlist_index) is None or not results_dict.get(r.playlist_index).matched))
                if new_matches > 0:
                    print(f"\n{'='*80}")
                    print(f"Found {new_matches} new match(es)!")
                    print(f"Updated CSV files.")
                else:
                    print(f"\nNo new matches found after re-search.")
                
                print(f"\n{'='*80}")
                print("Re-search complete.")
            except ProcessingError as e:
                print_error(f"Re-search error: {e.message}", exit_code=None)
            except Exception as e:
                print_error(f"Re-search failed: {str(e)}", exit_code=None)
        else:
            print("Re-search skipped.")
    
    # Calculate total processing time
    processing_time_sec = time.perf_counter() - processing_start_time
    
    # Generate and display summary statistics report
    summary = generate_summary_report(
        playlist_name=playlist_name,
        rows=rows,
        all_candidates=all_candidates,
        all_queries=all_queries,
        processing_time_sec=processing_time_sec,
        output_files=output_files
    )
    
    # Print summary (already ASCII-safe)
    print("\n" + summary)
    
    # Optionally save summary to file
    summary_file = os.path.join(output_dir, re.sub(r"\.csv$", "_summary.txt", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_summary.txt")
    try:
        with open(summary_file, "w", encoding="utf-8") as f:
            f.write(summary)
        print(f"\nSummary saved to: {summary_file}")
    except Exception as e:
        # If we can't write summary file, just continue (non-critical)
        pass
```

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

#### Step 0.6: Add Retry Logic with Exponential Backoff (3-4 days)
**Status**: ⏸️ OPTIONAL - Can be done later if needed

**Note**: This step is optional and can be deferred. Focus on steps 0.1-0.5 first.

---

#### Step 0.7: Create Test Suite Foundation (4-5 days)
**Status**: ⏸️ OPTIONAL - Can be done later if needed

**Note**: This step is optional and can be deferred. Focus on steps 0.1-0.5 first.

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

**📄 Detailed Documentation**: See [`DOCS/PHASES/01_Phase_1_GUI_Foundation.md`](PHASES/01_Phase_1_GUI_Foundation.md) for complete implementation guide with exact PySide6 code structures, step-by-step instructions, and acceptance criteria.

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

### Quick Overview

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

### Phase 1 Deliverables Checklist
- [ ] GUI application launches
- [ ] All core features work
- [ ] File selection works (browse + drag & drop)
- [ ] Playlist selection works
- [ ] Processing starts and shows progress
- [ ] Results display correctly
- [ ] CSV download works
- [ ] Error handling shows user-friendly dialogs
- [ ] Cancellation works
- [ ] User testing done

---

## 🎨 Phase 2: GUI User Experience (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - HIGH PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

**📄 Detailed Documentation**: See [`DOCS/PHASES/02_Phase_2_GUI_User_Experience.md`](PHASES/02_Phase_2_GUI_User_Experience.md) for complete implementation guide.

### Goal
Enhance GUI with advanced features for better user experience.

### Quick Overview

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

#### Step 2.4: Batch Playlist Processing (3-4 days)
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

### Phase 2 Deliverables Checklist
- [ ] Results table enhanced with sort/filter
- [ ] Multiple candidates display
- [ ] Export formats work (CSV, JSON, Excel)
- [ ] Batch playlist processing works
- [ ] All features tested

---

## 🔧 Phase 3: Reliability & Performance (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: ⚡ P1 - MEDIUM PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation)

**📄 Detailed Documentation**: See [`DOCS/PHASES/03_Phase_3_Reliability_Performance.md`](PHASES/03_Phase_3_Reliability_Performance.md) for complete implementation guide.

### Goal
Improve reliability and performance, add batch processing.

### Quick Overview

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

**📄 Detailed Documentation**: See [`DOCS/PHASES/04_Phase_4_Advanced_Features.md`](PHASES/04_Phase_4_Advanced_Features.md) for complete implementation guide.

### Goal
Add advanced features as needed.

### Features
- Enhanced Export Features (Step 4.1)
- Advanced Filtering (Step 4.2)
- Keyboard Shortcuts (Step 4.6, optional)

**Future Features** (see `DOCS/PHASES/05_Future_Features/`):
- Traxsource Integration
- Command-Line Interface (CLI)
- Advanced Matching Rules
- Database Integration
- Batch Processing Enhancements
- Visual Analytics Dashboard

**Design References**: Available in `DOCS/DESIGNS/`

---

## ⚡ Phase 8: Async I/O Refactoring (4-5 days)

**Status**: 📝 Planned (Evaluate Need Based on Phase 3 Metrics)  
**Priority**: 🚀 Medium Priority (Only if Phase 3 shows network I/O bottleneck)  
**Dependencies**: Phase 0 (backend), Phase 1 (GUI), Phase 3 (performance metrics), Python 3.7+ (for async/await)

**📄 Detailed Documentation**: See [`DOCS/PHASES/08_Phase_8_Async_IO.md`](PHASES/08_Phase_8_Async_IO.md) for complete implementation guide.

### Goal
Refactor network I/O operations to use async/await for improved performance in parallel processing scenarios, but only if Phase 3 performance metrics indicate that network I/O is a significant bottleneck.

### Quick Overview
- Async Beatport search functions
- Concurrent fetching for multiple tracks
- Performance improvement (30-50% faster for multi-track processing)
- Backward compatible (sync functions still available)
- Configurable via settings

**IMPORTANT**: Only implement this phase if Phase 3 metrics show network I/O is a significant bottleneck (>40% of total time). Otherwise, skip to other phases.

---

## 🔧 Phase 5: Code Restructuring & Professional Organization (3-4 weeks)

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY (Foundation for future development)  
**Dependencies**: Phase 0 (Backend Foundation), Phase 1 (GUI Foundation), Phase 2 (User Experience), Phase 3 (Reliability & Performance)

**📄 Detailed Documentation**: See [`DOCS/PHASES/05_Phase_5_Code_Restructuring.md`](PHASES/05_Phase_5_Code_Restructuring.md) for complete implementation guide.

### Goal
Restructure the codebase into a professional, maintainable architecture with proper separation of concerns, comprehensive testing, and clear organization. This establishes a solid foundation for easier future improvements and changes.

### Quick Overview
- Professional project structure
- Separation of concerns (business logic, UI, data access)
- Comprehensive test suite (>80% coverage)
- Type hints throughout
- Dependency injection
- Standardized error handling and logging
- Code style compliance (PEP 8)
- Centralized configuration
- All existing functionality preserved

**Key Benefits**:
- Easier maintenance and debugging
- Faster feature development
- Better code reusability
- Improved team collaboration
- Professional codebase ready for scaling

---

## 📦 Phase 7: Packaging & Polish (2-3 weeks)

**Status**: 📝 Planned  
**Priority**: 🚀 P2 - LOWER PRIORITY (Do after features are complete)  
**Dependencies**: Phase 1 (GUI Foundation), Phase 2 (User Experience), Phase 3 (Reliability)

**📄 Detailed Documentation**: See [`DOCS/PHASES/07_Phase_7_Packaging_Polish.md`](PHASES/07_Phase_7_Packaging_Polish.md) for complete implementation guide.

### Goal
Create distributable executables and add polish features for a professional finish.

### Quick Overview

#### Step 7.1: Create Executable Packaging (1 week)
**Files**: `build/` directory (NEW)

**What to create:**
- PyInstaller spec file
- Build scripts
- Installer scripts (NSIS/Inno Setup)
- Icon assets
- GitHub Actions workflow

**Design Reference**: `DOCS/DESIGNS/17_Executable_Packaging_Design.md`

**Acceptance Criteria**:
- Executable builds successfully
- Windows installer works
- macOS app bundle works
- Linux AppImage works
- CI builds automatically

---

#### Step 7.2: GUI Enhancements (1-2 weeks)
**Files**: Various GUI files (MODIFY)

**What to add:**
- Icons and branding
- Settings persistence
- Recent files menu
- Dark mode support
- Menu bar and shortcuts
- Help system

**Design Reference**: `DOCS/DESIGNS/00_Desktop_GUI_Application_Design.md` (Section 6)
**Design Reference**: `DOCS/DESIGNS/18_GUI_Enhancements_Design.md`

**Acceptance Criteria**:
- Icons display correctly
- Settings persist between sessions
- Recent files work
- Dark mode works
- Shortcuts work
- Help accessible

---

### Phase 7 Deliverables Checklist
- [ ] Executable builds for all platforms
- [ ] Windows installer works
- [ ] macOS app bundle works
- [ ] Linux AppImage works
- [ ] Icons and branding complete
- [ ] Settings persistence works
- [ ] Recent files menu works
- [ ] Dark mode works
- [ ] Keyboard shortcuts work
- [ ] Help system complete

---

## 🎨 Phase 6: UI Restructuring & Modern Design (4-5 weeks)

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY (User Experience Enhancement)  
**Dependencies**: Phase 1 (GUI Foundation), Phase 2 (User Experience), Phase 5 (Code Restructuring recommended)

**📄 Detailed Documentation**: See [`DOCS/PHASES/06_Phase_6_UI_Restructuring.md`](PHASES/06_Phase_6_UI_Restructuring.md) for complete implementation guide.

### Goal
Completely restructure the user interface to be modern, visually appealing (Pokemon 2D pixel art style), and "dumb easy" for non-technical users. Advanced settings and features will be available but hidden by default, creating a simple, intuitive experience for casual users while maintaining power-user capabilities.

### Quick Overview
- **Visual Design**: Pokemon 2D pixel art style with custom icons and graphics
- **Simple Mode**: Default view shows only essential features for non-technical users
- **Advanced Mode**: Power users can access all features via toggle
- **Onboarding**: Interactive tutorial system for new users
- **Custom Widgets**: Pixel art styled UI components
- **Animations**: Smooth transitions and micro-interactions
- **Accessibility**: Usable by users of all technical levels

**Key Features**:
- Simplified workflow: Select → Process → View → Export
- Progressive disclosure: Advanced features hidden by default
- Visual clarity: Clear hierarchy and feedback
- Engaging design: Pokemon-inspired pixel art aesthetic
- User-friendly: Intuitive for non-technical users
- Power-user friendly: Full access to advanced features

**Design Elements**:
- Custom pixel art icons (16x16, 32x32)
- Pokemon-style color palette
- Character sprites for empty states
- Animated loading indicators
- Card-based layouts
- Smooth animations (200-300ms transitions)

---

## 📝 Implementation Notes

### Dependencies Between Phases
1. **Phase 0 → Phase 1**: Backend must be GUI-ready before GUI can use it
2. **Phase 1 → Phase 2**: Core GUI must work before enhancements
3. **Phase 1 → Phase 3**: Core GUI needed for batch processing
4. **Phase 1-3 → Phase 8**: Phase 3 metrics needed to evaluate if async I/O is needed
5. **Phase 0-3 → Phase 5**: Code restructuring benefits from having existing codebase
6. **Phase 1-2 → Phase 6**: UI restructuring builds on existing GUI foundation
7. **Phase 5 → Phase 6** (Recommended): Code restructuring makes UI restructuring easier
8. **Phase 1-3 → Phase 7**: Features should be complete before packaging and polish

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

### Phase 1 Success (MVP)
- [ ] GUI launches and runs
- [ ] Core features work
- [ ] Basic user testing passed

### Phase 8 Success (Async I/O)
- Async I/O implemented and working
- Performance improvement measurable (30%+)
- Backward compatibility maintained

### Phase 7 Success (Polish)
- [ ] Executables build and work
- [ ] Polish features complete
- [ ] User testing passed
- [ ] Documentation complete

---

*This master plan should be updated as implementation progresses.*

