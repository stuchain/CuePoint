# Step 5.5: Add Type Hints & Documentation

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 3-4 days  
**Dependencies**: Step 5.1 (Project Structure)

---

## Goal

Add comprehensive type hints throughout the codebase and write detailed docstrings for all public APIs. This improves code readability, enables static type checking, and provides better IDE support.

---

## Success Criteria

- [ ] Type hints added to all function signatures
- [ ] Type hints added to class attributes
- [ ] Docstrings written for all public functions
- [ ] Docstrings written for all classes
- [ ] Module-level documentation added
- [ ] Type checking with mypy passes
- [ ] Examples in docstrings where helpful
- [ ] Exceptions documented in docstrings

---

## Type Hints Standards

### Basic Type Hints

```python
from typing import List, Dict, Optional, Union, Any, Tuple

def process_track(track: Track) -> TrackResult:
    """Process a track and return result."""
    pass

def search_tracks(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Search for tracks."""
    pass

def get_config(key: str, default: Optional[str] = None) -> Optional[str]:
    """Get configuration value."""
    pass
```

### Advanced Type Hints

```python
from typing import TypeVar, Generic, Callable, Protocol
from pathlib import Path

T = TypeVar('T')

def process_items(items: List[T], processor: Callable[[T], T]) -> List[T]:
    """Process items with a processor function."""
    pass

def export_data(
    data: Dict[str, Any],
    filepath: Union[str, Path],
    format: str = "json"
) -> None:
    """Export data to file."""
    pass
```

---

## Documentation Standards

### Google-Style Docstrings

```python
def process_track(
    track: Track,
    options: Optional[ProcessingOptions] = None
) -> TrackResult:
    """Process a single track and return enriched result.
    
    This function takes a track object, searches for matching data on
    Beatport, and returns a TrackResult containing the best match and
    candidate matches.
    
    Args:
        track: The track object to process. Must have at least title
            and artist attributes.
        options: Optional processing options. If None, default options
            are used.
    
    Returns:
        A TrackResult object containing:
            - The original track
            - The best matching Beatport track
            - A list of candidate matches
            - Confidence score
    
    Raises:
        ValueError: If track is missing required attributes.
        ProcessingError: If processing fails due to API errors.
    
    Example:
        >>> track = Track(title="Test", artist="Artist")
        >>> result = process_track(track)
        >>> print(result.best_match["title"])
        Test
    """
    pass
```

### Class Documentation

```python
class ProcessorService:
    """Service for processing tracks and playlists.
    
    This service coordinates track processing by delegating to
    specialized services for searching, matching, and caching.
    
    Attributes:
        beatport_service: Service for Beatport API access.
        matcher_service: Service for matching tracks.
        logging_service: Service for logging operations.
    
    Example:
        >>> service = ProcessorService(
        ...     beatport_service=beatport,
        ...     matcher_service=matcher,
        ...     logging_service=logger
        ... )
        >>> result = service.process_track(track)
    """
    
    def __init__(
        self,
        beatport_service: IBeatportService,
        matcher_service: IMatcherService,
        logging_service: ILoggingService
    ) -> None:
        """Initialize processor service.
        
        Args:
            beatport_service: Service for Beatport API access.
            matcher_service: Service for matching tracks.
            logging_service: Service for logging operations.
        """
        self.beatport_service = beatport_service
        self.matcher_service = matcher_service
        self.logging_service = logging_service
```

### Module Documentation

```python
"""Core matching algorithms for track matching.

This module provides functions and classes for matching tracks
from playlists with data from Beatport. It includes scoring
algorithms, text normalization, and candidate selection.

Example:
    >>> from cuepoint.core.matcher import best_beatport_match
    >>> match = best_beatport_match(track, candidates)
    >>> print(match["title"])
"""

__all__ = [
    "best_beatport_match",
    "calculate_score",
    "normalize_text"
]
```

---

## Implementation Plan

### Phase 1: Core Modules (1 day)

**Files to Update:**
- `src/cuepoint/core/matcher.py`
- `src/cuepoint/core/parser.py`
- `src/cuepoint/core/query_generator.py`
- `src/cuepoint/core/text_processing.py`

**Tasks:**
1. Add type hints to all functions
2. Add type hints to class attributes
3. Write docstrings for all public functions
4. Write docstrings for all classes
5. Add module-level docstrings

### Phase 2: Services (1 day)

**Files to Update:**
- `src/cuepoint/services/processor_service.py`
- `src/cuepoint/services/beatport_service.py`
- `src/cuepoint/services/cache_service.py`
- `src/cuepoint/services/export_service.py`

**Tasks:**
1. Add type hints to service interfaces
2. Add type hints to service implementations
3. Document service interfaces
4. Document service methods

### Phase 3: Data Layer (0.5 days)

**Files to Update:**
- `src/cuepoint/data/beatport.py`
- `src/cuepoint/data/cache.py`
- `src/cuepoint/data/storage.py`

**Tasks:**
1. Add type hints to data access functions
2. Document data access APIs

### Phase 4: UI Components (1 day)

**Files to Update:**
- `src/cuepoint/ui/main_window.py`
- `src/cuepoint/ui/widgets/results_view.py`
- `src/cuepoint/ui/controllers/main_controller.py`

**Tasks:**
1. Add type hints to UI methods
2. Document UI components
3. Document controller interfaces

### Phase 8: Models and Utils (0.5 days)

**Files to Update:**
- `src/cuepoint/models/*.py`
- `src/cuepoint/utils/*.py`

**Tasks:**
1. Add type hints to model classes
2. Add type hints to utility functions
3. Document models and utilities

---

## Detailed Examples

### Function with Complex Types

```python
from typing import List, Dict, Optional, Callable, Tuple
from cuepoint.models.track import Track
from cuepoint.models.result import TrackResult

def process_playlist(
    tracks: List[Track],
    progress_callback: Optional[Callable[[int, int], None]] = None,
    error_callback: Optional[Callable[[Exception], None]] = None
) -> Tuple[List[TrackResult], List[Exception]]:
    """Process a playlist of tracks.
    
    Processes each track in the playlist and collects results and errors.
    Optionally calls progress and error callbacks during processing.
    
    Args:
        tracks: List of Track objects to process.
        progress_callback: Optional callback function called with
            (current, total) progress. Signature: (int, int) -> None
        error_callback: Optional callback function called when an error
            occurs. Signature: (Exception) -> None
    
    Returns:
        A tuple containing:
            - List of TrackResult objects (successful processing)
            - List of Exception objects (processing errors)
    
    Example:
        >>> def on_progress(current, total):
        ...     print(f"Progress: {current}/{total}")
        >>> tracks = [Track(...), Track(...)]
        >>> results, errors = process_playlist(tracks, on_progress)
        >>> print(f"Processed {len(results)} tracks")
    """
    results: List[TrackResult] = []
    errors: List[Exception] = []
    
    for i, track in enumerate(tracks):
        try:
            result = process_track(track)
            results.append(result)
            if progress_callback:
                progress_callback(i + 1, len(tracks))
        except Exception as e:
            errors.append(e)
            if error_callback:
                error_callback(e)
    
    return results, errors
```

### Class with Generic Types

```python
from typing import TypeVar, Generic, List, Optional
from abc import ABC, abstractmethod

T = TypeVar('T')

class Cache(Generic[T]):
    """Generic cache implementation.
    
    A cache that can store values of any type T with optional
    time-to-live (TTL) expiration.
    
    Type Parameters:
        T: The type of values stored in the cache.
    
    Example:
        >>> cache = Cache[str]()
        >>> cache.set("key", "value", ttl=3600)
        >>> value = cache.get("key")
        >>> print(value)
        value
    """
    
    def __init__(self) -> None:
        """Initialize empty cache."""
        self._data: Dict[str, Tuple[T, Optional[float]]] = {}
    
    def get(self, key: str) -> Optional[T]:
        """Get value from cache.
        
        Args:
            key: Cache key.
        
        Returns:
            Cached value if found and not expired, None otherwise.
        """
        if key not in self._data:
            return None
        
        value, expiry = self._data[key]
        if expiry and time.time() > expiry:
            del self._data[key]
            return None
        
        return value
    
    def set(self, key: str, value: T, ttl: Optional[int] = None) -> None:
        """Set value in cache.
        
        Args:
            key: Cache key.
            value: Value to cache.
            ttl: Optional time-to-live in seconds.
        """
        expiry = None
        if ttl:
            expiry = time.time() + ttl
        self._data[key] = (value, expiry)
```

### Protocol for Duck Typing

```python
from typing import Protocol

class Processable(Protocol):
    """Protocol for objects that can be processed.
    
    Any object with title and artist attributes can be processed.
    """
    title: str
    artist: str

def process_item(item: Processable) -> TrackResult:
    """Process any item that conforms to Processable protocol.
    
    Args:
        item: Object with title and artist attributes.
    
    Returns:
        Processing result.
    """
    # Can access item.title and item.artist
    pass
```

---

## Type Checking Setup

### Mypy Configuration

**mypy.ini:**
```ini
[mypy]
python_version = 3.7
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = True
disallow_incomplete_defs = True
check_untyped_defs = True
no_implicit_optional = True
warn_redundant_casts = True
warn_unused_ignores = True
warn_no_return = True
strict_optional = True

[mypy-PySide6.*]
ignore_missing_imports = True

[mypy-tests.*]
ignore_errors = True
```

### Running Type Checks

```bash
# Check all files
mypy src/cuepoint

# Check specific file
mypy src/cuepoint/core/matcher.py

# Generate HTML report
mypy src/cuepoint --html-report reports/mypy
```

---

## Documentation Generation

### Sphinx Configuration

**docs/conf.py:**
```python
extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.napoleon',  # For Google-style docstrings
    'sphinx.ext.viewcode',
    'sphinx.ext.typehints',
]

autodoc_typehints = 'description'
```

### Generating Documentation

```bash
# Generate HTML documentation
sphinx-build -b html docs/ docs/_build/html

# Generate PDF documentation
sphinx-build -b latex docs/ docs/_build/latex
```

---

## Implementation Checklist

- [ ] Install mypy and sphinx
- [ ] Configure mypy (`mypy.ini`)
- [ ] Configure sphinx (if using)
- [ ] Add type hints to core modules
- [ ] Add type hints to services
- [ ] Add type hints to data layer
- [ ] Add type hints to UI components
- [ ] Add type hints to models
- [ ] Add type hints to utils
- [ ] Write docstrings for core modules
- [ ] Write docstrings for services
- [ ] Write docstrings for data layer
- [ ] Write docstrings for UI components
- [ ] Write docstrings for models
- [ ] Write docstrings for utils
- [ ] Add module-level docstrings
- [ ] Run mypy and fix type errors
- [ ] Generate API documentation
- [ ] Review documentation quality

---

## Common Issues and Solutions

### Issue 1: Circular Type Imports
**Solution**: Use `TYPE_CHECKING` guard and string annotations:
```python
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from cuepoint.models.track import Track

def process(track: "Track") -> TrackResult:
    pass
```

### Issue 2: Third-Party Library Types
**Solution**: Use `Any` or create type stubs:
```python
from typing import Any
from PySide6.QtWidgets import QWidget

def create_widget(parent: Any) -> QWidget:
    pass
```

### Issue 3: Dynamic Attributes
**Solution**: Use `TypedDict` or `Protocol`:
```python
from typing import TypedDict

class TrackData(TypedDict):
    title: str
    artist: str
    bpm: float
```

---

## Documentation Best Practices

1. **Be Concise**: Don't repeat what the code says
2. **Be Complete**: Document all parameters and return values
3. **Use Examples**: Show how to use the function/class
4. **Document Exceptions**: List all exceptions that can be raised
5. **Keep Updated**: Update docs when code changes
6. **Use Type Hints**: Let type hints complement docstrings

---

## Next Steps

After completing this step:
1. Verify mypy passes without errors
2. Review documentation quality
3. Generate API documentation
4. Proceed to Step 5.6: Standardize Error Handling & Logging

