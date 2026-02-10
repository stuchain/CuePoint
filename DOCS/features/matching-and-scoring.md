# Matching and Scoring

## What it is (high-level)

For each Rekordbox track, CuePoint gets a set of **Beatport candidates** (from search + fetch). The **matcher**:

1. **Scores** each candidate using fuzzy string matching (title similarity, artist similarity, key, year, mix type).
2. **Applies guards** to reject false positives: e.g. subset matches (candidate title is only part of the original), weak overall score, or wrong mix type.
3. **Applies bonuses**: key match, year match, mix-type match, special phrases.
4. **Early exit**: when a candidate scores above a “good enough” threshold (and passes guards), the matcher can stop evaluating more candidates and return that best match.

The result is a **TrackResult** per track: best match (or none), score, confidence, and metadata (Beatport title, artists, key, BPM, URL, etc.). Confidence is used for UI (e.g. “review only” export) and reporting.

## How it is implemented (code)

- **Main entry**  
  - **File:** `src/cuepoint/core/matcher.py`  
  - **Function:** `best_beatport_match(track, queries, settings, ...)` (or similar) — orchestrates: run queries to get candidates, fetch/parse candidate pages, score each candidate with `consider()`, apply guards and early exit, return the best `TrackResult` or None.

- **Scoring**  
  - **File:** `src/cuepoint/core/matcher.py`  
  - **Function:** `consider(candidate, track, ...)` — computes:  
    - Title similarity (using `score_components`, `normalize_text`, `sanitize_title_for_search` from `text_processing`).  
    - Artist similarity (e.g. `_artist_token_overlap`).  
    - Key match (e.g. `_norm_key()` for normalization, then compare).  
    - Year and mix-type bonuses (using `_mix_bonus` from mix_parser).  
  - Combines these into a single score and a confidence level.

- **Guards**  
  - **File:** `src/cuepoint/core/matcher.py`  
  - **Helpers:** e.g. `_significant_tokens()` to detect subset matches; checks that the candidate is not a “subset” of the original (e.g. one word) and that the score is above minimum thresholds. Guards return “reject” so that candidate is not chosen.

- **Early exit**  
  - **File:** `src/cuepoint/core/matcher.py`  
  - Uses `_mix_ok_for_early_exit()` and a score threshold; when the best-so-far candidate is strong enough, the loop stops and returns it.

- **Models**  
  - **File:** `src/cuepoint/models/beatport_candidate.py` — structure for a candidate (title, artists, key, URL, etc.).  
  - **File:** `src/cuepoint/models/result.py` — `TrackResult` (original track, beatport_title, beatport_artists, match_score, confidence, beatport_url, etc.).

- **Text and key helpers**  
  - **File:** `src/cuepoint/core/text_processing.py` — `score_components`, `normalize_text`, `_artist_token_overlap`.  
  - **File:** `src/cuepoint/core/matcher.py` — `_norm_key()` for key normalization.

So: **what the feature is** = “score Beatport candidates, apply guards and bonuses, and pick the best match with early exit”; **how it’s implemented** = `matcher.py` (best_beatport_match, consider, guards, early exit) + text_processing + mix_parser + result/candidate models.
