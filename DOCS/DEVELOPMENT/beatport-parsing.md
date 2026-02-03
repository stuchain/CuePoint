# Beatport Parsing Logic

Design 10.4. How to update Beatport parsing safely.

## Overview

Beatport data is fetched and parsed in `SRC/cuepoint/data/beatport.py`:

- **`track_urls()`**: Finds Beatport track URLs via DuckDuckGo, direct search, or browser
- **`parse_track_page()`**: Parses a single Beatport track page and extracts metadata

Beatport’s HTML structure can change. When it does, parsing may break.

## Key Functions

| Function | Purpose |
| --- | --- |
| `track_urls(idx, query, max_results)` | Get list of Beatport track URLs for a search query |
| `parse_track_page(url)` | Fetch page, extract title, artists, key, BPM, year, label, etc. |
| `beatport_search_direct()` | Direct Beatport site search (via `beatport_search.py`) |
| `ddg_track_urls()` | DuckDuckGo search for Beatport links |

## Data Sources (parse_track_page)

Parsing uses multiple sources, in order:

1. **JSON-LD**: Structured data in `<script type="application/ld+json">`
2. **Next.js `__NEXT_DATA__`**: Client-side app state
3. **HTML fallback**: BeautifulSoup parsing of HTML when JSON is missing

When Beatport changes their page structure, one or more of these may break.

## Safe Update Process

1. **Capture a real page** (or use existing fixtures in `SRC/tests/fixtures/beatport/`)
2. **Identify the change**: Compare old vs new HTML/JSON structure
3. **Update the parser** in `beatport.py`:
   - Prefer JSON-LD / `__NEXT_DATA__` over raw HTML when possible
   - Add fallbacks for missing fields
4. **Add or update fixtures** in `SRC/tests/fixtures/beatport/`
5. **Run integration tests**:
   ```bash
   python scripts/run_tests.py --integration -k beatport
   ```
6. **Run full test suite** to avoid regressions

## Fixtures

- `SRC/tests/fixtures/beatport/search_results_standard.html`
- `SRC/tests/fixtures/beatport/track_page_standard.html`

Tests mock `requests` to return these fixtures. When Beatport changes, update fixtures to match new structure and adjust parsing logic.

## Common Parsing Patterns

- **`val_after_label()`**: Extract value after a label like "Key:", "BPM:" in HTML
- **`_extract_json_ld()`**: Parse JSON-LD block
- **`_extract_next_data()`**: Parse `__NEXT_DATA__` script

## Testing Parsing Changes

```bash
# Unit tests for parse_track_page (mocked HTTP)
pytest SRC/tests/integration/test_beatport_data_integration.py -v -k "parse_track"

# Full Beatport integration tests
python scripts/run_tests.py --integration -k beatport
```

## Related

- [Architecture](architecture.md)
- [Testing Strategy](testing-strategy.md)
