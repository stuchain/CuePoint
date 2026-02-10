# Beatport Search and Track Fetching

## What it is (high-level)

CuePoint uses **Beatport’s website** as the metadata source: it does not use an official Beatport API. For each search query it:

1. **Searches** Beatport (e.g. search page or DDG-style results) and gets a list of **track URLs** (and optionally snippet data).
2. **Fetches** each track page, parses HTML/JSON-LD/Next data to extract: title, artists, key, BPM, year, label, genre, release, URL, etc.
3. **Caches** responses (in-memory and/or disk) to avoid repeated requests and to stay within rate limits. Circuit breaker and retries are applied at the service/HTTP layer.

Search and fetch are **provider-based**: the code is structured so that “Beatport” is one provider; the CLI has a `--provider` option for future expansion.

## How it is implemented (code)

- **Search**  
  - **File:** `src/cuepoint/data/beatport_search.py`  
  - **Function:** `beatport_search_direct(idx, query, max_results=50)` (or similar) — performs the actual HTTP request and parses the search results page.  
  - **Helpers:** e.g. `_extract_track_ids_from_next_data(data, seen, urls, max_results)` to pull track IDs/URLs from Beatport’s client-side data (Next.js / `__NEXT_DATA__` or similar).  
  - Returns a list of track URLs (or IDs) to fetch.

- **Track page fetch and parse**  
  - **File:** `src/cuepoint/data/beatport.py`  
  - **Functions:**  
    - `parse_track_page(soup_or_html, url)` (or similar) — given the HTML of a track page, returns a structured dict (title, artists, key, BPM, year, label, etc.).  
    - Parsing uses: `_parse_structured_json_ld(soup)`, `_parse_next_data(soup)` and similar to read JSON-LD and Next data embedded in the page.  
  - **URLs:** `track_urls(track_id)` or similar to build Beatport track URLs.  
  - **Cache:** `get_last_cache_hit()` (or cache layer) used by the matcher to avoid re-fetching; cache can be in-memory and/or persisted (see `cache_service`, `http_cache`).

- **Provider abstraction**  
  - **File:** `src/cuepoint/data/providers.py`  
  - **Class:** `BeatportProvider` (or similar) — implements the interface used by the processor/matcher: search(query) → URLs, fetch(url) → track dict.  
  - **File:** `src/cuepoint/services/beatport_service.py` — service that uses the provider and applies retries, circuit breaker, and logging.

- **Usage**  
  - **Matcher:** `src/cuepoint/core/matcher.py` (and/or matcher_service) calls the Beatport service/provider to run searches and fetch candidate pages, then passes the parsed candidate data to the scoring logic.

So: **what the feature is** = “search Beatport and fetch track metadata from its pages”; **how it’s implemented** = `beatport_search.py` (search) + `beatport.py` (parse) + providers + beatport_service, with caching and reliability around it.
