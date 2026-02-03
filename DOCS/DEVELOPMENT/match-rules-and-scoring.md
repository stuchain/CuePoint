# Match Rules and Scoring Heuristics

Design 10.3. How to add or modify match rules and scoring behavior.

## Overview

Matching happens in `SRC/cuepoint/core/matcher.py`. The flow:

1. **Query execution**: Run search queries to find Beatport track URLs
2. **Candidate fetching**: Parse each candidate page via `parse_track_page()`
3. **Scoring**: Score each candidate with `consider()` (title + artist similarity + bonuses)
4. **Guards**: Reject false positives (subset matches, weak matches, wrong mix types)
5. **Early exit**: Stop when an excellent match is found

## Key Files

| File | Purpose |
| --- | --- |
| `SRC/cuepoint/core/matcher.py` | Main matching logic, `best_beatport_match()`, `consider()` |
| `SRC/cuepoint/core/text_processing.py` | `score_components()`, `normalize_text()`, similarity |
| `SRC/cuepoint/core/mix_parser.py` | Mix type parsing (remix, extended, original) |
| `SRC/cuepoint/models/config.py` | `SETTINGS` (weights, thresholds, early exit) |

## Scoring Components

Scores are combined from:

- **Title similarity** (weight 0.55): Fuzzy match of track title
- **Artist similarity** (weight 0.45): Token overlap of artists
- **Bonuses**: Key match (+2), year match (+2), mix type match (+3), special phrases

Thresholds in `config.py`:

- `MIN_ACCEPT_SCORE`: 70 (minimum to accept)
- `EARLY_EXIT_SCORE`: 90 (stop searching)
- `TITLE_WEIGHT` / `ARTIST_WEIGHT`: 0.55 / 0.45

## Adding a New Bonus

1. Open `matcher.py`, find the `consider()` function (or equivalent scoring block)
2. Add your bonus logic (e.g., genre match, label match)
3. Add the bonus to the final score
4. Add a unit test in `SRC/tests/unit/core/test_matcher.py`

## Adding a New Guard

Guards reject candidates that pass scoring but are likely wrong:

1. In `matcher.py`, find the guard section (e.g., subset match, mix-type checks)
2. Add your guard condition
3. Return `None` or mark as rejected when guard fires
4. Add a unit test that verifies the guard rejects the bad case

## Modifying Weights or Thresholds

Edit `SRC/cuepoint/models/config.py`:

```python
SETTINGS = {
    "TITLE_WEIGHT": 0.55,   # Increase for title-heavy matching
    "ARTIST_WEIGHT": 0.45,
    "MIN_ACCEPT_SCORE": 70, # Lower to accept more matches (more false positives)
    ...
}
```

Or override via YAML config (see `config.yaml.template`).

## Query Generation

Queries are built in `SRC/cuepoint/core/query_generator.py`. To add new query variants:

1. Edit `query_generator.py`
2. Add your query pattern to the generation logic
3. Ensure `max_queries_per_track` in config allows enough queries
4. Add tests in `SRC/tests/unit/core/test_query_generator.py`

## Testing Changes

```bash
# Run matcher unit tests
python scripts/run_tests.py --unit -k matcher

# Run integration test with real-ish flow (mocked network)
python scripts/run_tests.py --integration -k processor
```

## Related

- [Architecture](architecture.md)
- [Debug a Mismatch](debug-mismatch.md)
