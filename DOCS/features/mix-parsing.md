# Mix and Remix Parsing

## What it is (high-level)

Track titles often contain mix/remix information (“Original Mix”, “Extended Mix”, “CamelPhat Remix”, “Re-fire”, “VIP”, etc.). CuePoint **parses** these so that: (1) query generation can build remix-specific search queries, and (2) the **matcher** can give **bonuses or penalties** when the Beatport candidate’s mix type matches (or doesn’t match) the original title. This improves accuracy and reduces false positives (e.g. matching an “Extended Mix” when the user has “Original Mix”).

## How it is implemented (code)

- **Mix type detection**  
  - **File:** `src/cuepoint/core/mix_parser.py`  
  - **Patterns:** `MIX_PATTERNS` dict of compiled regexes for: original, extended, club, radio edit/mix, edit, remix, dub, guitar, vip, rework, refire, acapella, instrumental.  
  - **Function:** `_parse_mix_flags(original_title: str)` returns a structure (e.g. dict or set) indicating which mix types were found in the title.

- **Phrase extraction**  
  - **File:** `src/cuepoint/core/mix_parser.py`  
  - **Functions:**  
    - `_extract_remix_phrases(original_title)` — parenthesized/bracketed phrases containing “remix”.  
    - `_extract_original_mix_phrases(original_title)`, `_extract_extended_mix_phrases(original_title)` — for “Original Mix” / “Extended Mix” style phrases.  
    - `_extract_generic_parenthetical_phrases(original_title)` — custom phrases in parentheses (e.g. “Ivory Re-fire”).  
    - `_extract_remixer_names_from_title(original_title)` — remixer names.  
    - `_extract_bracket_artist_hints(title)` — artist hints in brackets.  
  - These are used by **query_generator** to build remix-specific queries and by the **matcher** for scoring.

- **Scoring helpers**  
  - **File:** `src/cuepoint/core/mix_parser.py`  
  - **Functions:**  
    - `_mix_bonus(...)` — returns a bonus/penalty value when comparing original title mix type to candidate’s mix type.  
    - `_mix_ok_for_early_exit(...)` — decides if the match is strong enough to stop searching (early exit).  
    - `_any_phrase_token_set_in_title(...)`, `_infer_special_mix_intent(...)` — used during matching to compare phrase tokens and intent.

- **Usage**  
  - **Query generation:** `src/cuepoint/core/query_generator.py` imports and uses the extractors to build remix/original/extended/generic phrase queries.  
  - **Matching:** `src/cuepoint/core/matcher.py` imports `_parse_mix_flags`, `_mix_bonus`, `_mix_ok_for_early_exit`, and related helpers to score and filter candidates.

So: **what the feature is** = “understand mix/remix in titles and use it for search + scoring”; **how it’s implemented** = `mix_parser.py` (patterns + extractors + bonus/early-exit helpers), used by query_generator and matcher.
