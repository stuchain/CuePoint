# Step 5.2: Create Async Matcher Function

**Status**: 📝 Planned  
**Priority**: 🚀 Medium (Only if Step 5.0 recommends implementation)  
**Estimated Duration**: 1-2 days  
**Dependencies**: Step 5.1 (async_beatport_search module), Phase 0 (matcher.py exists)

---

## Goal

Create async version of the matcher function that uses async search functions. This function coordinates async search queries and candidate evaluation.

---

## Success Criteria

- [ ] `async_best_beatport_match()` function implemented
- [ ] Integrates with async search functions
- [ ] Reuses existing scoring logic
- [ ] Performance tracking integrated
- [ ] Error handling robust
- [ ] Early exit logic works
- [ ] All tests passing
- [ ] Documentation complete

---

## Implementation Details

### Part A: Add Async Matcher Function to `matcher.py`

**File**: `SRC/matcher.py` (MODIFY)

**Location**: Add after existing `best_beatport_match()` function

**Function Signature**:
```python
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
```

**Complete Implementation**:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Add this function to SRC/matcher.py
Place it after the existing best_beatport_match() function
"""

import asyncio
import aiohttp
from typing import List, Optional, Dict, Any, Tuple
import time
import logging

# Import async search functions
from async_beatport_search import async_track_urls, async_fetch_multiple_tracks

# Import existing scoring logic
from matcher import (
    score_candidate,  # Reuse existing scoring function
    BeatportCandidate,  # Reuse existing candidate class
    _create_candidate_from_data  # Helper function if exists
)

# Import performance tracking
try:
    from performance import performance_collector
    PERFORMANCE_AVAILABLE = True
except ImportError:
    PERFORMANCE_AVAILABLE = False
    performance_collector = None

logger = logging.getLogger(__name__)


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
    
    This function performs async searches for multiple queries, fetches track data
    concurrently, and evaluates candidates using existing scoring logic.
    
    Args:
        session: aiohttp ClientSession (must be provided by caller)
        idx: Track index in playlist
        track_title: Track title from Rekordbox
        track_artists_for_scoring: Artists string for scoring
        title_only_mode: If True, only use title for matching
        queries: List of search queries to try
        input_year: Optional year filter
        input_key: Optional key filter
        input_mix: Optional mix information
        input_generic_phrases: Optional generic phrases to remove
        max_concurrent: Maximum concurrent requests per query
    
    Returns:
        Tuple of:
        - best_match: Best BeatportCandidate or None
        - candidates_log: List of all candidates found
        - queries_audit: List of (query_idx, query, candidates_found, total_candidates)
        - last_query_index: Index of last query executed
    
    Raises:
        Exception: If critical error occurs (logged and re-raised)
    """
    # Start track metrics
    track_id = f"track_{idx}"
    track_start_time = time.time()
    
    if PERFORMANCE_AVAILABLE and hasattr(performance_collector, 'record_track_start'):
        track_metrics = performance_collector.record_track_start(track_id, track_title)
    else:
        track_metrics = None
    
    best: Optional[BeatportCandidate] = None
    candidates_log: List[BeatportCandidate] = []
    queries_audit: List[Tuple[int, str, int, int]] = []
    last_query_index = -1
    
    try:
        # Process queries sequentially (but fetch candidates concurrently within each query)
        for query_idx, query in enumerate(queries):
            query_start_time = time.time()
            last_query_index = query_idx
            
            logger.debug(f"Track {idx}, Query {query_idx}: {query}")
            
            try:
                # Execute async search
                track_urls = await async_track_urls(
                    session,
                    query,
                    max_results=50,
                    timeout=30.0
                )
                
                if not track_urls:
                    queries_audit.append((query_idx, query, 0, len(candidates_log)))
                    logger.debug(f"Track {idx}, Query {query_idx}: No URLs found")
                    continue
                
                # Fetch all track data concurrently
                track_data_list = await async_fetch_multiple_tracks(
                    session,
                    track_urls,
                    max_concurrent=max_concurrent,
                    timeout=30.0
                )
                
                # Process candidates (reuse existing scoring logic)
                query_candidates = []
                for track_data in track_data_list:
                    if not track_data:
                        continue
                    
                    # Create candidate from track data
                    # Reuse existing logic from best_beatport_match()
                    candidate = _create_candidate_from_track_data(
                        track_data,
                        track_title,
                        track_artists_for_scoring,
                        title_only_mode,
                        input_year,
                        input_key,
                        input_mix,
                        input_generic_phrases
                    )
                    
                    if candidate:
                        # Score candidate (reuse existing scoring logic)
                        score = score_candidate(
                            candidate,
                            track_title,
                            track_artists_for_scoring,
                            title_only_mode,
                            input_year,
                            input_key,
                            input_mix
                        )
                        candidate.match_score = score
                        
                        candidates_log.append(candidate)
                        query_candidates.append(candidate)
                        
                        # Update best match
                        if not best or candidate.match_score > best.match_score:
                            best = candidate
                
                # Record query metrics
                query_duration = time.time() - query_start_time
                if PERFORMANCE_AVAILABLE and hasattr(performance_collector, 'record_query'):
                    performance_collector.record_query(
                        query_text=query,
                        execution_time=query_duration,
                        candidates_found=len(query_candidates),
                        cache_hit=False,  # Async doesn't use cache yet
                        query_type=_classify_query_type(query, query_idx, queries),
                        network_time=query_duration  # Approximate (includes parsing)
                    )
                
                queries_audit.append((query_idx, query, len(query_candidates), len(candidates_log)))
                
                # Check for early exit (high confidence match)
                if best and best.match_score >= 95:
                    if track_metrics:
                        track_metrics.early_exit = True
                        track_metrics.early_exit_query_index = query_idx
                    logger.info(f"Track {idx}: Early exit at query {query_idx} with score {best.match_score:.1f}")
                    break
                    
            except Exception as e:
                logger.error(f"Track {idx}, Query {query_idx} error: {e}")
                queries_audit.append((query_idx, query, 0, len(candidates_log)))
                # Continue with next query
                continue
        
        # Record track completion
        track_duration = time.time() - track_start_time
        if track_metrics:
            track_metrics.match_found = best is not None
            if best:
                track_metrics.match_score = best.match_score
            track_metrics.total_time = track_duration
            track_metrics.total_queries = len(queries_audit)
            track_metrics.total_candidates = len(candidates_log)
            
            if PERFORMANCE_AVAILABLE and hasattr(performance_collector, 'record_track_complete'):
                performance_collector.record_track_complete(track_id, track_metrics)
        
        return best, candidates_log, queries_audit, last_query_index
        
    except Exception as e:
        logger.error(f"Track {idx} critical error: {e}", exc_info=True)
        if track_metrics:
            track_metrics.match_found = False
            if PERFORMANCE_AVAILABLE and hasattr(performance_collector, 'record_track_complete'):
                performance_collector.record_track_complete(track_id, track_metrics)
        raise


def _create_candidate_from_track_data(
    track_data: Dict[str, Any],
    track_title: str,
    track_artists_for_scoring: str,
    title_only_mode: bool,
    input_year: Optional[int],
    input_key: Optional[str],
    input_mix: Optional[Dict],
    input_generic_phrases: Optional[List[str]]
) -> Optional[BeatportCandidate]:
    """
    Create BeatportCandidate from track data dictionary.
    
    Reuses logic from existing best_beatport_match() function.
    """
    # Extract data from track_data dict
    beatport_title = track_data.get('beatport_title', '')
    beatport_artists = track_data.get('beatport_artists', '')
    beatport_url = track_data.get('beatport_url', '')
    beatport_key = track_data.get('beatport_key', '')
    beatport_bpm = track_data.get('beatport_bpm', '')
    beatport_year = track_data.get('beatport_year', '')
    beatport_label = track_data.get('beatport_label', '')
    beatport_genres = track_data.get('beatport_genres', '')
    beatport_release = track_data.get('beatport_release', '')
    beatport_release_date = track_data.get('beatport_release_date', '')
    
    # Create candidate (reuse existing candidate creation logic)
    # This should match the logic in best_beatport_match()
    candidate = BeatportCandidate(
        beatport_title=beatport_title,
        beatport_artists=beatport_artists,
        beatport_url=beatport_url,
        beatport_key=beatport_key,
        beatport_bpm=beatport_bpm,
        beatport_year=beatport_year,
        beatport_label=beatport_label,
        beatport_genres=beatport_genres,
        beatport_release=beatport_release,
        beatport_release_date=beatport_release_date
    )
    
    return candidate


def _classify_query_type(query: str, query_idx: int, all_queries: List[str]) -> str:
    """
    Classify query type for performance tracking.
    
    Returns: "initial", "fallback", "title_only", etc.
    """
    if query_idx == 0:
        return "initial"
    elif "title" in query.lower() and "artist" not in query.lower():
        return "title_only"
    else:
        return "fallback"
```

---

## Implementation Checklist

- [ ] Add `async_best_beatport_match()` function to `matcher.py`
- [ ] Add `_create_candidate_from_track_data()` helper function
- [ ] Add `_classify_query_type()` helper function
- [ ] Import async search functions
- [ ] Reuse existing scoring logic
- [ ] Integrate performance tracking
- [ ] Add error handling
- [ ] Add early exit logic
- [ ] Add logging
- [ ] Test with sample tracks
- [ ] Test error conditions
- [ ] Test early exit
- [ ] Verify scoring matches sync version
- [ ] Verify performance tracking works

---

## Integration Points

### With Async Search Module

```python
# Uses functions from async_beatport_search:
# - async_track_urls() for searching
# - async_fetch_multiple_tracks() for concurrent fetching
```

### With Existing Matcher Logic

```python
# Reuses existing functions:
# - score_candidate() for scoring
# - BeatportCandidate class
# - All scoring parameters and logic
```

### With Performance Tracking

```python
# Integrates with performance module:
# - record_track_start()
# - record_query()
# - record_track_complete()
```

---

## Testing Requirements

### Unit Tests

```python
# Test async matcher function
async def test_async_best_beatport_match():
    async with aiohttp.ClientSession() as session:
        best, candidates, audit, last_idx = await async_best_beatport_match(
            session,
            idx=1,
            track_title="Test Track",
            track_artists_for_scoring="Test Artist",
            title_only_mode=False,
            queries=["Test Track Test Artist"]
        )
        assert isinstance(candidates, list)
        # Verify scoring works
```

### Integration Tests

```python
# Test full matching workflow
async def test_async_matching_workflow():
    # Test with real track data
    # Verify results match sync version
    # Verify performance improvements
```

---

## Acceptance Criteria

- ✅ Async matcher function implemented
- ✅ Integrates with async search functions
- ✅ Reuses existing scoring logic
- ✅ Performance tracking works
- ✅ Error handling robust
- ✅ Early exit logic works
- ✅ Results match sync version
- ✅ All tests passing

---

## Next Steps

After completing this step:

1. **Test thoroughly** with real tracks
2. **Compare results** with sync version
3. **Proceed to Step 5.3** to add processor wrapper

---

**This step creates the async matching logic that coordinates searches and candidate evaluation.**

