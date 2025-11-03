# Design: Summary Statistics Report

**Number**: 2  
**Status**: ✅ Implemented  
**Priority**: 🔥 P0 - Quick Win  
**Effort**: 1-2 days  
**Impact**: High

---

## 1. Overview

### 1.1 Problem Statement

After processing completes, users had no immediate visibility into:
- Overall success rate (matched vs unmatched)
- Match quality distribution
- Performance metrics
- Genre/artist breakdown
- Which files were generated

Users had to manually analyze CSV files to understand results.

### 1.2 Solution Overview

Generate a comprehensive, formatted summary report that:
1. Shows match results at a glance
2. Displays quality metrics
3. Provides performance statistics
4. Shows genre/artist breakdown
5. Lists all output files generated
6. Saves report to file for later reference

---

## 2. Architecture Design

### 2.1 Report Generation Flow

```
Processing Completes
    ↓
Collect Statistics
    ├─ Match results (matched/unmatched/review)
    ├─ Quality metrics (score distribution)
    ├─ Performance stats (queries, candidates, time)
    ├─ Genre breakdown
    └─ Output file information
    ↓
Format Report
    ├─ ASCII box-drawing for visual clarity
    ├─ Section organization
    └─ Unicode-safe formatting
    ↓
Display to Console
    ↓
Save to File (*_summary.txt)
```

### 2.2 Statistics Collection

**Location**: `processor.py` → `run()`

**Data Collection**:
```python
class ProcessingStats:
    def __init__(self):
        # Match results
        self.total_tracks = 0
        self.matched_count = 0
        self.unmatched_count = 0
        self.review_needed_count = 0
        
        # Quality metrics
        self.scores = []  # List of all match scores
        self.high_confidence = 0  # Score >= 90
        self.medium_confidence = 0  # Score 70-89
        self.low_confidence = 0  # Score < 70
        
        # Performance
        self.total_queries = 0
        self.total_candidates = 0
        self.early_exits = 0
        self.processing_time = 0.0
        
        # Genre breakdown
        self.genres = {}  # {genre: count}
        
        # Output files
        self.output_files = []
```

---

## 3. Report Structure

### 3.1 Report Sections

1. **Header**: Title, playlist name, timestamp
2. **Match Results**: Success rates, counts
3. **Match Quality**: Confidence distribution, average scores
4. **Performance**: Queries, candidates, timing, early exits
5. **Genre Breakdown**: Top genres with percentages
6. **Output Files**: List of generated files with row counts

### 3.2 Report Format

```
+==============================================================================+
|                         CuePoint Processing Summary                          |
+==============================================================================+
| Playlist: to split test                                                      |
| Total Tracks: 11                                                               |
| Processing Time: 5m 42s                                                          |
+==============================================================================+
| Match Results:                                                               |
|   [OK] Matched: 11 (100.0%)                                               |
|   [FAIL] Unmatched: 0 (0.0%)                                             |
|   [REVIEW] Review Needed: 0 (0.0%)                                     |
+==============================================================================+
| Match Quality:                                                               |
|   High Confidence (>=90): 10 (90.9%)                                 |
|   Medium Confidence (70-89): 0 (0.0%)                                |
|   Low Confidence (<70): 1 (9.1%)                                      |
|   Average Score: 130.5                                                   |
+==============================================================================+
| Performance:                                                                  |
|   Total Queries: 62                                                    |
|   Avg Queries/Track: 5.6                                               |
|   Total Candidates: 743                                                 |
|   Avg Candidates/Track: 67.5                                          |
|   Early Exits: 2 (18.2% of tracks)                                   |
+==============================================================================+
| Genre Breakdown:                                                            |
|   - Melodic House & Techno: 7 (63.6%)                                       |
|   - Afro House: 5 (45.5%)                                                   |
|   - Organic House: 5 (45.5%)                                                |
|   - Deep House: 2 (18.2%)                                                   |
|   - House: 2 (18.2%)                                                        |
+==============================================================================+
| Output Files:                                                                |
|   - test_output (2025-11-03 18-50-58).csv (11 rows)                         |
|   - test_output (2025-11-03 18-50-58)_candidates.csv (743 rows)             |
|   - test_output (2025-11-03 18-50-58)_queries.csv (62 rows)                 |
|   - test_output (2025-11-03 18-50-58)_review.csv (1 rows)                   |
+==============================================================================+
```

---

## 4. Implementation Details

### 4.1 Statistics Collection

**Location**: `processor.py`

```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    stats = ProcessingStats()
    stats.total_tracks = len(inputs)
    
    for idx, rb_track in inputs:
        main_row, cand_rows, queries_rows = process_track(idx, rb_track)
        
        # Update statistics
        if main_row.get('beatport_title'):
            stats.matched_count += 1
            score = float(main_row.get('match_score', 0))
            stats.scores.append(score)
            
            if score >= 90:
                stats.high_confidence += 1
            elif score >= 70:
                stats.medium_confidence += 1
            else:
                stats.low_confidence += 1
        else:
            stats.unmatched_count += 1
        
        # Collect genre data
        genres_str = main_row.get('beatport_genres', '')
        for genre in genres_str.split(','):
            genre = genre.strip()
            if genre:
                stats.genres[genre] = stats.genres.get(genre, 0) + 1
        
        # Update performance stats
        stats.total_queries += len(queries_rows)
        stats.total_candidates += len(cand_rows)
        
        # Check for early exit
        if queries_rows and queries_rows[-1].get('is_stop') == 'Y':
            stats.early_exits += 1
    
    # Generate and display report
    report = generate_summary_report(stats, playlist_name, processing_time, output_files)
    print(report)
    save_report_to_file(report, out_csv_base)
```

### 4.2 Report Generation

**Function**: `generate_summary_report()`

```python
def generate_summary_report(
    stats: ProcessingStats,
    playlist_name: str,
    processing_time: float,
    output_files: List[Tuple[str, int]]
) -> str:
    """Generate formatted summary report"""
    
    # Calculate percentages
    match_rate = (stats.matched_count / stats.total_tracks * 100) if stats.total_tracks > 0 else 0
    unmatched_rate = (stats.unmatched_count / stats.total_tracks * 100) if stats.total_tracks > 0 else 0
    review_rate = (stats.review_needed_count / stats.total_tracks * 100) if stats.total_tracks > 0 else 0
    
    high_conf_rate = (stats.high_confidence / stats.total_tracks * 100) if stats.total_tracks > 0 else 0
    avg_score = sum(stats.scores) / len(stats.scores) if stats.scores else 0
    
    # Format time
    time_str = format_time(processing_time)
    
    # Get top genres
    top_genres = sorted(stats.genres.items(), key=lambda x: x[1], reverse=True)[:5]
    
    # Build report
    report = []
    report.append(box_top())
    report.append(f"|                         CuePoint Processing Summary                          |")
    report.append(box_middle())
    report.append(f"| Playlist: {playlist_name:<67} |")
    report.append(f"| Total Tracks: {stats.total_tracks:<63} |")
    report.append(f"| Processing Time: {time_str:<60} |")
    report.append(box_middle())
    
    # Match Results section
    report.append("| Match Results:                                                               |")
    report.append(f"|   [OK] Matched: {stats.matched_count} ({match_rate:.1f}%){'':<50} |")
    report.append(f"|   [FAIL] Unmatched: {stats.unmatched_count} ({unmatched_rate:.1f}%){'':<47} |")
    report.append(f"|   [REVIEW] Review Needed: {stats.review_needed_count} ({review_rate:.1f}%){'':<42} |")
    
    # ... continue building report ...
    
    report.append(box_bottom())
    
    return "\n".join(report)
```

### 4.3 Box-Drawing Functions

**Unicode-Safe Formatting**:
```python
def box_top() -> str:
    """Top border with corners"""
    return "+" + "=" * 78 + "+"

def box_middle() -> str:
    """Middle separator"""
    return "+" + "=" * 78 + "+"

def box_bottom() -> str:
    """Bottom border"""
    return "+" + "=" * 78 + "+"
```

**Windows Compatibility**: Use ASCII characters only for maximum compatibility.

---

## 5. Statistics Calculations

### 5.1 Match Quality Distribution

```python
def calculate_confidence_distribution(scores: List[float]) -> Dict[str, int]:
    """Calculate confidence level distribution"""
    high = sum(1 for s in scores if s >= 90)
    medium = sum(1 for s in scores if 70 <= s < 90)
    low = sum(1 for s in scores if s < 70)
    
    return {
        'high': high,
        'medium': medium,
        'low': low
    }
```

### 5.2 Genre Breakdown

```python
def get_top_genres(genres: Dict[str, int], top_n: int = 5) -> List[Tuple[str, int, float]]:
    """Get top N genres with counts and percentages"""
    total = sum(genres.values())
    sorted_genres = sorted(genres.items(), key=lambda x: x[1], reverse=True)
    
    return [
        (genre, count, (count / total * 100) if total > 0 else 0)
        for genre, count in sorted_genres[:top_n]
    ]
```

### 5.3 Performance Metrics

```python
def calculate_performance_metrics(stats: ProcessingStats) -> Dict[str, Any]:
    """Calculate performance statistics"""
    return {
        'avg_queries_per_track': stats.total_queries / stats.total_tracks if stats.total_tracks > 0 else 0,
        'avg_candidates_per_track': stats.total_candidates / stats.total_tracks if stats.total_tracks > 0 else 0,
        'early_exit_rate': (stats.early_exits / stats.total_tracks * 100) if stats.total_tracks > 0 else 0,
        'queries_per_second': stats.total_queries / stats.processing_time if stats.processing_time > 0 else 0,
    }
```

---

## 6. File Output

### 6.1 Report File Naming

**Pattern**: `{output_base}_summary.txt`

**Example**: `test_output (2025-11-03 18-50-58)_summary.txt`

### 6.2 File Saving

```python
def save_report_to_file(report: str, output_base: str) -> str:
    """Save report to file"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H-%M-%S")
    filename = f"{output_base} ({timestamp})_summary.txt"
    filepath = os.path.join("output", filename)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(report)
    
    return filepath
```

---

## 7. Configuration Options

### 7.1 Settings

```python
SETTINGS = {
    "GENERATE_SUMMARY_REPORT": True,      # Enable/disable report generation
    "SUMMARY_SHOW_GENRES": True,           # Include genre breakdown
    "SUMMARY_TOP_GENRES": 5,               # Number of top genres to show
    "SUMMARY_SAVE_TO_FILE": True,         # Save report to file
}
```

---

## 8. Review Track Detection

### 8.1 Review Criteria

**Tracks needing review**:
- Match score < 70 (low confidence)
- Weak artist match (< 35% similarity, no token overlap)
- No match found

```python
def is_review_needed(main_row: Dict[str, str]) -> bool:
    """Determine if track needs manual review"""
    if not main_row.get('beatport_title'):
        return True  # No match
    
    score = float(main_row.get('match_score', 0))
    if score < 70:
        return True  # Low score
    
    artist_sim = float(main_row.get('artist_sim', 0))
    if artist_sim < 35 and not has_token_overlap(main_row):
        return True  # Weak artist match
    
    return False
```

---

## 9. Integration Points

### 9.1 processor.py

```python
def run(...):
    # ... processing ...
    
    # Collect statistics during processing
    stats = ProcessingStats()
    # ... update stats ...
    
    # Generate report
    if SETTINGS.get("GENERATE_SUMMARY_REPORT", True):
        report = generate_summary_report(stats, playlist_name, processing_time, output_files)
        print("\n" + report)
        summary_path = save_report_to_file(report, out_csv_base)
        print(f"\nSummary saved to: {summary_path}")
```

---

## 10. Output File Information

### 10.1 File Details Collection

```python
def get_output_file_info(output_base: str) -> List[Tuple[str, int]]:
    """Get information about generated output files"""
    files = []
    
    # Main results file
    main_file = f"{output_base}.csv"
    if os.path.exists(main_file):
        rows = count_csv_rows(main_file)
        files.append((main_file, rows))
    
    # Candidates file
    cand_file = f"{output_base}_candidates.csv"
    if os.path.exists(cand_file):
        rows = count_csv_rows(cand_file)
        files.append((cand_file, rows))
    
    # ... other files ...
    
    return files
```

---

## 11. Time Formatting

### 11.1 Human-Readable Time

```python
def format_time(seconds: float) -> str:
    """Format time in human-readable format"""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs}s"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes}m"
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

- Test statistics collection
- Test report generation
- Test formatting functions
- Test genre calculation

### 12.2 Integration Tests

- Test with real processing results
- Test file saving
- Test report display

---

## 13. Future Enhancements

### 13.1 Potential Improvements

1. **Markdown Format**: Generate markdown report for GitHub/docs
2. **JSON Format**: Machine-readable statistics
3. **Charts/Graphs**: Visual representation of statistics
4. **Comparison Reports**: Compare multiple runs
5. **Historical Tracking**: Track statistics over time

---

## 14. Benefits

### 14.1 User Experience

- **Immediate feedback**: See results at a glance
- **Quality assessment**: Understand match quality
- **Performance insights**: See what's working well

### 14.2 Development Benefits

- **Metrics tracking**: Monitor improvement over time
- **Debugging**: Identify patterns in failures
- **Documentation**: Reports serve as processing logs

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

