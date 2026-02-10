# Text Processing

## What it is (high-level)

All user-facing and Beatport text (titles, artists) is **normalized and sanitized** before being used in search or scoring. This includes:

- **Sanitization for search**: strip prefixes like `[F]`, `[3]`, remove extra spaces, optionally strip accents, so that “Title (Remix)” and “Title  (Remix)” are treated consistently and safely in URLs/queries.
- **Normalization**: lowercasing, Unicode normalization, tokenization for similarity (word tokens, significant tokens).
- **Similarity components**: break down title/artist comparison into comparable parts (e.g. token overlap, n-gram overlap) for the matcher’s `score_components`.
- **CSV injection escaping**: when writing to CSV, values that start with `=`, `+`, `-`, `@` are escaped (e.g. with a leading `'`) to prevent formula injection .

## How it is implemented (code)

- **Search sanitization**  
  - **File:** `src/cuepoint/core/text_processing.py`  
  - **Function:** `sanitize_title_for_search(title: str) -> str` — strips Rekordbox-style prefixes, normalizes spaces, optionally strips accents; used by query_generator and matcher when building queries and comparing.

- **Normalization and tokens**  
  - **File:** `src/cuepoint/core/text_processing.py`  
  - **Function:** `normalize_text(s: str) -> str` — lowercasing, Unicode normalization (NFC or similar).  
  - **Functions:** `_word_tokens(s)`, `_strip_accents(s)` — used internally for tokenization and accent-insensitive comparison.  
  - **Function:** `_artist_token_overlap(artist_a, artist_b)` (or in matcher) — used by the matcher for artist similarity.

- **Scoring components**  
  - **File:** `src/cuepoint/core/text_processing.py`  
  - **Function:** `score_components(str_a, str_b, ...)` — returns a similarity score (and possibly components) between two strings; used by `matcher.consider()` for title/artist scoring.

- **CSV injection escaping**  
  - **File:** `src/cuepoint/services/integrity_service.py`  
  - **Function:** `_escape_csv_injection(value: str) -> str` — if value starts with `=`, `+`, `-`, `@`, prepends `'`; used when writing CSV cells (see `_escape_csv_injection`).

- **Usage**  
  - **Query generation:** `query_generator.py` uses `sanitize_title_for_search`, `normalize_text`.  
  - **Matcher:** `matcher.py` uses `normalize_text`, `score_components`, `_artist_token_overlap`, and token/word helpers.  
  - **Output writer / integrity:** CSV writers use `_escape_csv_injection` for any user-origin cell.

So: **what the feature is** = “normalize and sanitize text for search and scoring, and escape CSV”; **how it’s implemented** = `text_processing.py` (sanitize, normalize, tokens, score_components) + `integrity_service._escape_csv_injection` when writing CSV.
