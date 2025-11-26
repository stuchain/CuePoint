# Step 6.0: Add JSON Export for Performance Metrics

**Status**: 📝 Planned  
**Priority**: 🚀 HIGH (Required before other Phase 6 steps)  
**Estimated Duration**: 4-6 hours  
**Dependencies**: Phase 3 (performance metrics must be available)

---

## Goal

Export performance metrics to JSON format for analysis, enabling network time analysis needed for async I/O decision-making. This step is **REQUIRED** before implementing any async I/O code.

---

## Success Criteria

- [ ] JSON export function implemented in `output_writer.py`
- [ ] Performance analyzer module created
- [ ] Network time analysis functions work correctly
- [ ] JSON export includes all necessary metrics
- [ ] Analysis functions provide clear recommendations
- [ ] GUI integration for JSON export
- [ ] All functions tested
- [ ] Documentation updated

---

## Why This Step is Critical

**Before implementing async I/O, you MUST know:**
1. What percentage of total time is spent on network I/O?
2. What is the cache hit rate?
3. Is network I/O actually a bottleneck?

**This step provides the tools to answer these questions.**

---

## Implementation Details

### Part A: Add JSON Export Function to `output_writer.py`

**File**: `SRC/output_writer.py` (MODIFY)

**Location**: Add after existing export functions

**Function Signature**:
```python
def export_performance_metrics_json(
    stats: PerformanceStats,
    base_filename: str,
    output_dir: str = "output"
) -> str:
```

**Exact Implementation**:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Add this function to SRC/output_writer.py
Place it after the existing export functions (write_csv_files, write_json_file, etc.)
"""

import json
import os
from datetime import datetime
from typing import Dict, Any, List
from collections import defaultdict

def export_performance_metrics_json(
    stats,
    base_filename: str,
    output_dir: str = "output"
) -> str:
    """
    Export performance metrics to JSON format for analysis.
    
    This enables detailed analysis of network_time, query performance,
    and other metrics needed for async I/O decision-making.
    
    Args:
        stats: PerformanceStats object from performance module
        base_filename: Base filename for the export (without extension)
        output_dir: Output directory (default: "output")
    
    Returns:
        Path to the generated JSON file
    
    Raises:
        ValueError: If stats is None or invalid
        IOError: If file cannot be written
    """
    from performance import PerformanceStats, QueryMetrics, TrackMetrics
    
    # Validate input
    if stats is None:
        raise ValueError("stats cannot be None")
    
    if not isinstance(stats, PerformanceStats):
        raise ValueError(f"stats must be PerformanceStats, got {type(stats)}")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Convert metrics to JSON-serializable format
    json_data = {
        "version": "1.0",
        "generated": datetime.now().isoformat(),
        "session_info": {
            "start_time": stats.start_time.isoformat() if hasattr(stats.start_time, 'isoformat') else str(stats.start_time),
            "end_time": stats.end_time.isoformat() if hasattr(stats.end_time, 'isoformat') else str(stats.end_time),
            "total_time": stats.total_time,
            "total_tracks": stats.total_tracks,
            "matched_tracks": stats.matched_tracks,
            "unmatched_tracks": stats.unmatched_tracks
        },
        "cache_stats": {
            "hits": stats.cache_stats.get("hits", 0) if hasattr(stats, 'cache_stats') else 0,
            "misses": stats.cache_stats.get("misses", 0) if hasattr(stats, 'cache_stats') else 0,
            "total": stats.cache_stats.get("total", 0) if hasattr(stats, 'cache_stats') else 0
        },
        "query_metrics": [
            {
                "query_text": q.query_text,
                "execution_time": q.execution_time,
                "network_time": getattr(q, 'network_time', 0.0),
                "parse_time": getattr(q, 'parse_time', 0.0),
                "candidates_found": q.candidates_found,
                "cache_hit": getattr(q, 'cache_hit', False),
                "query_type": getattr(q, 'query_type', 'unknown')
            }
            for q in stats.query_metrics
        ],
        "track_metrics": [
            {
                "track_id": getattr(t, 'track_id', ''),
                "track_title": getattr(t, 'track_title', ''),
                "total_time": t.total_time,
                "total_queries": t.total_queries,
                "total_candidates": t.total_candidates,
                "candidates_evaluated": getattr(t, 'candidates_evaluated', 0),
                "early_exit": getattr(t, 'early_exit', False),
                "early_exit_query_index": getattr(t, 'early_exit_query_index', -1),
                "match_found": getattr(t, 'match_found', False),
                "match_score": getattr(t, 'match_score', 0.0),
                "queries": [
                    {
                        "query_text": q.query_text,
                        "execution_time": q.execution_time,
                        "network_time": getattr(q, 'network_time', 0.0),
                        "parse_time": getattr(q, 'parse_time', 0.0),
                        "candidates_found": q.candidates_found,
                        "cache_hit": getattr(q, 'cache_hit', False),
                        "query_type": getattr(q, 'query_type', 'unknown')
                    }
                    for q in getattr(t, 'queries', [])
                ]
            }
            for t in stats.track_metrics
        ],
        "aggregate_stats": {
            "average_time_per_track": stats.average_time_per_track() if hasattr(stats, 'average_time_per_track') else 0.0,
            "average_time_per_query": stats.average_time_per_query() if hasattr(stats, 'average_time_per_query') else 0.0,
            "cache_hit_rate": stats.cache_hit_rate() if hasattr(stats, 'cache_hit_rate') else 0.0,
            "match_rate": stats.match_rate() if hasattr(stats, 'match_rate') else 0.0
        }
    }
    
    # Calculate network time statistics
    total_network_time = sum(getattr(q, 'network_time', 0.0) for q in stats.query_metrics)
    total_execution_time = sum(q.execution_time for q in stats.query_metrics)
    network_time_percentage = (total_network_time / total_execution_time * 100) if total_execution_time > 0 else 0.0
    
    json_data["network_analysis"] = {
        "total_network_time": total_network_time,
        "total_execution_time": total_execution_time,
        "network_time_percentage": network_time_percentage,
        "average_network_time_per_query": total_network_time / len(stats.query_metrics) if stats.query_metrics else 0.0,
        "network_time_by_query_type": _calculate_network_time_by_type(stats.query_metrics)
    }
    
    # Write to file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{base_filename}_metrics_{timestamp}.json"
    filepath = os.path.join(output_dir, filename)
    
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)
    except IOError as e:
        raise IOError(f"Failed to write JSON file: {e}")
    
    return filepath


def _calculate_network_time_by_type(query_metrics: List) -> Dict[str, Dict[str, float]]:
    """
    Calculate network time statistics by query type.
    
    Args:
        query_metrics: List of QueryMetrics objects
    
    Returns:
        Dictionary mapping query_type to statistics
    """
    by_type = defaultdict(lambda: {"total_network_time": 0.0, "total_execution_time": 0.0, "count": 0})
    
    for query in query_metrics:
        qtype = getattr(query, 'query_type', 'unknown')
        network_time = getattr(query, 'network_time', 0.0)
        execution_time = query.execution_time
        
        by_type[qtype]["total_network_time"] += network_time
        by_type[qtype]["total_execution_time"] += execution_time
        by_type[qtype]["count"] += 1
    
    result = {}
    for qtype, data in by_type.items():
        result[qtype] = {
            "total_network_time": data["total_network_time"],
            "total_execution_time": data["total_execution_time"],
            "average_network_time": data["total_network_time"] / data["count"] if data["count"] > 0 else 0.0,
            "network_time_percentage": (data["total_network_time"] / data["total_execution_time"] * 100) if data["total_execution_time"] > 0 else 0.0,
            "count": data["count"]
        }
    
    return result
```

**Integration Points**:
- Must import from `performance` module
- Must handle missing attributes gracefully
- Must validate input types
- Must handle file I/O errors

---

### Part B: Create Performance Analyzer Module

**File**: `SRC/performance_analyzer.py` (NEW)

**Complete Implementation**:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Performance Metrics Analyzer

Utility functions for analyzing exported performance metrics,
particularly for async I/O decision-making.
"""

import json
from typing import Dict, Any, Optional, Tuple
from pathlib import Path


def load_metrics_from_json(json_path: str) -> Dict[str, Any]:
    """
    Load performance metrics from JSON file.
    
    Args:
        json_path: Path to JSON metrics file
    
    Returns:
        Dictionary containing metrics data
    
    Raises:
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If file is not valid JSON
        ValueError: If file structure is invalid
    """
    path = Path(json_path)
    
    if not path.exists():
        raise FileNotFoundError(f"Metrics file not found: {json_path}")
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise json.JSONDecodeError(f"Invalid JSON in metrics file: {e}")
    
    # Validate structure
    required_keys = ["version", "session_info", "network_analysis", "aggregate_stats"]
    for key in required_keys:
        if key not in data:
            raise ValueError(f"Invalid metrics file: missing '{key}'")
    
    return data


def analyze_network_time_percentage(metrics: Dict[str, Any]) -> Tuple[float, str]:
    """
    Analyze network time percentage to determine if async I/O is needed.
    
    Args:
        metrics: Metrics dictionary from load_metrics_from_json()
    
    Returns:
        Tuple of (network_time_percentage, recommendation)
        - network_time_percentage: Float (0-100)
        - recommendation: String with recommendation and reason
    
    Decision Criteria:
    - network_percentage > 40% AND cache_hit_rate < 50% → "implement"
    - network_percentage < 20% OR cache_hit_rate > 80% → "skip"
    - Otherwise → "evaluate"
    """
    network_analysis = metrics.get("network_analysis", {})
    network_percentage = network_analysis.get("network_time_percentage", 0.0)
    
    aggregate_stats = metrics.get("aggregate_stats", {})
    cache_hit_rate = aggregate_stats.get("cache_hit_rate", 0.0)
    
    # Decision criteria
    if network_percentage > 40.0 and cache_hit_rate < 50.0:
        recommendation = "IMPLEMENT"
        reason = (
            f"Network time is {network_percentage:.1f}% of total time and "
            f"cache hit rate is {cache_hit_rate:.1f}%. "
            f"Async I/O should provide significant benefit (30-50% speedup expected)."
        )
    elif network_percentage < 20.0 or cache_hit_rate > 80.0:
        recommendation = "SKIP"
        reason = (
            f"Network time is {network_percentage:.1f}% of total time and "
            f"cache hit rate is {cache_hit_rate:.1f}%. "
            f"Async I/O unlikely to provide significant benefit. "
            f"Focus on other optimizations instead."
        )
    else:
        recommendation = "EVALUATE"
        reason = (
            f"Network time is {network_percentage:.1f}% of total time and "
            f"cache hit rate is {cache_hit_rate:.1f}%. "
            f"Evaluate case-by-case based on other factors: "
            f"number of tracks, network stability, memory constraints."
        )
    
    return network_percentage, f"{recommendation}: {reason}"


def generate_async_io_analysis_report(metrics: Dict[str, Any]) -> str:
    """
    Generate a human-readable analysis report for async I/O decision.
    
    Args:
        metrics: Metrics dictionary from load_metrics_from_json()
    
    Returns:
        Formatted analysis report string
    """
    network_analysis = metrics.get("network_analysis", {})
    aggregate_stats = metrics.get("aggregate_stats", {})
    session_info = metrics.get("session_info", {})
    
    report_lines = []
    report_lines.append("=" * 80)
    report_lines.append("Async I/O Analysis Report")
    report_lines.append("=" * 80)
    report_lines.append("")
    
    # Session summary
    report_lines.append("Session Summary:")
    report_lines.append(f"  Total tracks processed: {session_info.get('total_tracks', 0)}")
    report_lines.append(f"  Total processing time: {session_info.get('total_time', 0):.2f}s")
    report_lines.append(f"  Matched tracks: {session_info.get('matched_tracks', 0)}")
    report_lines.append(f"  Unmatched tracks: {session_info.get('unmatched_tracks', 0)}")
    report_lines.append(f"  Cache hit rate: {aggregate_stats.get('cache_hit_rate', 0):.1f}%")
    report_lines.append("")
    
    # Network time analysis
    network_percentage = network_analysis.get("network_time_percentage", 0.0)
    total_network_time = network_analysis.get("total_network_time", 0.0)
    total_execution_time = network_analysis.get("total_execution_time", 0.0)
    
    report_lines.append("Network Time Analysis:")
    report_lines.append(f"  Total network time: {total_network_time:.2f}s")
    report_lines.append(f"  Total execution time: {total_execution_time:.2f}s")
    report_lines.append(f"  Network time percentage: {network_percentage:.1f}%")
    report_lines.append("")
    
    # Network time by query type
    network_by_type = network_analysis.get("network_time_by_query_type", {})
    if network_by_type:
        report_lines.append("Network Time by Query Type:")
        for qtype, data in network_by_type.items():
            report_lines.append(f"  {qtype.replace('_', ' ').title()}:")
            report_lines.append(f"    Network time: {data['total_network_time']:.2f}s ({data['network_time_percentage']:.1f}%)")
            report_lines.append(f"    Query count: {data['count']}")
            report_lines.append(f"    Average network time: {data['average_network_time']:.2f}s")
        report_lines.append("")
    
    # Recommendation
    _, recommendation = analyze_network_time_percentage(metrics)
    report_lines.append("Recommendation:")
    report_lines.append(f"  {recommendation}")
    report_lines.append("")
    report_lines.append("=" * 80)
    
    return "\n".join(report_lines)


def print_analysis_report(metrics: Dict[str, Any]) -> None:
    """
    Print analysis report to console.
    
    Args:
        metrics: Metrics dictionary from load_metrics_from_json()
    """
    report = generate_async_io_analysis_report(metrics)
    print(report)
```

**File Structure**:
- Place in `SRC/performance_analyzer.py`
- Must be importable: `from performance_analyzer import ...`
- Must handle all edge cases

---

### Part C: GUI Integration

**File**: `SRC/gui/performance_view.py` (MODIFY)

**What to Add**:

```python
# Add import at top
from output_writer import export_performance_metrics_json

# In PerformanceView class, add method:
def export_metrics_to_json(self):
    """Export performance metrics to JSON"""
    from performance import performance_collector
    
    stats = performance_collector.get_stats()
    if not stats:
        QMessageBox.warning(
            self,
            "No Metrics",
            "No performance metrics available to export."
        )
        return
    
    # Get output directory
    output_dir = QFileDialog.getExistingDirectory(
        self,
        "Select Output Directory",
        "output"
    )
    
    if not output_dir:
        return
    
    try:
        # Export to JSON
        json_path = export_performance_metrics_json(
            stats,
            "performance_metrics",
            output_dir
        )
        
        # Show success message
        QMessageBox.information(
            self,
            "Export Complete",
            f"Performance metrics exported to:\n{json_path}"
        )
        
        # Optionally analyze and show report
        from performance_analyzer import load_metrics_from_json, print_analysis_report
        
        metrics = load_metrics_from_json(json_path)
        print_analysis_report(metrics)
        
    except Exception as e:
        QMessageBox.critical(
            self,
            "Export Error",
            f"Failed to export metrics:\n{str(e)}"
        )

# Add button in UI (in init_ui method):
export_json_btn = QPushButton("Export Metrics to JSON")
export_json_btn.clicked.connect(self.export_metrics_to_json)
# Add to button layout
```

---

## Implementation Checklist

- [ ] Add `export_performance_metrics_json()` to `output_writer.py`
- [ ] Add `_calculate_network_time_by_type()` helper function
- [ ] Create `performance_analyzer.py` module
- [ ] Implement `load_metrics_from_json()` function
- [ ] Implement `analyze_network_time_percentage()` function
- [ ] Implement `generate_async_io_analysis_report()` function
- [ ] Implement `print_analysis_report()` function
- [ ] Add error handling for all functions
- [ ] Add GUI integration in performance view
- [ ] Test JSON export with sample metrics
- [ ] Test analysis functions with sample data
- [ ] Test error conditions
- [ ] Verify JSON structure is correct
- [ ] Verify network time calculations are accurate

---

## Testing Requirements

### Unit Tests

```python
# Test export function
def test_export_performance_metrics_json():
    # Create mock PerformanceStats
    # Call export function
    # Verify JSON file created
    # Verify JSON structure
    # Verify network time calculations

# Test analyzer functions
def test_load_metrics_from_json():
    # Create test JSON file
    # Load metrics
    # Verify structure

def test_analyze_network_time_percentage():
    # Test with high network time (>40%)
    # Test with low network time (<20%)
    # Test with medium network time (20-40%)
    # Verify recommendations
```

### Integration Tests

```python
# Test full workflow
def test_export_and_analyze_workflow():
    # Process some tracks with performance tracking
    # Export metrics
    # Load and analyze
    # Verify recommendations make sense
```

---

## Usage Examples

### Example 1: Export and Analyze

```python
from performance import performance_collector
from output_writer import export_performance_metrics_json
from performance_analyzer import load_metrics_from_json, analyze_network_time_percentage, print_analysis_report

# After processing
stats = performance_collector.get_stats()
if stats:
    # Export to JSON
    json_path = export_performance_metrics_json(stats, "playlist_analysis", "output")
    print(f"Metrics exported to: {json_path}")
    
    # Load and analyze
    metrics = load_metrics_from_json(json_path)
    percentage, recommendation = analyze_network_time_percentage(metrics)
    
    print(f"\nNetwork time: {percentage:.1f}%")
    print(f"Recommendation: {recommendation}")
    
    # Print full report
    print_analysis_report(metrics)
```

### Example 2: Quick Analysis

```python
from performance_analyzer import load_metrics_from_json, analyze_network_time_percentage

metrics = load_metrics_from_json("output/playlist_analysis_metrics_20250125_120000.json")
percentage, recommendation = analyze_network_time_percentage(metrics)

if "IMPLEMENT" in recommendation:
    print("✅ Async I/O recommended - proceed with Phase 6")
elif "SKIP" in recommendation:
    print("❌ Async I/O not recommended - skip Phase 6")
else:
    print("⚠️ Evaluate case-by-case")
```

---

## Error Handling

### Export Function Errors
- **None stats**: Raise ValueError with clear message
- **Invalid stats type**: Raise ValueError with type information
- **File write error**: Raise IOError with file path
- **JSON serialization error**: Catch and wrap in IOError

### Analyzer Function Errors
- **File not found**: Raise FileNotFoundError
- **Invalid JSON**: Raise json.JSONDecodeError
- **Missing keys**: Raise ValueError with missing key name
- **Invalid structure**: Raise ValueError with structure details

---

## Acceptance Criteria

- ✅ JSON export function works correctly
- ✅ JSON includes all required metrics
- ✅ Network time calculations are accurate
- ✅ Analysis functions provide clear recommendations
- ✅ GUI integration works
- ✅ Error handling is robust
- ✅ All tests passing
- ✅ Documentation complete

---

## Next Steps

After completing this step:

1. **Export metrics** from a real processing session
2. **Analyze network time percentage**
3. **Review recommendation**
4. **Make decision**: Proceed with async I/O or skip to other phases

**If recommendation is "IMPLEMENT"**: Proceed to Step 6.1  
**If recommendation is "SKIP"**: Skip to other phases  
**If recommendation is "EVALUATE"**: Review other factors and decide

---

**This step is REQUIRED before implementing any async I/O code.**

