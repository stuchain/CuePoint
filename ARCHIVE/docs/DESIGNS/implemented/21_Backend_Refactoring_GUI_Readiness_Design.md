# Design: Backend Refactoring for GUI Readiness

**Number**: 21  
**Status**: 📝 Planned  
**Priority**: 🔥 P0 - Critical Path (Before GUI)  
**Effort**: 1-2 weeks  
**Impact:** Very High - Foundation for GUI application

---

## 1. Overview

### 1.1 Problem Statement

The current backend (`processor.py`) is tightly coupled to CLI output (print statements, tqdm). It lacks:
- Progress callback interface for GUI integration
- Cancellation support
- Structured error handling for GUI
- Return of structured data instead of just writing files
- Thread-safe progress reporting

### 1.2 Solution Overview

Refactor backend to be GUI-ready:
1. **Progress Callback Interface**: Allow GUI to receive real-time updates
2. **Cancellation Support**: Allow GUI to cancel long-running operations
3. **Structured Returns**: Return data structures instead of only writing files
4. **Error Handling**: Structured errors that GUI can display
5. **Separation of Concerns**: Separate business logic from I/O

### 1.3 Design Principles

- **Backend First**: Build solid backend foundation before GUI
- **GUI in Mind**: Design interfaces with GUI needs in mind
- **Backward Compatible**: Keep CLI working during transition
- **Testable**: Easy to test backend independently
- **Flexible**: Support both CLI and GUI use cases

---

## 2. Current Architecture Analysis

### 2.1 Current Issues

**File**: `SRC/processor.py`

**Problems:**
1. `run()` function writes directly to files - no way to get results programmatically
2. Progress reporting via `tqdm` (CLI-specific)
3. No cancellation mechanism
4. Error handling via `print_error()` (CLI-specific)
5. Settings accessed globally via `SETTINGS` dict
6. No structured return values

**Current Function Signature:**
```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    # Writes files directly
    # Uses tqdm for progress
    # No return value
```

---

## 3. Proposed Architecture

### 3.1 New Interface Design

```python
from typing import Callable, Optional, Dict, List, Any
from dataclasses import dataclass
from enum import Enum

class ProcessingStatus(Enum):
    """Status of processing operation"""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"

@dataclass
class ProgressInfo:
    """Progress information for GUI updates"""
    current_track: int
    total_tracks: int
    matched: int
    unmatched: int
    current_track_name: str
    current_track_artist: str
    percentage: float
    estimated_time_remaining: Optional[float] = None
    
@dataclass
class TrackResult:
    """Result for a single track"""
    playlist_index: int
    title: str
    artist: str
    matched: bool
    beatport_url: Optional[str] = None
    match_score: Optional[float] = None
    confidence: Optional[str] = None
    candidates: List[Dict[str, Any]] = None
    queries: List[Dict[str, Any]] = None
    
@dataclass
class ProcessingResult:
    """Complete processing result"""
    status: ProcessingStatus
    tracks: List[TrackResult]
    summary: Dict[str, Any]
    output_files: Dict[str, str]
    error: Optional[str] = None

class ProcessingController:
    """Controller for processing operations with cancellation support"""
    def __init__(self):
        self._cancelled = False
        
    def cancel(self):
        """Request cancellation of processing"""
        self._cancelled = True
        
    def is_cancelled(self) -> bool:
        """Check if cancellation was requested"""
        return self._cancelled
```

### 3.2 Refactored Function Signatures

```python
def process_playlist(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable[[ProgressInfo], None]] = None,
    controller: Optional[ProcessingController] = None,
    auto_research: bool = False
) -> ProcessingResult:
    """
    Process playlist with GUI-friendly interface.
    
    Args:
        xml_path: Path to Rekordbox XML file
        playlist_name: Name of playlist to process
        settings: Processing settings (overrides defaults)
        progress_callback: Called periodically with progress updates
        controller: Controller for cancellation support
        auto_research: Whether to auto-research unmatched tracks
        
    Returns:
        ProcessingResult with all tracks and metadata
    """
    pass

def process_track_with_callback(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable[[ProgressInfo], None]] = None,
    controller: Optional[ProcessingController] = None
) -> TrackResult:
    """
    Process single track with progress callback support.
    
    Args:
        idx: Track index in playlist
        rb: Rekordbox track object
        settings: Processing settings
        progress_callback: Called with progress updates
        controller: Controller for cancellation
        
    Returns:
        TrackResult with match information
    """
    pass
```

---

## 4. Implementation Details

### 4.1 Progress Callback Interface

**Location**: `SRC/gui_interface.py` (new file)

```python
from typing import Callable, Optional
from dataclasses import dataclass
from enum import Enum

@dataclass
class ProgressInfo:
    """Progress information for GUI updates"""
    current_track: int
    total_tracks: int
    matched: int
    unmatched: int
    current_track_name: str = ""
    current_track_artist: str = ""
    percentage: float = 0.0
    estimated_time_remaining: Optional[float] = None
    
    def __post_init__(self):
        """Calculate percentage"""
        if self.total_tracks > 0:
            self.percentage = (self.current_track / self.total_tracks) * 100.0

# Type alias for progress callback
ProgressCallback = Callable[[ProgressInfo], None]
```

### 4.2 Cancellation Support

**Location**: `SRC/gui_interface.py`

```python
import threading
from typing import Optional

class ProcessingController:
    """Thread-safe controller for processing operations"""
    
    def __init__(self):
        self._cancelled = False
        self._lock = threading.Lock()
        
    def cancel(self):
        """Request cancellation of processing"""
        with self._lock:
            self._cancelled = True
            
    def is_cancelled(self) -> bool:
        """Check if cancellation was requested"""
        with self._lock:
            return self._cancelled
            
    def reset(self):
        """Reset cancellation state (for new operation)"""
        with self._lock:
            self._cancelled = False
```

### 4.3 Refactored Processor Module

**Location**: `SRC/processor.py` (refactored)

```python
from typing import Dict, List, Optional, Callable, Any
from gui_interface import ProgressInfo, ProgressCallback, ProcessingController
from dataclasses import dataclass

@dataclass
class TrackResult:
    """Result for a single track"""
    playlist_index: int
    title: str
    artist: str
    matched: bool
    beatport_url: Optional[str] = None
    match_score: Optional[float] = None
    confidence: Optional[str] = None
    candidates: List[Dict[str, Any]] = None
    queries: List[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for CSV export"""
        return {
            "playlist_index": self.playlist_index,
            "title": self.title,
            "artist": self.artist,
            "beatport_url": self.beatport_url or "",
            "match_score": self.match_score or "",
            # ... other fields
        }

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
    
    Returns list of TrackResult objects instead of writing files directly.
    """
    # Apply settings
    if settings:
        # Temporarily override SETTINGS
        original_settings = SETTINGS.copy()
        SETTINGS.update(settings)
    
    try:
        # Parse XML
        collection = parse_rekordbox_xml(xml_path)
        tracks = collection.get_playlist_tracks(playlist_name)
        
        total_tracks = len(tracks)
        results = []
        matched_count = 0
        unmatched_count = 0
        
        # Process tracks
        for idx, track in enumerate(tracks):
            # Check for cancellation
            if controller and controller.is_cancelled():
                break
            
            # Process track
            result = process_track_with_callback(
                idx + 1,
                track,
                settings=settings,
                progress_callback=progress_callback,
                controller=controller
            )
            
            results.append(result)
            
            # Update statistics
            if result.matched:
                matched_count += 1
            else:
                unmatched_count += 1
            
            # Call progress callback
            if progress_callback:
                progress_info = ProgressInfo(
                    current_track=idx + 1,
                    total_tracks=total_tracks,
                    matched=matched_count,
                    unmatched=unmatched_count,
                    current_track_name=track.title,
                    current_track_artist=track.artist,
                    percentage=((idx + 1) / total_tracks) * 100.0
                )
                progress_callback(progress_info)
        
        # Auto-research unmatched tracks if requested
        if auto_research and not (controller and controller.is_cancelled()):
            unmatched_results = [r for r in results if not r.matched]
            if unmatched_results:
                # Re-search with enhanced settings
                # ...
                pass
        
        return results
        
    finally:
        # Restore original settings
        if settings:
            SETTINGS.clear()
            SETTINGS.update(original_settings)

def process_track_with_callback(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None
) -> TrackResult:
    """
    Process single track with progress callback support.
    
    Returns TrackResult instead of tuple of dicts.
    """
    # Check for cancellation
    if controller and controller.is_cancelled():
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artist,
            matched=False
        )
    
    # Generate queries
    queries = make_search_queries(rb.title, rb.artist)
    
    # Find best match (existing logic)
    match_result = best_beatport_match(rb, queries)
    
    # Build TrackResult
    result = TrackResult(
        playlist_index=idx,
        title=rb.title,
        artist=rb.artist,
        matched=match_result is not None,
        beatport_url=match_result.url if match_result else None,
        match_score=match_result.score if match_result else None,
        confidence=_confidence_label(match_result.score) if match_result else None,
        candidates=[],  # Populate from match_result
        queries=[]  # Populate from queries
    )
    
    return result
```

### 4.4 CLI Compatibility Layer

**Location**: `SRC/processor.py` (keep existing function)

```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    """
    Legacy CLI function - wraps new process_playlist() for backward compatibility.
    """
    # Create progress callback for CLI (uses tqdm)
    def cli_progress_callback(progress_info: ProgressInfo):
        # Update tqdm progress bar
        if hasattr(run, '_pbar'):
            run._pbar.update(1)
            run._pbar.set_postfix({
                'matched': progress_info.matched,
                'unmatched': progress_info.unmatched,
                'current': f"Track {progress_info.current_track}"
            })
    
    # Process playlist
    results = process_playlist(
        xml_path=xml_path,
        playlist_name=playlist_name,
        progress_callback=cli_progress_callback,
        auto_research=auto_research
    )
    
    # Write CSV files (existing logic)
    write_csv_files(results, out_csv_base)
    
    # Generate summary report
    generate_summary_report(...)
```

### 4.5 File Writing Module

**Location**: `SRC/output_writer.py` (new file)

```python
from typing import List, Dict, Any
from gui_interface import TrackResult

def write_csv_files(results: List[TrackResult], base_filename: str) -> Dict[str, str]:
    """
    Write CSV files from TrackResult objects.
    
    Returns dictionary mapping file type to file path.
    """
    output_files = {}
    
    # Write main results CSV
    main_csv_path = write_main_csv(results, base_filename)
    output_files['main'] = main_csv_path
    
    # Write candidates CSV
    candidates_csv_path = write_candidates_csv(results, base_filename)
    output_files['candidates'] = candidates_csv_path
    
    # Write queries CSV
    queries_csv_path = write_queries_csv(results, base_filename)
    output_files['queries'] = queries_csv_path
    
    return output_files

def write_main_csv(results: List[TrackResult], base_filename: str) -> str:
    """Write main results CSV file"""
    # Implementation
    pass

def write_candidates_csv(results: List[TrackResult], base_filename: str) -> str:
    """Write candidates CSV file"""
    # Implementation
    pass

def write_queries_csv(results: List[TrackResult], base_filename: str) -> str:
    """Write queries CSV file"""
    # Implementation
    pass
```

---

## 5. Error Handling

### 5.1 Structured Error Classes

**Location**: `SRC/gui_interface.py`

```python
from enum import Enum
from dataclasses import dataclass
from typing import Optional, List

class ErrorType(Enum):
    """Types of errors"""
    FILE_NOT_FOUND = "file_not_found"
    PLAYLIST_NOT_FOUND = "playlist_not_found"
    XML_PARSE_ERROR = "xml_parse_error"
    NETWORK_ERROR = "network_error"
    PROCESSING_ERROR = "processing_error"

@dataclass
class ProcessingError:
    """Structured error for GUI display"""
    error_type: ErrorType
    message: str
    details: Optional[str] = None
    suggestions: List[str] = None
    recoverable: bool = False
    
    def __post_init__(self):
        if self.suggestions is None:
            self.suggestions = []
```

### 5.2 Error Handling in Processor

```python
from gui_interface import ProcessingError, ErrorType

def process_playlist(...) -> List[TrackResult]:
    """Process playlist with error handling"""
    try:
        # Parse XML
        collection = parse_rekordbox_xml(xml_path)
        
    except FileNotFoundError:
        error = ProcessingError(
            error_type=ErrorType.FILE_NOT_FOUND,
            message=f"XML file not found: {xml_path}",
            suggestions=[
                "Check the file path",
                "Ensure the file exists",
                "Try browsing for the file"
            ],
            recoverable=True
        )
        raise ProcessingError from error
        
    except Exception as e:
        error = ProcessingError(
            error_type=ErrorType.PROCESSING_ERROR,
            message=f"Error processing playlist: {str(e)}",
            details=str(e),
            recoverable=False
        )
        raise ProcessingError from error
```

---

## 6. Settings Management

### 6.1 Settings Object

**Location**: `SRC/settings.py` (refactored)

```python
from dataclasses import dataclass
from typing import Optional, Dict, Any

@dataclass
class ProcessingSettings:
    """Settings for processing operation"""
    # Performance settings
    track_workers: int = 1
    candidate_workers: int = 15
    time_budget_sec: int = 45
    max_candidates: int = 50
    
    # Matching settings
    min_accept_score: float = 70.0
    early_exit_score: float = 90.0
    
    # Other settings
    verbose: bool = False
    trace: bool = False
    seed: int = 0
    enable_cache: bool = True
    
    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> 'ProcessingSettings':
        """Create from dictionary"""
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'track_workers': self.track_workers,
            'candidate_workers': self.candidate_workers,
            # ... other fields
        }
    
    def apply_preset(self, preset_name: str):
        """Apply named preset"""
        presets = {
            'fast': ProcessingSettings(
                track_workers=1,
                candidate_workers=10,
                time_budget_sec=30,
                max_candidates=25
            ),
            'turbo': ProcessingSettings(
                track_workers=1,
                candidate_workers=8,
                time_budget_sec=20,
                max_candidates=15
            ),
            'exhaustive': ProcessingSettings(
                track_workers=2,
                candidate_workers=20,
                time_budget_sec=120,
                max_candidates=200
            ),
        }
        if preset_name in presets:
            preset = presets[preset_name]
            for field in self.__dataclass_fields__:
                setattr(self, field, getattr(preset, field))
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

```python
# SRC/tests/test_processor_gui.py
import pytest
from SRC.processor import process_playlist, TrackResult
from SRC.gui_interface import ProgressInfo, ProcessingController

def test_process_playlist_returns_results():
    """Test that process_playlist returns TrackResult objects"""
    results = process_playlist(
        xml_path="test_collection.xml",
        playlist_name="Test Playlist"
    )
    
    assert isinstance(results, list)
    assert all(isinstance(r, TrackResult) for r in results)

def test_progress_callback_called():
    """Test that progress callback is called"""
    progress_updates = []
    
    def callback(progress_info: ProgressInfo):
        progress_updates.append(progress_info)
    
    process_playlist(
        xml_path="test_collection.xml",
        playlist_name="Test Playlist",
        progress_callback=callback
    )
    
    assert len(progress_updates) > 0
    assert all(isinstance(u, ProgressInfo) for u in progress_updates)

def test_cancellation():
    """Test that cancellation works"""
    controller = ProcessingController()
    
    # Start processing
    # Cancel after first track
    # Verify processing stops
    
    pass
```

### 7.2 Integration Tests

```python
def test_end_to_end_processing():
    """Test complete processing pipeline"""
    results = process_playlist(...)
    
    # Verify results structure
    assert len(results) > 0
    
    # Verify file writing
    files = write_csv_files(results, "test_output")
    assert 'main' in files
    assert 'candidates' in files
```

---

## 8. Migration Strategy

### 8.1 Backward Compatibility

1. **Keep existing `run()` function**: CLI continues to work
2. **Gradual migration**: New code uses new interfaces
3. **Deprecation warnings**: Warn about old functions (future)

### 8.2 Step-by-Step Migration

1. **Step 1**: Add `gui_interface.py` with new interfaces
2. **Step 2**: Refactor `process_track()` to return `TrackResult`
3. **Step 3**: Add `process_playlist()` with callback support
4. **Step 4**: Update `run()` to use new `process_playlist()`
5. **Step 5**: Add cancellation support
6. **Step 6**: Extract file writing to separate module
7. **Step 7**: Test thoroughly
8. **Step 8**: Build GUI on top of new interfaces

---

## 9. Benefits

### 9.1 GUI Readiness

- **Progress Updates**: GUI receives real-time progress
- **Cancellation**: Users can cancel long operations
- **Structured Data**: GUI can display results immediately
- **Error Handling**: GUI can show user-friendly errors

### 9.2 Code Quality

- **Separation of Concerns**: Business logic separate from I/O
- **Testability**: Easy to test without file I/O
- **Reusability**: Same backend for CLI and GUI
- **Maintainability**: Clear interfaces and responsibilities

### 9.3 Flexibility

- **Multiple UIs**: CLI, GUI, web interface can all use same backend
- **Easy Testing**: Test backend independently
- **Future Proof**: Easy to add new features

---

## 10. Dependencies

No new dependencies required. Uses existing Python standard library and typing.

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

