# How to Debug a Mismatch

Design 10.10. Step-by-step guide when a track gets the wrong match or no match.

## Step 1: Enable Debug Logging

```bash
# Windows
set CUEPOINT_DEBUG=1

# macOS/Linux
export CUEPOINT_DEBUG=1

# Run CLI
python src/main.py --xml your.xml --playlist "Playlist" --out debug_out
```

Or in GUI: Settings > Advanced > enable debug logging (if available).

## Step 2: Capture the Input Track

Note:

- **Title** (as in XML)
- **Artist** (as in XML)
- **Playlist position** (track index)

## Step 3: Check Query Generation

Queries are built in `core/query_generator.py`. For your track, check:

- What queries were generated?
- Look for log lines like `[N] Query: "..."` in debug output

## Step 4: Check Search Results

- Did `track_urls()` return any URLs?
- Look for `[N] track_urls -> X results` in logs
- If 0 results: search strategy (DuckDuckGo, direct, browser) may be failing

## Step 5: Check Candidate Scoring

For each candidate, the matcher logs:

- Title/artist similarity scores
- Bonuses (key, year, mix)
- Guard rejections (subset match, wrong mix, etc.)

Search logs for your track index `[N]` and the candidate URLs.

## Step 6: Reproduce in Unit Test

1. Create a minimal XML with the problematic track
2. Add a test in `src/tests/unit/core/test_matcher.py` or `test_processor_service.py`
3. Mock `track_urls` and `parse_track_page` to return known candidates
4. Assert expected best match or rejection

## Step 7: Common Causes

| Symptom | Possible Cause |
| --- | --- |
| No match | No search results, or all candidates below `MIN_ACCEPT_SCORE` |
| Wrong match | Guard too lenient, or scoring favors wrong candidate |
| Subset match | Guard should reject but doesn’t; check `_significant_tokens` logic |
| Remix/original mix mix-up | Mix-type bonus or guard; check `mix_parser` and matcher |

## Step 8: Inspect Matcher Logic

Key functions in `src/cuepoint/core/matcher.py`:

- `best_beatport_match()`: Main entry
- `consider()`: Scores a single candidate
- Guards: Subset check, mix-type check, early-exit rules

Add temporary `print()` or use a debugger to trace scoring for your case.

## Related

- [Match Rules & Scoring](match-rules-and-scoring.md)
- [Testing Strategy](testing-strategy.md)
