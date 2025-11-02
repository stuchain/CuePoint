#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Configuration settings and constants for Rekordbox → Beatport metadata enricher
"""

import requests

# -----------------------------
# Config & defaults
# -----------------------------
SETTINGS = {
    "MAX_SEARCH_RESULTS": 50,    # per-query fetch from DDG (raised to improve recall on sparse queries)
    "CANDIDATE_WORKERS": 8,      # per-track candidate fetch concurrency
    "TRACK_WORKERS": 1,          # playlist-level concurrency
    "PER_TRACK_TIME_BUDGET_SEC": 25,

    # Similarity weights (per your request)
    "TITLE_WEIGHT": 0.55,
    "ARTIST_WEIGHT": 0.45,

    "MIN_ACCEPT_SCORE": 55,      # require minimum score for acceptance (lowered from 60)
    "VERBOSE": False,
    "TRACE": False,
    "CONNECT_TIMEOUT": 5,
    "READ_TIMEOUT": 10,
    "ENABLE_CACHE": False,       # auto-enabled in fast/turbo if requests-cache is present
    
    # Search strategy
    "USE_DIRECT_SEARCH_FOR_REMIXES": True,  # Use direct Beatport search for remix queries (more reliable)
    "PREFER_DIRECT_SEARCH": False,  # If True, prefer direct search over DuckDuckGo for all queries
    "USE_BROWSER_AUTOMATION": False,  # Use browser automation (Playwright/Selenium) as fallback - slower but most reliable
    "BROWSER_TIMEOUT_SEC": 30,  # Timeout for browser automation operations

    # Early exit
    "EARLY_EXIT_SCORE": 95,         # Stop early if a guard-passing candidate reaches ≥95
    "EARLY_EXIT_MIN_QUERIES": 12,   # don't early-stop before at least this many queries
    "EARLY_EXIT_REQUIRE_MIX_OK": True,

    # Early-exit (family consensus)
    "EARLY_EXIT_FAMILY_SCORE": 93,      # allow early exit on strong full-title+one-artist hit
    "EARLY_EXIT_FAMILY_AFTER": 8,       # but only after at least this many queries in the track
    "EARLY_EXIT_FAMILY_AFTER_ORIGINAL": 6,
    "EARLY_EXIT_MIN_QUERIES_ORIGINAL": 8,

    # Adaptive max_results per query type
    "ADAPTIVE_MAX_RESULTS": True,
    "MR_LOW": 15,
    "MR_MED": 40,
    "MR_HIGH": 100,

    # Hard cap on how many candidate URLs we consider per query (after dedup/fallback). None = no cap.
    "PER_QUERY_CANDIDATE_CAP": None,

    # When title explicitly implies remix/special variant
    "EARLY_EXIT_MIN_QUERIES_REMIX": 5,    # allow earlier exit when remix/special intent is explicit
    "EARLY_EXIT_SCORE_REMIX": 93,         # lower threshold for remix/special-intent early exit
    "REMIX_MAX_QUERIES": 24,              # hard cap when remix intent is explicit
    "ALLOW_GENERIC_ARTIST_REMIX_HINTS": False,  # don't add generic "<artist> remix" unless enabled

    "SEED": 0,                   # determinism (ordering/ties)

    # Query generation controls
    "TITLE_GRAM_MAX": 3,                 # up to trigrams from the title
    "CROSS_TITLE_GRAMS_WITH_ARTISTS": True,  # cross N-grams with artist variants
    "CROSS_SMALL_ONLY": True,            # only cross uni/bi-grams (control blow-up)
    "REVERSE_ORDER_QUERIES": False,      # don't reverse by default
    "PRIORITY_REVERSE_STAGE": True,      # allow reversed order only in priority stage
    "REVERSE_REMIX_HINTS": True,         # always allow reversed order for remixer-hint queries

    # Cross full title with artist *word* subsets (first/last names)
    "CROSS_TITLE_WITH_ARTIST_WORD_SUBSETS": False,
    "ARTIST_WORD_SUBSET_MAX": 3,         # cap subset size

    # Run ALL query variants (no early stop, no join timeout)
    "RUN_ALL_QUERIES": False,

    # Require full title + at least one artist in queries (when artists are provided)
    "FULL_TITLE_WITH_ARTIST_ONLY": True,
    "FULL_ARTIST_ENTITY_ONLY": True,
    # Do not generate short forced pairs like "never gorje"
    "ENABLE_FORCED_SHORT_PAIRS": False,

    # ===== Exhaustive title combos (optional) =====
    "RUN_EXHAUSTIVE_COMBOS": False,      # enable order-preserving title combinations 2..N
    "TITLE_COMBO_MIN_LEN": 2,            # start at 2-word combos
    "TITLE_COMBO_MAX_LEN": 6,            # cap combos to 6 words by default
    "INCLUDE_PERMUTATIONS": False,       # also permute token subsets for small k
    "PERMUTATION_K_CAP": 5,              # only permute when k <= this
    "MAX_COMBO_QUERIES": None,           # optional cap (int) to avoid accidental blowups
    "QUOTED_TITLE_VARIANT": False,       # disable quoted variants globally

    # Linear prefixes only for grams/combos
    "LINEAR_PREFIX_ONLY": True,          # use only left-anchored contiguous prefixes

    # Hard cap on total queries per track
    "MAX_QUERIES_PER_TRACK": 200,
    # Generic parenthetical weighting (e.g., "(Ivory Re‑fire)")
    "GENERIC_PHRASE_MATCH_BONUS": 24,
    "GENERIC_PHRASE_PLAIN_PENALTY": 14,   # mild penalty for plain/original when a special phrase is requested and not matched
    "GENERIC_PHRASE_ORIG_PENALTY": 18,    # extra penalty for Original Mix when special phrase exists and a phrase-matching candidate is seen
    "GENERIC_PHRASE_EXT_PENALTY": 8,      # extra penalty for Extended Mix under same condition
    "GENERIC_PHRASE_STRICT_REJECT_TSIM": 96,
}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

BASE_URL = "https://www.beatport.com"

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

try:
    import requests_cache  # type: ignore
    HAVE_CACHE = True
except Exception:
    HAVE_CACHE = False

# Key near-equivalents
NEAR_KEYS = {
    "c#": {"db"}, "db": {"c#"},
    "d#": {"eb"}, "eb": {"d#"},
    "f#": {"gb"}, "gb": {"f#"},
    "g#": {"ab"}, "ab": {"g#"},
    "a#": {"bb"}, "bb": {"a#"},
}

