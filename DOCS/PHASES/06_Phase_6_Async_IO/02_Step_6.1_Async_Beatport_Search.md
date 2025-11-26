# Step 6.1: Create Async Beatport Search Module

**Status**: 📝 Planned  
**Priority**: 🚀 Medium (Only if Step 6.0 recommends implementation)  
**Estimated Duration**: 1-2 days  
**Dependencies**: Step 6.0 (metrics analysis), Phase 0 (beatport_search module exists)

---

## Goal

Create async/await versions of Beatport search functions for improved performance in parallel processing scenarios. This module provides the foundation for async I/O operations.

---

## Success Criteria

- [ ] `async_beatport_search.py` module created
- [ ] `async_track_urls()` function implemented
- [ ] `async_fetch_track_data()` function implemented
- [ ] `async_fetch_multiple_tracks()` function implemented
- [ ] Performance tracking integrated
- [ ] Error handling robust
- [ ] Concurrency limiting works correctly
- [ ] All functions tested
- [ ] Documentation complete

---

## Prerequisites

**BEFORE starting this step:**
1. ✅ Step 6.0 completed
2. ✅ Metrics analysis shows network I/O >40% of total time
3. ✅ Decision made to implement async I/O
4. ✅ `beatport_search.py` module exists and is working
5. ✅ Python 3.7+ (for async/await support)
6. ✅ `aiohttp` library available (install: `pip install aiohttp`)

---

## Implementation Details

### Part A: Create Module File

**File**: `SRC/async_beatport_search.py` (NEW)

**Complete File Structure**:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Async Beatport Search Module

This module provides async/await versions of Beatport search functions
for improved performance in parallel processing scenarios.

IMPORTANT: Only use if Phase 3 metrics show network I/O is a bottleneck.

Dependencies:
- aiohttp: Async HTTP client library
- beatport_search: Existing sync search functions (for parsing logic)
- performance: Performance tracking module
"""

import asyncio
import aiohttp
from typing import List, Optional, Dict, Any
from urllib.parse import quote_plus
import time
import logging

# Import existing parsing functions (reuse logic)
from beatport_search import parse_track_urls, parse_track_data

# Import performance tracking
try:
    from performance import performance_collector
    PERFORMANCE_AVAILABLE = True
except ImportError:
    PERFORMANCE_AVAILABLE = False
    performance_collector = None

# Setup logging
logger = logging.getLogger(__name__)


async def async_track_urls(
    session: aiohttp.ClientSession,
    query: str,
    max_results: int = 50,
    timeout: float = 30.0,
    retry_attempts: int = 3
) -> List[str]:
    """
    Async version of track_urls - search Beatport and return track URLs.
    
    This function performs an async HTTP GET request to Beatport search,
    parses the HTML response, and returns a list of track URLs.
    
    Args:
        session: aiohttp ClientSession (must be provided by caller)
        query: Search query string (e.g., "Artist - Title")
        max_results: Maximum number of results to return (default: 50)
        timeout: Request timeout in seconds (default: 30.0)
        retry_attempts: Number of retry attempts on failure (default: 3)
    
    Returns:
        List of track URLs (strings)
    
    Raises:
        asyncio.TimeoutError: If request times out after all retries
        aiohttp.ClientError: If request fails after all retries
    
    Example:
        async with aiohttp.ClientSession() as session:
            urls = await async_track_urls(session, "Daft Punk - One More Time")
            print(f"Found {len(urls)} tracks")
    """
    query_start_time = time.time()
    query_encoded = quote_plus(query)
    url = f"https://www.beatport.com/search?q={query_encoded}"
    
    # Retry logic
    last_exception = None
    for attempt in range(retry_attempts):
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as response:
                # Check status code
                if response.status != 200:
                    logger.warning(f"Beatport search returned status {response.status} for query: {query}")
                    if attempt < retry_attempts - 1:
                        await asyncio.sleep(2 ** attempt)  # Exponential backoff
                        continue
                    return []
                
                # Read HTML content
                html = await response.text()
                
                # Track network time
                network_time = time.time() - query_start_time
                
                # Parse HTML to extract track URLs (reuse existing parsing logic)
                urls = parse_track_urls(html, max_results)
                
                # Track query metrics (if performance tracking enabled)
                if PERFORMANCE_AVAILABLE and hasattr(performance_collector, 'record_query'):
                    execution_time = time.time() - query_start_time
                    performance_collector.record_query(
                        query_text=query,
                        execution_time=execution_time,
                        candidates_found=len(urls),
                        cache_hit=False,  # aiohttp doesn't support requests_cache directly
                        query_type="async_search",
                        network_time=network_time
                    )
                
                logger.debug(f"Found {len(urls)} tracks for query: {query}")
                return urls
                
        except asyncio.TimeoutError as e:
            last_exception = e
            logger.warning(f"Timeout on attempt {attempt + 1}/{retry_attempts} for query: {query}")
            if attempt < retry_attempts - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            # Track failed query
            if PERFORMANCE_AVAILABLE and hasattr(performance_collector, 'record_query'):
                execution_time = time.time() - query_start_time
                performance_collector.record_query(
                    query_text=query,
                    execution_time=execution_time,
                    candidates_found=0,
                    cache_hit=False,
                    query_type="async_search",
                    network_time=execution_time
                )
            raise
            
        except aiohttp.ClientError as e:
            last_exception = e
            logger.warning(f"Client error on attempt {attempt + 1}/{retry_attempts} for query: {query}: {e}")
            if attempt < retry_attempts - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            # Track failed query
            if PERFORMANCE_AVAILABLE and hasattr(performance_collector, 'record_query'):
                execution_time = time.time() - query_start_time
                performance_collector.record_query(
                    query_text=query,
                    execution_time=execution_time,
                    candidates_found=0,
                    cache_hit=False,
                    query_type="async_search",
                    network_time=execution_time
                )
            raise
    
    # Should not reach here, but handle just in case
    if last_exception:
        raise last_exception
    return []


async def async_fetch_track_data(
    session: aiohttp.ClientSession,
    url: str,
    timeout: float = 30.0,
    retry_attempts: int = 3
) -> Optional[Dict[str, Any]]:
    """
    Async version of fetch_track_data - fetch track data from Beatport.
    
    This function performs an async HTTP GET request to a Beatport track page,
    parses the HTML response, and returns track data as a dictionary.
    
    Args:
        session: aiohttp ClientSession (must be provided by caller)
        url: Track page URL (e.g., "https://www.beatport.com/track/...")
        timeout: Request timeout in seconds (default: 30.0)
        retry_attempts: Number of retry attempts on failure (default: 3)
    
    Returns:
        Track data dictionary with keys:
        - beatport_title: Track title
        - beatport_artists: Artist names
        - beatport_url: Track URL
        - beatport_key: Musical key
        - beatport_bpm: BPM
        - beatport_year: Release year
        - beatport_label: Record label
        - beatport_genres: Genres
        - beatport_release: Release name
        - beatport_release_date: Release date
        Or None if fetch failed
    
    Raises:
        asyncio.TimeoutError: If request times out after all retries
        aiohttp.ClientError: If request fails after all retries
    
    Example:
        async with aiohttp.ClientSession() as session:
            track_data = await async_fetch_track_data(
                session,
                "https://www.beatport.com/track/one-more-time/12345"
            )
            if track_data:
                print(f"Title: {track_data['beatport_title']}")
    """
    fetch_start_time = time.time()
    
    # Retry logic
    last_exception = None
    for attempt in range(retry_attempts):
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as response:
                # Check status code
                if response.status != 200:
                    logger.warning(f"Beatport track page returned status {response.status} for URL: {url}")
                    if attempt < retry_attempts - 1:
                        await asyncio.sleep(2 ** attempt)  # Exponential backoff
                        continue
                    return None
                
                # Read HTML content
                html = await response.text()
                
                # Track network time
                network_time = time.time() - fetch_start_time
                
                # Parse HTML to extract track data (reuse existing parsing logic)
                track_data = parse_track_data(html)
                
                if track_data:
                    # Add URL to track data if not present
                    if 'beatport_url' not in track_data:
                        track_data['beatport_url'] = url
                    
                    logger.debug(f"Fetched track data for URL: {url}")
                    return track_data
                else:
                    logger.warning(f"No track data parsed from URL: {url}")
                    return None
                    
        except asyncio.TimeoutError as e:
            last_exception = e
            logger.warning(f"Timeout on attempt {attempt + 1}/{retry_attempts} for URL: {url}")
            if attempt < retry_attempts - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            return None
            
        except aiohttp.ClientError as e:
            last_exception = e
            logger.warning(f"Client error on attempt {attempt + 1}/{retry_attempts} for URL: {url}: {e}")
            if attempt < retry_attempts - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            return None
    
    # Should not reach here, but handle just in case
    return None


async def async_fetch_multiple_tracks(
    session: aiohttp.ClientSession,
    urls: List[str],
    max_concurrent: int = 10,
    timeout: float = 30.0,
    retry_attempts: int = 3
) -> List[Optional[Dict[str, Any]]]:
    """
    Fetch multiple track data URLs concurrently.
    
    This function uses asyncio.gather() to fetch multiple track URLs in parallel,
    with a semaphore to limit concurrent requests and prevent overwhelming the server.
    
    Args:
        session: aiohttp ClientSession (must be provided by caller)
        urls: List of track URLs to fetch
        max_concurrent: Maximum concurrent requests (default: 10)
        timeout: Request timeout in seconds (default: 30.0)
        retry_attempts: Number of retry attempts per request (default: 3)
    
    Returns:
        List of track data dictionaries (None for failed requests).
        Order matches input URLs list.
    
    Example:
        async with aiohttp.ClientSession() as session:
            urls = [
                "https://www.beatport.com/track/track1/123",
                "https://www.beatport.com/track/track2/456"
            ]
            track_data_list = await async_fetch_multiple_tracks(
                session,
                urls,
                max_concurrent=5
            )
            # track_data_list[0] = data for track1 or None
            # track_data_list[1] = data for track2 or None
    """
    if not urls:
        return []
    
    # Create semaphore to limit concurrent requests
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def fetch_with_limit(url: str) -> Optional[Dict[str, Any]]:
        """Fetch with concurrency limit"""
        async with semaphore:
            return await async_fetch_track_data(session, url, timeout, retry_attempts)
    
    # Create tasks for all URLs
    tasks = [fetch_with_limit(url) for url in urls]
    
    # Fetch all tracks concurrently
    # return_exceptions=True means exceptions are returned as results instead of raising
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out exceptions and return valid results
    valid_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Exception fetching track {urls[i]}: {result}")
            valid_results.append(None)
        else:
            valid_results.append(result)
    
    # Log summary
    successful = sum(1 for r in valid_results if r is not None)
    logger.info(f"Fetched {successful}/{len(urls)} tracks successfully")
    
    return valid_results


async def async_search_and_fetch_tracks(
    session: aiohttp.ClientSession,
    query: str,
    max_results: int = 50,
    max_concurrent_fetches: int = 10,
    timeout: float = 30.0
) -> List[Dict[str, Any]]:
    """
    Convenience function: Search for tracks and fetch their data in one call.
    
    This function combines async_track_urls() and async_fetch_multiple_tracks()
    for convenience.
    
    Args:
        session: aiohttp ClientSession
        query: Search query string
        max_results: Maximum number of results to return
        max_concurrent_fetches: Maximum concurrent fetch requests
        timeout: Request timeout in seconds
    
    Returns:
        List of track data dictionaries (only successful fetches, no None values)
    """
    # Search for track URLs
    urls = await async_track_urls(session, query, max_results, timeout)
    
    if not urls:
        return []
    
    # Fetch all track data concurrently
    track_data_list = await async_fetch_multiple_tracks(
        session,
        urls,
        max_concurrent=max_concurrent_fetches,
        timeout=timeout
    )
    
    # Filter out None values (failed fetches)
    return [data for data in track_data_list if data is not None]
```

---

## Implementation Checklist

- [ ] Create `SRC/async_beatport_search.py` file
- [ ] Add module docstring and imports
- [ ] Implement `async_track_urls()` function
- [ ] Implement `async_fetch_track_data()` function
- [ ] Implement `async_fetch_multiple_tracks()` function
- [ ] Implement `async_search_and_fetch_tracks()` convenience function
- [ ] Add retry logic with exponential backoff
- [ ] Add performance tracking integration
- [ ] Add error handling for all exceptions
- [ ] Add logging for debugging
- [ ] Test with sample queries
- [ ] Test error conditions (timeout, network errors)
- [ ] Test concurrency limiting
- [ ] Verify performance tracking works
- [ ] Test with real Beatport URLs

---

## Dependencies

### Required Python Packages

```bash
pip install aiohttp
```

### Required Modules (Must Exist)

- `beatport_search.py` - For `parse_track_urls()` and `parse_track_data()`
- `performance.py` - For performance tracking (optional)
- `utils.py` - For retry logic (if used)

---

## Error Handling Details

### Network Errors

1. **Timeout Errors**:
   - Catch `asyncio.TimeoutError`
   - Retry with exponential backoff
   - Track in performance metrics
   - Return empty list/None after all retries

2. **Connection Errors**:
   - Catch `aiohttp.ClientError`
   - Retry with exponential backoff
   - Log error details
   - Return empty list/None after all retries

3. **HTTP Status Errors**:
   - Check `response.status != 200`
   - Log warning
   - Retry if appropriate
   - Return empty list/None

### Concurrency Errors

1. **Too Many Requests**:
   - Semaphore limits concurrent requests
   - Prevents overwhelming server
   - Configurable via `max_concurrent` parameter

2. **Memory Issues**:
   - Limit `max_concurrent` to reasonable values
   - Process in batches if needed
   - Monitor memory usage

---

## Testing Requirements

### Unit Tests

```python
# Test async_track_urls
async def test_async_track_urls():
    async with aiohttp.ClientSession() as session:
        urls = await async_track_urls(session, "test query")
        assert isinstance(urls, list)
        # Verify URLs are valid

# Test async_fetch_track_data
async def test_async_fetch_track_data():
    async with aiohttp.ClientSession() as session:
        track_data = await async_fetch_track_data(session, "https://...")
        assert track_data is None or isinstance(track_data, dict)

# Test async_fetch_multiple_tracks
async def test_async_fetch_multiple_tracks():
    async with aiohttp.ClientSession() as session:
        urls = ["url1", "url2", "url3"]
        results = await async_fetch_multiple_tracks(session, urls, max_concurrent=2)
        assert len(results) == len(urls)
        # Verify concurrency limiting works
```

### Integration Tests

```python
# Test full workflow
async def test_search_and_fetch_workflow():
    async with aiohttp.ClientSession() as session:
        tracks = await async_search_and_fetch_tracks(session, "Daft Punk")
        assert isinstance(tracks, list)
        # Verify tracks have required fields
```

---

## Performance Considerations

### Concurrency Limits

- **Default `max_concurrent=10`**: Good balance for most cases
- **Lower values (3-5)**: For slower networks or rate-limited APIs
- **Higher values (15-20)**: For fast networks (may hit rate limits)

### Timeout Settings

- **Default `timeout=30.0`**: Reasonable for most requests
- **Lower values (10-15)**: For faster failure detection
- **Higher values (60+)**: For slow networks

### Memory Usage

- Each concurrent request uses ~2-5MB memory
- With `max_concurrent=10`: ~20-50MB additional memory
- Monitor memory usage with large batches

---

## Usage Examples

### Example 1: Basic Search

```python
import asyncio
import aiohttp
from async_beatport_search import async_track_urls

async def main():
    async with aiohttp.ClientSession() as session:
        urls = await async_track_urls(session, "Daft Punk - One More Time")
        print(f"Found {len(urls)} tracks")

asyncio.run(main())
```

### Example 2: Fetch Multiple Tracks

```python
import asyncio
import aiohttp
from async_beatport_search import async_fetch_multiple_tracks

async def main():
    urls = [
        "https://www.beatport.com/track/track1/123",
        "https://www.beatport.com/track/track2/456",
        "https://www.beatport.com/track/track3/789"
    ]
    
    async with aiohttp.ClientSession() as session:
        track_data_list = await async_fetch_multiple_tracks(
            session,
            urls,
            max_concurrent=5
        )
        
        for i, track_data in enumerate(track_data_list):
            if track_data:
                print(f"Track {i+1}: {track_data.get('beatport_title', 'Unknown')}")

asyncio.run(main())
```

### Example 3: Full Workflow

```python
import asyncio
import aiohttp
from async_beatport_search import async_search_and_fetch_tracks

async def main():
    async with aiohttp.ClientSession() as session:
        tracks = await async_search_and_fetch_tracks(
            session,
            "Solomun - Never Sleep Again",
            max_results=20,
            max_concurrent_fetches=10
        )
        
        print(f"Found {len(tracks)} tracks with data")
        for track in tracks:
            print(f"  - {track.get('beatport_title')} by {track.get('beatport_artists')}")

asyncio.run(main())
```

---

## Integration Points

### With Performance Tracking

```python
# Performance tracking is automatically integrated
# If performance_collector is available, metrics are recorded
# Check performance module for recorded metrics
```

### With Existing Code

```python
# This module is a drop-in async replacement for:
# - beatport_search.track_urls() → async_track_urls()
# - beatport_search.fetch_track_data() → async_fetch_track_data()

# Parsing logic is reused from beatport_search module
# No need to duplicate HTML parsing code
```

---

## Acceptance Criteria

- ✅ All async functions implemented
- ✅ Retry logic works correctly
- ✅ Concurrency limiting works
- ✅ Performance tracking integrated
- ✅ Error handling robust
- ✅ All tests passing
- ✅ Documentation complete
- ✅ Code follows async best practices

---

## Next Steps

After completing this step:

1. **Test thoroughly** with real Beatport queries
2. **Verify performance** improvements
3. **Proceed to Step 6.2** to create async matcher function

---

**This step provides the foundation for async I/O operations.**

