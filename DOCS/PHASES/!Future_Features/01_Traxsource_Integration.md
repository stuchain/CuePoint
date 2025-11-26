# Step 4.4: Traxsource Integration (OPTIONAL)

**Status**: 📝 Planned (Evaluate Need Based on User Requests)  
**Priority**: 🚀 Medium Priority (Only if users request additional metadata sources)  
**Estimated Duration**: 4-5 days  
**Dependencies**: Phase 0 (backend), Phase 1 (GUI), Phase 3 (performance monitoring)

## Goal
Integrate Traxsource (https://www.traxsource.com/) as an additional metadata source beyond Beatport to provide more comprehensive track information and improve match quality for tracks not available on Beatport.

## Success Criteria
- [ ] Traxsource integration works
- [ ] Results aggregated correctly with Beatport
- [ ] Deduplication works
- [ ] Configuration options available
- [ ] Error handling robust
- [ ] Rate limits respected
- [ ] Performance impact acceptable
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Primary Source**: Beatport (web scraping)
- **Limitations**: Some tracks may not be available on Beatport
- **Opportunity**: Traxsource can fill gaps, especially for house/electronic music
- **Risk**: Web scraping complexity, rate limiting, HTML parsing changes

### Traxsource Overview
- **Website**: https://www.traxsource.com/
- **Focus**: House music, Deep House, Tech House, Techno, and related electronic genres
- **Pros**: 
  - Excellent for house/electronic music
  - Good metadata (BPM, key, genre, label)
  - Similar structure to Beatport
- **Cons**: 
  - Web scraping required (no official API)
  - HTML structure may change
  - Rate limiting needed
- **Use Case**: Fallback when Beatport doesn't have track, especially for house music

### Performance Considerations (Phase 3 Integration)
- **Network Time**: Additional source increases network I/O
- **Cache Strategy**: Cache results from Traxsource
- **Query Performance**: Track query effectiveness
- **Metrics to Track**:
  - Traxsource query times
  - Traxsource match rates
  - Cache hit rates
  - Rate limit usage

### Error Handling Strategy
1. **Web Scraping Failures**: Handle HTML structure changes gracefully
2. **Rate Limiting**: Implement rate limit handling
3. **Network Errors**: Retry with exponential backoff
4. **Parsing Errors**: Handle missing/invalid data gracefully
5. **User Feedback**: Show when Traxsource is enabled/working

### Backward Compatibility
- Traxsource is opt-in (disabled by default)
- Beatport remains primary source
- Existing workflows unchanged
- Results format compatible with existing code

---

## Implementation Steps

### Substep 4.4.1: Create Traxsource Search Module (2-3 days)
**File**: `SRC/traxsource_search.py` (NEW)

**What to implement:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Traxsource Search Module

This module provides integration with Traxsource (https://www.traxsource.com/)
for searching and fetching track metadata.

IMPORTANT: This source is optional and should only be used when Beatport
doesn't provide sufficient results, especially for house music tracks.
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import requests
from urllib.parse import quote_plus
import time
from bs4 import BeautifulSoup
from SRC.utils import retry_with_backoff
from SRC.performance import performance_collector


@dataclass
class TraxsourceResult:
    """Result from Traxsource search"""
    title: str
    artist: str
    label: Optional[str] = None
    genre: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    year: Optional[int] = None
    url: Optional[str] = None
    price: Optional[str] = None
    release_date: Optional[str] = None


class TraxsourceSearcher:
    """Traxsource search and metadata fetcher"""
    
    def __init__(self):
        self.base_url = "https://www.traxsource.com"
        self.rate_limit_delay = 1.0  # Seconds between requests
        self.last_request_time = 0.0
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def _rate_limit(self):
        """Enforce rate limiting"""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.rate_limit_delay:
            time.sleep(self.rate_limit_delay - time_since_last)
        self.last_request_time = time.time()
    
    @retry_with_backoff(max_retries=3)
    def search(self, query: str, max_results: int = 20) -> List[TraxsourceResult]:
        """
        Search Traxsource for tracks.
        
        Args:
            query: Search query (title, artist, or both)
            max_results: Maximum number of results to return
        
        Returns:
            List of TraxsourceResult objects
        """
        search_start_time = time.time()
        
        try:
            self._rate_limit()
            
            # Build search URL
            encoded_query = quote_plus(query)
            search_url = f"{self.base_url}/search?q={encoded_query}"
            
            response = self.session.get(search_url, timeout=30)
            
            if response.status_code != 200:
                return []
            
            # Parse HTML
            soup = BeautifulSoup(response.content, 'html.parser')
            results = []
            
            # Find track listings (adjust selectors based on actual Traxsource HTML structure)
            track_items = soup.select('.track-item, .result-item, [data-track-id]')[:max_results]
            
            for item in track_items:
                try:
                    # Extract title
                    title_elem = item.select_one('.title, .track-title, h3, h4')
                    title = title_elem.get_text(strip=True) if title_elem else ""
                    
                    # Extract artist
                    artist_elem = item.select_one('.artist, .track-artist, .artist-name')
                    artist = artist_elem.get_text(strip=True) if artist_elem else ""
                    
                    # Extract label
                    label_elem = item.select_one('.label, .track-label')
                    label = label_elem.get_text(strip=True) if label_elem else None
                    
                    # Extract genre
                    genre_elem = item.select_one('.genre, .track-genre')
                    genre = genre_elem.get_text(strip=True) if genre_elem else None
                    
                    # Extract BPM
                    bpm_elem = item.select_one('.bpm, .track-bpm')
                    bpm = None
                    if bpm_elem:
                        try:
                            bpm_text = bpm_elem.get_text(strip=True)
                            bpm = float(bpm_text.replace(' BPM', '').strip())
                        except (ValueError, AttributeError):
                            pass
                    
                    # Extract key
                    key_elem = item.select_one('.key, .track-key')
                    key = key_elem.get_text(strip=True) if key_elem else None
                    
                    # Extract URL
                    link_elem = item.select_one('a[href*="/title/"], a[href*="/track/"]')
                    url = None
                    if link_elem:
                        href = link_elem.get('href', '')
                        if href.startswith('/'):
                            url = f"{self.base_url}{href}"
                        else:
                            url = href
                    
                    if title and artist:
                        result = TraxsourceResult(
                            title=title,
                            artist=artist,
                            label=label,
                            genre=genre,
                            bpm=bpm,
                            key=key,
                            url=url
                        )
                        results.append(result)
                
                except Exception as e:
                    # Log error but continue with next item
                    continue
            
            # Track performance
            search_duration = time.time() - search_start_time
            if hasattr(performance_collector, 'record_metadata_source_query'):
                performance_collector.record_metadata_source_query(
                    source="traxsource",
                    query_text=query,
                    execution_time=search_duration,
                    results_found=len(results)
                )
            
            return results
            
        except Exception as e:
            # Log error but don't fail
            return []
    
    @retry_with_backoff(max_retries=3)
    def fetch_track_details(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Fetch detailed track information from Traxsource track page.
        
        Args:
            url: Traxsource track page URL
        
        Returns:
            Dictionary with track details or None if failed
        """
        fetch_start_time = time.time()
        
        try:
            self._rate_limit()
            
            response = self.session.get(url, timeout=30)
            
            if response.status_code != 200:
                return None
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract detailed information
            details = {}
            
            # Extract all available metadata
            # (Adjust selectors based on actual Traxsource HTML structure)
            
            # Title
            title_elem = soup.select_one('h1, .track-title, [data-title]')
            if title_elem:
                details['title'] = title_elem.get_text(strip=True)
            
            # Artist
            artist_elem = soup.select_one('.artist, .track-artist, [data-artist]')
            if artist_elem:
                details['artist'] = artist_elem.get_text(strip=True)
            
            # Label
            label_elem = soup.select_one('.label, .track-label, [data-label]')
            if label_elem:
                details['label'] = label_elem.get_text(strip=True)
            
            # Genre
            genre_elem = soup.select_one('.genre, .track-genre, [data-genre]')
            if genre_elem:
                details['genre'] = genre_elem.get_text(strip=True)
            
            # BPM
            bpm_elem = soup.select_one('.bpm, .track-bpm, [data-bpm]')
            if bpm_elem:
                try:
                    bpm_text = bpm_elem.get_text(strip=True)
                    details['bpm'] = float(bpm_text.replace(' BPM', '').strip())
                except (ValueError, AttributeError):
                    pass
            
            # Key
            key_elem = soup.select_one('.key, .track-key, [data-key]')
            if key_elem:
                details['key'] = key_elem.get_text(strip=True)
            
            # Release date
            date_elem = soup.select_one('.release-date, .date, [data-date]')
            if date_elem:
                details['release_date'] = date_elem.get_text(strip=True)
                # Try to extract year
                try:
                    year_text = details['release_date'].split('-')[0] if '-' in details['release_date'] else details['release_date'][:4]
                    details['year'] = int(year_text)
                except (ValueError, IndexError):
                    pass
            
            return details
            
        except Exception as e:
            # Log error and return None
            return None
```

**Implementation Checklist**:
- [ ] Create `SRC/traxsource_search.py` module
- [ ] Implement `TraxsourceResult` dataclass
- [ ] Implement `TraxsourceSearcher` class
- [ ] Implement search functionality
- [ ] Implement track details fetching
- [ ] Add HTML parsing (adjust selectors based on actual Traxsource structure)
- [ ] Add rate limiting
- [ ] Add error handling
- [ ] Add performance tracking
- [ ] Test with sample queries
- [ ] Test HTML parsing robustness

**Note**: HTML selectors will need to be adjusted based on actual Traxsource website structure. Test and update selectors as needed.

**Error Handling**:
- Handle HTML structure changes
- Handle rate limiting
- Handle network failures
- Handle parsing errors gracefully

---

### Substep 4.4.2: Integrate into Matcher (1-2 days)
**File**: `SRC/matcher.py` (MODIFY)

**What to add:**

```python
from traxsource_search import TraxsourceSearcher
from SRC.config import get_config

def best_match_with_traxsource(
    idx: int,
    track_title: str,
    track_artists: str,
    queries: List[str],
    title_only_mode: bool = False,
    use_traxsource: bool = False,
    input_year: Optional[int] = None,
    input_key: Optional[str] = None,
    input_mix: Optional[Dict[str, object]] = None,
    input_generic_phrases: Optional[List[str]] = None,
) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate]]:
    """
    Find best match using Beatport and optionally Traxsource.
    
    Args:
        idx: Track index
        track_title: Track title
        track_artists: Track artists
        queries: List of search queries
        title_only_mode: Title-only search mode
        use_traxsource: Enable Traxsource as additional source
        input_year: Optional year filter
        input_key: Optional key filter
        input_mix: Optional mix information
        input_generic_phrases: Optional generic phrases to remove
    
    Returns:
        Tuple of (best_match, all_candidates)
    """
    # First, try Beatport (existing logic)
    best_beatport, candidates_beatport = best_beatport_match(
        idx, track_title, track_artists, title_only_mode, queries,
        input_year, input_key, input_mix, input_generic_phrases
    )
    
    if not use_traxsource:
        return best_beatport, candidates_beatport
    
    # Search Traxsource only if Beatport didn't find a good match
    if best_beatport and best_beatport.match_score >= 80:
        # Good match from Beatport, no need for Traxsource
        return best_beatport, candidates_beatport
    
    # Search Traxsource
    traxsource_searcher = TraxsourceSearcher()
    
    # Build search query
    search_query = f"{track_artists} {track_title}" if not title_only_mode else track_title
    traxsource_results = traxsource_searcher.search(search_query, max_results=20)
    
    # Convert to BeatportCandidate format for consistency
    traxsource_candidates = []
    for result in traxsource_results:
        candidate = BeatportCandidate(
            beatport_title=result.title,
            beatport_artists=result.artist,
            beatport_url=result.url or "",
            match_score=0.0,  # Will be scored
            beatport_key=result.key or "",
            beatport_bpm=result.bpm,
            beatport_year=result.year,
            beatport_label=result.label or "",
            beatport_genres=[result.genre] if result.genre else [],
            beatport_release=None,
            beatport_release_date=result.release_date
        )
        
        # Score candidate (reuse existing scoring logic)
        candidate.match_score = score_candidate(
            candidate, track_title, track_artists, title_only_mode,
            input_year, input_key, input_mix
        )
        
        traxsource_candidates.append(candidate)
    
    # Combine with Beatport results
    all_candidates = candidates_beatport + traxsource_candidates
    
    # Find best match
    best = max(all_candidates, key=lambda c: c.match_score) if all_candidates else None
    
    return best, all_candidates
```

**Implementation Checklist**:
- [ ] Modify matcher to support Traxsource
- [ ] Add configuration check for Traxsource enablement
- [ ] Convert Traxsource results to candidate format
- [ ] Score Traxsource candidates
- [ ] Combine results from both sources
- [ ] Test integration
- [ ] Test with various tracks

---

### Substep 4.4.3: Add Configuration and GUI Integration (1-2 days)
**Files**: `SRC/config.py` (MODIFY), `SRC/gui/config_panel.py` (MODIFY), `SRC/gui/results_view.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.3 (config panel exists), Substep 4.4.1 (Traxsource searcher exists), Substep 4.4.2 (matcher integration)

**What to implement - EXACT STRUCTURE:**

#### Part A: Configuration Module Updates

**In `SRC/config.py`:**

```python
# Traxsource Configuration
USE_TRAXSOURCE = False  # Default disabled (opt-in)
TRAXSOURCE_MAX_RESULTS = 20  # Max results per search
TRAXSOURCE_RATE_LIMIT_DELAY = 1.0  # Delay between requests (seconds)
TRAXSOURCE_TIMEOUT = 30  # Request timeout (seconds)
TRAXSOURCE_RETRY_ATTEMPTS = 3  # Retry attempts for failed requests

def get_traxsource_config() -> Dict[str, Any]:
    """Get Traxsource configuration"""
    return {
        "enabled": USE_TRAXSOURCE,
        "max_results": TRAXSOURCE_MAX_RESULTS,
        "rate_limit_delay": TRAXSOURCE_RATE_LIMIT_DELAY,
        "timeout": TRAXSOURCE_TIMEOUT,
        "retry_attempts": TRAXSOURCE_RETRY_ATTEMPTS
    }

def set_traxsource_config(enabled: bool, max_results: int = 20):
    """Set Traxsource configuration"""
    global USE_TRAXSOURCE, TRAXSOURCE_MAX_RESULTS
    USE_TRAXSOURCE = enabled
    TRAXSOURCE_MAX_RESULTS = max_results
```

#### Part B: GUI Configuration Panel Integration

**In `SRC/gui/config_panel.py`:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QCheckBox,
    QSpinBox, QLabel, QPushButton, QMessageBox
)
from PySide6.QtCore import Qt
from SRC.config import get_traxsource_config, set_traxsource_config

class ConfigPanel(QWidget):
    """Configuration panel with Traxsource options"""
    
    def init_ui(self):
        """Initialize configuration UI"""
        layout = QVBoxLayout(self)
        
        # ... existing configuration groups ...
        
        # NEW: Traxsource Settings Group (in Advanced Settings)
        traxsource_group = QGroupBox("Additional Metadata Sources (Advanced)")
        traxsource_group.setCheckable(False)
        traxsource_layout = QVBoxLayout()
        
        # Traxsource Enable Checkbox
        self.use_traxsource_check = QCheckBox("Use Traxsource as additional metadata source")
        self.use_traxsource_check.setChecked(False)
        self.use_traxsource_check.setToolTip(
            "Enable Traxsource (https://www.traxsource.com/) as an additional metadata source.\n\n"
            "Benefits:\n"
            "- More comprehensive track information\n"
            "- Better matches for house/electronic music\n"
            "- Fallback when Beatport doesn't have track\n\n"
            "When to use:\n"
            "- Processing house, deep house, tech house, or techno tracks\n"
            "- Beatport doesn't find good matches\n"
            "- You want more comprehensive metadata\n\n"
            "Considerations:\n"
            "- Slightly slower processing (additional source)\n"
            "- Web scraping (no official API)\n"
            "- Rate limiting applied automatically"
        )
        traxsource_layout.addWidget(self.use_traxsource_check)
        
        # Traxsource settings (enabled when checkbox is checked)
        self.traxsource_settings_widget = QWidget()
        traxsource_settings_layout = QVBoxLayout()
        traxsource_settings_layout.setContentsMargins(20, 10, 10, 10)
        
        # Max results per search
        max_results_layout = QHBoxLayout()
        max_results_layout.addWidget(QLabel("Max Results per Search:"))
        self.traxsource_max_results = QSpinBox()
        self.traxsource_max_results.setMinimum(5)
        self.traxsource_max_results.setMaximum(50)
        self.traxsource_max_results.setValue(20)
        self.traxsource_max_results.setToolTip(
            "Maximum number of results to fetch from Traxsource per search.\n"
            "Higher values = more candidates but slower searches.\n"
            "Recommended: 10-30 for most cases."
        )
        max_results_layout.addWidget(self.traxsource_max_results)
        max_results_layout.addStretch()
        traxsource_settings_layout.addLayout(max_results_layout)
        
        # Info label
        self.traxsource_info_label = QLabel("")
        self.traxsource_info_label.setWordWrap(True)
        self.traxsource_info_label.setStyleSheet("color: blue; font-style: italic;")
        traxsource_settings_layout.addWidget(self.traxsource_info_label)
        
        # Info button
        info_button = QPushButton("ℹ️ About Traxsource Integration")
        info_button.setToolTip("Show information about Traxsource integration")
        info_button.clicked.connect(self.show_traxsource_info)
        traxsource_settings_layout.addWidget(info_button)
        
        self.traxsource_settings_widget.setLayout(traxsource_settings_layout)
        self.traxsource_settings_widget.setEnabled(False)  # Disabled by default
        
        traxsource_layout.addWidget(self.traxsource_settings_widget)
        traxsource_group.setLayout(traxsource_layout)
        
        # Add to Advanced Settings group
        layout.addWidget(traxsource_group)
        
        # Connect signals
        self.use_traxsource_check.toggled.connect(self._on_traxsource_toggled)
        self.traxsource_max_results.valueChanged.connect(self._update_traxsource_info)
    
    def _on_traxsource_toggled(self, checked: bool):
        """Handle Traxsource checkbox toggle"""
        self.traxsource_settings_widget.setEnabled(checked)
        self._update_traxsource_info()
    
    def _update_traxsource_info(self):
        """Update Traxsource info label"""
        if not self.use_traxsource_check.isChecked():
            self.traxsource_info_label.setText("")
            return
        
        max_results = self.traxsource_max_results.value()
        info = (
            f"Traxsource will be used as a fallback when Beatport doesn't find good matches. "
            f"Up to {max_results} results per search. "
            f"Especially useful for house, deep house, tech house, and techno tracks."
        )
        self.traxsource_info_label.setText(info)
    
    def show_traxsource_info(self):
        """Show information dialog about Traxsource integration"""
        info_text = """
<h3>Traxsource Integration Information</h3>

<p><b>What is Traxsource?</b></p>
<p>Traxsource (https://www.traxsource.com/) is a digital music store specializing in 
house music, deep house, tech house, techno, and related electronic genres.</p>

<p><b>Why Use Traxsource?</b></p>
<ul>
<li>More comprehensive track information for electronic music</li>
<li>Better matches for house/electronic tracks not on Beatport</li>
<li>Additional metadata source to improve match quality</li>
<li>Fallback when Beatport doesn't find good matches</li>
</ul>

<p><b>How It Works:</b></p>
<ul>
<li>Traxsource is used as a <b>fallback</b> source, not a replacement</li>
<li>Beatport remains the primary metadata source</li>
<li>Traxsource is only queried when Beatport doesn't find good matches</li>
<li>Results from both sources are combined and deduplicated</li>
<li>Best match is selected from combined results</li>
</ul>

<p><b>When to Enable:</b></p>
<ul>
<li>Processing house, deep house, tech house, or techno tracks</li>
<li>Beatport frequently doesn't find matches</li>
<li>You want more comprehensive metadata coverage</li>
<li>You're processing electronic music playlists</li>
</ul>

<p><b>When NOT to Enable:</b></p>
<ul>
<li>Processing non-electronic music (pop, rock, etc.)</li>
<li>Beatport already finds good matches</li>
<li>You want fastest processing speed</li>
<li>You have limited network bandwidth</li>
</ul>

<p><b>Performance Impact:</b></p>
<ul>
<li>Processing time: +10-20% when Traxsource is queried</li>
<li>Network requests: Additional requests only when needed</li>
<li>Rate limiting: Automatic delays between requests</li>
<li>Cache: Results are cached to minimize repeated requests</li>
</ul>

<p><b>Configuration:</b></p>
<ul>
<li><b>Max Results per Search:</b> How many results to fetch (10-30 recommended)</li>
<li>Higher values = more candidates but slower searches</li>
</ul>

<p><b>Note:</b> Traxsource integration uses web scraping (no official API). 
The HTML structure may change, requiring updates to the code.</p>
"""
        
        msg = QMessageBox(self)
        msg.setWindowTitle("Traxsource Integration Information")
        msg.setTextFormat(Qt.RichText)
        msg.setText(info_text)
        msg.setStandardButtons(QMessageBox.Ok)
        msg.exec()
    
    def get_settings(self) -> Dict[str, Any]:
        """Get all settings including Traxsource"""
        settings = {
            # ... existing settings ...
            "use_traxsource": self.use_traxsource_check.isChecked(),
            "traxsource_max_results": self.traxsource_max_results.value(),
        }
        return settings
    
    def load_settings(self):
        """Load settings from config"""
        from SRC.config import get_traxsource_config
        
        config = get_traxsource_config()
        self.use_traxsource_check.setChecked(config.get("enabled", False))
        self.traxsource_max_results.setValue(config.get("max_results", 20))
        
        # Update widget state
        self._on_traxsource_toggled(self.use_traxsource_check.isChecked())
    
    def save_settings(self):
        """Save settings to config"""
        from SRC.config import set_traxsource_config
        
        set_traxsource_config(
            enabled=self.use_traxsource_check.isChecked(),
            max_results=self.traxsource_max_results.value()
        )
```

#### Part C: Results View Integration (Show Source)

**In `SRC/gui/results_view.py`:**

```python
# Add source column to results table to show if match came from Beatport or Traxsource

def _populate_table(self, results: List[TrackResult]):
    """Populate table with results (enhanced to show source)"""
    # ... existing table setup ...
    
    # Add "Source" column header
    headers = [
        "Index", "Title", "Artist", "Matched", "Beatport Title",
        "Beatport Artist", "Score", "Confidence", "Key", "BPM", "Year", "Source"  # NEW
    ]
    self.table.setHorizontalHeaderLabels(headers)
    
    # ... existing row population ...
    
    # NEW: Source column
    source_item = QTableWidgetItem(result.metadata_source or "Beatport")
    source_item.setTextAlignment(Qt.AlignCenter)
    if result.metadata_source == "Traxsource":
        source_item.setForeground(Qt.darkBlue)
        source_item.setToolTip("Match found via Traxsource")
    else:
        source_item.setForeground(Qt.darkGreen)
        source_item.setToolTip("Match found via Beatport")
    self.table.setItem(row, 11, source_item)  # Source column
```

**Implementation Checklist**:
- [ ] Add Traxsource configuration to config.py
- [ ] Add Traxsource settings group to config panel
- [ ] Add enable checkbox with tooltip
- [ ] Add max results spinbox
- [ ] Add info label
- [ ] Add info dialog button
- [ ] Connect signals for dynamic updates
- [ ] Add source column to results view
- [ ] Add settings loading/saving
- [ ] Test configuration persistence
- [ ] Test UI interactions

---

### Substep 4.4.4: Comprehensive Testing (2-3 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_traxsource.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for Traxsource integration.

Tests search, parsing, rate limiting, error handling, and integration.
"""

import unittest
import time
from unittest.mock import Mock, patch, MagicMock
from SRC.traxsource_search import TraxsourceSearcher, TraxsourceResult
from SRC.matcher import best_beatport_match

class TestTraxsource(unittest.TestCase):
    """Comprehensive tests for Traxsource functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.searcher = TraxsourceSearcher()
    
    def test_traxsource_search_basic(self):
        """Test Traxsource search basic functionality"""
        results = self.searcher.search("test track", max_results=10)
        self.assertIsInstance(results, list)
        self.assertLessEqual(len(results), 10)
        
        for result in results:
            self.assertIsInstance(result, TraxsourceResult)
            self.assertTrue(result.title)
            self.assertTrue(result.artist)
            self.assertIsNotNone(result.url)
    
    def test_traxsource_search_empty_query(self):
        """Test Traxsource search with empty query"""
        results = self.searcher.search("", max_results=10)
        self.assertIsInstance(results, list)
        # Should handle gracefully
    
    def test_traxsource_search_max_results(self):
        """Test Traxsource search respects max_results"""
        results = self.searcher.search("house", max_results=5)
        self.assertLessEqual(len(results), 5)
    
    def test_traxsource_fetch_track_details(self):
        """Test fetching track details from Traxsource"""
        test_url = "https://www.traxsource.com/track/123456/test-track"
        details = self.searcher.fetch_track_details(test_url)
        
        self.assertIsNotNone(details)
        self.assertTrue(details.title)
        self.assertTrue(details.artist)
        # Check optional fields
        if details.bpm:
            self.assertIsInstance(details.bpm, (int, str))
        if details.key:
            self.assertIsInstance(details.key, str)
    
    def test_traxsource_rate_limiting(self):
        """Test rate limiting between requests"""
        start_time = time.time()
        
        # Make multiple requests
        for i in range(3):
            self.searcher.search(f"test {i}", max_results=1)
        
        elapsed = time.time() - start_time
        
        # Should have delays between requests (at least 2 seconds for 3 requests)
        self.assertGreaterEqual(elapsed, 2.0, 
                               "Rate limiting should add delays between requests")
    
    def test_traxsource_error_handling_404(self):
        """Test error handling for 404 errors"""
        invalid_url = "https://www.traxsource.com/track/999999999/invalid"
        details = self.searcher.fetch_track_details(invalid_url)
        self.assertIsNone(details)
    
    def test_traxsource_error_handling_network_error(self):
        """Test error handling for network errors"""
        with patch('requests.get', side_effect=Exception("Network error")):
            results = self.searcher.search("test", max_results=5)
            # Should handle gracefully, return empty list or handle error
            self.assertIsInstance(results, list)
    
    def test_traxsource_html_parsing(self):
        """Test HTML parsing for Traxsource results"""
        # Mock HTML response
        mock_html = """
        <html>
            <div class="track-title">Test Track</div>
            <div class="track-artist">Test Artist</div>
            <div class="track-bpm">128</div>
            <div class="track-key">C Major</div>
        </html>
        """
        
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.text = mock_html
            mock_response.status_code = 200
            mock_get.return_value = mock_response
            
            # Test parsing
            # This would test the actual parsing logic
            pass
    
    def test_traxsource_result_conversion(self):
        """Test conversion of TraxsourceResult to BeatportCandidate"""
        from SRC.traxsource_search import TraxsourceResult
        from SRC.matcher import BeatportCandidate
        
        traxsource_result = TraxsourceResult(
            title="Test Track",
            artist="Test Artist",
            url="https://www.traxsource.com/track/123",
            bpm="128",
            key="C Major",
            year=2023,
            label="Test Label",
            genre="House",
            release_date="2023-01-15"
        )
        
        # Convert to candidate
        candidate = BeatportCandidate(
            beatport_title=traxsource_result.title,
            beatport_artists=traxsource_result.artist,
            beatport_url=traxsource_result.url,
            match_score=0.0,
            beatport_key=traxsource_result.key,
            beatport_bpm=traxsource_result.bpm,
            beatport_year=traxsource_result.year,
            beatport_label=traxsource_result.label,
            beatport_genres=[traxsource_result.genre] if traxsource_result.genre else [],
            beatport_release=None,
            beatport_release_date=traxsource_result.release_date
        )
        
        self.assertEqual(candidate.beatport_title, "Test Track")
        self.assertEqual(candidate.beatport_artists, "Test Artist")
        self.assertEqual(candidate.beatport_bpm, "128")
        self.assertEqual(candidate.beatport_key, "C Major")
    
    def test_traxsource_retry_logic(self):
        """Test retry logic for failed requests"""
        call_count = 0
        
        def mock_get(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Temporary error")
            mock_response = Mock()
            mock_response.text = "<html>Success</html>"
            mock_response.status_code = 200
            return mock_response
        
        with patch('requests.get', side_effect=mock_get):
            # Should retry and eventually succeed
            result = self.searcher.fetch_track_details("https://test.com/track/123")
            self.assertEqual(call_count, 3)

if __name__ == '__main__':
    unittest.main()
```

#### Part B: Integration Tests (`SRC/test_traxsource_integration.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for Traxsource functionality.

Tests end-to-end integration with matcher and full processing pipeline.
"""

import unittest
from unittest.mock import Mock, patch
from SRC.matcher import best_beatport_match
from SRC.config import set_traxsource_config, get_traxsource_config

class TestTraxsourceIntegration(unittest.TestCase):
    """Integration tests for Traxsource workflow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.original_config = get_traxsource_config()
    
    def tearDown(self):
        """Clean up test fixtures"""
        set_traxsource_config(
            enabled=self.original_config.get("enabled", False),
            max_results=self.original_config.get("max_results", 20)
        )
    
    def test_matcher_uses_traxsource_when_enabled(self):
        """Test that matcher uses Traxsource when enabled"""
        set_traxsource_config(enabled=True, max_results=20)
        
        # Mock Traxsource search
        with patch('SRC.traxsource_search.TraxsourceSearcher.search') as mock_search:
            mock_search.return_value = [
                Mock(title="Traxsource Track", artist="Traxsource Artist", url="https://traxsource.com/track/1")
            ]
            
            # Call matcher
            result = best_beatport_match(
                idx=1,
                track_title="Test Track",
                track_artists_for_scoring="Test Artist",
                title_only_mode=False,
                queries=["test query"]
            )
            
            # Verify Traxsource was called
            mock_search.assert_called()
    
    def test_matcher_skips_traxsource_when_disabled(self):
        """Test that matcher skips Traxsource when disabled"""
        set_traxsource_config(enabled=False)
        
        with patch('SRC.traxsource_search.TraxsourceSearcher.search') as mock_search:
            # Call matcher
            result = best_beatport_match(
                idx=1,
                track_title="Test Track",
                track_artists_for_scoring="Test Artist",
                title_only_mode=False,
                queries=["test query"]
            )
            
            # Verify Traxsource was NOT called
            mock_search.assert_not_called()
    
    def test_results_aggregation(self):
        """Test that results from Beatport and Traxsource are aggregated"""
        set_traxsource_config(enabled=True)
        
        # Mock both sources
        with patch('SRC.beatport_search.search_track_urls') as mock_beatport, \
             patch('SRC.traxsource_search.TraxsourceSearcher.search') as mock_traxsource:
            
            mock_beatport.return_value = ["https://beatport.com/track/1"]
            mock_traxsource.return_value = [
                Mock(title="Traxsource Track", artist="Artist", url="https://traxsource.com/track/1")
            ]
            
            result = best_beatport_match(
                idx=1,
                track_title="Test Track",
                track_artists_for_scoring="Test Artist",
                title_only_mode=False,
                queries=["test query"]
            )
            
            # Both sources should be called
            mock_beatport.assert_called()
            mock_traxsource.assert_called()

if __name__ == '__main__':
    unittest.main()
```

#### Part C: GUI Integration Tests (`SRC/test_traxsource_gui.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for Traxsource configuration.

Tests UI interactions and settings persistence.
"""

import unittest
from unittest.mock import Mock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.config_panel import ConfigPanel

class TestTraxsourceGUI(unittest.TestCase):
    """Tests for Traxsource GUI components"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.panel = ConfigPanel()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.panel.close()
    
    def test_traxsource_checkbox_exists(self):
        """Test Traxsource checkbox exists"""
        self.assertIsNotNone(self.panel.use_traxsource_check)
        self.assertFalse(self.panel.use_traxsource_check.isChecked())  # Default disabled
    
    def test_traxsource_settings_disabled_by_default(self):
        """Test Traxsource settings are disabled when checkbox is unchecked"""
        self.assertFalse(self.panel.use_traxsource_check.isChecked())
        self.assertFalse(self.panel.traxsource_settings_widget.isEnabled())
    
    def test_traxsource_settings_enabled_when_checked(self):
        """Test Traxsource settings are enabled when checkbox is checked"""
        self.panel.use_traxsource_check.setChecked(True)
        QApplication.processEvents()
        self.assertTrue(self.panel.traxsource_settings_widget.isEnabled())
    
    def test_max_results_spinbox(self):
        """Test max results spinbox"""
        self.assertIsNotNone(self.panel.traxsource_max_results)
        self.assertEqual(self.panel.traxsource_max_results.value(), 20)  # Default
        self.assertEqual(self.panel.traxsource_max_results.minimum(), 5)
        self.assertEqual(self.panel.traxsource_max_results.maximum(), 50)
    
    def test_settings_save_and_load(self):
        """Test settings save and load correctly"""
        # Set values
        self.panel.use_traxsource_check.setChecked(True)
        self.panel.traxsource_max_results.setValue(30)
        
        # Save
        self.panel.save_settings()
        
        # Reset
        self.panel.use_traxsource_check.setChecked(False)
        self.panel.traxsource_max_results.setValue(20)
        
        # Load
        self.panel.load_settings()
        
        # Verify values restored
        self.assertTrue(self.panel.use_traxsource_check.isChecked())
        self.assertEqual(self.panel.traxsource_max_results.value(), 30)

if __name__ == '__main__':
    unittest.main()
```

#### Part D: Manual Testing Checklist

**UI Testing Checklist**:
- [ ] Traxsource checkbox is visible in Advanced Settings
- [ ] Checkbox is unchecked by default
- [ ] Traxsource settings are disabled when checkbox is unchecked
- [ ] Traxsource settings are enabled when checkbox is checked
- [ ] Max results spinbox works correctly
- [ ] Info label updates when settings change
- [ ] Info button opens information dialog
- [ ] Tooltips are helpful and accurate
- [ ] Settings save correctly
- [ ] Settings load correctly
- [ ] Settings persist across application restarts
- [ ] Source column appears in results table
- [ ] Source column shows "Beatport" or "Traxsource" correctly
- [ ] Source column color coding works (green for Beatport, blue for Traxsource)

**Functional Testing Checklist**:
- [ ] Traxsource can be enabled/disabled
- [ ] Matcher uses Traxsource when enabled
- [ ] Matcher skips Traxsource when disabled
- [ ] Traxsource search works correctly
- [ ] Traxsource results are converted to candidates correctly
- [ ] Results from Beatport and Traxsource are aggregated
- [ ] Deduplication works (same track from both sources)
- [ ] Best match selection works with combined results
- [ ] Rate limiting works correctly
- [ ] Error handling works (network errors, 404s, etc.)
- [ ] Retry logic works for failed requests
- [ ] Performance impact is acceptable (+10-20% when used)
- [ ] Cache works for Traxsource results

**Performance Testing Checklist**:
- [ ] Traxsource queries complete in reasonable time (< 5 seconds)
- [ ] Rate limiting prevents excessive requests
- [ ] Total processing time increase is acceptable (+10-20%)
- [ ] Memory usage is reasonable
- [ ] Network usage is efficient
- [ ] Cache reduces repeated requests

**Error Scenario Testing**:
- [ ] Network errors handled gracefully
- [ ] 404 errors handled gracefully
- [ ] HTML parsing errors handled gracefully
- [ ] Rate limiting errors handled gracefully
- [ ] Invalid URLs handled gracefully
- [ ] Traxsource failures don't crash application
- [ ] Falls back to Beatport only when Traxsource fails
- [ ] Error messages are clear and helpful

**Cross-Step Integration Testing**:
- [ ] Traxsource works with Phase 3 performance tracking
- [ ] Traxsource metrics appear in performance dashboard
- [ ] Traxsource works with Step 4.1 (Enhanced Export)
- [ ] Traxsource works with Step 4.2 (Advanced Filtering)
- [ ] Traxsource works with Step 4.3 (Async I/O)
- [ ] Settings integrate with existing configuration system

**Acceptance Criteria Verification**:
- ✅ Traxsource integration works
- ✅ Results aggregated correctly with Beatport
- ✅ Deduplication works
- ✅ Configuration options available
- ✅ Error handling robust
- ✅ Rate limits respected
- ✅ Performance impact acceptable
- ✅ UI is intuitive and helpful
- ✅ All tests passing
- ✅ Manual testing complete

---

## Testing Requirements

### Unit Tests
- [ ] Test Traxsource search
- [ ] Test track details fetching
- [ ] Test HTML parsing
- [ ] Test rate limiting
- [ ] Test error handling
- [ ] Minimum 80% code coverage

### Integration Tests
- [ ] Test with matcher
- [ ] Test with real tracks
- [ ] Test configuration
- [ ] Test performance impact

### Performance Tests
- [ ] Measure query time
- [ ] Measure total time with Traxsource
- [ ] Validate Phase 3 metrics
- [ ] Test rate limiting effectiveness

---

## Error Handling

### Error Scenarios
1. **Web Scraping Failures**
   - HTML structure changes → Update selectors, handle gracefully
   - Rate limiting → Implement delays
   - Network errors → Retry with backoff

2. **Parsing Errors**
   - Missing fields → Handle gracefully
   - Invalid data → Validate and filter

3. **Source Failures**
   - Traxsource fails → Fall back to Beatport only

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Traxsource is opt-in (disabled by default)
- [ ] Beatport remains primary source
- [ ] Existing workflows unchanged
- [ ] Results format compatible

---

## Documentation Requirements

### User Guide Updates
- [ ] Document Traxsource integration
- [ ] Explain when to use it
- [ ] Explain rate limiting
- [ ] Provide usage examples

### API Documentation
- [ ] Document TraxsourceSearcher class
- [ ] Document configuration options
- [ ] Document error conditions

---

## Phase 3 Integration

### Performance Metrics
- [ ] Track Traxsource query time
- [ ] Track Traxsource match rate
- [ ] Track cache hit rates
- [ ] Compare with Beatport effectiveness

---

## Acceptance Criteria
- ✅ Traxsource integration works
- ✅ Results aggregated correctly with Beatport
- ✅ Deduplication works
- ✅ Configuration options available
- ✅ Error handling robust
- ✅ Rate limits respected
- ✅ Performance impact acceptable
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 4.4.1: Create Traxsource Search Module
- [ ] Substep 4.4.2: Integrate into Matcher
- [ ] Substep 4.4.3: Add Configuration and GUI Options
- [ ] Substep 4.4.4: Testing
- [ ] Documentation updated
- [ ] All tests passing

---

**IMPORTANT**: Only implement this step if users request Traxsource integration. Evaluate need based on user feedback.

**Note**: HTML selectors in the code will need to be adjusted based on the actual Traxsource website structure. Test the website and update selectors accordingly.

**Next Step**: After evaluation, proceed to Step 4.5 (CLI Interface) or other Phase 4 steps based on priority.

