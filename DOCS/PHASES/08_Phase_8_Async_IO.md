# Phase 8: Async I/O Refactoring

**Status**: 📝 Planned (Evaluate Need Based on Phase 3 Metrics)  
**Priority**: 🚀 Medium Priority (Only if Phase 3 shows network I/O bottleneck)  
**Estimated Duration**: 4-5 days  
**Dependencies**: Phase 0 (backend), Phase 1 (GUI), Phase 3 (performance metrics), Python 3.7+ (for async/await)

## Goal
Refactor network I/O operations to use async/await for improved performance in parallel processing scenarios, but only if Phase 3 performance metrics indicate that network I/O is a significant bottleneck.

## Success Criteria
- [ ] Async functions implemented and working
- [ ] Concurrent fetching works correctly
- [ ] Performance improvement measurable (at least 30% faster for multi-track processing)
- [ ] Backward compatibility maintained (sync functions still available)
- [ ] Error handling works in async context
- [ ] Can switch between sync/async modes
- [ ] Phase 3 metrics show improvement
- [ ] All features tested
- [ ] Documentation updated

---

## Pre-Implementation Analysis

### Phase 3 Metrics Evaluation
**CRITICAL**: Before implementing, analyze Phase 3 performance metrics:

**Step 1: Export Metrics to JSON**
- Use `export_performance_metrics_json()` (from Substep 6.0) to export metrics
- This creates a JSON file with all `network_time` data needed for analysis

**Step 2: Analyze Network Time**
- Use `analyze_network_time_percentage()` from `performance_analyzer.py`
- Or manually calculate from exported JSON:
  1. Load JSON file: `metrics = load_metrics_from_json(json_path)`
  2. Get network percentage: `network_percentage = metrics["network_analysis"]["network_time_percentage"]`
  3. Review recommendation: `percentage, recommendation = analyze_network_time_percentage(metrics)`

**Step 3: Review Analysis**
1. **Network Time Analysis**
   - Review `network_time_percentage` from exported JSON
   - Calculate percentage of total time spent on network I/O
   - If network time < 30% of total time, async I/O may not provide significant benefit

2. **Concurrent Processing Analysis**
   - Review track processing times
   - If tracks are processed sequentially, async I/O won't help
   - Need parallel track processing for async I/O to be effective

3. **Cache Hit Rate Analysis**
   - Review cache hit rates from Phase 3
   - High cache hit rate (>70%) means less network I/O
   - Low cache hit rate may benefit from async I/O

4. **Decision Criteria**
   - **Implement if**: Network time > 40% of total time AND cache hit rate < 50%
   - **Don't implement if**: Network time < 20% of total time OR cache hit rate > 80%
   - **Evaluate case-by-case**: Network time 20-40% of total time

### Current State Analysis
- **Current Implementation**: Synchronous HTTP requests using `requests` library
- **Bottleneck**: Sequential network requests block processing
- **Opportunity**: Parallel requests can significantly reduce total processing time
- **Risk**: Increased complexity, potential for rate limiting issues

### Performance Considerations
- **Expected Improvement**: 30-50% faster for multi-track processing
- **Memory Impact**: Slightly higher memory usage for concurrent requests
- **Rate Limiting**: Need to respect Beatport rate limits
- **Error Handling**: More complex in async context

---

## Implementation Steps

### Substep 6.0: Add JSON Export for Performance Metrics (4-6 hours)
**File**: `SRC/output_writer.py` (MODIFY), `SRC/performance_analyzer.py` (NEW)

**Purpose**: Export performance metrics to JSON format for analysis, enabling network time analysis needed for async I/O decision-making.

**What to implement:**

```python
# In SRC/output_writer.py - Add new function

import json
from datetime import datetime
from typing import Dict, Any, Optional

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
        stats: PerformanceStats object
        base_filename: Base filename for the export
        output_dir: Output directory (default: "output")
    
    Returns:
        Path to the generated JSON file
    """
    from performance import PerformanceStats, QueryMetrics, TrackMetrics
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Convert metrics to JSON-serializable format
    json_data = {
        "version": "1.0",
        "generated": datetime.now().isoformat(),
        "session_info": {
            "start_time": stats.start_time,
            "end_time": stats.end_time,
            "total_time": stats.total_time,
            "total_tracks": stats.total_tracks,
            "matched_tracks": stats.matched_tracks,
            "unmatched_tracks": stats.unmatched_tracks
        },
        "cache_stats": stats.cache_stats,
        "query_metrics": [
            {
                "query_text": q.query_text,
                "execution_time": q.execution_time,
                "network_time": q.network_time,
                "parse_time": q.parse_time,
                "candidates_found": q.candidates_found,
                "cache_hit": q.cache_hit,
                "query_type": q.query_type
            }
            for q in stats.query_metrics
        ],
        "track_metrics": [
            {
                "track_id": t.track_id,
                "track_title": t.track_title,
                "total_time": t.total_time,
                "total_queries": t.total_queries,
                "total_candidates": t.total_candidates,
                "candidates_evaluated": t.candidates_evaluated,
                "early_exit": t.early_exit,
                "early_exit_query_index": t.early_exit_query_index,
                "match_found": t.match_found,
                "match_score": t.match_score,
                "queries": [
                    {
                        "query_text": q.query_text,
                        "execution_time": q.execution_time,
                        "network_time": q.network_time,
                        "parse_time": q.parse_time,
                        "candidates_found": q.candidates_found,
                        "cache_hit": q.cache_hit,
                        "query_type": q.query_type
                    }
                    for q in t.queries
                ]
            }
            for t in stats.track_metrics
        ],
        "aggregate_stats": {
            "average_time_per_track": stats.average_time_per_track(),
            "average_time_per_query": stats.average_time_per_query(),
            "cache_hit_rate": stats.cache_hit_rate(),
            "match_rate": stats.match_rate()
        }
    }
    
    # Calculate network time statistics
    total_network_time = sum(q.network_time for q in stats.query_metrics)
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
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)
    
    return filepath


def _calculate_network_time_by_type(query_metrics: List[QueryMetrics]) -> Dict[str, Dict[str, float]]:
    """Calculate network time statistics by query type"""
    from collections import defaultdict
    
    by_type = defaultdict(lambda: {"total_network_time": 0.0, "total_execution_time": 0.0, "count": 0})
    
    for query in query_metrics:
        qtype = query.query_type
        by_type[qtype]["total_network_time"] += query.network_time
        by_type[qtype]["total_execution_time"] += query.execution_time
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

**Create `SRC/performance_analyzer.py` (NEW):**

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
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def analyze_network_time_percentage(metrics: Dict[str, Any]) -> Tuple[float, str]:
    """
    Analyze network time percentage to determine if async I/O is needed.
    
    Args:
        metrics: Metrics dictionary from load_metrics_from_json()
    
    Returns:
        Tuple of (network_time_percentage, recommendation)
        Recommendation: "implement", "evaluate", or "skip"
    """
    network_analysis = metrics.get("network_analysis", {})
    network_percentage = network_analysis.get("network_time_percentage", 0.0)
    cache_hit_rate = metrics.get("aggregate_stats", {}).get("cache_hit_rate", 0.0)
    
    # Decision criteria
    if network_percentage > 40.0 and cache_hit_rate < 50.0:
        recommendation = "implement"
        reason = f"Network time is {network_percentage:.1f}% of total time and cache hit rate is {cache_hit_rate:.1f}%. Async I/O should provide significant benefit."
    elif network_percentage < 20.0 or cache_hit_rate > 80.0:
        recommendation = "skip"
        reason = f"Network time is {network_percentage:.1f}% of total time and cache hit rate is {cache_hit_rate:.1f}%. Async I/O unlikely to provide significant benefit."
    else:
        recommendation = "evaluate"
        reason = f"Network time is {network_percentage:.1f}% of total time and cache hit rate is {cache_hit_rate:.1f}%. Evaluate case-by-case based on other factors."
    
    return network_percentage, reason


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
        report_lines.append("")
    
    # Recommendation
    _, recommendation = analyze_network_time_percentage(metrics)
    report_lines.append("Recommendation:")
    report_lines.append(f"  {recommendation}")
    report_lines.append("")
    
    return "\n".join(report_lines)
```

**Implementation Checklist**:
- [ ] Add `export_performance_metrics_json()` function to `output_writer.py`
- [ ] Add network time analysis calculations
- [ ] Create `performance_analyzer.py` module
- [ ] Implement `load_metrics_from_json()` function
- [ ] Implement `analyze_network_time_percentage()` function
- [ ] Implement `generate_async_io_analysis_report()` function
- [ ] Test JSON export with sample metrics
- [ ] Test analysis functions
- [ ] Update GUI to include JSON export option in performance view

**Integration with Performance View**:
- [ ] Add "Export to JSON" button in performance view
- [ ] Call `export_performance_metrics_json()` when button clicked
- [ ] Show file path in status message

**Usage Example**:
```python
# After processing, export metrics
from output_writer import export_performance_metrics_json
from performance import performance_collector

stats = performance_collector.get_stats()
if stats:
    json_path = export_performance_metrics_json(stats, "playlist_analysis", "output")
    
    # Analyze for async I/O decision
    from performance_analyzer import load_metrics_from_json, analyze_network_time_percentage
    
    metrics = load_metrics_from_json(json_path)
    percentage, recommendation = analyze_network_time_percentage(metrics)
    print(f"Network time: {percentage:.1f}%")
    print(f"Recommendation: {recommendation}")
```

**Error Handling**:
- Handle JSON serialization errors
- Handle missing metrics fields gracefully
- Provide clear error messages

---

### Substep 6.1: Create Async Beatport Search Module (1-2 days)
**File**: `SRC/async_beatport_search.py` (NEW)

**What to implement:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Async Beatport Search Module

This module provides async/await versions of Beatport search functions
for improved performance in parallel processing scenarios.

IMPORTANT: Only use if Phase 3 metrics show network I/O is a bottleneck.
"""

import asyncio
import aiohttp
from typing import List, Optional, Dict
from urllib.parse import quote_plus
import time
from SRC.performance import performance_collector
from SRC.utils import retry_with_backoff

# Reuse existing parsing logic
from SRC.beatport_search import parse_track_urls, parse_track_data


async def async_track_urls(
    session: aiohttp.ClientSession,
    query: str,
    max_results: int = 50,
    timeout: float = 30.0
) -> List[str]:
    """
    Async version of track_urls - search Beatport and return track URLs.
    
    Args:
        session: aiohttp ClientSession
        query: Search query string
        max_results: Maximum number of results to return
        timeout: Request timeout in seconds
    
    Returns:
        List of track URLs
    
    Raises:
        asyncio.TimeoutError: If request times out
        aiohttp.ClientError: If request fails
    """
    query_start_time = time.time()
    
    # Build search URL
    encoded_query = quote_plus(query)
    url = f"https://www.beatport.com/search?q={encoded_query}"
    
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as response:
            if response.status != 200:
                return []
            
            html = await response.text()
            
            # Track network time
            network_time = time.time() - query_start_time
            
            # Parse HTML to extract track URLs (reuse existing parsing logic)
            urls = parse_track_urls(html, max_results)
            
            # Track query metrics (if performance tracking enabled)
            if hasattr(performance_collector, 'record_query'):
                performance_collector.record_query(
                    query_text=query,
                    execution_time=time.time() - query_start_time,
                    candidates_found=len(urls),
                    cache_hit=False,  # aiohttp doesn't support requests_cache directly
                    query_type="async_search",
                    network_time=network_time
                )
            
            return urls
            
    except (asyncio.TimeoutError, aiohttp.ClientError) as e:
        # Log error and return empty list
        # Track failed query
        if hasattr(performance_collector, 'record_query'):
            performance_collector.record_query(
                query_text=query,
                execution_time=time.time() - query_start_time,
                candidates_found=0,
                cache_hit=False,
                query_type="async_search",
                network_time=time.time() - query_start_time
            )
        return []


async def async_fetch_track_data(
    session: aiohttp.ClientSession,
    url: str,
    timeout: float = 30.0
) -> Optional[Dict]:
    """
    Async version of fetch_track_data - fetch track data from Beatport.
    
    Args:
        session: aiohttp ClientSession
        url: Track page URL
        timeout: Request timeout in seconds
    
    Returns:
        Track data dictionary or None if failed
    
    Raises:
        asyncio.TimeoutError: If request times out
        aiohttp.ClientError: If request fails
    """
    fetch_start_time = time.time()
    
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as response:
            if response.status != 200:
                return None
            
            html = await response.text()
            
            # Track network time
            network_time = time.time() - fetch_start_time
            
            # Parse HTML to extract track data (reuse existing parsing logic)
            track_data = parse_track_data(html)
            
            return track_data
            
    except (asyncio.TimeoutError, aiohttp.ClientError) as e:
        # Log error and return None
        return None


async def async_fetch_multiple_tracks(
    session: aiohttp.ClientSession,
    urls: List[str],
    max_concurrent: int = 10,
    timeout: float = 30.0
) -> List[Optional[Dict]]:
    """
    Fetch multiple track data URLs concurrently.
    
    Args:
        session: aiohttp ClientSession
        urls: List of track URLs to fetch
        max_concurrent: Maximum concurrent requests
        timeout: Request timeout in seconds
    
    Returns:
        List of track data dictionaries (None for failed requests)
    """
    # Create semaphore to limit concurrent requests
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def fetch_with_limit(url: str) -> Optional[Dict]:
        """Fetch with concurrency limit"""
        async with semaphore:
            return await async_fetch_track_data(session, url, timeout)
    
    # Fetch all tracks concurrently
    tasks = [fetch_with_limit(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out exceptions and return valid results
    valid_results = []
    for result in results:
        if isinstance(result, Exception):
            valid_results.append(None)
        else:
            valid_results.append(result)
    
    return valid_results
```

**Implementation Checklist**:
- [ ] Create `SRC/async_beatport_search.py` module
- [ ] Implement `async_track_urls` function
- [ ] Implement `async_fetch_track_data` function
- [ ] Implement `async_fetch_multiple_tracks` for concurrent fetching
- [ ] Add performance tracking integration
- [ ] Add error handling
- [ ] Add retry logic (if needed)
- [ ] Test with sample queries
- [ ] Test error conditions

**Error Handling**:
- Handle `asyncio.TimeoutError`
- Handle `aiohttp.ClientError`
- Handle network failures gracefully
- Track failed requests in performance metrics

---

### Substep 6.2: Create Async Matcher Function (1-2 days)
**File**: `SRC/matcher.py` (MODIFY)

**What to add:**

```python
import asyncio
import aiohttp
from async_beatport_search import async_track_urls, async_fetch_multiple_tracks

async def async_best_beatport_match(
    session: aiohttp.ClientSession,
    idx: int,
    track_title: str,
    track_artists_for_scoring: str,
    title_only_mode: bool,
    queries: List[str],
    input_year: Optional[int] = None,
    input_key: Optional[str] = None,
    input_mix: Optional[Dict[str, object]] = None,
    input_generic_phrases: Optional[List[str]] = None,
    max_concurrent: int = 10
) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate], List[Tuple[int, str, int, int]], int]:
    """
    Async version of best_beatport_match.
    
    Args:
        session: aiohttp ClientSession (must be provided by caller)
        idx: Track index
        track_title: Track title
        track_artists_for_scoring: Artists for scoring
        title_only_mode: Title-only search mode
        queries: List of search queries
        input_year: Optional year filter
        input_key: Optional key filter
        input_mix: Optional mix information
        input_generic_phrases: Optional generic phrases to remove
        max_concurrent: Maximum concurrent requests
    
    Returns:
        Tuple of (best_match, candidates_log, queries_audit, last_query_index)
    """
    from SRC.performance import performance_collector
    
    # Start track metrics
    track_id = f"track_{idx}"
    track_metrics = performance_collector.record_track_start(track_id, track_title)
    
    best: Optional[BeatportCandidate] = None
    candidates_log: List[BeatportCandidate] = []
    queries_audit: List[Tuple[int, str, int, int]] = []
    
    try:
        for query_idx, query in enumerate(queries):
            query_start_time = time.time()
            
            # Execute async search
            track_urls = await async_track_urls(session, query, max_results=50)
            
            if not track_urls:
                queries_audit.append((query_idx, query, 0, 0))
                continue
            
            # Fetch all track data concurrently
            track_data_list = await async_fetch_multiple_tracks(
                session, track_urls, max_concurrent=max_concurrent
            )
            
            # Process candidates (reuse existing scoring logic)
            for track_data in track_data_list:
                if not track_data:
                    continue
                
                candidate = _create_candidate_from_data(track_data)
                # ... existing scoring logic ...
                candidates_log.append(candidate)
                
                if not best or candidate.match_score > best.match_score:
                    best = candidate
            
            # Record query metrics
            query_duration = time.time() - query_start_time
            performance_collector.record_query(
                query_text=query,
                execution_time=query_duration,
                candidates_found=len(track_data_list),
                cache_hit=False,  # Async doesn't use cache yet
                query_type=_classify_query_type(query, query_idx, queries)
            )
            
            queries_audit.append((query_idx, query, len(track_data_list), len(candidates_log)))
            
            # Check for early exit
            if best and best.match_score >= 95:
                track_metrics.early_exit = True
                track_metrics.early_exit_query_index = query_idx
                break
        
        # Record track completion
        if best:
            track_metrics.match_found = True
            track_metrics.match_score = best.match_score
        
        performance_collector.record_track_complete(track_id, track_metrics)
        
        return best, candidates_log, queries_audit, query_idx
        
    except Exception as e:
        # Log error and return what we have
        track_metrics.match_found = False
        performance_collector.record_track_complete(track_id, track_metrics)
        raise
```

**Implementation Checklist**:
- [ ] Create `async_best_beatport_match` function
- [ ] Integrate with async search functions
- [ ] Reuse existing scoring logic
- [ ] Add performance tracking
- [ ] Add error handling
- [ ] Test with sample tracks
- [ ] Test early exit logic

---

### Substep 6.3: Add Async Wrapper in Processor (1 day)
**File**: `SRC/processor.py` (MODIFY)

**What to add:**

```python
import asyncio
import aiohttp
from typing import Optional, Dict, Any

def process_track_async(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent: int = 10
) -> TrackResult:
    """
    Process track using async I/O.
    
    Args:
        idx: Track index
        rb: Rekordbox track object
        settings: Processing settings
        max_concurrent: Maximum concurrent requests
    
    Returns:
        TrackResult object
    """
    # Generate queries (reuse existing logic)
    queries = generate_queries(rb, settings)
    
    # Create event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Create aiohttp session
        async with aiohttp.ClientSession() as session:
            # Run async matching
            best, candidates, queries_audit, last_query = loop.run_until_complete(
                async_best_beatport_match(
                    session,
                    idx, track_title, track_artists, title_only_mode,
                    queries, input_year, input_key, input_mix, input_generic_phrases,
                    max_concurrent=max_concurrent
                )
            )
        
        # Convert to TrackResult (reuse existing logic)
        track_result = _convert_to_track_result(
            idx, rb, best, candidates, queries_audit, last_query
        )
        
        return track_result
        
    finally:
        loop.close()


def process_playlist_async(
    playlist_path: str,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent_tracks: int = 5,
    max_concurrent_requests: int = 10
) -> List[TrackResult]:
    """
    Process playlist using async I/O with parallel track processing.
    
    Args:
        playlist_path: Path to playlist XML file
        settings: Processing settings
        max_concurrent_tracks: Maximum tracks to process concurrently
        max_concurrent_requests: Maximum requests per track
    
    Returns:
        List of TrackResult objects
    """
    # Parse playlist
    tracks = parse_playlist(playlist_path)
    
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Process tracks in parallel batches
        results = []
        
        for i in range(0, len(tracks), max_concurrent_tracks):
            batch = tracks[i:i + max_concurrent_tracks]
            
            # Process batch concurrently
            tasks = [
                process_track_async_async(idx, track, settings, max_concurrent_requests)
                for idx, track in enumerate(batch, start=i)
            ]
            
            batch_results = loop.run_until_complete(
                asyncio.gather(*tasks, return_exceptions=True)
            )
            
            # Handle results
            for result in batch_results:
                if isinstance(result, Exception):
                    # Create error result
                    results.append(create_error_result(result))
                else:
                    results.append(result)
        
        return results
        
    finally:
        loop.close()
```

**Implementation Checklist**:
- [ ] Add `process_track_async` function
- [ ] Add `process_playlist_async` function
- [ ] Add configuration option for async mode
- [ ] Add error handling
- [ ] Test with sample playlists
- [ ] Test error conditions

---

### Substep 6.4: Add Configuration and Mode Switching with UI Integration (1-2 days)
**Files**: `SRC/config.py` (MODIFY), `SRC/gui/config_panel.py` (MODIFY), `SRC/gui/main_window.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.3 (config panel exists), Substep 5.3 (async wrapper exists)

**What to implement - EXACT STRUCTURE:**

#### Part A: Configuration Module Updates

**In `SRC/config.py`:**

```python
# Async I/O Configuration
ASYNC_IO_ENABLED = False  # Default to sync mode (backward compatible)
ASYNC_MAX_CONCURRENT_TRACKS = 5  # Max tracks processed concurrently
ASYNC_MAX_CONCURRENT_REQUESTS = 10  # Max HTTP requests per track
ASYNC_REQUEST_TIMEOUT = 30  # Timeout in seconds for async requests
ASYNC_RETRY_ATTEMPTS = 3  # Number of retry attempts for failed requests

def get_async_config() -> Dict[str, Any]:
    """Get async I/O configuration"""
    return {
        "enabled": ASYNC_IO_ENABLED,
        "max_concurrent_tracks": ASYNC_MAX_CONCURRENT_TRACKS,
        "max_concurrent_requests": ASYNC_MAX_CONCURRENT_REQUESTS,
        "request_timeout": ASYNC_REQUEST_TIMEOUT,
        "retry_attempts": ASYNC_RETRY_ATTEMPTS
    }

def set_async_config(enabled: bool, max_tracks: int = 5, max_requests: int = 10):
    """Set async I/O configuration"""
    global ASYNC_IO_ENABLED, ASYNC_MAX_CONCURRENT_TRACKS, ASYNC_MAX_CONCURRENT_REQUESTS
    ASYNC_IO_ENABLED = enabled
    ASYNC_MAX_CONCURRENT_TRACKS = max_tracks
    ASYNC_MAX_CONCURRENT_REQUESTS = max_requests
```

#### Part B: GUI Configuration Panel Integration

**In `SRC/gui/config_panel.py`:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QCheckBox,
    QSpinBox, QLabel, QPushButton, QMessageBox
)
from PySide6.QtCore import Qt
from SRC.config import get_async_config, set_async_config

class ConfigPanel(QWidget):
    """Configuration panel with async I/O options"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        self.load_settings()
    
    def init_ui(self):
        """Initialize configuration UI"""
        layout = QVBoxLayout(self)
        
        # ... existing configuration groups ...
        
        # NEW: Async I/O Settings Group (in Advanced Settings)
        async_group = QGroupBox("Async I/O Settings (Advanced)")
        async_group.setCheckable(False)
        async_layout = QVBoxLayout()
        
        # Async I/O Enable Checkbox
        self.async_io_check = QCheckBox("Enable Async I/O for faster processing")
        self.async_io_check.setChecked(False)
        self.async_io_check.setToolTip(
            "Enable async I/O for parallel network requests.\n\n"
            "Benefits:\n"
            "- Faster processing for multiple tracks\n"
            "- Parallel network requests\n"
            "- Better resource utilization\n\n"
            "When to use:\n"
            "- Network I/O is a bottleneck (>40% of total time)\n"
            "- Processing multiple tracks (>10 tracks)\n"
            "- Good network connection\n\n"
            "Considerations:\n"
            "- May increase memory usage\n"
            "- Requires Python 3.7+\n"
            "- May be slower for single tracks"
        )
        async_layout.addWidget(self.async_io_check)
        
        # Async settings (enabled when checkbox is checked)
        self.async_settings_widget = QWidget()
        async_settings_layout = QVBoxLayout()
        async_settings_layout.setContentsMargins(20, 10, 10, 10)
        
        # Max concurrent tracks
        tracks_layout = QHBoxLayout()
        tracks_layout.addWidget(QLabel("Max Concurrent Tracks:"))
        self.async_max_tracks = QSpinBox()
        self.async_max_tracks.setMinimum(1)
        self.async_max_tracks.setMaximum(20)
        self.async_max_tracks.setValue(5)
        self.async_max_tracks.setToolTip(
            "Maximum number of tracks to process concurrently.\n"
            "Higher values = faster but more memory usage.\n"
            "Recommended: 3-10 for most systems."
        )
        tracks_layout.addWidget(self.async_max_tracks)
        tracks_layout.addStretch()
        async_settings_layout.addLayout(tracks_layout)
        
        # Max concurrent requests per track
        requests_layout = QHBoxLayout()
        requests_layout.addWidget(QLabel("Max Concurrent Requests per Track:"))
        self.async_max_requests = QSpinBox()
        self.async_max_requests.setMinimum(1)
        self.async_max_requests.setMaximum(20)
        self.async_max_requests.setValue(10)
        self.async_max_requests.setToolTip(
            "Maximum number of HTTP requests per track.\n"
            "Higher values = faster but more network load.\n"
            "Recommended: 5-15 for most cases."
        )
        requests_layout.addWidget(self.async_max_requests)
        requests_layout.addStretch()
        async_settings_layout.addLayout(requests_layout)
        
        # Performance recommendation label
        self.async_recommendation_label = QLabel("")
        self.async_recommendation_label.setWordWrap(True)
        self.async_recommendation_label.setStyleSheet("color: blue; font-style: italic;")
        async_settings_layout.addWidget(self.async_recommendation_label)
        
        # Info button
        info_button = QPushButton("ℹ️ When to Use Async I/O")
        info_button.setToolTip("Show information about async I/O")
        info_button.clicked.connect(self.show_async_info)
        async_settings_layout.addWidget(info_button)
        
        self.async_settings_widget.setLayout(async_settings_layout)
        self.async_settings_widget.setEnabled(False)  # Disabled by default
        
        async_layout.addWidget(self.async_settings_widget)
        async_group.setLayout(async_layout)
        
        # Add to Advanced Settings group (if it exists) or create new group
        # This should be added to the existing Advanced Settings section
        layout.addWidget(async_group)
        
        # Connect signals
        self.async_io_check.toggled.connect(self._on_async_io_toggled)
        self.async_max_tracks.valueChanged.connect(self._update_recommendation)
        self.async_max_requests.valueChanged.connect(self._update_recommendation)
    
    def _on_async_io_toggled(self, checked: bool):
        """Handle async I/O checkbox toggle"""
        self.async_settings_widget.setEnabled(checked)
        self._update_recommendation()
        
        if checked:
            # Show warning if Phase 3 metrics suggest it's not needed
            self._check_async_recommendation()
    
    def _check_async_recommendation(self):
        """Check if async I/O is recommended based on Phase 3 metrics"""
        from SRC.performance import performance_collector
        from SRC.performance_analyzer import analyze_network_time_percentage
        
        try:
            stats = performance_collector.get_stats()
            if stats and stats.query_metrics:
                # Try to analyze network time
                # This would require exported metrics JSON
                # For now, just show general recommendation
                pass
        except Exception:
            pass
    
    def _update_recommendation(self):
        """Update performance recommendation label"""
        if not self.async_io_check.isChecked():
            self.async_recommendation_label.setText("")
            return
        
        max_tracks = self.async_max_tracks.value()
        max_requests = self.async_max_requests.value()
        
        recommendation = (
            f"Recommended for processing {max_tracks}+ tracks. "
            f"Expected speedup: 30-60% for multi-track playlists. "
            f"Memory usage: ~{max_tracks * max_requests * 2}MB additional."
        )
        
        self.async_recommendation_label.setText(recommendation)
    
    def show_async_info(self):
        """Show information dialog about async I/O"""
        info_text = """
<h3>Async I/O Information</h3>

<p><b>What is Async I/O?</b></p>
<p>Async I/O allows the application to make multiple network requests simultaneously, 
instead of waiting for each request to complete before starting the next one.</p>

<p><b>When to Enable:</b></p>
<ul>
<li>Network I/O takes >40% of total processing time (check Phase 3 performance metrics)</li>
<li>Processing playlists with 10+ tracks</li>
<li>You have a stable, fast internet connection</li>
<li>You want faster processing and don't mind higher memory usage</li>
</ul>

<p><b>When NOT to Enable:</b></p>
<ul>
<li>Processing single tracks</li>
<li>Network I/O is not a bottleneck</li>
<li>You have limited memory</li>
<li>You have an unstable or slow internet connection</li>
</ul>

<p><b>Performance:</b></p>
<ul>
<li>Expected speedup: 30-60% for multi-track playlists</li>
<li>Memory usage: Increases with concurrent requests</li>
<li>CPU usage: Slightly higher due to parallel processing</li>
</ul>

<p><b>Configuration:</b></p>
<ul>
<li><b>Max Concurrent Tracks:</b> How many tracks to process at once (3-10 recommended)</li>
<li><b>Max Concurrent Requests:</b> How many HTTP requests per track (5-15 recommended)</li>
</ul>

<p><b>Note:</b> Async I/O is disabled by default. Enable it only if you've verified 
that network I/O is a bottleneck using Phase 3 performance metrics.</p>
"""
        
        msg = QMessageBox(self)
        msg.setWindowTitle("Async I/O Information")
        msg.setTextFormat(Qt.RichText)
        msg.setText(info_text)
        msg.setStandardButtons(QMessageBox.Ok)
        msg.exec()
    
    def get_settings(self) -> Dict[str, Any]:
        """Get all settings including async I/O"""
        settings = {
            # ... existing settings ...
            "async_io_enabled": self.async_io_check.isChecked(),
            "async_max_concurrent_tracks": self.async_max_tracks.value(),
            "async_max_concurrent_requests": self.async_max_requests.value(),
        }
        return settings
    
    def load_settings(self):
        """Load settings from config"""
        from SRC.config import get_async_config
        
        config = get_async_config()
        self.async_io_check.setChecked(config.get("enabled", False))
        self.async_max_tracks.setValue(config.get("max_concurrent_tracks", 5))
        self.async_max_requests.setValue(config.get("max_concurrent_requests", 10))
        
        # Update widget state
        self._on_async_io_toggled(self.async_io_check.isChecked())
    
    def save_settings(self):
        """Save settings to config"""
        from SRC.config import set_async_config
        
        set_async_config(
            enabled=self.async_io_check.isChecked(),
            max_tracks=self.async_max_tracks.value(),
            max_requests=self.async_max_requests.value()
        )
```

#### Part C: Main Window Integration

**In `SRC/gui/main_window.py`:**

```python
# In start_processing method, check async I/O setting:

def start_processing(self):
    """Start processing with async I/O support"""
    settings = self.config_panel.get_settings()
    
    # Check if async I/O is enabled
    use_async = settings.get("async_io_enabled", False)
    
    if use_async:
        # Show info message about async mode
        QMessageBox.information(
            self,
            "Async I/O Enabled",
            "Processing will use async I/O for faster performance.\n\n"
            "This may increase memory usage but should significantly "
            "reduce processing time for multiple tracks."
        )
    
    # Pass async setting to processor
    # The processor will use async mode if enabled
    self.controller.start_processing(
        xml_path=self.xml_path,
        settings=settings
    )
```

**Implementation Checklist**:
- [ ] Add async I/O configuration to config.py
- [ ] Add async I/O settings group to config panel
- [ ] Add enable checkbox with tooltip
- [ ] Add concurrent tracks/requests spinboxes
- [ ] Add recommendation label
- [ ] Add info dialog button
- [ ] Connect signals for dynamic updates
- [ ] Integrate into main window processing
- [ ] Add settings loading/saving
- [ ] Test configuration persistence
- [ ] Test UI interactions
- [ ] Test mode switching

---

### Substep 6.5: Comprehensive Testing and Performance Validation (2-3 days)

**Dependencies**: All previous substeps must be completed

**Testing Requirements**:
- [ ] Unit tests for all async functions
- [ ] Integration tests for async workflow
- [ ] Performance tests comparing sync vs async
- [ ] GUI tests for configuration UI
- [ ] Error handling tests
- [ ] Memory usage tests
- [ ] Manual testing checklist completion

**Acceptance Criteria**:
- ✅ Async functions implemented and working
- ✅ Concurrent fetching works correctly
- ✅ Performance improvement measurable (30%+)
- ✅ Backward compatibility maintained (sync default)
- ✅ Error handling robust
- ✅ Can switch between sync/async modes
- ✅ Phase 3 metrics show improvement
- ✅ UI is intuitive and helpful
- ✅ All tests passing
- ✅ Manual testing complete

---

## Testing Requirements

### Unit Tests
- [ ] Test all async functions
- [ ] Test error handling
- [ ] Test concurrent request limiting
- [ ] Test timeout handling
- [ ] Minimum 80% code coverage

### Performance Tests
- [ ] Compare sync vs async (must show 30%+ improvement)
- [ ] Test with various dataset sizes
- [ ] Measure memory usage
- [ ] Validate Phase 3 metrics

### Integration Tests
- [ ] Test async mode in full pipeline
- [ ] Test mode switching
- [ ] Test backward compatibility
- [ ] Test with real-world data

---

## Error Handling

### Error Scenarios
1. **Network Errors**
   - Timeout → Retry with exponential backoff
   - Connection error → Log and continue with other requests
   - Rate limiting → Implement rate limiting logic

2. **Async Context Errors**
   - Event loop errors → Proper cleanup
   - Session errors → Proper session management
   - Task cancellation → Handle gracefully

3. **Performance Issues**
   - Too many concurrent requests → Limit with semaphore
   - Memory issues → Reduce concurrency
   - CPU overload → Reduce parallelism

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Sync functions remain available
- [ ] Default mode is sync (backward compatible)
- [ ] Existing code continues to work
- [ ] No breaking changes to APIs

### Migration Path
- Async mode is opt-in (disabled by default)
- Users can enable via settings
- No automatic migration needed

---

## Documentation Requirements

### User Guide Updates
- [ ] Document async I/O option
- [ ] Explain when to use async mode
- [ ] Explain performance benefits
- [ ] Document configuration options

### API Documentation
- [ ] Document async functions
- [ ] Document parameters
- [ ] Document error conditions
- [ ] Document performance characteristics

---

## Phase 3 Integration

### Performance Metrics
- [ ] Compare sync vs async metrics
- [ ] Track async operation times
- [ ] Track concurrent request counts
- [ ] Validate performance improvements

### Performance Reports
- [ ] Include async vs sync comparison
- [ ] Show performance improvement percentage
- [ ] Include concurrency statistics

---

## Acceptance Criteria
- ✅ Async functions implemented
- ✅ Concurrent fetching works correctly
- ✅ Performance improvement measurable (30%+)
- ✅ Backward compatibility maintained
- ✅ Error handling robust
- ✅ Can switch between sync/async modes
- ✅ Phase 3 metrics show improvement
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 6.0: Add JSON Export for Performance Metrics
- [ ] Substep 6.1: Create Async Beatport Search Module
- [ ] Substep 6.2: Create Async Matcher Function
- [ ] Substep 6.3: Add Async Wrapper in Processor
- [ ] Substep 6.4: Add Configuration and Mode Switching
- [ ] Substep 6.5: Testing and Performance Validation
- [ ] Documentation updated
- [ ] All tests passing

---

**IMPORTANT**: Only implement this phase if Phase 3 metrics show network I/O is a significant bottleneck (>40% of total time). Otherwise, skip to other phases.

**Next Step**: After evaluation, proceed to other phases based on priority. See Phase 4 or Phase 7 for available options.

