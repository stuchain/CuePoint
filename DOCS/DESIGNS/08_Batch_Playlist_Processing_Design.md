# Design: Batch Playlist Processing

**Number**: 8  
**Status**: 📝 Planned  
**Priority**: ⚡ P1 - Medium Effort  
**Effort**: 3-4 days  
**Impact**: Medium-High

---

## 1. Overview

### 1.1 Problem Statement

Users with multiple playlists must run the tool multiple times, which is:
- Time-consuming
- Repetitive
- Error-prone

### 1.2 Solution Overview

Enable processing multiple playlists in a single run:
1. Accept multiple playlists via CLI
2. Support playlist list file
3. Optional parallel processing
4. Combined or separate output files
5. Aggregate summary report

---

## 2. Architecture Design

### 2.1 Processing Flow

```
Parse CLI Arguments
    ├─ Multiple playlists (--playlists)
    └─ Playlist file (--playlists-file)
    ↓
Load Playlist Names
    ├─ From CLI arguments
    ├─ From file (one per line)
    └─ Validate existence in XML
    ↓
Process Each Playlist
    ├─ Sequential processing (default)
    └─ Parallel processing (optional)
    ↓
Collect Results
    ├─ Individual playlist results
    └─ Aggregate statistics
    ↓
Generate Output
    ├─ Separate files per playlist (default)
    └─ Combined file (optional)
    ↓
Aggregate Summary Report
```

---

## 3. Implementation Details

### 3.1 CLI Arguments

**Location**: `SRC/main.py`

```python
# Multiple playlists via CLI
ap.add_argument(
    "--playlists",
    nargs="+",
    help="Process multiple playlists (space-separated)"
)

# Playlist file
ap.add_argument(
    "--playlists-file",
    type=str,
    help="File containing playlist names (one per line)"
)

# Output mode
ap.add_argument(
    "--batch-output-mode",
    choices=["separate", "combined"],
    default="separate",
    help="Output mode: separate files per playlist or combined file"
)

# Parallel playlist processing
ap.add_argument(
    "--batch-parallel",
    action="store_true",
    help="Process playlists in parallel (faster but uses more resources)"
)
```

### 3.2 Argument Parsing Logic

```python
def parse_playlist_arguments(args) -> List[str]:
    """Parse playlist arguments from CLI"""
    playlist_names = []
    
    # Get playlists from CLI arguments
    if args.playlists:
        playlist_names.extend(args.playlists)
    
    # Get playlists from file
    if args.playlists_file:
        if not os.path.exists(args.playlists_file):
            print_error(error_file_not_found(
                args.playlists_file, "Playlist file",
                "Check the --playlists-file path"
            ))
            return []
        
        with open(args.playlists_file, 'r', encoding='utf-8') as f:
            file_playlists = [line.strip() for line in f if line.strip()]
            playlist_names.extend(file_playlists)
    
    # Validate playlist names exist in XML
    tracks_by_id, playlists = parse_rekordbox(args.xml)
    valid_playlists = []
    invalid_playlists = []
    
    for name in playlist_names:
        if name in playlists:
            valid_playlists.append(name)
        else:
            invalid_playlists.append(name)
            vlog(f"Warning: Playlist '{name}' not found in XML, skipping")
    
    if invalid_playlists:
        print(f"Warning: {len(invalid_playlists)} playlist(s) not found and will be skipped")
    
    return valid_playlists
```

### 3.3 Batch Processing Function

**Location**: `SRC/processor.py`

```python
def run_batch(
    xml_path: str,
    playlist_names: List[str],
    out_csv_base: str,
    output_mode: str = "separate",
    parallel: bool = False,
    auto_research: bool = False
) -> Dict[str, Any]:
    """
    Process multiple playlists in batch
    
    Args:
        xml_path: Path to Rekordbox XML file
        playlist_names: List of playlist names to process
        out_csv_base: Base name for output files
        output_mode: "separate" (one file per playlist) or "combined" (single file)
        parallel: Process playlists in parallel if True
        auto_research: Auto-research unmatched tracks
    
    Returns:
        Dictionary with aggregate statistics
    """
    all_results = []
    aggregate_stats = ProcessingStats()
    
    if parallel and len(playlist_names) > 1:
        # Parallel processing
        results = process_playlists_parallel(
            xml_path, playlist_names, out_csv_base,
            output_mode, auto_research
        )
    else:
        # Sequential processing
        results = process_playlists_sequential(
            xml_path, playlist_names, out_csv_base,
            output_mode, auto_research
        )
    
    # Aggregate statistics
    for result in results:
        all_results.append(result)
        aggregate_stats.merge(result.stats)
    
    # Generate aggregate summary
    if output_mode == "combined":
        # Combine all results into single files
        combine_output_files(all_results, out_csv_base)
    
    # Generate aggregate report
    generate_batch_summary_report(
        playlist_names, all_results, aggregate_stats, out_csv_base
    )
    
    return {
        'results': all_results,
        'stats': aggregate_stats,
        'playlists_processed': len(playlist_names)
    }
```

### 3.4 Sequential Processing

```python
def process_playlists_sequential(
    xml_path: str,
    playlist_names: List[str],
    out_csv_base: str,
    output_mode: str,
    auto_research: bool
) -> List[Dict]:
    """Process playlists one at a time"""
    results = []
    
    for idx, playlist_name in enumerate(playlist_names, start=1):
        print(f"\n{'='*80}")
        print(f"Processing playlist {idx}/{len(playlist_names)}: {playlist_name}")
        print(f"{'='*80}\n")
        
        # Determine output filename
        if output_mode == "separate":
            playlist_safe_name = sanitize_filename(playlist_name)
            playlist_out = f"{out_csv_base}_{playlist_safe_name}"
        else:
            playlist_out = out_csv_base
        
        # Process playlist
        result = run(
            xml_path, playlist_name, playlist_out, auto_research
        )
        results.append(result)
    
    return results
```

### 3.5 Parallel Processing

```python
def process_playlists_parallel(
    xml_path: str,
    playlist_names: List[str],
    out_csv_base: str,
    output_mode: str,
    auto_research: bool
) -> List[Dict]:
    """Process playlists in parallel"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    results = []
    max_workers = min(len(playlist_names), SETTINGS.get("BATCH_PARALLEL_WORKERS", 2))
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        
        for playlist_name in playlist_names:
            if output_mode == "separate":
                playlist_safe_name = sanitize_filename(playlist_name)
                playlist_out = f"{out_csv_base}_{playlist_safe_name}"
            else:
                playlist_out = out_csv_base
            
            future = executor.submit(
                run, xml_path, playlist_name, playlist_out, auto_research
            )
            futures[future] = playlist_name
        
        # Collect results as they complete
        for future in as_completed(futures):
            playlist_name = futures[future]
            try:
                result = future.result()
                results.append(result)
                print(f"✓ Completed: {playlist_name}")
            except Exception as e:
                print_error(f"✗ Failed: {playlist_name} - {str(e)}")
    
    return results
```

---

## 4. Output File Handling

### 4.1 Separate Output Mode

**Default behavior**: One set of files per playlist

```
output/
├── playlist1 (2025-11-03 18-50-58).csv
├── playlist1 (2025-11-03 18-50-58)_candidates.csv
├── playlist1 (2025-11-03 18-50-58)_queries.csv
├── playlist2 (2025-11-03 18-51-10).csv
├── playlist2 (2025-11-03 18-51-10)_candidates.csv
└── playlist2 (2025-11-03 18-51-10)_queries.csv
```

### 4.2 Combined Output Mode

**Optional**: All playlists in single files

```
output/
├── batch_output (2025-11-03 18-50-58).csv          # All tracks from all playlists
├── batch_output (2025-11-03 18-50-58)_candidates.csv
└── batch_output (2025-11-03 18-50-58)_queries.csv
```

**Additional column**: `playlist_name` to distinguish source playlist

### 4.3 Combining Files

```python
def combine_output_files(results: List[Dict], out_csv_base: str) -> None:
    """Combine output files from multiple playlists"""
    all_main_rows = []
    all_candidates = []
    all_queries = []
    
    for result in results:
        # Read each playlist's output files
        main_df = pd.read_csv(result['main_file'])
        main_df['source_playlist'] = result['playlist_name']
        all_main_rows.append(main_df)
        
        # ... combine candidates and queries ...
    
    # Write combined files
    combined_main = pd.concat(all_main_rows, ignore_index=True)
    combined_main.to_csv(
        f"{out_csv_base}_combined.csv", index=False
    )
```

---

## 5. Playlist File Format

### 5.1 File Structure

**Format**: Plain text, one playlist name per line

```
# playlists.txt
My Techno Playlist
My House Playlist
Test Playlist 2024
# Comments start with #
# Empty lines are ignored
Another Playlist
```

### 5.2 File Parsing

```python
def load_playlists_from_file(file_path: str) -> List[str]:
    """Load playlist names from file"""
    playlists = []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            # Skip empty lines and comments
            if line and not line.startswith('#'):
                playlists.append(line)
    
    return playlists
```

---

## 6. Aggregate Summary Report

### 6.1 Report Structure

```
+==============================================================================+
|                      Batch Processing Summary Report                         |
+==============================================================================+
| Playlists Processed: 5                                                        |
| Total Tracks: 127                                                             |
| Total Processing Time: 28m 15s                                                |
+==============================================================================+
| Aggregate Match Results:                                                      |
|   [OK] Matched: 118 (92.9%)                                               |
|   [FAIL] Unmatched: 9 (7.1%)                                             |
|   [REVIEW] Review Needed: 12 (9.4%)                                     |
+==============================================================================+
| Per-Playlist Breakdown:                                                       |
|   1. My Techno Playlist: 25 tracks, 23 matched (92.0%)                     |
|   2. My House Playlist: 50 tracks, 47 matched (94.0%)                       |
|   3. Test Playlist: 11 tracks, 11 matched (100.0%)                           |
|   4. Another Playlist: 30 tracks, 27 matched (90.0%)                         |
|   5. Final Playlist: 11 tracks, 10 matched (90.9%)                          |
+==============================================================================+
| Output Files Generated: 15 files across 5 playlists                            |
+==============================================================================+
```

### 6.2 Report Generation

```python
def generate_batch_summary_report(
    playlist_names: List[str],
    results: List[Dict],
    aggregate_stats: ProcessingStats,
    out_csv_base: str
) -> str:
    """Generate aggregate summary report for batch processing"""
    # ... build comprehensive report ...
    
    report_path = os.path.join(
        "output", f"{out_csv_base}_batch_summary.txt"
    )
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    
    return report_path
```

---

## 7. Error Handling

### 7.1 Individual Playlist Failures

**Strategy**: Continue processing remaining playlists if one fails

```python
for playlist_name in playlist_names:
    try:
        result = run(xml_path, playlist_name, ...)
        results.append(result)
    except Exception as e:
        print_error(f"Failed to process playlist '{playlist_name}': {e}")
        failed_playlists.append(playlist_name)
        continue  # Continue with next playlist
```

### 7.2 Validation

```python
# Validate all playlists exist before starting
tracks_by_id, playlists = parse_rekordbox(xml_path)
missing = [name for name in playlist_names if name not in playlists]

if missing:
    print_error(error_playlist_not_found(
        missing[0], list(playlists.keys())
    ))
    return
```

---

## 8. Configuration Options

### 8.1 Settings

```python
SETTINGS = {
    "BATCH_PARALLEL_WORKERS": 2,  # Max parallel playlist processing
    "BATCH_OUTPUT_MODE": "separate",  # "separate" or "combined"
    "BATCH_STOP_ON_ERROR": False,  # Continue if playlist fails
}
```

---

## 9. Usage Examples

### 9.1 Multiple Playlists from CLI

```bash
python main.py --xml collection.xml \
    --playlists "My Techno Playlist" "My House Playlist" "Test Playlist" \
    --auto-research
```

### 9.2 Playlist File

```bash
# Create playlists.txt with playlist names
echo "My Techno Playlist" > playlists.txt
echo "My House Playlist" >> playlists.txt

# Process from file
python main.py --xml collection.xml \
    --playlists-file playlists.txt \
    --auto-research
```

### 9.3 Combined Output

```bash
python main.py --xml collection.xml \
    --playlists-file playlists.txt \
    --batch-output-mode combined \
    --out batch_results
```

### 9.4 Parallel Processing

```bash
python main.py --xml collection.xml \
    --playlists-file playlists.txt \
    --batch-parallel \
    --auto-research
```

---

## 10. Performance Considerations

### 10.1 Sequential vs Parallel

**Sequential**:
- Lower memory usage
- Simpler error handling
- Better for debugging
- Slower for large batches

**Parallel**:
- Faster overall (2-4x speedup)
- Higher memory usage
- More complex error handling
- Better for large batches

### 10.2 Resource Management

- **Worker limit**: Cap parallel workers to avoid overwhelming system
- **Memory**: Monitor memory usage with large playlists
- **Network**: Parallel requests may hit rate limits

---

## 11. Benefits

### 11.1 Time Savings

- **Batch processing**: Process 10 playlists in one run
- **No manual intervention**: Automated workflow
- **Parallel option**: Faster than sequential runs

### 11.2 Consistency

- **Same settings**: All playlists use same configuration
- **Aggregate reporting**: Compare playlists easily
- **Unified workflow**: Single command for all playlists

---

## 12. Future Enhancements

### 12.1 Potential Improvements

1. **Progress tracking**: Show progress across all playlists
2. **Resume capability**: Resume from failed playlist
3. **Filtering**: Process playlists matching pattern
4. **Scheduling**: Schedule batch processing

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

