# Step 5.3: Add Async Wrapper in Processor

**Status**: 📝 Planned  
**Priority**: 🚀 Medium (Only if Step 5.0 recommends implementation)  
**Estimated Duration**: 1 day  
**Dependencies**: Step 5.2 (async matcher), Phase 0 (processor.py exists)

---

## Goal

Add async wrapper functions in processor to enable async processing mode. These functions bridge the async matcher with the existing processor interface.

---

## Success Criteria

- [ ] `process_track_async()` function implemented
- [ ] `process_playlist_async()` function implemented
- [ ] Event loop management works correctly
- [ ] Session management works correctly
- [ ] Error handling robust
- [ ] Backward compatibility maintained
- [ ] All tests passing
- [ ] Documentation complete

---

## Implementation Details

### Part A: Add Async Track Processing Function

**File**: `SRC/processor.py` (MODIFY)

**Location**: Add after existing `process_track()` function

**Function Signature**:
```python
def process_track_async(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent: int = 10
) -> TrackResult:
```

**Complete Implementation**:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Add these functions to SRC/processor.py
Place them after the existing process_track() function
"""

import asyncio
import aiohttp
from typing import List, Optional, Dict, Any
import logging

# Import async matcher
from matcher import async_best_beatport_match

# Import existing processor functions
from processor import (
    generate_queries,  # Reuse query generation
    _convert_to_track_result  # Helper to convert to TrackResult
)

# Import data structures
from gui_interface import TrackResult
from rekordbox import RBTrack

logger = logging.getLogger(__name__)


async def _process_track_async_coro(
    session: aiohttp.ClientSession,
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent: int = 10
) -> TrackResult:
    """
    Async coroutine for processing a single track.
    
    This is the actual async implementation called by process_track_async().
    
    Args:
        session: aiohttp ClientSession
        idx: Track index
        rb: Rekordbox track object
        settings: Processing settings
        max_concurrent: Maximum concurrent requests
    
    Returns:
        TrackResult object
    """
    # Generate queries (reuse existing logic)
    queries = generate_queries(rb, settings)
    
    # Extract track information
    track_title = rb.title
    track_artists = rb.artists or ""
    title_only_mode = settings.get("title_only_mode", False) if settings else False
    
    # Extract optional filters
    input_year = getattr(rb, 'year', None)
    input_key = getattr(rb, 'key', None)
    input_mix = getattr(rb, 'mix', None) if hasattr(rb, 'mix') else None
    input_generic_phrases = settings.get("generic_phrases", None) if settings else None
    
    # Run async matching
    best, candidates, queries_audit, last_query = await async_best_beatport_match(
        session,
        idx=idx,
        track_title=track_title,
        track_artists_for_scoring=track_artists,
        title_only_mode=title_only_mode,
        queries=queries,
        input_year=input_year,
        input_key=input_key,
        input_mix=input_mix,
        input_generic_phrases=input_generic_phrases,
        max_concurrent=max_concurrent
    )
    
    # Convert to TrackResult (reuse existing logic)
    track_result = _convert_to_track_result(
        idx=idx,
        rb=rb,
        best=best,
        candidates=candidates,
        queries_audit=queries_audit,
        last_query=last_query
    )
    
    return track_result


def process_track_async(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent: int = 10
) -> TrackResult:
    """
    Process track using async I/O.
    
    This function creates an event loop, manages aiohttp session,
    and calls the async matcher function.
    
    Args:
        idx: Track index in playlist
        rb: Rekordbox track object
        settings: Processing settings dictionary
        max_concurrent: Maximum concurrent requests per track
    
    Returns:
        TrackResult object
    
    Raises:
        Exception: If processing fails
    """
    # Create new event loop for this thread
    # (Important: Each thread needs its own event loop)
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    try:
        # Create aiohttp session
        async def run_with_session():
            async with aiohttp.ClientSession() as session:
                return await _process_track_async_coro(
                    session,
                    idx,
                    rb,
                    settings,
                    max_concurrent
                )
        
        # Run async function
        track_result = loop.run_until_complete(run_with_session())
        return track_result
        
    except Exception as e:
        logger.error(f"Error processing track {idx} async: {e}", exc_info=True)
        # Return error result
        return _create_error_track_result(idx, rb, str(e))
    finally:
        # Clean up event loop (don't close if it was existing)
        pass


def process_playlist_async(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent_tracks: int = 5,
    max_concurrent_requests: int = 10
) -> List[TrackResult]:
    """
    Process playlist using async I/O with parallel track processing.
    
    This function processes multiple tracks concurrently, with each track
    making multiple concurrent requests.
    
    Args:
        xml_path: Path to Rekordbox XML file
        playlist_name: Name of playlist to process
        settings: Processing settings dictionary
        max_concurrent_tracks: Maximum tracks to process concurrently
        max_concurrent_requests: Maximum requests per track
    
    Returns:
        List of TrackResult objects
    """
    # Parse playlist (reuse existing logic)
    from rekordbox import parse_playlist
    tracks = parse_playlist(xml_path, playlist_name)
    
    if not tracks:
        logger.warning(f"No tracks found in playlist: {playlist_name}")
        return []
    
    # Create event loop
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    try:
        # Process tracks in parallel batches
        results = []
        
        # Create aiohttp session for all tracks
        async def process_all_tracks():
            async with aiohttp.ClientSession() as session:
                # Process in batches to limit concurrency
                for i in range(0, len(tracks), max_concurrent_tracks):
                    batch = tracks[i:i + max_concurrent_tracks]
                    batch_indices = list(range(i, i + len(batch)))
                    
                    # Create tasks for batch
                    tasks = []
                    for track_idx, track in zip(batch_indices, batch):
                        task = _process_track_async_coro(
                            session,
                            track_idx,
                            track,
                            settings,
                            max_concurrent_requests
                        )
                        tasks.append(task)
                    
                    # Process batch concurrently
                    batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Handle results
                    for result in batch_results:
                        if isinstance(result, Exception):
                            logger.error(f"Error in batch processing: {result}")
                            # Create error result
                            error_result = _create_error_track_result(
                                len(results),
                                None,
                                str(result)
                            )
                            results.append(error_result)
                        else:
                            results.append(result)
                
                return results
        
        # Run async processing
        results = loop.run_until_complete(process_all_tracks())
        return results
        
    except Exception as e:
        logger.error(f"Error processing playlist async: {e}", exc_info=True)
        # Return partial results if available
        return results if 'results' in locals() else []
    finally:
        # Clean up
        pass


def _convert_to_track_result(
    idx: int,
    rb: RBTrack,
    best: Optional[BeatportCandidate],
    candidates: List[BeatportCandidate],
    queries_audit: List[Tuple[int, str, int, int]],
    last_query: int
) -> TrackResult:
    """
    Convert matcher results to TrackResult.
    
    Reuses existing logic from process_track().
    """
    from gui_interface import TrackResult
    
    # Build candidates list for TrackResult
    candidates_list = []
    for candidate in candidates:
        candidates_list.append({
            'beatport_title': candidate.beatport_title,
            'beatport_artists': candidate.beatport_artists,
            'beatport_url': candidate.beatport_url,
            'match_score': candidate.match_score,
            'beatport_key': candidate.beatport_key,
            'beatport_bpm': candidate.beatport_bpm,
            'beatport_year': candidate.beatport_year,
            # ... other fields
        })
    
    # Create TrackResult
    if best:
        track_result = TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=True,
            beatport_title=best.beatport_title,
            beatport_artists=best.beatport_artists,
            beatport_url=best.beatport_url,
            match_score=best.match_score,
            beatport_key=best.beatport_key,
            beatport_bpm=best.beatport_bpm,
            beatport_year=best.beatport_year,
            candidates=candidates_list
        )
    else:
        track_result = TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False,
            candidates=candidates_list
        )
    
    return track_result


def _create_error_track_result(
    idx: int,
    rb: Optional[RBTrack],
    error_message: str
) -> TrackResult:
    """Create TrackResult for error case"""
    from gui_interface import TrackResult
    
    return TrackResult(
        playlist_index=idx,
        title=rb.title if rb else "Unknown",
        artist=rb.artists if rb else "",
        matched=False,
        # Error information could be stored in a field if TrackResult supports it
    )
```

---

## Implementation Checklist

- [ ] Add `_process_track_async_coro()` async coroutine
- [ ] Add `process_track_async()` wrapper function
- [ ] Add `process_playlist_async()` function
- [ ] Add `_convert_to_track_result()` helper
- [ ] Add `_create_error_track_result()` helper
- [ ] Handle event loop creation/management
- [ ] Handle session management
- [ ] Add error handling
- [ ] Add logging
- [ ] Test with single track
- [ ] Test with playlist
- [ ] Test error conditions
- [ ] Verify results match sync version

---

## Event Loop Management

### Single Track Processing

```python
# Each call creates its own event loop
# This is safe for threading
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
try:
    result = loop.run_until_complete(async_function())
finally:
    # Don't close if it was existing loop
    pass
```

### Playlist Processing

```python
# One event loop for entire playlist
# All tracks share the same session
async with aiohttp.ClientSession() as session:
    # Process all tracks with shared session
    results = await asyncio.gather(*tasks)
```

---

## Testing Requirements

### Unit Tests

```python
# Test single track processing
def test_process_track_async():
    rb_track = create_sample_rbtrack()
    result = process_track_async(1, rb_track)
    assert isinstance(result, TrackResult)

# Test playlist processing
def test_process_playlist_async():
    results = process_playlist_async("test.xml", "Test Playlist")
    assert isinstance(results, list)
    assert all(isinstance(r, TrackResult) for r in results)
```

---

## Acceptance Criteria

- ✅ Async processing functions implemented
- ✅ Event loop management works
- ✅ Session management works
- ✅ Error handling robust
- ✅ Results match sync version
- ✅ All tests passing

---

## Next Steps

After completing this step:

1. **Test thoroughly** with real playlists
2. **Compare performance** with sync version
3. **Proceed to Step 5.4** to add UI configuration

---

**This step bridges async matcher with processor interface.**

