# Design: Progress Bar During Processing

**Number**: 1  
**Status**: ✅ Implemented  
**Priority**: 🔥 P0 - Quick Win  
**Effort**: 1 day  
**Impact**: Very High

---

## 1. Overview

### 1.1 Problem Statement

During long processing runs, users had no visibility into:
- Overall progress (how many tracks completed)
- Current track being processed
- Estimated time remaining
- Real-time statistics (matched/unmatched counts)
- Query execution progress

This led to uncertainty about whether the process was working or stuck.

### 1.2 Solution Overview

Implement a comprehensive progress tracking system with:
1. **Overall progress bar**: Visual indication of track processing completion
2. **Real-time statistics**: Matched/unmatched/processing counts
3. **Current track display**: Show which track is currently being processed
4. **Query progress**: Nested progress for queries within each track
5. **Time estimates**: Estimated time remaining based on current rate

---

## 2. Architecture Design

### 2.1 Progress Display Levels

```
Level 1: Overall Track Processing
  └─ Level 2: Query Execution (per track)
      └─ Level 3: Candidate Evaluation (optional, detailed mode)
```

### 2.2 Library Selection

**Primary Choice**: `tqdm`
- Lightweight, widely used
- Automatic terminal handling
- Thread-safe for parallel processing
- Rich formatting options
- Minimal dependencies

**Alternative**: `rich`
- More advanced formatting
- Better for complex nested displays
- Heavier dependency

**Decision**: Use `tqdm` for simplicity and compatibility.

---

## 3. Implementation Design

### 3.1 Overall Progress Bar

**Location**: `processor.py` → `run()`

**Implementation**:
```python
from tqdm import tqdm

# Create progress bar for all tracks
track_progress = tqdm(
    total=len(inputs),
    desc="Processing tracks",
    unit="track",
    ncols=100,
    bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]"
)

# Update during processing
for idx, rb_track in inputs:
    # Process track...
    track_progress.update(1)
    track_progress.set_postfix({
        'matched': matched_count,
        'unmatched': unmatched_count
    })
```

**Display Format**:
```
Processing tracks: 12/25 [00:45<01:23] matched=10, unmatched=2
```

### 3.2 Current Track Display

**Location**: `processor.py` → `process_track()`

**Display**:
```python
current_track_info = f"Track {idx}/{total}: {rb_track.title} - {rb_track.artists}"

# Update progress bar description
track_progress.set_description(current_track_info)
```

**Example Output**:
```
Track 12/25: Dance With Me - Shadu: 12/25 [00:45<01:23]
```

### 3.3 Nested Query Progress

**Location**: `matcher.py` → `best_beatport_match()`

**For verbose mode**:
```python
if SETTINGS["VERBOSE"]:
    query_progress = tqdm(
        total=len(queries),
        desc="  Queries",
        unit="query",
        leave=False,  # Don't leave progress bar after completion
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt}"
    )
    
    for query in queries:
        # Execute query...
        query_progress.update(1)
```

**Display Format**:
```
Track 12/25: Dance With Me - Shadu: 12/25 [00:45<01:23]
  Queries: 8/40 [████████░░░░░░░░░░░░] 8/40
```

### 3.4 Statistics Tracking

**Real-time Statistics**:
```python
class ProgressStats:
    def __init__(self):
        self.matched = 0
        self.unmatched = 0
        self.review_needed = 0
        self.total_queries = 0
        self.total_candidates = 0
        
    def update_track_result(self, has_match: bool, needs_review: bool):
        if has_match:
            self.matched += 1
        else:
            self.unmatched += 1
        if needs_review:
            self.review_needed += 1
    
    def get_stats_string(self) -> str:
        return f"matched={self.matched}, unmatched={self.unmatched}, review={self.review_needed}"
```

**Integration**:
```python
progress_stats = ProgressStats()

for idx, rb_track in inputs:
    result = process_track(idx, rb_track)
    progress_stats.update_track_result(
        has_match=result.has_match,
        needs_review=result.needs_review
    )
    
    track_progress.set_postfix_str(progress_stats.get_stats_string())
```

---

## 4. Detailed Progress Information

### 4.1 Track-Level Details

**Display per track** (verbose mode):
```
Track 12/25: Dance With Me - Shadu
  ├─ Queries: 8/40 executed (20.0%)
  ├─ Candidates found: 13
  ├─ Best match: 141.0 (High confidence)
  ├─ Time: 2.7s / 45s budget
  └─ Status: ✓ Matched
```

### 4.2 Query-Level Details

**Query execution progress**:
```python
query_details = {
    'executed': query_count,
    'total': total_queries,
    'candidates_found': candidate_count,
    'best_score': best_score,
    'elapsed': elapsed_time,
    'remaining_budget': remaining_time
}
```

---

## 5. Configuration Options

### 5.1 Settings in `config.py`

```python
SETTINGS = {
    "SHOW_PROGRESS_BAR": True,          # Enable/disable progress bar
    "PROGRESS_BAR_DETAILED": False,     # Show nested query progress
    "PROGRESS_UPDATE_INTERVAL": 0.1,    # Update frequency (seconds)
    "PROGRESS_SHOW_STATS": True,        # Show real-time statistics
}
```

### 5.2 Command-Line Options

```bash
# Disable progress bar (for scripts/logs)
python main.py --xml collection.xml --playlist "My Playlist" --no-progress

# Enable detailed progress (nested bars)
python main.py --xml collection.xml --playlist "My Playlist" --progress-detailed
```

---

## 6. Parallel Processing Considerations

### 6.1 Thread-Safe Progress Updates

**Challenge**: Multiple threads updating progress simultaneously

**Solution**: Use `tqdm`'s thread-safe mode or lock:
```python
from threading import Lock

progress_lock = Lock()

def update_progress():
    with progress_lock:
        track_progress.update(1)
        track_progress.set_postfix(...)
```

### 6.2 Per-Worker Progress

**Option**: Separate progress bars for each worker (complex, not recommended)

**Better**: Single shared progress bar with aggregated statistics

---

## 7. Performance Impact

### 7.1 Overhead Considerations

- **Update frequency**: Update every track completion (not every query)
- **Display rendering**: Minimal overhead for simple progress bars
- **Memory**: Negligible (progress bar objects are lightweight)

### 7.2 Optimization

```python
# Only update if enough time has passed (reduces terminal I/O)
if time.time() - last_update > UPDATE_INTERVAL:
    track_progress.refresh()
    last_update = time.time()
```

---

## 8. Display Modes

### 8.1 Normal Mode (Default)

```
Processing tracks: 12/25 [00:45<01:23] matched=10, unmatched=2
```

### 8.2 Verbose Mode

```
Processing tracks: 12/25 [00:45<01:23] matched=10, unmatched=2
Track 12/25: Dance With Me - Shadu
  Queries: 8/40 [████████░░░░░░░░░░░░] 8/40
  Candidates: 13 found, best: 141.0
```

### 8.3 Minimal Mode

```
[12/25] matched=10, unmatched=2
```

### 8.4 No Progress Mode

```
(For scripts/logging - no visual progress)
```

---

## 9. Integration Points

### 9.1 processor.py

```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    # ... existing code ...
    
    # Create progress bar
    with tqdm(total=len(inputs), desc="Processing tracks", unit="track") as pbar:
        for idx, rb_track in inputs:
            result = process_track(idx, rb_track)
            update_progress_stats(result)
            pbar.update(1)
            pbar.set_postfix(get_current_stats())
```

### 9.2 matcher.py

```python
def best_beatport_match(rb: RBTrack, queries: List[str]) -> Optional[BeatportCandidate]:
    # ... existing code ...
    
    if SETTINGS["PROGRESS_BAR_DETAILED"]:
        with tqdm(total=len(queries), desc="  Queries", leave=False) as query_pbar:
            for query in queries:
                candidates = execute_query(query)
                query_pbar.update(1)
```

---

## 10. Error Handling

### 10.1 Terminal Compatibility

**Fallback for non-TTY**:
```python
# Detect if running in terminal
if not sys.stdout.isatty():
    # Fallback to simple text updates
    print(f"Processing track {idx}/{total}...")
```

### 10.2 Progress Bar Cleanup

**Ensure cleanup on errors**:
```python
try:
    with tqdm(...) as pbar:
        # Processing...
        pass
except KeyboardInterrupt:
    pbar.close()
    print("\nInterrupted by user")
    raise
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

- Test progress bar creation
- Test statistics tracking
- Test update mechanisms

### 11.2 Integration Tests

- Test with real processing
- Test with parallel workers
- Test error handling

### 11.3 Manual Testing

- Small playlist (10 tracks)
- Large playlist (100+ tracks)
- Various terminal types

---

## 12. Example Outputs

### 12.1 Small Playlist

```
Processing tracks: 10/10 [00:32<00:00] matched=9, unmatched=1
100%|████████████████████████████████████| 10/10 [00:32<00:00, 3.12track/s]
```

### 12.2 Large Playlist with Verbose

```
Processing tracks: 45/100 [02:15<02:45] matched=42, unmatched=3
Track 45/100: Never Sleep Again - Solomun
  Queries: 15/40 [██████████░░░░░░░░] 15/40
  Candidates: 28 found, best: 152.0
```

---

## 13. Future Enhancements

### 13.1 Potential Improvements

1. **Rich library integration**: More advanced formatting
2. **Web-based progress**: For web interface
3. **Progress persistence**: Save/restore progress state
4. **Estimated time per track**: Based on historical data
5. **Performance warnings**: Alert if processing slower than expected

---

## 14. Dependencies

### 14.1 Required

- `tqdm>=4.64.0`: Progress bar library

### 14.2 Installation

```bash
pip install tqdm
```

Already in `requirements.txt`.

---

## 15. Benefits

### 15.1 User Experience

- **Reduced anxiety**: Users know progress is being made
- **Better planning**: Can estimate completion time
- **Real-time feedback**: Immediate visibility into results

### 15.2 Development Benefits

- **Easier debugging**: See where processing is slow
- **Performance insights**: Identify bottlenecks
- **User satisfaction**: Professional appearance

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

