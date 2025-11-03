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

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

