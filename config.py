#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Configuration settings and constants for Rekordbox → Beatport metadata enricher

This module contains all configuration settings that control the behavior of the
metadata enrichment process. Settings can be overridden via command-line presets
(--fast, --turbo, --myargs) or modified programmatically.

Key configuration categories:
1. Search & Concurrency: How many results to fetch, how many parallel workers
2. Similarity & Scoring: Weighting factors for title vs artist matching
3. Early Exit: When to stop searching for a track (performance optimization)
4. Query Generation: Controls for generating search query variants
5. Search Strategy: Which search methods to use (DuckDuckGo, direct Beatport, browser)
6. Timeouts & Limits: Network timeouts and query/candidate limits
"""

import requests

# -----------------------------
# Main Configuration Dictionary
# -----------------------------
# All settings are stored in this dictionary and can be overridden by command-line
# presets or programmatic modifications. Default values are balanced for typical use.
SETTINGS = {
    # ========================================================================
    # SEARCH & CONCURRENCY SETTINGS
    # ========================================================================
    # Controls how many search results to fetch and how much parallel processing to use
    
    "MAX_SEARCH_RESULTS": 50,    # Maximum number of results to fetch per search query from DuckDuckGo
                                  # Higher = more candidates but slower. Raised from default to improve
                                  # recall on sparse queries (rare tracks, remixes)
    
    "CANDIDATE_WORKERS": 8,      # Number of parallel threads for fetching candidate track data from Beatport
                                  # Each thread processes one candidate URL at a time
                                  # Higher = faster but more load on Beatport servers
    
    "TRACK_WORKERS": 1,          # Number of parallel threads for processing tracks in the playlist
                                  # Each thread processes one track's queries and matching
                                  # Higher = faster overall but more memory usage
    
    "PER_TRACK_TIME_BUDGET_SEC": 25,  # Maximum time (in seconds) to spend searching for matches per track
                                        # After this time, the best match found so far is accepted
                                        # None = no time limit (run all queries)

    # ========================================================================
    # SIMILARITY & SCORING SETTINGS
    # ========================================================================
    # Controls how similarity scores are calculated and what minimum scores are accepted
    
    "TITLE_WEIGHT": 0.55,         # Weight for title similarity in final score (55% of total)
                                  # Higher = title matches are more important than artist matches
    
    "ARTIST_WEIGHT": 0.45,         # Weight for artist similarity in final score (45% of total)
                                    # Lower = artist mismatches are less penalized
    
    "MIN_ACCEPT_SCORE": 55,        # Minimum total score required to accept a match
                                   # Scores range from 0-200+ (title + artist + bonuses)
                                   # Lowered from 60 to catch more valid but imperfect matches
    
    # ========================================================================
    # LOGGING SETTINGS
    # ========================================================================
    
    "VERBOSE": False,              # Enable verbose logging (detailed progress information)
    "TRACE": False,                # Enable trace-level logging (shows every candidate evaluated)
    
    # ========================================================================
    # NETWORK & CACHING SETTINGS
    # ========================================================================
    
    "CONNECT_TIMEOUT": 5,          # HTTP connection timeout in seconds
                                   # How long to wait when establishing connection to Beatport
    
    "READ_TIMEOUT": 10,            # HTTP read timeout in seconds
                                   # How long to wait for response data after connection established
    
    "ENABLE_CACHE": False,         # Enable HTTP response caching (requires requests-cache package)
                                   # Automatically enabled in --fast/--turbo presets if available
                                   # Speeds up repeated runs by caching Beatport page responses
    
    # ========================================================================
    # SEARCH STRATEGY SETTINGS
    # ========================================================================
    # Controls which search methods are used and in what order
    
    "USE_DIRECT_SEARCH_FOR_REMIXES": True,  # Use direct Beatport website search for remix queries
                                             # More reliable than DuckDuckGo for finding remix variants
                                             # Direct search queries Beatport's own search API
    
    "PREFER_DIRECT_SEARCH": False,          # If True, prefer direct Beatport search over DuckDuckGo
                                            # for ALL queries (not just remixes)
                                            # Direct search is slower but more accurate
    
    "USE_BROWSER_AUTOMATION": False,        # Use browser automation (Playwright/Selenium) as fallback
                                            # Slower but most reliable - can find JavaScript-rendered content
                                            # Only used when other methods fail
    
    "BROWSER_TIMEOUT_SEC": 30,              # Timeout for browser automation operations in seconds
                                            # How long to wait for page to load in browser

    # ========================================================================
    # EARLY EXIT SETTINGS (Performance Optimization)
    # ========================================================================
    # Early exit stops searching once a very good match is found, saving time
    # These settings control when early exit is allowed
    
    "EARLY_EXIT_SCORE": 95,         # Stop searching if a candidate reaches this score or higher
                                    # Score must pass all guard checks (not rejected)
                                    # High threshold (95) ensures only excellent matches trigger early exit
    
    "EARLY_EXIT_MIN_QUERIES": 12,   # Minimum number of queries to run before allowing early exit
                                    # Prevents premature exit on lucky first-query matches
                                    # Ensures at least basic queries are tried
    
    "EARLY_EXIT_REQUIRE_MIX_OK": True,  # Require mix-type compatibility for early exit
                                         # e.g., don't exit early if searching for "remix" but found "original mix"
                                         # True = more conservative, False = faster exits

    # ========================================================================
    # EARLY EXIT (FAMILY CONSENSUS) SETTINGS
    # ========================================================================
    # Alternative early exit rules for "family" queries (full title + subset of artists)
    # These are more lenient than the main early exit to allow faster exits on strong partial matches
    
    "EARLY_EXIT_FAMILY_SCORE": 93,      # Allow early exit on strong full-title + one-artist match
                                        # Lower than main EARLY_EXIT_SCORE (93 vs 95) for faster exits
                                        # Useful when full artist list isn't available or partial match is very strong
    
    "EARLY_EXIT_FAMILY_AFTER": 8,       # Minimum queries before family consensus early exit is allowed
                                        # Ensures enough queries have been tried before accepting partial match
    
    "EARLY_EXIT_FAMILY_AFTER_ORIGINAL": 6,  # For original mix tracks, allow family exit after fewer queries
                                             # Original mixes are easier to match, so less validation needed
    
    "EARLY_EXIT_MIN_QUERIES_ORIGINAL": 8,   # Minimum queries for original mix tracks overall
                                            # Lower than standard because original mixes are more common

    # ========================================================================
    # ADAPTIVE MAX RESULTS SETTINGS
    # ========================================================================
    # Dynamically adjust how many search results to fetch based on query type
    # More specific queries (full title + artists) get more results, generic queries get fewer
    
    "ADAPTIVE_MAX_RESULTS": True,  # Enable adaptive max results per query type
                                   # True = use MR_LOW/MED/HIGH based on query specificity
                                   # False = always use MAX_SEARCH_RESULTS
    
    "MR_LOW": 15,                  # Max results for low-specificity queries (title-only, short queries)
                                   # Fewer results because generic queries return many irrelevant matches
    
    "MR_MED": 40,                  # Max results for medium-specificity queries (partial title + artist)
                                   # Moderate results for balanced precision/recall
    
    "MR_HIGH": 100,                # Max results for high-specificity queries (full title + full artists)
                                   # Many results because specific queries are more likely to be relevant

    # ========================================================================
    # CANDIDATE LIMITS
    # ========================================================================
    
    "PER_QUERY_CANDIDATE_CAP": None,  # Hard cap on candidate URLs to consider per query (after deduplication)
                                       # None = no cap, process all candidates found
                                       # Useful for limiting memory/processing when queries return many results

    # ========================================================================
    # REMIX/SPECIAL VARIANT SETTINGS
    # ========================================================================
    # Settings specific to tracks with explicit remix or special variant indicators in title
    
    "EARLY_EXIT_MIN_QUERIES_REMIX": 5,    # Allow earlier exit for remix tracks (fewer queries needed)
                                          # Remix queries are more specific, so faster validation is acceptable
    
    "EARLY_EXIT_SCORE_REMIX": 93,         # Lower threshold for remix early exit (93 vs 95)
                                          # Remix matches are often harder to find, so slightly lower bar
    
    "REMIX_MAX_QUERIES": 24,              # Hard cap on queries when remix intent is explicit in title
                                          # Prevents excessive queries for remix-specific searches
                                          # Remix queries tend to be more numerous (many remixer variants)
    
    "ALLOW_GENERIC_ARTIST_REMIX_HINTS": False,  # Don't add generic "<artist> remix" queries unless enabled
                                                 # Generic remix hints can generate too many queries
    
    # ========================================================================
    # DETERMINISM SETTINGS
    # ========================================================================
    
    "SEED": 0,                   # Random seed for deterministic behavior (ordering, tie-breaking)
                                  # Same seed + same input = same output (reproducible results)

    # ========================================================================
    # QUERY GENERATION CONTROLS
    # ========================================================================
    # Controls how search queries are generated from track title and artist information
    
    "TITLE_GRAM_MAX": 3,                 # Maximum N-gram size to extract from title (up to trigrams)
                                         # N-grams: 1-word, 2-word, 3-word sequences from title
                                         # Higher = more query variants but exponentially more queries
    
    "CROSS_TITLE_GRAMS_WITH_ARTISTS": True,  # Cross title N-grams with artist name variants
                                            # Creates queries like "title words" + "artist1", "title words" + "artist2"
                                            # False = only use full title, True = generates many more queries
    
    "CROSS_SMALL_ONLY": True,            # Only cross small N-grams (uni/bi-grams) with artists
                                        # Prevents explosion: "1 word" + artist, "2 words" + artist
                                        # But NOT "10 words" + artist (too many combinations)
    
    "REVERSE_ORDER_QUERIES": False,      # Generate queries with reversed order ("artist title" vs "title artist")
                                        # False = don't reverse by default (title first)
                                        # Reversed queries can find different results but add overhead
    
    "PRIORITY_REVERSE_STAGE": True,     # Allow reversed order queries only in priority query stage
                                        # Priority queries are the most important ones (full title + artist)
                                        # Limits reverse queries to most promising searches
    
    "REVERSE_REMIX_HINTS": True,        # Always allow reversed order for remixer-hint queries
                                        # Remix queries often work better reversed: "Artist Remix Title"

    # ========================================================================
    # ARTIST WORD SUBSET SETTINGS
    # ========================================================================
    # Generate queries using subsets of artist names (first name, last name, etc.)
    
    "CROSS_TITLE_WITH_ARTIST_WORD_SUBSETS": False,  # Cross title with individual words from artist names
                                                     # e.g., "John Smith" → "Title John", "Title Smith"
                                                     # Disabled by default (too many queries, rarely helpful)
    
    "ARTIST_WORD_SUBSET_MAX": 3,         # Maximum words to use from multi-word artist names
                                         # Prevents explosion with long artist names

    # ========================================================================
    # QUERY EXHAUSTIVENESS SETTINGS
    # ========================================================================
    
    "RUN_ALL_QUERIES": False,           # Run ALL query variants regardless of time budget or early exit
                                        # False = stop early when good match found, True = exhaustive search
                                        # Significantly slower but finds more matches
    
    # ========================================================================
    # QUERY QUALITY FILTERS
    # ========================================================================
    # Restrict query generation to only high-quality queries
    
    "FULL_TITLE_WITH_ARTIST_ONLY": True,  # When artists are provided, only generate queries with full title
                                          # + at least one artist (no title-only queries)
                                          # Ensures queries are specific enough to be useful
    
    "FULL_ARTIST_ENTITY_ONLY": True,     # Only use complete artist entities in queries (not word fragments)
                                         # "John Smith" not "John" or "Smith" individually
                                         # Ensures artist matching is accurate
    
    "ENABLE_FORCED_SHORT_PAIRS": False,  # Don't generate short forced word pairs like "never gorje"
                                         # These are usually low-quality queries that rarely match

    # ========================================================================
    # EXHAUSTIVE TITLE COMBINATION SETTINGS (Advanced)
    # ========================================================================
    # Generate queries from all possible word combinations in the title
    # WARNING: Can generate thousands of queries if enabled!
    
    "RUN_EXHAUSTIVE_COMBOS": False,      # Enable order-preserving title word combinations
                                         # "Never Sleep Again" → "Never Sleep", "Sleep Again", "Never Sleep Again", etc.
                                         # Disabled by default (exponentially many queries)
    
    "TITLE_COMBO_MIN_LEN": 2,            # Minimum word count for title combinations (start at 2-word combos)
                                         # Skip single words (too generic)
    
    "TITLE_COMBO_MAX_LEN": 6,            # Maximum word count for title combinations
                                         # Cap prevents explosion with long titles
                                         # "Never Sleep Again Tonight Forever" = 5 words max combo
    
    "INCLUDE_PERMUTATIONS": False,       # Also generate permuted word orders (not just order-preserving)
                                         # "Never Sleep" → also "Sleep Never"
                                         # Disabled by default (too many queries, rarely helpful)
    
    "PERMUTATION_K_CAP": 5,              # Only permute when word count <= this number
                                         # Permutations of 5+ words generate too many queries
    
    "MAX_COMBO_QUERIES": None,           # Optional hard cap on combination queries
                                         # None = no cap, int = maximum combo queries to generate
                                         # Safety valve to prevent accidental query explosion
    
    "QUOTED_TITLE_VARIANT": False,       # Generate quoted title variants ("Title" vs Title)
                                         # Disabled globally - quotes rarely affect Beatport search results

    # ========================================================================
    # PREFIX & ORDERING SETTINGS
    # ========================================================================
    
    "LINEAR_PREFIX_ONLY": True,          # Use only left-anchored contiguous prefixes for N-grams
                                        # "Never Sleep Again" → "Never", "Never Sleep", "Never Sleep Again"
                                        # NOT: "Sleep", "Sleep Again", "Again" (middle/end fragments)
                                        # True = fewer queries, faster, but may miss some matches
    
    # ========================================================================
    # QUERY LIMITS
    # ========================================================================
    
    "MAX_QUERIES_PER_TRACK": 200,        # Hard cap on total queries generated per track
                                         # Prevents runaway query generation
                                         # Once cap is reached, remaining queries are skipped
    # ========================================================================
    # GENERIC PARENTHETICAL PHRASE SCORING (e.g., "Ivory Re-fire", "Club Mix")
    # ========================================================================
    # Scoring adjustments for tracks with special parenthetical phrases in title
    # These phrases indicate specific remix/variant types beyond standard "Remix" or "Extended Mix"
    
    "GENERIC_PHRASE_MATCH_BONUS": 24,    # Bonus score when candidate matches a special parenthetical phrase
                                         # e.g., searching for "Burn For You (Ivory Re-fire)" finds "Ivory Re-fire" version
                                         # Higher bonus = more preference for phrase matches
    
    "GENERIC_PHRASE_PLAIN_PENALTY": 14,   # Penalty when searching for special phrase but only plain/original found
                                          # Mild penalty to slightly prefer phrase matches when available
                                          # "Burn For You (Ivory Re-fire)" should prefer "Ivory Re-fire" over plain version
    
    "GENERIC_PHRASE_ORIG_PENALTY": 18,    # Extra penalty for Original Mix when special phrase exists and phrase-match seen
                                          # If we find both "Ivory Re-fire" AND "Original Mix", strongly prefer "Ivory Re-fire"
                                          # Higher penalty than EXT_PENALTY because Original is more generic
    
    "GENERIC_PHRASE_EXT_PENALTY": 8,      # Extra penalty for Extended Mix when special phrase exists and phrase-match seen
                                          # Similar to ORIG_PENALTY but smaller (Extended is closer to special phrases)
    
    "GENERIC_PHRASE_STRICT_REJECT_TSIM": 96,  # Strict rejection threshold for title similarity when phrase mismatch
                                              # If title similarity >= 96 but phrase doesn't match, reject candidate
                                              # Prevents high-similarity false positives that lack the special phrase
}

# ========================================================================
# HTTP CONFIGURATION
# ========================================================================

# User-Agent string to identify our requests to Beatport
# Using Safari user-agent to appear as legitimate browser traffic
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"
)

# HTTP headers for all requests
HEADERS = {
    "User-Agent": USER_AGENT,                # Browser identification
    "Accept-Language": "en-US,en;q=0.9",     # Preferred languages
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",  # Content types
}

# Base URL for Beatport website
BASE_URL = "https://www.beatport.com"

# Persistent HTTP session (reuses connections for better performance)
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

# Check if requests-cache is available for HTTP response caching
# If available, responses are cached to speed up repeated runs
try:
    import requests_cache  # type: ignore
    HAVE_CACHE = True
except Exception:
    HAVE_CACHE = False

# ========================================================================
# MUSICAL KEY EQUIVALENTS
# ========================================================================
# These are equivalent key notations (e.g., C# = Db, D# = Eb)
# Used for key matching bonuses - candidates in equivalent keys get partial credit
NEAR_KEYS = {
    "c#": {"db"}, "db": {"c#"},  # C-sharp = D-flat
    "d#": {"eb"}, "eb": {"d#"},  # D-sharp = E-flat
    "f#": {"gb"}, "gb": {"f#"},  # F-sharp = G-flat
    "g#": {"ab"}, "ab": {"g#"},  # G-sharp = A-flat
    "a#": {"bb"}, "bb": {"a#"},  # A-sharp = B-flat
}

