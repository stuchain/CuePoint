# Design: Async I/O Refactoring

**Number**: 12  
**Status**: 📝 Planned  
**Priority**: 🚀 P2 - Larger Project  
**Effort**: 1-2 weeks  
**Impact**: High

---

## 1. Overview

### 1.1 Problem Statement

Current threading model has overhead for I/O-bound operations.

### 1.2 Solution Overview

Refactor to async/await:
1. Use `aiohttp` instead of `requests`
2. Async Playwright for browser automation
3. Better concurrency with asyncio
4. Lower memory usage
5. Improved performance for I/O-bound operations

---

## 2. Architecture Design

### 2.1 Current vs Async Architecture

**Current (Threading)**:
```
ThreadPoolExecutor (15 workers)
    ├─ Thread 1: requests.get() → blocking
    ├─ Thread 2: requests.get() → blocking
    └─ Thread 15: requests.get() → blocking
```

**Async (Event Loop)**:
```
asyncio Event Loop
    ├─ Task 1: aiohttp.get() → await
    ├─ Task 2: aiohttp.get() → await
    ├─ Task 50: aiohttp.get() → await
    └─ All handled concurrently in single thread
```

### 2.2 Performance Benefits

- **Thread overhead**: Threads have ~1MB overhead each, async tasks ~1KB
- **Concurrency**: Can handle 100+ concurrent requests vs 15 threads
- **Context switching**: Less overhead with async
- **Memory**: Lower memory usage

---

## 3. Implementation Details

### 3.1 Async HTTP Client

**Location**: `SRC/beatport.py` (refactor)

```python
import aiohttp
import asyncio
from typing import List, Optional

async def fetch_track_page_async(url: str, session: aiohttp.ClientSession) -> Optional[str]:
    """Async fetch of Beatport track page"""
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as response:
            response.raise_for_status()
            return await response.text()
    except Exception as e:
        vlog(f"Error fetching {url}: {e}")
        return None

async def fetch_candidates_async(urls: List[str]) -> List[Optional[str]]:
    """Fetch multiple candidate pages concurrently"""
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_track_page_async(url, session) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return results
```

### 3.2 Async Search Functions

**Location**: `SRC/beatport_search.py` (refactor)

```python
async def beatport_search_direct_async(query: str, max_results: int = 50) -> List[str]:
    """Async direct Beatport search"""
    async with aiohttp.ClientSession() as session:
        # Try API endpoints
        for endpoint in API_ENDPOINTS:
            try:
                url = f"{BASE_URL}{endpoint}?q={quote_plus(query)}"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=3)) as response:
                    if response.status == 200:
                        data = await response.json()
                        return extract_tracks_from_json(data)
            except Exception:
                continue
        
        # Fallback to HTML parsing
        search_url = f"{BASE_URL}/search/tracks?q={quote_plus(query)}"
        async with session.get(search_url) as response:
            html = await response.text()
            return extract_tracks_from_html(html)
```

### 3.3 Async Candidate Processing

**Location**: `SRC/matcher.py` (refactor)

```python
async def fetch_and_score_candidates_async(
    urls: List[str],
    rb: RBTrack,
    session: aiohttp.ClientSession
) -> List[ScoredCandidate]:
    """Fetch and score candidates concurrently"""
    # Fetch all candidate pages concurrently
    html_contents = await fetch_candidates_async(urls, session)
    
    # Parse and score
    candidates = []
    for url, html in zip(urls, html_contents):
        if html:
            candidate = parse_track_page_from_html(html, url)
            if candidate:
                score = score_candidate(candidate, rb)
                candidates.append((score, candidate))
    
    return sorted(candidates, key=lambda x: x[0].final_score, reverse=True)
```

### 3.4 Async Playwright

**Location**: `SRC/beatport_search.py`

```python
from playwright.async_api import async_playwright

async def beatport_search_browser_async(query: str) -> List[str]:
    """Async browser automation search"""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            search_url = f"{BASE_URL}/search/tracks?q={quote_plus(query)}"
            await page.goto(search_url, wait_until="networkidle", timeout=30000)
            
            # Wait for track links
            await page.wait_for_selector('a[href*="/track/"]', timeout=10000)
            
            # Extract track URLs
            urls = await page.evaluate("""
                () => {
                    const links = document.querySelectorAll('a[href*="/track/"]');
                    return Array.from(links).map(link => link.href);
                }
            """)
            
            return list(set(urls))  # Deduplicate
        
        finally:
            await browser.close()
```

### 3.5 Async Main Loop

**Location**: `SRC/processor.py` (refactor)

```python
async def process_track_async(idx: int, rb: RBTrack, session: aiohttp.ClientSession) -> Dict:
    """Async track processing"""
    # Generate queries (synchronous, fast)
    queries = make_search_queries(rb)
    
    # Execute queries concurrently
    query_tasks = [execute_query_async(q, session) for q in queries]
    query_results = await asyncio.gather(*query_tasks)
    
    # Collect all candidate URLs
    all_candidate_urls = []
    for urls in query_results:
        all_candidate_urls.extend(urls)
    
    # Fetch and score candidates concurrently
    scored_candidates = await fetch_and_score_candidates_async(
        all_candidate_urls, rb, session
    )
    
    # Select best match
    best = scored_candidates[0][1] if scored_candidates else None
    
    return build_result_row(idx, rb, best)

async def run_async(xml_path: str, playlist_name: str, out_csv_base: str) -> None:
    """Async main processing function"""
    # Parse XML (synchronous, fast)
    tracks_by_id, playlists = parse_rekordbox(xml_path)
    track_ids = playlists[playlist_name]
    
    # Create aiohttp session
    async with aiohttp.ClientSession() as session:
        # Process tracks concurrently (with limit)
        semaphore = asyncio.Semaphore(SETTINGS["TRACK_WORKERS"])
        
        async def process_with_limit(track_data):
            async with semaphore:
                return await process_track_async(*track_data, session)
        
        tasks = [
            process_with_limit((idx, tracks_by_id[tid]))
            for idx, tid in enumerate(track_ids, start=1)
        ]
        
        results = await asyncio.gather(*tasks)
    
    # Write output (synchronous)
    write_csv_files(results, out_csv_base)
```

---

## 4. Migration Strategy

### 4.1 Gradual Migration

**Phase 1**: Async HTTP client only
- Keep existing structure
- Replace `requests` with `aiohttp` in HTTP calls
- Wrap in async functions

**Phase 2**: Async candidate fetching
- Convert candidate fetching to async
- Process candidates concurrently

**Phase 3**: Full async pipeline
- Convert main processing loop
- Async query execution

### 4.2 Backward Compatibility

```python
# Provide sync wrapper for backward compatibility
def run(xml_path: str, playlist_name: str, out_csv_base: str):
    """Synchronous wrapper for async run"""
    asyncio.run(run_async(xml_path, playlist_name, out_csv_base))
```

---

## 5. Configuration

### 5.1 Async-Specific Settings

```python
SETTINGS = {
    "USE_ASYNC": True,                    # Enable async mode
    "ASYNC_MAX_CONCURRENT": 100,          # Max concurrent requests
    "ASYNC_SEMAPHORE_LIMIT": 50,         # Limit for rate control
    "ASYNC_TIMEOUT": 8,                   # Request timeout (seconds)
}
```

---

## 6. Benefits

### 6.1 Performance

- **2-3x faster**: For I/O-bound operations
- **Better scalability**: Handle more concurrent requests
- **Lower memory**: No thread overhead

### 6.2 Code Quality

- **Cleaner code**: Async/await is more readable
- **Better error handling**: Easier exception handling
- **Modern Python**: Uses latest async features

---

## 7. Challenges

### 7.1 Migration Complexity

- **Significant refactoring**: Most I/O code needs changes
- **Testing**: Async code requires different testing approach
- **Debugging**: Async stack traces can be complex

### 7.2 Compatibility

- **Third-party libraries**: Some may not support async
- **Existing code**: Need to maintain sync compatibility
- **Learning curve**: Team needs to understand async

---

## 8. Dependencies

### 8.1 Required

```
aiohttp>=3.9.0
playwright>=1.40.0  # For async browser automation
```

### 8.2 Optional

```
asyncio  # Built-in (Python 3.7+)
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

