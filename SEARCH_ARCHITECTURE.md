# Beatport Search Architecture

## Overview
The application now uses a **multi-layered search architecture** with automatic fallback to ensure maximum reliability:

1. **Direct Beatport API/HTML Scraping** (fast, no dependencies)
2. **Browser Automation** (Playwright/Selenium) - most reliable but slower
3. **DuckDuckGo Search** (fallback when others fail)

## Search Flow

```
Query → Direct Search (API + HTML) 
      → Browser Automation (if enabled)
      → DuckDuckGo (fallback)
      → Results
```

## Configuration

### Settings in `config.py`:

- `USE_DIRECT_SEARCH_FOR_REMIXES: True` - Auto-use direct search for remix queries
- `PREFER_DIRECT_SEARCH: False` - Use direct search for all queries (not just remixes)
- `USE_BROWSER_AUTOMATION: False` - Enable browser automation fallback (slower but most reliable)
- `BROWSER_TIMEOUT_SEC: 30` - Timeout for browser operations

## Installation

### Basic (no browser automation)
No additional dependencies needed - uses HTML scraping and API discovery.

### With Browser Automation (recommended for maximum reliability)

**Option 1: Playwright (recommended)**
```bash
pip install playwright
playwright install chromium
```

**Option 2: Selenium**
```bash
pip install selenium
# Also need ChromeDriver in PATH
```

## How It Works

### 1. Direct Search (`beatport_search_direct`)
- **Tries API endpoints first**: Common patterns like `/api/search/tracks`, `/api/v4/search`
- **Parses HTML**: Looks for track links in the search page HTML
- **Extracts from __NEXT_DATA__**: Parses Next.js data structure for track information
- **Regex fallback**: Finds track URLs in script tags

### 2. Browser Automation (`beatport_search_browser`)
- **Playwright**: Modern, fast browser automation
- **Selenium**: Fallback if Playwright unavailable
- **Fully renders JavaScript**: Gets all dynamically loaded content
- **Most reliable**: Works even when pages are heavily JavaScript-dependent

### 3. DuckDuckGo (`ddg_track_urls`)
- **Fallback method**: Used when direct methods don't find results
- **Multiple query strategies**: Quoted/unquoted, site-specific searches
- **Cached results**: Benefits from request caching

## Usage

The system automatically chooses the best method based on:
1. Query type (remixes use direct search by default)
2. Configuration settings
3. Availability of browser automation libraries

No code changes needed - it's all automatic!

## Troubleshooting

**If direct search finds 0 results:**
- Beatport's page is JavaScript-rendered (Next.js)
- Enable `USE_BROWSER_AUTOMATION: True` in settings
- Install Playwright: `pip install playwright && playwright install chromium`

**If API endpoints fail:**
- Beatport may have changed their API structure
- Direct HTML parsing will still work for static content
- Browser automation will work regardless

**Performance:**
- Direct search: Fast (~1-2 seconds)
- Browser automation: Slower (~5-10 seconds per query)
- DuckDuckGo: Medium (~2-5 seconds)

For best results with remix tracks, enable browser automation.

