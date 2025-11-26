# Step 5.10: Performance & Optimization Review

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 2-3 days  
**Dependencies**: All previous steps (restructuring complete)

---

## Goal

Ensure that code restructuring doesn't degrade performance and optimize critical paths. Compare performance before and after restructuring, identify regressions, and optimize where needed.

---

## Success Criteria

- [ ] Baseline performance benchmarks established
- [ ] Post-restructure benchmarks run
- [ ] Performance compared (no significant degradation)
- [ ] Performance regressions identified and fixed
- [ ] Critical paths optimized
- [ ] Performance tests added
- [ ] Performance characteristics documented
- [ ] Memory usage analyzed
- [ ] Bottlenecks identified and addressed

---

## Performance Testing Strategy

### Metrics to Measure

1. **Processing Time**
   - Time to process single track
   - Time to process playlist (10, 50, 100 tracks)
   - Time to export results

2. **Memory Usage**
   - Peak memory usage
   - Memory growth over time
   - Memory leaks

3. **API Response Time**
   - Beatport API call time
   - Cache hit rate
   - Network overhead

4. **UI Responsiveness**
   - Time to load UI
   - Time to update results view
   - Time to apply filters

---

## Benchmarking Tools

### Performance Profiling

**cProfile:**
```python
# src/tests/performance/benchmark_processing.py

"""Performance benchmarks for processing."""

import cProfile
import pstats
import time
from cuepoint.services.processor_service import ProcessorService
from cuepoint.models.track import Track

def benchmark_process_track():
    """Benchmark single track processing."""
    # Setup
    service = create_processor_service()
    track = Track(title="Test Track", artist="Test Artist")
    
    # Profile
    profiler = cProfile.Profile()
    profiler.enable()
    
    start_time = time.time()
    result = service.process_track(track)
    end_time = time.time()
    
    profiler.disable()
    
    # Report
    duration = end_time - start_time
    print(f"Processing time: {duration:.3f} seconds")
    
    # Save profile
    stats = pstats.Stats(profiler)
    stats.sort_stats('cumulative')
    stats.print_stats(20)  # Top 20 functions
    stats.dump_stats('profile_process_track.prof')
    
    return duration, result

def benchmark_process_playlist(track_count: int = 100):
    """Benchmark playlist processing."""
    # Setup
    service = create_processor_service()
    tracks = [
        Track(title=f"Track {i}", artist=f"Artist {i}")
        for i in range(track_count)
    ]
    
    # Benchmark
    start_time = time.time()
    results = service.process_playlist(tracks)
    end_time = time.time()
    
    duration = end_time - start_time
    avg_time_per_track = duration / track_count
    
    print(f"Processed {track_count} tracks in {duration:.3f} seconds")
    print(f"Average time per track: {avg_time_per_track:.3f} seconds")
    
    return duration, results
```

### Memory Profiling

**memory_profiler:**
```python
# src/tests/performance/memory_benchmark.py

"""Memory usage benchmarks."""

from memory_profiler import profile
from cuepoint.services.processor_service import ProcessorService

@profile
def process_playlist_memory():
    """Profile memory usage during playlist processing."""
    service = create_processor_service()
    tracks = create_test_tracks(100)
    
    results = []
    for track in tracks:
        result = service.process_track(track)
        results.append(result)
    
    return results
```

---

## Performance Test Suite

### Performance Test Framework

```python
# src/tests/performance/test_performance.py

"""Performance tests."""

import pytest
import time
from cuepoint.services.processor_service import ProcessorService

@pytest.mark.performance
@pytest.mark.slow
class TestProcessingPerformance:
    """Performance tests for processing."""
    
    def test_process_single_track_performance(self):
        """Test single track processing performance."""
        service = create_processor_service()
        track = Track(title="Test", artist="Artist")
        
        start = time.time()
        result = service.process_track(track)
        duration = time.time() - start
        
        # Assert performance requirement
        assert duration < 5.0, f"Processing took {duration:.3f}s, expected < 5.0s"
        assert result is not None
    
    def test_process_playlist_performance(self):
        """Test playlist processing performance."""
        service = create_processor_service()
        tracks = [Track(title=f"Track {i}", artist=f"Artist {i}") for i in range(50)]
        
        start = time.time()
        results = service.process_playlist(tracks)
        duration = time.time() - start
        
        # Assert performance requirement
        avg_time = duration / len(tracks)
        assert avg_time < 3.0, f"Average time per track: {avg_time:.3f}s, expected < 3.0s"
        assert len(results) == len(tracks)
    
    def test_cache_performance(self):
        """Test cache performance."""
        cache_service = create_cache_service()
        
        # First access (cache miss)
        start = time.time()
        result1 = cache_service.get("test_key")
        miss_time = time.time() - start
        
        # Set value
        cache_service.set("test_key", "test_value")
        
        # Second access (cache hit)
        start = time.time()
        result2 = cache_service.get("test_key")
        hit_time = time.time() - start
        
        # Cache hit should be much faster
        assert hit_time < miss_time * 0.1, "Cache hit not significantly faster"
```

---

## Performance Comparison

### Before/After Comparison

```python
# src/tests/performance/compare_performance.py

"""Compare performance before and after restructuring."""

import json
from pathlib import Path
from typing import Dict, List

def run_baseline_benchmarks() -> Dict[str, float]:
    """Run benchmarks on old codebase (if available)."""
    # This would run against the old codebase
    # For now, return mock data
    return {
        "process_single_track": 2.5,
        "process_playlist_10": 25.0,
        "process_playlist_50": 125.0,
        "process_playlist_100": 250.0,
        "export_csv_100": 1.5,
        "export_json_100": 0.8
    }

def run_current_benchmarks() -> Dict[str, float]:
    """Run benchmarks on current codebase."""
    results = {}
    
    # Single track
    results["process_single_track"] = benchmark_process_track()
    
    # Playlists
    for count in [10, 50, 100]:
        results[f"process_playlist_{count}"] = benchmark_process_playlist(count)
    
    # Export
    results["export_csv_100"] = benchmark_export_csv(100)
    results["export_json_100"] = benchmark_export_json(100)
    
    return results

def compare_performance(baseline: Dict[str, float], current: Dict[str, float]) -> Dict[str, float]:
    """Compare performance metrics.
    
    Returns:
        Dictionary with percentage change for each metric.
        Positive values indicate improvement, negative indicate regression.
    """
    comparison = {}
    
    for key in baseline:
        if key in current:
            change = ((current[key] - baseline[key]) / baseline[key]) * 100
            comparison[key] = change
    
    return comparison

def generate_performance_report():
    """Generate performance comparison report."""
    baseline = run_baseline_benchmarks()
    current = run_current_benchmarks()
    comparison = compare_performance(baseline, current)
    
    report = {
        "baseline": baseline,
        "current": current,
        "comparison": comparison,
        "summary": {
            "improvements": sum(1 for v in comparison.values() if v < 0),
            "regressions": sum(1 for v in comparison.values() if v > 0),
            "avg_change": sum(comparison.values()) / len(comparison)
        }
    }
    
    # Save report
    report_path = Path("reports/performance_comparison.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Print summary
    print("Performance Comparison Report")
    print("=" * 50)
    print(f"Improvements: {report['summary']['improvements']}")
    print(f"Regressions: {report['summary']['regressions']}")
    print(f"Average change: {report['summary']['avg_change']:.2f}%")
    
    return report
```

---

## Optimization Strategies

### 1. Caching Optimization

```python
# Optimize cache usage
def optimize_cache():
    """Optimize cache configuration."""
    # Increase cache size if memory allows
    # Adjust TTL based on usage patterns
    # Implement cache warming for common queries
    pass
```

### 2. Lazy Loading

```python
# Use lazy loading for large datasets
class ResultsView:
    def __init__(self):
        self._results = None  # Lazy load
    
    @property
    def results(self):
        if self._results is None:
            self._results = self._load_results()
        return self._results
```

### 3. Batch Processing

```python
# Process items in batches
def process_playlist_optimized(tracks: List[Track], batch_size: int = 10):
    """Process tracks in batches for better performance."""
    results = []
    for i in range(0, len(tracks), batch_size):
        batch = tracks[i:i + batch_size]
        batch_results = process_batch(batch)
        results.extend(batch_results)
    return results
```

### 4. Database Connection Pooling

```python
# If using database, use connection pooling
from sqlalchemy.pool import QueuePool

pool = QueuePool(
    creator=create_connection,
    max_overflow=10,
    pool_size=5
)
```

### 5. Async I/O (if applicable)

```python
# Use async I/O for network operations (see Phase 6)
import asyncio

async def fetch_multiple_tracks(urls: List[str]):
    """Fetch multiple tracks concurrently."""
    tasks = [fetch_track(url) for url in urls]
    return await asyncio.gather(*tasks)
```

---

## Performance Monitoring

### Add Performance Logging

```python
# src/cuepoint/utils/performance.py

"""Performance monitoring utilities."""

import time
import functools
from typing import Callable, Any
from cuepoint.services.interfaces import ILoggingService

def measure_time(func: Callable) -> Callable:
    """Decorator to measure function execution time."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        duration = time.time() - start
        
        # Log if duration exceeds threshold
        if duration > 1.0:  # Log if > 1 second
            logger = get_logger()
            logger.warning(
                f"Slow operation: {func.__name__} took {duration:.3f}s",
                extra={"function": func.__name__, "duration": duration}
            )
        
        return result
    return wrapper

@measure_time
def process_track(track: Track) -> TrackResult:
    """Process track with performance monitoring."""
    # ... processing logic ...
    pass
```

---

## Implementation Checklist

- [ ] Set up performance testing framework
- [ ] Run baseline benchmarks (if old code available)
- [ ] Run current benchmarks
- [ ] Compare performance metrics
- [ ] Identify performance regressions
- [ ] Fix performance regressions
- [ ] Optimize critical paths
- [ ] Add performance tests
- [ ] Add performance monitoring
- [ ] Document performance characteristics
- [ ] Generate performance report
- [ ] Review optimization opportunities

---

## Performance Targets

### Target Metrics

- **Single Track Processing**: < 5 seconds
- **Playlist Processing (100 tracks)**: < 5 minutes
- **Export (100 results)**: < 2 seconds
- **UI Load Time**: < 2 seconds
- **Filter Application**: < 100ms
- **Memory Usage**: < 500 MB for 100 tracks

### Acceptance Criteria

- No more than 10% performance degradation from baseline
- Critical paths meet target metrics
- Memory usage is reasonable
- No memory leaks detected

---

## Performance Report Template

**reports/performance_report.md:**
```markdown
# Performance Report

## Benchmark Results

### Processing Performance
- Single track: X seconds (target: < 5s) ✅/❌
- Playlist (100 tracks): X seconds (target: < 5min) ✅/❌

### Export Performance
- CSV export (100 results): X seconds (target: < 2s) ✅/❌
- JSON export (100 results): X seconds (target: < 2s) ✅/❌

## Comparison with Baseline
- Average change: X%
- Improvements: X metrics
- Regressions: X metrics

## Optimizations Applied
1. Cache optimization
2. Batch processing
3. Lazy loading

## Recommendations
1. Further optimize X
2. Consider Y for Z scenario
```

---

## Next Steps

After completing this step:
1. Review performance report
2. Address any critical regressions
3. Document performance characteristics
4. Mark Phase 5 as complete
5. Proceed to next phase (Phase 7 or Phase 8)

---

## Notes

- Performance testing should be part of CI/CD pipeline
- Monitor performance over time
- Set up alerts for performance regressions
- Document performance characteristics for users

