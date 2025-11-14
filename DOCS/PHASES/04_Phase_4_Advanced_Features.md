# Phase 4: Advanced Features (Ongoing)

**Status**: 📝 Planned  
**Priority**: 🚀 P2 - LOWER PRIORITY  
**Dependencies**: Phase 1 (GUI Foundation), Phase 2 (User Experience), Phase 3 (Reliability)

## Goal
Add advanced features to enhance functionality, performance, and integration capabilities based on user feedback and requirements.

## Success Criteria
- [ ] Features implemented as specified
- [ ] All features tested
- [ ] Documentation updated
- [ ] Backward compatibility maintained
- [ ] Performance impact acceptable

---

## Implementation Steps

### Step 4.1: Enhanced Export Features (2-3 days)
**File**: `SRC/output_writer.py` (MODIFY), `SRC/gui/export_dialog.py` (MODIFY)

**Dependencies**: Phase 2 Step 2.3 (export dialog exists), Phase 0 (output_writer)

**Status Note**: JSON and Excel export were already implemented in Phase 2. This step adds enhancements.

**What to add - EXACT STRUCTURE:**

**In `SRC/gui/export_dialog.py`:**

```python
# Add new export options

class ExportDialog(QDialog):
    """Enhanced export dialog with additional options"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.file_path = ""
        self.init_ui()
    
    def init_ui(self):
        """Initialize export dialog with enhanced options"""
        layout = QVBoxLayout(self)
        
        # ... existing format and column selection ...
        
        # NEW: Export Options Group
        options_group = QGroupBox("Export Options")
        options_layout = QVBoxLayout()
        
        # Include metadata
        self.include_metadata_checkbox = QCheckBox("Include full metadata (genres, labels, release dates)")
        self.include_metadata_checkbox.setChecked(True)
        options_layout.addWidget(self.include_metadata_checkbox)
        
        # Include processing info
        self.include_processing_info_checkbox = QCheckBox("Include processing information (timestamps, settings)")
        self.include_processing_info_checkbox.setChecked(False)
        options_layout.addWidget(self.include_processing_info_checkbox)
        
        # Compression option (for JSON)
        self.compress_checkbox = QCheckBox("Compress output (gzip)")
        self.compress_checkbox.setChecked(False)
        options_layout.addWidget(self.compress_checkbox)
        
        # Custom delimiter (for CSV)
        delimiter_layout = QHBoxLayout()
        delimiter_layout.addWidget(QLabel("CSV Delimiter:"))
        self.delimiter_combo = QComboBox()
        self.delimiter_combo.addItems([",", ";", "\t", "|"])
        self.delimiter_combo.setCurrentText(",")
        delimiter_layout.addWidget(self.delimiter_combo)
        delimiter_layout.addStretch()
        options_layout.addLayout(delimiter_layout)
        
        options_group.setLayout(options_layout)
        layout.addWidget(options_group)
        
        # ... rest of existing UI ...
    
    def get_export_options(self) -> Dict[str, Any]:
        """Get selected export options with enhancements"""
        options = {
            # ... existing options ...
            "include_metadata": self.include_metadata_checkbox.isChecked(),
            "include_processing_info": self.include_processing_info_checkbox.isChecked(),
            "compress": self.compress_checkbox.isChecked(),
            "delimiter": self.delimiter_combo.currentText(),
        }
        return options
```

**In `SRC/output_writer.py`:**

```python
import gzip
import json

def write_json_file(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output",
    include_metadata: bool = True,
    include_processing_info: bool = False,
    compress: bool = False
) -> str:
    """Write results to JSON file with enhanced options"""
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Build JSON structure
    json_data = {
        "version": "1.0",
        "generated": datetime.now().isoformat(),
        "total_tracks": len(results),
        "matched_tracks": sum(1 for r in results if r.matched),
        "tracks": []
    }
    
    # Add processing info if requested
    if include_processing_info:
        json_data["processing_info"] = {
            "timestamp": datetime.now().isoformat(),
            "settings": {}  # TODO: include actual settings
        }
    
    # Add track data
    for result in results:
        track_data = {
            "playlist_index": result.playlist_index,
            "title": result.title,
            "artist": result.artist,
            "matched": result.matched,
        }
        
        if result.matched:
            track_data["match"] = {
                "beatport_title": result.beatport_title,
                "beatport_artists": result.beatport_artists,
                "beatport_url": result.beatport_url,
                "match_score": result.match_score,
                "confidence": result.confidence,
                "key": result.beatport_key,
                "bpm": result.beatport_bpm,
                "year": result.beatport_year,
            }
            
            # Include full metadata if requested
            if include_metadata:
                track_data["match"]["metadata"] = {
                    "label": result.beatport_label,
                    "genres": result.beatport_genres,
                    "release": result.beatport_release,
                    "release_date": result.beatport_release_date,
                }
        
        # Add candidates if available
        if result.candidates:
            track_data["candidates"] = [
                {
                    "title": c.get("beatport_title", ""),
                    "artists": c.get("beatport_artists", ""),
                    "url": c.get("beatport_url", ""),
                    "score": c.get("match_score", 0),
                }
                for c in result.candidates[:10]  # Top 10 candidates
            ]
        
        json_data["tracks"].append(track_data)
    
    # Write to file
    filename = f"{base_filename}.json"
    if compress:
        filename += ".gz"
    
    filepath = os.path.join(output_dir, filename)
    
    json_str = json.dumps(json_data, indent=2, ensure_ascii=False)
    
    if compress:
        with gzip.open(filepath, 'wt', encoding='utf-8') as f:
            f.write(json_str)
    else:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(json_str)
    
    return filepath


def write_csv_files(
    results: List[TrackResult],
    base_filename: str,
    output_dir: str = "output",
    delimiter: str = ","
) -> Dict[str, str]:
    """Write CSV files with custom delimiter"""
    
    # Modify existing write_csv_files to use custom delimiter
    # Update all CSV writing functions to accept delimiter parameter
    # ...
    pass
```

**Implementation Checklist**:
- [ ] Add enhanced export options to `ExportDialog`
- [ ] Add metadata inclusion option
- [ ] Add processing info inclusion option
- [ ] Add compression option for JSON
- [ ] Add custom delimiter option for CSV
- [ ] Update `write_json_file` to support new options
- [ ] Update `write_csv_files` to support custom delimiter
- [ ] Test all export options
- [ ] Verify compressed JSON files work correctly

**Acceptance Criteria**:
- ✅ Enhanced export options available
- ✅ Metadata inclusion works
- ✅ Processing info inclusion works
- ✅ Compression works for JSON
- ✅ Custom delimiter works for CSV
- ✅ All options tested and working

---

### Step 4.2: Async I/O Refactoring (4-5 days)
**Files**: `SRC/beatport_search.py` (MODIFY), `SRC/matcher.py` (MODIFY)

**Dependencies**: Phase 0 (backend), Phase 1 (GUI), Python 3.7+ (for async/await)

**What to implement - EXACT STRUCTURE:**

**Create `SRC/async_beatport_search.py` (NEW):**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Async Beatport Search Module

This module provides async/await versions of Beatport search functions
for improved performance in parallel processing scenarios.
"""

import asyncio
import aiohttp
from typing import List, Optional, Dict
from urllib.parse import quote_plus


async def async_track_urls(
    session: aiohttp.ClientSession,
    query: str,
    max_results: int = 50
) -> List[str]:
    """Async version of track_urls - search Beatport and return track URLs"""
    
    # Build search URL
    encoded_query = quote_plus(query)
    url = f"https://www.beatport.com/search?q={encoded_query}"
    
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
            if response.status != 200:
                return []
            
            html = await response.text()
            # Parse HTML to extract track URLs (reuse existing parsing logic)
            urls = _parse_track_urls_from_html(html, max_results)
            return urls
            
    except (asyncio.TimeoutError, aiohttp.ClientError) as e:
        # Log error and return empty list
        return []


async def async_fetch_track_data(
    session: aiohttp.ClientSession,
    url: str
) -> Optional[Dict]:
    """Async version of fetch_track_data - fetch track data from Beatport"""
    
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
            if response.status != 200:
                return None
            
            html = await response.text()
            # Parse HTML to extract track data (reuse existing parsing logic)
            track_data = _parse_track_data_from_html(html)
            return track_data
            
    except (asyncio.TimeoutError, aiohttp.ClientError) as e:
        # Log error and return None
        return None


async def async_fetch_multiple_tracks(
    urls: List[str],
    max_concurrent: int = 10
) -> List[Optional[Dict]]:
    """Fetch multiple track data URLs concurrently"""
    
    async def fetch_with_session(url):
        async with aiohttp.ClientSession() as session:
            return await async_fetch_track_data(session, url)
    
    # Create semaphore to limit concurrent requests
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def fetch_with_limit(url):
        async with semaphore:
            return await fetch_with_session(url)
    
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


def _parse_track_urls_from_html(html: str, max_results: int) -> List[str]:
    """Parse track URLs from HTML (reuse existing logic from beatport_search.py)"""
    # Import and reuse existing parsing logic
    from beatport_search import parse_track_urls
    return parse_track_urls(html, max_results)


def _parse_track_data_from_html(html: str) -> Optional[Dict]:
    """Parse track data from HTML (reuse existing logic from beatport_search.py)"""
    # Import and reuse existing parsing logic
    from beatport_search import parse_track_data
    return parse_track_data(html)
```

**Modify `SRC/matcher.py` to support async:**

```python
import asyncio
from async_beatport_search import async_track_urls, async_fetch_multiple_tracks

async def async_best_beatport_match(
    idx: int,
    track_title: str,
    track_artists_for_scoring: str,
    title_only_mode: bool,
    queries: List[str],
    input_year: Optional[int] = None,
    input_key: Optional[str] = None,
    input_mix: Optional[Dict[str, object]] = None,
    input_generic_phrases: Optional[List[str]] = None,
) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate], List[Tuple[int, str, int, int]], int]:
    """Async version of best_beatport_match"""
    
    async with aiohttp.ClientSession() as session:
        best: Optional[BeatportCandidate] = None
        candidates_log: List[BeatportCandidate] = []
        queries_audit: List[Tuple[int, str, int, int]] = []
        
        for query_idx, query in enumerate(queries):
            # Execute async search
            track_urls = await async_track_urls(session, query, max_results=50)
            
            if not track_urls:
                queries_audit.append((query_idx, query, 0, 0))
                continue
            
            # Fetch all track data concurrently
            track_data_list = await async_fetch_multiple_tracks(track_urls, max_concurrent=10)
            
            # Process candidates (reuse existing scoring logic)
            for track_data in track_data_list:
                if not track_data:
                    continue
                
                candidate = _create_candidate_from_data(track_data)
                # ... scoring logic ...
                candidates_log.append(candidate)
                
                if not best or candidate.match_score > best.match_score:
                    best = candidate
            
            # Check for early exit
            if best and best.match_score >= 95:
                break
        
        return best, candidates_log, queries_audit, query_idx
```

**Add async wrapper in `SRC/processor.py`:**

```python
import asyncio

def process_track_async(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None
) -> TrackResult:
    """Process track using async I/O"""
    
    # Run async matching
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        best, candidates, queries_audit, last_query = loop.run_until_complete(
            async_best_beatport_match(
                idx, track_title, track_artists, title_only_mode,
                queries, input_year, input_key, input_mix, input_generic_phrases
            )
        )
    finally:
        loop.close()
    
    # Convert to TrackResult (reuse existing logic)
    # ...
    return track_result
```

**Implementation Checklist**:
- [ ] Create `SRC/async_beatport_search.py` module
- [ ] Implement `async_track_urls` function
- [ ] Implement `async_fetch_track_data` function
- [ ] Implement `async_fetch_multiple_tracks` for concurrent fetching
- [ ] Create `async_best_beatport_match` function
- [ ] Add async wrapper in processor
- [ ] Add configuration option to enable/disable async mode
- [ ] Test async performance vs sync
- [ ] Ensure backward compatibility (keep sync functions)

**Acceptance Criteria**:
- ✅ Async functions implemented
- ✅ Concurrent fetching works correctly
- ✅ Performance improvement measurable
- ✅ Backward compatibility maintained
- ✅ Error handling works in async context
- ✅ Can switch between sync/async modes

**Design Reference**: `DOCS/DESIGNS/12_Async_IO_Refactoring_Design.md`

**Dependencies**: Requires `aiohttp` package - add to `requirements.txt`

---

### Step 4.3: Additional Metadata Sources (5-7 days)
**Files**: `SRC/metadata_sources.py` (NEW), `SRC/matcher.py` (MODIFY)

**Dependencies**: Phase 0 (backend), Phase 1 (GUI)

**What to implement - EXACT STRUCTURE:**

**Create `SRC/metadata_sources.py` (NEW):**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Additional Metadata Sources Module

This module provides integration with additional metadata sources beyond Beatport,
such as Discogs, MusicBrainz, and Spotify.
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import requests
from urllib.parse import quote_plus


@dataclass
class MetadataSource:
    """Base class for metadata sources"""
    name: str
    enabled: bool = True
    
    def search(self, title: str, artist: str) -> List[Dict[str, Any]]:
        """Search for track metadata"""
        raise NotImplementedError
    
    def fetch_details(self, track_id: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed metadata for a track"""
        raise NotImplementedError


class DiscogsSource(MetadataSource):
    """Discogs metadata source"""
    
    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None):
        super().__init__(name="Discogs", enabled=(api_key is not None))
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = "https://api.discogs.com"
    
    def search(self, title: str, artist: str) -> List[Dict[str, Any]]:
        """Search Discogs for track"""
        if not self.enabled:
            return []
        
        query = f"{artist} {title}"
        url = f"{self.base_url}/database/search"
        params = {
            "q": query,
            "type": "release",
            "key": self.api_key,
            "secret": self.api_secret
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                results = []
                for item in data.get("results", [])[:10]:
                    results.append({
                        "title": item.get("title", ""),
                        "artist": item.get("artist", ""),
                        "year": item.get("year"),
                        "label": item.get("label", []),
                        "genre": item.get("genre", []),
                        "url": item.get("uri", ""),
                        "source": "discogs"
                    })
                return results
        except Exception as e:
            # Log error
            pass
        
        return []
    
    def fetch_details(self, track_id: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed release information from Discogs"""
        # Implementation for fetching detailed release data
        pass


class MusicBrainzSource(MetadataSource):
    """MusicBrainz metadata source"""
    
    def __init__(self, user_agent: str = "CuePoint/1.0"):
        super().__init__(name="MusicBrainz", enabled=True)
        self.user_agent = user_agent
        self.base_url = "https://musicbrainz.org/ws/2"
    
    def search(self, title: str, artist: str) -> List[Dict[str, Any]]:
        """Search MusicBrainz for track"""
        if not self.enabled:
            return []
        
        query = f'artist:"{artist}" AND recording:"{title}"'
        url = f"{self.base_url}/recording"
        params = {
            "query": query,
            "fmt": "json",
            "limit": 10
        }
        headers = {
            "User-Agent": self.user_agent
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                results = []
                for recording in data.get("recordings", [])[:10]:
                    # Extract artist name
                    artists = [a.get("name", "") for a in recording.get("artist-credit", [])]
                    artist_name = ", ".join(artists) if artists else ""
                    
                    # Extract release date
                    first_release = recording.get("first-release-date", "")
                    year = None
                    if first_release:
                        try:
                            year = int(first_release.split("-")[0])
                        except:
                            pass
                    
                    results.append({
                        "title": recording.get("title", ""),
                        "artist": artist_name,
                        "year": year,
                        "url": f"https://musicbrainz.org/recording/{recording.get('id', '')}",
                        "source": "musicbrainz"
                    })
                return results
        except Exception as e:
            # Log error
            pass
        
        return []


class MetadataAggregator:
    """Aggregator for multiple metadata sources"""
    
    def __init__(self, sources: List[MetadataSource]):
        self.sources = [s for s in sources if s.enabled]
    
    def search_all(self, title: str, artist: str) -> List[Dict[str, Any]]:
        """Search all enabled sources and aggregate results"""
        all_results = []
        
        for source in self.sources:
            try:
                results = source.search(title, artist)
                all_results.extend(results)
            except Exception as e:
                # Log error but continue with other sources
                continue
        
        # Deduplicate and rank results
        return self._deduplicate_results(all_results)
    
    def _deduplicate_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate results based on title and artist similarity"""
        # Simple deduplication - can be enhanced
        seen = set()
        unique_results = []
        
        for result in results:
            key = (result.get("title", "").lower(), result.get("artist", "").lower())
            if key not in seen:
                seen.add(key)
                unique_results.append(result)
        
        return unique_results
```

**Modify `SRC/matcher.py` to use additional sources:**

```python
from metadata_sources import MetadataAggregator, DiscogsSource, MusicBrainzSource

def best_match_with_multiple_sources(
    idx: int,
    track_title: str,
    track_artists: str,
    queries: List[str],
    use_additional_sources: bool = False
) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate]]:
    """Find best match using Beatport and optionally additional sources"""
    
    # First, try Beatport (existing logic)
    best_beatport, candidates_beatport = best_beatport_match(
        idx, track_title, track_artists, title_only_mode, queries, ...
    )
    
    if not use_additional_sources:
        return best_beatport, candidates_beatport
    
    # Search additional sources
    aggregator = MetadataAggregator([
        DiscogsSource(api_key=config.get("discogs_api_key")),
        MusicBrainzSource()
    ])
    
    additional_results = aggregator.search_all(track_title, track_artists)
    
    # Merge and score additional results
    # Convert to BeatportCandidate format for consistency
    # ...
    
    # Combine with Beatport results and return best match
    all_candidates = candidates_beatport + additional_candidates
    best = max(all_candidates, key=lambda c: c.match_score) if all_candidates else None
    
    return best, all_candidates
```

**Implementation Checklist**:
- [ ] Create `SRC/metadata_sources.py` module
- [ ] Implement `DiscogsSource` class
- [ ] Implement `MusicBrainzSource` class
- [ ] Implement `MetadataAggregator` class
- [ ] Add configuration for API keys
- [ ] Integrate into matcher
- [ ] Add GUI option to enable/disable additional sources
- [ ] Test with sample tracks
- [ ] Handle API rate limits
- [ ] Add error handling

**Acceptance Criteria**:
- ✅ Discogs integration works
- ✅ MusicBrainz integration works
- ✅ Results aggregated correctly
- ✅ Deduplication works
- ✅ Configuration options available
- ✅ Error handling robust
- ✅ API rate limits respected

**Design Reference**: `DOCS/DESIGNS/15_Additional_Metadata_Sources_Design.md`

**Dependencies**: Requires API keys for Discogs (optional), MusicBrainz is free but requires User-Agent

---

### Step 4.4: Database Integration (Optional, 4-5 days)
**Files**: `SRC/database.py` (NEW), `SRC/gui/database_view.py` (NEW)

**Dependencies**: Phase 1 (GUI), Phase 2 (User Experience)

**What to implement - EXACT STRUCTURE:**

**Create `SRC/database.py` (NEW):**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Database Integration Module

This module provides SQLite database storage for search history, results,
and user preferences.
"""

import sqlite3
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path


class CuePointDatabase:
    """SQLite database for CuePoint data"""
    
    def __init__(self, db_path: str = "cuepoint.db"):
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """Initialize database schema"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Search history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_name TEXT NOT NULL,
                xml_path TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                total_tracks INTEGER,
                matched_tracks INTEGER,
                output_file TEXT,
                settings TEXT
            )
        """)
        
        # Track results table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS track_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                search_id INTEGER,
                playlist_index INTEGER,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                matched INTEGER,
                beatport_title TEXT,
                beatport_artists TEXT,
                beatport_url TEXT,
                match_score REAL,
                confidence TEXT,
                FOREIGN KEY (search_id) REFERENCES search_history(id)
            )
        """)
        
        # Candidates table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_result_id INTEGER,
                candidate_title TEXT,
                candidate_artists TEXT,
                candidate_url TEXT,
                match_score REAL,
                rank INTEGER,
                FOREIGN KEY (track_result_id) REFERENCES track_results(id)
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_search_timestamp ON search_history(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_track_search ON track_results(search_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_candidate_track ON candidates(track_result_id)")
        
        conn.commit()
        conn.close()
    
    def save_search(self, playlist_name: str, xml_path: str, results: List[Dict], 
                   output_file: str, settings: Dict) -> int:
        """Save a search session to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        timestamp = datetime.now().isoformat()
        total_tracks = len(results)
        matched_tracks = sum(1 for r in results if r.get("matched", False))
        settings_json = json.dumps(settings)
        
        cursor.execute("""
            INSERT INTO search_history 
            (playlist_name, xml_path, timestamp, total_tracks, matched_tracks, output_file, settings)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (playlist_name, xml_path, timestamp, total_tracks, matched_tracks, output_file, settings_json))
        
        search_id = cursor.lastrowid
        
        # Save track results
        for result in results:
            cursor.execute("""
                INSERT INTO track_results
                (search_id, playlist_index, title, artist, matched, beatport_title,
                 beatport_artists, beatport_url, match_score, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                search_id,
                result.get("playlist_index", 0),
                result.get("title", ""),
                result.get("artist", ""),
                1 if result.get("matched", False) else 0,
                result.get("beatport_title", ""),
                result.get("beatport_artists", ""),
                result.get("beatport_url", ""),
                result.get("match_score", 0.0),
                result.get("confidence", "")
            ))
            
            track_result_id = cursor.lastrowid
            
            # Save candidates
            candidates = result.get("candidates", [])
            for rank, candidate in enumerate(candidates[:10], 1):  # Top 10 candidates
                cursor.execute("""
                    INSERT INTO candidates
                    (track_result_id, candidate_title, candidate_artists, candidate_url, match_score, rank)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    track_result_id,
                    candidate.get("beatport_title", ""),
                    candidate.get("beatport_artists", ""),
                    candidate.get("beatport_url", ""),
                    candidate.get("match_score", 0.0),
                    rank
                ))
        
        conn.commit()
        conn.close()
        
        return search_id
    
    def get_search_history(self, limit: int = 50) -> List[Dict]:
        """Get search history"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM search_history
            ORDER BY timestamp DESC
            LIMIT ?
        """, (limit,))
        
        rows = cursor.fetchall()
        results = [dict(row) for row in rows]
        
        conn.close()
        return results
    
    def get_search_results(self, search_id: int) -> List[Dict]:
        """Get all results for a search"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM track_results
            WHERE search_id = ?
            ORDER BY playlist_index
        """, (search_id,))
        
        rows = cursor.fetchall()
        results = [dict(row) for row in rows]
        
        # Load candidates for each result
        for result in results:
            cursor.execute("""
                SELECT * FROM candidates
                WHERE track_result_id = ?
                ORDER BY rank
            """, (result["id"],))
            
            candidate_rows = cursor.fetchall()
            result["candidates"] = [dict(row) for row in candidate_rows]
        
        conn.close()
        return results
```

**Implementation Checklist**:
- [ ] Create `SRC/database.py` module
- [ ] Implement database schema
- [ ] Implement save/load functions
- [ ] Create database view widget
- [ ] Integrate into main window
- [ ] Add search and filter functionality
- [ ] Test database operations
- [ ] Add migration support for schema changes

**Acceptance Criteria**:
- ✅ Database schema created
- ✅ Search history saved correctly
- ✅ Results retrieved correctly
- ✅ Database view displays data
- ✅ Search and filter work
- ✅ Performance acceptable

**Note**: This is an optional feature. Consider if SQLite is needed or if CSV files are sufficient for the use case.

---

### Step 4.5: Advanced Filtering and Search (2-3 days)
**File**: `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Phase 2 Step 2.1 (results table exists)

**What to add - EXACT STRUCTURE:**

```python
# In SRC/gui/results_view.py

class ResultsView(QWidget):
    """Enhanced results view with advanced filtering"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        # ... existing initialization ...
        self._setup_advanced_filters()
    
    def _setup_advanced_filters(self):
        """Setup advanced filtering options"""
        # Add to existing filter layout
        
        # Year range filter
        year_layout = QHBoxLayout()
        year_layout.addWidget(QLabel("Year:"))
        self.year_min = QSpinBox()
        self.year_min.setMinimum(1900)
        self.year_min.setMaximum(2100)
        self.year_min.setSpecialValueText("Any")
        year_layout.addWidget(self.year_min)
        
        year_layout.addWidget(QLabel("to"))
        self.year_max = QSpinBox()
        self.year_max.setMinimum(1900)
        self.year_max.setMaximum(2100)
        self.year_max.setSpecialValueText("Any")
        year_layout.addWidget(self.year_max)
        
        # BPM range filter
        bpm_layout = QHBoxLayout()
        bpm_layout.addWidget(QLabel("BPM:"))
        self.bpm_min = QSpinBox()
        self.bpm_min.setMinimum(60)
        self.bpm_min.setMaximum(200)
        self.bpm_min.setSpecialValueText("Any")
        bpm_layout.addWidget(self.bpm_min)
        
        bpm_layout.addWidget(QLabel("to"))
        self.bpm_max = QSpinBox()
        self.bpm_max.setMinimum(60)
        self.bpm_max.setMaximum(200)
        self.bpm_max.setSpecialValueText("Any")
        bpm_layout.addWidget(self.bpm_max)
        
        # Key filter
        self.key_filter = QComboBox()
        self.key_filter.addItems(["All"] + [f"{k} Major" for k in "C C# D D# E F F# G G# A A# B"] + 
                                 [f"{k} Minor" for k in "C C# D D# E F F# G G# A A# B"])
        
        # Connect signals
        self.year_min.valueChanged.connect(self.apply_filters)
        self.year_max.valueChanged.connect(self.apply_filters)
        self.bpm_min.valueChanged.connect(self.apply_filters)
        self.bpm_max.valueChanged.connect(self.apply_filters)
        self.key_filter.currentTextChanged.connect(self.apply_filters)
    
    def apply_filters(self):
        """Apply all filters including advanced filters"""
        filtered = self.results.copy()
        
        # ... existing filters ...
        
        # Year filter
        year_min_val = self.year_min.value() if self.year_min.value() > 1900 else None
        year_max_val = self.year_max.value() if self.year_max.value() < 2100 else None
        
        if year_min_val or year_max_val:
            filtered = [r for r in filtered if self._year_in_range(r, year_min_val, year_max_val)]
        
        # BPM filter
        bpm_min_val = self.bpm_min.value() if self.bpm_min.value() > 60 else None
        bpm_max_val = self.bpm_max.value() if self.bpm_max.value() < 200 else None
        
        if bpm_min_val or bpm_max_val:
            filtered = [r for r in filtered if self._bpm_in_range(r, bpm_min_val, bpm_max_val)]
        
        # Key filter
        key_filter_val = self.key_filter.currentText()
        if key_filter_val != "All":
            filtered = [r for r in filtered if r.beatport_key == key_filter_val]
        
        # Update table
        self._populate_table(filtered)
    
    def _year_in_range(self, result: TrackResult, min_year: Optional[int], max_year: Optional[int]) -> bool:
        """Check if result year is in range"""
        if not result.beatport_year:
            return False
        try:
            year = int(result.beatport_year)
            if min_year and year < min_year:
                return False
            if max_year and year > max_year:
                return False
            return True
        except:
            return False
    
    def _bpm_in_range(self, result: TrackResult, min_bpm: Optional[int], max_bpm: Optional[int]) -> bool:
        """Check if result BPM is in range"""
        if not result.beatport_bpm:
            return False
        try:
            bpm = float(result.beatport_bpm)
            if min_bpm and bpm < min_bpm:
                return False
            if max_bpm and bpm > max_bpm:
                return False
            return True
        except:
            return False
```

**Implementation Checklist**:
- [ ] Add year range filter
- [ ] Add BPM range filter
- [ ] Add key filter
- [ ] Implement filter logic
- [ ] Update `apply_filters` method
- [ ] Test all filter combinations
- [ ] Ensure filters work with search box

**Acceptance Criteria**:
- ✅ Year range filter works
- ✅ BPM range filter works
- ✅ Key filter works
- ✅ Filters combine correctly
- ✅ Performance acceptable with large datasets

---

## Phase 4 Deliverables Checklist
- [ ] Enhanced export features implemented
- [ ] Async I/O refactoring complete (optional)
- [ ] Additional metadata sources integrated (optional)
- [ ] Database integration complete (optional)
- [ ] Advanced filtering implemented
- [ ] All features tested
- [ ] Documentation updated
- [ ] Backward compatibility maintained

---

## Implementation Guidelines

### When to Implement Features
1. **User Request**: If users request a feature, evaluate priority
2. **Performance Need**: If performance issues arise, prioritize optimizations
3. **Integration Need**: If integration with other tools is needed
4. **Maintenance**: Keep features maintainable and well-documented

### Feature Priority
- **High Priority**: Enhanced export features, advanced filtering
- **Medium Priority**: Async I/O refactoring (if performance issues)
- **Low Priority**: Additional metadata sources, database integration

### Feature Implementation Checklist
- [ ] Read design document
- [ ] Create implementation plan
- [ ] Implement feature
- [ ] Test thoroughly
- [ ] Update documentation
- [ ] Update user guide (if applicable)
- [ ] Ensure backward compatibility

---

## Testing Strategy

### Feature Testing
- Test each feature independently
- Test feature combinations
- Test with various data sizes
- Test error handling
- Test performance impact

### Integration Testing
- Test features work together
- Test backward compatibility
- Test configuration options
- Test with real-world data

---

*Features in Phase 4 are implemented on an as-needed basis. See individual design documents in `DOCS/DESIGNS/` for detailed specifications.*
