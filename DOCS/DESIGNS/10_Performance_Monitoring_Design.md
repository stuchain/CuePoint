# Design: Performance Monitoring

**Number**: 10  
**Status**: 📝 Planned  
**Priority**: ⚡ P1 - Medium Effort  
**Effort**: 3-4 days  
**Impact**: Medium

---

## 1. Overview

### 1.1 Problem Statement

No visibility into performance bottlenecks:
- Which queries are slow?
- Which tracks take longest?
- Cache hit rates?
- Query effectiveness?

### 1.2 Solution Overview

Add comprehensive performance monitoring:
1. Detailed timing metrics
2. Query effectiveness analysis
3. Cache statistics
4. Performance reports

---

## 2. Architecture Design

### 2.1 Monitoring Flow

```
Track Processing
    ├─ Start Timer
    ├─ Query Execution
    │   ├─ Start Timer
    │   ├─ Network Request
    │   ├─ Parse Response
    │   └─ Record Timing
    ├─ Candidate Evaluation
    │   ├─ Start Timer
    │   ├─ Fetch Candidate Data
    │   ├─ Score Calculation
    │   └─ Record Timing
    └─ End Timer → Record Total Time
    ↓
Collect Metrics
    ├─ Per-query timings
    ├─ Per-candidate timings
    ├─ Per-track totals
    └─ Aggregate statistics
    ↓
Generate Report
```

### 2.2 Metrics Collection System

**Location**: `SRC/performance.py` (new module)

```python
from dataclasses import dataclass, field
from typing import Dict, List
import time

@dataclass
class QueryMetrics:
    """Metrics for a single query"""
    query_text: str
    execution_time: float
    candidates_found: int
    cache_hit: bool
    query_type: str  # "priority", "n_gram", "remix", etc.

@dataclass
class TrackMetrics:
    """Metrics for a single track"""
    track_id: str
    track_title: str
    total_time: float
    queries: List[QueryMetrics] = field(default_factory=list)
    total_queries: int = 0
    total_candidates: int = 0
    early_exit: bool = False
    early_exit_query_index: int = 0

@dataclass
class PerformanceStats:
    """Aggregate performance statistics"""
    total_tracks: int = 0
    total_time: float = 0.0
    query_metrics: List[QueryMetrics] = field(default_factory=list)
    track_metrics: List[TrackMetrics] = field(default_factory=list)
    cache_stats: Dict[str, int] = field(default_factory=lambda: {"hits": 0, "misses": 0})
    
    def average_time_per_track(self) -> float:
        if self.total_tracks == 0:
            return 0.0
        return self.total_time / self.total_tracks
    
    def average_time_per_query(self) -> float:
        if not self.query_metrics:
            return 0.0
        return sum(q.execution_time for q in self.query_metrics) / len(self.query_metrics)
```

---

## 3. Implementation Details

### 3.1 Timing Decorators

**Location**: `SRC/utils.py` (extend existing)

```python
from functools import wraps
from typing import Callable

class PerformanceTimer:
    """Context manager for timing operations"""
    def __init__(self, operation_name: str, metrics_collector=None):
        self.operation_name = operation_name
        self.metrics_collector = metrics_collector
        self.start_time = None
        self.end_time = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.perf_counter()
        elapsed = self.end_time - self.start_time
        
        if self.metrics_collector:
            self.metrics_collector.record(self.operation_name, elapsed)
        
        return False

def timed_operation(operation_name: str):
    """Decorator for timing function execution"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            with PerformanceTimer(operation_name):
                return func(*args, **kwargs)
        return wrapper
    return decorator
```

### 3.2 Query Timing

**Location**: `SRC/matcher.py`

```python
def best_beatport_match(rb: RBTrack, queries: List[str]) -> Optional[BeatportCandidate]:
    track_metrics = TrackMetrics(
        track_id=rb.track_id,
        track_title=rb.title
    )
    
    track_start = time.perf_counter()
    
    for idx, query in enumerate(queries):
        query_start = time.perf_counter()
        
        # Execute query
        candidates = execute_search_query(query)
        
        query_time = time.perf_counter() - query_start
        
        # Record query metrics
        query_metrics = QueryMetrics(
            query_text=query,
            execution_time=query_time,
            candidates_found=len(candidates),
            cache_hit=check_cache_hit(query),
            query_type=classify_query(query)
        )
        track_metrics.queries.append(query_metrics)
        
        # ... rest of matching logic ...
    
    track_metrics.total_time = time.perf_counter() - track_start
    track_metrics.total_queries = len(queries)
    
    # Store metrics
    performance_stats.track_metrics.append(track_metrics)
    
    return best_match
```

### 3.3 Cache Statistics

**Location**: `SRC/beatport_search.py`

```python
def track_urls(query: str, max_results: int = 50) -> List[str]:
    # Check cache first
    cache_key = generate_cache_key(query)
    cached_result = cache.get(cache_key)
    
    if cached_result:
        performance_stats.cache_stats["hits"] += 1
        return cached_result
    else:
        performance_stats.cache_stats["misses"] += 1
    
    # Execute search...
    results = execute_search(query)
    
    # Store in cache
    cache.set(cache_key, results)
    
    return results
```

---

## 4. Performance Report Generation

### 4.1 Report Structure

**Location**: `SRC/processor.py`

```python
def generate_performance_report(stats: PerformanceStats) -> str:
    """Generate performance analysis report"""
    
    report = []
    report.append("=" * 80)
    report.append("Performance Analysis Report")
    report.append("=" * 80)
    report.append("")
    
    # Overall Statistics
    report.append("Overall Performance:")
    report.append(f"  Total tracks processed: {stats.total_tracks}")
    report.append(f"  Total processing time: {format_time(stats.total_time)}")
    report.append(f"  Average time per track: {format_time(stats.average_time_per_track())}")
    report.append("")
    
    # Query Statistics
    report.append("Query Performance:")
    report.append(f"  Total queries executed: {len(stats.query_metrics)}")
    report.append(f"  Average time per query: {format_time(stats.average_time_per_query())}")
    
    # Slowest queries
    slowest_queries = sorted(
        stats.query_metrics,
        key=lambda q: q.execution_time,
        reverse=True
    )[:10]
    
    report.append("  Slowest queries:")
    for query in slowest_queries:
        report.append(f"    {query.query_text[:50]}: {format_time(query.execution_time)}")
    report.append("")
    
    # Query Type Analysis
    by_type = {}
    for query in stats.query_metrics:
        qtype = query.query_type
        if qtype not in by_type:
            by_type[qtype] = {"count": 0, "total_time": 0.0}
        by_type[qtype]["count"] += 1
        by_type[qtype]["total_time"] += query.execution_time
    
    report.append("Query Performance by Type:")
    for qtype, data in sorted(by_type.items()):
        avg_time = data["total_time"] / data["count"]
        report.append(f"  {qtype}: {data['count']} queries, avg {format_time(avg_time)}")
    report.append("")
    
    # Cache Statistics
    total_requests = stats.cache_stats["hits"] + stats.cache_stats["misses"]
    hit_rate = (stats.cache_stats["hits"] / total_requests * 100) if total_requests > 0 else 0
    
    report.append("Cache Performance:")
    report.append(f"  Cache hits: {stats.cache_stats['hits']}")
    report.append(f"  Cache misses: {stats.cache_stats['misses']}")
    report.append(f"  Hit rate: {hit_rate:.1f}%")
    report.append("")
    
    # Track Performance
    slowest_tracks = sorted(
        stats.track_metrics,
        key=lambda t: t.total_time,
        reverse=True
    )[:10]
    
    report.append("Slowest Tracks:")
    for track in slowest_tracks:
        report.append(f"  {track.track_title[:50]}: {format_time(track.total_time)} ({track.total_queries} queries)")
    
    return "\n".join(report)
```

### 4.2 Report File Output

```python
def save_performance_report(stats: PerformanceStats, output_base: str) -> str:
    """Save performance report to file"""
    report = generate_performance_report(stats)
    
    report_path = os.path.join(
        "output", f"{output_base}_performance.txt"
    )
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    
    return report_path
```

---

## 5. Metrics Tracked

### 5.1 Query-Level Metrics

- **Execution time**: Time to execute each query
- **Candidates found**: Number of candidates returned
- **Cache hit/miss**: Whether result was cached
- **Query type**: Classification (priority, n_gram, remix, etc.)
- **Network time**: Time spent on network requests
- **Parse time**: Time spent parsing responses

### 5.2 Candidate-Level Metrics

- **Fetch time**: Time to fetch candidate data from Beatport
- **Parse time**: Time to parse candidate HTML/JSON
- **Score time**: Time to calculate similarity scores

### 5.3 Track-Level Metrics

- **Total time**: End-to-end processing time per track
- **Query count**: Number of queries executed
- **Candidate count**: Total candidates evaluated
- **Early exit**: Whether early exit occurred
- **Match found**: Whether match was found

### 5.4 Aggregate Metrics

- **Average times**: Per-track, per-query, per-candidate
- **Cache statistics**: Hit rate, total requests
- **Query effectiveness**: Success rate per query type
- **Bottleneck identification**: Slowest operations

---

## 6. Performance Analysis

### 6.1 Bottleneck Identification

```python
def identify_bottlenecks(stats: PerformanceStats) -> List[str]:
    """Identify performance bottlenecks"""
    bottlenecks = []
    
    # Check query times
    avg_query_time = stats.average_time_per_query()
    if avg_query_time > 5.0:
        bottlenecks.append(f"Slow queries (avg {avg_query_time:.1f}s)")
    
    # Check cache hit rate
    total_requests = stats.cache_stats["hits"] + stats.cache_stats["misses"]
    if total_requests > 0:
        hit_rate = stats.cache_stats["hits"] / total_requests * 100
        if hit_rate < 50:
            bottlenecks.append(f"Low cache hit rate ({hit_rate:.1f}%)")
    
    # Check track processing time
    avg_track_time = stats.average_time_per_track()
    if avg_track_time > 60.0:
        bottlenecks.append(f"Slow track processing (avg {avg_track_time:.1f}s)")
    
    return bottlenecks
```

### 6.2 Query Effectiveness Analysis

```python
def analyze_query_effectiveness(stats: PerformanceStats) -> Dict:
    """Analyze which query types are most effective"""
    effectiveness = {}
    
    for query_metric in stats.query_metrics:
        qtype = query_metric.query_type
        if qtype not in effectiveness:
            effectiveness[qtype] = {
                "total": 0,
                "found_candidates": 0,
                "total_time": 0.0
            }
        
        effectiveness[qtype]["total"] += 1
        effectiveness[qtype]["found_candidates"] += query_metric.candidates_found
        effectiveness[qtype]["total_time"] += query_metric.execution_time
    
    # Calculate averages
    for qtype, data in effectiveness.items():
        data["avg_candidates"] = data["found_candidates"] / data["total"]
        data["avg_time"] = data["total_time"] / data["total"]
        data["efficiency"] = data["avg_candidates"] / data["avg_time"]  # Candidates per second
    
    return effectiveness
```

---

## 7. Configuration Options

### 7.1 Settings

```python
SETTINGS = {
    "ENABLE_PERFORMANCE_MONITORING": True,  # Enable/disable monitoring
    "PERFORMANCE_DETAILED": False,           # Detailed per-operation timing
    "PERFORMANCE_LOG_SLOW_OPERATIONS": True, # Log operations > threshold
    "PERFORMANCE_SLOW_THRESHOLD": 5.0,      # Seconds threshold for "slow"
    "PERFORMANCE_GENERATE_REPORT": True,     # Generate performance report
}
```

---

## 8. Integration Points

### 8.1 Processor Integration

```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    # Initialize performance stats
    if SETTINGS.get("ENABLE_PERFORMANCE_MONITORING", True):
        performance_stats = PerformanceStats()
    
    # ... processing ...
    
    # Generate performance report
    if SETTINGS.get("ENABLE_PERFORMANCE_MONITORING", True):
        report_path = save_performance_report(performance_stats, out_csv_base)
        print(f"Performance report: {report_path}")
        
        # Identify bottlenecks
        bottlenecks = identify_bottlenecks(performance_stats)
        if bottlenecks:
            print("\nPerformance Bottlenecks Detected:")
            for bottleneck in bottlenecks:
                print(f"  - {bottleneck}")
```

---

## 9. Usage Examples

### 9.1 Enable Performance Monitoring

```bash
# Default: monitoring enabled
python main.py --xml collection.xml --playlist "My Playlist"

# Disable monitoring
python main.py --xml collection.xml --playlist "My Playlist" --no-performance
```

### 9.2 View Performance Report

After processing, check `output/{name}_performance.txt` for detailed analysis.

---

## 10. Benefits

### 10.1 Optimization

- **Identify bottlenecks**: Know what's slowing down processing
- **Query optimization**: Understand which queries are inefficient
- **Cache tuning**: Optimize cache settings based on hit rates

### 10.2 Debugging

- **Slow track identification**: Find problematic tracks
- **Network issues**: Identify slow network requests
- **Performance regression**: Compare performance over time

---

## 11. Future Enhancements

### 11.1 Potential Improvements

1. **Real-time monitoring**: Show metrics during processing
2. **Performance profiling**: Use cProfile for detailed profiling
3. **Comparative analysis**: Compare performance across runs
4. **Visualization**: Generate charts/graphs of metrics
5. **Automated optimization**: Suggest configuration improvements

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

