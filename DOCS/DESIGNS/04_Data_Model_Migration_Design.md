# Data Model Migration Design

**Status**: 📝 Design Phase  
**Date**: 2024  
**Related**: Step 5.9 - Refactor Data Models

---

## Executive Summary

This document outlines the strategy for migrating the codebase from legacy data models to the new validated models created in Step 5.9. The migration will be done incrementally with compatibility layers to ensure no breaking changes.

---

## Current State Analysis

### Models to Migrate

#### 1. TrackResult
- **Old**: `cuepoint.ui.gui_interface.TrackResult`
- **New**: `cuepoint.models.result.TrackResult`
- **Used in**: 5 files (results_view, output_writer, results_controller, export_controller, export_service)

#### 2. BeatportCandidate
- **Old**: `cuepoint.data.beatport.BeatportCandidate`
- **New**: `cuepoint.models.beatport_candidate.BeatportCandidate`
- **Used in**: 2 files (matcher_service, core/matcher)

#### 3. RBTrack → Track
- **Old**: `cuepoint.data.rekordbox.RBTrack`
- **New**: `cuepoint.models.track.Track`
- **Used in**: 3 files (interfaces, processor, processor_service)

#### 4. Playlist
- **New**: `cuepoint.models.playlist.Playlist`
- **Status**: Not currently used (new feature)

---

## Compatibility Analysis

### 1. TrackResult Compatibility

#### Field Comparison

| Field | Old Model | New Model | Compatibility |
|-------|-----------|-----------|---------------|
| `playlist_index` | `int` | `int` | ✅ Identical |
| `title` | `str` | `str` | ✅ Identical |
| `artist` | `str` | `str` | ✅ Identical |
| `matched` | `bool` | `bool` | ✅ Identical |
| Beatport fields | All `Optional[str]` | All `Optional[str]` | ✅ Identical |
| Scoring fields | `Optional[float]` | `Optional[float]` | ✅ Identical |
| `candidates` | `List[Dict[str, Any]]` | `List[BeatportCandidate]` | ⚠️ Different type |
| `queries` | `List[Dict[str, Any]]` | `List[Dict[str, Any]]` | ✅ Identical |
| `best_match` | ❌ Not present | `Optional[BeatportCandidate]` | ➕ New field |
| `candidates_data` | ❌ Not present | `List[Dict[str, Any]]` | ➕ New field |
| `processing_time` | ❌ Not present | `Optional[float]` | ➕ New field |
| `error` | ❌ Not present | `Optional[str]` | ➕ New field |

#### `to_dict()` Compatibility
- ✅ **Identical output format** - Both produce same dictionary structure
- ✅ **Backward compatible** - CSV export will work unchanged

#### Migration Strategy
1. **Direct replacement** - Fields are compatible
2. **Handle `candidates` conversion** - Convert `List[Dict]` ↔ `List[BeatportCandidate]`
3. **New fields are optional** - Can be `None` initially

### 2. BeatportCandidate Compatibility

#### Field Comparison

| Field | Old Model | New Model | Compatibility |
|-------|-----------|-----------|---------------|
| `url` | `str` | `str` | ✅ Identical |
| `title` | `str` | `str` | ✅ Identical |
| `artists` | `str` | `str` | ✅ Identical |
| `key` | `Optional[str]` | `Optional[str]` | ✅ Identical |
| `release_year` | `Optional[int]` | `Optional[int]` | ✅ Identical |
| `bpm` | `Optional[str]` | `Optional[str]` | ✅ Identical |
| `label` | `Optional[str]` | `Optional[str]` | ✅ Identical |
| `genres` | `Optional[str]` | `Optional[str]` | ✅ Identical |
| `release_name` | `Optional[str]` | `Optional[str]` | ✅ Identical |
| `release_date` | `Optional[str]` | `Optional[str]` | ✅ Identical |
| `score` | `float` | `float` | ✅ Identical |
| `title_sim` | `int` | `int` | ✅ Identical |
| `artist_sim` | `int` | `int` | ✅ Identical |
| All other fields | Same | Same | ✅ Identical |
| Validation | ❌ None | ✅ `__post_init__()` | ⚠️ May reject invalid data |

#### Migration Strategy
1. **Direct replacement** - All fields match
2. **Validation concerns** - New model validates:
   - URL cannot be empty
   - Score cannot be negative
   - Similarity scores must be 0-100
3. **Action**: Review all creation sites to ensure they pass validation

### 3. RBTrack → Track Compatibility

#### Field Comparison

| Field | Old Model (RBTrack) | New Model (Track) | Compatibility |
|-------|---------------------|-------------------|---------------|
| `track_id` | `str` | `Optional[str]` (as `track_id`) | ✅ Compatible |
| `title` | `str` | `str` | ✅ Identical |
| `artists` | `str` | `artist: str` | ⚠️ Field name change |
| Additional fields | ❌ None | Many optional fields | ➕ New fields |

#### Migration Strategy
1. **Create conversion helper** - `Track.from_rbtrack(rbtrack: RBTrack) -> Track`
2. **Handle field name change** - `artists` → `artist`
3. **Validation** - Track requires non-empty title and artist
4. **Gradual migration** - Can keep RBTrack for parsing, convert to Track for processing

---

## Migration Plan

### Phase 1: Preparation (No Code Changes)

#### 1.1 Create Compatibility Helpers
**File**: `SRC/cuepoint/models/compat.py`

```python
"""Compatibility helpers for migrating from old to new models."""

from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.track import Track
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.result import TrackResult
from cuepoint.ui.gui_interface import TrackResult as OldTrackResult
from cuepoint.data.beatport import BeatportCandidate as OldBeatportCandidate

def track_from_rbtrack(rbtrack: RBTrack) -> Track:
    """Convert RBTrack to Track model."""
    return Track(
        title=rbtrack.title,
        artist=rbtrack.artists,  # Note: artists -> artist
        track_id=rbtrack.track_id,
    )

def beatport_candidate_from_old(old: OldBeatportCandidate) -> BeatportCandidate:
    """Convert old BeatportCandidate to new model."""
    return BeatportCandidate(
        url=old.url,
        title=old.title,
        artists=old.artists,
        key=old.key,
        release_year=old.release_year,
        bpm=old.bpm,
        label=old.label,
        genres=old.genres,
        release_name=old.release_name,
        release_date=old.release_date,
        score=old.score,
        title_sim=old.title_sim,
        artist_sim=old.artist_sim,
        query_index=old.query_index,
        query_text=old.query_text,
        candidate_index=old.candidate_index,
        base_score=old.base_score,
        bonus_year=old.bonus_year,
        bonus_key=old.bonus_key,
        guard_ok=old.guard_ok,
        reject_reason=old.reject_reason,
        elapsed_ms=old.elapsed_ms,
        is_winner=old.is_winner,
    )

def track_result_from_old(old: OldTrackResult) -> TrackResult:
    """Convert old TrackResult to new model."""
    # Convert candidates from Dict to BeatportCandidate
    candidates = []
    if old.candidates:
        for cand_dict in old.candidates:
            # Try to convert if it's a dict, otherwise skip
            if isinstance(cand_dict, dict):
                try:
                    candidates.append(BeatportCandidate.from_dict(cand_dict))
                except (ValueError, KeyError):
                    # Skip invalid candidates
                    pass
    
    return TrackResult(
        playlist_index=old.playlist_index,
        title=old.title,
        artist=old.artist,
        matched=old.matched,
        beatport_url=old.beatport_url,
        beatport_title=old.beatport_title,
        beatport_artists=old.beatport_artists,
        beatport_key=old.beatport_key,
        beatport_key_camelot=old.beatport_key_camelot,
        beatport_year=old.beatport_year,
        beatport_bpm=old.beatport_bpm,
        beatport_label=old.beatport_label,
        beatport_genres=old.beatport_genres,
        beatport_release=old.beatport_release,
        beatport_release_date=old.beatport_release_date,
        beatport_track_id=old.beatport_track_id,
        match_score=old.match_score,
        title_sim=old.title_sim,
        artist_sim=old.artist_sim,
        confidence=old.confidence,
        search_query_index=old.search_query_index,
        search_stop_query_index=old.search_stop_query_index,
        candidate_index=old.candidate_index,
        candidates_data=old.candidates,  # Keep original dict format
        queries_data=old.queries,
    )
```

#### 1.2 Update New TrackResult Model
**Action**: Ensure `to_dict()` matches old format exactly (already done ✅)

#### 1.3 Create Tests for Compatibility Helpers
**File**: `SRC/tests/unit/models/test_compat.py`

---

### Phase 2: BeatportCandidate Migration (Lowest Risk)

#### 2.1 Update `core/matcher.py`
**File**: `SRC/cuepoint/core/matcher.py`

**Changes**:
1. Change import:
   ```python
   # OLD
   from cuepoint.data.beatport import BeatportCandidate
   
   # NEW
   from cuepoint.models.beatport_candidate import BeatportCandidate
   ```

2. Verify creation at line 809 passes validation:
   - URL is not empty ✅
   - Score is not negative ✅
   - Similarity scores are 0-100 ✅

**Risk**: Low - Fields match, validation should pass

#### 2.2 Update `services/matcher_service.py`
**File**: `SRC/cuepoint/services/matcher_service.py`

**Changes**:
1. Change import (same as above)

**Risk**: Low

**Testing**: Run matcher tests to ensure no validation errors

---

### Phase 3: TrackResult Migration (Medium Risk)

#### 3.1 Update Controllers (Low Impact)
**Files**:
- `SRC/cuepoint/ui/controllers/results_controller.py`
- `SRC/cuepoint/ui/controllers/export_controller.py`

**Changes**:
1. Change import:
   ```python
   # OLD
   from cuepoint.ui.gui_interface import TrackResult
   
   # NEW
   from cuepoint.models.result import TrackResult
   ```

2. These files only use `TrackResult` as a type hint - no logic changes needed

**Risk**: Low - Type hints only

#### 3.2 Update Export Service (Medium Impact)
**File**: `SRC/cuepoint/services/export_service.py`

**Changes**:
1. Change import
2. Verify `to_dict()` usage still works (should be identical)

**Risk**: Medium - Used in export logic

**Testing**: Test CSV/JSON/Excel export

#### 3.3 Update Output Writer (Medium Impact)
**File**: `SRC/cuepoint/services/output_writer.py`

**Changes**:
1. Change import
2. Verify `to_dict()` usage still works

**Risk**: Medium - Core export functionality

**Testing**: Test all export formats

#### 3.4 Update Results View (High Impact)
**File**: `SRC/cuepoint/ui/widgets/results_view.py`

**Changes**:
1. Change import
2. Handle `candidates` field change:
   - Old: `result.candidates` is `List[Dict[str, Any]]`
   - New: `result.candidates` is `List[BeatportCandidate]`
   - Use `result.candidates_data` for dict format if needed
   - Or convert: `[c.to_dict() for c in result.candidates]`

**Risk**: High - UI component, many usages

**Testing**: 
- Test results display
- Test filtering
- Test candidate viewing
- Test export

---

### Phase 4: RBTrack → Track Migration (Highest Risk)

#### 4.1 Keep RBTrack for Parsing
**Strategy**: Keep `RBTrack` in `rekordbox.py` for XML parsing, convert to `Track` after parsing

#### 4.2 Update Interfaces
**File**: `SRC/cuepoint/services/interfaces.py`

**Changes**:
1. Change type hint:
   ```python
   # OLD
   from cuepoint.data.rekordbox import RBTrack
   
   # NEW
   from cuepoint.models.track import Track
   ```

2. Update method signatures to use `Track` instead of `RBTrack`

**Risk**: High - Changes interface contract

#### 4.3 Update Processor Service
**File**: `SRC/cuepoint/services/processor_service.py`

**Changes**:
1. Import `Track` and conversion helper
2. Convert `RBTrack` to `Track` after parsing:
   ```python
   from cuepoint.models.compat import track_from_rbtrack
   
   # After parsing
   tracks = {track_id: track_from_rbtrack(rbtrack) 
             for track_id, rbtrack in rb_tracks.items()}
   ```

**Risk**: High - Core processing logic

**Testing**: Test full processing pipeline

#### 4.4 Update Legacy Processor (Optional)
**File**: `SRC/cuepoint/services/processor.py`

**Strategy**: Can be updated later or kept as legacy code

---

## Testing Strategy

### Unit Tests
1. **Compatibility helpers** - Test all conversion functions
2. **Model validation** - Ensure all creation sites pass validation
3. **to_dict() compatibility** - Verify output matches old format

### Integration Tests
1. **Matcher service** - Test with new BeatportCandidate
2. **Export service** - Test all export formats
3. **Results view** - Test UI with new TrackResult
4. **Processor service** - Test full processing pipeline

### Regression Tests
1. **CSV export** - Verify format unchanged
2. **JSON export** - Verify format unchanged
3. **Excel export** - Verify format unchanged
4. **UI display** - Verify all fields display correctly

---

## Risk Assessment

### Low Risk
- ✅ BeatportCandidate migration (fields match, validation should pass)
- ✅ TrackResult in controllers (type hints only)

### Medium Risk
- ⚠️ TrackResult in export services (uses `to_dict()`)
- ⚠️ TrackResult in results view (handles `candidates` field)

### High Risk
- 🔴 RBTrack → Track migration (changes core data flow)
- 🔴 Interface changes (affects all implementations)

---

## Rollback Strategy

### If Issues Arise
1. **Keep old models** - Don't delete old model files
2. **Revert imports** - Change imports back to old models
3. **Compatibility layer** - Can use both models side-by-side temporarily

### Gradual Migration
- Migrate one module at a time
- Test after each migration
- Keep old code commented for reference

---

## Success Criteria

- [ ] All imports updated to use new models
- [ ] All tests passing
- [ ] No breaking changes to export formats
- [ ] UI displays correctly
- [ ] Processing pipeline works end-to-end
- [ ] No validation errors in production scenarios
- [ ] Performance not degraded

---

## Implementation Order

1. ✅ **Phase 1**: Create compatibility helpers and tests
2. ✅ **Phase 2**: Migrate BeatportCandidate (lowest risk)
3. ✅ **Phase 3**: Migrate TrackResult (medium risk)
4. ✅ **Phase 4**: Migrate RBTrack → Track (highest risk, optional)

---

## Notes

- **Backward Compatibility**: New models' `to_dict()` methods match old format
- **Validation**: New models have stricter validation - may need to fix data at creation sites
- **Gradual Migration**: Can migrate incrementally, keeping old models temporarily
- **Testing**: Critical to test after each phase

---

## Next Steps

1. Review and approve this design
2. Create compatibility helpers (Phase 1)
3. Begin Phase 2 migration (BeatportCandidate)
4. Test thoroughly
5. Proceed to Phase 3 if Phase 2 successful
6. Evaluate Phase 4 based on Phase 3 results

