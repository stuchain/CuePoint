# Query Generation

## What it is (high-level)

Before searching Beatport, CuePoint turns each Rekordbox track (title + artists) into a set of **search query variants**. The goal is to increase the chance of finding the right release by trying different phrasings (full title+artist, n-grams, remix-specific queries, “artist – title” vs “title (remix)”, etc.). Query generation is **configurable**: time budgets, max queries per track, and “exhaustive” mode (more variants, higher caps) are all driven by config/presets.

## How it is implemented (code)

- **Main API**  
  - **File:** `src/cuepoint/core/query_generator.py`  
  - **Function:** `make_search_queries(track, settings, ...) -> List[Tuple[str, int]]` (or similar; returns ordered list of (query_string, priority_index)).  
  - Uses:
    - **Mix/remix parsing** (`cuepoint.core.mix_parser`): extract remix phrases, extended/original mix phrases, remixer names, generic parenthetical phrases, bracket-artist hints.
    - **Text processing:** `sanitize_title_for_search()`, `normalize_text()`.
    - **Artist handling:** `extract_artists_from_title()` when artists are empty; `_artist_tokens()` for tokenizing artists.
  - Builds:
    - Priority queries: e.g. full title + artist, “artist – title”, remix-specific strings.
    - N-gram queries: 1–3 word (or configurable) subsequences from the title.
    - Special-phrase queries: e.g. custom parenthetical phrases from the title.
    - Reverse or alternate orderings where useful.
  - Order and count of queries can be limited by `max_queries_per_track`, time budget, and “all-queries” / “exhaustive” flags (from config/CLI).

- **Config**  
  - **File:** `src/cuepoint/models/config.py` (or wherever `SETTINGS` / performance config lives)  
  - Exposes options such as max queries per track, time budget per track, and whether to allow “tri-gram crosses” or exhaustive variant explosion. Presets like `--fast`, `--turbo`, `--myargs`, `--exhaustive` in `main.py` map onto these.

- **Usage**  
  - **File:** `src/cuepoint/services/processor_service.py` (or matcher service)  
  - The processor/matcher calls `make_search_queries()` for each track and then runs Beatport search for each query until a match is found or budget is exhausted.

So: **what the feature is** = “generate many smart search query variants from a track”; **how it’s implemented** = `query_generator.py` + mix_parser + text_processing + config, used by the processing pipeline before each Beatport search.
