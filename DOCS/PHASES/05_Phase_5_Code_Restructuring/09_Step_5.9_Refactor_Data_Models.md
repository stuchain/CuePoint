# Step 5.9: Refactor Data Models

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 2-3 days  
**Dependencies**: Step 5.1 (Project Structure)

---

## Goal

Create clear, well-defined data models with validation, serialization, and proper documentation. Models should represent the core data structures used throughout the application.

---

## Success Criteria

- [ ] All data structures identified
- [ ] Model classes created (using dataclasses or Pydantic)
- [ ] Validation added to models
- [ ] Serialization/deserialization implemented
- [ ] Model relationships documented
- [ ] Models used throughout codebase
- [ ] Model tests written
- [ ] Models documented

---

## Model Architecture

### 5.9.1: Core Models

1. **Track**: Represents a track from playlist
2. **TrackResult**: Represents processing result
3. **BeatportCandidate**: Represents a Beatport match candidate
4. **Playlist**: Represents a playlist
5. **Configuration**: Application configuration (see Step 5.8)

---

## Model Implementations

### 5.9.2: Track Model

```python
# src/cuepoint/models/track.py

"""Track data model."""

from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime

@dataclass
class Track:
    """Represents a track from a playlist.
    
    Attributes:
        title: Track title.
        artist: Track artist.
        album: Album name (optional).
        duration: Track duration in seconds (optional).
        bpm: Track BPM (optional).
        key: Musical key (optional).
        year: Release year (optional).
        genre: Genre (optional).
        label: Record label (optional).
        position: Position in playlist (optional).
        file_path: Path to audio file (optional).
    """
    
    title: str
    artist: str
    album: Optional[str] = None
    duration: Optional[float] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    label: Optional[str] = None
    position: Optional[int] = None
    file_path: Optional[str] = None
    
    def __post_init__(self):
        """Validate track data after initialization."""
        if not self.title or not self.title.strip():
            raise ValueError("Track title cannot be empty")
        if not self.artist or not self.artist.strip():
            raise ValueError("Track artist cannot be empty")
        if self.duration is not None and self.duration < 0:
            raise ValueError("Track duration cannot be negative")
        if self.bpm is not None and (self.bpm < 0 or self.bpm > 300):
            raise ValueError("Track BPM must be between 0 and 300")
        if self.year is not None and (self.year < 1900 or self.year > datetime.now().year + 1):
            raise ValueError(f"Track year must be between 1900 and {datetime.now().year + 1}")
    
    def to_dict(self) -> dict:
        """Convert track to dictionary."""
        return {
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "duration": self.duration,
            "bpm": self.bpm,
            "key": self.key,
            "year": self.year,
            "genre": self.genre,
            "label": self.label,
            "position": self.position,
            "file_path": self.file_path
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Track":
        """Create track from dictionary."""
        return cls(
            title=data.get("title", ""),
            artist=data.get("artist", ""),
            album=data.get("album"),
            duration=data.get("duration"),
            bpm=data.get("bpm"),
            key=data.get("key"),
            year=data.get("year"),
            genre=data.get("genre"),
            label=data.get("label"),
            position=data.get("position"),
            file_path=data.get("file_path")
        )
    
    def __str__(self) -> str:
        """String representation."""
        return f"{self.artist} - {self.title}"
```

### 5.9.3: BeatportCandidate Model

```python
# src/cuepoint/models/beatport_candidate.py

"""Beatport candidate data model."""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from datetime import datetime

@dataclass
class BeatportCandidate:
    """Represents a candidate match from Beatport.
    
    Attributes:
        url: Beatport track URL.
        title: Track title.
        artist: Track artist(s).
        remixers: Remixers (optional).
        label: Record label.
        release_date: Release date.
        bpm: Track BPM.
        key: Musical key.
        genre: Genre.
        subgenre: Subgenre (optional).
        artwork_url: URL to artwork (optional).
        preview_url: URL to preview (optional).
        score: Match score (0.0 to 1.0).
        raw_data: Raw data from API (optional).
    """
    
    url: str
    title: str
    artist: str
    label: str
    release_date: str
    bpm: float
    key: str
    genre: str
    remixers: Optional[str] = None
    subgenre: Optional[str] = None
    artwork_url: Optional[str] = None
    preview_url: Optional[str] = None
    score: float = 0.0
    raw_data: Optional[Dict[str, Any]] = field(default=None, repr=False)
    
    def __post_init__(self):
        """Validate candidate data."""
        if not self.url:
            raise ValueError("Beatport candidate URL cannot be empty")
        if not 0.0 <= self.score <= 1.0:
            raise ValueError("Score must be between 0.0 and 1.0")
        if self.bpm < 0 or self.bpm > 300:
            raise ValueError("BPM must be between 0 and 300")
    
    def to_dict(self) -> dict:
        """Convert candidate to dictionary."""
        return {
            "url": self.url,
            "title": self.title,
            "artist": self.artist,
            "remixers": self.remixers,
            "label": self.label,
            "release_date": self.release_date,
            "bpm": self.bpm,
            "key": self.key,
            "genre": self.genre,
            "subgenre": self.subgenre,
            "artwork_url": self.artwork_url,
            "preview_url": self.preview_url,
            "score": self.score
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "BeatportCandidate":
        """Create candidate from dictionary."""
        return cls(
            url=data.get("url", ""),
            title=data.get("title", ""),
            artist=data.get("artist", ""),
            remixers=data.get("remixers"),
            label=data.get("label", ""),
            release_date=data.get("release_date", ""),
            bpm=float(data.get("bpm", 0)),
            key=data.get("key", ""),
            genre=data.get("genre", ""),
            subgenre=data.get("subgenre"),
            artwork_url=data.get("artwork_url"),
            preview_url=data.get("preview_url"),
            score=float(data.get("score", 0.0)),
            raw_data=data
        )
    
    def get_year(self) -> Optional[int]:
        """Extract year from release date."""
        try:
            if "-" in self.release_date:
                return int(self.release_date.split("-")[0])
            return int(self.release_date[:4])
        except (ValueError, AttributeError):
            return None
```

### 5.9.4: TrackResult Model

```python
# src/cuepoint/models/result.py

"""Track result data model."""

from dataclasses import dataclass, field
from typing import Optional, List
from cuepoint.models.track import Track
from cuepoint.models.beatport_candidate import BeatportCandidate

@dataclass
class TrackResult:
    """Represents the result of processing a track.
    
    Attributes:
        track: The original track that was processed.
        best_match: The best matching Beatport candidate (optional).
        candidates: List of all candidate matches.
        confidence: Confidence score for the best match (0.0 to 1.0).
        processing_time: Time taken to process in seconds (optional).
        error: Error message if processing failed (optional).
    """
    
    track: Track
    best_match: Optional[BeatportCandidate] = None
    candidates: List[BeatportCandidate] = field(default_factory=list)
    confidence: float = 0.0
    processing_time: Optional[float] = None
    error: Optional[str] = None
    
    def __post_init__(self):
        """Validate result data."""
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("Confidence must be between 0.0 and 1.0")
        if self.best_match and self.best_match not in self.candidates:
            # Add best match to candidates if not already present
            self.candidates.insert(0, self.best_match)
    
    def to_dict(self) -> dict:
        """Convert result to dictionary."""
        return {
            "track": self.track.to_dict(),
            "best_match": self.best_match.to_dict() if self.best_match else None,
            "candidates": [c.to_dict() for c in self.candidates],
            "confidence": self.confidence,
            "processing_time": self.processing_time,
            "error": self.error
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "TrackResult":
        """Create result from dictionary."""
        from cuepoint.models.track import Track
        from cuepoint.models.beatport_candidate import BeatportCandidate
        
        track = Track.from_dict(data["track"])
        best_match = None
        if data.get("best_match"):
            best_match = BeatportCandidate.from_dict(data["best_match"])
        
        candidates = [
            BeatportCandidate.from_dict(c) for c in data.get("candidates", [])
        ]
        
        return cls(
            track=track,
            best_match=best_match,
            candidates=candidates,
            confidence=float(data.get("confidence", 0.0)),
            processing_time=data.get("processing_time"),
            error=data.get("error")
        )
    
    def is_successful(self) -> bool:
        """Check if processing was successful."""
        return self.error is None and self.best_match is not None
    
    def has_high_confidence(self, threshold: float = 0.7) -> bool:
        """Check if result has high confidence."""
        return self.confidence >= threshold
```

### 5.9.5: Playlist Model

```python
# src/cuepoint/models/playlist.py

"""Playlist data model."""

from dataclasses import dataclass, field
from typing import List, Optional
from pathlib import Path
from cuepoint.models.track import Track

@dataclass
class Playlist:
    """Represents a playlist.
    
    Attributes:
        name: Playlist name.
        tracks: List of tracks in playlist.
        file_path: Path to playlist file (optional).
        created_date: Creation date (optional).
        modified_date: Last modification date (optional).
    """
    
    name: str
    tracks: List[Track] = field(default_factory=list)
    file_path: Optional[Path] = None
    created_date: Optional[str] = None
    modified_date: Optional[str] = None
    
    def __post_init__(self):
        """Validate playlist data."""
        if not self.name or not self.name.strip():
            raise ValueError("Playlist name cannot be empty")
    
    def add_track(self, track: Track) -> None:
        """Add a track to the playlist."""
        if track.position is None:
            track.position = len(self.tracks) + 1
        self.tracks.append(track)
    
    def remove_track(self, track: Track) -> None:
        """Remove a track from the playlist."""
        if track in self.tracks:
            self.tracks.remove(track)
            # Update positions
            for i, t in enumerate(self.tracks, start=1):
                t.position = i
    
    def get_track_count(self) -> int:
        """Get number of tracks in playlist."""
        return len(self.tracks)
    
    def to_dict(self) -> dict:
        """Convert playlist to dictionary."""
        return {
            "name": self.name,
            "tracks": [t.to_dict() for t in self.tracks],
            "file_path": str(self.file_path) if self.file_path else None,
            "created_date": self.created_date,
            "modified_date": self.modified_date
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Playlist":
        """Create playlist from dictionary."""
        tracks = [Track.from_dict(t) for t in data.get("tracks", [])]
        file_path = None
        if data.get("file_path"):
            file_path = Path(data["file_path"])
        
        return cls(
            name=data.get("name", ""),
            tracks=tracks,
            file_path=file_path,
            created_date=data.get("created_date"),
            modified_date=data.get("modified_date")
        )
```

---

## Model Validation

### 5.9.6: Using Pydantic (Alternative Approach)

If you prefer more advanced validation, consider using Pydantic:

```python
# src/cuepoint/models/track_pydantic.py

from pydantic import BaseModel, validator, Field
from typing import Optional

class Track(BaseModel):
    """Track model with Pydantic validation."""
    
    title: str = Field(..., min_length=1)
    artist: str = Field(..., min_length=1)
    album: Optional[str] = None
    duration: Optional[float] = Field(None, ge=0)
    bpm: Optional[float] = Field(None, ge=0, le=300)
    year: Optional[int] = Field(None, ge=1900, le=2100)
    
    @validator('title', 'artist')
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Cannot be empty')
        return v.strip()
    
    class Config:
        """Pydantic configuration."""
        validate_assignment = True
        use_enum_values = True
```

---

## Model Serialization

### 5.9.7: JSON Serialization

```python
# src/cuepoint/models/serialization.py

"""Model serialization utilities."""

import json
from typing import Any
from pathlib import Path
from cuepoint.models.result import TrackResult

def serialize_result(result: TrackResult) -> str:
    """Serialize result to JSON string."""
    return json.dumps(result.to_dict(), indent=2)

def deserialize_result(json_str: str) -> TrackResult:
    """Deserialize result from JSON string."""
    data = json.loads(json_str)
    return TrackResult.from_dict(data)

def save_results_to_json(results: List[TrackResult], filepath: Path) -> None:
    """Save results to JSON file."""
    data = [r.to_dict() for r in results]
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
```

---

## Model Relationships

### 5.9.8: Model Relationship Diagram

```
Playlist
  └── contains List[Track]

Track
  └── processed to ──> TrackResult

TrackResult
  ├── references Track (original)
  ├── references BeatportCandidate (best_match)
  └── contains List[BeatportCandidate] (candidates)

BeatportCandidate
  └── standalone (from Beatport API)
```

---

## Implementation Checklist

### Model Creation (5.9.1-5.9.8)
- [x] Identify all data structures
- [x] Create Track model
- [x] Create BeatportCandidate model
- [x] Create TrackResult model
- [x] Create Playlist model
- [x] Add validation to all models
- [x] Add serialization/deserialization
- [x] Write model tests
- [x] Document model relationships

### Migration (5.9.9-5.9.13)
- [ ] Phase 1: Create compatibility helpers
- [ ] Phase 2: Migrate BeatportCandidate
- [ ] Phase 3: Migrate TrackResult
- [ ] Phase 4: Migrate RBTrack → Track (optional)
- [ ] Update code to use models
- [ ] Update imports throughout codebase
- [ ] Test all migrations

---

## Testing Models

```python
# src/tests/unit/models/test_track.py

"""Tests for Track model."""

import pytest
from cuepoint.models.track import Track

def test_track_creation():
    """Test creating a valid track."""
    track = Track(title="Test", artist="Artist")
    assert track.title == "Test"
    assert track.artist == "Artist"

def test_track_validation_empty_title():
    """Test validation rejects empty title."""
    with pytest.raises(ValueError, match="title cannot be empty"):
        Track(title="", artist="Artist")

def test_track_serialization():
    """Test track serialization."""
    track = Track(title="Test", artist="Artist", bpm=128.0)
    data = track.to_dict()
    assert data["title"] == "Test"
    assert data["bpm"] == 128.0
    
    # Test deserialization
    track2 = Track.from_dict(data)
    assert track2.title == track.title
    assert track2.bpm == track.bpm
```

---

## Migration Strategy

### 5.9.9: Migration Overview

After creating the new data models, migrate the existing codebase to use them. This is done in phases to minimize risk.

**Migration Phases:**
1. **Phase 1**: Create compatibility helpers (preparation)
2. **Phase 2**: Migrate BeatportCandidate (lowest risk)
3. **Phase 3**: Migrate TrackResult (medium risk)
4. **Phase 4**: Migrate RBTrack → Track (highest risk, optional)

### 5.9.10: Phase 1 - Compatibility Helpers

Create compatibility/conversion functions to bridge old and new models.

**Tasks:**
- [ ] Create `SRC/cuepoint/models/compat.py` with conversion helpers:
  - `track_from_rbtrack(rbtrack: RBTrack) -> Track`
  - `beatport_candidate_from_old(old: OldBeatportCandidate) -> BeatportCandidate`
  - `track_result_from_old(old: OldTrackResult) -> TrackResult`
- [ ] Create tests for compatibility helpers (`tests/unit/models/test_compat.py`)
- [ ] Verify `to_dict()` methods match old format exactly

**Success Criteria:**
- All conversion functions implemented and tested
- Conversion functions handle edge cases
- Tests pass with 100% coverage

### 5.9.11: Phase 2 - BeatportCandidate Migration

Migrate BeatportCandidate usage from `cuepoint.data.beatport` to `cuepoint.models.beatport_candidate`.

**Files to Update:**
- `SRC/cuepoint/core/matcher.py` - Change import, verify validation passes
- `SRC/cuepoint/services/matcher_service.py` - Change import

**Tasks:**
- [ ] Update imports in `core/matcher.py`
- [ ] Update imports in `services/matcher_service.py`
- [ ] Verify all BeatportCandidate creation sites pass validation:
  - URL is not empty
  - Score is not negative
  - Similarity scores are 0-100
- [ ] Run matcher tests to ensure no validation errors
- [ ] Test matching functionality end-to-end

**Success Criteria:**
- All imports updated
- All tests passing
- No validation errors
- Matching functionality works correctly

**Risk Level:** Low - Fields match, validation should pass

### 5.9.12: Phase 3 - TrackResult Migration

Migrate TrackResult usage from `cuepoint.ui.gui_interface` to `cuepoint.models.result`.

**Files to Update:**
- `SRC/cuepoint/ui/controllers/results_controller.py`
- `SRC/cuepoint/ui/controllers/export_controller.py`
- `SRC/cuepoint/services/export_service.py`
- `SRC/cuepoint/services/output_writer.py`
- `SRC/cuepoint/ui/widgets/results_view.py`

**Tasks:**
- [ ] Update imports in controllers (low impact - type hints only)
- [ ] Update imports in export services
- [ ] Verify `to_dict()` usage still works (should be identical)
- [ ] Update `results_view.py` to handle `candidates` field change:
  - Old: `List[Dict[str, Any]]`
  - New: `List[BeatportCandidate]`
  - Use `candidates_data` for dict format or convert
- [ ] Test CSV/JSON/Excel export formats
- [ ] Test results display in UI
- [ ] Test filtering and candidate viewing

**Success Criteria:**
- All imports updated
- Export formats unchanged (backward compatible)
- UI displays correctly
- All tests passing

**Risk Level:** Medium - UI component, many usages, `candidates` field type change

### 5.9.13: Phase 4 - RBTrack → Track Migration (Optional)

Migrate from `RBTrack` to `Track` model. This is the highest risk migration.

**Strategy:**
- Keep `RBTrack` in `rekordbox.py` for XML parsing
- Convert to `Track` after parsing using compatibility helper

**Files to Update:**
- `SRC/cuepoint/services/interfaces.py` - Update type hints
- `SRC/cuepoint/services/processor_service.py` - Convert after parsing
- `SRC/cuepoint/services/processor.py` - Optional (legacy code)

**Tasks:**
- [ ] Update interface type hints to use `Track`
- [ ] Update processor service to convert `RBTrack` to `Track` after parsing
- [ ] Use `track_from_rbtrack()` helper for conversion
- [ ] Test full processing pipeline
- [ ] Verify all track operations work with new model

**Success Criteria:**
- Processing pipeline works end-to-end
- All track operations functional
- No breaking changes

**Risk Level:** High - Changes core data flow, affects all processing

**Note:** This phase can be deferred if Phases 2-3 are successful and there's no immediate need.

---

## Migration Testing Strategy

### Unit Tests
- [ ] Compatibility helpers tested
- [ ] Model validation tested
- [ ] `to_dict()` compatibility verified

### Integration Tests
- [ ] Matcher service with new BeatportCandidate
- [ ] Export service with new TrackResult
- [ ] Results view with new TrackResult
- [ ] Processor service with new Track (if Phase 4 done)

### Regression Tests
- [ ] CSV export format unchanged
- [ ] JSON export format unchanged
- [ ] Excel export format unchanged
- [ ] UI displays all fields correctly

---

## Next Steps

After completing this step:
1. Verify all models work correctly
2. Test model validation
3. Test model serialization
4. **Complete migration phases (5.9.10-5.9.13)**
5. Proceed to Step 5.10: Performance & Optimization Review

